# VS Code Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** VS Code follows the active theme family via its `settings.json`.
**Architecture:** A JSONC top-level property editor (pure), a `JsonFileSettings` adapter that exposes
JSON file keys through the same `exists/get/set/isUserSet/reset` interface as gsettings (refs
`{schema: 'jsonfile', path: <file>, key}`), routed by a `CompositeSettings`, so the existing
Backup/Applier compare-and-restore covers it unchanged.
**Tech Stack:** GJS, existing harness.
**Spec:** `docs/superpowers/specs/2026-11-02-vscode-integration-design.md`

## Global Constraints
- Never rewrite bytes of settings.json outside the three managed properties; unparsable file → skip.
- Settings keys: `window.autoDetectColorScheme`, `workbench.preferredLightColorTheme`, `workbench.preferredDarkColorTheme`.
- VS Code user dirs: `$XDG_CONFIG_HOME/{Code,Code - OSS,VSCodium}/User`.

## Review Focus
1. settings.json with comments, trailing commas, nested objects, empty object → only managed keys change.
2. Unparsable settings.json → untouched, others still applied.
3. VS Code not installed (no User dir) → nothing created.
4. User changes the VS Code theme keys while a family is active → kept on restore.
5. Family with `vscodeTheme: null` → keys revert to originals.

### Task 1: JSONC property editor
**Files:** `extension/lib/jsonc.js`, `tests/jsonc.test.js`
- Produces: `parseJsonc(text): any` (throws on invalid; tolerates // /* */ comments and trailing commas),
  `setTopLevel(text, key, value): string`, `removeTopLevel(text, key): string`.
- Tests: set existing key keeps comments/other bytes; set new key in `{}` and in non-empty object
  (with/without trailing comma, with trailing comment); remove first/middle/last key; nested object
  values with same key name untouched; strings containing `//` and `}` handled; invalid text throws.
- [ ] RED → GREEN → commit `feat: JSONC top-level property editor`

### Task 2: JSON file settings adapter + composite
**Files:** `extension/lib/jsonFileSettings.js`, `tests/jsonFileSettings.test.js`; modify `extension/extension.js`
- Produces: `class JsonFileSettings {constructor({fs, log}); exists(ref) /* parent dir exists and file parses or is missing */; get; set; isUserSet; reset}` for refs with `schema === 'jsonfile'`; `class CompositeSettings {constructor(gsettings, jsonFile)}` routing by schema, `destroy()` forwards.
- [ ] RED → GREEN → commit `feat: JSON file settings adapter`

### Task 3: Model, applier, built-in theme
**Files:** modify `extension/lib/model.js`, `extension/lib/applier.js`, `extension/lib/paths.js`, `extension/themes/solarized.json`, tests.
- `variant.vscodeTheme` (string|null) validated/normalized; `setVscodeTheme(f, variant, id|null)`.
- `paths.vscodeUserDirs` = the three dirs; Applier snapshots the 3 keys for each existing dir and in
  `applyFamily` sets them (or reverts to originals when both variants null).
- Tests: apply sets 3 keys and keeps comment; restore removes added keys / restores old values;
  user change kept; missing dir untouched; null themes revert; unparsable file untouched.
- [ ] RED → GREEN → commit `feat: apply VS Code theme from family`

### Task 4: Editor + theme discovery + E2E
**Files:** `extension/lib/vscodeThemes.js`, `tests/vscodeThemes.test.js`, modify `familyEditorPage.js`, `tests/e2e/*`, `po/*`.
- `listVscodeThemes(fs, extensionDirs): {id, uiTheme}[]` from `package.json` `contributes.themes` (id ?? label, skip `%…%` labels without id).
- E2E: seed `Code/User/settings.json` with a comment; after Solarized the 3 keys present and comment kept; after Ubuntu file byte-identical.
- [ ] RED → GREEN → commit `feat: VS Code theme picker in editor`
