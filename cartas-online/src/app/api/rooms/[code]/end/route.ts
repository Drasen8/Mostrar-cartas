import { NextResponse } from 'next/server';
import { roomStorage } from '../../storage';
import type { AnyPlayer } from '../../storage';

export async function POST(_request: Request, context: { params: { code: string } }) {
  try {
    const { code } = await Promise.resolve(context.params);
    const upper = code?.toUpperCase();
    if (!upper) return NextResponse.json({ error: 'Código vacío' }, { status: 400 });

    const room = roomStorage.getRoom(upper);
    if (!room) return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });

    // Reabrir: limpiar estado de partida y permitir nuevos jugadores
    const resetPlayers: AnyPlayer[] = (room.players || []).map((p) => {
      const { cards: _drop, ...rest } = p;
      return rest;
    });

    const updatedRoom = {
      ...room,
      status: 'waiting' as const,
      players: resetPlayers,
      currentDeck: undefined,
      discardPile: undefined,
    };

    roomStorage.setRoom(upper, updatedRoom);
    return NextResponse.json({ room: updatedRoom, message: 'Partida terminada. La sala vuelve a estar abierta.' });
  } catch (err) {
    console.error('[End POST] Error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}