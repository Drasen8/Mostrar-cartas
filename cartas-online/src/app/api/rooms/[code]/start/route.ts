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

    let body: any = {};
    try { body = await _request.json(); } catch {}
    const gameType: 'juego1' | 'juego2' = body?.gameType === 'juego2' ? 'juego2' : 'juego1';

    const numPlayers = (room.players || []).length;
    if (numPlayers < 4) {
      return NextResponse.json({ error: 'Se necesitan al menos 4 jugadores para empezar' }, { status: 400 });
    }

    // Reparte TODO el mazo en ronda
    const deck = createSpanishDeck();
    const updatedPlayers = room.players.map(p => ({ ...p, cards: [] as any[] }));
    let i = 0;
    while (deck.length > 0) {
      updatedPlayers[i % numPlayers].cards.push(deck.shift());
      i++;
    }

    // Roles desde la mano anterior (si existe ranking completo)
    const prevOrder = Array.isArray(room.finishedOrder) ? [...room.finishedOrder] : [];
    const allIds = updatedPlayers.map(p => p.id);
    let roles: { presidente?: string; vicepresidente?: string; viceculo?: string; culo?: string } = {};

    if (prevOrder.length === allIds.length) {
      roles.presidente = prevOrder[0];
      if (prevOrder.length >= 2) roles.vicepresidente = prevOrder[1];
      if (prevOrder.length >= 3) roles.viceculo = prevOrder[prevOrder.length - 2];
      roles.culo = prevOrder[prevOrder.length - 1];

      // Intercambios:
      // - Presidente <-> Culo (2): presidente da 2 peores; culo da 2 mejores
      const pres = updatedPlayers.find(p => p.id === roles.presidente);
      const culo = updatedPlayers.find(p => p.id === roles.culo);
      if (pres && culo) {
        const presSorted = [...(pres.cards || [])].sort((a, b) => rankCard(a) - rankCard(b));
        const culoSorted = [...(culo.cards || [])].sort((a, b) => rankCard(a) - rankCard(b));
        const givePresWorst = presSorted.slice(0, Math.min(2, presSorted.length));
        const giveCuloBest = culoSorted.slice(-Math.min(2, culoSorted.length));

        // quitar de manos
        const removeFrom = (hand: any[], toRemove: any[]) =>
          hand.filter(h => !toRemove.some(r => r.suit === h.suit && r.value === h.value));

        pres.cards = [
          ...removeFrom(pres.cards || [], givePresWorst),
          ...giveCuloBest
        ];
        culo.cards = [
          ...removeFrom(culo.cards || [], giveCuloBest),
          ...givePresWorst
        ];
      }

      // - Vicepresidente <-> Viceculo (1): VP da 1 peor; VC da 1 mejor
      const vp = updatedPlayers.find(p => p.id === roles.vicepresidente);
      const vc = updatedPlayers.find(p => p.id === roles.viceculo);
      if (vp && vc) {
        const vpSorted = [...(vp.cards || [])].sort((a, b) => rankCard(a) - rankCard(b));
        const vcSorted = [...(vc.cards || [])].sort((a, b) => rankCard(a) - rankCard(b));
        const vpWorst = vpSorted.slice(0, Math.min(1, vpSorted.length));
        const vcBest = vcSorted.slice(-Math.min(1, vcSorted.length));

        const removeFrom = (hand: any[], toRemove: any[]) =>
          hand.filter(h => !toRemove.some(r => r.suit === h.suit && r.value === h.value));

        vp.cards = [
          ...removeFrom(vp.cards || [], vpWorst),
          ...vcBest
        ];
        vc.cards = [
          ...removeFrom(vc.cards || [], vcBest),
          ...vpWorst
        ];
      }
    }

    // Construir sala nueva
    const updatedRoom = {
      ...room,
      status: 'playing' as const,
      players: updatedPlayers,
      currentDeck: [],           // todo repartido
      discardPile: [],
      gameType,
      // Turnos/rondas
      turnsStarted: false,
      roundNumber: (room.roundNumber ?? 0) + 1,
      roundActivePlayerIds: updatedPlayers.map(p => p.id),
      roundAwaitingLead: true,
      // Inicio por roles: si hay "culo" definido, empieza él
      currentTurnPlayerId: roles.culo || undefined,
      // Reiniciar ranking para esta nueva mano
      finishedOrder: [] as string[],
      // Guardar roles (opcional, útil para UI)
      roles
    };

    roomStorage.setRoom(code, updatedRoom);
    return NextResponse.json({
      room: updatedRoom,
      message: prevOrder.length === allIds.length
        ? 'Partida iniciada con intercambio por roles. Empieza el Culo.'
        : 'Partida iniciada. Empieza según reglas del juego.'
    });
  } catch (error) {
    console.error('[Start] Error:', error);
    return NextResponse.json({ error: 'Error al iniciar partida' }, { status: 500 });
  }
}