import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const cmd = process.argv.slice(2);
const want = fs.readFileSync(path.join(dir, 'expected.txt'), 'utf8');
let failed = 0;
for (let run = 1; run <= 3; run++) {   // three runs: the result must be deterministic despite concurrency
  const r = spawnSync(cmd[0], [...cmd.slice(1), path.join(dir, 'batch.json')], { encoding: 'utf8', timeout: 60000 });
  if (r.status === 0 && r.stdout === want) console.log(`  ok   run ${run}`);
  else { failed++; console.log(`  FAIL run ${run} (exit ${r.status})\n--- expected\n${want}--- got\n${r.stdout}${r.stderr.slice(0, 800)}`); }
}
console.log(`${3 - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
