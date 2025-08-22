import { NextResponse } from 'next/server';
import { roomStorage } from '../storage';

export async function GET(_request: Request, context: { params: { code: string } }) {
  try {
    const { code } = await Promise.resolve(context.params);
    const upper = code?.toUpperCase();
    if (!upper) return NextResponse.json({ error: 'Código vacío' }, { status: 400 });

    const room = roomStorage.getRoom(upper);
    if (!room) return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });

    // Bloquear nuevas entradas si ya está jugando
    if (room.status !== 'waiting') {
      return NextResponse.json(
        { error: 'La partida ya está en curso. La sala no admite nuevos jugadores.' },
        { status: 403 }
      );
    }

    const playerId = crypto.randomUUID();
    const newPlayer = { id: playerId, joinedAt: new Date().toISOString() };
    room.players = [...(room.players || []), newPlayer];
    roomStorage.setRoom(upper, room);

    return NextResponse.json({ room, playerId, totalPlayers: room.players.length });
  } catch (err) {
    console.error('[Join GET] Error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}