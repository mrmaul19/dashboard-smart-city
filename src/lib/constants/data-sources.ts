import type { DataSourceRef } from '@/types/data-envelope';

/**
 * Registry of every data source this application is allowed to attribute a
 * value to. Licence strings were verified against the providers' own pages on
 * 2026-11-06; see `docs/api-validation.md` for the full validation record.
 */

/**
 * Open-Meteo requires a visible link next to any display of its data under
 * CC-BY 4.0. `<WeatherAttribution />` renders it; do not remove it.
 */
export const SOURCE_OPEN_METEO: DataSourceRef = {
  name: 'Open-Meteo',
  url: 'https://open-meteo.com/',
  licence: 'CC-BY 4.0',
  attribution: 'Weather data by Open-Meteo.com',
};

export const SOURCE_OPEN_METEO_ARCHIVE: DataSourceRef = {
  name: 'Open-Meteo Historical (ERA5)',
  url: 'https://open-meteo.com/en/docs/historical-weather-api',
  licence: 'CC-BY 4.0',
  attribution: 'Weather data by Open-Meteo.com',
};

/**
 * OpenAQ aggregates third-party monitoring networks, so the binding attribution
 * is the per-location `licenses[].attribution` returned with each station. The
 * value here is only the fallback when a station reports none.
 */
export const SOURCE_OPENAQ: DataSourceRef = {
  name: 'OpenAQ',
  url: 'https://openaq.org/',
  licence: 'Per-station licence (see station attribution)',
};

export const SOURCE_OSM: DataSourceRef = {
  name: 'OpenStreetMap',
  url: 'https://www.openstreetmap.org/copyright',
  licence: 'ODbL 1.0',
  attribution: '© OpenStreetMap contributors',
};

export const SOURCE_TRANSJAKARTA_GTFS: DataSourceRef = {
  name: 'Transjakarta GTFS',
  url: 'https://transjakarta.co.id/',
  licence: 'Published openly by the operator; no explicit licence stated',
  attribution: 'Schedule data: PT Transportasi Jakarta',
};

/**
 * Used for every value the simulation engine produces. Having a named "source"
 * for simulated data keeps the envelope contract uniform, so a simulated series
 * can never be rendered without its SIMULATED badge.
 */
export const SOURCE_SIMULATION: DataSourceRef = {
  name: 'Simulation engine (this application)',
  url: '/about/data-sources',
  licence: 'Not a measurement — generated locally',
};

export const SOURCE_APP_CONFIG: DataSourceRef = {
  name: 'Application configuration',
  url: '/about/data-sources',
  licence: 'Static project configuration',
};
