import {test, assert} from './harness.js';
import {loadBuiltin} from './fixtures.js';
import {resolveVariant} from '../extension/lib/palette.js';
import {shellCss} from '../extension/lib/shellCss.js';
import {GENERATED_HEADER} from '../extension/lib/gtkCss.js';

const sol = loadBuiltin('solarized');

function rule(css, selector) {
    const i = css.indexOf(`${selector} {`);
    assert(i >= 0, `missing rule ${selector}`);
    return css.slice(i, css.indexOf('}', i));
}

test('shellCss: panel and checked toggle use palette', () => {
    const css = shellCss(resolveVariant(sol.dark, true), true);
    assert(css.startsWith(GENERATED_HEADER));
    assert(rule(css, '#panel').includes('#073642'), 'panel bg');
    assert(rule(css, '.quick-toggle:checked').includes('#268bd2'), 'accent');
});

test('shellCss: covers main shell surfaces', () => {
    const css = shellCss(resolveVariant(sol.light, false), false);
    for (const sel of ['#panel .panel-button', '.popup-menu-content', '.quick-settings', '.quick-toggle',
        '.quick-toggle-menu', '.message', '.osd-window', '.search-entry', '#dash .dash-background',
        '.modal-dialog', '.switcher-list', '.app-folder-dialog', '.calendar'])
        assert(css.includes(sel), `missing ${sel}`);
    assert(!css.includes('var('), 'St has no css variables');
});

test('shellCss: the active Dark/Light button in the theme menu uses the accent', () => {
    const css = shellCss(resolveVariant(sol.dark, true), true);
    assert(css.includes('.quick-toggle-menu .button.paletka-variant-active {'), 'scoped to the tile menu');
    const r = rule(css, '.paletka-variant-active');
    assert(r.includes('#268bd2') && r.includes('!important'), r);
});
