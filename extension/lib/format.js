// printf-style %s/%d substitution for translated strings
// (String.prototype.format is not available in every process).
export function fmt(str, ...args) {
    let i = 0;
    return str.replace(/%([sd%])/g, (_m, type) => (type === '%' ? '%' : String(args[i++])));
}
