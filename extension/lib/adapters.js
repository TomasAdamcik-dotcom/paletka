// Thin Gio wrappers so the applier can be tested with fakes.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export class GioFs {
    exists(path) {
        return GLib.file_test(path, GLib.FileTest.EXISTS) || this.readLink(path) !== null;
    }

    isDir(path) {
        return GLib.file_test(path, GLib.FileTest.IS_DIR);
    }

    readText(path) {
        try {
            const [, bytes] = Gio.File.new_for_path(path).load_contents(null);
            return decoder.decode(bytes);
        } catch {
            return null;
        }
    }

    mkdirp(path) {
        GLib.mkdir_with_parents(path, 0o755);
    }

    // Replaces the file atomically, keeping the permissions of an existing one
    // (e.g. a private 0600 settings file).
    writeText(path, text) {
        this.mkdirp(GLib.path_get_dirname(path));
        const file = Gio.File.new_for_path(path);
        let mode = null;
        try {
            mode = file.query_info('unix::mode', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null)
                .get_attribute_uint32('unix::mode') & 0o7777;
        } catch {
            // New file: default permissions.
        }
        file.replace_contents(encoder.encode(text), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        if (mode !== null)
            file.set_attribute_uint32('unix::mode', mode, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    }

    remove(path) {
        try {
            Gio.File.new_for_path(path).delete(null);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                throw e;
        }
    }

    removeTree(path) {
        if (this.isDir(path) && !GLib.file_test(path, GLib.FileTest.IS_SYMLINK)) {
            for (const name of this.listDir(path))
                this.removeTree(`${path}/${name}`);
        }
        this.remove(path);
    }

    listDir(path) {
        if (!this.isDir(path))
            return [];
        const names = [];
        const en = Gio.File.new_for_path(path).enumerate_children('standard::name',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        for (let info; (info = en.next_file(null));)
            names.push(info.get_name());
        return names.sort();
    }

    copyDir(src, dest) {
        this.mkdirp(dest);
        for (const name of this.listDir(src)) {
            const s = `${src}/${name}`, d = `${dest}/${name}`;
            if (this.isDir(s))
                this.copyDir(s, d);
            else
                Gio.File.new_for_path(s).copy(Gio.File.new_for_path(d), Gio.FileCopyFlags.OVERWRITE, null, null);
        }
    }

    // Target of a symlink, or null when path is not a symlink.
    readLink(path) {
        try {
            const info = Gio.File.new_for_path(path).query_info('standard::is-symlink,standard::symlink-target',
                Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
            return info.get_is_symlink() ? info.get_symlink_target() : null;
        } catch {
            return null;
        }
    }

    symlink(target, path) {
        this.mkdirp(GLib.path_get_dirname(path));
        Gio.File.new_for_path(path).make_symbolic_link(target, null);
    }

    copyFile(src, dest) {
        this.mkdirp(GLib.path_get_dirname(dest));
        Gio.File.new_for_path(src).copy(Gio.File.new_for_path(dest), Gio.FileCopyFlags.OVERWRITE, null, null);
    }
}

export class GioSettingsAdapter {
    constructor() {
        this._cache = new Map();
    }

    _lookup(ref) {
        const schema = Gio.SettingsSchemaSource.get_default().lookup(ref.schema, true);
        if (!schema || !schema.has_key(ref.key))
            return null;
        const id = `${ref.schema}|${ref.path ?? ''}`;
        if (!this._cache.has(id)) {
            this._cache.set(id, ref.path
                ? new Gio.Settings({settings_schema: schema, path: ref.path})
                : new Gio.Settings({settings_schema: schema}));
        }
        return this._cache.get(id);
    }

    exists(ref) {
        try {
            return this._lookup(ref) !== null;
        } catch {
            return false;
        }
    }

    get(ref) {
        const s = this._lookup(ref);
        if (!s)
            throw new Error(`Unknown setting ${ref.schema} ${ref.key}`);
        return s.get_value(ref.key).recursiveUnpack();
    }

    isUserSet(ref) {
        const s = this._lookup(ref);
        if (!s)
            throw new Error(`Unknown setting ${ref.schema} ${ref.key}`);
        return s.get_user_value(ref.key) !== null;
    }

    reset(ref) {
        const s = this._lookup(ref);
        if (!s)
            throw new Error(`Unknown setting ${ref.schema} ${ref.key}`);
        s.reset(ref.key);
    }

    set(ref, value) {
        const s = this._lookup(ref);
        if (!s)
            throw new Error(`Unknown setting ${ref.schema} ${ref.key}`);
        const type = s.get_value(ref.key).get_type_string();
        s.set_value(ref.key, new GLib.Variant(type, value));
    }

    // Releases cached Gio.Settings objects (call from disable()).
    destroy() {
        this._cache.clear();
    }
}
