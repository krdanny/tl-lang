import fs from 'node:fs';

const args = process.argv.slice(2);
const file = args[0];
let top = 5;
let since = null;
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--top') top = Number(args[++i]);
  else if (args[i] === '--since') since = Date.parse(args[++i]);
}

const LINE = /^(\S+) \S+ \S+ \[(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) [+-]\d{4}\] "(\S+) (\S+) [^"]*" (\d{3}) (\d+) ([\d.]+)$/;
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

const status = new Map();
const paths = new Map();
const hours = new Map();
const times = [];
let requests = 0;
let malformed = 0;

for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  if (line === '') continue;
  const m = LINE.exec(line);
  if (!m) { malformed++; continue; }
  const [, , day, mon, year, hh, mm, ss, , path, code, , secs] = m;
  const t = Date.UTC(Number(year), MONTHS[mon], Number(day), Number(hh), Number(mm), Number(ss));
  if (since !== null && t < since) continue;
  requests++;
  status.set(code, (status.get(code) || 0) + 1);
  paths.set(path, (paths.get(path) || 0) + 1);
  const hour = `${year}-${String(MONTHS[mon] + 1).padStart(2, '0')}-${day} ${hh}`;
  hours.set(hour, (hours.get(hour) || 0) + 1);
  times.push(Number(secs));
}

const out = [`requests: ${requests}`, `malformed: ${malformed}`, 'status:'];
for (const code of [...status.keys()].sort()) out.push(`  ${code}: ${status.get(code)}`);
out.push('top paths:');
const ranked = [...paths].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, top);
for (const [p, n] of ranked) out.push(`  ${p} ${n}`);
out.push('requests per hour:');
for (const h of [...hours.keys()].sort()) out.push(`  ${h}:00 ${hours.get(h)}`);
times.sort((a, b) => a - b);
const p95 = times.length ? Math.floor(times[Math.ceil(0.95 * times.length) - 1] * 1000 + 0.5) : 0;
out.push(`p95 response ms: ${p95}`);
console.log(out.join('\n'));
