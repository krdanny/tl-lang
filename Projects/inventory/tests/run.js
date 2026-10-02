import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const cmd = process.argv.slice(2);
const r = spawnSync(cmd[0], [...cmd.slice(1), path.join(dir, 'commands.txt')], { encoding: 'utf8' });
const want = fs.readFileSync(path.join(dir, 'expected.txt'), 'utf8');
if (r.status === 0 && r.stdout === want) { console.log('  ok   commands.txt\n1 passed, 0 failed'); process.exit(0); }
const a = want.split('\n'), b = r.stdout.split('\n');
const i = a.findIndex((l, k) => l !== b[k]);
console.log(`  FAIL commands.txt (exit ${r.status}) first difference at line ${i + 1}:\n  expected: ${a[i]}\n  got:      ${b[i]}\n${r.stderr.slice(0, 800)}\n0 passed, 1 failed`);
process.exit(1);
