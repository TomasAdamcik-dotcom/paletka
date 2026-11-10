// Minimal JSONC (JSON with comments, trailing commas) support for VS Code's
// settings.json: read it, and edit top-level properties without touching any
// other byte of the file.

function skipTrivia(text, i) {
    for (;;) {
        while (i < text.length && /\s/.test(text[i]))
            i++;
        if (text.startsWith('//', i)) {
            const nl = text.indexOf('\n', i);
            i = nl < 0 ? text.length : nl + 1;
        } else if (text.startsWith('/*', i)) {
            const end = text.indexOf('*/', i + 2);
            if (end < 0)
                throw new Error('Unterminated comment');
            i = end + 2;
        } else {
            return i;
        }
    }
}

function skipString(text, i) {
    // text[i] === '"'
    for (let j = i + 1; j < text.length; j++) {
        if (text[j] === '\\')
            j++;
        else if (text[j] === '"')
            return j + 1;
    }
    throw new Error('Unterminated string');
}

// Returns the index just past the value starting at i.
function skipValue(text, i) {
    const ch = text[i];
    if (ch === '"')
        return skipString(text, i);
    if (ch === '{' || ch === '[') {
        const close = ch === '{' ? '}' : ']';
        i = skipTrivia(text, i + 1);
        while (text[i] !== close) {
            if (i >= text.length)
                throw new Error('Unexpected end of input');
            if (ch === '{') {
                if (text[i] !== '"')
                    throw new Error(`Expected property name at ${i}`);
                i = skipTrivia(text, skipString(text, i));
                if (text[i] !== ':')
                    throw new Error(`Expected ':' at ${i}`);
                i = skipTrivia(text, i + 1);
            }
            i = skipTrivia(text, skipValue(text, i));
            if (text[i] === ',')
                i = skipTrivia(text, i + 1);
            else if (text[i] !== close)
                throw new Error(`Expected ',' or '${close}' at ${i}`);
        }
        return i + 1;
    }
    const m = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i, i + 64));
    if (!m)
        throw new Error(`Unexpected token at ${i}`);
    return i + m[0].length;
}

// Locates the top-level object and its properties.
function scan(text) {
    let i = skipTrivia(text, 0);
    if (text[i] !== '{')
        throw new Error('settings must be a JSON object');
    const open = i;
    const props = [];
    i = skipTrivia(text, i + 1);
    while (text[i] !== '}') {
        if (i >= text.length || text[i] !== '"')
            throw new Error(`Expected property name at ${i}`);
        const keyStart = i;
        const keyEnd = skipString(text, i);
        const key = JSON.parse(text.slice(keyStart, keyEnd));
        i = skipTrivia(text, keyEnd);
        if (text[i] !== ':')
            throw new Error(`Expected ':' at ${i}`);
        const valueStart = skipTrivia(text, i + 1);
        const valueEnd = skipValue(text, valueStart);
        i = skipTrivia(text, valueEnd);
        let commaEnd = null;
        if (text[i] === ',') {
            commaEnd = i + 1;
            i = skipTrivia(text, i + 1);
        } else if (text[i] !== '}') {
            throw new Error(`Expected ',' or '}' at ${i}`);
        }
        props.push({key, keyStart, valueStart, valueEnd, commaEnd});
    }
    const close = i;
    if (skipTrivia(text, close + 1) !== text.length)
        throw new Error('Unexpected content after object');
    return {open, close, props};
}

// Removes comments and trailing commas, then parses as strict JSON.
export function parseJsonc(text) {
    scan(text);
    let out = '';
    for (let i = 0; i < text.length;) {
        if (text[i] === '"') {
            const end = skipString(text, i);
            out += text.slice(i, end);
            i = end;
        } else if (text.startsWith('//', i) || text.startsWith('/*', i)) {
            const next = skipTrivia(text, i);
            out += ' ';
            i = next;
        } else if (text[i] === ',') {
            const next = skipTrivia(text, i + 1);
            if (text[next] !== '}' && text[next] !== ']')
                out += ',';
            i++;
        } else {
            out += text[i++];
        }
    }
    return JSON.parse(out);
}

function indentOf(text, pos) {
    const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
    const ws = text.slice(lineStart, pos);
    return /^[ \t]*$/.test(ws) ? ws : '    ';
}

export function setTopLevel(text, key, value) {
    const {close, props} = scan(text);
    const json = JSON.stringify(value);
    const existing = props.find(p => p.key === key);
    if (existing)
        return text.slice(0, existing.valueStart) + json + text.slice(existing.valueEnd);

    const last = props.at(-1);
    if (!last) {
        const before = text.slice(0, close).replace(/[ \t]*$/, '');
        const nl = before.endsWith('\n') ? '' : '\n';
        return `${before}${nl}    ${JSON.stringify(key)}: ${json}\n${text.slice(close)}`;
    }
    const indent = indentOf(text, last.keyStart);
    const prop = `${JSON.stringify(key)}: ${json}`;
    if (last.commaEnd !== null)
        return `${text.slice(0, last.commaEnd)}\n${indent}${prop},${text.slice(last.commaEnd)}`;
    return `${text.slice(0, last.valueEnd)},\n${indent}${prop}${text.slice(last.valueEnd)}`;
}

export function removeTopLevel(text, key) {
    const {props} = scan(text);
    const idx = props.findIndex(p => p.key === key);
    if (idx < 0)
        return text;
    const p = props[idx];
    if (idx < props.length - 1)
        return text.slice(0, p.keyStart) + text.slice(props[idx + 1].keyStart);
    if (idx > 0 && p.commaEnd === null)
        return text.slice(0, props[idx - 1].valueEnd) + text.slice(p.valueEnd);
    const end = p.commaEnd ?? p.valueEnd;
    if (idx > 0) {
        // Last property with its own trailing comma: keep the previous comma.
        const start = text.slice(0, p.keyStart).replace(/\s*$/, '').length;
        return text.slice(0, start) + text.slice(end);
    }
    // Only property: drop it together with the whitespace before it.
    const start = text.slice(0, p.keyStart).replace(/\s*$/, '').length;
    return text.slice(0, start) + text.slice(end);
}
