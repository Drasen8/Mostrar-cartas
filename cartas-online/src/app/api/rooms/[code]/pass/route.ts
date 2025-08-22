import { NextResponse } from 'next/server';
import { roomStorage } from '../../storage';

export async function POST(request: Request, context: { params: { code: string } }) {
  try {
    const { code } = await Promise.resolve(context.params);
    const upper = code?.toUpperCase();
    if (!upper) return NextResponse.json({ error: 'Código vacío' }, { status: 400 });

    const room = roomStorage.getRoom(upper);
    if (!room) return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });
    if (room.status !== 'playing') return NextResponse.json({ error: 'La partida no está en curso' }, { status: 400 });

    let body: any = {};
    try { body = await request.json(); } catch {}
    const playerId: string | undefined = body?.playerId;
    if (!playerId) return NextResponse.json({ error: 'Falta playerId' }, { status: 400 });

    if (!room.turnsStarted) {
      return NextResponse.json({ error: 'Aún no han comenzado los turnos' }, { status: 400 });
    }
    if (room.currentTurnPlayerId !== playerId) {
      return NextResponse.json({ error: 'No es tu turno' }, { status: 403 });
    }

    const idx = room.players.findIndex(p => p.id === playerId);
    if (idx === -1) return NextResponse.json({ error: 'Jugador no está en la sala' }, { status: 404 });

    const nextIdx = (idx + 1) % room.players.length;
    room.currentTurnPlayerId = room.players[nextIdx].id;

    roomStorage.setRoom(upper, room);
    return NextResponse.json({ room, nextTurnPlayerId: room.currentTurnPlayerId });
  } catch (err) {
    console.error('[Pass] Error:', err);
    return NextResponse.json({ error: 'Error al pasar turno' }, { status: 500 });
  }
}