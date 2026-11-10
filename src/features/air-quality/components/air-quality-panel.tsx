'use client';

import { Wind } from 'lucide-react';
import { ProvenanceBadge } from '@/components/ui/provenance-badge';
import { Skeleton } from '@/components/ui/states';
import { formatNumber, formatRelativeAge } from '@/lib/utils/format';
import { hasValue } from '@/types/data-envelope';
import { useAirQuality } from '../hooks/use-air-quality';
import type { PollutantKey } from '../types/air-quality';
import { AQI_COLOURS } from '../utils/aqi-palette';

const PANEL_POLLUTANTS: readonly PollutantKey[] = ['pm25', 'pm10', 'o3', 'no2'];

const SHORT_LABELS: Record<PollutantKey, string> = {
  pm25: 'PM2.5',
  pm10: 'PM10',
  o3: 'O₃',
  no2: 'NO₂',
  so2: 'SO₂',
  co: 'CO',
};

/**
 * Compact air-quality section for the right-hand information panel. Shares the
 * query cache with the full view, so both cost one upstream request.
 */
export function AirQualityPanelSection() {
  const { data, isPending, isError } = useAirQuality();

  return (
    <section className="border-b border-border-subtle p-3 last:border-b-0">
      <h3 className="panel-heading mb-2 flex items-center gap-1.5">
        <Wind className="size-3.5" aria-hidden="true" />
        Air quality
      </h3>

      {isPending ? <Skeleton className="h-16 w-full" /> : null}

      {isError ? (
        <p className="text-[11px] text-dim">
          OpenAQ could not be reached. Pollutant values are unavailable rather
          than estimated.
        </p>
      ) : null}

      {data && !data.keyConfigured ? (
        <p className="text-[11px] leading-snug text-dim">
          No OpenAQ API key configured, so no measurements can be requested.
          Add <code className="readout">OPENAQ_API_KEY</code> to{' '}
          <code className="readout">.env.local</code>.
        </p>
      ) : null}

      {data && data.keyConfigured ? (
        <div className="space-y-2">
          {hasValue(data.aqi) ? (
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-baseline gap-2">
                {/* Colour is paired with the number and the name, never alone. */}
                <span
                  className="inline-block size-2 rounded-full"
                  style={{
                    backgroundColor: AQI_COLOURS[data.aqi.value.categoryId],
                  }}
                  aria-hidden="true"
                />
                <span className="text-xl font-semibold text-fg">
                  {data.aqi.value.aqi}
                </span>
                <span className="text-[11px] text-muted">
                  {data.aqi.value.categoryLabel}
                </span>
              </span>
              <ProvenanceBadge envelope={data.aqi} />
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-dim">AQI unavailable</span>
                <ProvenanceBadge envelope={data.aqi} />
              </div>
              <p className="text-[10px] leading-snug text-dim">
                {data.aqi.note}
              </p>
            </div>
          )}

          <dl className="readout space-y-0.5 text-[11px]">
            {PANEL_POLLUTANTS.map((pollutant) => {
              const envelope = data.readings[pollutant];
              return (
                <div key={pollutant} className="flex justify-between gap-2">
                  <dt className="text-dim">{SHORT_LABELS[pollutant]}</dt>
                  <dd className="text-muted">
                    {envelope && hasValue(envelope)
                      ? `${formatNumber(envelope.value, 1)} ${envelope.unit ?? ''}`
                      : '—'}
                  </dd>
                </div>
              );
            })}
          </dl>

          <p className="readout text-[10px] text-dim">
            {data.stationCount === 0
              ? `no station within ${Math.round(data.searchRadiusM / 1000)} km`
              : `${data.stationCount} station(s) in range`}
            {data.readings.pm25?.measuredAt
              ? ` · measured ${formatRelativeAge(data.readings.pm25.measuredAt)}`
              : ''}
          </p>
        </div>
      ) : null}
    </section>
  );
}
