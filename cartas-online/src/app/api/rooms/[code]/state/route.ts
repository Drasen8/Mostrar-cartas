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

    // Construir ranking completo si es posible
    const finishedOrder = [...(room.finishedOrder || [])];
    const allIds = room.players.map(p => p.id);
    // Si falta el último, intenta inferirlo (único que no está en finishedOrder)
    if (finishedOrder.length === allIds.length - 1) {
      const remaining = allIds.find(id => !finishedOrder.includes(id));
      if (remaining) finishedOrder.push(remaining);
    }

    // Roles
    const roles: Record<string, 'presidente' | 'vicepresidente' | 'viceculo' | 'culo'> = {};
    if (finishedOrder.length === allIds.length) {
      const n = finishedOrder.length;
      if (n >= 1) roles[finishedOrder[0]] = 'presidente';
      if (n >= 2) roles[finishedOrder[1]] = 'vicepresidente';
      if (n >= 3) roles[finishedOrder[n - 2]] = 'viceculo';
      roles[finishedOrder[n - 1]] = 'culo';
    }

    // Ranking con nombres
    const ranking = finishedOrder.map((id, i) => {
      const p = room.players.find(pp => pp.id === id);
      return {
        playerId: id,
        name: p?.name || `Jugador ${allIds.indexOf(id) + 1}`,
        place: i + 1,
        role: roles[id] || null
      };
    });

    return NextResponse.json({
      room,
      topCard,
      joinable: room.status === 'waiting',
      ranking,
      roles,
    });
  } catch (err) {
    console.error('[State GET] Error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}