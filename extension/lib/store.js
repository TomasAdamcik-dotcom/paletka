// Loads built-in and user theme families; saves, removes, imports and exports user ones.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {BUILTIN_IDS, validateFamily, normalizeFamily, uniqueId} from './model.js';

export class ThemeStore {
    constructor({builtinDir, userDir, fs, log = console.warn}) {
        this._builtinDir = builtinDir;
        this._userDir = userDir;
        this._fs = fs;
        this._log = log;
        this._logged = new Set();
    }

    // Themes are reloaded often; report each problem once.
    _logOnce(msg) {
        if (this._logged.has(msg))
            return;
        this._logged.add(msg);
        this._log(msg);
    }

    get userDir() {
        return this._userDir;
    }

    _parse(path) {
        const text = this._fs.readText(path);
        let obj;
        try {
            obj = JSON.parse(text);
        } catch (e) {
            return {error: `invalid JSON: ${e.message}`};
        }
        const {ok, errors} = validateFamily(obj);
        return ok ? {family: normalizeFamily(obj)} : {error: errors.join('; ')};
    }

    _builtins() {
        return BUILTIN_IDS.map(id => this._parse(`${this._builtinDir}/${id}.json`).family).filter(Boolean);
    }

    _userFamilies() {
        const result = [];
        for (const name of this._fs.listDir(this._userDir)) {
            if (!name.endsWith('.json'))
                continue;
            const {family, error} = this._parse(`${this._userDir}/${name}`);
            if (error)
                this._logOnce(`skipping ${name}: ${error}`);
            else if (BUILTIN_IDS.includes(family.id))
                this._logOnce(`skipping ${name}: id "${family.id}" is reserved`);
            else if (name !== `${family.id}.json`)
                this._logOnce(`skipping ${name}: file name must be "${family.id}.json"`);
            else
                result.push(family);
        }
        return result.sort((a, b) => a.name.localeCompare(b.name));
    }

    loadAll() {
        return [...this._builtins(), ...this._userFamilies()];
    }

    // Every id in use, including user files that currently fail to load,
    // so new themes never overwrite them.
    takenIds() {
        const fileIds = this._fs.listDir(this._userDir)
            .filter(n => n.endsWith('.json'))
            .map(n => n.slice(0, -5));
        return [...new Set([...BUILTIN_IDS, ...fileIds, ...this.loadAll().map(f => f.id)])];
    }

    get(id) {
        if (BUILTIN_IDS.includes(id))
            return this._parse(`${this._builtinDir}/${id}.json`).family ?? null;
        if (!/^[a-z0-9-]+$/.test(id))
            return null;
        const path = `${this._userDir}/${id}.json`;
        if (!this._fs.exists(path))
            return null;
        const {family} = this._parse(path);
        return family?.id === id ? family : null;
    }

    save(family) {
        if (BUILTIN_IDS.includes(family.id))
            throw new Error(`Built-in theme "${family.id}" is read-only`);
        const {ok, errors} = validateFamily(family);
        if (!ok)
            throw new Error(`Invalid theme: ${errors.join('; ')}`);
        this._fs.writeText(`${this._userDir}/${family.id}.json`, `${JSON.stringify(family, null, 2)}\n`);
    }

    remove(id) {
        if (BUILTIN_IDS.includes(id))
            throw new Error(`Built-in theme "${id}" cannot be deleted`);
        this._fs.remove(`${this._userDir}/${id}.json`);
    }

    exportTo(id, path) {
        const family = this.get(id);
        if (!family)
            throw new Error(`Unknown theme "${id}"`);
        this._fs.writeText(path, `${JSON.stringify(family, null, 2)}\n`);
    }

    importFrom(path) {
        const {family, error} = this._parse(path);
        if (error)
            throw new Error(error);
        if (family.kind !== 'custom')
            throw new Error('Only custom themes can be imported');
        const ids = this.takenIds();
        const imported = {...family, id: ids.includes(family.id) ? uniqueId(family.id, ids) : family.id};
        this.save(imported);
        return imported;
    }

    // Calls cb(changedId|null) (debounced) when user theme files change.
    // Returns a function that stops monitoring.
    monitor(cb) {
        this._fs.mkdirp(this._userDir);
        const monitor = Gio.File.new_for_path(this._userDir).monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
        const pending = new Set();
        let timeoutId = 0;
        const changedId = monitor.connect('changed', (_m, file, otherFile) => {
            for (const f of [file, otherFile]) {
                const name = f?.get_basename();
                if (name?.endsWith('.json'))
                    pending.add(name.slice(0, -5));
            }
            if (timeoutId)
                GLib.source_remove(timeoutId);
            timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                timeoutId = 0;
                const ids = [...pending];
                pending.clear();
                if (ids.length === 0)
                    cb(null);
                for (const id of ids)
                    cb(id);
                return GLib.SOURCE_REMOVE;
            });
        });
        return () => {
            if (timeoutId)
                GLib.source_remove(timeoutId);
            monitor.disconnect(changedId);
            monitor.cancel();
        };
    }
}
