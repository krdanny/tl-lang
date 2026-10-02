import fs from 'node:fs';
import vm from 'node:vm';
const src = fs.readFileSync(process.argv[2], 'utf8').replace(/^import .*$/gm, '').replace(/^function test\(options\) \{[\s\S]*?\n\}\n/m, '');
const cases = [];
let current = '';
const ctx = { describe: (n, f) => f(), it: (n, f) => { current = n; f(); }, test: (o) => cases.push({ it: current, sanitizer: o.sanitizer, args: o.args || [], expect: o.expect }), console };
vm.runInNewContext(src, ctx, { filename: 'sanitizers.test.js' });
fs.writeFileSync(new URL('./sanitizer-cases.json', import.meta.url), JSON.stringify(cases, null, 1));
console.log(`${cases.length} sanitizer cases, ${cases.reduce((a, c) => a + Object.keys(c.expect).length, 0)} inputs`);
