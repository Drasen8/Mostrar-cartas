import { NextResponse, type NextRequest } from 'next/server';
import { roomStorage } from '../../storage';

function rankCard(card: any): number {
  const order = [3, 4, 5, 6, 7, 10, 11, 12, 1, 2];
  if (!card) return -1;
  if (card.value === 2 && card.suit === 'oros') return 100; // 2 de oros gana a todo
  if (card.value === 2) return 90;
  const i = order.indexOf(card.value);
  return i === -1 ? -1 : i;
}

export async function GET(_request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const code = params.code?.toUpperCase();
    if (!code) return NextResponse.json({ error: 'Código vacío' }, { status: 400 });

    const room = roomStorage.getRoom(code);
    if (!room) return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });

    // Defaults de ronda
    (room as any).roundComboSize = (room as any).roundComboSize || 1;
    (room as any).roundTopValue = (room as any).roundTopValue ?? null;
    (room as any).roundAwaitingLead = !!(room as any).roundAwaitingLead;

    // AUTOPASS: si es tu turno y no puedes jugar, avanza
    try {
      if (room.status === 'playing' && room.turnsStarted && !room.roundAwaitingLead && room.currentTurnPlayerId) {
        room.finishedOrder ||= [];
        const finished = new Set(room.finishedOrder);
        const allIds = room.players.map(p => p.id);

        const topCard = room.discardPile?.length ? room.discardPile[room.discardPile.length - 1] : null;
        const roundTopValue = (room as any).roundTopValue ?? (topCard ? topCard.value : null);
        const roundComboSize = (room as any).roundComboSize || 1;

        const currentId = room.currentTurnPlayerId;
        const current = room.players.find(p => p.id === currentId);
        const hand = current?.cards || [];

        // ¿Puede jugar? 2 de oros siempre puede.
        const hasTwoOros = hand.some((c: any) => c.value === 2 && c.suit === 'oros');

        let canPlay = false;
        if (hasTwoOros) {
          canPlay = true;
        } else {
          // cuenta por valor y compara ranking
          const counts: Record<number, number> = {};
          for (const c of hand) counts[c.value] = (counts[c.value] || 0) + 1;

          if (roundTopValue == null) {
            // caso raro: no hay cima pero no estamos esperando líder
            // permite jugar (no autopass)
            canPlay = true;
          } else {
            const topRank = rankCard({ value: roundTopValue, suit: 'x' });
            canPlay = Object.entries(counts).some(([valStr, cnt]) => {
              const val = Number(valStr);
              return cnt >= roundComboSize && rankCard({ value: val, suit: 'x' }) >= topRank;
            });
          }
        }

        if (!canPlay) {
          // Lista de activos (excluye terminados)
          let activeIds = (room.roundActivePlayerIds?.length ? [...room.roundActivePlayerIds] : allIds)
            .filter(id => !finished.has(id));
          room.roundActivePlayerIds = activeIds;

          const idxInRound = activeIds.indexOf(currentId);
          const isSelfTop = (room as any).lastTopPlayedBy === currentId;

          if (isSelfTop) {
            // Pass suave: no te eliminas
            const nextIdx = activeIds.length > 0 ? (idxInRound + 1) % activeIds.length : -1;
            room.currentTurnPlayerId = nextIdx >= 0 ? activeIds[nextIdx] : undefined;
          } else {
            // Pass normal: sales de la ronda
            if (idxInRound !== -1) activeIds.splice(idxInRound, 1);
            room.roundActivePlayerIds = activeIds;

            if (activeIds.length <= 1) {
              // Fin de ronda: limpia centro y el único restante lidera
              const leaderId = activeIds[0] ?? currentId;
              room.roundNumber = (room.roundNumber ?? 0) + 1;
              room.roundActivePlayerIds = allIds.filter(id => !finished.has(id));
              room.roundAwaitingLead = true;
              room.currentTurnPlayerId = leaderId;

              // Reset de centro y combo
              room.discardPile = [];
              (room as any).lastTopPlayedBy = undefined;
              (room as any).roundTopValue = null;
              (room as any).roundComboSize = 1;
            } else {
              const nextIdx = idxInRound % activeIds.length;
              room.currentTurnPlayerId = activeIds[nextIdx];
            }
          }

          roomStorage.setRoom(code, room);
        }
      }
    } catch {
      // no interrumpir respuesta /state
    }

    // topCard para el cliente
    const topCard = room.discardPile?.length
      ? room.discardPile[room.discardPile.length - 1]
      : null;

    // Ranking incremental y roles parciales
    const allIds: string[] = Array.isArray(room.players) ? room.players.map(p => p.id) : [];
    const total = allIds.length;
    const finishedOnly: string[] = Array.isArray(room.finishedOrder) ? [...room.finishedOrder] : [];

    const roles: Record<string, 'presidente' | 'vicepresidente' | 'viceculo' | 'culo'> = {};

    if (finishedOnly.length >= 1) roles[finishedOnly[0]] = 'presidente';
    if (finishedOnly.length >= 2) roles[finishedOnly[1]] = 'vicepresidente';

    if (total >= 3 && finishedOnly.length >= total - 1) {
      // Si queda 1 por acabar, el último que terminó es el viceculo
      // Si ya terminaron todos, el penúltimo es el viceculo
      const viceculoIdx = finishedOnly.length === total ? total - 2 : finishedOnly.length - 1;
      if (viceculoIdx >= 0) roles[finishedOnly[viceculoIdx]] = 'viceculo';
    }
    if (finishedOnly.length === total && total > 0) {
      roles[finishedOnly[total - 1]] = 'culo';
    }

    const ranking = finishedOnly.map((id, i) => {
      const p = room.players.find(pp => pp.id === id) as any;
      const idx = allIds.indexOf(id);
      return {
        playerId: id,
        name: p?.name || `Jugador ${idx >= 0 ? idx + 1 : i + 1}`,
        place: i + 1,
        role: roles[id] || null,
      };
    });

    const playersTable = (room.players || []).map((p: any, idx: number) => ({
      id: p.id,
      name: p?.name || `Jugador ${idx + 1}`,
      cardsCount: Array.isArray(p?.cards) ? p.cards.length : 0,
      isCurrentTurn: room.currentTurnPlayerId === p.id,
      role: (roles as any)?.[p.id] || null,
    }));

    return NextResponse.json({
      room,
      topCard,
      joinable: room.status === 'waiting',
      ranking,
      roles,
      playersTable, // NUEVO
    });
  } catch (err) {
    console.error('[State GET] Error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}