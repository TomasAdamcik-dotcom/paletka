import GLib from 'gi://GLib';

const root = GLib.path_get_dirname(GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]));
export const EXT_DIR = `${root}/extension`;

export function loadBuiltin(id) {
    const [, bytes] = GLib.file_get_contents(`${EXT_DIR}/themes/${id}.json`);
    return JSON.parse(new TextDecoder().decode(bytes));
}
