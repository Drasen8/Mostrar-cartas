"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface RoomInfo {
  code: string;
  players: number;
  isHost: boolean;
  playerId?: string;
  status?: string;
}

function GamePageInner() {
  const searchParams = useSearchParams();

  const [error, setError] = useState("");
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [myCards, setMyCards] = useState<any[]>([]);
  const [cardsCount, setCardsCount] = useState<number>(7);
  const [topCard, setTopCard] = useState<any | null>(null);
  const [ranking, setRanking] = useState<any[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [selectedComboSize, setSelectedComboSize] = useState<number>(1);
  const [roundComboSize, setRoundComboSize] = useState<number>(1);
  const [roundAwaitingLead, setRoundAwaitingLead] = useState<boolean>(false);
  const [turnsStarted, setTurnsStarted] = useState<boolean>(false);
  const [currentTurn, setCurrentTurn] = useState<string | null>(null);
  const [gameType, setGameType] = useState<'juego1' | 'juego2'>('juego1');
  const [playersTable, setPlayersTable] = useState<{id:string; name:string; cardsCount:number; isCurrentTurn:boolean; role?:string|null}[]>([]);
  const [playerName, setPlayerName] = useState<string>("");
  const [roomCode, setRoomCode] = useState<string>("");
  const [playerId, setPlayerId] = useState<string>("");

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
    const pid = searchParams.get("playerId") || undefined;
    if (!code || !pid) return;

    setRoomInfo(prev => ({
      code: code.toUpperCase(),
      isHost: host,
      playerId: pid,
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
        const me = data.room?.players?.find((p: any) => p.id === pid);
        if (me?.cards) setMyCards(me.cards);
        if (Array.isArray(data.room?.players)) {
          setRoomInfo(prev => prev ? { ...prev, players: data.room.players.length, status: data.room.status } : prev);
        }
        setPlayersTable(Array.isArray(data.playersTable) ? data.playersTable : []);
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
        setPlayersTable(Array.isArray(data.playersTable) ? data.playersTable : []);
      } catch {}
    }, 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [roomInfo?.code, roomInfo?.playerId]);

  // En carga inicial desde /state, guarda roundComboSize y roundAwaitingLead
  useEffect(() => {
    const code = searchParams.get("code");
    const playerId = searchParams.get("playerId") || undefined;
    if (!code || !playerId) return;
    (async () => {
      try {
        const res = await fetch(`/api/rooms/${code}/state`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setRoundAwaitingLead(!!data.room?.roundAwaitingLead);
        setRoundComboSize(data.room?.roundComboSize || 1);

        setTopCard(data.topCard || null);
        setTurnsStarted(!!data.room?.turnsStarted);
        setCurrentTurn(data.room?.currentTurnPlayerId || null);
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

  // En polling, sincroniza roundComboSize y roundAwaitingLead
  useEffect(() => {
    if (!roomInfo?.code || !roomInfo?.playerId) return;
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/rooms/${roomInfo.code}/state`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setRoundAwaitingLead(!!data.room?.roundAwaitingLead);
        setRoundComboSize(data.room?.roundComboSize || 1);

        setTopCard(data.topCard || null);
        setTurnsStarted(!!data.room?.turnsStarted);
        setCurrentTurn(data.room?.currentTurnPlayerId || null);
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
        setPlayersTable(Array.isArray(data.playersTable) ? data.playersTable : []);
      } catch {}
    }, 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [roomInfo?.code, roomInfo?.playerId]);

  // Cuando NO estás abriendo ronda, autoajusta el selector para que muestre el tamaño exigido
  useEffect(() => {
    if (!roundAwaitingLead) setSelectedComboSize(roundComboSize || 1);
  }, [roundAwaitingLead, roundComboSize]);

  // Helper para saber si tienes el 3 de bastos
  const hasThreeBastos = myCards.some(c => c.value === 3 && c.suit === 'bastos');

  // Construye el combo que se enviará (usa N del selector si lideras, si no usa el de la ronda)
  const buildCombo = (dragged: any): any[] => {
    if (dragged?.value === 2 && dragged?.suit === 'oros') return [dragged]; // 2 de oros siempre solo
    const sizeNeeded = roundAwaitingLead ? selectedComboSize : roundComboSize;
    if (sizeNeeded <= 1) return [dragged];
    const same = myCards.filter(c => c.value === dragged.value);
    if (same.length < sizeNeeded) return [];
    const cards = [dragged];
    for (const c of same) {
      if (cards.length >= sizeNeeded) break;
      if (!(c.suit === dragged.suit && c.value === dragged.value)) cards.push(c);
    }
    return cards.length === sizeNeeded ? cards : [];
  };

  // Drop en carta central
  const handleDropOnCenter = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!roomInfo?.code || !roomInfo?.playerId) return;

    let dragged: any;
    try { dragged = JSON.parse(e.dataTransfer.getData("application/json")); } catch { return; }

    // Validaciones UI (ligeras, el backend decide)
    if (turnsStarted) {
      if (roundAwaitingLead) {
        if (currentTurn !== roomInfo.playerId) { setError('Es la salida de ronda y no es tu turno'); return; }
      } else {
        if (currentTurn !== roomInfo.playerId) { setError('No es tu turno'); return; }
      }
    }

    // Construir combo a enviar
    const cards = buildCombo(dragged);
    if (cards.length === 0) {
      setError(roundAwaitingLead
        ? `No tienes suficientes cartas para jugar ${selectedComboSize}`
        : `Debes jugar ${roundComboSize} carta(s) del mismo número`);
      return;
    }

    try {
      const res = await fetch(`/api/rooms/${roomInfo.code}/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: roomInfo.playerId,
          cards,
          comboSize: roundAwaitingLead ? selectedComboSize : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'No se pudo jugar'); return; }

      setMyCards(data.myCards || []);
      setTopCard(data.topCard || null);
      setCurrentTurn(data.nextTurnPlayerId || null);
      setTurnsStarted(!!data.turnsStarted);
      setRoundAwaitingLead(!!data.roundAwaitingLead);
      setRoundComboSize(data.roundComboSize || 1);
    } catch {
      setError('Error al jugar');
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

  // Ordena poniendo al jugador local abajo (ángulo 90º) y distribuye en círculo
  const seats = (() => {
    const meId = roomInfo?.playerId;
    const list = [...playersTable];
    if (!list.length) return [];

    // Reordena: me primero, luego el resto en orden actual
    let ordered = list;
    if (meId) {
      const meIdx = list.findIndex(p => p.id === meId);
      if (meIdx > 0) {
        ordered = [list[meIdx], ...list.slice(0, meIdx), ...list.slice(meIdx + 1)];
      }
    }

    const n = ordered.length;

    // Centro del contenedor (w=640, h=420)
    const centerX = 320, centerY = 210;

    // Radio máximo permitido para que no se salga (aprox. mitad del badge)
    const badgeHalfW = 80;  // ~160px de ancho
    const badgeHalfH = 28;  // ~56px de alto
    const maxRadiusX = centerX - badgeHalfW - 4;
    const maxRadiusY = centerY - badgeHalfH - 4;
    const baseRadius = 120 + n * 12; // radio base que crece con jugadores
    const radius = Math.min(maxRadiusX, maxRadiusY, baseRadius);

    return ordered.map((p, i) => {
      // i=0 abajo (270°). Con Y positiva hacia abajo: arranque en 90°.
      const angle = (i / n) * 2 * Math.PI + Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      return { ...p, x, y, isMe: p.id === meId };
    });
  })();

  // Lee code, playerId y nombre inicial (si viene por query)
  useEffect(() => {
    const code = searchParams.get("code") || "";
    const pid = searchParams.get("playerId") || "";
    const initialName = searchParams.get("name") || "";
    setRoomCode(code);
    setPlayerId(pid);
    if (initialName) setPlayerName(initialName);
  }, [searchParams]);

  // Si no hay nombre en query, lo resuelve desde /state (buscando por playerId)
  useEffect(() => {
    if (!roomCode || !playerId) return;
    let cancelled = false;
    const fetchName = async () => {
      try {
        const res = await fetch(`/api/rooms/${roomCode}/state`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const me = Array.isArray(data?.room?.players)
          ? data.room.players.find((p: any) => p?.id === playerId)
          : null;
        if (!cancelled && me?.name) setPlayerName(me.name);
      } catch {}
    };
    fetchName(); // primera vez
    const id = setInterval(fetchName, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [roomCode, playerId]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Badge de nombre arriba a la derecha */}
      <div className="fixed top-3 right-4 z-40">
        <div className="glass px-3 py-1 rounded-full text-sm">
          <span className="opacity-70 mr-2">Tú:</span>
          <span className="font-semibold">{playerName || "Jugador"}</span>
        </div>
      </div>

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

      {/* Main compacto y sin exceso de margen superior */}
      <main className="flex-1 flex flex-col items-center justify-start relative main-compact">
        {/* RANKING ARRIBA: reserva espacio siempre; muestra solo si hay alguien */}
        <div className="w-full px-4 mt-2 mb-3">
          <div
            className={`ranking-reserved mx-auto max-w-3xl rounded-xl shadow p-3 transition-opacity duration-300 ${
              ranking.length > 0 ? 'bg-white/90 text-black ranking-visible' : 'ranking-hidden'
            }`}
          >
            <div className="flex flex-wrap gap-3 justify-center">
              {ranking.map((r: any) => (
                <div key={r.playerId} className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-gray-200 text-xs">#{r.place}</span>
                  <span className="font-medium">{r.name}</span>
                  {r.role && (
                    <span className="px-2 py-0.5 rounded bg-yellow-300 text-xxs uppercase">
                      {r.role}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Lienzo central con anillo de jugadores */}
        <div className="relative w-[640px] h-[420px] flex items-center justify-center mb-4">
          {/* Carta central */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropOnCenter}
            className="center-card"
            title="Arrastra carta(s) aquí"
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

          {/* Asientos alrededor */}
          {seats.map(seat => (
            <div
              key={seat.id}
              className={`seat-badge absolute ${seat.isMe ? 'seat-me' : ''} ${seat.isCurrentTurn ? 'seat-turn' : ''}`}
              style={{
                left: seat.x,
                top: seat.y,
              }}
              title={seat.role ? `${seat.name} · ${seat.role}` : seat.name}
            >
              <div className="name">
                {seat.name}{seat.role ? ` · ${seat.role}` : ''}
              </div>
              <div className="meta">
                <span>🂠 {seat.cardsCount}</span>
                {seat.isCurrentTurn && <span>• turno</span>}
                {seat.isMe && <span>• tú</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Selector SOLO para quien abre la ronda / tamaño requerido */}
        <div className="flex items-center gap-2 mb-4">
          {roundAwaitingLead && (currentTurn === roomInfo?.playerId || (!turnsStarted && hasThreeBastos)) ? (
            <>
              <label className="text-white">Jugar</label>
              <select
                value={selectedComboSize}
                onChange={(e) => setSelectedComboSize(Number(e.target.value))}
                className="bg-white text-gray-900 px-2 py-1 rounded"
                title="Elige 1, 2, 3 o 4 para abrir la ronda"
              >
                <option value={1}>1 carta</option>
                <option value={2}>2 cartas</option>
                <option value={3}>3 cartas</option>
                <option value={4}>4 cartas</option>
              </select>
            </>
          ) : (
            <span className="bg-white/90 text-gray-900 px-2 py-1 rounded text-sm">
              Ronda de {roundComboSize} carta(s)
            </span>
          )}
        </div>

        {/* Mano del jugador */}
        <div className="absolute bottom-0 left-0 w-full px-4 pt-4 pb-12 flex justify-center items-end pointer-events-none">
          <div className="flex space-x-4 overflow-x-auto pointer-events-auto">
            {myCards.length > 0 ? (
              myCards.map((c, i) => {
                const isMyTurn = currentTurn === roomInfo?.playerId;
                const twoOros = c.value === 2 && c.suit === 'oros';
                const countSame = myCards.filter(x => x.value === c.value).length;
                let allowDrag = false;

                if (!turnsStarted && gameType === 'juego1') {
                  const isLeadingByRole = roundAwaitingLead && !!currentTurn && isMyTurn;
                  if (isLeadingByRole) {
                    allowDrag = twoOros ? true : countSame >= selectedComboSize;
                  } else {
                    allowDrag = c.value === 3 && c.suit === 'bastos';
                  }
                } else if (turnsStarted && roundAwaitingLead) {
                  if (isMyTurn) {
                    allowDrag = twoOros ? true : countSame >= selectedComboSize;
                  }
                } else if (turnsStarted) {
                  if (isMyTurn) {
                    if (twoOros) allowDrag = true;
                    else {
                      const meetsCount = countSame >= roundComboSize;
                      const meetsRank = !topCard ? true : cardRank(c) >= cardRank(topCard);
                      allowDrag = meetsCount && meetsRank;
                    }
                  }
                } else {
                  allowDrag = true;
                }

                return (
                  <div
                    key={i}
                    draggable={allowDrag}
                    onDragStart={(e) => {
                      if (!allowDrag) { e.preventDefault(); return; }
                      e.dataTransfer.setData("application/json", JSON.stringify(c));
                    }}
                    className={`playing-card bg-white rounded-2xl shadow-2xl w-28 h-40 flex flex-col items-center justify-center border-4 ${
                      allowDrag
                        ? "playable cursor-grab active:cursor-grabbing border-gray-400"
                        : "cursor-not-allowed opacity-60 border-gray-300"
                    }`}
                    title={
                      twoOros ? "2 de oros (gana a todo)" :
                      roundAwaitingLead
                        ? (isMyTurn ? `Abrir con ${selectedComboSize} carta(s) del mismo número` : "Esperando al líder")
                        : `Debes jugar ${roundComboSize} carta(s) del mismo número`
                    }
                  >
                    <span className="text-xl text-gray-800 font-bold">{c.value}</span>
                    <span className="text-sm text-gray-600 capitalize">{c.suit}</span>
                  </div>
                );
              })
            ) : (
              <div className="bg-white rounded-xl shadow px-4 py-3 text-gray-800 font-semibold">
                Sin cartas
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function GamePage() {
  return (
    <Suspense fallback={<div className="w-full text-center py-8 text-lg text-gray-400">Cargando partida...</div>}>
      <GamePageInner />
    </Suspense>
  );
}