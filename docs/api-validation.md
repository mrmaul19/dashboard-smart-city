# API validation record

Every external data source was probed before any integration code was written.
All checks below were performed on **2026-11-06**. Re-verify before relying on
a figure, and update this file when a limit or endpoint changes.

## Open-Meteo — weather

| Item | Verified |
|---|---|
| Live probe | `GET /v1/forecast?latitude=-6.2088&longitude=106.8456&current=temperature_2m` → **200** |
| Forecast endpoint | `https://api.open-meteo.com/v1/forecast` |
| Archive endpoint | `https://archive-api.open-meteo.com/v1/archive` (separate host, ERA5 from 1940) |
| API key | Not required. `apikey` is for commercial customer endpoints only |
| Free limits | **< 10,000/day, 5,000/hour, 600/min, 300,000/month** |
| Rate limiting | Applied by **IP address and application** |
| Licence | **CC-BY 4.0** |
| Attribution | A link is required next to any display of the data: `Weather data by Open-Meteo.com` |
| Commercial use | Ads or subscriptions make use commercial, which requires a paid plan |

Variable names: `temperature_2m`, `relative_humidity_2m`, `wind_speed_10m`,
`wind_direction_10m`, `precipitation`, `weather_code`. Daily adds
`temperature_2m_max`/`_min`, `precipitation_sum`, `wind_direction_10m_dominant`.
`past_days` 0–92, `forecast_days` 0–16 (default 7).

> **`daily` requires `timezone`.** Requests that omit it fail.

## OpenAQ v3 — air quality

| Item | Verified |
|---|---|
| Live probe without a key | **401** `"A valid API key must be provided in the X-API-Key header."` |
| Auth | `X-API-Key` header, mandatory. Register at `explore.openaq.org/register` |
| Limits | **60/min, 2,000/hour**, scoped to the key. No daily limit documented |
| Over limit | **429**; repeated overuse can lead to a temporary or permanent ban |
| Headers | `x-ratelimit-used`, `-remaining`, `-limit`, `-reset` |
| Discovery | `GET /v3/locations?coordinates=<lat,lon>&radius=<m>` — radius **max 25,000 m** |
| History | `GET /v3/sensors/{id}/hours` (hourly means), `/days`, `/measurements` (`date_from`/`date_to`) |

Pollutant parameter ids and units: `pm10` 1 (µg/m³), `pm25` 2 (µg/m³),
`no2` 7 (ppm), `co` 8 (ppm), `so2` 9 (ppm), `o3` 10 (ppm).

Two consequences that shape the integration:

1. **`/v3/locations/{id}/latest` returns no unit and no parameter name** — only
   `sensorsId`, `value`, `datetime`, `coordinates`. Readings must be joined
   against the location's `sensors[]` to be interpretable. A sensor-id →
   parameter map is mandatory, not an optimisation.
2. The docs state that *"the latest value does not represent the most recent
   measurement ingested"*, so measurement age must always be displayed.
3. `bbox` cannot be combined with `coordinates`/`radius` → **422**.

Attribution is **per station**: each location carries
`licenses[].attribution{name,url}`, which must be surfaced in the UI.

## OpenStreetMap / Overpass — geometry

**Overpass was unreachable from the development machine on 2026-11-06**, from
two independent network paths:

| Endpoint | Result |
|---|---|
| `overpass-api.de/api/interpreter` | TCP connect failure (DNS resolved) |
| `overpass.private.coffee` | timeout |
| `overpass.kumi.systems` | timeout |
| `maps.mail.ru/osm/tools/overpass` | **504** |
| `openstreetmap.org` (control) | **200** |

Documented Overpass policy, for when it is reachable: ≤ 10,000 queries/day
**and** < 1 GB/day **and** ≤ 10 min total processing time; default 180 s query
timeout and 512 MiB memory; **429 → pause 30 s before retrying**; 504 when a
query exceeds its resource allowance; a distinctive `User-Agent` is required;
no parallel scripts. Licence: **ODbL 1.0**, attribution
`© OpenStreetMap contributors`.

This is why geometry is baked into a committed snapshot rather than fetched at
request time — see `scripts/fetch-city-data.ts` (phase 2).

### Measured sample, central Jakarta

