import { NextResponse, type NextRequest } from 'next/server';
import { roomStorage } from '../../storage';
import { createSpanishDeck } from '../../../../../../src/lib/game/cards';

// Barajar Fisher–Yates (local a este archivo)
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Ranking: 3 (peor) ... 2 (mejor) con 2 de oros como la más fuerte
function rankCard(card: any): number {
  const order = [3, 4, 5, 6, 7, 10, 11, 12, 1, 2];
  if (!card) return -1;
  if (card.value === 2 && card.suit === 'oros') return 100;
  if (card.value === 2) return 90;
  const i = order.indexOf(card.value);
  return i === -1 ? -1 : i;
}

export async function POST(_request: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const { code: raw } = await context.params;
    const code = raw?.toUpperCase();
    if (!code) return NextResponse.json({ error: 'Código vacío' }, { status: 400 });

    const room = roomStorage.getRoom(code);
    if (!room) return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });

    if (room.status === 'playing') {
      return NextResponse.json({ error: 'La mano actual sigue en juego' }, { status: 409 });
    }

    let body: any = {};
    try { body = await _request.json(); } catch {}
    const gameType: 'juego1' | 'juego2' = body?.gameType === 'juego2' ? 'juego2' : 'juego1';

    const numPlayers = (room.players || []).length;
    if (numPlayers < 4) {
      return NextResponse.json({ error: 'Se necesitan al menos 4 jugadores para empezar' }, { status: 400 });
    }

    // Repartir TODO el mazo en ronda (barajado)
    const deck = shuffle(createSpanishDeck());
    const updatedPlayers = room.players.map(p => ({ ...p, cards: [] as any[] }));
    let i = 0;
    while (deck.length > 0) {
      updatedPlayers[i % numPlayers].cards.push(deck.shift());
      i++;
    }

    // Roles desde la mano anterior
    const prevOrder = Array.isArray(room.finishedOrder) ? [...room.finishedOrder] : [];
    const allIds = updatedPlayers.map(p => p.id);
    let roles: { presidente?: string; vicepresidente?: string; viceculo?: string; culo?: string } = {};

    if (prevOrder.length === allIds.length) {
      roles.presidente = prevOrder[0];
      if (prevOrder.length >= 2) roles.vicepresidente = prevOrder[1];
      if (prevOrder.length >= 3) roles.viceculo = prevOrder[prevOrder.length - 2];
      roles.culo = prevOrder[prevOrder.length - 1];

      // Intercambios Presidente <-> Culo (2)
      const pres = updatedPlayers.find(p => p.id === roles.presidente);
      const culo = updatedPlayers.find(p => p.id === roles.culo);
      if (pres && culo) {
        const presSorted = [...(pres.cards || [])].sort((a, b) => rankCard(a) - rankCard(b));
        const culoSorted = [...(culo.cards || [])].sort((a, b) => rankCard(a) - rankCard(b));
        const givePresWorst = presSorted.slice(0, Math.min(2, presSorted.length));
        const giveCuloBest = culoSorted.slice(-Math.min(2, culoSorted.length));
        const removeFrom = (hand: any[], toRemove: any[]) =>
          hand.filter(h => !toRemove.some(r => r.suit === h.suit && r.value === h.value));
        pres.cards = [...removeFrom(pres.cards || [], givePresWorst), ...giveCuloBest];
        culo.cards = [...removeFrom(culo.cards || [], giveCuloBest), ...givePresWorst];
      }

      // Intercambios VP <-> VC (1)
      const vp = updatedPlayers.find(p => p.id === roles.vicepresidente);
      const vc = updatedPlayers.find(p => p.id === roles.viceculo);
      if (vp && vc) {
        const vpSorted = [...(vp.cards || [])].sort((a, b) => rankCard(a) - rankCard(b));
        const vcSorted = [...(vc.cards || [])].sort((a, b) => rankCard(a) - rankCard(b));
        const vpWorst = vpSorted.slice(0, Math.min(1, vpSorted.length));
        const vcBest = vcSorted.slice(-Math.min(1, vcSorted.length));
        const removeFrom = (hand: any[], toRemove: any[]) =>
          hand.filter(h => !toRemove.some(r => r.suit === h.suit && r.value === h.value));
        vp.cards = [...removeFrom(vp.cards || [], vpWorst), ...vcBest];
        vc.cards = [...removeFrom(vc.cards || [], vcBest), ...vpWorst];
      }
    }

    // Construir nueva mano
    const updatedRoom = {
      ...room,
      status: 'playing' as const,
      players: updatedPlayers,
      currentDeck: [],
      discardPile: [],
      gameType,
      turnsStarted: false,
      roundNumber: (room.roundNumber ?? 0) + 1,
      roundActivePlayerIds: updatedPlayers.map(p => p.id),
      roundAwaitingLead: true,
      currentTurnPlayerId: roles.culo || undefined, // si hay roles, empieza el Culo
      finishedOrder: [] as string[],
      roles
    };

    roomStorage.setRoom(code, updatedRoom);
    return NextResponse.json({
      room: updatedRoom,
      message: prevOrder.length === allIds.length
        ? 'Nueva mano iniciada con intercambio por roles. Empieza el Culo.'
        : 'Nueva mano iniciada.'
    });
  } catch (error) {
    console.error('[Start] Error:', error);
    return NextResponse.json({ error: 'Error al iniciar partida' }, { status: 500 });
  }
}