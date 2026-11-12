import {test} from 'node:test';
import assert from 'node:assert/strict';

import {firefoxThemeFor} from '../src/firefoxTheme.js';
import {statusText} from '../src/popup/status.js';
import {SOLARIZED_DARK} from './chrome.mjs';

test('Firefox browser colors come from the palette', () => {
    const c = SOLARIZED_DARK.colors;
    assert.deepEqual(firefoxThemeFor(SOLARIZED_DARK), {colors: {
        frame: c.headerbar_bg, frame_inactive: c.headerbar_bg, tab_background_text: c.headerbar_fg,
        tab_selected: c.background, tab_text: c.foreground, tab_line: c.accent,
        toolbar: c.background, toolbar_text: c.foreground, icons: c.foreground,
        toolbar_field: c.surface, toolbar_field_text: c.foreground,
        toolbar_field_focus: c.surface, toolbar_field_text_focus: c.foreground,
        popup: c.surface, popup_text: c.foreground, sidebar: c.surface, sidebar_text: c.foreground,
        ntp_background: c.background, ntp_text: c.foreground,
    }});
});

test('the popup explains each connection state', () => {
    assert.equal(statusText({state: 'connected', palette: SOLARIZED_DARK}), 'Solarized, dark');
    assert.equal(statusText({state: 'connected', palette: {version: 1, active: false}}), 'Ubuntu theme: pages keep their colors');
    assert.equal(statusText({state: 'connecting'}), 'Connecting to Paletka…');
    assert.match(statusText({state: 'no-host', browser: 'firefox'}), /Paletka → Settings → Browsers.*Firefox/);
    assert.match(statusText({state: 'needs-permission', browser: 'firefox'}), /allow Paletka/);
});
