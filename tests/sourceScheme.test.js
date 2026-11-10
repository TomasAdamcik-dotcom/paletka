import GLib from 'gi://GLib';

import {test, assert, assertEq, tmpDir} from './harness.js';
import {loadBuiltin} from './fixtures.js';
import {sourceSchemeXml, sourceSchemeId} from '../extension/lib/sourceScheme.js';
import {contrastRatio, parseHex} from '../extension/lib/color.js';

// Parses the scheme with Python's XML parser (well-formedness) and returns
// {id, name, metadata: {}, styles: {name: {attr: value}}}.
function parse(xml) {
    const dir = tmpDir();
    GLib.file_set_contents(`${dir}/s.xml`, xml);
    const script = `
import json, sys, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
assert root.tag == "style-scheme"
print(json.dumps({"id": root.get("id"), "name": root.get("name"),
    "metadata": {p.get("name"): p.text for p in root.iter("property")},
    "styles": {s.get("name"): dict(s.attrib) for s in root.iter("style")}}))`;
    const [, out, err, status] = GLib.spawn_sync(null, ['python3', '-c', script, `${dir}/s.xml`], null,
        GLib.SpawnFlags.SEARCH_PATH, null);
    if (status !== 0)
        throw new Error(`invalid XML: ${new TextDecoder().decode(err)}`);
    return JSON.parse(new TextDecoder().decode(out));
}

test('sourceScheme: ids pair light and dark', () => {
    const sol = loadBuiltin('solarized');
    assertEq(sourceSchemeId(sol, false), 'paletka-solarized-light');
    assertEq(sourceSchemeId(sol, true), 'paletka-solarized-dark');
});

for (const id of ['solarized', 'gruvbox', 'nord', 'dracula']) {
    test(`sourceScheme: ${id} schemes are valid, linked and readable`, () => {
        const f = loadBuiltin(id);
        const light = parse(sourceSchemeXml(f, false));
        const dark = parse(sourceSchemeXml(f, true));
        assertEq(light.id, `paletka-${id}-light`);
        assertEq(light.metadata, {'variant': 'light', 'dark-variant': `paletka-${id}-dark`});
        assertEq(dark.metadata, {'variant': 'dark', 'light-variant': `paletka-${id}-light`});
        assertEq(light.name, `${f.name} Light`);
        for (const [scheme, isDark] of [[light, false], [dark, true]]) {
            const text = scheme.styles.text;
            const bg = parseHex(text.background);
            assertEq(text.background, (isDark ? f.dark : f.light).base.background);
            assert(contrastRatio(parseHex(text.foreground), bg) >= 4.5, `${id} text contrast`);
            for (const name of ['def:keyword', 'def:string', 'def:type', 'def:function', 'def:comment']) {
                const fg = scheme.styles[name]?.foreground;
                assert(fg, `${id} ${name} styled`);
                assert(contrastRatio(parseHex(fg), bg) >= 3, `${id} ${isDark ? 'dark' : 'light'} ${name} readable (${fg})`);
            }
        }
    });
}