`GET api.openstreetmap.org/api/0.6/map?bbox=106.8406,-6.2138,106.8506,-6.2038`
→ **200, 8.8 MB XML** over a 1.11 × 1.11 km box:

| Quantity | Count |
|---|---|
| Building ways | **4,986** |
| `highway` ways | 583 |
| Nodes | 26,226 |
| Buildings with `building:levels` | **71 (1.4 %)** |
| Buildings with `height` | **2 (0.04 %)** |
| `amenity` | 79 |
| `leisure` | 6 |

**Real building heights for Jakarta effectively do not exist in OSM.** Heights
are therefore derived (`building:levels × 3.2 m`, else a heuristic from the
building type and footprint area) and classified `STATIC`, never `REAL`.

The OSM main `/map` API is officially **not** for bulk download. It is used
only as a one-off development fallback for this small study area while Overpass
is unreachable; Overpass remains the primary snapshot source.

## Transjakarta — public transport

| Item | Verified |
|---|---|
| Static GTFS | `https://gtfs.transjakarta.co.id/files/file_gtfs.zip` → **200, 2,499,740 bytes** |
| Freshness | `Last-Modified` was the same day the feed was probed — actively regenerated |
| Agency | `PT Transportasi Jakarta` (`Tije`), `Asia/Jakarta` |
| GTFS-Realtime | **No official feed exists** |

Feed contents: **241 routes, 8,143 stops**, 694 trips, 747 `frequencies` rows
(headway-based service), 244,346 shape points, 25,701 stop times. Includes
`wheelchair_boarding` and fare tables.

Third parties report an undocumented anonymous MQTT feed
(`wss://mqtt.tj.co.id:8084/mqtt`) and a `tijeapi.transjakarta.co.id` host
(which returned **404** at its root). Neither is documented and neither has
stated terms of use, so **both are excluded**. Bus motion is animated along
real `shapes.txt` geometry at real headways and labelled `SIMULATED`.

## Traffic

No free, open, real-time congestion feed exists for Jakarta. TomTom, HERE and
Google traffic are paid and licence-restricted; OpenStreetMap carries no
congestion data. `data.jakarta.go.id` and `satudata.jakarta.go.id` both respond
(**200**) and are worth mining for static datasets in phase 5, but neither
exposes a documented real-time traffic API.

Traffic is therefore **simulated** on the real OSM road graph and labelled
`SIMULATED` everywhere it appears.

## Correction — Overpass is reachable (2026-11-06, later same day)

The connection failures recorded above were **transient**. On a later attempt
the same day, a single Overpass query for the full 1.5 x 1.5 km study area
succeeded against `https://overpass-api.de/api/interpreter` on the first try:

| Result | Value |
|---|---|
| Requests | 1 |
| Ways returned | 9,150 |
| Tagged nodes returned | 87 |
| Buildings after processing | 8,119 |
| Roads | 750 |
| Green and water areas | 17 |
| Facilities | 138 |

So `overpass-api.de` is not blocked on this network; it is intermittently
unavailable, which is consistent with its own documentation describing the
public instances as overloaded. The practical conclusions are unchanged and in
fact reinforced: the generator keeps its mirror list and its 30 s backoff on
429/504, and the committed snapshot means a transient outage can never affect
the deployed application.

### Height tag coverage, measured over the generated snapshot

| Source | Buildings | Share |
|---|---|---|
| `height` tag | 1 | 0.01% |
| `building:levels` | 128 | 1.6% |
| Derived heuristically | 7,990 | 98.4% |

98.2% of footprints (7,968 of 8,119) carry nothing but `building=yes`. This
confirms the earlier sample and is why heights are classified `STATIC` and the
heuristic keys off footprint area rather than the building value.

## Open-Meteo integration, as built (phase 3)

Verified live against the running route on 2026-11-06:

| Check | Result |
|---|---|
| `GET /api/weather` | 200, all eight current fields `REAL` |
| Sample reading | 26.8 °C, 82% RH, 2.9 km/h, WMO code 51 (light drizzle), `is_day` false |
| Series returned | 192 hourly points, 8 daily points (`past_days=1`, `forecast_days=7`) |
| Measurement timestamp | Converted from Open-Meteo local time to a true UTC instant |
| Invalid coordinates | 400 with a structured error body |
| Repeat requests | ~29 ms, served from Next's data cache rather than upstream |
| Response header | `public, s-maxage=600, stale-while-revalidate=1800` |

