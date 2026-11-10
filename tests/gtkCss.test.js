import {test, assert, assertEq} from './harness.js';
import {loadBuiltin} from './fixtures.js';
import {gtk4Css, gtk3ThemeCss, gtk3ThemeName, hasGeneratedHeader, GENERATED_HEADER} from '../extension/lib/gtkCss.js';

const sol = loadBuiltin('solarized');

test('gtkCss: gtk4 has light vars then dark media query', () => {
    const css = gtk4Css(sol);
    assert(css.startsWith(GENERATED_HEADER), 'header first');
    const media = css.indexOf('@media (prefers-color-scheme: dark)');
    assert(media > 0, 'media query present');
    const light = css.indexOf('--window-bg-color: #fdf6e3;');
    const dark = css.indexOf('--window-bg-color: #002b36;');
    assert(light > 0 && light < media, 'light before media');
    assert(dark > media, 'dark inside media');
    assert(css.includes('--accent-bg-color: #268bd2;'));
    assert(css.includes('--headerbar-border-color:'));
    assert(!css.includes('@define-color'), 'no legacy syntax');
    assert(!css.includes('--panel-bg-color'), 'shell-only keys omitted');
});

test('gtkCss: gtk3 theme imports adw-gtk3 and adds one variant of named colors', () => {
    const css = gtk3ThemeCss(sol, true, '/x/themes/adw-gtk3-dark/gtk-3.0/gtk.css');
    assert(css.startsWith(GENERATED_HEADER));
    assert(css.includes('@import url("file:///x/themes/adw-gtk3-dark/gtk-3.0/gtk.css");'));
    assert(css.indexOf('@import') < css.indexOf('@define-color'), 'import first');
    assert(css.includes('@define-color window_bg_color #002b36;'));
    assert(css.includes('@define-color headerbar_backdrop_color #002b36;'));
    assert(css.includes('@define-color borders '));
    assertEq(gtk3ThemeName(sol, true), 'paletka-solarized-dark');
});

test('gtkCss: header detection', () => {
    assertEq(hasGeneratedHeader(gtk4Css(sol)), true);
    assertEq(hasGeneratedHeader('@define-color accent_color #1c71d8;\n'), false);
    assertEq(hasGeneratedHeader(null), false);
});

import {hasLegacyColorDefinitions} from '../extension/lib/gtkCss.js';

test('gtkCss: detects legacy @define-color surface colors in a foreign gtk.css', () => {
    assertEq(hasLegacyColorDefinitions('@define-color window_bg_color #fafafa;\n'), true);
    assertEq(hasLegacyColorDefinitions('/* x */\n  @define-color view_bg_color #fff;'), true);
    assertEq(hasLegacyColorDefinitions('@define-color accent_color #1c71d8;\n'), false);
    assertEq(hasLegacyColorDefinitions('button { color: red; }'), false);
    assertEq(hasLegacyColorDefinitions(gtk4Css(sol)), false);
    assertEq(hasLegacyColorDefinitions(null), false);
});

test('gtkCss: the import path is a proper file URI', () => {
    const css = gtk3ThemeCss(sol, true, '/home/a "b"#1%/adw-gtk3-dark/gtk-3.0/gtk.css');
    assert(css.includes('@import url("file:///home/a%20%22b%22%231%25/adw-gtk3-dark/gtk-3.0/gtk.css");'), css);
});
