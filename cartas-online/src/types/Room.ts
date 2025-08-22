import type { Card } from './Card';

export interface Player {
  id: string;
  name?: string;
  joinedAt: string;
  cards?: Card[];
}

export interface Room {
  code: string;
  hostId: string;
  players: Player[];
  status: 'waiting' | 'playing' | 'finished';
  createdAt: string;
  currentDeck?: Card[];
  discardPile?: Card[];
}