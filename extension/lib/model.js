// Theme family model: validation, defaults and immutable edit helpers.
import {isValidHex, parseHex, toHex, mix} from './color.js';
import {BASE_KEYS, DERIVED_KEYS} from './palette.js';

export const FORMAT_VERSION = 1;
export const SYSTEM_ID = 'ubuntu';
export const BUILTIN_IDS = ['ubuntu', 'solarized', 'gruvbox', 'nord', 'dracula'];
export const VARIANTS = ['light', 'dark'];
export const WALLPAPER_TYPES = ['none', 'solid', 'gradient', 'file'];

const ID_RE = /^[a-z0-9-]+$/;

const YARU_BASE = {
    light: {background: '#fafafa', foreground: '#3d3d3d', accent: '#e95420',
        surface: '#ebebeb', success: '#2ec27e', error: '#c01c28'},
    dark: {background: '#2c2c2c', foreground: '#f7f7f7', accent: '#e95420',
        surface: '#242424', success: '#2ec27e', error: '#c01c28'},
};

const clone = o => JSON.parse(JSON.stringify(o));

export function isSystem(family) {
    return family?.kind === 'system';
}

function validateVariant(name, v, errors) {
    if (!v || typeof v !== 'object') {
        errors.push(`${name}: missing variant`);
        return;
    }
    for (const k of BASE_KEYS) {
        if (!isValidHex(v.base?.[k]))
            errors.push(`${name}.base.${k}: invalid color ${JSON.stringify(v.base?.[k])}`);
    }
    for (const [k, val] of Object.entries(v.overrides ?? {})) {
        if (!DERIVED_KEYS.includes(k))
            errors.push(`${name}.overrides.${k}: unknown key`);
        else if (!isValidHex(val))
            errors.push(`${name}.overrides.${k}: invalid color`);
    }
    const t = v.terminal;
    if (t) {
        for (const k of ['foreground', 'background', 'cursor']) {
            if (!isValidHex(t[k]))
                errors.push(`${name}.terminal.${k}: invalid color`);
        }
        if (!Array.isArray(t.palette) || t.palette.length !== 16 || !t.palette.every(isValidHex))
            errors.push(`${name}.terminal.palette: needs 16 colors`);
    }
    const w = v.wallpaper;
    if (w) {
        if (!WALLPAPER_TYPES.includes(w.type))
            errors.push(`${name}.wallpaper.type: invalid`);
        else if (w.type === 'solid' && !isValidHex(w.color))
            errors.push(`${name}.wallpaper.color: invalid color`);
        else if (w.type === 'gradient' && (!isValidHex(w.from) || !isValidHex(w.to)))
            errors.push(`${name}.wallpaper: invalid gradient colors`);
        else if (w.type === 'file' && typeof w.path !== 'string')
            errors.push(`${name}.wallpaper.path: missing`);
    }
    if (v.iconTheme !== undefined && v.iconTheme !== null && typeof v.iconTheme !== 'string')
        errors.push(`${name}.iconTheme: must be a string`);
    if (v.vscodeTheme !== undefined && v.vscodeTheme !== null && typeof v.vscodeTheme !== 'string')
        errors.push(`${name}.vscodeTheme: must be a string`);
    if (v.vscodeExtension !== undefined && v.vscodeExtension !== null &&
        !(typeof v.vscodeExtension === 'string' && /^[A-Za-z0-9][\w-]*\.[\w.-]+$/.test(v.vscodeExtension)))
        errors.push(`${name}.vscodeExtension: must be a marketplace id like publisher.name`);
}

export function validateFamily(obj) {
    const errors = [];
    if (!obj || typeof obj !== 'object')
        return {ok: false, errors: ['not an object']};
    if (obj.version !== FORMAT_VERSION)
        errors.push(`version: expected ${FORMAT_VERSION}`);
    if (typeof obj.id !== 'string' || !ID_RE.test(obj.id))
        errors.push('id: must match [a-z0-9-]+');
    if (typeof obj.name !== 'string' || !obj.name.trim())
        errors.push('name: must not be empty');
    if (!['system', 'custom'].includes(obj.kind))
        errors.push('kind: must be "system" or "custom"');
    if (obj.kind === 'custom') {
        for (const v of VARIANTS)
            validateVariant(v, obj[v], errors);
    }
    return {ok: errors.length === 0, errors};
}

