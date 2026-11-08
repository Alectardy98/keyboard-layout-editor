// Public configuration only. Never put a GitHub client secret in this file.
// GitHub Pages builds accept KLE_GITHUB_CLIENT_ID / KLE_GITHUB_AUTH_ENDPOINT.
window.KLE_CONFIG = {
  githubClientId: '',
  githubAuthEndpoint: ''
};

// Retain the original site's OAuth service on its original domain.
if (window.location.hostname === 'www.keyboard-layout-editor.com') {
  window.KLE_CONFIG.githubClientId = '631d93caeaa61c9057ab';
  window.KLE_CONFIG.githubAuthEndpoint = 'https://kle-gatekeeper.azurewebsites.net/authenticate/';
  window.KLE_CONFIG.legacyGatekeeper = true;
}
