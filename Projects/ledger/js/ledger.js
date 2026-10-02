import fs from 'node:fs';

const batch = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const cents = (s) => Number(s.replace('.', ''));
const money = (c) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const balances = new Map(batch.accounts.map((a) => [a.id, cents(a.balance)]));
const stats = { applied: 0, insufficient: 0, failed: 0, retries: 0 };

function apply(t) {
  const amount = cents(t.amount);
  if (balances.get(t.from) < amount) { stats.insufficient++; return; }
  balances.set(t.from, balances.get(t.from) - amount);
  balances.set(t.to, balances.get(t.to) + amount);
  stats.applied++;
}

async function run(t) {
  await sleep(t.delay);
  for (let attempt = 0; ; attempt++) {
    try {
      if (attempt < t.transient) throw new Error('transient');
      apply(t);
      return;
    } catch {
      if (attempt === 3) { stats.failed++; return; }
      stats.retries++;
    }
  }
}

await Promise.all(batch.transfers.map(run));
for (const [id, c] of balances) if (c > 0) balances.set(id, c + Math.floor((c + 50) / 100));

const out = [`applied: ${stats.applied}`, `insufficient: ${stats.insufficient}`, `failed: ${stats.failed}`, `retries: ${stats.retries}`];
for (const id of [...balances.keys()].sort()) out.push(`${id} ${money(balances.get(id))}`);
console.log(out.join('\n'));