export function defaultTerminal(base, isDark) {
    const c = k => parseHex(base[k]);
    const white = parseHex('#ffffff');
    const black = mix(c('foreground'), parseHex('#000000'), 0.6);
    const normal = [
        black,
        c('error'),
        c('success'),
        mix(c('error'), parseHex('#e5a50a'), 0.6),
        c('accent'),
        mix(c('accent'), c('error'), 0.5),
        mix(c('accent'), c('success'), 0.5),
        isDark ? mix(c('foreground'), white, 0.4) : c('surface'),
    ];
    const bright = normal.map((col, i) => i === 0 ? mix(black, c('foreground'), 0.5) : mix(col, white, 0.25));
    return {
        foreground: base.foreground,
        background: base.background,
        cursor: base.foreground,
        palette: [...normal, ...bright].map(toHex),
    };
}

export function normalizeFamily(obj) {
    const f = clone(obj);
    if (f.kind !== 'custom')
        return f;
    for (const v of VARIANTS) {
        const variant = f[v];
        variant.overrides ??= {};
        variant.terminal ??= defaultTerminal(variant.base, v === 'dark');
        variant.wallpaper ??= {type: 'none'};
        variant.iconTheme ??= null;
        variant.vscodeTheme ??= null;
        variant.vscodeExtension ??= null;
    }
    return f;
}

export function slugify(name) {
    return String(name)
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function uniqueId(name, existingIds) {
    const base = slugify(name) || 'theme';
    if (!existingIds.includes(base))
        return base;
    for (let n = 2; ; n++) {
        if (!existingIds.includes(`${base}-${n}`))
            return `${base}-${n}`;
    }
}

export function duplicateFamily(family, name, existingIds) {
    let f;
    if (isSystem(family)) {
        f = normalizeFamily({
            version: FORMAT_VERSION, kind: 'custom',
            light: {base: {...YARU_BASE.light}, iconTheme: 'Yaru'},
            dark: {base: {...YARU_BASE.dark}, iconTheme: 'Yaru-dark'},
        });
    } else {
        f = normalizeFamily(family);
    }
    return {...f, version: FORMAT_VERSION, kind: 'custom', id: uniqueId(name, existingIds), name};
}

function editVariant(family, variantName, fn) {
    const f = clone(family);
    fn(f[variantName]);
    return f;
}

export function setBaseColor(family, variantName, key, hex) {
    return editVariant(family, variantName, v => (v.base[key] = hex));
}

export function setOverride(family, variantName, key, hex) {
    return editVariant(family, variantName, v => {
        v.overrides ??= {};
        v.overrides[key] = hex;
    });
}

export function clearOverride(family, variantName, key) {
    return editVariant(family, variantName, v => delete v.overrides?.[key]);
}

export function setTerminalColor(family, variantName, field, hex) {
    return editVariant(family, variantName, v => {
        v.terminal ??= defaultTerminal(v.base, variantName === 'dark');
        if (typeof field === 'number')
            v.terminal.palette[field] = hex;
        else
            v.terminal[field] = hex;
    });
}

export function resetTerminal(family, variantName) {
    return editVariant(family, variantName,
        v => (v.terminal = defaultTerminal(v.base, variantName === 'dark')));
}

export function setWallpaper(family, variantName, spec) {
    return editVariant(family, variantName, v => (v.wallpaper = {...spec}));
}

export function setIconTheme(family, variantName, name) {
    return editVariant(family, variantName, v => (v.iconTheme = name));
}

export function setVscodeTheme(family, variantName, id) {
    return editVariant(family, variantName, v => (v.vscodeTheme = id));
}

export function rename(family, name) {
    return {...clone(family), name};
}

export function resolveActiveId(families, activeId) {
    return families.some(f => f.id === activeId) ? activeId : SYSTEM_ID;
}
