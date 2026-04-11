import { NextRequest, NextResponse } from 'next/server';

const MAX_IDS = 250;

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

  await Promise.all(
    ids.map(async (id) => {
      if (!/^[a-fA-F0-9]{24}$/.test(id)) return;
      const url = `${base}/invoice-requests/${encodeURIComponent(id)}/details`;
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: auth,
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = await res.json();
        const row =
          json &&
          typeof json === 'object' &&
          'success' in json &&
          (json as { success: boolean }).success &&
          (json as { data?: unknown }).data != null
            ? (json as { data: unknown }).data
            : (json as { data?: unknown })?.data ?? json;
        if (row && typeof row === 'object') {
          data[id] = row;
        }
      } catch {
        // per-id failure: omit from map
      }
    })
  );

  return NextResponse.json({ success: true, data });
}
