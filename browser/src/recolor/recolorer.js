// Recolors a page with a Paletka palette, from the computed styles of its
// elements. Elements are processed in chunks (the first one right away, the
// rest when the page is idle); within a chunk all styles are read before any is
// written. Original inline values are kept so revert() restores the page.
import {parseRgb, saturation, toCss} from './colors.js';
import {mapBackground, mapText, mapBorder, isNeutralGradient} from './mapping.js';

const SKIP = new Set(['HEAD', 'SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE', 'TEMPLATE', 'NOSCRIPT', 'BR',
    'IMG', 'VIDEO', 'CANVAS', 'PICTURE', 'IFRAME', 'EMBED', 'OBJECT']);
const COLOR_FN = /(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|#[0-9a-f]{3,8}\b/gi;
const STYLE_ID = 'paletka-style';
const WHITE = {r: 255, g: 255, b: 255, a: 1};

export class Recolorer {
    constructor(document, palette, {shadowRootOf = el => el.shadowRoot, chunkSize = 1000} = {}) {
        this._doc = document;
        this._shadowRootOf = shadowRootOf;
        this._chunkSize = chunkSize;
        this._cache = new Map();
        this._ctx = null;
        this._info = new WeakMap(); // element -> original colors and inline values
        this._touched = new Set();
        this._queue = [];
        this._scheduled = false;
        this._observer = null;
        this._applied = false;
        this._setPalette(palette);
    }

    // Any CSS color to {r, g, b, a}: rgb() directly, everything else (oklch(),
    // color(), color-mix(), named colors) through a 1×1 canvas.
    _parse(text) {
        if (!text || text === 'transparent' || text === 'none')
            return null;
        const fast = parseRgb(text);
        if (fast)
            return fast.a === 0 ? null : fast;
        if (this._cache.has(text))
            return this._cache.get(text);
        this._ctx ??= this._doc.createElement('canvas').getContext('2d', {willReadFrequently: true});
        const ctx = this._ctx;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#000';
        ctx.fillStyle = text;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        const value = a === 0 ? null : {r, g, b, a: a / 255};
        this._cache.set(text, value);
        return value;
    }

    _setPalette(palette) {
        this._palette = palette;
        this._P = Object.fromEntries(Object.entries(palette.colors).map(([k, v]) => [k, this._parse(v)]));
        this._dark = palette.dark;
    }

    // The page background right away; the elements once the document is parsed
    // (before that, most of the page's styles are not there yet).
    apply() {
        if (this._applied)
            return;
        this._applied = true;
        this._writeStyle();
        if (this._doc.readyState === 'loading')
            this._doc.addEventListener('DOMContentLoaded', () => this._start(), {once: true});
        else
            this._start();
        this._doc.defaultView?.addEventListener('load', () => this._recheck(), {once: true});
    }

    _start() {
        if (!this._applied)
            return;
        const root = this._doc.documentElement;
        this._readBase();
        this._observer = new MutationObserver(records => this._onMutations(records));
        this._observe(this._doc);
        this._enqueue(this._collect(root, true));
        this._runChunk();
        // Only now: color-scheme changes the default text color of the page.
        root.style.setProperty('color-scheme', this._dark ? 'dark' : 'light', 'important');
    }

    // The page's own background (body, else html), read before it is changed.
    _readBase() {
        // Our own html background must not count as the page's.
        const style = this._doc.getElementById(STYLE_ID);
        if (style)
            style.media = 'not all';
        const found = [this._doc.body, this._doc.documentElement]
            .map(el => el && (this._info.get(el)?.bg ?? this._parse(getComputedStyle(el).backgroundColor)))
            .find(c => c && c.a > 0.5);
        if (style)
            style.media = '';
        this._baseKnown = !!found;
        this._base = found ?? WHITE;
    }

    // Styles that arrive later can give transparent elements a background (and
    // the page its base color): read those again and recolor.
    _recheck() {
        if (!this._applied || !this._observer)
            return;
        for (const el of this._touched) {
            const info = this._info.get(el);
            if (info.bg || el === this._doc.documentElement)
                continue;
            const bg = this._parse(getComputedStyle(el).backgroundColor);
            if (bg)
                info.bg = bg;
        }
        const knew = this._baseKnown;
        this._readBase();
        for (const el of this._touched) {
            const info = this._info.get(el);
            if (!knew || info.bg)
                this._write(el, info);
        }
    }

    _scheduleRecheck() {
        clearTimeout(this._recheckId);
        this._recheckId = setTimeout(() => this._recheck(), 50);
    }

    update(palette) {
        this._setPalette(palette);
        if (!this._applied)
            return;
        this._writeStyle();
        this._doc.documentElement.style.setProperty('color-scheme', this._dark ? 'dark' : 'light', 'important');
        for (const el of this._touched)
            this._write(el, this._info.get(el));
    }

    revert() {
        this._observer?.disconnect();
        this._observer = null;
        clearTimeout(this._recheckId);
        this._queue = [];
        for (const el of this._touched) {
            const info = this._info.get(el);
            for (const [prop, [value, priority]] of Object.entries(info.inline)) {
                if (value)
                    el.style.setProperty(prop, value, priority);
                else
                    el.style.removeProperty(prop);
            }
            this._info.delete(el);
        }
        this._touched.clear();
        this._doc.getElementById(STYLE_ID)?.remove();
        this._applied = false;
    }

    _writeStyle() {
        let style = this._doc.getElementById(STYLE_ID);
        if (!style) {
            style = this._doc.createElement('style');
            style.id = STYLE_ID;
            this._doc.documentElement.append(style);
        }
        style.textContent = `html { background-color: ${toCss(this._P.background)} !important; }`;
    }

    _observe(root) {
        this._observer.observe(root, {childList: true, subtree: true});
    }

    _collect(root, includeRoot = false) {
        const out = includeRoot ? [root] : [];
        const walk = node => {
            for (const el of node.querySelectorAll('*')) {
                out.push(el);
                const shadow = this._shadowRootOf(el);
                if (shadow) {
                    this._observe(shadow);
                    walk(shadow);
                }
            }
        };
        walk(root);
        return out;
    }

    _onMutations(records) {
        const added = [];
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node.nodeName === 'STYLE' && node.id !== STYLE_ID)
                    this._scheduleRecheck();
                else if (node.nodeName === 'LINK' && /stylesheet/i.test(node.rel))
                    node.addEventListener('load', () => this._scheduleRecheck(), {once: true});
                if (node.nodeType === 1 && node.id !== STYLE_ID) {
                    for (const el of this._collect(node, true))
                        added.push(el);
                }
            }
        }
        if (added.length) {
            this._enqueue(added);
            this._schedule();
        }
    }

    // A loop, not push(...elements): huge pages overflow the call stack.
    _enqueue(elements) {
        for (const el of elements)
            this._queue.push(el);
    }

    _schedule() {
        if (this._scheduled || !this._queue.length)
            return;
        this._scheduled = true;
        const run = () => {
            this._scheduled = false;
            this._runChunk();
        };
        if (globalThis.requestIdleCallback)
            requestIdleCallback(run, {timeout: 200});
        else
            setTimeout(run, 16);
    }

    _runChunk() {
        if (!this._applied)
            return;
        const start = performance.now();
        const chunk = this._queue.splice(0, this._chunkSize);
        // Read everything first: writing first would make later reads see
        // colors this chunk has just changed.
        const read = [];
        for (const el of chunk) {
            if (!el.isConnected || this._info.has(el) || SKIP.has(el.tagName) ||
                (el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg'))
                continue;
            read.push([el, this._read(el)]);
        }
        for (const [el, info] of read) {
            this._info.set(el, info);
            this._touched.add(el);
            this._write(el, info);
        }
        performance.measure('paletka-chunk', {start});
        if (this._queue.length)
            this._schedule();
        else if (!performance.getEntriesByName('paletka-done').length)
            performance.mark('paletka-done');
    }

    _read(el) {
        const s = getComputedStyle(el);
        const parent = el.parentElement ?? el.parentNode?.host ?? null;
        // A color equal to the one we wrote on the parent is inherited from it.
        const written = parent && this._info.get(parent)?.wroteColor;
        const inherited = written && s.color === getComputedStyle(parent).color;
        const stops = s.backgroundImage.includes('gradient')
            ? (s.backgroundImage.match(COLOR_FN) ?? []).map(c => this._parse(c) ?? {r: 0, g: 0, b: 0, a: 0})
            : null;
        const inline = {};
        for (const prop of ['color', 'background-color', 'background-image', 'border-color'])
            inline[prop] = [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)];
        return {
            // The page background is the style element's job.
            bg: el === this._doc.documentElement ? null : this._parse(s.backgroundColor),
            fg: inherited ? null : this._parse(s.color),
            border: parseFloat(s.borderTopWidth) > 0 ? this._parse(s.borderTopColor) : null,
            neutralGradient: stops !== null && isNeutralGradient(stops),
            // Icons drawn with a mask show their background color like text.
            mask: (s.maskImage || s.webkitMaskImage || 'none') !== 'none',
            isLink: el.tagName === 'A' || !!el.closest?.('a'),
            inline,
            wroteColor: false,
        };
    }

    _write(el, info) {
        const set = (prop, color, alpha) => el.style.setProperty(prop, toCss(color, alpha), 'important');
        if (info.bg && info.bg.a > 0) {
            const m = info.mask
                ? mapText(info.bg, this._base, this._P, {isLink: info.isLink})
                : mapBackground(info.bg, this._base, this._P);
            if (m)
                set('background-color', m, info.bg.a);
        }
        if (info.fg) {
            const m = mapText(info.fg, this._base, this._P, {isLink: info.isLink});
            if (m) {
                set('color', m, info.fg.a);
                info.wroteColor = true;
            }
        }
        if (info.border && saturation(info.border) >= 0) {
            const m = mapBorder(info.border, this._P);
            if (m)
                set('border-color', m, m.a);
        }
        if (info.neutralGradient)
            el.style.setProperty('background-image', 'none', 'important');
    }
}
