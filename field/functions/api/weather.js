// Cloudflare Pages Function — /api/weather
// 3-day NWS forecast for a PF job site.
//
// FLOW:
//   1. Client POSTs {job: "26-001"} (or GET ?job=26-001).
//   2. Server looks up the site address in fo-projects-data.js.
//      No address → 200 {status:'no_address', message:'No site address on file for this job.'}.
//   3. Geocode address → (lat, lon) via US Census Geocoder (no key).
//      Geocode fail → 200 {status:'unavailable', message:'Weather unavailable right now.'}.
//   4. NWS /points/{lat},{lon} → get forecastUrl.
//      NWS fail → 200 {status:'unavailable', message:'Weather unavailable right now.'}.
//   5. GET forecastUrl → parse first 3 daytime periods (high/low, short text, precip).
//   6. Cache result in KV under "weather:v1:{jobNumber}" for ~60 minutes.
//
// SECURITY:
//   - Auth: field_ops area (set in areaForPath + verified in handler).
//   - Fails CLOSED: any upstream error → generic "unavailable" message.
//   - KV key is server-constructed (never from client).
//   - No financials, no PII exposed.
//   - User-Agent includes peter@pierfoundations.com (NWS requirement).

import { requireArea } from '../lib/auth.js';
import { FO_PROJECTS } from '../lib/fo-projects-data.js';

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

// Geocode a one-line address via the US Census Geocoder.
// Returns {lat, lon} or null on failure.
async function geocodeAddress(address) {
  const url = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?' +
    new URLSearchParams({
      address,
      benchmark: 'Public_AR_Current',
      format: 'json',
    }).toString();
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': NWS_UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const matches = data?.result?.addressMatches;
    if (!matches || matches.length === 0) return null;
    const coords = matches[0].coordinates;
    if (!coords || typeof coords.x !== 'number' || typeof coords.y !== 'number') return null;
    // Census returns {x: lon, y: lat}
    return { lat: coords.y, lon: coords.x };
  } catch {
    return null;
  }
}

// Parse forecast periods into 3-day summary {date, high, low, shortForecast, precipChance}.
// NWS periods alternate daytime/nighttime. We take up to 3 daytime periods.
function parseForecast(periods) {
  const days = [];
  for (const period of periods) {
    if (!period.isDaytime) continue;
    const precip = period.probabilityOfPrecipitation?.value ?? null;
    days.push({
      name: period.name,            // "Today", "Monday", etc.
      high: period.temperature,     // daytime = high
      low: null,                    // will fill from next period
      unit: period.temperatureUnit, // F or C
      shortForecast: period.shortForecast,
      precipChance: precip !== null ? Math.round(precip) : null,
    });
    if (days.length === 3) break;
  }
  // Fill lows from the following nighttime period
  for (let i = 0; i < days.length; i++) {
    // Find the matching nighttime period right after this daytime
    const dayIdx = periods.findIndex(p => p.isDaytime && p.name === days[i].name);
    if (dayIdx >= 0 && dayIdx + 1 < periods.length && !periods[dayIdx + 1].isDaytime) {
      days[i].low = periods[dayIdx + 1].temperature;
    }
  }
  return days;
}

// Fetch NWS 3-day forecast for lat/lon. Returns {forecast, asOf} or null.
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

  if (!env.PF_SCHEDULE) {
    return json({ status: 'unavailable', message: 'Weather unavailable right now.' });
  }

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
    // Default to first project if none supplied
    jobNumber = FO_PROJECTS[0]?.number || '';
  }
  const project = FO_PROJECTS.find(p => p.number === jobNumber);
  if (!project) {
    return json({ status: 'error', message: 'Unknown job number.' }, 400);
  }

  if (!project.address) {
    return json({ status: 'no_address', message: 'No site address on file for this job.', job: project.number, name: project.name });
  }

  // Check KV cache
  const cacheKey = KV_PREFIX + jobNumber;
  try {
    const cached = await env.PF_SCHEDULE.get(cacheKey, { type: 'json' });
    if (cached) {
      return json({ status: 'ok', ...cached, job: project.number, name: project.name, cached: true });
    }
  } catch { /* ignore cache read errors */ }

  // Geocode
  const coords = await geocodeAddress(project.address);
  if (!coords) {
    return json({ status: 'unavailable', message: 'Weather unavailable right now.', job: project.number, name: project.name });
  }

  // NWS forecast
  const result = await fetchNwsForecast(coords.lat, coords.lon);
  if (!result) {
    return json({ status: 'unavailable', message: 'Weather unavailable right now.', job: project.number, name: project.name });
  }

  // Cache in KV
  const payload = { forecast: result.forecast, asOf: result.asOf };
  try {
    await env.PF_SCHEDULE.put(cacheKey, JSON.stringify(payload), { expirationTtl: KV_TTL_SECONDS });
  } catch { /* ignore cache write errors */ }

  return json({ status: 'ok', ...payload, job: project.number, name: project.name, cached: false });
}
