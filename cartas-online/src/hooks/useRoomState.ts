"use client";
import { useEffect, useState } from 'react';
import type { Room } from '../types/Room';
import { getRoomState } from '../lib/api/rooms';

export function useRoomState(code?: string, playerId?: string) {
  const [room, setRoom] = useState<Room | null>(null);
  const [myCards, setMyCards] = useState<any[]>([]);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!code || !playerId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { room } = await getRoomState(code);
        if (cancelled) return;
        setRoom(room);
        if (room.status === 'playing') {
          const me = room.players.find(p => p.id === playerId);
          if (me?.cards) setMyCards(me.cards);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Error');
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [code, playerId]);

  return { room, myCards, error, setRoom, setMyCards };
}