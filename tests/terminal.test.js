import {test, assert, assertEq} from './harness.js';
import {loadBuiltin} from './fixtures.js';
import {ptyxisPalette, ptyxisPaletteId, gnomeTerminalValues, GNOME_TERMINAL_KEYS} from '../extension/lib/terminal.js';

const sol = loadBuiltin('solarized');

function section(ini, name) {
    const start = ini.indexOf(`[${name}]`);
    assert(start >= 0, `missing [${name}]`);
    const next = ini.indexOf('\n[', start + 1);
    return ini.slice(start, next < 0 ? undefined : next);
}

test('terminal: ptyxis palette has light and dark sections', () => {
    const ini = ptyxisPalette(sol);
    assert(section(ini, 'Palette').includes('Name=Solarized (Paletka)'));
    assert(section(ini, 'Light').includes('Background=#fdf6e3'));
    assert(section(ini, 'Dark').includes('Background=#002b36'));
    assert(section(ini, 'Dark').includes('Color15=#fdf6e3'));
    assert(section(ini, 'Light').includes('TitlebarForeground=#657b83'));
    assertEq(ptyxisPaletteId(sol), 'paletka-solarized');
});

test('terminal: gnome terminal values', () => {
    const v = gnomeTerminalValues(sol.dark.terminal);
    assertEq(v['use-theme-colors'], false);
    assertEq(v['background-color'], '#002b36');
    assertEq(v.palette.length, 16);
    assertEq(Object.keys(v).sort(), [...GNOME_TERMINAL_KEYS].sort());
});
