// `tl def`: writes the dictionary. It finds every compound name in the project's sources, gives each one a short
// symbol, replaces the name by the symbol in the .tl files and records `symbol longName` in tl.def.
// Symbols are chosen to be a single token when a tokenizer is available (gpt-tokenizer, o200k).

import fs from 'node:fs';
import path from 'node:path';
import { lex } from './lexer.js';
import { parseDef, namePairs } from './def.js';
import { isCompound, wordsOf, BUILTIN_NAMES } from './names.js';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'tl-build', 'build', 'out']);

/** The .tl files a dictionary covers: those below `dir`, except folders that have a tl.def of their own. */
export function tlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) return [];
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return fs.existsSync(path.join(p, 'tl.def')) ? [] : tlFiles(p);
    return e.name.endsWith('.tl') ? [p] : [];
  });
}

/** Every identifier of a source, including those inside string interpolations, with its position. */
export function identifiers(src, file) {
  const out = [];
  const visit = (toks) => {
    for (const t of toks) {
      if (t.t === 'id') out.push({ text: t.v, pos: t.pos, end: t.end });
      const parts = t.t === 'str' ? t.v.parts : t.t === 'pstr' && t.v.lit && t.v.lit.parts ? t.v.lit.parts : null;
      if (parts) for (const p of parts) if (typeof p !== 'string' && p.code.trim()) visit(lex(p.code, file, p.pos));
    }
  };
  visit(lex(src.replace(/\r?\n$/, ''), file));
  return out;
}

async function tokenCounter() {
  try {
    const { encode } = await import('gpt-tokenizer/encoding/o200k_base');
    return (s) => encode(s).length;
  } catch {
    return null;
  }
}

/** Candidate symbols for a long name, most mnemonic first. */
function* candidates(long) {
  const words = wordsOf(long);
  const upper = /^[A-Z]/.test(long);
  const cased = (s) => (upper ? s.toUpperCase() : s.toLowerCase());
  const initials = words.map((w) => w[0]).join('');
  const seen = new Set();
  const give = function* (s) { if (s.length >= 2 && !seen.has(s)) { seen.add(s); yield s; } };
  yield* give(cased(initials.slice(0, 4)));
  yield* give(cased(initials.slice(0, 2)));
  yield* give(cased(words[0][0] + (words[words.length - 1][0] || '')));
  if (words[0].length <= 4) yield* give(upper ? words[0] : words[0].toLowerCase());
  for (const w of words.slice(1)) yield* give(cased(words[0][0] + w.slice(0, 2)));
  yield* give(cased(words[0].slice(0, 2) + (words[1] ? words[1][0] : '')));
  yield* give(cased(words[0].slice(0, 3)));
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  for (const a of letters) yield* give(cased(initials[0] + a));
  for (const a of letters) for (const b of letters) yield* give(cased(a + b));
  for (const a of letters) for (const b of letters) for (const c of letters) yield* give(cased(a + b + c));
}

function pick(long, used, count) {
  let best = null;
  let bestCost = Infinity;
  let tried = 0;
  for (const c of candidates(long)) {
    if (used.has(c) || BUILTIN_NAMES.has(c) || isCompound(c)) continue;
    if (!count) return c;
    const cost = count(' ' + c) + count('.' + c);
    if (cost === 2) return c;                     // one token after a space and after a dot: cannot do better
    if (cost < bestCost) { best = c; bestCost = cost; }
    if (++tried > 400 && best) break;
  }
  return best;
}

/**
 * @param {string} dir  project directory (the .tl files below it share the tl.def at its top)
 * @param {{ write?: boolean }} opts  write=false only reports what would change
 * @returns {Promise<{ defFile: string, created: boolean, added: {sym:string,long:string,uses:number}[], files: number, changed: number }>}
 */
