"use client";
import { useState } from "react";

interface RoomInfo {
  code: string;
  players: number;
  isHost: boolean;
  playerId?: string;
}

export default function Page() {
  const [showModal, setShowModal] = useState(true);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);

  // NUEVO: número de cartas por jugador y mis cartas
  const [cardsCount, setCardsCount] = useState<number>(7);
  const [myCards, setMyCards] = useState<any[]>([]);

  const handleCreateRoom = async () => {
    try {
      const response = await fetch('/api/rooms', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Error al crear la sala');
      }
      if (data.code) {
        setShowModal(false);
        setRoomInfo({
          code: data.code,
          players: (data.room.players?.length) || 1,
          isHost: true,
          playerId: data.room.hostId // guarda el host id
        });
      }
    } catch (err) {
      setError('Error al crear la sala');
    }
  };

  const handleJoinRoom = async () => {
    if (!codigo.trim()) {
      setError('Por favor, ingrese un código');
      return;
    }

    try {
      const response = await fetch(`/api/rooms/${codigo.toUpperCase()}`);
      const data = await response.json();
      
      if (!response.ok) {
        setError(data.error || 'Código de sala inválido');
        return;
      }
      
      setShowModal(false);
      setRoomInfo({
        code: codigo.toUpperCase(),
        players: data.totalPlayers,
        isHost: false,
        playerId: data.playerId
      });
    } catch (err) {
      setError('Error al unirse a la sala');
    }
  };

  const handleStartGame = async () => {
    if (!roomInfo) return;
    setError('');
    try {
      const res = await fetch(`/api/rooms/${roomInfo.code}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardsPerPlayer: cardsCount })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo iniciar la partida');
        return;
      }

      // Actualiza info de sala
      setRoomInfo(prev => prev ? ({
        ...prev,
        players: data.room.players.length,
        // @ts-ignore
        status: data.room.status || 'playing'
      }) : prev);

      // Buscar mis cartas por playerId guardado (host o jugador)
      const myId = roomInfo.playerId;
      const me = data.room.players.find((p: any) => p.id === myId);
      setMyCards(me?.cards || []);

      // Ocultar modal si aún está visible
      setShowModal(false);

    } catch (err) {
      console.error('Start game error', err);
      setError('Error al iniciar la partida');
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Info de la sala */}
      {roomInfo && (
        <div className="bg-green-950/80 p-4 text-white">
          <div className="container mx-auto flex items-center jutify-between">
            <div className="flex items-center space-x-6">
              <div className="bg-yellow-500 px-4 py-2 rounded-lg">
                <span className="font-bold">Código: {roomInfo.code}</span>
              </div>
              <div>
                <span>Jugadores: {roomInfo.players}</span>
              </div>
            </div>
            {roomInfo.isHost && (
              <button 
                onClick={handleStartGame}
                className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg shadow-lg transition"
              >
                Iniciar partida
              </button>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-green-950/80 shadow-lg">
        <div>
          <select className="bg-white text-black rounded px-3 py-2 shadow focus:outline-none">
            <option value="juego1">Juego 1</option>
            <option value="juego2">Juego 2</option>
          </select>
        </div>
        <div className="flex-1 flex justify-center">
          <button className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-6 rounded-lg shadow-lg transition">
            Repartir cartas
          </button>
        </div>
        <div className="w-8"></div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center relative">
        <div className="flex flex-col items-center justify-center h-full w-full">
          <div className="bg-white/90 rounded-xl shadow-2xl flex items-center justify-center w-36 h-52 mb-10 border-4 border-yellow-500">
            <span className="text-3xl text-gray-800 font-bold">Carta tirada</span>
          </div>

          {/* MODAL BLOQUEANTE */}
          {showModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
              <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center w-80 max-w-[90vw]">
                <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">
                  Elige una opción
                </h2>
                <div className="w-full space-y-4">
                  <input
                    type="text"
                    placeholder="Inserte código"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-green-600 transition"
                  />

                  {/* NUEVO: selector número de cartas */}
                  <div className="flex items-center space-x-2">
                    <label className="text-sm text-gray-600">Cartas:</label>
                    <input
                      type="number"
                      min={1}
                      max={40}
                      value={cardsCount}
                      onChange={(e) => setCardsCount(Math.max(1, Math.min(40, Number(e.target.value || 1))))}
                      className="w-20 px-2 py-1 border-2 border-gray-300 rounded-lg"
                    />
                    <span className="text-sm text-gray-500">por jugador</span>
                  </div>

                  <button
                    onClick={handleJoinRoom}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition"
                  >
                    Unirse a sala
                  </button>

                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-300"></div>
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-white px-4 text-sm text-gray-500">O</span>
                    </div>
                  </div>

                  <button
                    onClick={handleCreateRoom}
                    className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-3 rounded-lg transition"
                  >
                    Crear sala
                  </button>
                </div>
                {error && (
                  <p className="mt-4 text-red-500 text-sm">{error}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Cartas del usuario - mostrar mis cartas reales si existen */}
        <div className="absolute bottom-0 left-0 w-full px-4 pb-6 flex justify-center items-end pointer-events-none">
          <div className="flex space-x-4 overflow-x-auto pointer-events-auto">
            {myCards.length > 0 ? myCards.map((c, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-2xl w-28 h-40 flex flex-col items-center justify-center border-4 border-gray-400">
                <span className="text-xl text-gray-800 font-bold">{c.value}</span>
                <span className="text-sm text-gray-600 capitalize">{c.suit}</span>
              </div>
            )) : (
              <>
                <div className="bg-white rounded-2xl shadow-2xl w-24 h-36 flex items-center justify-center border-4 border-gray-400">
                  <span className="text-3xl text-gray-800 font-bold">A♠</span>
                </div>
                <div className="bg-white rounded-2xl shadow-2xl w-24 h-36 flex items-center justify-center border-4 border-gray-400">
                  <span className="text-3xl text-gray-800 font-bold">K♥</span>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}