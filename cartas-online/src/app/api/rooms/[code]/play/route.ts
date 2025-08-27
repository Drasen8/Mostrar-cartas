import { NextResponse } from 'next/server';
import { roomStorage } from '../../storage';
import type { Card } from '../../../../../../src/lib/game/cards';

// Ranking: 3 (más floja) ... 2 (más fuerte) y 2 de oros por encima de todo
function rankCard(card: any): number {
  const order = [3, 4, 5, 6, 7, 10, 11, 12, 1, 2]; // índice más alto => más fuerte
  if (!card) return -1;
  if (card.value === 2 && card.suit === 'oros') return 100; // 2 de oros gana a todo
  const base = order.indexOf(card.value);
  if (base === -1) return -1;
  // Para que 2 (no oros) quede por encima del 1 y debajo del 2 de oros
  if (card.value === 2) return 90;
  return base;
}

export async function POST(request: Request, context: { params: { code: string } }) {
  try {
    const params = await Promise.resolve(context.params);
    const code = params.code?.toUpperCase();
    if (!code) return NextResponse.json({ error: 'Código vacío' }, { status: 400 });

    const room = roomStorage.getRoom(code);
    if (!room) return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });
    if (room.status !== 'playing') return NextResponse.json({ error: 'La partida no está en curso' }, { status: 400 });

    let body: { playerId?: string; card?: Card } = {};
    try { body = await request.json(); } catch {}
    const { playerId, card } = body;
    if (!playerId || !card) return NextResponse.json({ error: 'Falta playerId o carta' }, { status: 400 });

    const playerIdx = room.players.findIndex(p => p.id === playerId);
    if (playerIdx === -1) return NextResponse.json({ error: 'Jugador no está en la sala' }, { status: 404 });

    const player = room.players[playerIdx];
    const hand = [...(player.cards || [])];
    const idx = hand.findIndex(c => c.suit === (card as any).suit && c.value === (card as any).value);
    if (idx === -1) return NextResponse.json({ error: 'La carta no está en tu mano' }, { status: 400 });

    const threeBastos = (c: any) => c?.suit === 'bastos' && c?.value === 3;
    const isThreeB = (card as any)?.suit === 'bastos' && (card as any)?.value === 3;

    // Asegurar estructuras de ronda y normalizar activos (excluye finishedOrder)
    room.finishedOrder ||= [];
    const allIds = room.players.map(p => p.id);
    const finishedSet = new Set(room.finishedOrder);
    const activeIds = (
      room.roundActivePlayerIds && room.roundActivePlayerIds.length
        ? [...room.roundActivePlayerIds]
        : allIds
    ).filter(id => !finishedSet.has(id));
    room.roundActivePlayerIds = activeIds;
    if (room.roundNumber == null) room.roundNumber = 1;
    if (room.roundAwaitingLead == null) room.roundAwaitingLead = !room.turnsStarted;

    const top = room.discardPile?.length ? room.discardPile[room.discardPile.length - 1] : null;
    const prevTop = top;

    // Inicio de partida en juego1:
    // - Si NO hay roles/líder asignado: solo se admite 3 de bastos.
    // - Si hay líder de ronda (ej. 'culo' tras intercambio): ese líder puede abrir con cualquier carta.
    const isLeadingByRole = !!room.roundAwaitingLead && !!room.currentTurnPlayerId && playerId === room.currentTurnPlayerId;

    if (!room.turnsStarted && room.gameType === 'juego1' && !isLeadingByRole) {
      if (!isThreeB) {
        return NextResponse.json({ error: 'La primera carta debe ser el 3 de bastos' }, { status: 400 });
      }
    }

    // Validación de turno
    if (room.turnsStarted) {
      if (room.roundAwaitingLead) {
        if (room.currentTurnPlayerId && room.currentTurnPlayerId !== playerId) {
          return NextResponse.json({ error: 'Es la salida de ronda y no es tu turno' }, { status: 403 });
        }
      } else {
        if (room.currentTurnPlayerId && room.currentTurnPlayerId !== playerId) {
          return NextResponse.json({ error: 'No es tu turno' }, { status: 403 });
        }
      }
    }

    // Validación de fuerza: solo si hay turnos y no es salida de ronda
    if (room.turnsStarted && !room.roundAwaitingLead && top) {
      const topRank = rankCard(top);
      const playRank = rankCard(card as any);
      if (playRank < 0) return NextResponse.json({ error: 'Carta inválida' }, { status: 400 });
      if (playRank < topRank) return NextResponse.json({ error: 'Debes jugar una carta igual o superior' }, { status: 400 });
    }

    // Jugar carta
    const [played] = hand.splice(idx, 1);
    room.players[playerIdx] = { ...player, cards: hand };
    room.discardPile = [...(room.discardPile || []), played];

    // NUEVO: si este jugador se queda sin cartas, se añade al finishedOrder y sale de la ronda
    room.finishedOrder ||= [];
    if (hand.length === 0 && !room.finishedOrder.includes(playerId)) {
      room.finishedOrder.push(playerId);
      // sácalo de la ronda actual si está
      if (Array.isArray(room.roundActivePlayerIds)) {
        room.roundActivePlayerIds = room.roundActivePlayerIds.filter(id => id !== playerId);
      }
    }

    // Pasos de turno (incluye salto por mismo número)
    let steps = 0;
    if (!room.turnsStarted && threeBastos(played)) {
      room.turnsStarted = true;
      room.roundAwaitingLead = false; // ya hay carta de salida en la ronda
      steps = 1;
    } else if (room.turnsStarted && room.roundAwaitingLead) {
      room.roundAwaitingLead = false; // salida de nueva ronda
      steps = 1;
    } else if (room.turnsStarted) {
      steps = 1;
    }

    if (room.turnsStarted && prevTop && prevTop.value === (played as any).value) {
      steps += 1; // salto por mismo número
    }

    // Rotación solo entre jugadores activos en la ronda (reutiliza activeIds)
    if (room.turnsStarted && activeIds.length > 0) {
      const pos = activeIds.indexOf(playerId);
      if (pos !== -1) {
        const nextIdx = (pos + steps) % activeIds.length;
        room.currentTurnPlayerId = activeIds[nextIdx];
      } else if (room.currentTurnPlayerId && !activeIds.includes(room.currentTurnPlayerId)) {
        room.currentTurnPlayerId = activeIds[0];
      }
    }

    // ¿Fin de ronda? si queda un único activo (los demás pasaron o acabaron)
    let roundEnded = false;
    if (room.turnsStarted && room.roundActivePlayerIds && room.roundActivePlayerIds.length === 1) {
      const leaderId = room.roundActivePlayerIds[0];
      room.roundNumber = (room.roundNumber ?? 0) + 1;
      // Siguiente ronda: todos los que aún no han acabado vuelven a estar activos
      const remainingIds = room.players
        .map(p => p.id)
        .filter(id => !(room.finishedOrder||[]).includes(id));
      room.roundActivePlayerIds = remainingIds;
      room.roundAwaitingLead = true;
      room.currentTurnPlayerId = leaderId;
      roundEnded = true;
    }

    // NUEVO: si solo queda un jugador con cartas, ciérralo como “culo”
    const total = room.players.length;
    const finished = room.finishedOrder.length;
    if (finished === total - 1) {
      const remaining = room.players
        .map(p => p.id)
        .find(id => !room.finishedOrder!.includes(id));
      if (remaining) {
        room.finishedOrder!.push(remaining); // último = culo
        // opcional: puedes marcar status 'finished' si quieres cerrar la mano
        // room.status = 'finished';
      }
    }

    roomStorage.setRoom(code, room);

    const topCard = room.discardPile[room.discardPile.length - 1];
    return NextResponse.json({
      room,
      topCard,
      myCards: hand,
      turnsStarted: !!room.turnsStarted,
      nextTurnPlayerId: room.currentTurnPlayerId || null,
      roundEnded,
      roundNumber: room.roundNumber,
      roundAwaitingLead: !!room.roundAwaitingLead,
      activeIds: room.roundActivePlayerIds
    });
  } catch (err) {
    console.error('[Play] Error:', err);
    return NextResponse.json({ error: 'Error al jugar carta' }, { status: 500 });
  }
}