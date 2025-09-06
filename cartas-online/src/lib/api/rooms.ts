// filepath: c:\Users\Marc\Desktop\Mostrar cartas\cartas-online\src\lib\api\rooms.ts
import type { Room } from '../../types/Room';

export async function createRoom(name?: string) {
  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name?.trim() || undefined })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al crear la sala');
  return data as { code: string; room: Room; playerId: string; name?: string };
}

export async function joinRoom(code: string, name?: string) {
  const url = new URL(`/api/rooms/${code}`, window.location.origin);
  if (name?.trim()) url.searchParams.set('name', name.trim());
  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Código de sala inválido');
  return data as { room: Room; playerId: string; totalPlayers: number; name?: string };
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