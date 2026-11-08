// Optional Cloudflare Worker: Pages hosts the editor; this service holds the secret.
// Environment: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (secret), EDITOR_URL.
// EDITOR_URL includes the project directory and ends in /.
export default {
  async fetch(request, env) {
    if (!env.EDITOR_URL || !env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET)
      return new Response('OAuth service is not configured.', {status: 503});
    const editor = new URL(env.EDITOR_URL);
    const headers = {
      'Access-Control-Allow-Origin': editor.origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store', 'Content-Type': 'application/json', 'Vary': 'Origin'
    };
    const reply = (data, status = 200) => new Response(JSON.stringify(data), {status, headers});
    if (request.headers.get('Origin') !== editor.origin) return new Response('Forbidden', {status: 403});
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
    if (request.method !== 'POST') return reply({error: 'method_not_allowed'}, 405);
    if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) return reply({error: 'json_required'}, 415);
    try {
      if (Number(request.headers.get('Content-Length') || 0) > 4096) return reply({error: 'request_too_large'}, 413);
      const text = await request.text();
      if (text.length > 4096) return reply({error: 'request_too_large'}, 413);
      const {code, redirect_uri} = JSON.parse(text);
      if (typeof code !== 'string' || !code || code.length > 512 || redirect_uri !== new URL('oauth.html', editor).href)
        return reply({error: 'invalid_request'}, 400);
      const result = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: {'Accept': 'application/json', 'Content-Type': 'application/json'},
        body: JSON.stringify({client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri}),
        signal: AbortSignal.timeout(15000)
      });
      const data = await result.json();
      if (!result.ok || data.error || !data.access_token) return reply({error: data.error || 'exchange_failed'}, 400);
      return reply({token: data.access_token});
    } catch (_) { return reply({error: 'exchange_failed'}, 400); }
  }
};
