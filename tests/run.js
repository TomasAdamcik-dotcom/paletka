// Runs every tests/*.test.js file: gjs -m tests/run.js [filter]
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';
import {registry, tmpDirs} from './harness.js';
import {GioFs} from '../extension/lib/adapters.js';

const dir = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const filter = ARGV[0] ?? '';

const enumerator = Gio.File.new_for_path(dir).enumerate_children('standard::name', 0, null);
const files = [];
for (let info; (info = enumerator.next_file(null));) {
    const name = info.get_name();
    if (name.endsWith('.test.js') && name.includes(filter))
        files.push(name);
}
files.sort();
for (const f of files)
    await import(`./${f}`);

let failed = 0;
for (const {name, fn} of registry) {
    try {
        await fn();
        print(`ok   ${name}`);
    } catch (e) {
        failed++;
        print(`FAIL ${name}\n     ${e.message}`);
    }
}
const fs = new GioFs();
for (const dir of tmpDirs)
    fs.removeTree(dir);
print(`\n${registry.length - failed}/${registry.length} passed`);
System.exit(failed ? 1 : 0);
