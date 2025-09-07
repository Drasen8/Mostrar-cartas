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
  turnsStarted?: boolean;
  roundNumber?: number;
  roundActivePlayerIds?: string[];
  roundAwaitingLead?: boolean;
  // NUEVO: orden en el que los jugadores se quedan sin cartas (ids)
  finishedOrder?: string[];
};

// Async storage with Vercel KV (if configured) and memory fallback
type AsyncRoomStorage = {
  getRoom: (code: string) => Promise<AnyRoom | undefined>;
  setRoom: (code: string, room: AnyRoom) => Promise<void>;
  getAllRooms: () => Promise<AnyRoom[]>;
  deleteRoom: (code: string) => Promise<void>;
};

// Memory fallback (dev/local)
declare global {
  // eslint-disable-next-line no-var
  var __rooms: Record<string, AnyRoom> | undefined;
}
const mem: Record<string, AnyRoom> = globalThis.__rooms || (globalThis.__rooms = {});

// Vercel KV driver (optional)
import { kv } from '@vercel/kv';
// Map Upstash env vars to KV_* if present (so @vercel/kv works with Upstash integration)
if (!process.env.KV_URL && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  process.env.KV_REST_API_URL ||= process.env.UPSTASH_REDIS_REST_URL;
  process.env.KV_REST_API_TOKEN ||= process.env.UPSTASH_REDIS_REST_TOKEN;
}
let kvAvailable = false;
try {
  kvAvailable = Boolean(
    process.env.KV_URL ||
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  );
} catch {
  kvAvailable = false;
}

const kvPrefix = 'room:';

const kvStorage: AsyncRoomStorage = {
  async getRoom(code) {
    const key = kvPrefix + code.toUpperCase();
    const r = await kv.get(key);
    return (r as AnyRoom) || undefined;
  },
  async setRoom(code, room) {
    const key = kvPrefix + code.toUpperCase();
    await kv.set(key, room, { ex: 60 * 60 * 24 });
    await kv.sadd('rooms:set', code.toUpperCase());
  },
  async getAllRooms() {
  const codes = (await kv.smembers('rooms:set')) as string[] | null;
  if (!codes || codes.length === 0) return [];
    const keys = codes.map(c => kvPrefix + c);
    // mget returns (unknown | null)[]
    const arr = (await kv.mget(...keys)) as (AnyRoom | null)[];
    return arr.filter(Boolean) as AnyRoom[];
  },
  async deleteRoom(code) {
    const key = kvPrefix + code.toUpperCase();
    await kv.del(key);
    await kv.srem('rooms:set', code.toUpperCase());
  }
};

const memStorage: AsyncRoomStorage = {
  async getRoom(code) {
    return mem[code.toUpperCase()];
  },
  async setRoom(code, room) {
    mem[code.toUpperCase()] = room;
  },
  async getAllRooms() {
    return Object.values(mem);
  },
  async deleteRoom(code) {
    delete mem[code.toUpperCase()];
  }
};

export const roomStorage: AsyncRoomStorage = kvAvailable ? kvStorage : memStorage;
export const storageMode: 'kv' | 'memory' = kvAvailable ? 'kv' : 'memory';

// Warn if running on Vercel without KV configured (memory is ephemeral there)
if (!kvAvailable && process.env.VERCEL) {
  console.warn('[rooms/storage] Vercel KV is not configured. Falling back to in-memory storage which is ephemeral on Vercel. Configure KV to persist rooms.');
}