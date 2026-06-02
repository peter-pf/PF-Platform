// Cloudflare Pages Functions middleware — server-side authentication
// This runs BEFORE any page is served. No client-side bypass possible.

// Paths that don't require auth
const PUBLIC_PATHS = ['/favicon.ico', '/robots.txt'];

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Credentials from environment variables (set on the CF Pages project).
  // Fallback to defaults only if env vars are not configured.
  const VALID_CREDENTIALS = {
    username: env.PF_AUTH_USER || 'pf',
    password: env.PF_AUTH_PASS || 'PierFoundations2024'
  };

  // Skip auth for public paths
  if (PUBLIC_PATHS.some(p => url.pathname === p)) {
    return context.next();
  }

  // Skip auth for API endpoints (they have their own auth)
  if (url.pathname.startsWith('/api/')) {
    return context.next();
  }

  // Check for auth cookie first
  const cookie = request.headers.get('Cookie') || '';
  const authToken = getCookie(cookie, 'pf_auth_token');

  if (authToken && verifyToken(authToken)) {
    return context.next();
  }

  // Check for Basic Auth header
  const auth = request.headers.get('Authorization');

  if (auth && auth.startsWith('Basic ')) {
    const decoded = atob(auth.slice(6));
    const [username, password] = decoded.split(':');

    if (username === VALID_CREDENTIALS.username && password === VALID_CREDENTIALS.password) {
      // Auth successful — set cookie and serve page
      const response = await context.next();
      const newResponse = new Response(response.body, response);

      // Generate a simple token (in production, use a proper JWT)
      const token = btoa(JSON.stringify({
        user: username,
        exp: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
      }));

      newResponse.headers.set('Set-Cookie',
        `pf_auth_token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`
      );

      return newResponse;
    }
  }

  // No valid auth — return 401 with Basic Auth challenge
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="PF Operations Platform"',
      'Content-Type': 'text/plain'
    }
  });
}

function getCookie(cookieString, name) {
  const match = cookieString.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? match[1] : null;
}

function verifyToken(token) {
  try {
    const data = JSON.parse(atob(token));
    return data.exp > Date.now();
  } catch {
    return false;
  }
}
