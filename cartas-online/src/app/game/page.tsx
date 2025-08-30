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
  const [selectedComboSize, setSelectedComboSize] = useState<number>(1);
  const [roundComboSize, setRoundComboSize] = useState<number>(1);
  const [roundAwaitingLead, setRoundAwaitingLead] = useState<boolean>(false);
  const [turnsStarted, setTurnsStarted] = useState<boolean>(false);
  const [currentTurn, setCurrentTurn] = useState<string | null>(null);
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
        <div className="flex items-center gap-4 mb-4">
          {/* Centro */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropOnCenter}
            className="bg-white/90 rounded-xl shadow-2xl flex items-center justify-center w-36 h-52 border-4 border-yellow-500"
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

          {/* Selector SOLO para quien abre la ronda; para el resto muestra el tamaño requerido */}
          <div className="flex items-center gap-2">
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
        </div>

        {/* RANKING ENTRE CENTRO Y MANO */}
        {ranking.length > 0 && (
          <div className="w-full px-4 mb-4">
            <div className="mx-auto max-w-3xl bg-white/90 text-black rounded-xl shadow p-3">
              <div className="flex flex-wrap gap-3 justify-center">
                {ranking.map(r => (
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
        )}

        {/* Mano: permite arrastrar solo cartas que formen 1/2/3/4 según la ronda.
            El 2 de oros siempre se puede arrastrar. */}
        <div className="absolute bottom-0 left-0 w-full px-4 pb-6 flex justify-center items-end pointer-events-none">
          <div className="flex space-x-4 overflow-x-auto pointer-events-auto">
            {myCards.length > 0 ? (
              myCards.map((c, i) => {
                const isMyTurn = currentTurn === roomInfo?.playerId;
                const twoOros = c.value === 2 && c.suit === 'oros';
                const countSame = myCards.filter(x => x.value === c.value).length;

                let allowDrag = false;

                if (!turnsStarted && gameType === 'juego1') {
                  // NUEVO: si hay líder por roles (culo) y eres tú, puedes abrir con lo que quieras (respeta selector/combo)
                  const isLeadingByRole = roundAwaitingLead && !!currentTurn && isMyTurn;
                  if (isLeadingByRole) {
                    allowDrag = twoOros ? true : countSame >= selectedComboSize;
                  } else {
                    // Sin líder por roles (primera mano de la partida): solo 3 de bastos (o combos de treses que incluyan 3 de bastos; lo valida el backend)
                    allowDrag = c.value === 3 && c.suit === 'bastos';
                  }
                } else if (turnsStarted && roundAwaitingLead) {
                  // Abriendo ronda normal: solo el líder puede arrastrar
                  if (isMyTurn) {
                    allowDrag = twoOros ? true : countSame >= selectedComboSize;
                  }
                } else if (turnsStarted) {
                  // Ronda en curso: exige combo del tamaño de la ronda y rango >= top (salvo 2 de oros)
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
                    className={`bg-white rounded-2xl shadow-2xl w-28 h-40 flex flex-col items-center justify-center border-4 ${
                      allowDrag ? "cursor-grab active:cursor-grabbing border-gray-400" : "cursor-not-allowed opacity-60 border-gray-300"
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