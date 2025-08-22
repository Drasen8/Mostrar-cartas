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
};

const globalRooms: Record<string, AnyRoom> = {};

export const roomStorage = {
  getRoom(code: string): AnyRoom | undefined {
    return globalRooms[code];
  },
  setRoom(code: string, room: AnyRoom): void {
    globalRooms[code] = room;
    console.log('[Storage] setRoom', code, 'rooms:', Object.keys(globalRooms));
  },
  getAllRooms(): AnyRoom[] {
    return Object.values(globalRooms);
  }
};