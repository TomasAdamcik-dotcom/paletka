// Exposes top-level keys of a JSONC file (VS Code settings.json) through the
// same interface as GioSettingsAdapter, so Backup/Applier treat them alike.
// Refs look like {schema: 'jsonfile', path: '/…/settings.json', key: 'a.b'}.
import GLib from 'gi://GLib';

import {parseJsonc, setTopLevel, removeTopLevel} from './jsonc.js';

export const JSON_FILE_SCHEMA = 'jsonfile';

export class JsonFileSettings {
    constructor({fs, log = console.warn}) {
        this._fs = fs;
        this._log = log;
    }

    // Edit the file a symlink points to, so dotfile-managed links stay links.
    _target(path) {
        const link = this._fs.readLink(path);
        if (link === null)
            return path;
        return GLib.path_is_absolute(link) ? link : GLib.build_filenamev([GLib.path_get_dirname(path), link]);
    }

    // A missing file reads as an empty object. An existing file that cannot be
    // read, or is empty (e.g. VS Code is in the middle of writing it), must
    // never be treated as empty: writing it would replace the user's settings.
    _read(path) {
        const text = this._fs.readText(path);
        if (text === null && !this._fs.exists(path))
            return '{}\n';
        if (text === null || text.trim() === '')
            throw new Error('cannot read it or it is empty');
        return text;
    }

    // Writes an edit only if the result still parses and holds the intended value.
    _write(path, text, key, value) {
        const parsed = parseJsonc(text);
        if (JSON.stringify(parsed[key]) !== JSON.stringify(value ?? undefined))
            throw new Error(`editing ${key} in ${path} would break the file`);
        this._fs.writeText(this._target(path), text);
    }

    exists(ref) {
        if (!this._fs.isDir(GLib.path_get_dirname(ref.path)))
            return false;
        try {
            parseJsonc(this._read(ref.path));
            return true;
        } catch (e) {
            const msg = `leaving ${ref.path} alone: ${e.message}`;
            if (msg !== this._lastError)
                this._log(msg);
            this._lastError = msg;
            return false;
        }
    }

    get(ref) {
        const value = parseJsonc(this._read(ref.path))[ref.key];
        return value === undefined ? null : value;
    }

    isUserSet(ref) {
        return Object.hasOwn(parseJsonc(this._read(ref.path)), ref.key);
    }

    set(ref, value) {
        this._write(ref.path, setTopLevel(this._read(ref.path), ref.key, value), ref.key, value);
    }

    reset(ref) {
        if (!this._fs.exists(ref.path))
            return;
        let text;
        try {
            text = removeTopLevel(this._read(ref.path), ref.key);
            parseJsonc(text);
        } catch (e) {
            throw new Error(`editing ${ref.key} in ${ref.path} would break the file: ${e.message}`);
        }
        this._write(ref.path, text, ref.key, undefined);
    }
}

export class CompositeSettings {
    constructor(gsettings, jsonFile) {
        this._g = gsettings;
        this._j = jsonFile;
    }

    _for(ref) {
        return ref.schema === JSON_FILE_SCHEMA ? this._j : this._g;
    }

    exists(ref) {
        return this._for(ref).exists(ref);
    }

    get(ref) {
        return this._for(ref).get(ref);
    }

    set(ref, value) {
        this._for(ref).set(ref, value);
    }

    isUserSet(ref) {
        return this._for(ref).isUserSet(ref);
    }

    reset(ref) {
        this._for(ref).reset(ref);
    }

    destroy() {
        this._g.destroy?.();
    }
}
