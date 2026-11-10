# Paletka — technical documentation

GNOME Shell 50 ESM extension, UUID `paletka@adamciktomas.github.io`, settings schema
`org.gnome.shell.extensions.paletka`, gettext domain `paletka`.

## Repository layout

```
extension/
  extension.js          shell side: tile, enable/disable, apply queue, notifications
  prefs.js              preferences window (theme list + editor)
  stylesheet.css        static styles of the Theme menu
  metadata.json
  schemas/              org.gnome.shell.extensions.paletka.gschema.xml
  themes/*.json         built-in families (ubuntu, solarized, gruvbox, nord, dracula)
  vendor/adw-gtk3/      bundled adw-gtk3 6.5 (gtk-3.0 only, LGPL-2.1)
  lib/                  logic, mostly free of shell imports (unit-tested)
    prefs/              preferences pages (familyListPage, familyEditorPage, colorRow)
po/                     paletka.pot, sk.po
tests/                  unit tests (gjs) and tests/e2e (nested GNOME Shell)
docs/                   user guides, this file, superpowers/ design history
```

## Settings (gschema)

| Key | Type | Meaning |
|---|---|---|
| `active-family` | s | id of the applied family; `ubuntu` = original look |
| `last-custom-family` | s | family the Theme tile switches to when clicked |
| `restart-background-services` | b | restart portal / Files / Software after a family switch |

Light/dark is not stored by Paletka: it is `org.gnome.desktop.interface color-scheme`.

## Theme family format

A family is a JSON file, `version: 1`, with `id` (`[a-z0-9-]+`, must equal the file name),
`name`, `kind` (`system` only for Ubuntu, otherwise `custom`) and a `light` and `dark`
variant. Each variant has:

- `base`: six hex colors — `background`, `foreground`, `accent`, `surface`, `success`, `error`;
- `overrides`: optional hex values for any derived key (`lib/palette.js` `DERIVED_KEYS`);
- `terminal`: `foreground`, `background`, `cursor`, `palette` (16 colors) — derived from
  `base` when missing;
- `wallpaper`: `{type: none|solid|gradient|file, color|from,to|path}`;
- `iconTheme`, `vscodeTheme`, `vscodeExtension` (marketplace id) — optional.

Built-in families live in `extension/themes`, user families in
`~/.config/paletka/themes`. `lib/store.js` loads both (user files cannot shadow built-in
ids), validates them (`lib/model.js`) and watches the user directory.

`lib/palette.js` derives the full palette (≈36 keys: window/view/headerbar/sidebar/card/
popover/dialog colors, accent text that keeps 4.5:1 contrast, warning, border, hover,
selection, panel and OSD colors) from the six base colors, then applies `overrides`.

## What gets themed and how

| Target | Mechanism | Live? |
|---|---|---|
| GNOME Shell | generated stylesheet `~/.cache/paletka/shell-<id>-<variant>.css` loaded with `St.ThemeContext` | yes |
| GTK4 / libadwaita | `~/.config/gtk-4.0/gtk.css` with libadwaita CSS variables, dark values under `@media (prefers-color-scheme: dark)` | light/dark yes, new family on app restart |
| GTK3 and Electron | named themes `~/.local/share/themes/paletka-<id>-<light\|dark>` that `@import` adw-gtk3 and override its `@define-color`s; `gtk-theme` is switched | yes |
| Accent | `accent-color` set to the nearest GNOME accent | yes |
| Ptyxis | palette files in `~/.local/share/org.gnome.Ptyxis/palettes`, profile `palette` key, `interface-style` forced to `system` | yes |
| GNOME Terminal | default legacy profile color keys | yes |
| Text Editor | GtkSourceView 5 schemes `~/.local/share/gtksourceview-5/styles/paletka-*.xml` (linked light/dark), `style-scheme` + `style-variant=follow` | after the editor restarts once |
| VS Code | `settings.json` of Code / Code - OSS / VSCodium: `window.autoDetectColorScheme`, `workbench.preferredLight/DarkColorTheme`, only for installed themes | yes |
| Wallpaper | generated SVG in `~/.local/share/backgrounds/paletka` or a user file; `picture-uri(-dark)` | yes |
| Icons | `icon-theme` (Yaru names follow light/dark) | yes |

Findings that shaped this:

- libadwaita 1.9 reads only CSS custom properties from `gtk.css`; Yaru still honours some
  legacy `@define-color` names, so a foreign `gtk.css` with them (e.g. from Gradience) can
  break dark mode — Paletka warns about it.
- Running GTK apps never reload `gtk.css`, so a family switch reaches open windows only after
  a restart. Electron/Chromium picks light/dark from the GTK3 window background, which is
  why GTK3 uses named themes (reloaded live when `gtk-theme` changes) instead of
  `~/.config/gtk-3.0/gtk.css`.

