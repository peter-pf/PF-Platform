// Cloudflare Pages Function — /api/data
// Serves live data from SharePoint via Microsoft Graph API
// Data is NOT embedded in the HTML — fetched on demand
//
// SECURITY: this endpoint surfaces the bid log (pricing/bid financials ACROSS ALL
// JOBS) and the project master. It is COMPANY-WIDE / GLOBAL financials-class data.
// In addition to the middleware edge gate, it calls
// requireArea(session, 'financials') itself so field_ops AND business_dev
// are blocked even if the middleware map ever changes (defense-in-depth). BD reaches
// per-job financials through the project-level /data/* files, not this global proxy.

import { requireArea } from '../lib/auth.js';

// Graph creds + drive id come from Cloudflare env vars (server-side only):
//   AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / SP_DRIVE_ID
// (No placeholder constants in source — secrets never live in the repo.)

const FILE_IDS = {
  bid_log: '016ISVH6Y7M7KQIB5C5FDLNKI5H3IZFXRK',
  project_master: '016ISVH64J5UAFQWEW6NC3FJBZVMTVLLX6',
};

export async function onRequestGet(context) {
  const { env } = context;

  // [SEC-03] Per-endpoint RBAC backstop. /api/data is COMPANY-WIDE financials
  // (financials_global) — field_ops AND business_dev are denied here regardless
  // of the middleware. Fails closed if no session.
  const denied = requireArea(context.data && context.data.session, 'financials');
  if (denied) return denied;

  // For now, serve the pre-synced JSON data files
  // In production, this would call Graph API directly
  // The key improvement: data is served via API, not embedded in HTML

  // [SEC-002] No wildcard CORS — this is a same-origin internal tool.
  // [SEC-005] Auth-gated data must not be cached by shared CDNs.
  // Note: this endpoint is also protected by _middleware.js (the blanket
  // /api/ auth-skip was removed), so requests already carry a valid token.
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store',
  };

  try {
    // Check which data is requested
    const url = new URL(context.request.url);
    const type = url.searchParams.get('type') || 'all';

    // For Phase 1: return the embedded data from KV or static JSON
    // The sync script uploads JSON to CF KV or we serve from static files
    // This endpoint exists to move data OUT of the HTML

    const response = {
      sync_time: new Date().toISOString(),
      status: 'ok',
      message: 'API endpoint active. Data served from pre-synced JSON files.',
      note: 'Phase 2 will connect directly to SharePoint Graph API using CF environment variables.'
    };

    return new Response(JSON.stringify(response), { headers });

  } catch (error) {
    // [SEC-008] Don't leak internal error details to the client.
    console.error('api/data error:', error);
    return new Response(JSON.stringify({
      status: 'error',
      message: 'An internal error occurred.'
    }), {
      status: 500,
      headers
    });
  }
}
