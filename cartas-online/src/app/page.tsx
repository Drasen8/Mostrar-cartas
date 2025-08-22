"use client";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

interface RoomInfo {
  code: string;
  players: number;
  isHost: boolean;
  playerId?: string;
  status?: string;
}

export default function Page() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [error, setError] = useState("");
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [myCards, setMyCards] = useState<any[]>([]);
  const [cardsCount, setCardsCount] = useState<number>(7);
  const [codigo, setCodigo] = useState("");

  // Inicializa desde la URL (?code=...&host=...&playerId=...)
  useEffect(() => {
    const code = searchParams.get("code");
    const host = searchParams.get("host") === "true";
    const playerId = searchParams.get("playerId") || undefined;

    if (!code || !playerId) return;

    setRoomInfo((prev) => ({
      code: code.toUpperCase(),
      isHost: host,
      playerId,
      players: prev?.players ?? 0,
      status: prev?.status ?? "waiting",
    }));

    // Cargar estado inicial de la sala (contador y mis cartas si ya estuviera jugando)
    (async () => {
      try {
        const res = await fetch(`/api/rooms/${code}/state`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setRoomInfo((prev) =>
          prev
            ? { ...prev, players: data.room.players?.length ?? prev.players, status: data.room.status }
            : prev
        );
        if (data.room.status === "playing") {
          const me = data.room.players?.find((p: any) => p.id === playerId);
          if (me?.cards) setMyCards(me.cards);
        }
      } catch {
        /* noop */
      }
    })();
  }, [searchParams]);

  // Polling del estado de la sala
  useEffect(() => {
    if (!roomInfo?.code || !roomInfo?.playerId) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/rooms/${roomInfo.code}/state`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.room) return;

        setRoomInfo((prev) =>
          prev
            ? { ...prev, players: data.room.players?.length ?? prev.players, status: data.room.status }
            : prev
        );

        if (data.room.status === "playing") {
          const me = data.room.players?.find((p: any) => p.id === roomInfo.playerId);
          if (me?.cards) setMyCards(me.cards);
        }
      } catch {
        /* noop */
      }
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomInfo?.code, roomInfo?.playerId]);

  const handleStartGame = async () => {
    if (!roomInfo) return;
    setError("");
    try {
      const res = await fetch(`/api/rooms/${roomInfo.code}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardsPerPlayer: cardsCount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo iniciar la partida");
        return;
      }
      setRoomInfo((prev) =>
        prev ? { ...prev, players: data.room.players.length, status: data.room.status || "playing" } : prev
      );
      const me = data.room.players.find((p: any) => p.id === roomInfo.playerId);
      setMyCards(me?.cards || []);
    } catch (err) {
      setError("Error al iniciar la partida");
    }
  };

  const handleJoinRoom = async () => {
    setError('');
    const code = codigo.trim().toUpperCase();
    if (!code) { setError('Por favor, ingrese un código'); return; }
    try {
      const res = await fetch(`/api/rooms/${code}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo entrar en la sala');
        return;
      }
      router.push(`/game?code=${code}&host=false&playerId=${data.playerId}`);
    } catch {
      setError('Error al unirse a la sala');
    }
  };

  const handleCreateRoom = async () => {
    setError("");
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al crear la sala");
        return;
      }
      router.push(`/game?code=${data.code}&host=true&playerId=${data.room.hostId}`);
    } catch {
      setError("Error al crear la sala");
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Barra superior con info de la sala o CTA si no hay sala */}
      {roomInfo ? (
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
      ) : (
        <div className="bg-green-950/80 p-4 text-white">
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <span className="font-semibold">No estás en ninguna sala</span>
            </div>
            <a
              href="/access"
              className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-6 rounded-lg shadow-lg transition"
            >
              Crear o unirse
            </a>
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
        <div className="w-8"></div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center relative">
        <div className="flex flex-col items-center justify-center h-full w-full">
          <div className="bg-white/90 rounded-xl shadow-2xl flex items-center justify-center w-36 h-52 mb-10 border-4 border-yellow-500">
            <span className="text-3xl text-gray-800 font-bold">Carta tirada</span>
          </div>
        </div>

        {/* Cartas del usuario */}
        <div className="absolute bottom-0 left-0 w-full px-4 pb-6 flex justify-center items-end pointer-events-none">
          <div className="flex space-x-4 overflow-x-auto pointer-events-auto">
            {myCards.length > 0 ? (
              myCards.map((c, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl shadow-2xl w-28 h-40 flex flex-col items-center justify-center border-4 border-gray-400"
                >
                  <span className="text-xl text-gray-800 font-bold">{c.value}</span>
                  <span className="text-sm text-gray-600 capitalize">{c.suit}</span>
                </div>
              ))
            ) : (
              <>
                <div className="bg-white rounded-2xl shadow-2xl w-28 h-40 flex flex-col items-center justify-center border-4 border-gray-400">
                  <span className="text-xl text-gray-800 font-bold">7</span>
                  <span className="text-sm text-gray-600 capitalize">oros</span>
                </div>
                <div className="bg-white rounded-2xl shadow-2xl w-28 h-40 flex flex-col items-center justify-center border-4 border-gray-400">
                  <span className="text-xl text-gray-800 font-bold">5</span>
                  <span className="text-sm text-gray-600 capitalize">copas</span>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Formulario de acceso */}
      <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
        <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center w-96 max-w-[90vw]">
          <h1 className="text-2xl font-bold mb-6 text-gray-800 text-center">Entrar o crear sala</h1>

          <div className="w-full space-y-4">
            <input
              type="text"
              placeholder="Inserte código"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-green-600 transition"
            />
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

          {error && <p className="mt-4 text-red-500 text-sm">{error}</p>}
        </div>
      </div>
    </div>
  );
}