## Applying (lib/applier.js)

- `applyFamily(family, isDark)` — snapshot, install adw-gtk3 if needed, write GTK4 CSS and
  GTK3 themes, Ptyxis, wallpapers, Text Editor, VS Code, then `applyVariant`, then restart
  services if enabled.
- `applyVariant(family, isDark)` — the cheap part that differs between light and dark:
  `gtk-theme`, accent, GNOME Terminal, icons, shell stylesheet.
- `restoreSystem(isDark)` — compare-and-restore from the backup, remove generated themes,
  palettes, shell CSS and unused wallpapers.
- `isApplied()` / `removeLeftovers()` — used on disable (below).

`extension.js` serialises all work through one promise queue; every enable/disable bumps a
generation token so async work started earlier never touches the shell after it resumes.

### Backup and compare-and-restore (lib/backup.js)

Before the first write Paletka snapshots every setting it may change (value and whether it
was at its default) and the files it may replace (copies, or the target of a symlink) into
`~/.local/share/paletka/backup`. It records every value it writes. Restoring puts a setting
back only if it still holds what Paletka wrote — anything the user changed meanwhile is kept
— and resets keys that were at their default instead of pinning them. Files are restored only
if they still carry Paletka's generated header. Yaru theme names are restored in the variant
matching the current color scheme.

VS Code settings go through the same path: `lib/jsonFileSettings.js` exposes top-level
`settings.json` keys as setting refs (`{schema: 'jsonfile', path, key}`), edited with a
comment- and format-preserving JSONC editor (`lib/jsonc.js`).

### Services (lib/services.js)

After a family switch: `systemctl --user try-restart xdg-desktop-portal-gnome.service`
(file chooser dialogs), and Files / Software are quit and restarted:

- Files with open windows is restarted right away and its windows are reopened at their
  first location (`org.freedesktop.FileManager1` `OpenWindowsWithLocations`).
- `nautilus --quit` aborts running copies, so the Files process (PID of the session D-Bus
  name owner) is sampled from `/proc/<pid>/io` for 3 s first; while I/O is continuous the
  restart is retried every 30 s.
- Apps without windows are quit once their last window closes.

## Enable and disable

- `session-modes: user, unlock-dialog` — the extension stays enabled on the lock screen
  (the tile is hidden), so locking never resets the theme. The shell does not disable
  extensions at logout.
- `enable()` adds the tile after the Dark Style tile, writes the Text Editor schemes and
  re-applies the active family: only `applyVariant` when the backup exists (normal login),
  the full `applyFamily` when it does not (turned on again after a disable).
- `disable()` removes the tile, signals and stylesheet. If the extension is **really** being
  turned off — its state in `Main.extensionManager` is `DEACTIVATING`, which covers turning
  it off, uninstalling and updating — it also calls `restoreSystem` (without service
  restarts) and `removeLeftovers` (Text Editor schemes, the bundled adw-gtk3 copy unless it
  is the current GTK theme). When the shell only re-orders extensions (disabling an
  extension enabled before Paletka disables and re-enables Paletka), the state stays
  `ACTIVE` and nothing is restored. `active-family` is never changed by disable.

## Quick Settings tile (lib/toggle.js)

`QuickMenuToggle` with one row per family and Dark/Light `St.Button`s. Signals:
`family-selected`, `variant-selected(id, dark)`, `edit-requested`. The stock Dark Style tile
is hooked so that clicking it while a custom family is active switches to `ubuntu`.

## Notifications

- legacy `gtk.css` warning;
- missing VS Code theme: critical banner with **Install theme** (runs
  `code --install-extension <id>`), expired after 10 s but kept in the list, once per family
  per session;
- "Theme changed" when open apps need a reopen.

## Tests

- `make test` — `gjs -m tests/run.js [filter]`, custom harness, fakes for settings and
  services, real files in a temp XDG tree.
- `make e2e` — `tests/e2e/run.sh` starts
  `gnome-shell --headless --wayland --no-x11 --virtual-monitor 1600x1000` with isolated
  XDG dirs and HOME, fake `code` and `systemctl`, a helper extension that unlocks
  `Eval`/`Screenshot`, and runs `tests/e2e/scenario.js` (apply, light/dark, GTK3/GTK4 probes,
  disable/enable restore, extension re-ordering, all families, Files restart while copying,
  Text Editor, restore, preferences). Screenshots go to `tests/e2e/out/`.

## Build and release

- `make zip` → `dist/paletka@adamciktomas.github.io.shell-extension.zip` (upload this to
  extensions.gnome.org).
- `make install` installs the zip for the current user.
- Version: `version-name` in `metadata.json` and the `po` headers.
