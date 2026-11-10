// Lists VS Code color themes contributed by installed VS Code extensions.
import {parseJsonc} from './jsonc.js';

export const VSCODE_EXTENSION_DIRS = home => [
    '/snap/code/current/usr/share/code/resources/app/extensions',
    '/usr/share/code/resources/app/extensions',
    '/usr/lib/code/extensions',
    `${home}/.vscode/extensions`,
    `${home}/.vscode-oss/extensions`,
];

const DARK_UI = ['vs-dark', 'hc-black'];

// Returns [{id, dark}] sorted by id; id is what workbench.*ColorTheme expects.
export function listVscodeThemes(fs, extensionDirs) {
    const themes = new Map();
    for (const dir of extensionDirs) {
        for (const name of fs.listDir(dir)) {
            const text = fs.readText(`${dir}/${name}/package.json`);
            if (!text)
                continue;
            let pkg;
            try {
                pkg = parseJsonc(text);
            } catch {
                continue;
            }
            for (const t of pkg?.contributes?.themes ?? []) {
                const id = t.id ?? (t.label?.startsWith('%') ? null : t.label);
                if (id)
                    themes.set(id, {id, dark: DARK_UI.includes(t.uiTheme)});
            }
        }
    }
    return [...themes.values()].sort((x, y) => x.id.localeCompare(y.id));
}
