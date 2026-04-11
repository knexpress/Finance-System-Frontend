import { NextRequest, NextResponse } from 'next/server';

const MAX_IDS = 250;
/** Avoid hammering the backend (many hosts return 429 if we open 100+ parallel connections). */
const FETCH_CHUNK_SIZE = 6;
const PAUSE_MS_BETWEEN_CHUNKS = 120;
const MAX_RETRIES_429 = 4;

function backendBaseUrl(): string {
  const raw =
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api';
  return raw.replace(/\/$/, '');
}

/**
 * Server-side proxy: fetches invoice-request details from the real API.
 * Used so the browser only calls same-origin `/api/...`, which avoids CSP
 * blocking `connect-src` to non-localhost HTTP backends on HTTPS deployments.
 */
export async function POST(request: NextRequest) {
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

        const json = await res.json();
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

  for (let i = 0; i < validIds.length; i += FETCH_CHUNK_SIZE) {
    const chunk = validIds.slice(i, i + FETCH_CHUNK_SIZE);
    await Promise.all(chunk.map((id) => fetchOne(id)));
    if (i + FETCH_CHUNK_SIZE < validIds.length) {
      await new Promise((r) => setTimeout(r, PAUSE_MS_BETWEEN_CHUNKS));
    }
  }

  return NextResponse.json({ success: true, data });
}
