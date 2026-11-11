# Keyboard Layout Editor — Vial / VIA support

The original [Keyboard Layout Editor](https://www.keyboard-layout-editor.com/) interface, with support for opening and editing **Vial and VIA keyboard-definition JSON files**. GitHub sign-in, Gist saving, presets, raw layout editing, and the existing KLE tools remain available.

**Public editor: [keebal.com/kle](https://keebal.com/kle/).** Sign in with the same
GitHub account to open layouts saved on the original KLE. Saved and starred lists
follow GitHub's pagination so older layouts are included. This deployment uses a
Cloudflare gateway for its domain and private OAuth exchange; GitHub Pages remains
the upstream asset host. The setup instructions below also cover independent forks.

## Saved layouts and folders

Sign in, open your account menu, and choose **My Layouts** or **Starred Layouts**.
Use the small left/right arrows to browse 30 layouts at a time, or search by
name. All GitHub pages are fetched, including layouts beyond the original
30-result limit.

Use **Folders → New folder** to create a folder. Each layout's **Move to folder**
selector saves its assignment immediately; the Folder filter shows that folder's
layouts. The menu can rename or remove the selected folder. Removing a folder
returns its layouts to **Unfiled**.

Organization follows your GitHub account through one separate, unlisted Gist,
**keebal-layout-folders.json**, created on the first folder change. It is not an
access-control feature. No layout Gist, filename, layout JSON, CSS or notes are
rewritten by folder actions. The original KLE therefore continues to load and
save the same layouts; it simply does not display our folder organization.
Opening the list, filtering, searching and paging make no writes.

Folder saves re-read the latest index and verify the saved content. Avoid editing
folders simultaneously in different browser windows: GitHub Gist updates do not
provide a folder transaction or lock. Invalid, incomplete, duplicated or newer
folder indexes disable folder edits rather than overwriting them.

## Open and save a keyboard

1. Click **Open KLE / Vial / VIA JSON**, or drop a JSON file onto the keyboard.
2. Edit the layout using the existing KLE controls.
3. Click **Save definition JSON** to download the complete definition as `vial.json`. For a plain KLE layout, use **Save KLE JSON**.

Definitions must contain `matrix.rows`, `matrix.cols`, and `layouts.keymap`. All other fields—including IDs, custom keycodes, lighting, menus, and physical layout options—are retained. The Download menu also offers an explicit **KLE-only** export. This edits the keyboard definition, not a `.vil` keymap backup or a connected keyboard's settings.

Keep matrix coordinates in the top-left legends and layout-option tags in the bottom-right. All physical variants are displayed together, as in KLE; overlapping alternatives are expected. Invalid matrix coordinates or option tags block definition export with an explanation. Undo/redo and raw layout editing retain the surrounding definition.

## Run locally

Requires Node.js 22 or later:

```sh
npm ci
npm run build
npm run serve
```

Open **http://127.0.0.1:4180/**. The static site is generated in `dist/`. The first build downloads four checksum-pinned upstream assets; subsequent builds reuse `.vendor-cache/`. Runtime scripts, styles, and fonts are served locally. The legacy Makefile remains, but is not needed for this build.

## Host on GitHub Pages

Push the changes to your own repository, then choose **Settings → Pages → Build and deployment → Source: GitHub Actions**. The included workflow builds and tests the editor, then deploys the default branch. Both `main` and `master` are supported. Pull requests only build/test.

The resulting URL is normally `https://alectardy98.github.io/keyboard-layout-editor/`. Project-subdirectory paths are supported. Nothing has been published automatically.

## Preserve GitHub sign-in

The editor keeps the original GitHub login, Gist save/update/fork, and saved/starred-layout workflows. A fork needs its own OAuth configuration: the upstream client ID and callback belong to the upstream website. GitHub Pages can host the editor, but cannot hold a client secret or execute the token exchange.

1. Register a GitHub **OAuth App** with your editor's homepage URL and callback `https://alectardy98.github.io/keyboard-layout-editor/oauth.html`.
2. Deploy `hosting/github-oauth-worker.mjs` as a Cloudflare Worker (or use a compatible exchange service). Set `EDITOR_URL` to your full editor URL, including its trailing `/`, and `GITHUB_CLIENT_ID` to your app's ID. Store `GITHUB_CLIENT_SECRET` as a **Worker secret**, never in the repository or Pages site.
3. In your GitHub repository's **Settings → Secrets and variables → Actions → Variables**, set `KLE_GITHUB_CLIENT_ID` and `KLE_GITHUB_AUTH_ENDPOINT` (the HTTPS Worker URL), then run the Pages workflow again. Alternatively edit the two public values in `site-config.js` for local/self-hosted builds.
4. Click **Sign in with GitHub**. It requests the `gist` scope. Vial/VIA definitions saved to Gists include their metadata and reopen as complete definitions.

Until configured, sign-in displays a setup explanation; local opening/editing/downloading works without an account. Authentication is tested with mocked GitHub responses; a real account authorization must be checked after the OAuth service and app are configured. No credentials are supplied or committed here.

References: [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [GitHub OAuth flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).

## Tests

```sh
npm test
npm run test:upstream
npx playwright install chromium
npm run test:browser
```

Build first. Browser tests run under a project-subdirectory URL. They use `/opt/google/chrome/chrome` locally if present; set `CHROME_BIN` to another Chromium executable, or use the Playwright-installed browser. CI installs its browser automatically. The original Jasmine tests remain alongside document round-trip and browser regression tests.

## Dependency status

This change retains the legacy KLE framework for interface compatibility. `npm audit --omit=dev` reports advisories in AngularJS, Bootstrap, jQuery, and Marked; those upstream dependencies have not been modernized here. The unused CryptoJS runtime dependency was removed. Review dependency security before exposing the editor to untrusted content or enabling real-account OAuth.

## Credits and license

Original Keyboard Layout Editor: **Ian Prest and [contributors](CONTRIB.md)**. See the [upstream repository](https://github.com/ijprest/keyboard-layout-editor), [changelog](CHANGELOG.md), and **[LICENSE.md](LICENSE.md)**. The upstream license explicitly states that it is not permissive and asks users to contact the author for a public website fork; review that requirement before publishing. Existing copyright and license notices are retained.
