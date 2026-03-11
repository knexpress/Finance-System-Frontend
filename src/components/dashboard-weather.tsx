'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CloudSun, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';

type WeatherState = {
  weather: string;
  tempC: number | null;
  city?: string;
};

const GEO_ERRORS = {
  PERMISSION_DENIED: 1,
  POSITION_UNAVAILABLE: 2,
  TIMEOUT: 3,
} as const;

const WEATHER_LABELS: Record<string, string> = {
  clear: 'Clear',
  pcloudy: 'Partly Cloudy',
  mcloudy: 'Mostly Cloudy',
  cloudy: 'Cloudy',
  humid: 'Humid',
  lightrain: 'Light Rain',
  oshower: 'Occasional Showers',
  ishower: 'Isolated Showers',
  lightsnow: 'Light Snow',
  rain: 'Rain',
  snow: 'Snow',
  rainsnow: 'Mixed Rain/Snow',
  ts: 'Thunderstorm',
  tsrain: 'Thunderstorm + Rain',
};

const toWeatherLabel = (raw: string) => {
  const key = (raw || '').replace(/day|night/gi, '').toLowerCase();
  return WEATHER_LABELS[key] || raw || 'Weather';
};

interface DashboardWeatherProps {
  variant?: 'compact' | 'large';
}

export default function DashboardWeather({ variant = 'compact' }: DashboardWeatherProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherState | null>(null);
  const [canRetryLocation, setCanRetryLocation] = useState(false);

  const requestLocationAndWeather = async () => {
    setLoading(true);
    setError(null);

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setError('Location permission requires HTTPS (or localhost).');
      setCanRetryLocation(true);
      setLoading(false);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Location is not supported on this device.');
      setCanRetryLocation(false);
      setLoading(false);
      return;
    }

    // If browser exposes permission state, provide clearer guidance before requesting.
    try {
      if ('permissions' in navigator && navigator.permissions?.query) {
        const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (status.state === 'denied') {
          setError('Location is blocked in browser settings. Allow location for this site, then retry.');
          setCanRetryLocation(true);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Ignore permission query errors and proceed to direct geolocation request.
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const params = new URLSearchParams({
            lat: position.coords.latitude.toString(),
            lon: position.coords.longitude.toString(),
          });

          const response = await fetch(`/api/weather/current?${params.toString()}`);
          const result = await response.json();

          if (!response.ok || !result?.success) {
            throw new Error(result?.error || 'Unable to load weather.');
          }

          setWeather({
            weather: toWeatherLabel(result.data?.weather),
            tempC: typeof result.data?.tempC === 'number' ? result.data.tempC : null,
            city: result.data?.city,
          });
          setCanRetryLocation(false);
        } catch (err: any) {
          setError(err?.message || 'Unable to load weather right now.');
          setCanRetryLocation(true);
        } finally {
          setLoading(false);
        }
      },
      (geoError) => {
        if (geoError.code === GEO_ERRORS.PERMISSION_DENIED) {
          setError('Location permission denied. Click Enable Location to try again.');
          setCanRetryLocation(true);
        } else if (geoError.code === GEO_ERRORS.POSITION_UNAVAILABLE) {
          setError('Location unavailable. Turn on device location services (Windows Location), then retry.');
          setCanRetryLocation(true);
        } else if (geoError.code === GEO_ERRORS.TIMEOUT) {
          setError('Location request timed out. Check GPS/network and retry.');
          setCanRetryLocation(true);
        } else {
          setError(geoError.message || 'Unable to get your location for weather.');
          setCanRetryLocation(true);
        }
        setLoading(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  };

  useEffect(() => {
    requestLocationAndWeather();
  }, []);

  const isLarge = variant === 'large';

  if (loading) {
    return (
      <div
        className={
          isLarge
            ? 'flex items-center gap-3 rounded-lg border border-border/60 bg-background/70 p-4 text-sm text-muted-foreground'
            : 'hidden md:flex items-center gap-2 text-xs text-muted-foreground'
        }
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Getting weather...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={
          isLarge
            ? 'flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-100/60 p-4 text-sm text-amber-800'
            : 'flex items-center gap-2 text-xs text-amber-700 bg-amber-100/60 border border-amber-300 rounded-md px-2 py-1'
        }
      >
        <AlertCircle className="h-3.5 w-3.5" />
        <span className={isLarge ? 'flex-1' : 'max-w-[220px] truncate hidden lg:inline'}>{error}</span>
        {canRetryLocation && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={isLarge ? 'h-8 px-3 text-xs' : 'h-6 px-2 text-[10px]'}
            onClick={requestLocationAndWeather}
          >
            Enable Location
          </Button>
        )}
      </div>
    );
  }

  if (!weather) {
    return null;
  }

  return (
    <div
      className={
        isLarge
          ? 'flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4'
          : 'hidden md:flex items-center gap-2 rounded-md border border-border/70 bg-muted/40 px-3 py-1.5'
      }
    >
      <CloudSun className="h-4 w-4 text-primary" />
      <div className={isLarge ? 'flex items-center gap-3 text-sm' : 'flex items-center gap-2 text-xs'}>
        <span className="font-medium text-foreground">
          {isLarge ? 'Current weather:' : ''}
          {isLarge ? ` ${weather.weather}` : weather.weather}
        </span>
        {weather.tempC !== null && <span className="text-muted-foreground">{weather.tempC}C</span>}
        {weather.city && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {weather.city}
          </span>
        )}
      </div>
    </div>
  );
}
