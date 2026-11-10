# Desktop Themes — design

Date: 2026-11-02 · Target: Ubuntu 26.04 LTS, GNOME Shell 50, Wayland

## Intent

A VS Code–style theme switcher for the whole Ubuntu desktop. The user picks a theme from a
Quick Settings tile (top-right menu, next to "Dark Style") and within a few seconds the desktop
switches — shell, app windows, terminal, wallpaper, icons. Users can create their own themes in
a built-in editor. Ships with **Ubuntu** (stock look) and **Solarized** families.

## Goals

- One GNOME Shell extension, distributed via extensions.gnome.org (EGO). No snap.
- Themes are **families** with a light and a dark variant. The stock Dark Style toggle switches
  between variants of the active family, fully live.
- Switching families is "click and done": everything that *can* change live changes live;
  long-running background GTK services are restarted automatically.
- Built-in editor (in the extension's preferences window) to create/duplicate/edit/delete/
  import/export families. Each variant is defined by 6 base colors; everything else is derived,
  with per-color overrides under "Advanced".
- A theme covers: GNOME Shell (panel, menus, quick settings, notifications, OSD, overview
  search/dash, dialogs), GTK4/libadwaita apps, GTK3 apps (via adw-gtk3), accent color,
  light/dark preference, terminal colors (Ptyxis and GNOME Terminal), wallpaper, icon theme.
- Switching back to the Ubuntu family restores exactly what the user had before.

## Non-goals

- Fonts and cursor themes (later).
- Recoloring Firefox/Chrome/Electron/Qt/Flatpak/Snap apps beyond the light/dark preference.
- Live recoloring of *already-open* GTK app windows when switching to a different family
  (proven impossible without an `LD_PRELOAD` hack, which the user rejected). They recolor on
  next launch. Light↔dark within a family *is* live for them.
- Snap Store packaging.

## Anti-goals (would be a failure even if it "works")

- Losing or corrupting the user's existing configuration (`~/.config/gtk-4.0/gtk.css`,
  wallpaper, terminal profile, icon theme, accent). Everything we overwrite is backed up first.
- Breaking the desktop when the extension is disabled, crashes, or is uninstalled.
- Anything EGO review would reject (leaking signals/widgets on disable, touching system files,
  downloading code).

## Spike findings (verified on this machine, 2026-11-02)

- libadwaita 1.9 (Ubuntu build) **ignores** legacy `@define-color` in user `gtk.css`;
  only CSS custom properties work: `:root { --window-bg-color: …; }`.
- Running GTK3/GTK4 apps load `~/.config/gtk-{3,4}.0/gtk.css` **only at startup**; neither
  file changes nor `gtk-theme` changes make them reload it.
- `@media (prefers-color-scheme: dark)` inside the GTK4 user CSS **does** switch live when
  `color-scheme` changes. → one `gtk.css` holds both variants of the active family.
- `color-scheme` and `accent-color` changes apply live to libadwaita apps.
- Ubuntu's libadwaita picks its built-in Yaru vs. Adwaita stylesheet from `gtk-theme` live;
  it is a compiled-in resource, not extensible.
- The user's current `~/.config/gtk-4.0/gtk.css` (+ `.bak`) is a Gradience leftover that is
  already a no-op (legacy syntax). It must still be backed up and restored, not deleted.
- Ptyxis 50.1 palettes are INI files with `[Palette]`, `[Light]`, `[Dark]` sections
  (Foreground, Background, TitlebarForeground, Cursor, Color0–15). Ptyxis' default profile
  currently uses palette `solarized`. GNOME Terminal is the default terminal per
  `~/.config/xdg-terminals.list`; both must be supported.
- Ubuntu's stock Dark Style toggle (`ui/status/darkMode.js`) also rewrites `gtk-theme` and
  `icon-theme` to `Yaru[-variant][-dark]`, but only when `gtk-theme` is exactly `Yaru`.
- adw-gtk3 is **not** packaged in Ubuntu 26.04 and not installed here.

## Approaches considered

How app windows get recolored (the rest is common to all):

- **A. Overlay on Yaru** — generated `gtk-4.0/gtk.css` only; GTK3 stays Yaru. Simplest; GTK3
  apps not themed.
