"use client";
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import type { Room } from '@/types/Room';

export default function RoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [room, setRoom] = useState<Room | null>(null);
  const isHost = searchParams.get('host') === 'true';
  const code = params.code as string;

  useEffect(() => {
    const fetchRoom = async () => {
      const response = await fetch(`/api/rooms/${code}`);
      const data = await response.json();
      setRoom(data.room);
    };

    fetchRoom();
    // Aquí podrías implementar WebSocket para actualizaciones en tiempo real
  }, [code]);

  return (
    <div className="min-h-screen p-4">
      <div className="bg-white rounded-lg p-4 shadow">
        <h1 className="text-2xl font-bold mb-4">Sala: {code}</h1>
        <p>Estado: {room?.status}</p>
        <p>Jugadores: {room?.players.length || 0}</p>
        {isHost && (
          <button className="mt-4 bg-green-500 text-white px-4 py-2 rounded">
            Iniciar juego
          </button>
        )}
      </div>
    </div>
  );
}