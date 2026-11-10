// Snapshot of the user's original look, restored with compare-and-restore:
// only values that still hold what we wrote are put back.
import {hasGeneratedHeader} from './gtkCss.js';

const keyOf = ref => `${ref.schema}|${ref.path ?? ''}|${ref.key}`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const YARU_RE = /^Yaru(-[a-z]+)?(-dark)?$/;
const VARIANT_AWARE_KEYS = ['gtk-theme', 'icon-theme'];

// Yaru names come in light/dark pairs; restore the one matching the current scheme.
export function yaruForScheme(name, isDark) {
    if (typeof name !== 'string' || !YARU_RE.test(name))
        return name;
    const light = name.replace(/-dark$/, '');
    return isDark ? `${light}-dark` : light;
}

export class Backup {
    constructor({dir, fs, settings}) {
        this._dir = dir;
        this._fs = fs;
        this._settings = settings;
        this._statePath = `${dir}/state.json`;
    }

    has() {
        return this.state() !== null;
    }

    // Only this extension writes the state file, so it is read once and kept.
    state() {
        if (this._state === undefined) {
            const text = this._fs.readText(this._statePath);
            this._state = null;
            if (text !== null) {
                try {
                    this._state = JSON.parse(text);
                } catch {
                    // Cut short (e.g. power loss): keep it for inspection, start over.
                    this._fs.copyFile(this._statePath, `${this._statePath}.broken`);
                    this._fs.remove(this._statePath);
                }
            }
        }
        return this._state;
    }

    _save(state) {
        this._state = state;
        this._fs.writeText(this._statePath, JSON.stringify(state, null, 2));
    }

    // Takes the snapshot unless one exists; returns whether it was taken now.
    snapshot(refs, files) {
        if (this.has())
            return false;
        const settings = refs
            .filter(ref => this._settings.exists(ref))
            .map(ref => ({ref, value: this._settings.get(ref), isDefault: !this._settings.isUserSet(ref)}));
        const fileEntries = files.map((path, i) => {
            const symlink = this._fs.readLink(path);
            const existed = this._fs.exists(path);
            const copy = `${this._dir}/files/${i}`;
            if (existed && !symlink)
                this._fs.copyFile(path, copy);
            return {path, existed, copy, symlink};
        });
        this._save({settings, files: fileEntries, written: {}});
        return true;
    }

    // Adds refs that were not available when the snapshot was taken (e.g. a
    // settings file that was unparsable then), so they are restored too.
    extend(refs) {
        const state = this.state();
        if (!state)
            return;
        const known = new Set(state.settings.map(s => keyOf(s.ref)));
        const added = refs
            .filter(ref => !known.has(keyOf(ref)) && this._settings.exists(ref))
            .map(ref => ({ref, value: this._settings.get(ref), isDefault: !this._settings.isUserSet(ref)}));
        if (added.length) {
            state.settings.push(...added);
            this._save(state);
        }
    }

    // Whether the snapshot holds an identical copy of the file at `path`.
    hasCopyOf(path) {
        const entry = this.state()?.files.find(f => f.path === path);
        if (!entry?.existed || entry.symlink)
            return false;
        const current = this._fs.readText(path);
        return current !== null && current === this._fs.readText(entry.copy);
    }

    // Snapshot entry {value, isDefault} of a setting, or null when not snapshotted.
    originalEntry(ref) {
        return this.state()?.settings.find(s => keyOf(s.ref) === keyOf(ref)) ?? null;
    }

    // Original value of a setting, or null when it was not snapshotted.
    original(ref) {
        return this.originalEntry(ref)?.value ?? null;
    }

    recordWritten(ref, value) {
        const state = this.state();
        const key = keyOf(ref);
        if (!state || (key in state.written && same(state.written[key], value)))
            return;
        state.written[key] = value;
        this._save(state);
    }

    // Puts back what Paletka changed and nothing else. Each item is restored
    // on its own, so one failure does not leave the rest applied.
    restore(isDark, log = () => {}) {
        const state = this.state();
        if (!state)
            return;
        for (const {ref, value, isDefault} of state.settings) {
            const key = keyOf(ref);
            try {
                // Never written by Paletka, or changed by the user since: keep it.
                if (!(key in state.written) || !this._settings.exists(ref) ||
                    !same(this._settings.get(ref), state.written[key]))
                    continue;
                const restored = VARIANT_AWARE_KEYS.includes(ref.key) ? yaruForScheme(value, isDark) : value;
                if (isDefault && same(restored, value))
                    // Keep following the schema default instead of pinning today's value.
                    this._settings.reset(ref);
                else
                    this._settings.set(ref, restored);
            } catch (e) {
                log(`cannot restore ${ref.schema} ${ref.key}: ${e.message}`);
            }
        }
        for (const {path, existed, copy, symlink} of state.files) {
            try {
                const current = this._fs.readText(path);
                if (current !== null && !hasGeneratedHeader(current)) {
                    // Someone wrote a new file meanwhile; keep it, but never lose the original.
                    if (existed && !symlink) {
                        this._fs.copyFile(copy, `${path}.paletka-original`);
                        log(`${path} was replaced meanwhile; the original is in ${path}.paletka-original`);
                    }
                    continue;
                }
                this._fs.remove(path);
                if (symlink)
                    this._fs.symlink(symlink, path);
                else if (existed)
                    this._fs.copyFile(copy, path);
            } catch (e) {
                log(`cannot restore ${path}: ${e.message}`);
            }
        }
        this.clear();
    }

    clear() {
        this._fs.removeTree(this._dir);
        this._state = undefined;
    }
}
