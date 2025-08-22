export interface Room {
  code: string;
  hostId: string;
  players: Player[];
  status: 'waiting' | 'playing' | 'finished';
  createdAt: Date;
}

export interface Player {
  id: string;
  name: string;
  cards: string[];
}