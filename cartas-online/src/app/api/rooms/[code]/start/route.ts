import { NextResponse } from 'next/server';
import { roomStorage } from '../../storage';
import { createSpanishDeck } from '../../../../../../src/lib/game/cards';

export async function POST(_request: Request, context: { params: { code: string } }) {
  try {
    const params = await Promise.resolve(context.params);
    const code = params.code?.toUpperCase();
    if (!code) return NextResponse.json({ error: 'Código vacío' }, { status: 400 });

    const room = roomStorage.getRoom(code);
    if (!room) return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });
    if (room.status === 'playing') return NextResponse.json({ error: 'Partida ya iniciada' }, { status: 400 });

    // Leer body (cardsPerPlayer opcional)
    let body: any = {};
    try { body = await _request.json(); } catch {}
    const requested = Number.isFinite(Number(body?.cardsPerPlayer)) ? Math.max(1, Math.floor(Number(body.cardsPerPlayer))) : 7;
    const gameType: 'juego1' | 'juego2' = body?.gameType === 'juego2' ? 'juego2' : 'juego1';

    // Crear baraja y repartir sin repetir
    const deck = createSpanishDeck(); // ya mezclada
    const numPlayers = room.players.length;
    if (numPlayers === 0) return NextResponse.json({ error: 'No hay jugadores en la sala' }, { status: 400 });

    // Ajustar para no exceder cartas disponibles
    const maxPerPlayer = Math.floor(deck.length / numPlayers);
    const cardsPerPlayer = Math.min(requested, maxPerPlayer);
    if (cardsPerPlayer <= 0) return NextResponse.json({ error: 'No hay cartas suficientes para repartir' }, { status: 400 });

    // Repartir secuencialmente (sin repetir)
    const updatedPlayers = room.players.map(p => ({ ...p, cards: deck.splice(0, cardsPerPlayer) }));

    const updatedRoom = {
      ...room,
      status: 'playing' as const,
      players: updatedPlayers,
      currentDeck: deck,
      discardPile: [],
      gameType,
      currentTurnPlayerId: undefined, // aún no hay turnos
      turnsStarted: false
    };
    roomStorage.setRoom(code, updatedRoom);

    console.log('[Start] Partida iniciada en', code, 'jugadores:', updatedPlayers.length, 'cartas/player:', cardsPerPlayer);
    return NextResponse.json({ room: updatedRoom, message: 'Partida iniciada', cardsPerPlayer });
  } catch (error) {
    console.error('[Start] Error:', error);
    return NextResponse.json({ error: 'Error al iniciar partida' }, { status: 500 });
  }
}