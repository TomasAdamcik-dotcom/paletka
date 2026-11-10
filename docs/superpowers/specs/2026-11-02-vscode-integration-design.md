# VS Code integration — short design

Date: 2026-11-02 · Builds on `2026-11-02-desktop-themes-design.md`

## Intent
VS Code should follow the desktop theme automatically, like the rest of the desktop:
switching family changes its color theme, Dark Style switches light/dark live.

## Decided with the user
- VS Code is driven through its user `settings.json` (not by generating VS Code themes; that is
  a possible later step).
- Claude Code in the terminal: no integration code. The user sets `/theme` → `dark-ansi` once;
  it then uses the terminal palette the extension already themes. The extension never touches
  `~/.claude.json`.
- The Claude desktop app (Electron) cannot be recolored beyond light/dark; nothing to build.

## Behaviour
- Each family variant gets an optional `vscodeTheme` (VS Code theme id, e.g. `"Solarized Light"`;
  `null` = keep the user's own). Solarized ships `Solarized Light` / `Solarized Dark`.
- On applying a custom family, for every VS Code flavour whose `User` dir exists
  (`~/.config/Code`, `~/.config/Code - OSS`, `~/.config/VSCodium`) the extension sets, in
  `User/settings.json`: `window.autoDetectColorScheme: true`,
  `workbench.preferredLightColorTheme`, `workbench.preferredDarkColorTheme`.
  VS Code watches the file → live; it follows the system color scheme by itself.
- If both variants are `null`, those keys revert to the user's originals.
- Restore to Ubuntu uses the existing compare-and-restore backup: keys the extension added are
  removed, keys it changed get their old value, keys the user changed meanwhile are kept.
- `settings.json` is JSONC: edits touch only the three top-level properties; comments,
  formatting and every other key stay byte-identical. A file that cannot be parsed is left
  alone (logged). A missing `settings.json` in an existing `User` dir is created as `{}`.
- Editor: new "VS Code" group per variant — combo of installed VS Code color themes (built-in
  extensions of the snap/deb install + `~/.vscode/extensions`), filtered to light themes for
  the light variant and dark themes for the dark one, plus "Keep current VS Code theme".

## Approaches considered
- **settings.json preferred themes + autoDetect (chosen):** live, no restart, uses VS Code's own
  mechanism, trivially reversible.
- Set `workbench.colorTheme` on every variant change: works but duplicates what autoDetect does
  and fights users who toggle themes inside VS Code.
- Generate a VS Code theme extension from the palette: exact colors for custom families, but
  needs a VS Code window reload to discover a new extension and much more code. Deferred.

## Builder's calls
JSONC editor implementation, theme discovery details, labels.
