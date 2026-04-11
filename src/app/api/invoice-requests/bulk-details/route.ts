import { NextRequest, NextResponse } from 'next/server';

const MAX_IDS = 250;
/** Avoid hammering the backend (many hosts return 429 if we open 100+ parallel connections). */
const FETCH_CHUNK_SIZE = 8;
const PAUSE_MS_BETWEEN_CHUNKS = 80;
const MAX_RETRIES_429 = 4;

export const runtime = 'nodejs';
/** Vercel Pro+ can raise this; Hobby is capped at 10s by the platform. */
export const maxDuration = 60;

function backendBaseUrl(): string {
  const raw =
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api';
  return raw.replace(/\/$/, '');
}

/**
 * Make backend payloads safe for JSON.stringify (NextResponse.json throws on BigInt, etc.).
 */
function toJsonSafe(obj: unknown, seen = new WeakSet<object>()): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) {
    return obj.map((item) => toJsonSafe(item, seen));
  }
  if (seen.has(obj as object)) return null;
  seen.add(obj as object);

  const o = obj as Record<string, unknown>;
  if (typeof o.$oid === 'string' && Object.keys(o).length === 1) return o.$oid;
  if (typeof o.$numberDecimal === 'string' && Object.keys(o).length === 1) return o.$numberDecimal;
  if (o.$date != null && Object.keys(o).length <= 2) {
    const d = o.$date;
    return typeof d === 'string' || typeof d === 'number' ? d : toJsonSafe(d, seen);
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    try {
      out[k] = toJsonSafe(v, seen);
    } catch {
      out[k] = null;
    }
  }
  return out;
}

/**
 * Server-side proxy: fetches invoice-request details from the real API.
 * Used so the browser only calls same-origin `/api/...`, which avoids CSP
 * blocking `connect-src` to non-localhost HTTP backends on HTTPS deployments.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: { ids?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }

    if (!Array.isArray(body.ids)) {
      return NextResponse.json({ success: false, error: 'ids array required' }, { status: 400 });
    }

    const ids = [...new Set(body.ids.map((x) => String(x)).filter(Boolean))].slice(0, MAX_IDS);
    if (ids.length === 0) {
      return NextResponse.json({ success: true, data: {} });
    }

    const base = backendBaseUrl();
    const data: Record<string, unknown> = {};

    const validIds = ids.filter((id) => /^[a-fA-F0-9]{24}$/.test(id));
    // Large exports: fewer round-trips so Vercel Hobby (~10s) is less likely to time out.
    const manyIds = validIds.length > 25;
    const chunkSize = manyIds ? 14 : FETCH_CHUNK_SIZE;
    const pauseMs = manyIds ? 0 : PAUSE_MS_BETWEEN_CHUNKS;

    const fetchOne = async (id: string): Promise<void> => {
      const url = `${base}/invoice-requests/${encodeURIComponent(id)}/details`;
      const headers = {
        Authorization: auth,
        'Content-Type': 'application/json',
      };

      for (let attempt = 0; attempt < MAX_RETRIES_429; attempt++) {
        try {
          const res = await fetch(url, {
            method: 'GET',
            headers,
            cache: 'no-store',
          });

          if (res.status === 429) {
            const backoff = 400 * (attempt + 1) ** 2;
            await new Promise((r) => setTimeout(r, backoff));
            continue;
          }

          if (!res.ok) return;

          let json: unknown;
          try {
            json = await res.json();
          } catch {
            return;
          }

          if (!json || typeof json !== 'object' || Array.isArray(json)) return;

          let row: unknown = null;
          const j = json as Record<string, unknown>;
          if (j.data != null && typeof j.data === 'object') {
            row = j.data;
          } else if (j.invoiceRequest != null && typeof j.invoiceRequest === 'object') {
            row = j.invoiceRequest;
          } else if (j.success === true && j.data != null) {
            row = j.data;
          } else if (j._id != null || j.verification != null || j.booking_snapshot != null) {
            row = json;
          }

          if (row && typeof row === 'object' && !Array.isArray(row)) {
            data[id] = row;
          }
          return;
        } catch {
          return;
        }
      }
    };

    for (let i = 0; i < validIds.length; i += chunkSize) {
      const chunk = validIds.slice(i, i + chunkSize);
      await Promise.all(chunk.map((id) => fetchOne(id)));
      if (i + chunkSize < validIds.length && pauseMs > 0) {
        await new Promise((r) => setTimeout(r, pauseMs));
      }
    }

    const safeData = toJsonSafe(data) as Record<string, unknown>;
    const payload = JSON.stringify({ success: true, data: safeData });
    return new NextResponse(payload, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[bulk-details]', e);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal error loading invoice request details',
      },
      { status: 500 }
    );
  }
}
