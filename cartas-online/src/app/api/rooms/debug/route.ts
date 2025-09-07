import { NextResponse } from 'next/server';
import { storageMode } from '../storage';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const info = {
      storage: storageMode,
      vercel: !!process.env.VERCEL,
      kvConfigured: Boolean(process.env.KV_URL || (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)),
    };
    return NextResponse.json(info);
  } catch (e) {
    return NextResponse.json({ error: 'debug failed' }, { status: 500 });
  }
}
