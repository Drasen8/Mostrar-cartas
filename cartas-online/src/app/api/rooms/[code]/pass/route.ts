import { NextResponse } from 'next/server';
import { roomStorage } from '../../storage';

export async function POST(request: Request, context: { params: { code: string } }) {
  try {
    const { code } = await Promise.resolve(context.params);
    const upper = code?.toUpperCase();
    if (!upper) return NextResponse.json({ error: 'Código vacío' }, { status: 400 });

    const room = roomStorage.getRoom(upper);
    if (!room) return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });
    if (room.status !== 'playing') return NextResponse.json({ error: 'La partida no está en curso' }, { status: 400 });
    if (!room.turnsStarted) return NextResponse.json({ error: 'Aún no han comenzado los turnos' }, { status: 400 });
    if (room.roundAwaitingLead) return NextResponse.json({ error: 'Debes abrir la ronda, no puedes pasar' }, { status: 400 });

    let body: any = {};
    try { body = await request.json(); } catch {}
    const playerId: string | undefined = body?.playerId;
    if (!playerId) return NextResponse.json({ error: 'Falta playerId' }, { status: 400 });

    if (room.currentTurnPlayerId !== playerId) return NextResponse.json({ error: 'No es tu turno' }, { status: 403 });

    const list = room.roundActivePlayerIds && room.roundActivePlayerIds.length
      ? [...room.roundActivePlayerIds]
      : room.players.map(p => p.id);

    const idxInRound = list.indexOf(playerId);
    if (idxInRound === -1) return NextResponse.json({ error: 'Ya no estás en la ronda' }, { status: 400 });

    // El jugador abandona la ronda actual
    list.splice(idxInRound, 1);
    room.roundActivePlayerIds = list;

    let roundEnded = false;
    let nextTurnPlayerId = room.currentTurnPlayerId;

    if (list.length <= 1) {
      // Fin de ronda: el único restante lidera la siguiente
      const leaderId = list[0] ?? playerId;
      room.roundNumber = (room.roundNumber ?? 0) + 1;
      room.roundActivePlayerIds = room.players.map(p => p.id);
      room.roundAwaitingLead = true;
      room.currentTurnPlayerId = leaderId;
      roundEnded = true;
      nextTurnPlayerId = leaderId;
    } else {
      // Avanza al siguiente activo (tras eliminar, el siguiente ocupa el mismo índice)
      const nextIdx = idxInRound % list.length;
      room.currentTurnPlayerId = list[nextIdx];
      nextTurnPlayerId = room.currentTurnPlayerId;
    }

    roomStorage.setRoom(upper, room);
    return NextResponse.json({ room, nextTurnPlayerId, roundEnded, roundNumber: room.roundNumber, roundAwaitingLead: !!room.roundAwaitingLead });
  } catch (err) {
    console.error('[Pass] Error:', err);
    return NextResponse.json({ error: 'Error al pasar turno' }, { status: 500 });
  }
}