- **B. Overlay + adw-gtk3 for GTK3 (chosen)** — same generated colors drive GTK4 (CSS vars) and
  GTK3 (adw-gtk3 named colors). Consistent look. Needs adw-gtk3 installed; falls back to A.
- **C. Generate full GTK/Shell themes from templates** — maximum control, very heavy, breaks
  with every GNOME release. Rejected.

For live switching of open windows, the user chose the **"reasonable compromise"** over an
`LD_PRELOAD` CSS-reload shim (fragile, no Flatpak/Snap, outside EGO).

## Architecture

```
extension/                         # = the EGO zip content, uuid desktop-themes@adamciktomas.github.io
  metadata.json                    # shell-version ["50"], session-modes ["user","unlock-dialog"]
  extension.js                     # enable/disable, tile, wiring
  prefs.js                         # editor (Adw)
  stylesheet.css                   # tile styling only
  schemas/…desktop-themes.gschema.xml
  themes/ubuntu.json, solarized.json   # built-in families (read-only)
  lib/
    color.js        # pure: hex parse/format, mix, lighten/darken, alpha, contrast, hue distance
    palette.js      # pure: 6 base colors (+ light/dark) → full derived palette, apply overrides
    model.js        # pure: family schema, validation, defaults, id/slug, duplicate
    gtkCss.js       # pure: GTK4 css (both variants, media query) + GTK3 css (one variant)
    shellCss.js     # pure: St stylesheet for one variant
    terminal.js     # pure: Ptyxis .palette text; GNOME Terminal key/values
    wallpaper.js    # pure: SVG text for solid/gradient wallpapers
    accent.js       # pure: nearest GNOME accent enum for a color
    store.js        # Gio: load built-in + user families, save, delete, import/export, monitor
    backup.js       # Gio: snapshot/restore of user state
    applier.js      # orchestration via injected adapters (settings, fs, services)
    services.js     # Gio: restart background GTK services
```

Pure modules import nothing from Shell/Gtk (GLib at most) so they run under plain `gjs -m` in
unit tests. `applier.js` receives adapters, so it is unit-testable with fakes.

### Data model (family JSON)

```json
{
  "version": 1,
  "id": "solarized",
  "name": "Solarized",
  "kind": "custom",                 // "system" for Ubuntu: means "restore user's original state"
  "light": {
    "base": { "background": "#fdf6e3", "foreground": "#586e75", "accent": "#268bd2",
              "surface": "#eee8d5", "success": "#859900", "error": "#dc322f" },
    "overrides": { "headerbar_bg": "#eee8d5" },
    "terminal": { "foreground": "#657b83", "background": "#fdf6e3", "cursor": "#657b83",
                  "palette": ["#073642", "… 16 entries"] },
    "wallpaper": { "type": "gradient", "from": "#fdf6e3", "to": "#eee8d5" },
    "iconTheme": "Yaru"
  },
  "dark": { "…same shape…" }
}
```

- Base colors (6): background, foreground, accent, surface (panel/sidebars/cards), success,
  error. Warning = derived (mix of success and error hue toward yellow; overridable).
- Derived palette keys (overridable): window_bg/fg, view_bg/fg, headerbar_bg/fg/border/shade,
  sidebar_bg/fg, card_bg/fg, popover_bg/fg, dialog_bg/fg, accent_bg/fg, accent (text-safe),
  destructive_bg/fg, success_bg/fg, warning_bg/fg, error_bg/fg, borders, shade, hover/active
  tints, selection, panel_bg/fg (shell), osd_bg/fg. The editor lists every derived key with its
  computed value; overriding marks it, a reset button removes the override.
- `wallpaper.type`: `none` (keep current), `solid`, `gradient`, `file` (path).
- `iconTheme`: one of the installed icon themes (validated; missing → keep current).
- User families live in `~/.config/desktop-themes/themes/<id>.json`. Built-ins are read-only;
  editing a built-in = "Duplicate".
- Ubuntu family (`kind: "system"`) has no colors; applying it restores the backup snapshot.
  Duplicating Ubuntu creates a custom family pre-filled with Yaru-like colors.

### Applying a family (switch to custom family F, variant V from current color-scheme)

1. If the current family is `system`, take a **snapshot** (once): gtk-theme, icon-theme,
   accent-color, background picture-uri/-dark/options/primary-color, Ptyxis default profile
   `palette`, GNOME Terminal default profile color keys, and copies of existing
   `gtk-4.0/gtk.css` and `gtk-3.0/gtk.css` → `~/.local/share/desktop-themes/backup/`.