### Coordinates are snapped to the model grid

Open-Meteo resolved the requested `-6.2088, 106.8456` to **`-6.2214, 106.8562`**,
about 2 km away, and reported an elevation of 12 m. These are forecast-model
grid values, not a station reading. The weather view discloses the requested
point, the resolved point and the elevation side by side rather than implying
the numbers describe the exact requested coordinate.

### Quota arithmetic

The route caches for 10 minutes and the CDN is told the same, so total upstream
usage is roughly **144 calls/day regardless of visitor count** — against a free
allowance of 10,000/day, 5,000/hour and 600/minute, which the provider applies
per IP address and application. Calling the API directly from the browser would
instead have spent one call per visitor per load.

## OpenAQ and the AQI, as built (phase 4)

### AQI standard, transcribed from source

The index is computed from the EPA **"Technical Assistance Document for the
Reporting of Daily Air Quality – the Air Quality Index (AQI)", updated May
2026**, Table 6 and Equation 1. Figures were read out of the published document
rather than recalled.

- **PM2.5 breakpoints are the revised values**: the Good category ends at
  **9.0 µg/m³**, not the older 12.0.
- Truncation before calculation, per the document: O₃ to 3 decimals, PM2.5 to 1,
  CO to 1, and PM10, SO₂, NO₂ to integers. Truncation, not rounding.
- Equation 1: `Ip = (IHi − ILo)/(BPHi − BPLo) × (Cp − BPLo) + ILo`, then rounded
  to the nearest integer.
- **PM NowCast** (same method for PM2.5 and PM10): over the last 12 hours, take
  `weight = 1 − (max − min)/max`, clamped to a floor of 0.5; weight each hour by
  `weight^hoursAgo`; divide by the sum of the weights used. **At least 2 of the
  most recent 3 hours must be valid**, or no NowCast is reported.
- The **ozone NowCast uses a different method** (a two-week rolling relationship
  between 1-hour and 8-hour values, published only as a paper plus R code). It is
  **not implemented**; O₃ uses a plain 8-hour mean, and the UI names the window.

Averaging windows used: PM2.5 and PM10 NowCast, O₃ and CO 8-hour mean, NO₂ and
SO₂ most recent hour.

Verified by 60 headless checks, including the document's own worked examples:

| EPA worked example | Expected | Result |
|---|---|---|
| O₃ 0.07853333 ppm → truncate 0.078 | AQI 126 | **126** |
| PM2.5 35.9 µg/m³ | AQI 102 | **102** |
| CO 8.4 ppm | AQI 90 | **90** |

Plus every category boundary, every breakpoint edge, truncation behaviour, the
NowCast weight floor and completeness rule, and unit conversion.

### Deliberate refusals to compute

| Situation | Behaviour |
|---|---|
| Concentration above the top documented breakpoint | Category Hazardous, **no index value** — the AQI-500 anchor concentrations for PM2.5/PM10 could not be read from the source, so they are not guessed |
| SO₂ above 304 ppb | No index: above that point the standard is defined on the 24-hour average, which is not available |
| A gas reported in µg/m³ | Excluded from the AQI — converting to ppb needs the temperature and pressure at the sensor |
| Fewer than 2 of the last 3 hours | No NowCast |
| Fewer than 6 of the last 8 hours | No 8-hour mean |

Each exclusion is listed in the UI with its reason, so the basis of the index is
never silently narrowed.

### Known limitation: the official AQI colours fail a colour-vision check

Running the EPA hue sequence through the project's palette validator against the
dark panel surface **fails** the categorical adjacency checks: yellow↔orange
separate by only ΔE 4.4 under simulated deuteranopia, and orange↔red by ΔE 9.9
even with normal colour vision, against a floor of 15. This is a property of the
standard's hue order, not of the particular steps chosen.

The official hues were kept anyway, because recolouring a recognised
public-health scale would make the dashboard disagree with every official
source. The mitigation is a hard rule: **the numeric index and the category name
are always rendered alongside the colour**, so colour is never the only channel.

### Route behaviour, verified live