export async function generateDef(dir, opts = {}) {
  const write = opts.write ?? true;
  const root = path.resolve(dir);
  const defFile = path.join(root, 'tl.def');
  const created = !fs.existsSync(defFile);
  const defText = created ? '' : fs.readFileSync(defFile, 'utf8');
  const def = parseDef(defText, defFile);
  const files = tlFiles(root);

  const used = new Set([...def.aliases.keys(), ...def.global.keys(), ...def.fields.keys()]);
  for (const m of def.mods.values()) for (const k of m.keys()) used.add(k);
  const known = new Map([...def.aliases].map(([s, l]) => [l, s])); // long -> symbol
  const uses = new Map();
  const words = new Map(); // plain word -> { n, cost }: tokens it costs where it is written
  const perFile = new Map();
  const count = await tokenCounter();
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const ids = identifiers(src, f);
    perFile.set(f, ids);
    for (const id of ids) {
      used.add(id.text);
      if (BUILTIN_NAMES.has(id.text) || def.aliases.has(id.text)) continue;
      if (isCompound(id.text)) uses.set(id.text, (uses.get(id.text) || 0) + 1);
      else if (count && id.text.length > 3) {
        const w = words.get(id.text) || { n: 0, cost: 0 };
        w.n++; w.cost += count((src[id.pos - 1] === '.' ? '.' : ' ') + id.text);
        words.set(id.text, w);
      }
    }
  }
  // A plain word that costs several tokens gets a symbol too when that saves tokens overall: each use then costs one
  // token, and its pair in tl.def costs the word plus one.
  if (count) for (const [w, e] of words) if (e.cost - e.n - (count(' ' + w) + 1) >= 2) uses.set(w, e.n);

  const added = [];
  for (const [long, n] of [...uses].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    if (known.has(long)) continue; // already in tl.def: the source just has to use its symbol
    const sym = pick(long, used, count);
    if (!sym) throw new Error(`no free symbol for ${long}`);
    used.add(sym);
    known.set(long, sym);
    added.push({ sym, long, uses: n });
  }

  let changed = 0;
  if (write) {
    for (const [f, ids] of perFile) {
      let src = fs.readFileSync(f, 'utf8');
      let touched = false;
      for (const id of [...ids].sort((a, b) => b.pos - a.pos)) {
        const sym = uses.has(id.text) ? known.get(id.text) : null;
        if (!sym) continue;
        src = src.slice(0, id.pos) + sym + src.slice(id.end);
        touched = true;
      }
      if (touched) { fs.writeFileSync(f, src); changed++; }
    }
    if (created || added.length || !compact(defText)) fs.writeFileSync(defFile, writeDef(defText, added));
  }
  return { defFile, created, added, files: files.length, changed };
}

/** All names on one line (a newline would cost one token per name); other entries keep their lines. */
function writeDef(text, added) {
  const pairs = [];
  const rest = [];
  for (const raw of text.split(/\r?\n/)) {
    const p = raw.trim() && !/^\s/.test(raw) && !raw.includes('#') ? namePairs(raw.trim()) : null;
    if (p && !/"/.test(raw)) pairs.push(...p.map(([s, l]) => `${s} ${l}`));
    else if (raw.trim()) rest.push(raw);
  }
  pairs.push(...added.map((a) => `${a.sym} ${a.long}`));
  const head = pairs.length ? pairs.join(' ') + '\n' : '';
  return head + (rest.length ? rest.join('\n') + '\n' : '');
}

/** True when every plain name pair is already on one line. */
function compact(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !/^\s/.test(l) && !l.includes('#') && !/"/.test(l));
  return lines.filter((l) => namePairs(l.trim())).length <= 1;
}

/**
 * `tl def --expand`: the opposite direction, for editing. Every symbol in the sources is replaced by its long name
 * (tl.def is left alone); running `tl def` afterwards puts the same symbols back.
 * @returns {{ files: number, changed: number }}
 */
export function expandDef(dir) {
  const root = path.resolve(dir);
  const defFile = path.join(root, 'tl.def');
  const def = parseDef(fs.existsSync(defFile) ? fs.readFileSync(defFile, 'utf8') : '', defFile);
  const files = tlFiles(root);
  let changed = 0;
  for (const f of files) {
    let src = fs.readFileSync(f, 'utf8');
    let touched = false;
    for (const id of identifiers(src, f).sort((a, b) => b.pos - a.pos)) {
      const long = def.aliases.get(id.text);
      if (!long) continue;
      src = src.slice(0, id.pos) + long + src.slice(id.end);
      touched = true;
    }
    if (touched) { fs.writeFileSync(f, src); changed++; }
  }
  return { files: files.length, changed };
}