2. Write `~/.config/gtk-4.0/gtk.css` (both variants, header "generated by Desktop Themes").
3. Write `~/.config/gtk-3.0/gtk.css` (variant V, adw-gtk3 named colors) and set `gtk-theme` to
   `adw-gtk3` / `adw-gtk3-dark` if installed (else `Yaru` / `Yaru-dark`).
4. Set `accent-color` to the nearest GNOME accent (for apps that only read the enum).
5. Write and load the shell stylesheet for V; unload the previous one.
6. Ptyxis: write `desktop-themes-<id>.palette` (Light+Dark sections) into Ptyxis' user palette
   dir and set default profile `palette`. GNOME Terminal: set default profile
   `use-theme-colors=false`, background/foreground/palette for V.
7. Wallpaper: write SVGs to `~/.local/share/backgrounds/desktop-themes/` and set
   `picture-uri` (light) + `picture-uri-dark` (dark).
8. Icon theme for V.
9. Restart background GTK services (if setting `restart-background-services` is on):
   `xdg-desktop-portal-gnome` (systemd user unit), Nautilus and GNOME Software only when they
   have no open windows (`--quit`).
10. Persist `active-family`; if apps with open windows exist, show one notification:
    "Open apps will use the new colors after they are reopened."

Variant change (color-scheme toggled while F active): steps 3, 5, 6 (GNOME Terminal only),
8 — no snapshot, no service restarts. GTK4 apps switch by themselves (media query); wallpaper
switches by itself (`picture-uri-dark`); Ptyxis by itself (Light/Dark sections).

Switching to Ubuntu: restore snapshot (all keys, gtk.css files moved back or removed if none
existed), unload shell stylesheet, restart background services, delete the snapshot.

Switching between two custom families: no new snapshot (the Ubuntu snapshot is kept).

### Extension lifecycle (EGO)

