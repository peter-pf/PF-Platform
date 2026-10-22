// Cloudflare Pages Function — /api/weather
// 3-day NWS forecast for a PF job site.
//
// FLOW:
//   1. Client sends GET ?job=26-001 (or POST {job: "26-001"}).
//   2. Server looks up precomputed lat/lon from job-coords.js.
//      No coords → 200 {status:'no_location', message:'No site location on file for this job.'}.
//   3. Calls NWS /points/{lat},{lon} → gets forecastUrl → 3-day forecast
//      (high/low, short text, precip chance).
//      NWS fail → 200 {status:'unavailable', message:'Weather unavailable right now.'}.
//   4. Caches result in KV under "weather:v1:{jobNumber}" for ~60 minutes.
//   5. Returns {status:'ok', forecast:[...], asOf, job, name, cached}.
//
// WHY precomputed coords (not runtime geocoding):
//   The US Census Geocoder and Nominatim both block or rate-limit Cloudflare IPs.
//   Coordinates are precomputed offline (field/scripts/geocode-job-coords.py) and
//   bundled at deploy time. To add/refresh coords for new jobs, re-run that script
//   and redeploy. Hook: build-fo-projects-field.py can call the script at the end
//   of its run so both files stay in sync.
//
// SECURITY:
//   - Auth: field_ops area (set in areaForPath + verified in handler).
//   - Fails CLOSED: any upstream error → generic "unavailable" message.
//   - KV key is server-constructed (never from client).
//   - No financials, no PII exposed.
//   - User-Agent includes peter@pierfoundations.com (NWS requirement).

import { requireArea } from '../lib/auth.js';
import { FO_PROJECTS } from '../lib/fo-projects-data.js';
import { JOB_COORDS } from '../lib/job-coords.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const NWS_UA = 'PF-Field-Portal/1.0 (peter@pierfoundations.com)';
const KV_TTL_SECONDS = 3600; // ~60 minutes
const KV_PREFIX = 'weather:v1:';

// Parse forecast periods into 3-day summary {name, high, low, unit, shortForecast, precipChance}.
// NWS periods alternate daytime/nighttime. We take up to 3 daytime periods.
function parseForecast(periods) {
  const days = [];
  for (const period of periods) {
    if (!period.isDaytime) continue;
    const precip = period.probabilityOfPrecipitation?.value ?? null;
    days.push({
      name: period.name,
      high: period.temperature,
      low: null, // filled below from the next nighttime period
      unit: period.temperatureUnit,
      shortForecast: period.shortForecast,
      precipChance: precip !== null ? Math.round(precip) : null,
    });
    if (days.length === 3) break;
  }
  // Fill lows from the following nighttime period
  for (let i = 0; i < days.length; i++) {
    const dayIdx = periods.findIndex(p => p.isDaytime && p.name === days[i].name);
    if (dayIdx >= 0 && dayIdx + 1 < periods.length && !periods[dayIdx + 1].isDaytime) {
      days[i].low = periods[dayIdx + 1].temperature;
    }
  }
  return days;
}

// Fetch NWS 3-day forecast for precomputed lat/lon. Returns {forecast, asOf} or null.
async function fetchNwsForecast(lat, lon) {
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

    const forecast = parseForecast(periods);
    const asOf = new Date().toISOString();
    return { forecast, asOf };
  } catch {
    return null;
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  // Auth gate (requireArea returns a Response on failure, null on success)
  const authErr = requireArea(context.data?.session, 'field_ops');
  if (authErr) return authErr;

  // Parse job number from GET query or POST body
  let jobNumber = null;
  if (request.method === 'GET') {
    const url = new URL(request.url);
    jobNumber = url.searchParams.get('job') || '';
  } else if (request.method === 'POST') {
    try {
      const text = await request.text();
      if (text.length > 512) return json({ status: 'error', message: 'Bad request.' }, 400);
      const body = JSON.parse(text);
      jobNumber = String(body.job || '');
    } catch {
      return json({ status: 'error', message: 'Invalid request.' }, 400);
    }
  } else {
    return json({ status: 'error', message: 'Method not allowed.' }, 405);
  }

  // Validate job number against known projects
  jobNumber = String(jobNumber || '').trim();
  if (!jobNumber) {
    jobNumber = FO_PROJECTS[0]?.number || '';
  }
  const project = FO_PROJECTS.find(p => p.number === jobNumber);
  if (!project) {
    return json({ status: 'error', message: 'Unknown job number.' }, 400);
  }

  // Look up precomputed coordinates
  const coords = JOB_COORDS[jobNumber] || null;
  if (!coords) {
    return json({
      status: 'no_location',
      message: 'No site location on file for this job.',
      job: project.number,
      name: project.name,
    });
  }

  // Check KV cache (skip gracefully if KV not bound)
  const cacheKey = KV_PREFIX + jobNumber;
  if (env.PF_SCHEDULE) {
    try {
      const cached = await env.PF_SCHEDULE.get(cacheKey, { type: 'json' });
      if (cached) {
        return json({ status: 'ok', ...cached, job: project.number, name: project.name, cached: true });
      }
    } catch { /* ignore cache read errors */ }
  }

  // NWS forecast (no geocoding — coords are precomputed)
  const result = await fetchNwsForecast(coords.lat, coords.lon);
  if (!result) {
    return json({
      status: 'unavailable',
      message: 'Weather unavailable right now.',
      job: project.number,
      name: project.name,
    });
  }

  // Cache in KV
  const payload = { forecast: result.forecast, asOf: result.asOf };
  if (env.PF_SCHEDULE) {
    try {
      await env.PF_SCHEDULE.put(cacheKey, JSON.stringify(payload), { expirationTtl: KV_TTL_SECONDS });
    } catch { /* ignore cache write errors */ }
  }

  return json({ status: 'ok', ...payload, job: project.number, name: project.name, cached: false });
}
