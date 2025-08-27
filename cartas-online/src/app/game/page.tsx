"use client";
import { useEffect, useState } from "react";
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
  const [ranking, setRanking] = useState<any[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);

  // NUEVO estado de turnos/rondas
  const [turnsStarted, setTurnsStarted] = useState<boolean>(false);
  const [currentTurn, setCurrentTurn] = useState<string | null>(null);
  const [roundAwaitingLead, setRoundAwaitingLead] = useState<boolean>(false);
  const [gameType, setGameType] = useState<'juego1' | 'juego2'>('juego1');

  // Helper ranking cliente (debe coincidir con backend)
  const cardRank = (c: any): number => {
    const order = [3, 4, 5, 6, 7, 10, 11, 12, 1, 2];
    if (!c) return -1;
    if (c.value === 2 && c.suit === 'oros') return 100;
    if (c.value === 2) return 90;
    const i = order.indexOf(c.value);
    return i === -1 ? -1 : i;
  };

  // Carga inicial
  useEffect(() => {
    const code = searchParams.get("code");
    const host = searchParams.get("host") === "true";
    const playerId = searchParams.get("playerId") || undefined;
    if (!code || !playerId) return;

    setRoomInfo(prev => ({
      code: code.toUpperCase(),
      isHost: host,
      playerId,
      players: prev?.players ?? 0,
      status: prev?.status ?? "waiting",
    }));

    (async () => {
      try {
        const res = await fetch(`/api/rooms/${code}/state`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setTopCard(data.topCard || null);
        setTurnsStarted(!!data.room?.turnsStarted);
        setCurrentTurn(data.room?.currentTurnPlayerId || null);
        setRoundAwaitingLead(!!data.room?.roundAwaitingLead);
        setGameType(data.room?.gameType || 'juego1');
        setRanking(Array.isArray(data.ranking) ? data.ranking : []);
        if (data.roles && roomInfo?.playerId) setMyRole(data.roles[roomInfo.playerId] || null);

        // opcional: contar jugadores y mis cartas si ya está jugando
        const me = data.room?.players?.find((p: any) => p.id === playerId);
        if (me?.cards) setMyCards(me.cards);
        if (Array.isArray(data.room?.players)) {
          setRoomInfo(prev => prev ? { ...prev, players: data.room.players.length, status: data.room.status } : prev);
        }
      } catch {}
    })();
  }, [searchParams]);

  // Polling
  useEffect(() => {
    if (!roomInfo?.code || !roomInfo?.playerId) return;
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/rooms/${roomInfo.code}/state`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;

        setTopCard(data.topCard || null);
        setTurnsStarted(!!data.room?.turnsStarted);
        setCurrentTurn(data.room?.currentTurnPlayerId || null);
        setRoundAwaitingLead(!!data.room?.roundAwaitingLead);
        setGameType(data.room?.gameType || 'juego1');
        setRanking(Array.isArray(data.ranking) ? data.ranking : []);
        if (data.roles && roomInfo?.playerId) setMyRole(data.roles[roomInfo.playerId] || null);

        setRoomInfo(prev =>
          prev ? { ...prev, players: data.room.players?.length ?? prev.players, status: data.room.status } : prev
        );

        if (data.room?.status === 'playing') {
          const me = data.room.players?.find((p: any) => p.id === roomInfo.playerId);
          if (me?.cards) setMyCards(me.cards);
        }
      } catch {}
    }, 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [roomInfo?.code, roomInfo?.playerId]);

  // Drop en carta central
  const handleDropOnCenter = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!roomInfo?.code || !roomInfo?.playerId) return;

    let card: any;
    try {
      const txt = e.dataTransfer.getData("application/json");
      card = JSON.parse(txt);
    } catch { return; }

    // Antes de turnos (juego1): solo 3 de bastos
    if (!turnsStarted && gameType === 'juego1' && !(card?.suit === 'bastos' && card?.value === 3)) {
      setError('La primera carta debe ser el 3 de bastos');
      return;
    }

    // Con turnos activos
    if (turnsStarted) {
      // Si estamos esperando salida de ronda: solo el líder puede jugar, y puede jugar cualquier carta
      if (roundAwaitingLead) {
        if (currentTurn !== roomInfo.playerId) {
          setError('Es la salida de ronda y no es tu turno');
          return;
        }
      } else {
        // Ronda en curso: debe ser tu turno y cumplir igual o superior
        if (currentTurn !== roomInfo.playerId) {
          setError('No es tu turno');
          return;
        }
        if (topCard && cardRank(card) < cardRank(topCard)) {
          setError('Debes jugar una carta igual o superior');
          return;
        }
      }
    }

    try {
      const res = await fetch(`/api/rooms/${roomInfo.code}/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: roomInfo.playerId, card })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'No se pudo jugar la carta'); return; }

      setMyCards(data.myCards || []);
      setTopCard(data.topCard || null);
      setCurrentTurn(data.nextTurnPlayerId || null);
      setTurnsStarted(!!data.turnsStarted);
      setRoundAwaitingLead(!!data.roundAwaitingLead);
    } catch {
      setError('Error al jugar la carta');
    }
  };

  const allowDrop = (e: React.DragEvent) => e.preventDefault();

  // Iniciar partida
  const handleStartGame = async () => {
    if (!roomInfo?.code || !roomInfo?.playerId) return;
    setError("");
    try {
      const res = await fetch(`/api/rooms/${roomInfo.code}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardsPerPlayer: cardsCount, gameType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo iniciar la partida");
        return;
      }
      // Estado de sala/turnos
      setTurnsStarted(!!data.room?.turnsStarted);
      setCurrentTurn(data.room?.currentTurnPlayerId || null);
      setRoundAwaitingLead(!!data.room?.roundAwaitingLead);
      setTopCard(null); // al iniciar, no hay carta central aún

      setRoomInfo((prev) =>
        prev
          ? {
              ...prev,
              status: data.room?.status || "playing",
              players: Array.isArray(data.room?.players) ? data.room.players.length : prev.players,
            }
          : prev
      );

      const me = data.room?.players?.find((p: any) => p.id === roomInfo.playerId);
      setMyCards(me?.cards || []);
    } catch {
      setError("Error al iniciar la partida");
    }
  };

  // Pasar turno (abandona la ronda)
  const handlePassTurn = async () => {
    if (!roomInfo?.code || !roomInfo?.playerId) return;
    setError("");
    try {
      const res = await fetch(`/api/rooms/${roomInfo.code}/pass`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: roomInfo.playerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo pasar turno");
        return;
      }
      // Avanza turno y gestiona inicio de nueva ronda si aplica
      setCurrentTurn(data.nextTurnPlayerId || null);
      setRoundAwaitingLead(!!data.roundAwaitingLead);
      setTurnsStarted(true);
      // El polling refrescará el resto (mano, topCard, etc.)
    } catch {
      setError("Error al pasar turno");
    }
  };

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
                  {myRole ? ` · ${myRole.toUpperCase()}` : ''}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {roomInfo.isHost && (
                <button
                  onClick={handleStartGame}
                  className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg shadow-lg transition"
                >
                  Iniciar partida
                </button>
              )}
              <button
                onClick={handlePassTurn}
                disabled={!turnsStarted || currentTurn !== roomInfo.playerId || myCards.length === 0}
                className={`py-2 px-4 rounded-lg shadow-lg font-semibold transition ${
                  !turnsStarted || currentTurn !== roomInfo.playerId || myCards.length === 0
                    ? 'bg-gray-500 text-white cursor-not-allowed opacity-70'
                    : 'bg-orange-500 hover:bg-orange-600 text-white'
                }`}
                title={
                  !turnsStarted
                    ? 'Aún no hay turnos'
                    : currentTurn !== roomInfo.playerId
                      ? 'Espera tu turno'
                      : 'Pasar turno'
                }
              >
                Pasar turno
              </button>
            </div>
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
        {/* Centro: drop target */}
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

        {/* Mano: permitir liderar con cualquier carta cuando roundAwaitingLead es true */}
        <div className="absolute bottom-0 left-0 w-full px-4 pb-6 flex justify-center items-end pointer-events-none">
          <div className="flex space-x-4 overflow-x-auto pointer-events-auto">
            {myCards.length > 0 ? (
              myCards.map((c, i) => {
                // Reglas de arrastre
                let allowDrag = true;

                if (!turnsStarted && gameType === 'juego1') {
                  // Antes de turnos en juego1: solo 3 de bastos
                  allowDrag = c?.suit === 'bastos' && c?.value === 3;
                } else if (turnsStarted && roundAwaitingLead) {
                  // Nueva ronda: solo el líder puede arrastrar, y puede jugar cualquier carta
                  allowDrag = currentTurn === roomInfo?.playerId;
                } else if (turnsStarted) {
                  // Ronda en curso: tu turno y carta igual o superior
                  const isMyTurn = currentTurn === roomInfo?.playerId;
                  const meetsRank = !topCard ? true : cardRank(c) >= cardRank(topCard);
                  allowDrag = isMyTurn && meetsRank;
                }

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
                    title={
                      !turnsStarted && gameType === 'juego1'
                        ? (allowDrag ? "Empieza con 3 de bastos" : "Debes empezar con 3 de bastos")
                        : turnsStarted && roundAwaitingLead
                          ? (currentTurn === roomInfo?.playerId ? "Abre la ronda con cualquier carta" : "Es la salida de ronda (espera)")
                          : (currentTurn === roomInfo?.playerId
                              ? "Arrastra una carta válida"
                              : "Espera tu turno")
                    }
                  >
                    <span className="text-xl text-gray-800 font-bold">{c.value}</span>
                    <span className="text-sm text-gray-600 capitalize">{c.suit}</span>
                  </div>
                );
              })
            ) : (
              // Mostrar cartel "Sin cartas" en lugar de ejemplo
              <div className="bg-white rounded-xl shadow px-4 py-3 text-gray-800 font-semibold">
                Sin cartas
              </div>
            )}
          </div>
        </div>

        {/* Debajo del header, lista de posiciones (si hay al menos uno) */}
        {ranking.length > 0 && (
          <div className="bg-white/80 text-black px-4 py-2">
            <div className="container mx-auto">
              <span className="font-semibold mr-2">Clasificación:</span>
              <ul className="flex flex-wrap gap-4">
                {ranking.map(r => (
                  <li key={r.playerId} className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-gray-200 text-sm">#{r.place}</span>
                    <span className="font-medium">{r.name}</span>
                    {r.role && (
                      <span className="px-2 py-0.5 rounded bg-yellow-300 text-xs uppercase">
                        {r.role}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}