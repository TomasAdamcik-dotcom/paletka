// In-memory test doubles for adapters.

const keyOf = ref => `${ref.schema}|${ref.path ?? ''}|${ref.key}`;

export class FakeSettings {
    // defaultKeys: keys whose initial value is the schema default (not user-set).
    constructor(initial = {}, missingSchemas = [], defaultKeys = []) {
        this.values = new Map(Object.entries(initial));
        this.defaults = new Map(defaultKeys.map(k => [k, initial[k]]));
        this.userSet = new Set(Object.keys(initial).filter(k => !defaultKeys.includes(k)));
        this.missing = missingSchemas;
        this.writes = [];
    }

    isUserSet(ref) {
        return this.userSet.has(keyOf(ref));
    }

    reset(ref) {
        const k = keyOf(ref);
        this.userSet.delete(k);
        this.values.set(k, this.defaults.get(k) ?? null);
    }

    static key(schema, key, path) {
        return keyOf({schema, key, path});
    }

    exists(ref) {
        return !this.missing.includes(ref.schema);
    }

    get(ref) {
        if (!this.exists(ref))
            throw new Error(`no schema ${ref.schema}`);
        const v = this.values.get(keyOf(ref));
        return v === undefined ? null : JSON.parse(JSON.stringify(v));
    }

    set(ref, value) {
        if (!this.exists(ref))
            throw new Error(`no schema ${ref.schema}`);
        this.values.set(keyOf(ref), JSON.parse(JSON.stringify(value)));
        this.userSet.add(keyOf(ref));
        this.writes.push([keyOf(ref), value]);
    }
}

export class FakeServices {
    constructor() {
        this.calls = [];
    }

    async restart() {
        this.calls.push('restart');
    }
}
