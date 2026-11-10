'use client';

import { CloudRain, Droplets, Gauge, Thermometer, Wind } from 'lucide-react';
import { ProvenanceBadge } from '@/components/ui/provenance-badge';
import { StatTile } from '@/components/ui/stat-tile';
import { formatNumber } from '@/lib/utils/format';
import { hasValue } from '@/types/data-envelope';
import type { WeatherSnapshot } from '../types/weather';
import { weatherCodeInfo, windCompass } from '../utils/wmo-codes';

/**
 * Wind needs two measurements — speed and bearing — to mean anything, so it
 * gets a composed tile rather than two unrelated numbers. Both envelopes are
 * handled independently: a missing bearing degrades to speed alone instead of
 * blanking the tile.
 */
function WindTile({ snapshot }: { snapshot: WeatherSnapshot }) {
  const speed = snapshot.windSpeedKmh;
  const direction = snapshot.windDirectionDeg;

  return (
    <div className="panel flex flex-col gap-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
          <Wind className="size-3.5 shrink-0 text-dim" aria-hidden="true" />
          <span className="truncate">Wind</span>
        </span>
        <ProvenanceBadge envelope={speed} />
      </div>

      <div className="flex items-baseline gap-1.5">
        <span
          className={`text-2xl leading-none font-semibold ${
            hasValue(speed) ? 'text-fg' : 'text-dim'
          }`}
        >
          {hasValue(speed) ? formatNumber(speed.value, 1) : '—'}
        </span>
        {hasValue(speed) && speed.unit ? (
          <span className="text-xs text-muted">{speed.unit}</span>
        ) : null}
      </div>

      {hasValue(direction) ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted">
          <span
            className="inline-block text-dim"
            // The arrow glyph points the way the wind is blowing *towards*;
            // a meteorological bearing names where it comes *from*, hence the
            // 180° turn.
            style={{ transform: `rotate(${direction.value + 180}deg)` }}
            aria-hidden="true"
          >
            ↑
          </span>
          from {windCompass(direction.value)} ({Math.round(direction.value)}°)
        </p>
      ) : (
        <p className="text-[11px] text-dim">Bearing unavailable</p>
      )}
    </div>
  );
}

export function CurrentConditions({
  snapshot,
}: {
  snapshot: WeatherSnapshot;
}) {
  const condition = hasValue(snapshot.weatherCode)
    ? weatherCodeInfo(snapshot.weatherCode.value)
    : null;

  return (
    <div className="space-y-3">
      {condition ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-fg">{condition.label}</span>
          <ProvenanceBadge envelope={snapshot.weatherCode} />
          {hasValue(snapshot.isDay) ? (
            <span className="text-[11px] text-dim">
              {snapshot.isDay.value ? 'daytime' : 'night'}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <StatTile
          label="Air temperature"
          envelope={snapshot.temperatureC}
          icon={Thermometer}
          format={(value) => formatNumber(value, 1)}
        />
        <StatTile
          label="Feels like"
          envelope={snapshot.apparentTemperatureC}
          icon={Gauge}
          format={(value) => formatNumber(value, 1)}
        />
        <StatTile
          label="Relative humidity"
          envelope={snapshot.humidityPct}
          icon={Droplets}
          format={(value) => formatNumber(value, 0)}
        />
        <WindTile snapshot={snapshot} />
        <StatTile
          label="Precipitation"
          envelope={snapshot.precipitationMm}
          icon={CloudRain}
          format={(value) => formatNumber(value, 1)}
        />
      </div>
    </div>
  );
}