| Check | Result |
|---|---|
| No `OPENAQ_API_KEY` | **200** with `keyConfigured: false` and every value UNAVAILABLE, naming the remedy; `Cache-Control: no-store` |
| Invalid key | **401**, "Check OPENAQ_API_KEY in .env.local" |
| `radius=99999` | **400** (above the API's 25,000 m maximum) |
| `lat=200` | **400** |
| Key present and valid | Not yet verified — no key available in this environment |

The 401 confirms `api.openaq.org` is reachable from this machine, so the only
thing missing is a key.

### Request budget

Per 15-minute cache window: one `/locations` call, one `/locations/{id}/latest`
call, and at most one `/sensors/{id}/hours` call per AQI-eligible pollutant at
the chosen station — eight upstream requests at worst, roughly **32 per hour**
against the documented 60/minute and 2,000/hour allowance.

### Station coverage for Jakarta is still unverified

Whether any OpenAQ station reports within 25 km of central Jakarta cannot be
established without a key. If none does, the feature correctly reports
"No monitoring stations in range" and every pollutant stays UNAVAILABLE.

## Transjakarta GTFS, as built (phase 5)

The feed is parsed at build time by `npm run data:transit`. No dependency was
added for it: the ZIP is read with a small central-directory reader over
`node:zlib`, and the CSV with an RFC 4180 parser — needed because stop names in
this feed contain commas, which a `split(',')` would silently shift.

Verified against the live feed on 2026-11-07:

| Quantity | In the feed | Inside the 1.5 km study area |
|---|---|---|
| Routes | 241 | **13** |
| Stops | 8,143 | **34** |
| Trips | 694 | — |
| Shape points | 244,346 | 24 corridor fragments |
| Frequency entries | 747 | all 13 routes have a headway |

Snapshot size: 28 KB. `Last-Modified` on the feed was the same day it was
fetched, confirming the operator regenerates it frequently.

Sample of the real data recovered: route `4` (Pulo Gadung–Galunggung) at a
1,200 s headway, `JAK.10A` (Gondangdia–Cikini) at 360 s, `B25`
(Bekasi–Dukuh Atas) at 1,113 s, with the operator's own route colours.

### Provenance split for transport

| Element | Class |
|---|---|
| Route identity, colour, corridor geometry | REAL |
| Stop positions and accessibility flags | REAL |
| Service headways from `frequencies.txt` | REAL |
| **Where a bus is right now** | **SIMULATED** |

Transjakarta publishes no official GTFS-Realtime feed, so live positions do not
exist to show. Buses are spaced along each corridor by the route's real headway
and advanced at an assumed 20 km/h average service speed — the single invented
quantity, stated in the UI beside the bus count.

The undocumented MQTT endpoint reported by third parties remains excluded: no
documentation, no terms of use.

## Traffic simulation (phase 5)

No free, open, real-time congestion source exists for Jakarta, so traffic is
simulated on the real road network and labelled SIMULATED on every surface.

Graph built from the OSM snapshot, measured:

| Quantity | Value |
|---|---|
| Road ways in snapshot | 750 |
| Drivable edges after splitting at junctions | **867** |
| Graph nodes | 950 |
| Total network length | **64.76 km** |
| One-way edges | 188 (22%) |
| Edges reaching a junction | **83%** |

Two problems were found by measuring rather than by looking:

1. **Junctions were being missed.** Building nodes only where way *endpoints*
   coincide left 31% of edges as stubs, where vehicles bounced back and forth
   instead of turning. Splitting each way at any vertex shared with another way
   raised junction connectivity from 69% to 83%.
2. **The density slider did nothing above 50%.** The per-kilometre vehicle rate
   saturated the 1,400-vehicle cap at density 0.5. Retuned so density 1.0 lands
   at the cap: 0.5 now gives 712 vehicles and 1.0 gives 1,400.

Verified by 20 headless checks: vehicles never leave the network or produce a
non-finite position over 60 simulated seconds, the fleet count is conserved,
one-way restrictions hold, `pointOnEdge` stays inside each edge's bounds in both
directions and clamps out-of-range distances, congestion stays within 0..1 and
rises with density (0.327 at density 0.1 against 0.555 at 1.0), identical seeds
produce identical output, and a 600-second frame delta is clamped rather than
teleporting vehicles.

Congestion is emergent, not scripted: vehicles slow where they are dense, which
makes them denser still.
