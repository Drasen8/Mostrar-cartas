export type AnyPlayer = {
  id: string;
  name?: string;
  joinedAt: string;
  cards?: any[];
};

export type AnyRoom = {
  code: string;
  hostId: string;
  players: AnyPlayer[];
  status: 'waiting' | 'playing' | 'finished';
  createdAt: string;
  currentDeck?: any[];
  discardPile?: any[];
  gameType?: 'juego1' | 'juego2';
  currentTurnPlayerId?: string;
  // NUEVO: indica si ya comenzaron los turnos (cuando se tiró 3 de bastos)
  turnsStarted?: boolean;
};

declare global {
  // Evita que se pierdan datos entre HMR recompiles en dev
  // eslint-disable-next-line no-var
  var __rooms: Record<string, AnyRoom> | undefined;
}

const globalRooms: Record<string, AnyRoom> = globalThis.__rooms || (globalThis.__rooms = {});

export const roomStorage = {
  getRoom(code: string): AnyRoom | undefined {
    const key = code.toUpperCase();
    return globalRooms[key];
  },
  setRoom(code: string, room: AnyRoom): void {
    const key = code.toUpperCase();
    globalRooms[key] = room;
    // console.log('[Storage] rooms:', Object.keys(globalRooms));
  },
  getAllRooms(): AnyRoom[] {
    return Object.values(globalRooms);
  },
  deleteRoom(code: string) {
    const key = code.toUpperCase();
    delete globalRooms[key];
  }
};