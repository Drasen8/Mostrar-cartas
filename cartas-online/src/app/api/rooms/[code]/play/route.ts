import { NextResponse } from 'next/server';
import { roomStorage } from '../../storage';
import type { Card } from '../../../../../../src/lib/game/cards';

// Ranking: 3 (más floja) ... 2 (más fuerte) y 2 de oros por encima de todo
function rankCard(card: any): number {
  const order = [3, 4, 5, 6, 7, 10, 11, 12, 1, 2];
  if (!card) return -1;
  if (card.value === 2 && card.suit === 'oros') return 100; // 2 de oros gana a todo
  if (card.value === 2) return 90;
  const i = order.indexOf(card.value);
  return i === -1 ? -1 : i;
}
const isTwoOros = (c: any) => c?.suit === 'oros' && c?.value === 2;

export async function POST(request: Request, context: { params: { code: string } }) {
  try {
    const params = await Promise.resolve(context.params);
    const code = params.code?.toUpperCase();
    if (!code) return NextResponse.json({ error: 'Código vacío' }, { status: 400 });

    const room = roomStorage.getRoom(code);
    if (!room) return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });
    if (room.status !== 'playing') return NextResponse.json({ error: 'La partida no está en curso' }, { status: 400 });

    let body: { playerId?: string; card?: Card; cards?: Card[]; comboSize?: number } = {};
    try { body = await request.json(); } catch {}
    const { playerId } = body;
    if (!playerId) return NextResponse.json({ error: 'Falta playerId' }, { status: 400 });

    // Normaliza combo de entrada
    const inputCards: any[] = Array.isArray(body.cards)
      ? body.cards
      : body.card
        ? [body.card]
        : [];
    if (inputCards.length === 0) return NextResponse.json({ error: 'Falta carta(s) a jugar' }, { status: 400 });

    // Estructuras de ronda
    room.roundComboSize = Number.isFinite((room as any).roundComboSize) ? (room as any).roundComboSize : 1;
    room.roundTopValue = (room as any).roundTopValue ?? null;

    const playerIdx = room.players.findIndex(p => p.id === playerId);
    if (playerIdx === -1) return NextResponse.json({ error: 'Jugador no está en la sala' }, { status: 404 });
    const player = room.players[playerIdx];
    const hand = [...(player.cards || [])];

    // Verifica que todas las cartas estén en tu mano
    const containsCard = (h: any[], c: any) => h.some(x => x.suit === c.suit && x.value === c.value);
    for (const c of inputCards) {
      if (!containsCard(hand, c)) {
        return NextResponse.json({ error: 'Alguna carta no está en tu mano' }, { status: 400 });
      }
    }

    const top = room.discardPile?.length ? room.discardPile[room.discardPile.length - 1] : null;
    const prevValue = (room as any).roundTopValue ?? (top ? top.value : null);

    // Validación turno
    if (room.turnsStarted) {
      if (room.currentTurnPlayerId && room.currentTurnPlayerId !== playerId) {
        return NextResponse.json({ error: 'No es tu turno' }, { status: 403 });
      }
    } else {
      // Inicio partida juego1: si no hay roles liderando, solo 3 de bastos
      const isThreeB = inputCards.length === 1 && inputCards[0]?.suit === 'bastos' && inputCards[0]?.value === 3;
      const isLeadingByRole = !!room.roundAwaitingLead && !!room.currentTurnPlayerId && playerId === room.currentTurnPlayerId;
      if (room.gameType === 'juego1' && !isLeadingByRole && !isThreeB) {
        return NextResponse.json({ error: 'La primera carta debe ser el 3 de bastos' }, { status: 400 });
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
      // Ronda en curso: debe respetarse el tamaño del combo actual, salvo 2 de oros
      const requiredSize = (room as any).roundComboSize || 1;
      if (!singleTwoOros && inputCards.length !== requiredSize) {
        return NextResponse.json({ error: `Debes jugar ${requiredSize} carta(s)` }, { status: 400 });
      }
      // Igual o superior por valor
      if (!singleTwoOros && prevValue != null) {
        const topRank = rankCard({ value: prevValue, suit: 'x' });
        const playRank = rankCard(inputCards[0]);
        if (playRank < topRank) {
          return NextResponse.json({ error: 'Debes jugar una jugada igual o superior' }, { status: 400 });
        }
      }
    } else {
      // Abriendo ronda: acepta 1,2,3,4 (size proporcionado por el cliente o el array)
      const wantedSize = Math.max(1, Math.min(4, Number(body.comboSize) || inputCards.length));
      if (!singleTwoOros && inputCards.length !== wantedSize) {
        return NextResponse.json({ error: `Debes jugar exactamente ${wantedSize} carta(s)` }, { status: 400 });
      }
    }

    // Quitar cartas de la mano
    const removeOne = (arr: any[], c: any) => {
      const idx = arr.findIndex(x => x.suit === c.suit && x.value === c.value);
      if (idx !== -1) arr.splice(idx, 1);
    };
    const newHand = [...hand];
    for (const c of inputCards) removeOne(newHand, c);

    // Aplicar jugada al descarte
    room.players[playerIdx] = { ...player, cards: newHand };
    room.discardPile = [...(room.discardPile || []), ...inputCards];
    (room as any).lastTopPlayedBy = playerId;

    // Si abre ronda, fija el tamaño del combo
    if (room.roundAwaitingLead) {
      (room as any).roundComboSize = singleTwoOros ? 1 : inputCards.length;
      (room as any).roundAwaitingLead = false;
      (room as any).roundTopValue = singleTwoOros ? inputCards[0].value : inputCards[0].value;
    } else {
      (room as any).roundTopValue = singleTwoOros ? inputCards[0].value : inputCards[0].value;
    }

    // Reglas especiales:
    // 1) 2 de oros: cierra ronda y repite el mismo jugador (si le quedan cartas)
    if (singleTwoOros) {
      if (newHand.length === 0) {
        // se quedó sin cartas; lógica de fin del jugador
      } else {
        // Cerrar ronda: limpiar centro y que el mismo jugador lidere
        room.discardPile = [];
        (room as any).lastTopPlayedBy = undefined;
        (room as any).roundAwaitingLead = true;
        (room as any).roundNumber = (room.roundNumber ?? 0) + 1;
        // activos: quienes tengan cartas
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
          roundComboSize: (room as any).roundComboSize
        });
      }
    }

    // 2) Si el jugador acaba de quedarse sin cartas: cerrar ronda, limpiar centro y pasar liderazgo al siguiente con cartas
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
      (room as any).lastTopPlayedBy = undefined;
      (room as any).roundAwaitingLead = true;
      (room as any).roundNumber = (room.roundNumber ?? 0) + 1;
      (room as any).roundTopValue = null;
      (room as any).roundComboSize = 1;
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
        roundComboSize: (room as any).roundComboSize
      });
    }

    // Si no es 2 de oros (ya cierra ronda) y no ha quedado sin cartas,
    // verifica si NADIE puede superar la jugada actual. Si nadie puede, cierra la ronda ya.
    if (!isTwoOros(inputCards[0]) && newHand.length > 0 && !room.roundAwaitingLead) {
      const requiredSize = (room as any).roundComboSize || inputCards.length || 1;
      const topValue = (room as any).roundTopValue ?? inputCards[0].value;
      const topRank = rankCard({ value: topValue, suit: 'x' });

      const finishedSet = new Set(room.finishedOrder || []);
      const opponents = room.players.filter(p => p.id !== playerId && (p.cards?.length || 0) > 0 && !finishedSet.has(p.id));

      const canOpponentBeat = opponents.some(p => {
        const hand = p.cards || [];
        const hasTwoOros = hand.some((c: any) => c.value === 2 && c.suit === 'oros');
        if (hasTwoOros) return true; // siempre puede ganar
        // ¿puede formar N iguales y ser >= top?
        const counts: Record<number, number> = {};
        for (const c of hand) counts[c.value] = (counts[c.value] || 0) + 1;
        return Object.entries(counts).some(([valStr, cnt]) => {
          const val = Number(valStr);
          return cnt >= requiredSize && rankCard({ value: val, suit: 'x' }) >= topRank;
        });
      });

      if (!canOpponentBeat) {
        // Cerrar ronda inmediatamente: limpia centro y que el mismo jugador lidere la nueva.
        room.discardPile = [];
        (room as any).lastTopPlayedBy = undefined;
        (room as any).roundAwaitingLead = true;
        (room as any).roundTopValue = null;
        (room as any).roundComboSize = 1;
        room.roundNumber = (room.roundNumber ?? 0) + 1;
        room.turnsStarted = true;

        // Activos = jugadores con cartas
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
          roundAwaitingLead: !!(room as any).roundAwaitingLead,
          roundComboSize: (room as any).roundComboSize
        });
      }
    }

    // Pasos de turno + salto por mismo número
    let steps = 0;
    if (!room.turnsStarted) {
      room.turnsStarted = true;
      (room as any).roundAwaitingLead = false;
      steps = 1;
    } else {
      steps = 1;
    }

    const prevTopValueForSkip = prevValue;
    if (prevTopValueForSkip != null && inputCards[0].value === prevTopValueForSkip) {
      steps += 1; // salto por mismo número
    }

    // Rotación entre activos (excluye terminados)
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
    const topCard = room.discardPile[room.discardPile.length - 1] || null;
    return NextResponse.json({
      room,
      topCard,
      myCards: newHand,
      turnsStarted: !!room.turnsStarted,
      nextTurnPlayerId: room.currentTurnPlayerId || null,
      roundAwaitingLead: !!room.roundAwaitingLead,
      roundComboSize: (room as any).roundComboSize
    });
  } catch (err) {
    console.error('[Play] Error:', err);
    return NextResponse.json({ error: 'Error al jugar carta' }, { status: 500 });
  }
}