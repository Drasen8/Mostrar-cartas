import { NextResponse } from 'next/server';
import { roomStorage } from '../../storage';

export async function GET(_request: Request, context: { params: { code: string } }) {
  try {
    const params = await Promise.resolve(context.params);
    const code = params.code?.toUpperCase();
    if (!code) return NextResponse.json({ error: 'Código vacío' }, { status: 400 });

    const room = roomStorage.getRoom(code);
    if (!room) return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });

    const topCard = room.discardPile?.length ? room.discardPile[room.discardPile.length - 1] : null;
    return NextResponse.json({ room, topCard, joinable: room.status === 'waiting' });
  } catch (err) {
    console.error('[State GET] Error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}