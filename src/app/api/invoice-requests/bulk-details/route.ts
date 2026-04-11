import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
/** Long exports; actual cap depends on Vercel plan (Hobby ~10s). */
export const maxDuration = 300;

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
 * No artificial caps or throttling on this route (backend / platform limits still apply).
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

    const ids = [...new Set(body.ids.map((x) => String(x)).filter(Boolean))];
    if (ids.length === 0) {
      return NextResponse.json({ success: true, data: {} });
    }

    const base = backendBaseUrl();
    const data: Record<string, unknown> = {};

    const validIds = ids.filter((id) => /^[a-fA-F0-9]{24}$/.test(id));

    const fetchOne = async (id: string): Promise<void> => {
      const url = `${base}/invoice-requests/${encodeURIComponent(id)}/details`;
      const headers = {
        Authorization: auth,
        'Content-Type': 'application/json',
      };

      try {
        const res = await fetch(url, {
          method: 'GET',
          headers,
          cache: 'no-store',
        });

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
      } catch {
        // per-id failure
      }
    };

    await Promise.all(validIds.map((id) => fetchOne(id)));

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
