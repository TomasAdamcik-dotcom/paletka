# Paletka for Browsers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recolor web pages in Chrome, Chromium and Firefox with the active Paletka theme, live, managed from a new Browsers page in Paletka's preferences.

**Architecture:** Paletka publishes the active palette to `current.json`; a gjs native messaging host streams it to a WebExtension (one source, Chrome and Firefox manifests) whose content scripts recolor pages from computed styles. Paletka installs host manifests per browser on request and removes everything when turned off.

**Tech Stack:** GNOME Shell 50 / gjs (Paletka, host), WebExtensions MV3 (plain JS, no bundler), `node:test`, puppeteer-core + system Chrome, web-ext.

**Spec:** `docs/superpowers/specs/2026-11-12-browser-extension-design.md` (and issue TomasAdamcik-dotcom/paletka#1).

## Global Constraints

- Host name: `io.github.adamciktomas.paletka`; Firefox extension ID `paletka@adamciktomas.github.io`; Chrome ID fixed by the manifest `key` (generate once, keep `browser/chrome-key.pem` out of git, commit only the public key).
- `current.json` path: `${XDG_DATA_HOME}/paletka/current.json`, format `{"version":1,"active":true,"family":id,"dark":bool,"colors":{background,surface,foreground,muted,link,border,selection,accent,headerbar_bg,headerbar_fg}}` or `{"version":1,"active":false}`; always written atomically (`GioFs.writeText`).
- Colors map from the resolved palette: background=`view_bg`, surface=`card_bg`, foreground=`view_fg`, muted = 60 % mix of `view_fg` into `view_bg`, link=`accent` (text-safe), border, selection, accent=`accent_bg`, headerbar_bg/fg.
- Already-dark pages are recolored; light themes tint light pages.
- Everything Paletka writes for browsers is removed by `removeLeftovers()` (turn-off / uninstall), following the existing compare-and-restore rules (never delete a file Paletka did not create).
- No network access in the extension; host reads only `current.json`.
- Strings in English with Slovak translations in `po/sk.po`.

## Review Focus

1. **Firefox snap without the portal permission** — the extension must keep retrying and show "Allow Paletka" guidance, never spin silently. Test in Task 7 (background retry/backoff unit test) and Task 4 (status `needs-permission` from the permission store).
2. **A page that changes after load (SPA, infinite scroll, theme toggle on the site)** — new nodes must be recolored without reprocessing the whole page. Test in Task 8 (fixture that appends nodes; assert their colors).
3. **Turning the theme back to Ubuntu or turning Paletka off with pages open** — pages must return to their original colors, including inline styles the page itself had set. Test in Task 8 (revert restores pre-existing inline `color`).
4. **Huge pages** — no long main-thread block. Test in Task 8 (fixture with 200 000 elements: first viewport recolored < 150 ms, no task > 100 ms via `PerformanceObserver` longtask).
5. **Host lifecycle** — browser closed or extension removed must not leave host processes. Test in Task 2 (stdin EOF → exit 0).

---

### Task 0: E2E harness hygiene

**Files:** Modify: `tests/e2e/run.sh`

Every nested session starts gvfsd, whose `wsdd` helper outlives the session (11 stray
`wsdd --listen /run/user/1000/dt-e2e-*/…` processes were found on 2026-11-12). Export
`GIO_USE_VFS=local` and `GVFS_DISABLE_FUSE=1` for the nested session, and in `cleanup()` kill
processes whose command line contains `$E2E` (`pkill -f "$E2E"`).

- [ ] **Step 1:** run `make e2e`, then `pgrep -af dt-e2e` — expect no output.
- [ ] **Step 2: Commit** `test: leave no gvfs helpers behind after e2e`.

### Task 1: Publish the active palette (`current.json`)

**Files:**
- Create: `extension/lib/browserPalette.js`
- Modify: `extension/lib/paths.js` (add `currentPalette`), `extension/lib/applier.js` (`applyFamily`, `applyVariant`, `restoreSystem`, `removeLeftovers`)
- Test: `tests/browserPalette.test.js`

**Interfaces:**
- Produces: `browserPalette(family, isDark) -> object` (the JSON above), `INACTIVE_PALETTE = {version: 1, active: false}`; `paths.currentPalette`.

- [ ] **Step 1: Write failing tests** — `browserPalette(solarized, true).colors.background === '#00252e'`, `.foreground === '#839496'`, `.link === resolveVariant(...).accent`; applying Solarized dark writes `current.json` with `active:true, family:'solarized', dark:true`; `applyVariant(sol, false)` rewrites it with `dark:false`; `restoreSystem` writes `INACTIVE_PALETTE`; `removeLeftovers()` deletes the file.
- [ ] **Step 2: Run** `gjs -m tests/run.js browserPalette` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `browserPalette` from `resolveVariant`; Applier writes the file at the end of `applyVariant` (it runs for every family apply and light/dark switch) and in `restoreSystem`.
- [ ] **Step 4: Run** `gjs -m tests/run.js` — all pass.
- [ ] **Step 5: Commit** `feat: publish the active palette for browsers`.

### Task 2: Native messaging host

**Files:**
- Create: `extension/browser-host/paletka-host.js` (executable gjs script), `extension/lib/nativeMessaging.js`
- Modify: `Makefile` (`--extra-source=browser-host`)
- Test: `tests/nativeMessaging.test.js`, `tests/host.test.js`

**Interfaces:**
- Produces: `encodeMessage(obj) -> Uint8Array` (4-byte little-endian length + UTF-8 JSON), `MessageReader` with `push(Uint8Array) -> object[]` (handles split frames); host CLI: `paletka-host.js <manifest-path-or-origin> [extension-id]`, env `PALETKA_CURRENT` overrides the file path (tests only).
- Host behaviour: on start send `{type:'palette', ...current.json}` (missing/invalid file → `INACTIVE_PALETTE`); `Gio.FileMonitor` (`WATCH_MOVES`, rate limit 50 ms) on `CHANGES_DONE_HINT|CREATED|MOVED_IN|RENAMED|DELETED` → send again; incoming `{type:'hello', browser, version}` → write `${XDG_DATA_HOME}/paletka/browser-host/seen-<browser>.json` `{version, time}`; stdin EOF → exit 0. Ignore any other message.

- [ ] **Step 1: Failing tests** — framing round trip incl. a frame split across two `push` calls and two frames in one chunk; spawning the host with `PALETKA_CURRENT` → first frame equals file contents; atomically replacing the file → second frame with new colors within 1 s; sending `hello` → `seen-chrome.json` exists; closing stdin → process exits with status 0 within 1 s.
- [ ] **Step 2: Run** `gjs -m tests/run.js host` — FAIL.
- [ ] **Step 3: Implement** (spike B code is the reference: `Gio.UnixInputStream` fd 0 read async, `Gio.UnixOutputStream` fd 1).
- [ ] **Step 4: Run** all tests — pass.
- [ ] **Step 5: Commit** `feat: native messaging host streaming the palette`.

### Task 3: Browser detection and host installation

**Files:**
- Create: `extension/lib/browsers.js`
- Modify: `extension/schemas/org.gnome.shell.extensions.paletka.gschema.xml` (key `browsers`, type `as`, default `[]`; key `chrome-window`, type `b`, default `false`), `extension/lib/paths.js`, `extension/lib/applier.js` (`removeLeftovers` removes host dir and every manifest Paletka wrote)
- Test: `tests/browsers.test.js`

**Interfaces:**
- Produces: `BROWSERS` = `[{id:'chrome', name:'Google Chrome', binaries:['/usr/bin/google-chrome'], hostDir:'~/.config/google-chrome/NativeMessagingHosts', kind:'chromium', storeUrl}, {id:'chromium', name:'Chromium', binaries:['/usr/bin/chromium','/usr/bin/chromium-browser'] (deb only; the snap is not supported), hostDir:'~/.config/chromium/NativeMessagingHosts', kind:'chromium', storeUrl}, {id:'firefox', name:'Firefox', binaries:['/usr/bin/firefox','/snap/bin/firefox'], hostDir:'~/.mozilla/native-messaging-hosts', kind:'firefox', snap: '/snap/bin/firefox', storeUrl}]`; `detectBrowsers(fs) -> Browser[]`; `installHost(fs, paths, browser)` (copies `paletka-host.js` to `${dataDir}/paletka/browser-host/`, mode 0755; writes manifest with `allowed_origins:['chrome-extension://<ID>/']` or `allowed_extensions:['paletka@adamciktomas.github.io']`); `removeHost(fs, paths, browser)` (removes the manifest only if it is ours: same `name` and `path`); `hostState(fs, paths, browser, permissionLookup) -> 'off'|'waiting'|'needs-permission'|'active'` where `active` = `seen-<id>.json` newer than the manifest, `needs-permission` = Firefox snap and `permissionLookup('webextensions', NAME)` lacks `snap.firefox: ['yes']`.

- [ ] **Step 1: Failing tests** with a temp HOME: detection by binaries; install writes both files with exact JSON and mode 0755; `removeHost` leaves a foreign manifest with the same file name but other `path` alone; state transitions off → waiting → active (touch `seen-chrome.json`); Firefox snap with empty permission → `needs-permission`; `removeLeftovers()` removes manifests listed in the `browsers` setting and the host dir.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat: install the browser host per browser`.

### Task 4: Settings menu and Browsers page

**Files:**
- Create: `extension/lib/prefs/browsersPage.js`
- Modify: `extension/lib/toggle.js` (`'Edit Themes…'` → `'Settings…'`), `extension/prefs.js` (add the page after the theme list), `extension/extension.js` (react to `changed::browsers` / `changed::chrome-window` by calling `installHost`/`removeHost`/Task 6), `po/paletka.pot`, `po/sk.po` (`Nastavenia…`, `Prehliadače`, statuses)
- Test: `tests/e2e/prefs-smoke.js` (renders the Browsers page), `tests/e2e/scenario.js` (switch Chrome on → manifest exists; off → gone)

**Interfaces:**
- Consumes: Task 3 API. Permission lookup in prefs: `org.freedesktop.impl.portal.PermissionStore.Lookup('webextensions', 'io.github.adamciktomas.paletka')`.
- UI: `Adw.PreferencesPage` titled *Browsers* with one `Adw.SwitchRow` per detected browser; subtitle = state text (*Off*, *Install the Paletka extension*, *Allow Paletka in Firefox's dialog*, *Active*); suffix button *Get extension* (opens `storeUrl` with `Gio.AppInfo.launch_default_for_uri`) shown in `waiting`; Chrome extra `Adw.SwitchRow` *Theme Chrome's window* with subtitle *Also choose Appearance → Mode → GTK in Chrome.* Status refreshes every 2 s while the page is visible.
- The shell side owns installation (prefs only flips settings), so turn-off cleanup stays in one place.

- [ ] **Step 1:** extend prefs smoke and scenario as above (FAIL).
- [ ] **Step 2:** implement; `make pot`, translate.
- [ ] **Step 3:** `make test` and `make e2e` — pass.
- [ ] **Step 4: Commit** `feat: Settings menu and Browsers page`.

### Task 5: Extension skeleton (shared source, two manifests, live palette)

**Files:**
- Create: `browser/src/background.js`, `browser/src/content/main.js`, `browser/manifest.chrome.json`, `browser/manifest.firefox.json`, `browser/build.mjs`, `browser/package.json` (devDependencies: puppeteer-core, web-ext), `browser/test/*.test.mjs`
- Modify: `Makefile` (targets `browser`, `browser-test`), `.gitignore` (`browser/dist/`, `browser/node_modules/`, `browser/chrome-key.pem`)

**Interfaces:**
- Background: `connect()` → `runtime.connectNative(HOST)`; on connect send `{type:'hello', browser: 'chrome'|'chromium'|'firefox', version}`; on `palette` store in `storage.session` (`storage.local` on Firefox if `session` is missing) and send `{type:'palette', palette}` to all tabs; on disconnect retry with backoff 2 s, 4 s, … max 30 s; after 3 failures set badge `!` and `state = 'no-host' | 'needs-permission'` (Firefox: error text contains "portal" or "Access denied" → `needs-permission`).
- Content: at `document_start` request the palette (`{type:'get'}`) and listen for `palette`; hand it to Task 7's `Recolorer`.
- Build: copies `src/` + the right manifest into `dist/chrome` / `dist/firefox`, zips them.

- [ ] **Step 1: Failing tests** (`node --test browser/test`): backoff sequence `[2000,4000,8000,16000,30000,30000]`; state after 3 failures with error "Access denied" on Firefox = `needs-permission`. Puppeteer integration (`browser/test/live.test.mjs`): load `dist/chrome` with a temp profile whose `NativeMessagingHosts` points at `extension/browser-host/paletka-host.js` (`PALETKA_CURRENT` via a wrapper), open two local pages, rewrite the palette → both pages receive it within 500 ms; idle 6 minutes then rewrite → still received (spike: 15–29 ms after 6 min idle; run this case only with `--slow`).
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS); `npx web-ext lint -s browser/dist/firefox` → 0 errors.
- [ ] **Step 5: Commit** `feat: browser extension skeleton with live palette`.

### Task 6: Chrome window colors (opt-in launcher override)

**Files:**
- Create: `extension/lib/chromeWindow.js`
- Modify: `extension/extension.js` (setting `chrome-window`), `extension/lib/applier.js` (`removeLeftovers`)
- Test: `tests/chromeWindow.test.js`, nested E2E step reusing spike C (`google-chrome --gtk-version=3` follows a family switch)

**Interfaces:**
- Produces: `chromeDesktopOverride(systemText) -> string` — every `Exec=` line gets ` --gtk-version=3` inserted after the binary, other lines unchanged, plus a first comment line `# Generated by Paletka — do not edit.`; `enableChromeWindow(fs, paths)` writes `~/.local/share/applications/google-chrome.desktop` from `/usr/share/applications/google-chrome.desktop` unless a user file without our header exists (then report `conflict`); `disableChromeWindow` removes only our file.

- [ ] **Step 1: Failing tests** — `Exec=/usr/bin/google-chrome-stable %U` → `Exec=/usr/bin/google-chrome-stable --gtk-version=3 %U`; three `Exec` lines all changed; existing user override is left alone and reported; disable removes only ours.
- [ ] **Step 2–4:** run, implement, run.
- [ ] **Step 5: Commit** `feat: optional Chrome window theming`.

### Task 7: Recoloring engine (phase 1)

**Files:**
- Create: `browser/src/recolor/colors.js` (pure: `parseRgb`, `luminance`, `saturation`, `mix`, `toCss`), `browser/src/recolor/mapping.js` (pure), `browser/src/recolor/recolorer.js` (DOM), `browser/test/fixtures/*.html`
- Modify: `browser/src/content/main.js`
- Test: `browser/test/mapping.test.mjs`, `browser/test/recolor.test.mjs` (puppeteer)

**Interfaces:**
- `mapping.js`: `mapBackground(color, base, palette) -> color|null`, `mapText(color, base, palette, {isLink}) -> color|null`, `mapBorder(color, palette) -> color|null`, `isLightGradient(stops) -> bool`; rules from the spike: saturation > 0.35 keeps the color (except links → `palette.link`); background within 0.03 luminance of the page base → `background`, otherwise `surface` mixed up to 25 % toward `foreground` by distance; text strength = `min(1, |L(text) − L(base)| / 0.7)`, result `mix(background, foreground, 0.45 + 0.55·strength)`.
- `Recolorer(document, palette)`: `apply()`, `update(palette)`, `revert()`; colors of any syntax parsed through a cached 1×1 canvas; collects elements including open shadow roots (Chrome: `chrome.dom.openOrClosedShadowRoot`, Firefox: `element.openOrClosedShadowRoot`); **reads all computed styles first, then writes**; sets `color-scheme` and `html` background after reading; skips `IMG, VIDEO, CANVAS, PICTURE, IFRAME` and SVG children; remembers the element's original inline values in a `WeakMap` for `revert()`; processes the viewport first, then the rest in `requestIdleCallback` chunks of 2 000 elements; `MutationObserver` (childList, subtree) recolors added subtrees in the next idle chunk; an early `<style>` at `document_start` sets `html {background: <background> !important; color-scheme: …}` so no white flash.

- [ ] **Step 1: Failing tests** — mapping unit tests with the spike's numbers (white base, black text, Solarized dark → `#839496`; GitHub-dark base `#0d1117`, text `#e6edf3` → foreground; saturated `#2da44e` kept; link → `palette.link`; gradient `white→rgba(255,255,255,0)` → light). Puppeteer on fixtures: light article, dark page, shadow-DOM component, `oklch()` text, white gradient fade, SPA appending 100 nodes after 1 s, page with its own inline `color` (revert restores it), 200 000-element page (first viewport < 150 ms, no long task > 100 ms), live palette switch (all text colors change).
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS). Save screenshots of Wikipedia/GitHub/MDN/HN (network, `--real-sites` flag only) for manual review.
- [ ] **Step 5: Commit** `feat: recolor pages with the theme palette`.

### Task 8: Popup, per-site switch, Firefox browser UI

**Files:**
- Create: `browser/src/popup/popup.html`, `popup.js`, `popup.css`, `browser/src/firefoxTheme.js`
- Modify: manifests (`action.default_popup`; Firefox `permissions: ['theme']`), `browser/src/background.js`
- Test: `browser/test/popup.test.mjs`, `browser/test/firefoxTheme.test.mjs`

**Interfaces:**
- Popup shows the active theme (`family`, light/dark), a global switch, *Recolor this site* switch (stored as `storage.sync` `{disabledSites: [hostname]}`), and the connection state with guidance text for `no-host` (*Turn on Firefox/Chrome in Paletka → Settings → Browsers*) and `needs-permission` (*Focus Firefox and allow Paletka in the system dialog*).
- `firefoxThemeFor(palette) -> {colors: {frame, frame_inactive, tab_background_text, toolbar, toolbar_text, toolbar_field, toolbar_field_text, popup, popup_text, sidebar, sidebar_text}}` from `headerbar_bg/fg`, `surface`, `background`, `foreground`; `browser.theme.update` on palette, `browser.theme.reset()` when inactive.

- [ ] **Step 1: Failing tests** — popup toggling a site disables recoloring there after reload (puppeteer); `firefoxThemeFor` maps exact keys.
- [ ] **Step 2–4:** run, implement, run; `web-ext lint` clean.
- [ ] **Step 5: Commit** `feat: popup and Firefox browser colors`.

### Task 9: Docs, packaging, release

**Files:**
- Modify: `README.md`, `docs/user-guide.md`, `docs/navod.sk.md` (Browsers section, Firefox permission dialog, Chrome GTK mode), `docs/technical.md` (architecture, files written, cleanup), `extension/metadata.json` (description mentions the browser host; `version-name` 1.1.0), `Makefile` (`browser-zip`)
- Manual checklist (in `docs/technical.md`): Firefox snap first connection shows the dialog only when focused; Chrome Web Store / addons.mozilla.org listings (Chrome needs the one-time developer fee; AMO is free); unpacked install instructions until listed.

- [ ] **Step 1:** write docs; `make test`, `make e2e`, `make browser-test` — all pass.
- [ ] **Step 2:** independent code review (as for 1.0.1), fix findings.
- [ ] **Step 3: Commit, merge, install, release** `v1.1.0` with the extension zips attached.
