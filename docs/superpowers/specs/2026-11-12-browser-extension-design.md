# Paletka for browsers — design

Issue: TomasAdamcik-dotcom/paletka#1. Status: design + spikes done, not built yet.

## Intent

White web pages are glaring under a dark Paletka theme. A companion browser extension recolors
pages with the **exact colors of the active Paletka theme** and follows every theme and
light/dark switch live, in Chrome, Chromium and Firefox. Paletka's preferences let the user
turn the integration on per browser.

## Decisions (user)

- Pages that are already dark are recolored too (e.g. GitHub dark → Solarized dark).
- Light themes tint white pages too (Solarized light → `#fdf6e3`).
- Firefox is supported besides Chrome and Chromium.
- The Theme menu's *Edit Themes…* becomes **Settings…**; preferences get a **Browsers** page
  with an on/off switch per detected browser.

## Non-goals (this version)

- Rewriting site stylesheets (Dark Reader's "dynamic" mode) — later, if phase 1 is not enough.
- Chromium/Firefox as snap other than Ubuntu's Firefox snap; flatpak browsers.
- Silent extension installs (browsers allow them only through root-owned policies).

## Architecture

```
Paletka (shell)            native host (gjs)                 extension (MV3)
writes current.json ──►    watches the file, sends it  ──►  background: keeps the port,
on apply/variant/restore   framed over stdout                caches, broadcasts to tabs
                                                             content: recolors pages
                                                             Firefox: also theme API (UI)
```

- `~/.local/share/paletka/current.json`:
  `{"version":1,"active":true,"family":"solarized","dark":true,"colors":{...}}`, or
  `{"version":1,"active":false}` with Ubuntu. Colors come from the resolved palette.
- Native host `io.github.adamciktomas.paletka`: gjs script copied to
  `~/.local/share/paletka/browser-host/`, one host manifest per enabled browser
  (Chrome `~/.config/google-chrome/NativeMessagingHosts/`, Chromium
  `~/.config/chromium/NativeMessagingHosts/`, Firefox `~/.mozilla/native-messaging-hosts/`).
  It only reads `current.json` and records the last connection per browser.
- Extension: one source (`browser/`), two manifests. Chrome manifest has a fixed `key` for a
  stable ID; Firefox manifest has `browser_specific_settings.gecko.id`.

## Spike findings (2026-11-12, Ubuntu 26.04, Chrome 157 deb, Firefox 157 snap)

1. **Native messaging works in both.** Chrome: host started, messages both ways. Firefox snap:
   goes through the xdg-desktop-portal *WebExtensions* portal with no extra setup; the portal
   passes the manifest path and extension ID to the host.
2. **Firefox snap needs a one-time permission** from the portal, and GNOME shows that dialog
   only while Firefox is the focused app ("Only the focused app is allowed to show a system
   access dialog"). Stored in the permission store (`webextensions` table,
   `snap.firefox: yes`). ⇒ the extension retries the connection and tells the user to focus
   Firefox and allow; Paletka's Browsers page can read the permission store for the status.
3. **Live updates:** a change of `current.json` (atomic replace) reaches open pages in
   16–18 ms (one outlier 117 ms) through a gjs host with a `Gio.FileMonitor`. The host exits
   when the browser closes stdin.
4. **Recoloring (phase 1, computed styles)** works on Wikipedia, GitHub light and dark, MDN and
   Hacker News with Solarized dark/light and Nord: 10–80 ms per page; 1.1 s for the 340 000
   elements of the HTML spec ⇒ must run in chunks, viewport first. Required details:
   - normalize every color syntax (`oklch()`, `color()`, `color-mix()`) through a 1×1 canvas,
     cached per string;
   - walk shadow roots (MDN content lives in web components);
   - read all computed styles first, then write (reading after writing makes children see
     their parents' new, inherited colors; also 4× faster);
   - set `color-scheme` on `html` only after reading (it changes the default text color);
   - drop gradients made only of unsaturated colors (white fades);
   - keep saturated colors (brand colors, buttons) and media.
   Known limits: inline `!important` also beats the page's `:hover` colors; pseudo-elements
   are not handled; iframes need `all_frames`.
5. **Chrome window colors:** with *Appearance → Mode → GTK* Chrome follows Paletka's GTK theme
   **live**, but only with `--gtk-version=3`; Chrome 157 defaults to GTK4 and then shows only
   generic light/dark (a GTK4 part in Paletka's themes did not change that). The Chrome
   launcher has no flags file ⇒ an opt-in user `.desktop` override that adds the flag.
6. **MV3 service worker stays alive with an open native port:** after 6 minutes idle, a
   palette change still reached the pages in 15–29 ms; no keep-alive tricks needed.

## Browsers page (preferences)

One row per detected browser (Chrome, Chromium, Firefox), with a switch and a status:
*Off* · *Install the Paletka extension* (+ button opening its store page) ·
*Allow Paletka in Firefox's dialog* (Firefox snap, permission missing) · *Active*.
Switch on → install host + manifest; off → remove that browser's manifest. Chrome row has a
second switch **Theme Chrome's window** (installs the `.desktop` override; needs Chrome's
GTK mode, explained in the subtitle). Turning Paletka off or uninstalling removes host,
manifests, `current.json` and the override.

## Testing

Unit tests (gjs for Paletka parts, `node:test` for extension modules), puppeteer E2E for Chrome
with local fixture pages and a live theme switch, nested-shell E2E for the Chrome window
override, `web-ext lint` for Firefox; a manual checklist for the Firefox snap permission.
