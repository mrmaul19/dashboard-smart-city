'use client';

import { Accessibility, Bus, MapPin, Radio } from 'lucide-react';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { ProvenanceBadge } from '@/components/ui/provenance-badge';
import { StatTile } from '@/components/ui/stat-tile';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { SOURCE_SIMULATION, SOURCE_TRANSJAKARTA_GTFS } from '@/lib/constants/data-sources';
import { formatInteger, formatNumber } from '@/lib/utils/format';
import { realValue, simulatedValue } from '@/types/data-envelope';
import { useCityStore } from '@/stores/city-store';
import {
  ASSUMED_BUS_SPEED_MS,
  countSimulatedBuses,
} from '@/three/objects/transit-layer';
import { useTransit } from '../hooks/use-transit';

/** Format a headway in seconds as a readable interval. */
function formatHeadway(seconds: number | null): string {
  if (seconds === null) return 'not published';
  if (seconds < 90) return `${seconds} s`;
  const minutes = seconds / 60;
  return `${formatNumber(minutes, minutes < 10 ? 1 : 0)} min`;
}

export function TransportationView() {
  const cityId = useCityStore((s) => s.cityId);
  const { data, isPending, isError, error } = useTransit(cityId);

  if (isPending) {
    return <LoadingState label="Loading the Transjakarta snapshot" />;
  }

  if (isError || !data) {
    return (
      <ErrorState
        title="Transit snapshot unavailable"
        description={
          error instanceof Error
            ? error.message
            : 'Run `npm run data:transit` to generate it, then reload.'
        }
      />
    );
  }

  const { manifest, routes, stops } = data;
  const busCount = countSimulatedBuses(routes);
  const withHeadway = routes.filter((route) => route.headwaySec !== null).length;
  const accessibleStops = stops.filter(
    (stop) => stop.wheelchairBoarding === 1,
  ).length;

  return (
    <div className="h-full space-y-3 overflow-y-auto p-3">
      {/*
        The provenance split is the most important thing on this page: the
        schedule is real, the bus positions are not.
      */}
      <Panel>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <ProvenanceBadge provenance="REAL" size="md" />
            <p className="text-xs leading-relaxed text-muted">
              Route identities, corridor geometry, stop positions and service
              headways come from {manifest.agency.name}&rsquo;s published GTFS
              feed.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <ProvenanceBadge provenance="SIMULATED" size="md" />
            <p className="text-xs leading-relaxed text-muted">
              <span className="font-medium text-fg">
                Bus positions are not real.
              </span>{' '}
              Transjakarta publishes no official GTFS-Realtime feed, so no live
              vehicle data exists to show. Buses in the 3D view are spaced along
              each corridor by their route&rsquo;s real headway and advanced at
              an assumed {formatNumber(ASSUMED_BUS_SPEED_MS * 3.6, 0)} km/h
              average service speed.
            </p>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Routes in view"
          envelope={realValue<number>({
            value: routes.length,
            source: SOURCE_TRANSJAKARTA_GTFS,
            measuredAt: manifest.generatedAt,
            note: `of ${formatInteger(manifest.feedTotals.routes)} citywide`,
          })}
          icon={Bus}
          format={(value) => formatInteger(value)}
        />
        <StatTile
          label="Stops in view"
          envelope={realValue<number>({
            value: stops.length,
            source: SOURCE_TRANSJAKARTA_GTFS,
            measuredAt: manifest.generatedAt,
            note: `of ${formatInteger(manifest.feedTotals.stops)} citywide`,
          })}
          icon={MapPin}
          format={(value) => formatInteger(value)}
        />
        <StatTile
          label="Buses animated"
          envelope={simulatedValue<number>({
            value: busCount,
            source: SOURCE_SIMULATION,
            note: 'Spacing derived from real headways',
          })}
          icon={Radio}
          format={(value) => formatInteger(value)}
        />
        <StatTile
          label="Step-free stops"
          envelope={realValue<number>({
            value: accessibleStops,
            source: SOURCE_TRANSJAKARTA_GTFS,
            measuredAt: manifest.generatedAt,
            note: `of ${stops.length} in view, per GTFS`,
          })}
          icon={Accessibility}
          format={(value) => formatInteger(value)}
        />
      </div>

      <Panel flush>
        <PanelHeader
          title="Routes"
          subtitle={`${withHeadway} of ${routes.length} with a published headway`}
          actions={<ProvenanceBadge provenance="REAL" />}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border-subtle">
                <th scope="col" className="panel-heading p-2 text-left">Route</th>
                <th scope="col" className="panel-heading p-2 text-left">Destination</th>
                <th scope="col" className="panel-heading p-2 text-right">Headway</th>
                <th scope="col" className="panel-heading p-2 text-right">In view</th>
                <th scope="col" className="panel-heading p-2 text-right">Stops</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((route) => (
                <tr key={route.id} className="border-b border-border-subtle/60">
                  <td className="p-2">
                    <span className="flex items-center gap-1.5">
                      {/* The route's own GTFS colour, with its name beside it. */}
                      <span
                        className="inline-block h-3 w-1.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: route.colour }}
                        aria-hidden="true"
                      />
                      <span className="readout text-fg">{route.shortName}</span>
                    </span>
                  </td>
                  <td className="p-2 text-muted">{route.longName || '—'}</td>
                  <td
                    className="readout p-2 text-right text-muted"
                    title={
                      route.headwaySamples > 0
                        ? `median of ${route.headwaySamples} published entries`
                        : undefined
                    }
                  >
                    {formatHeadway(route.headwaySec)}
                  </td>
                  <td className="readout p-2 text-right text-muted">
                    {formatNumber(
                      route.fragments.reduce(
                        (sum, fragment) => sum + fragment.lengthM,
                        0,
                      ) / 1000,
                      2,
                    )}{' '}
                    km
                  </td>
                  <td className="readout p-2 text-right text-muted">
                    {route.stopIds.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="p-3 pt-2 text-[11px] leading-snug text-dim">
          Corridors are clipped to the study area, so a city-wide route appears
          only where it passes through. A route that leaves and re-enters is
          drawn as separate fragments rather than one line bridging the gap.
        </p>
      </Panel>

      <Panel flush>
        <PanelHeader title="Feed" subtitle={manifest.agency.name} />
        <dl className="readout grid grid-cols-1 gap-x-6 gap-y-1 p-3 text-[11px] sm:grid-cols-2">
          <div className="flex justify-between gap-2">
            <dt className="text-dim">Snapshot taken</dt>
            <dd className="text-muted">{manifest.generatedAt.slice(0, 10)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-dim">Feed last modified</dt>
            <dd className="text-muted">
              {manifest.feedLastModified ?? 'not reported'}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-dim">Routes in feed</dt>
            <dd className="text-muted">
              {formatInteger(manifest.feedTotals.routes)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-dim">Stops in feed</dt>
            <dd className="text-muted">
              {formatInteger(manifest.feedTotals.stops)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-dim">Shape points</dt>
            <dd className="text-muted">
              {formatInteger(manifest.feedTotals.shapePoints)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-dim">Headway entries</dt>
            <dd className="text-muted">
              {formatInteger(manifest.feedTotals.frequencies)}
            </dd>
          </div>
        </dl>
        <p className="px-3 pb-3 text-[10px] leading-snug text-dim">
          {manifest.source.attribution} ·{' '}
          <a
            href={manifest.agency.url}
            target="_blank"
            rel="noreferrer noopener"
            className="underline decoration-dotted underline-offset-2"
          >
            {manifest.agency.url}
          </a>
          <br />
          {manifest.source.licence}.
        </p>
      </Panel>
    </div>
  );
}
