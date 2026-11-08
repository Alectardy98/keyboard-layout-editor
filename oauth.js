(async function () {
  'use strict';
  var status = document.getElementById('status');
  try {
    if (!window.opener || window.opener.location.origin !== window.location.origin)
      throw new Error('Open Sign in with GitHub from the editor first.');
    var params = new URLSearchParams(window.location.search);
    var code = params.get('code'), state = params.get('state');
    if (!state || state !== sessionStorage.getItem('kle.oauth.state'))
      throw new Error('The login state did not match. Please start sign-in again.');
    if (params.get('error')) throw new Error(params.get('error_description') || params.get('error'));
    if (!code || !window.KLE_CONFIG.githubAuthEndpoint) throw new Error('Missing login code or OAuth service configuration.');
    var config = window.KLE_CONFIG;
    var response = config.legacyGatekeeper
      ? await fetch(config.githubAuthEndpoint + encodeURIComponent(code), {cache: 'no-store'})
      : await fetch(config.githubAuthEndpoint, {
          method: 'POST', headers: {'Content-Type': 'application/json'}, cache: 'no-store',
          body: JSON.stringify({code: code, redirect_uri: window.location.origin + window.location.pathname})
        });
    var data = await response.json();
    if (!response.ok || data.error || !(data.token || data.access_token))
      throw new Error(data.error_description || data.error || 'The OAuth service did not return a token.');
    window.opener.__oauthSuccess(data.token || data.access_token, state);
    status.textContent = 'Signed in. You can close this window.';
    window.close();
  } catch (error) {
    status.textContent = error.message;
    try { if (window.opener && window.opener.location.origin === window.location.origin) window.opener.__oauthError(error.message); }
    catch (_) { /* A closed or cross-origin opener must not receive credentials. */ }
  }
  history.replaceState(null, '', window.location.pathname);
}());
