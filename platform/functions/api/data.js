// Cloudflare Pages Function — /api/data
// Serves live data from SharePoint via Microsoft Graph API
// Data is NOT embedded in the HTML — fetched on demand

const TENANT_ID = ''; // Set via CF environment variable: AZURE_TENANT_ID
const CLIENT_ID = ''; // Set via CF environment variable: AZURE_CLIENT_ID
const CLIENT_SECRET = ''; // Set via CF environment variable: AZURE_CLIENT_SECRET
const DRIVE_ID = ''; // Set via CF environment variable: SP_DRIVE_ID

const FILE_IDS = {
  bid_log: '016ISVH6Y7M7KQIB5C5FDLNKI5H3IZFXRK',
  project_master: '016ISVH64J5UAFQWEW6NC3FJBZVMTVLLX6',
};

export async function onRequestGet(context) {
  const { env } = context;

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
