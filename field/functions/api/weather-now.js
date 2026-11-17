// Cloudflare Pages Function — /api/weather-now
// Current conditions for a PF job site, to auto-fill the Daily Report.
//
// FLOW:
//   1. Client sends GET ?job=26-001&date=2026-11-17 (date optional; assumed today).
//   2. Server verifies the requested date IS today in America/Indiana/Indianapolis.
//      Any other date → 200 {status:'not_today'}.
//   3. Looks up precomputed lat/lon from job-coords.js.
//      No coords → 200 {status:'no_location'}.
//   4. KV cache check (~30 min TTL). Cache hit → return cached.
//   5. NWS /points/{lat},{lon} → properties.observationStations URL
//      → GET stations list → first station ID
//      → GET /observations/latest.
//   6. Parse: temperature (C→F, rounded), textDescription, mapped dropdown
//      value (Clear/Cloudy/Rain/Fog/Snow or ''), station id/name, timestamp.
//   7. If observation temp is null OR observation is stale (>2 h old):
//      fall back to today's forecast high (from the existing forecast logic),
//      set source:'forecast'. If the forecast also fails → {status:'unavailable'}.
//   8. Cache result in KV under "weather-now:v1:{job}" for ~30 min.
//   9. Return {status:'ok', tempF, textDescription, condition, stationId,
//              stationName, observedAt, source, job, name, cached}.
//
// SECURITY:
//   - Auth: field_ops area. areaForPath maps /api/weather* → field_ops so this
//     path is covered without touching auth.js. Handler also calls requireArea.
//   - Fail CLOSED: any upstream error → {status:'unavailable'} with zero internals.
//   - KV key is server-constructed (never from client).
//   - No financials, no PII.
//   - User-Agent includes peter@pierfoundations.com (NWS requirement).

import { requireArea }   from '../lib/auth.js';
import { FO_PROJECTS }   from '../lib/fo-projects-data.js';
import { JOB_COORDS }    from '../lib/job-coords.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const NWS_UA       = 'PF-Field-Portal/1.0 (peter@pierfoundations.com)';
const KV_TTL_SECS  = 1800;  // ~30 min
const KV_PREFIX    = 'weather-now:v1:';
const OBS_STALE_MS = 2 * 60 * 60 * 1000;  // 2 hours
const LOCAL_TZ     = 'America/Indiana/Indianapolis';

// Return today's date string (YYYY-MM-DD) in Indianapolis local time.
export function todayIndy() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LOCAL_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  return parts.map(p => p.value).join('');  // en-CA gives YYYY-MM-DD natively
}

// Convert Celsius to Fahrenheit, round to nearest integer.
export function celsiusToF(c) {
  return Math.round(c * 9 / 5 + 32);
}

// Map an NWS textDescription to one of the dropdown options.
// Returns '' when nothing matches (leave the dropdown alone).
export function mapCondition(text) {
  if (!text || typeof text !== 'string') return '';
  const t = text.toLowerCase();
  if (/snow|flurr|blizzard|wintry|sleet|freezing rain|ice pellet|ice crystal/.test(t)) return 'Snow';
  if (/fog|mist|haze|smoke|dust/.test(t)) return 'Fog';
  if (/thunder|storm|rain|shower|drizzle|sprinkle|precipitation/.test(t)) return 'Rain';
  if (/cloud|overcast/.test(t)) return 'Cloudy';
  if (/clear|sunny|fair|fine/.test(t)) return 'Clear';
  return '';
}

// Build the KV cache key for a job number. Pure function, testable.
export function cacheKey(jobNumber) {
  return KV_PREFIX + jobNumber;
}

