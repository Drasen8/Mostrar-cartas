import { NextResponse } from 'next/server';
import { roomStorage } from '../storage';

export async function GET(_request: Request, context: { params: { code: string } }) {
  try {
    // await params resolution to satisfy Next.js async-dynamic params rule
    const params = await Promise.resolve(context.params);
    const code = params.code?.toUpperCase();
    if (!code) return NextResponse.json({ error: 'Código vacío' }, { status: 400 });

    console.log('[Route] Searching for room:', code);
    console.log('[Route] Available:', roomStorage.getAllRooms().map(r => r.code));

    const room = roomStorage.getRoom(code);
    if (!room) {
      console.log('[Route] Room not found:', code);
      return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });
    }

    const playerId = crypto.randomUUID();
    const newPlayer = { id: playerId, joinedAt: new Date().toISOString() };
    room.players = [...(room.players || []), newPlayer];
    roomStorage.setRoom(code, room);

    console.log('[Route] Player added', playerId, 'to', code);
    return NextResponse.json({ room, playerId, totalPlayers: room.players.length });
  } catch (error) {
    console.error('[Route] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}