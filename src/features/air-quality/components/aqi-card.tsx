'use client';

import { ProvenanceBadge } from '@/components/ui/provenance-badge';
import { formatNumber, formatRelativeAge } from '@/lib/utils/format';
import { hasValue, type DataEnvelope } from '@/types/data-envelope';
import type { AqiSummary, ExcludedPollutant } from '../types/air-quality';
import { AQI_COLOURS, AQI_GUIDANCE } from '../utils/aqi-palette';

const POLLUTANT_LABELS: Record<string, string> = {
  pm25: 'PM2.5',
  pm10: 'PM10',
  o3: 'O₃',
  no2: 'NO₂',
  so2: 'SO₂',
  co: 'CO',
};

/**
 * Headline AQI.
 *
 * The index number is the primary encoding and the category name is always
 * written out; the colour is a secondary cue only. That is deliberate — the
 * official AQI hue sequence does not separate reliably for colour-vision
 * deficiency (see `aqi-palette.ts`), so it must never be the sole channel.
 *
 * The card also names the standard and lists each contributing pollutant with
 * its averaging window, because spec §7 only permits an AQI to be shown when
 * it was computed with a documented standard — which means showing which.
 */
export function AqiCard({
  envelope,
  excluded,
}: {
  envelope: DataEnvelope<AqiSummary>;
  excluded: readonly ExcludedPollutant[];
}) {
  if (!hasValue(envelope)) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted">Air Quality Index</span>
          <ProvenanceBadge envelope={envelope} />
        </div>
        <p className="text-2xl font-semibold text-dim">—</p>
        <p className="text-[11px] leading-snug text-muted">
          {envelope.note ?? 'No AQI could be computed.'}
        </p>
        {excluded.length > 0 ? (
          <ul className="space-y-0.5 text-[10px] text-dim">
            {excluded.map((item) => (
              <li key={item.pollutant}>
                <span className="font-mono uppercase">
                  {POLLUTANT_LABELS[item.pollutant] ?? item.pollutant}
                </span>
                : {item.reason}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  const summary = envelope.value;
  const colour = AQI_COLOURS[summary.categoryId];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">Air Quality Index</span>
        <ProvenanceBadge envelope={envelope} />
      </div>

      <div className="flex items-start gap-3">
        {/* Colour block, paired with the number and name beside it. */}
        <span
          className="mt-1 h-12 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: colour }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-4xl leading-none font-semibold text-fg">
            {summary.aqi}
          </p>
          <p className="mt-1 text-sm font-medium" style={{ color: colour }}>
            {summary.categoryLabel}
          </p>
          <p className="readout text-[10px] text-dim">
            US EPA standard · driven by{' '}
            {POLLUTANT_LABELS[summary.dominant] ?? summary.dominant}
          </p>
        </div>
      </div>

      <p className="text-[11px] leading-snug text-muted">
        {AQI_GUIDANCE[summary.categoryId]}
      </p>

      <div>
        <h4 className="panel-heading mb-1">Basis</h4>
        <ul className="readout space-y-0.5 text-[10px]">
          {summary.contributing.map((item) => (
            <li key={item.pollutant} className="flex justify-between gap-2">
              <span className="text-dim">
                {POLLUTANT_LABELS[item.pollutant] ?? item.pollutant} ·{' '}
                {item.window}
              </span>
              <span className="text-muted">
                {formatNumber(item.concentration, 1)} {item.unit} → {item.aqi}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {excluded.length > 0 ? (
        <div>
          <h4 className="panel-heading mb-1">Excluded</h4>
          <ul className="space-y-0.5 text-[10px] text-dim">
            {excluded.map((item) => (
              <li key={item.pollutant}>
                <span className="font-mono uppercase">
                  {POLLUTANT_LABELS[item.pollutant] ?? item.pollutant}
                </span>
                : {item.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {envelope.measuredAt ? (
        <p className="readout text-[10px] text-dim">
          newest hour {formatRelativeAge(envelope.measuredAt)}
        </p>
      ) : null}
    </div>
  );
}
