import { NextResponse, type NextRequest } from 'next/server';
import { roomStorage } from '../../storage';
import type { AnyRoom } from '../../storage';

type RoomRoundState = AnyRoom & {
  lastTopPlayedBy?: string;
  roundTopValue?: number | null;
  roundComboSize?: number;
};

type PassBody = { playerId?: string };

export async function POST(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const { code: raw } = await context.params;
    const upper = raw?.toUpperCase();
    if (!upper) return NextResponse.json({ error: 'Código vacío' }, { status: 400 });

  const room = await roomStorage.getRoom(upper) as RoomRoundState | undefined;
    if (!room) return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });
    if (room.status !== 'playing') return NextResponse.json({ error: 'La partida no está en curso' }, { status: 400 });
    if (!room.turnsStarted) return NextResponse.json({ error: 'Aún no han comenzado los turnos' }, { status: 400 });
    if (room.roundAwaitingLead) return NextResponse.json({ error: 'Debes abrir la ronda, no puedes pasar' }, { status: 400 });

    let body: PassBody = {};
    try { body = (await request.json()) as PassBody; } catch {}
    const playerId: string | undefined = body?.playerId;
    if (!playerId) return NextResponse.json({ error: 'Falta playerId' }, { status: 400 });
    if (room.currentTurnPlayerId !== playerId) return NextResponse.json({ error: 'No es tu turno' }, { status: 403 });

    room.finishedOrder ||= [];
    const finished = new Set(room.finishedOrder);
    const allIds = room.players.map(p => p.id);

    const activeIds = (room.roundActivePlayerIds?.length ? [...room.roundActivePlayerIds] : allIds)
      .filter(id => !finished.has(id));
    room.roundActivePlayerIds = activeIds;

    const idxInRound = activeIds.indexOf(playerId);
    if (idxInRound === -1) return NextResponse.json({ error: 'Ya no estás en la ronda' }, { status: 400 });

    const isSelfTop = room.lastTopPlayedBy === playerId;
    let nextTurnPlayerId: string | undefined;

    if (isSelfTop) {
      // Pass suave
      const nextIdx = (idxInRound + 1) % activeIds.length;
      nextTurnPlayerId = activeIds[nextIdx];
    } else {
      // Pass normal: salir de la ronda
      activeIds.splice(idxInRound, 1);
      room.roundActivePlayerIds = activeIds;

      if (activeIds.length <= 1) {
        // Fin de ronda
        const leaderId = activeIds[0] ?? playerId;
        room.roundNumber = (room.roundNumber ?? 0) + 1;
        room.roundActivePlayerIds = allIds.filter(id => !finished.has(id));
        room.roundAwaitingLead = true;
        room.currentTurnPlayerId = leaderId;

        // Reset centro + combo
        room.discardPile = [];
        room.lastTopPlayedBy = undefined;
        room.roundTopValue = null;
        room.roundComboSize = 1;

        nextTurnPlayerId = leaderId;
      } else {
        const nextIdx = idxInRound % activeIds.length;
        nextTurnPlayerId = activeIds[nextIdx];
      }
    }

  room.currentTurnPlayerId = nextTurnPlayerId;
  await roomStorage.setRoom(upper, room);

    return NextResponse.json({
      room,
      nextTurnPlayerId,
      roundAwaitingLead: !!room.roundAwaitingLead,
      roundNumber: room.roundNumber
    });
  } catch (err) {
    console.error('[Pass] Error:', err);
    return NextResponse.json({ error: 'Error al pasar turno' }, { status: 500 });
  }
}