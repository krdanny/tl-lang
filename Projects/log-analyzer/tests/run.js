// Usage: node run.js <command…>
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const cmd = process.argv.slice(2);
const cases = [
  ['default', ['access.log'], 'expected-default.txt'],
  ['top3 since', ['access.log', '--top', '3', '--since', '2023-10-10T14:00:00Z'], 'expected-top3-since.txt'],
  ['empty log', ['empty.log'], 'expected-empty.txt'],
];
let failed = 0;
for (const [name, args, expected] of cases) {
  const r = spawnSync(cmd[0], [...cmd.slice(1), ...args.map((a) => (a.endsWith('.log') ? path.join(dir, a) : a))], { encoding: 'utf8' });
  const want = fs.readFileSync(path.join(dir, expected), 'utf8');
  if (r.status === 0 && r.stdout === want) console.log(`  ok   ${name}`);
  else { failed++; console.log(`  FAIL ${name}\n--- expected\n${want}--- got (exit ${r.status})\n${r.stdout}${r.stderr}`); }
}
console.log(`${cases.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
