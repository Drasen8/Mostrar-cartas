import { NextResponse, type NextRequest } from 'next/server';
import { roomStorage } from './storage';

function generateRoomCode(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const codeLength = 6;
  let code = '';
  for (let i = 0; i < codeLength; i++) {
    const randomIndex = Math.floor(Math.random() * (i + 1 === 0 ? 1 : characters.length));
    code += characters[randomIndex];
  }
  if (roomStorage.getRoom(code)) return generateRoomCode();
  return code;
}

// Helpers nombres únicos
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

// POST /api/rooms - Crear nueva sala (acepta { name })
export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try { body = await request.json(); } catch {}
    const desiredName: string | undefined = body?.name;

    const roomCode = generateRoomCode();
    const hostId = crypto.randomUUID();
    const newRoom = {
      code: roomCode,
      hostId,
      players: [{
        id: hostId,
        joinedAt: new Date().toISOString(),
        name: '' as string | undefined
      }],
      status: 'waiting' as const,
      createdAt: new Date().toISOString(),
    };

    const defaultName = `Jugador 1`;
    const uniqueName = resolveUniqueName(desiredName, [], defaultName);
    newRoom.players[0].name = uniqueName;

    roomStorage.setRoom(roomCode, newRoom);
    return NextResponse.json({ code: roomCode, room: newRoom, playerId: hostId, name: uniqueName });
  } catch (error) {
    console.error('[POST] Error:', error);
    return NextResponse.json({ error: 'Error al crear la sala' }, { status: 500 });
  }
}

// GET /api/rooms - No soportado (usar /api/rooms/{code})
export async function GET(_request: NextRequest) {
  return NextResponse.json({ error: 'Usa /api/rooms/{code} para unirte' }, { status: 405 });
}