import { NextResponse } from 'next/server';
import { roomStorage } from '../../storage';
import type { Card } from '../../../../../../src/lib/game/cards';

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

    // Si ya comenzaron los turnos, valida turno
    if (room.turnsStarted) {
      if (room.currentTurnPlayerId && room.currentTurnPlayerId !== playerId) {
        return NextResponse.json({ error: 'No es tu turno' }, { status: 403 });
      }
    }
    // Si aún no han comenzado los turnos, cualquiera puede jugar

    // Jugar carta
    const [played] = hand.splice(idx, 1);
    room.players[playerIdx] = { ...player, cards: hand };
    room.discardPile = [...(room.discardPile || []), played];

    // Gestión de turnos:
    // - Si aún no han empezado y se ha jugado 3 de bastos, activamos turnos y empieza el siguiente jugador.
    // - Si ya habían empezado, rotamos al siguiente jugador.
    if (!room.turnsStarted && threeBastos(played)) {
      room.turnsStarted = true;
      const nextIdx = (playerIdx + 1) % room.players.length;
      room.currentTurnPlayerId = room.players[nextIdx].id;
    } else if (room.turnsStarted) {
      const nextIdx = (playerIdx + 1) % room.players.length;
      room.currentTurnPlayerId = room.players[nextIdx].id;
    }

    roomStorage.setRoom(code, room);

    const topCard = room.discardPile[room.discardPile.length - 1];
    return NextResponse.json({
      room,
      topCard,
      myCards: hand,
      turnsStarted: !!room.turnsStarted,
      nextTurnPlayerId: room.currentTurnPlayerId || null
    });
  } catch (err) {
    console.error('[Play] Error:', err);
    return NextResponse.json({ error: 'Error al jugar carta' }, { status: 500 });
  }
}