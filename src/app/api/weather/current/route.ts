import { NextRequest, NextResponse } from 'next/server';

const API_URL = 'https://www.7timer.info/bin/api.pl';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');

    if (!lat || !lon) {
      return NextResponse.json(
        { success: false, error: 'Latitude and longitude are required.' },
        { status: 400 }
      );
    }

    const url = `${API_URL}?lon=${encodeURIComponent(lon)}&lat=${encodeURIComponent(lat)}&product=civil&output=json`;

    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: 'Weather service is unavailable right now.' },
        { status: 502 }
      );
    }

    const data = await response.json();
    const current = Array.isArray(data?.dataseries) ? data.dataseries[0] : null;

    return NextResponse.json({
      success: true,
      data: {
        weather: current?.weather || '',
        tempC: typeof current?.temp2m === 'number' ? current.temp2m : null,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch weather data.' },
      { status: 500 }
    );
  }
}
