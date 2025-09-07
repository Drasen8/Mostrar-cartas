import { NextResponse, type NextRequest } from 'next/server';
import { roomStorage } from '../../storage';
import type { AnyRoom } from '../../storage';
import type { Card } from '@/types/Card';

type RoomRoundState = AnyRoom & {
  lastTopPlayedBy?: string;
  roundTopValue?: Card['value'] | null; // <--- Cambiado aquí
  roundComboSize?: number;
  discardPile?: Card[];
};

function rankCard(card: Pick<Card, 'value' | 'suit'> | null | undefined): number {
  const order: Card['value'][] = [3, 4, 5, 6, 7, 10, 11, 12, 1, 2];
  if (!card) return -1;
  if (card.value === 2 && card.suit === 'oros') return 100; // 2 de oros gana a todo
  if (card.value === 2) return 90;
  const i = order.indexOf(card.value);
  return i === -1 ? -1 : i;
}
const isTwoOros = (c: Pick<Card, 'value' | 'suit'> | undefined): boolean =>
  !!c && c.suit === 'oros' && c.value === 2;

type PlayBody = {
  playerId?: string;
  card?: Card;
  cards?: Card[];
  comboSize?: number;
};

export async function POST(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const { code: raw } = await context.params;
    const code = raw?.toUpperCase();
    if (!code) return NextResponse.json({ error: 'Código vacío' }, { status: 400 });

    const room = roomStorage.getRoom(code) as RoomRoundState | undefined;
    if (!room) return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });
    if (room.status !== 'playing') return NextResponse.json({ error: 'La partida no está en curso' }, { status: 400 });

    let bodyJson: unknown = {};
    try { bodyJson = await request.json(); } catch {}
    const body = (bodyJson || {}) as PlayBody;

    const playerId: string | undefined = body?.playerId;
    if (!playerId) return NextResponse.json({ error: 'Falta playerId' }, { status: 400 });

    // Normaliza cartas recibidas (soporta combos)
    const inputCards: Card[] = Array.isArray(body.cards)
      ? body.cards
      : body.card
        ? [body.card]
        : [];
    if (inputCards.length === 0) {
      return NextResponse.json({ error: 'Falta carta(s) a jugar' }, { status: 400 });
    }

    // Detecta si hay líder por roles (culo abre mano con lo que quiera)
    const isLeadingByRole =
      !!room.roundAwaitingLead &&
      !!room.currentTurnPlayerId &&
      playerId === room.currentTurnPlayerId;

    // booleano compatible con abrir con 1/2/3/4 treses siempre que incluya el 3 de bastos
    const isThreeB = inputCards.length > 0
      && inputCards.every(c => c?.value === 3)
      && inputCards.some(c => c?.value === 3 && c?.suit === 'bastos');

    // Validación de inicio de partida (juego1)
    if (!room.turnsStarted && room.gameType === 'juego1' && !isLeadingByRole && !isThreeB) {
      return NextResponse.json(
        { error: 'La primera jugada debe incluir el 3 de bastos y solo treses (puedes pareja/trío/cuatro).' },
        { status: 400 }
      );
    }

    // Estructuras de ronda
    room.roundComboSize = Number.isFinite(room.roundComboSize) ? room.roundComboSize : 1;
    room.roundTopValue = room.roundTopValue ?? null;

    const playerIdx = room.players.findIndex(p => p.id === playerId);
    if (playerIdx === -1) return NextResponse.json({ error: 'Jugador no está en la sala' }, { status: 404 });
    const player = room.players[playerIdx];
    const hand: Card[] = [...((player.cards as Card[] | undefined) || [])];

    // Verifica que todas las cartas estén en tu mano
    const containsCard = (h: Card[], c: Card) => h.some(x => x.suit === c.suit && x.value === c.value);
    for (const c of inputCards) {
      if (!containsCard(hand, c)) {
        return NextResponse.json({ error: 'Alguna carta no está en tu mano' }, { status: 400 });
      }
    }

    const top: Card | null = room.discardPile?.length ? room.discardPile[room.discardPile.length - 1] ?? null : null;
    const prevValue: Card['value'] | null = room.roundTopValue ?? (top ? top.value : null); // <--- Cambiado aquí

    // Validación turno
    if (room.turnsStarted) {
      if (room.currentTurnPlayerId && room.currentTurnPlayerId !== playerId) {
        return NextResponse.json({ error: 'No es tu turno' }, { status: 403 });
      }
    } else {
      // Primera mano (juego1) sin roles: permite 1-4 treses que incluyan el 3 de bastos
      const isFirstHandNoRoles = room.gameType === 'juego1' && !isLeadingByRole;
      if (isFirstHandNoRoles && !isThreeB) {
        return NextResponse.json(
          { error: 'La primera jugada debe incluir el 3 de bastos y solo treses (puedes pareja/trío/cuatro).' },
          { status: 400 }
        );
      }
    }

    // Detectar si es 2 de oros (jugada especial): solo permitido como carta única
    const singleTwoOros = inputCards.length === 1 && isTwoOros(inputCards[0]);

    // Validación de combos
    const allSameValue = inputCards.every(c => c.value === inputCards[0].value);
    if (!singleTwoOros && !allSameValue) {
      return NextResponse.json({ error: 'En pareja/trío/cuadro todas deben tener el mismo número' }, { status: 400 });
    }

    // Reglas según si se está abriendo ronda o no
    if (room.turnsStarted && !room.roundAwaitingLead) {
      // Ronda en curso
      const requiredSize = room.roundComboSize || 1;
      if (!singleTwoOros && inputCards.length !== requiredSize) {
        return NextResponse.json({ error: `Debes jugar ${requiredSize} carta(s)` }, { status: 400 });
      }
      if (!singleTwoOros && prevValue != null) {
        // Usa el palo de la carta jugada para evitar el error de tipo
        const topRank = rankCard({ value: prevValue, suit: inputCards[0].suit });
        const playRank = rankCard(inputCards[0]);
        if (playRank < topRank) {
          return NextResponse.json({ error: 'Debes jugar una jugada igual o superior' }, { status: 400 });
        }
      }
    } else {
      // Abriendo ronda
      const isFirstHandNoRoles = !room.turnsStarted && room.gameType === 'juego1' && !isLeadingByRole;
      if (!(isFirstHandNoRoles && isThreeB)) {
        const wantedSize = Math.max(1, Math.min(4, Number(body.comboSize) || inputCards.length));
        if (!singleTwoOros && inputCards.length !== wantedSize) {
          return NextResponse.json({ error: `Debes jugar exactamente ${wantedSize} carta(s)` }, { status: 400 });
        }
      }
    }

    // Quitar cartas de la mano
    const removeOne = (arr: Card[], c: Card) => {
      const idx = arr.findIndex(x => x.suit === c.suit && x.value === c.value);
      if (idx !== -1) arr.splice(idx, 1);
    };
    const newHand: Card[] = [...hand];
    for (const c of inputCards) removeOne(newHand, c);

    // Aplicar jugada al descarte
    room.players[playerIdx] = { ...player, cards: newHand };
    room.discardPile = [...(room.discardPile || []), ...inputCards];
    room.lastTopPlayedBy = playerId;

    // Si abre ronda, fija el tamaño del combo
    if (room.roundAwaitingLead) {
      room.roundComboSize = singleTwoOros ? 1 : inputCards.length;
      room.roundAwaitingLead = false;
      room.roundTopValue = inputCards[0].value;
    } else {
      room.roundTopValue = inputCards[0].value;
    }

    // 1) 2 de oros: cierra ronda y repite
    if (singleTwoOros) {
      if (newHand.length === 0) {
        // se quedó sin cartas; lógica continua abajo en bloque de finished
      } else {
        // Cerrar ronda: limpiar centro y que el mismo jugador lidere
        room.discardPile = [];
        room.lastTopPlayedBy = undefined;
        room.roundAwaitingLead = true;
        room.roundNumber = (room.roundNumber ?? 0) + 1;
        const remainingIds = room.players.filter(p => (p.cards?.length || 0) > 0).map(p => p.id);
        room.roundActivePlayerIds = remainingIds;
        room.currentTurnPlayerId = playerId;
        room.turnsStarted = true;
        roomStorage.setRoom(code, room);
        return NextResponse.json({
          room,
          topCard: null,
          myCards: newHand,
          turnsStarted: !!room.turnsStarted,
          nextTurnPlayerId: room.currentTurnPlayerId || null,
          roundAwaitingLead: !!room.roundAwaitingLead,
          roundComboSize: room.roundComboSize
        });
      }
    }

    // 2) Si el jugador acaba de quedarse sin cartas: cerrar ronda...
    room.finishedOrder ||= [];
    const justFinished = newHand.length === 0 && !room.finishedOrder.includes(playerId);
    if (justFinished) {
      room.finishedOrder.push(playerId);
      const remainingIds = room.players.filter(p => (p.cards?.length || 0) > 0).map(p => p.id);

      let nextLeader: string | undefined;
      if (remainingIds.length > 0) {
        const orderIds = room.players.map(p => p.id);
        const start = orderIds.indexOf(playerId);
        for (let step = 1; step <= orderIds.length; step++) {
          const candidate = orderIds[(start + step) % orderIds.length];
          if (remainingIds.includes(candidate)) { nextLeader = candidate; break; }
        }
      }

      room.discardPile = [];
      room.lastTopPlayedBy = undefined;
      room.roundAwaitingLead = true;
      room.roundNumber = (room.roundNumber ?? 0) + 1;
      room.roundTopValue = null;
      room.roundComboSize = 1;
      room.roundActivePlayerIds = remainingIds;
      room.currentTurnPlayerId = nextLeader;
      room.turnsStarted = true;

      // ¿mano terminada?
      if (remainingIds.length === 1) {
        const last = remainingIds[0];
        if (!room.finishedOrder.includes(last)) room.finishedOrder.push(last);
        room.status = 'finished';
        room.currentTurnPlayerId = undefined;
        room.roundAwaitingLead = true;
      }

      roomStorage.setRoom(code, room);
      return NextResponse.json({
        room,
        topCard: null,
        myCards: newHand,
        turnsStarted: !!room.turnsStarted,
        nextTurnPlayerId: room.currentTurnPlayerId || null,
        roundAwaitingLead: !!room.roundAwaitingLead,
        roundComboSize: room.roundComboSize
      });
    }

    // ¿Nadie puede superar? cerrar ronda ya
    if (!isTwoOros(inputCards[0]) && newHand.length > 0 && !room.roundAwaitingLead) {
      const requiredSize = room.roundComboSize || inputCards.length || 1;
      const topValue = room.roundTopValue ?? inputCards[0].value;
      const topRank = rankCard({ value: topValue, suit: inputCards[0].suit });

      const finishedSet = new Set(room.finishedOrder || []);
      const opponents = room.players
        .filter(p => p.id !== playerId && (p.cards?.length || 0) > 0 && !finishedSet.has(p.id))
        .map(p => ({ id: p.id, cards: (p.cards as Card[] | undefined) || [] }));

      const canOpponentBeat = opponents.some(p => {
        const hand = p.cards;
        const hasTwo = hand.some(c => isTwoOros(c));
        if (hasTwo) return true;
        const counts: Record<number, number> = {};
        for (const c of hand) counts[c.value] = (counts[c.value] || 0) + 1;
        return Object.entries(counts).some(([valStr, cnt]) => {
          const val = Number(valStr) as Card['value'];
          return cnt >= requiredSize && rankCard({ value: val, suit: inputCards[0].suit }) >= topRank;
        });
      });

      if (!canOpponentBeat) {
        room.discardPile = [];
        room.lastTopPlayedBy = undefined;
        room.roundAwaitingLead = true;
        room.roundTopValue = null;
        room.roundComboSize = 1;
        room.roundNumber = (room.roundNumber ?? 0) + 1;
        room.turnsStarted = true;

        const remainingIds = room.players.filter(p => (p.cards?.length || 0) > 0).map(p => p.id);
        room.roundActivePlayerIds = remainingIds;
        room.currentTurnPlayerId = playerId;

        roomStorage.setRoom(code, room);
        return NextResponse.json({
          room,
          topCard: null,
          myCards: newHand,
          turnsStarted: !!room.turnsStarted,
          nextTurnPlayerId: room.currentTurnPlayerId || null,
          roundAwaitingLead: !!room.roundAwaitingLead,
          roundComboSize: room.roundComboSize
        });
      }
    }

    // Pasos de turno + salto por mismo número
    let steps = 0;
    if (!room.turnsStarted) {
      room.turnsStarted = true;
      room.roundAwaitingLead = false;
      steps = 1;
    } else {
      steps = 1;
    }

    const prevTopValueForSkip = prevValue;
    if (prevTopValueForSkip != null && inputCards[0].value === prevTopValueForSkip) {
      steps += 1; // salto por mismo número
    }

    // Rotación entre activos
    room.finishedOrder ||= [];
    const finishedSet = new Set(room.finishedOrder);
    const allIds = room.players.map(p => p.id);
    const activeIds = (room.roundActivePlayerIds?.length ? [...room.roundActivePlayerIds] : allIds)
      .filter(id => !finishedSet.has(id));
    room.roundActivePlayerIds = activeIds;

    if (activeIds.length > 0) {
      const pos = activeIds.indexOf(playerId);
      if (pos !== -1) {
        const nextIdx = (pos + steps) % activeIds.length;
        room.currentTurnPlayerId = activeIds[nextIdx];
      } else {
        room.currentTurnPlayerId = activeIds[0];
      }
    }

    roomStorage.setRoom(code, room);
    const topCard = room.discardPile && room.discardPile.length > 0 ? room.discardPile[room.discardPile.length - 1] : null;
    return NextResponse.json({
      room,
      topCard,
      myCards: newHand,
      turnsStarted: !!room.turnsStarted,
      nextTurnPlayerId: room.currentTurnPlayerId || null,
      roundAwaitingLead: !!room.roundAwaitingLead,
      roundComboSize: room.roundComboSize
    });
  } catch (err) {
    console.error('[Play] Error:', err);
    return NextResponse.json({ error: 'Error al jugar carta' }, { status: 500 });
  }
}