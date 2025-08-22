// filepath: c:\Users\Marc\Desktop\Mostrar cartas\cartas-online\src\lib\api\rooms.ts
import type { Room } from '../../types/Room';

export async function createRoom() {
  const res = await fetch('/api/rooms', { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al crear la sala');
  return data as { code: string; room: Room };
}

export async function joinRoom(code: string) {
  const res = await fetch(`/api/rooms/${code}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Código de sala inválido');
  return data as { room: Room; playerId: string; totalPlayers: number };
}

export async function startGame(code: string, cardsPerPlayer = 7) {
  const res = await fetch(`/api/rooms/${code}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardsPerPlayer }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo iniciar la partida');
  return data as { room: Room; message: string };
}

export async function getRoomState(code: string) {
  const res = await fetch(`/api/rooms/${code}/state`, { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Sala no encontrada');
  return data as { room: Room };
}