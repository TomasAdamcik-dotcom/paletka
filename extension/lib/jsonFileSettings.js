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

    _read(path) {
        const text = this._fs.readText(path);
        return text === null || text.trim() === '' ? '{}\n' : text;
    }

    exists(ref) {
        if (!this._fs.isDir(GLib.path_get_dirname(ref.path)))
            return false;
        try {
            parseJsonc(this._read(ref.path));
            return true;
        } catch (e) {
            this._log(`Paletka: leaving ${ref.path} alone, cannot parse it: ${e.message}`);
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
        this._fs.writeText(this._target(ref.path), setTopLevel(this._read(ref.path), ref.key, value));
    }

    reset(ref) {
        const text = this._fs.readText(ref.path);
        if (text !== null)
            this._fs.writeText(this._target(ref.path), removeTopLevel(text, ref.key));
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