- `enable()`: build tile, load the active family's shell stylesheet, connect to
  `color-scheme`, `active-family`, and the user themes directory monitor (re-apply when the
  active family's file changes, debounced ~300 ms — this gives the editor live preview).
- `disable()`: destroy tile, unload stylesheet, disconnect everything. It does **not** revert
  gsettings/gtk.css: disable runs on every lock in many setups and must not flash the desktop.
  Session mode `unlock-dialog` is declared so the shell theme persists on the lock screen; the
  tile is hidden while locked.
- Recovery after uninstall: apply "Ubuntu" first (documented; prefs has "Restore Ubuntu
  defaults" button).

### Quick Settings tile

`QuickMenuToggle` placed directly after the Dark Style tile (insert before the
Do-Not-Disturb item; fall back to `addExternalIndicator` placement if not found).
Title "Theme", subtitle = active family name, icon `applications-graphics-symbolic`-ish
palette icon. Checked = a custom family is active; clicking the toggle body switches between
Ubuntu and the last-used custom family. The menu lists all families (check ornament on the
active one), a separator, and "Edit Themes…" which opens prefs.

### Editor (prefs.js, Adw)

- Page "Themes": list of families (Ubuntu, Solarized, user families). Row actions: Apply,
  Duplicate, Export…, Delete (custom only). Header buttons: New (from Solarized defaults),
  Import…. A banner if adw-gtk3 is missing, with install instructions link.
- Family editor (navigation sub-page): name; Light/Dark switcher; groups:
  Base colors (6 `Gtk.ColorDialogButton`), Advanced (expander, every derived key with value,
  override, reset), Terminal (fg, bg, cursor, 16 colors, "Reset from base colors"),
  Wallpaper (none/solid/gradient/file), Icon theme (installed themes).
- Saving is automatic (debounced ~500 ms) to the JSON file. If the family is active, the
  extension re-applies it via the directory monitor → live preview of shell, terminal,
  wallpaper; GTK apps on relaunch (prefs itself is a GTK4 app — it reloads nothing either).
- "Restore Ubuntu defaults" button.

### Localization

English source strings with gettext; Slovak translation included (my call — user is Slovak).

## Testing

- **Unit** (`gjs -m tests/run.js`, tiny in-repo runner): color math, palette derivation and
  overrides, model validation/duplicate, GTK4/GTK3/shell CSS generation (snapshot-style checks
  of key properties), Ptyxis/GNOME Terminal output, wallpaper SVG, accent mapping, store with a
  temp dir, backup/restore round-trip with temp dir + fake settings, applier sequencing with
  fakes (snapshot only from system family, no restarts on variant change, restore path).
- **E2E** (`tests/e2e/run.sh`): isolated env (temp `XDG_CONFIG_HOME`, `XDG_DATA_HOME`,
  `XDG_CACHE_HOME`, `XDG_RUNTIME_DIR`, own dconf DB) + `dbus-run-session gnome-shell --headless
  --wayland --virtual-monitor 1600x1000`, with the extension and a test-only helper extension
  that enables shell unsafe mode so the test can use `Eval` and `Screenshot`. Scenario: tile
  present next to Dark Style; pick Solarized from the menu → files + gsettings + loaded
  stylesheet as expected; a GTK4 probe app launched in the nested session shows Solarized
  foreground; toggle Dark Style → dark variant (shell css, gtk-3 theme, GNOME Terminal);
  edit active family JSON → re-applied; switch to Ubuntu → snapshot fully restored and
  pre-existing gtk.css byte-identical; disable extension → no stylesheet, no tile, no errors in
  journal. Screenshots saved for review. Service restarts are disabled in E2E (setting) so the
  real session is never touched.
- **Manual** on the real session after re-login (Wayland can't load a new extension without
  it): user check.

## Left to the builder

- Exact derivation formulas and shell CSS selector coverage (verify visually via E2E
  screenshots).
- Ptyxis user palette directory and palette id convention — verify against Ptyxis 50.1
  (expected `~/.local/share/org.gnome.Ptyxis/palettes/<id>.palette`, id = file stem).
- Icon for the tile.
- adw-gtk3 GTK3 named colors list (check against adw-gtk3 docs).

## Resolved after builder check

- **adw-gtk3 is bundled** (user decision): `extension/vendor/adw-gtk3/` holds adw-gtk3 v6.5
  (`adw-gtk3` and `adw-gtk3-dark`: `index.theme` + `gtk-3.0/` only, plus upstream LGPL-2.1
  `LICENSE`; release tarball sha256 `a81780fadfc432be0fc3d89c4ebb41aa28e4f032d42c36f9789c57dd10cfa41c`).
  On the first custom-family apply, if `~/.local/share/themes/adw-gtk3[-dark]` is missing or has
  an older bundled version marker (`.desktop-themes-version`), it is copied there. A theme
  installed by the user from elsewhere (no marker) is never overwritten. It is left installed
  when switching back to Ubuntu (harmless, not active).

- **Base stylesheet under custom families:** when a custom family is active, `gtk-theme` is
  set to `adw-gtk3[-dark]`, so Ubuntu's libadwaita uses upstream Adwaita (not Yaru) under our
  CSS variables. Intended: Adwaita is fully variable-driven and matches adw-gtk3 for GTK3.
  Fallback without adw-gtk3: `gtk-theme` = `Adwaita` / `Adwaita-dark` style name that is
  **not** exactly `Yaru` (so the stock Dark Style toggle never rewrites gtk/icon theme while a
  custom family is active). GTK4 coverage/screenshots therefore target Adwaita only.
- **Restore is compare-and-restore:** `backup.js` records the snapshot *and* the values we
  last wrote. On restore, a key is reset to the snapshot only if its current value still
  equals what we wrote; anything the user changed in the meantime is kept. Same for gtk.css
  files (restored only if the file still carries our generated header).
- **Variant-aware restore of Yaru names:** if the snapshot holds a `Yaru[-x][-dark]`
  gtk/icon theme, restore the variant matching the *current* color-scheme (mirrors
  `darkMode.js` logic).
- **Variant handler** runs debounced (~150 ms) after `color-scheme` changes, after the stock
  toggle has finished its own writes.
- **Absent fields in a family** (`wallpaper: none`, missing/invalid icon theme, no terminal
  section): the field reverts to the snapshot value, so the result never depends on which
  family was active before.

## My calls (not explicitly decided by the user)

UUID/name "Desktop Themes", JSON location, 6th base color = surface, session-mode
unlock-dialog, no revert on disable, Slovak translation, tile click = toggle Ubuntu ↔ last
custom family, notification wording.
