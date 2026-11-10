'use client';

import {
  Bus,
  Car,
  Clock,
  Droplets,
  MapPinned,
  Ruler,
  Thermometer,
  Wind,
} from 'lucide-react';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { StatTile } from '@/components/ui/stat-tile';
import { cityBBox, DEFAULT_CITY } from '@/lib/constants/cities';
import {
  SOURCE_APP_CONFIG,
  SOURCE_OPENAQ,
  SOURCE_OPEN_METEO,
  SOURCE_OSM,
  SOURCE_SIMULATION,
  SOURCE_TRANSJAKARTA_GTFS,
} from '@/lib/constants/data-sources';
import { formatCoordinates, formatNumber } from '@/lib/utils/format';
import {
  realValue,
  simulatedValue,
  staticValue,
  unavailableValue,
} from '@/types/data-envelope';
import { useWeather } from '@/features/weather/hooks/use-weather';
import { useAirQuality } from '@/features/air-quality/hooks/use-air-quality';
import { useTransit } from '@/features/transportation/hooks/use-transit';
import { WeatherAttribution } from '@/features/weather/components/weather-attribution';
import { useCityManifest } from '@/features/city/hooks/use-city-data';
import { useCityStore } from '@/stores/city-store';

const city = DEFAULT_CITY;
const bbox = cityBBox(city);
const sideKm = (city.extentM * 2) / 1000;

/**
 * Overview view.
 *
 * Tiles whose source is wired up show live values; the rest stay explicitly
 * UNAVAILABLE with the reason attached. That mix is the data-integrity rule
 * from spec §11 working as intended: the dashboard would rather show a dash
 * and name the missing source than display a plausible-looking number.
 */
export function OverviewView() {
  const { data: weather, isError: weatherFailed } = useWeather();
  const { data: manifest } = useCityManifest(city.id);
  const { data: air, isError: airFailed } = useAirQuality();
  const { data: transit } = useTransit(city.id);
  const trafficDensity = useCityStore((s) => s.trafficDensity);

  // Envelopes arrive from the route already classified, so the live value is
  // passed through untouched; only the absent case is constructed here.
  const temperature =
    weather?.current.temperatureC ??
    unavailableValue<number>({
      source: SOURCE_OPEN_METEO,
      unit: '°C',
      note: weatherFailed
        ? 'Open-Meteo could not be reached.'
        : 'Loading live weather…',
    });

  const humidity =
    weather?.current.humidityPct ??
    unavailableValue<number>({
      source: SOURCE_OPEN_METEO,
      unit: '%',
      note: weatherFailed
        ? 'Open-Meteo could not be reached.'
        : 'Loading live weather…',
    });

  // Comes from the nearest OpenAQ station, already classified by the route.
  const pm25 =
    air?.readings.pm25 ??
    unavailableValue<number>({
      source: SOURCE_OPENAQ,
      unit: 'µg/m³',
      note:
        air && !air.keyConfigured
          ? 'OPENAQ_API_KEY is not configured.'
          : airFailed
            ? 'OpenAQ could not be reached.'
            : air && air.stationCount === 0
              ? `No monitoring station within ${Math.round(air.searchRadiusM / 1000)} km.`
              : 'Loading station data…',
    });

  // The simulation's own density setting, which is what the 3D scene runs at.
  const trafficDensityValue = simulatedValue<number>({
    value: Math.round(trafficDensity * 100),
    source: SOURCE_SIMULATION,
    unit: '%',
    note: 'Simulation setting, not measured congestion',
  });

  const busRoutes =
    transit === undefined
      ? unavailableValue<number>({
          source: SOURCE_TRANSJAKARTA_GTFS,
          note: 'Loading the transit snapshot…',
        })
      : realValue<number>({
          value: transit.routes.length,
          source: SOURCE_TRANSJAKARTA_GTFS,
          measuredAt: transit.manifest.generatedAt,
          note: 'Routes passing through the study area',
        });

  // Counts come from the committed snapshot's manifest, so this is real OSM
  // data rather than configuration.
  const buildings =
    manifest === undefined
      ? unavailableValue<number>({
          source: SOURCE_OSM,
          note: 'Loading the geometry snapshot…',
        })
      : realValue<number>({
          value: manifest.counts.buildings,
          source: SOURCE_OSM,
          measuredAt: manifest.generatedAt,
          note: 'Footprints in the committed snapshot',
        });

  const studyArea = staticValue<number>({
    value: sideKm * sideKm,
    source: SOURCE_APP_CONFIG,
    unit: 'km²',
    note: `${formatNumber(sideKm, 1)} × ${formatNumber(sideKm, 1)} km study area`,
  });

  const centre = staticValue<string>({
    value: formatCoordinates(city.center.lat, city.center.lon),
    source: SOURCE_APP_CONFIG,
  });

  const timezone = staticValue<string>({
    value: city.timezone,
    source: SOURCE_APP_CONFIG,
  });

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <Panel flush>
        <PanelHeader
          title="City status"
          subtitle={`${city.name}, ${city.country}`}
        />
        <div className="grid grid-cols-2 gap-3 p-3 lg:grid-cols-4">
          <StatTile
            label="Air temperature"
            envelope={temperature}
            icon={Thermometer}
            format={(v) => formatNumber(v, 1)}
          />
          <StatTile
            label="Relative humidity"
            envelope={humidity}
            icon={Droplets}
            format={(v) => formatNumber(v, 0)}
          />
          <StatTile
            label="PM2.5 concentration"
            envelope={pm25}
            icon={Wind}
            format={(v) => formatNumber(v, 1)}
            deltaGoodDirection="down"
          />
          <StatTile
            label="Traffic density"
            envelope={trafficDensityValue}
            icon={Car}
            format={(v) => formatNumber(v, 0)}
            deltaGoodDirection="down"
          />
          <StatTile
            label="Transjakarta routes"
            envelope={busRoutes}
            icon={Bus}
            format={(v) => String(v)}
          />
        </div>
      </Panel>

      <Panel flush>
        <PanelHeader title="Study area" subtitle="Static configuration" />
        <div className="grid grid-cols-2 gap-3 p-3 lg:grid-cols-4">
          <StatTile
            label="Area covered"
            envelope={studyArea}
            icon={Ruler}
            format={(v) => formatNumber(v, 2)}
          />
          <StatTile
            label="Projection origin"
            envelope={centre}
            icon={MapPinned}
          />
          <StatTile label="Time zone" envelope={timezone} icon={Clock} />
          <StatTile
            label="Building footprints"
            envelope={buildings}
            icon={MapPinned}
          />
        </div>
      </Panel>

      <Panel flush>
        <PanelHeader title="Bounding box" subtitle="Derived from centre and extent" />
        <dl className="readout grid grid-cols-2 gap-x-6 gap-y-1 p-3 text-[11px] sm:grid-cols-4">
          {[
            ['South', bbox.minLat],
            ['West', bbox.minLon],
            ['North', bbox.maxLat],
            ['East', bbox.maxLon],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex justify-between gap-2">
              <dt className="text-dim">{label}</dt>
              <dd className="text-muted">{(value as number).toFixed(5)}°</dd>
            </div>
          ))}
        </dl>
      </Panel>

      {/* Required because this view displays Open-Meteo values. */}
      <div className="flex justify-end pb-1">
        <WeatherAttribution />
      </div>
    </div>
  );
}
