'use client';

import { useId, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/format';
import { CHART_CHROME, seriesColours } from './chart-palette';

/**
 * Shared time-series line chart.
 *
 * Design rules applied here once, so every chart in the dashboard inherits
 * them rather than re-deciding:
 *
 * - **One y-axis, always.** Two measures of different scale get two charts,
 *   never a second axis.
 * - **Thin marks, recessive chrome.** 2px lines, horizontal gridlines only,
 *   no vertical grid, no per-point dots — a 168-point series would otherwise
 *   be a bead necklace.
 * - **A hover layer by default.** A crosshair and a tooltip, because an
 *   HTML chart that cannot be interrogated is a picture of data.
 * - **Identity never by colour alone.** Two or more series get a legend, and
 *   every chart offers a table view, which is also the accessible path for a
 *   reader using a screen reader.
 */

export interface SeriesSpec {
  /** Key into each data row. */
  readonly key: string;
  readonly label: string;
  readonly unit?: string | null;
}

export interface ChartRow {
  /** X value; a label already formatted for display. */
  readonly label: string;
  /** Full timestamp, used in the tooltip and the table. */
  readonly title: string;
  readonly [key: string]: string | number | null | undefined;
}

interface TimeSeriesChartProps {
  rows: readonly ChartRow[];
  series: readonly SeriesSpec[];
  /** Decimal places for values. */
  precision?: number;
  height?: number;
  /** Show at most this many x-axis ticks; the rest are thinned out. */
  maxTicks?: number;
  className?: string;
  /** Rendered beneath the chart, e.g. a provenance note. */
  footnote?: string;
}

export function TimeSeriesChart({
  rows,
  series,
  precision = 1,
  height = 200,
  maxTicks = 8,
  className,
  footnote,
}: TimeSeriesChartProps) {
  const tableId = useId();
  const [showTable, setShowTable] = useState(false);

  const colours = useMemo(() => seriesColours(series.length), [series.length]);

  // Thin the ticks rather than letting Recharts overlap them.
  const tickValues = useMemo(() => {
    if (rows.length <= maxTicks) return rows.map((row) => row.label);
    const step = Math.ceil(rows.length / maxTicks);
    return rows
      .filter((_, index) => index % step === 0)
      .map((row) => row.label);
  }, [rows, maxTicks]);

  if (rows.length === 0) {
    return (
      <p className="p-4 text-center text-xs text-dim">
        No data points to plot.
      </p>
    );
  }

  const unit = series[0]?.unit ?? '';

  return (
    <div className={cn('space-y-2', className)}>
      {series.length > 1 ? (
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {series.map((spec, index) => (
            <li key={spec.key} className="flex items-center gap-1.5">
              <span
                className="h-0.5 w-4 rounded-full"
                style={{ backgroundColor: colours[index] }}
                aria-hidden="true"
              />
              {/* Text stays in an ink colour; the swatch carries identity. */}
              <span className="text-[11px] text-muted">{spec.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div style={{ height }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows as ChartRow[]}
            margin={{ top: 6, right: 10, bottom: 0, left: -18 }}
          >
            <CartesianGrid
              stroke={CHART_CHROME.grid}
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              ticks={tickValues}
              tick={{ fill: CHART_CHROME.axis, fontSize: 10 }}
              stroke={CHART_CHROME.grid}
              tickLine={false}
              interval={0}
              minTickGap={8}
            />
            <YAxis
              tick={{ fill: CHART_CHROME.axis, fontSize: 10 }}
              stroke={CHART_CHROME.grid}
              tickLine={false}
              width={48}
              // A single shared axis: co-plotted series must use one scale.
              domain={['auto', 'auto']}
            />
            <Tooltip
              cursor={{ stroke: CHART_CHROME.axis, strokeDasharray: '3 3' }}
              contentStyle={{
                background: 'var(--app-surface-2)',
                border: '1px solid var(--app-border-strong)',
                borderRadius: 6,
                fontSize: 11,
              }}
              labelStyle={{ color: 'var(--app-text-muted)' }}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as ChartRow | undefined;
                return row?.title ?? '';
              }}
              // Recharts types the formatter's value as possibly undefined,
              // which is the gap case: a missing hour renders as a dash rather
              // than as a zero.
              formatter={(value, name) => {
                const label = String(name ?? '');
                const spec = series.find((item) => item.label === label);
                const rendered =
                  typeof value === 'number'
                    ? `${formatNumber(value, precision)}${spec?.unit ? ` ${spec.unit}` : ''}`
                    : '—';
                return [rendered, label];
              }}
            />
            {series.map((spec, index) => (
              <Line
                key={spec.key}
                type="monotone"
                dataKey={spec.key}
                name={spec.label}
                stroke={colours[index]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                // Gaps in the data are gaps, not interpolated lines.
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between gap-2">
        {footnote ? (
          <p className="text-[10px] leading-snug text-dim">{footnote}</p>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => setShowTable((open) => !open)}
          aria-expanded={showTable}
          aria-controls={tableId}
          className="shrink-0 text-[10px] text-dim underline decoration-dotted underline-offset-2 hover:text-muted"
        >
          {showTable ? 'Hide table' : 'View as table'}
        </button>
      </div>

      {/*
        The table is the accessible equivalent of the plot: the chart itself is
        aria-hidden, since a screen reader cannot usefully traverse an SVG
        polyline.
      */}
      <div id={tableId} hidden={!showTable}>
        <div className="max-h-56 overflow-auto rounded border border-border-subtle">
          <table className="w-full text-[11px]">
            <caption className="sr-only">
              {series.map((spec) => spec.label).join(', ')} over time
            </caption>
            <thead className="sticky top-0 bg-surface-2">
              <tr>
                <th scope="col" className="panel-heading p-1.5 text-left">Time</th>
                {series.map((spec) => (
                  <th
                    key={spec.key}
                    scope="col"
                    className="panel-heading p-1.5 text-right"
                  >
                    {spec.label}
                    {spec.unit ? ` (${spec.unit})` : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.title} className="border-t border-border-subtle/60">
                  <td className="readout p-1.5 text-dim">{row.title}</td>
                  {series.map((spec) => {
                    const value = row[spec.key];
                    return (
                      <td
                        key={spec.key}
                        className="readout p-1.5 text-right text-muted"
                      >
                        {typeof value === 'number'
                          ? formatNumber(value, precision)
                          : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <span className="sr-only">
        {series.length === 1
          ? `${series[0].label} series with ${rows.length} points${unit ? ` in ${unit}` : ''}.`
          : `${series.length} series with ${rows.length} points each.`}{' '}
        Use the table view for the values.
      </span>
    </div>
  );
}

/** Min, max and mean of a numeric series, ignoring gaps. */
export function seriesStats(
  rows: readonly ChartRow[],
  key: string,
): { min: number; max: number; mean: number; count: number } | null {
  const values = rows
    .map((row) => row[key])
    .filter((value): value is number => typeof value === 'number');

  if (values.length === 0) return null;

  const sum = values.reduce((total, value) => total + value, 0);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    mean: sum / values.length,
    count: values.length,
  };
}
