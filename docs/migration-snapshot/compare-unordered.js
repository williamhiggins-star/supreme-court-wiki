// Compare two snapshots ignoring array order (every array sorted canonically).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- plain Node script, run with `node`
const fs = require("fs");
const ds = (v) => Array.isArray(v) ? v.map(ds).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ds(v[k])])) : v;
const [a, b] = process.argv.slice(2).map((f) => ds(JSON.parse(fs.readFileSync(f, "utf8"))));
const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
let same = true;
for (const k of keys) { const eq = JSON.stringify(a[k]) === JSON.stringify(b[k]); if (!eq) same = false; console.log(`${eq ? "same " : "DIFF "} ${k}`); }
console.log(same ? "IDENTICAL (order-insensitive)" : "DIFFERENT");
