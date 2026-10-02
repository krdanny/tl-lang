import fs from 'node:fs';

const products = new Map();
const orders = new Map();
const out = [];

class Reject extends Error {}
const fail = (msg) => { throw new Reject(msg); };

function qty(text) {
  if (!/^\d+$/.test(text) || Number(text) === 0) fail('invalid quantity');
  return Number(text);
}

function product(sku) {
  return products.get(sku) ?? fail(`unknown product ${sku}`);
}

function order(id, verb, state) {
  const o = orders.get(id) ?? fail(`unknown order ${id}`);
  if (o.state !== state) fail(`order ${id} cannot ${verb} from ${o.state}`);
  return o;
}

const commands = {
  add(sku, name, q) {
    if (products.has(sku)) fail(`product exists ${sku}`);
    products.set(sku, { name, stock: qty(q), reserved: 0 });
    return `ok add ${sku}`;
  },
  receive(sku, q) {
    const n = qty(q);
    const p = product(sku);
    p.stock += n;
    return `ok receive ${sku} stock=${p.stock}`;
  },
  order(id, sku, q) {
    const n = qty(q);
    const p = product(sku);
    if (orders.has(id)) fail(`order exists ${id}`);
    const available = p.stock - p.reserved;
    if (available < n) fail(`insufficient stock for ${sku} (available ${available})`);
    p.reserved += n;
    orders.set(id, { sku, qty: n, state: 'Reserved' });
    return `ok order ${id}`;
  },
  ship(id) {
    const o = order(id, 'ship', 'Reserved');
    const p = products.get(o.sku);
    p.stock -= o.qty;
    p.reserved -= o.qty;
    o.state = 'Shipped';
    return `ok ship ${id}`;
  },
  return(id) {
    const o = order(id, 'return', 'Shipped');
    products.get(o.sku).stock += o.qty;
    o.state = 'Returned';
    return `ok return ${id}`;
  },
  cancel(id) {
    const o = order(id, 'cancel', 'Reserved');
    products.get(o.sku).reserved -= o.qty;
    o.state = 'Cancelled';
    return `ok cancel ${id}`;
  },
  report() {
    const lines = ['inventory:'];
    for (const sku of [...products.keys()].sort()) {
      const p = products.get(sku);
      lines.push(`  ${sku} ${p.name} stock=${p.stock} reserved=${p.reserved} available=${p.stock - p.reserved}`);
    }
    lines.push('orders:');
    for (const [id, o] of orders) lines.push(`  ${id} ${o.sku} ${o.qty} ${o.state}`);
    return lines.join('\n');
  },
};

for (const line of fs.readFileSync(process.argv[2], 'utf8').split('\n')) {
  const [word, ...args] = line.trim().split(/\s+/);
  if (!word) continue;
  try {
    if (!Object.hasOwn(commands, word)) fail(`unknown command ${word}`);
    out.push(commands[word](...args));
  } catch (e) {
    if (!(e instanceof Reject)) throw e;
    out.push(`error: ${e.message}`);
  }
}
console.log(out.join('\n'));
