/**
 * Minimal GitHub OAuth proxy for Decap CMS running on GitHub Pages.
 *
 * GitHub Pages serves static files only, so the OAuth "authorization code" step
 * (which needs a client_secret) can't happen in the browser. This Worker holds
 * the client_secret and implements the two endpoints Decap CMS's "github"
 * backend expects at `base_url`:
 *
 *   GET /auth       -> redirects the user to GitHub to approve access
 *   GET /callback   -> GitHub redirects back here with a `code`; this
 *                      exchanges it for an access token and hands the token
 *                      back to the Decap CMS popup window via postMessage.
 *
 * Required secrets (set with `wrangler secret put <NAME>`):
 *   GITHUB_CLIENT_ID
 *   GITHUB_CLIENT_SECRET
 *
 * Optional var (set in wrangler.toml [vars] or as a secret):
 *   GITHUB_OAUTH_SCOPE   (defaults to "repo,user")
 */

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

function randomState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

async function handleAuth(request, env) {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider') || 'github';
  if (provider !== 'github') {
    return new Response('Unsupported provider: ' + provider, { status: 400 });
  }
  if (!env.GITHUB_CLIENT_ID) {
    return new Response('Worker is missing the GITHUB_CLIENT_ID secret.', { status: 500 });
  }

  const state = randomState();
  const redirectUri = new URL('/callback', url).toString();

  // Remember the admin page's origin so the callback page only posts the
  // token back to that origin instead of broadcasting it to "*".
  const referer = request.headers.get('Referer') || '';
  let originToTrust = '*';
  try {
    if (referer) originToTrust = new URL(referer).origin;
  } catch (e) {
    originToTrust = '*';
  }

  const authorizeUrl = new URL(GITHUB_AUTHORIZE_URL);
  authorizeUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('scope', env.GITHUB_OAUTH_SCOPE || 'repo,user');
  authorizeUrl.searchParams.set('state', state);

  const cookie = [
    `decap_oauth_state=${state}`,
    `decap_oauth_origin=${encodeURIComponent(originToTrust)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=600',
  ].join('; ');

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl.toString(),
      'Set-Cookie': cookie,
    },
  });
}

function renderCallbackPage({ success, provider, token, message, origin }) {
  const payload = success
    ? `authorization:${provider}:success:${JSON.stringify({ token, provider })}`
    : `authorization:${provider}:error:${JSON.stringify({ message: message || 'OAuth failed' })}`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${success ? 'Authorized' : 'Authorization failed'}</title></head>
<body>
<p>${success ? 'Authorized — you can close this window.' : 'Authorization failed: ' + (message || 'unknown error')}</p>
<script>
(function () {
  var payload = ${JSON.stringify(payload)};
  var targetOrigin = ${JSON.stringify(origin || '*')};
  function receiveMessage(e) {
    window.opener.postMessage(payload, targetOrigin === '*' ? e.origin : targetOrigin);
    window.removeEventListener('message', receiveMessage, false);
  }
  window.addEventListener('message', receiveMessage, false);
  window.opener.postMessage('authorizing:${provider}', targetOrigin);
})();
</script>
</body>
</html>`;
}

async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = getCookie(request, 'decap_oauth_state');
  const cookieOrigin = getCookie(request, 'decap_oauth_origin') || '*';

  const clearCookie = 'decap_oauth_state=; Path=/; Max-Age=0, decap_oauth_origin=; Path=/; Max-Age=0';

  if (!code) {
    return new Response(
      renderCallbackPage({ success: false, provider: 'github', message: 'Missing code parameter', origin: cookieOrigin }),
      { status: 400, headers: { 'Content-Type': 'text/html' } }
    );
  }
  if (!state || !cookieState || state !== cookieState) {
    return new Response(
      renderCallbackPage({ success: false, provider: 'github', message: 'Invalid state (possible CSRF)', origin: cookieOrigin }),
      { status: 400, headers: { 'Content-Type': 'text/html' } }
    );
  }

  const redirectUri = new URL('/callback', url).toString();
  let tokenJson;
  try {
    const tokenResp = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });
    tokenJson = await tokenResp.json();
  } catch (e) {
    return new Response(
      renderCallbackPage({ success: false, provider: 'github', message: 'Token exchange request failed', origin: cookieOrigin }),
      { status: 502, headers: { 'Content-Type': 'text/html' } }
    );
  }

  if (tokenJson.error || !tokenJson.access_token) {
    return new Response(
      renderCallbackPage({
        success: false,
        provider: 'github',
        message: tokenJson.error_description || tokenJson.error || 'Token exchange failed',
        origin: cookieOrigin,
      }),
      { status: 400, headers: { 'Content-Type': 'text/html' } }
    );
  }

  return new Response(
    renderCallbackPage({ success: true, provider: 'github', token: tokenJson.access_token, origin: cookieOrigin }),
    { status: 200, headers: { 'Content-Type': 'text/html', 'Set-Cookie': clearCookie } }
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/auth') return handleAuth(request, env);
    if (url.pathname === '/callback') return handleCallback(request, env);
    if (url.pathname === '/') return new Response('Decap CMS OAuth proxy is running.', { status: 200 });
    return new Response('Not found', { status: 404 });
  },
};
