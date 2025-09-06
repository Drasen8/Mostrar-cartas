import { NextResponse } from 'next/server';
import { roomStorage } from '../storage';

// Helpers para nombres únicos
function escRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function resolveUniqueName(desired: string | undefined, existing: string[], fallback: string): string {
  const base = (desired || '').trim();
  if (!base) return fallback;
  let max = 0;
  let hasExact = false;
  const re = new RegExp(`^${escRe(base)}(\\d+)?$`);
  for (const n of existing) {
    const m = n.match(re);
    if (!m) continue;
    if (!m[1]) { hasExact = true; max = Math.max(max, 1); continue; }
    const num = parseInt(m[1], 10);
    if (!Number.isNaN(num)) max = Math.max(max, num);
  }
  if (!hasExact) return base;
  return `${base}${max + 1}`;
}

export async function GET(request: Request, context: { params: { code: string } }) {
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

    // Lee nombre opcional de query (?name=Carlos)
    const url = new URL(request.url);
    const desiredName = url.searchParams.get('name') || undefined;

    const playerId = crypto.randomUUID();
    const existingNames = (room.players || []).map((p: any) => p?.name || '').filter(Boolean);
    const defaultName = `Jugador ${room.players.length + 1}`;
    const uniqueName = resolveUniqueName(desiredName, existingNames, defaultName);

    const newPlayer = { id: playerId, name: uniqueName, joinedAt: new Date().toISOString(), cards: [] as any[] };
    room.players = [...(room.players || []), newPlayer];
    roomStorage.setRoom(upper, room);

    return NextResponse.json({ room, playerId, name: uniqueName, totalPlayers: room.players.length });
  } catch (err) {
    console.error('[Join GET] Error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}