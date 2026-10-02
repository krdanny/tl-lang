import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cases');
const cmd = process.argv.slice(2);
let failed = 0, n = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
  n++;
  const r = spawnSync(cmd[0], [...cmd.slice(1), path.join(dir, f)], { encoding: 'utf8' });
  const want = fs.readFileSync(path.join(dir, f.replace(/\.md$/, '.html')), 'utf8');
  if (r.status === 0 && r.stdout === want) console.log(`  ok   ${f}`);
  else { failed++; console.log(`  FAIL ${f}\n--- expected\n${want}--- got (exit ${r.status})\n${r.stdout}${r.stderr.slice(0, 600)}`); }
}
console.log(`${n - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
