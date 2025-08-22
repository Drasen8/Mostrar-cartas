"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

interface RoomInfo {
  code: string;
  players: number;
  isHost: boolean;
  playerId?: string;
  status?: string;
}

export default function GamePage() {
  const searchParams = useSearchParams();

  const [error, setError] = useState("");
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [myCards, setMyCards] = useState<any[]>([]);
  const [cardsCount, setCardsCount] = useState<number>(7);
  const [topCard, setTopCard] = useState<any | null>(null);
  const [gameType, setGameType] = useState<'juego1' | 'juego2'>('juego1');
  // NUEVO: turno actual
  const [currentTurn, setCurrentTurn] = useState<string | null>(null);
  const [turnsStarted, setTurnsStarted] = useState<boolean>(false);

  const isThreeBastos = (c: any) => c?.suit === 'bastos' && c?.value === 3;
  const isFirstPlay = !topCard; // si no hay carta central, es la primera jugada

  // Carga inicial del estado (guarda turno y carta central)
  useEffect(() => {
    const code = searchParams.get("code");
    const playerId = searchParams.get("playerId") || undefined;
    if (!code || !playerId) return;

    (async () => {
      try {
        const res = await fetch(`/api/rooms/${code}/state`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setTopCard(data.topCard || null);
        // NUEVO: turno actual desde el estado
        setCurrentTurn(data.room?.currentTurnPlayerId || null);
        setTurnsStarted(!!data.room?.turnsStarted);
        setRoomInfo((prev) => ({
          code: code.toUpperCase(),
          isHost: searchParams.get("host") === "true",
          playerId,
          players: prev?.players ?? 0,
          status: prev?.status ?? "waiting",
        }));

        if (data.room.status === "playing") {
          const me = data.room.players?.find((p: any) => p.id === playerId);
          if (me?.cards) setMyCards(me.cards);
        }
      } catch {}
    })();
  }, [searchParams]);

  // Polling (actualiza turno y carta central)
  useEffect(() => {
    if (!roomInfo?.code || !roomInfo?.playerId) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/rooms/${roomInfo.code}/state`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        setTopCard(data.topCard || null);
        // NUEVO: turno y estado
        setCurrentTurn(data.room?.currentTurnPlayerId || null);
        setTurnsStarted(!!data.room?.turnsStarted);
        setRoomInfo((prev) =>
          prev
            ? { ...prev, players: data.room.players?.length ?? prev.players, status: data.room.status }
            : prev
        );

        if (data.room.status === "playing") {
          const me = data.room.players?.find((p: any) => p.id === roomInfo.playerId);
          if (me?.cards) setMyCards(me.cards);
        }
      } catch {}
    }, 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [roomInfo?.code, roomInfo?.playerId]);

  // Al iniciar partida, guardar turno que devuelve el backend
  const handleStartGame = async () => {
    if (!roomInfo) return;
    setError("");
    try {
      const res = await fetch(`/api/rooms/${roomInfo.code}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardsPerPlayer: cardsCount, gameType }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "No se pudo iniciar la partida"); return; }

      setRoomInfo(prev => prev ? ({ ...prev, players: data.room.players.length, status: data.room.status || "playing" }) : prev);
      setTopCard(null); // primera jugada aún sin carta
      // NUEVO: turno devuelto por el backend
      setCurrentTurn(data.room?.currentTurnPlayerId || null);
      setTurnsStarted(!!data.room?.turnsStarted);

      // Mis cartas
      const me = data.room.players.find((p: any) => p.id === roomInfo.playerId);
      setMyCards(me?.cards || []);
    } catch {
      setError("Error al iniciar la partida");
    }
  };

  const handleDropOnCenter = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!roomInfo?.code || !roomInfo?.playerId) return;
    // Bloqueo simple en cliente si no es tu turno (el backend también valida)
    if (currentTurn && currentTurn !== roomInfo.playerId) {
      setError("No es tu turno");
      return;
    }
    let card: any;
    try {
      const txt = e.dataTransfer.getData("application/json");
      card = JSON.parse(txt);
    } catch {
      return;
    }
    try {
      const res = await fetch(`/api/rooms/${roomInfo.code}/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: roomInfo.playerId, card }),
      });
      const data = await res.json();
      if (!res.ok) {
        // opcional: setError(data.error || 'No se pudo jugar la carta');
        return;
      }
      setMyCards(data.myCards || []);
      setTopCard(data.topCard || null);
      setCurrentTurn(data.nextTurnPlayerId || null);
      setTurnsStarted(!!data.turnsStarted);
    } catch {}
  };

  const allowDrop = (e: React.DragEvent) => e.preventDefault();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header superior con info */}
      {roomInfo ? (
        <div className="bg-green-950/80 p-4 text-white">
          <div className="container mx-auto flex items-center jutify-between">
            <div className="flex items-center space-x-6">
              <div className="bg-yellow-500 px-4 py-2 rounded-lg">
                <span className="font-bold">Código: {roomInfo.code}</span>
              </div>
              <div><span>Jugadores: {roomInfo.players}</span></div>
              <div className="ml-4">
                <span className="font-semibold">
                  {currentTurn === roomInfo.playerId ? "Tu turno" : "Turno de otro jugador"}
                </span>
              </div>
            </div>
            {roomInfo.isHost && (
              <button onClick={handleStartGame} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg shadow-lg transition">
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
              href="/"
              className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-6 rounded-lg shadow-lg transition"
            >
              Crear o unirse
            </a>
          </div>
        </div>
      )}

      {/* Selector de juego en el header secundario */}
      <header className="flex items-center justify-between px-4 py-3 bg-green-950/80 shadow-lg">
        <div>
          <select
            className="bg-white text-black rounded px-3 py-2 shadow focus:outline-none"
            value={gameType}
            onChange={(e) => setGameType(e.target.value as 'juego1' | 'juego2')}
            disabled={roomInfo?.status === 'playing'}
            title="Selecciona el juego (el anfitrión decide antes de iniciar)"
          >
            <option value="juego1">Juego 1</option>
            <option value="juego2">Juego 2</option>
          </select>
        </div>
        <div className="w-8"></div>
      </header>

      {/* Mano del jugador: cartas arrastrables solo en tu turno */}
      <main className="flex-1 flex flex-col items-center justify-center relative">
        <div className="flex flex-col items-center justify-center h-full w-full">
          {/* Zona central: carta visible + drop target */}
          <div
            onDragOver={allowDrop}
            onDrop={handleDropOnCenter}
            className="bg-white/90 rounded-xl shadow-2xl flex items-center justify-center w-36 h-52 mb-10 border-4 border-yellow-500 pointer-events-auto"
            title="Arrastra una carta aquí para jugarla"
          >
            {topCard ? (
              <div className="flex flex-col items-center justify-center">
                <span className="text-3xl text-gray-800 font-bold">{topCard.value}</span>
                <span className="text-sm text-gray-600 capitalize">{topCard.suit}</span>
              </div>
            ) : (
              <span className="text-3xl text-gray-800 font-bold">Carta central</span>
            )}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 w-full px-4 pb-6 flex justify-center items-end pointer-events-none">
          <div className="flex space-x-4 overflow-x-auto pointer-events-auto">
            {myCards.length > 0 ? (
              myCards.map((c, i) => {
                const isMyTurn = currentTurn === roomInfo?.playerId;
                // Libre si aún no han empezado los turnos; si ya empezaron, solo en tu turno
                const allowDrag = !turnsStarted || isMyTurn;
                return (
                  <div
                    key={i}
                    draggable={allowDrag}
                    onDragStart={(e) => {
                      if (!allowDrag) { e.preventDefault(); return; }
                      e.dataTransfer.setData("application/json", JSON.stringify(c));
                    }}
                    className={`bg-white rounded-2xl shadow-2xl w-28 h-40 flex flex-col items-center justify-center border-4 ${
                      allowDrag ? "cursor-grab active:cursor-grabbing border-gray-400" : "cursor-not-allowed opacity-60 border-gray-300"
                    }`}
                    title={allowDrag ? "Arrastra esta carta a la carta central" : "Espera tu turno"}
                  >
                    <span className="text-xl text-gray-800 font-bold">{c.value}</span>
                    <span className="text-sm text-gray-600 capitalize">{c.suit}</span>
                  </div>
                );
              })
            ) : (
              // ...existing default cards...
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
    </div>
  );
}