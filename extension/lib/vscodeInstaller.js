// Installs VS Code theme extensions through the VS Code command line.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const CLIS = ['code', 'codium', 'code-oss'];

function spawnChecked(argv) {
    return new Promise((resolve, reject) => {
        try {
            const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
            proc.wait_check_async(null, (p, res) => {
                try {
                    p.wait_check_finish(res);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        } catch (e) {
            reject(e);
        }
    });
}

// Returns {ok: true} or {ok: false, error} ('no-cli' when VS Code has no CLI).
export async function installVscodeExtensions(ids, {
    findProgram = name => GLib.find_program_in_path(name),
    spawn = spawnChecked,
} = {}) {
    const cli = CLIS.map(findProgram).find(Boolean);
    if (!cli)
        return {ok: false, error: 'no-cli'};
    try {
        for (const id of ids)
            await spawn([cli, '--install-extension', id]);
        return {ok: true};
    } catch (e) {
        return {ok: false, error: e.message};
    }
}