// Fetch the latest observation from NWS for given lat/lon.
// Returns { tempC, textDescription, stationId, stationName, timestamp } or null.
// FAIL CLOSED: any error → null (caller returns unavailable).
async function fetchNwsObservation(lat, lon) {
  const pointsUrl = `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`;
  try {
    const ptResp = await fetch(pointsUrl, {
      headers: { 'User-Agent': NWS_UA, 'Accept': 'application/geo+json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!ptResp.ok) return null;
    const ptData = await ptResp.json();

    // observationStations is a URL returning a GeoJSON FeatureCollection
    const stationsUrl = ptData?.properties?.observationStations;
    if (!stationsUrl || typeof stationsUrl !== 'string') return null;

    const stResp = await fetch(stationsUrl, {
      headers: { 'User-Agent': NWS_UA, 'Accept': 'application/geo+json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!stResp.ok) return null;
    const stData = await stResp.json();

    // First feature is the nearest station
    const features = stData?.features;
    if (!Array.isArray(features) || features.length === 0) return null;
    const firstStation = features[0];
    const stationId   = firstStation?.properties?.stationIdentifier;
    const stationName = firstStation?.properties?.name;
    if (!stationId) return null;

    const obsUrl = `https://api.weather.gov/stations/${stationId}/observations/latest`;
    const obsResp = await fetch(obsUrl, {
      headers: { 'User-Agent': NWS_UA, 'Accept': 'application/geo+json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!obsResp.ok) return null;
    const obsData = await obsResp.json();

    const props = obsData?.properties;
    if (!props) return null;

    const tempC     = props.temperature?.value ?? null;   // may be null
    const desc      = props.textDescription ?? null;
    const timestamp = props.timestamp ?? null;

    return { tempC, textDescription: desc, stationId, stationName, timestamp };
  } catch {
    return null;
  }
}

// Fetch today's forecast high for a lat/lon. Returns { tempF, shortForecast } or null.
// Replicates the core of weather.js parseForecast for the first daytime period today.
async function fetchTodayForecastHigh(lat, lon) {
  const pointsUrl = `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`;
  try {
    const ptResp = await fetch(pointsUrl, {
      headers: { 'User-Agent': NWS_UA, 'Accept': 'application/geo+json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!ptResp.ok) return null;
    const ptData = await ptResp.json();
    const forecastUrl = ptData?.properties?.forecast;
    if (!forecastUrl || typeof forecastUrl !== 'string') return null;

    const fcResp = await fetch(forecastUrl, {
      headers: { 'User-Agent': NWS_UA, 'Accept': 'application/geo+json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!fcResp.ok) return null;
    const fcData = await fcResp.json();
    const periods = fcData?.properties?.periods;
    if (!Array.isArray(periods) || periods.length === 0) return null;

    // First daytime period
    const daytime = periods.find(p => p.isDaytime);
    if (!daytime) return null;

    // NWS forecast temps are in Fahrenheit by default
    const tempF = typeof daytime.temperature === 'number' ? daytime.temperature : null;
    return { tempF, shortForecast: daytime.shortForecast ?? '' };
  } catch {
    return null;
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  // Auth gate
  const authErr = requireArea(context.data?.session, 'field_ops');
  if (authErr) return authErr;

  // Parse job + optional date from GET query string
  if (request.method !== 'GET') {
    return json({ status: 'error', message: 'Method not allowed.' }, 405);
  }

  const url = new URL(request.url);
  const jobNumber = String(url.searchParams.get('job') || '').trim();
  const dateParam = String(url.searchParams.get('date') || '').trim();

  if (!jobNumber) {
    return json({ status: 'error', message: 'Missing job parameter.' }, 400);
  }

  // Only serve current conditions for TODAY in Indianapolis local time.
  const today = todayIndy();
  if (dateParam && dateParam !== today) {
    return json({ status: 'not_today' });
  }

  // Validate job number
  const project = FO_PROJECTS.find(p => p.number === jobNumber);
  if (!project) {
    return json({ status: 'error', message: 'Unknown job number.' }, 400);
  }

  // Look up precomputed coordinates
  const coords = JOB_COORDS[jobNumber] || null;
  if (!coords) {
    return json({ status: 'no_location', job: project.number, name: project.name });
  }

  // KV cache check
  const key = cacheKey(jobNumber);
  if (env.PF_SCHEDULE) {
    try {
      const cached = await env.PF_SCHEDULE.get(key, { type: 'json' });
      if (cached) {
        return json({ status: 'ok', ...cached, job: project.number, name: project.name, cached: true });
      }
    } catch { /* ignore cache read errors */ }
  }

  // Fetch live observation
  const obs = await fetchNwsObservation(coords.lat, coords.lon);

  // Determine whether the observation is usable:
  //   - obs must be non-null
  //   - tempC must be non-null
  //   - observation must not be stale (>2 h old)
  let payload = null;

  if (obs && obs.tempC !== null && obs.timestamp) {
    const age = Date.now() - new Date(obs.timestamp).getTime();
    if (age <= OBS_STALE_MS) {
      payload = {
        tempF: celsiusToF(obs.tempC),
        textDescription: obs.textDescription ?? '',
        condition: mapCondition(obs.textDescription),
        stationId: obs.stationId,
        stationName: obs.stationName,
        observedAt: obs.timestamp,
        source: 'observation',
      };
    }
  }

  // Fall back to today's forecast high if observation is unavailable/stale
  if (!payload) {
    const fc = await fetchTodayForecastHigh(coords.lat, coords.lon);
    if (!fc || fc.tempF === null) {
      // Both upstream sources failed — fail closed, no internals exposed
      return json({ status: 'unavailable', job: project.number, name: project.name });
    }
    payload = {
      tempF: fc.tempF,
      textDescription: fc.shortForecast,
      condition: mapCondition(fc.shortForecast),
      stationId: null,
      stationName: null,
      observedAt: null,
      source: 'forecast',
    };
  }

  // Cache in KV
  if (env.PF_SCHEDULE) {
    try {
      await env.PF_SCHEDULE.put(key, JSON.stringify(payload), { expirationTtl: KV_TTL_SECS });
    } catch { /* ignore cache write errors */ }
  }

  return json({ status: 'ok', ...payload, job: project.number, name: project.name, cached: false });
}
