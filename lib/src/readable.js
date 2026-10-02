// Readable view: renders one-line TL as indented, human-oriented text (the TL counterpart of a pretty-printer).
// It never changes meaning: tokens are printed in source order. What it adds is layout and the things Minimal
// Closure leaves out: one segment per line, indentation per body, closing quotes and brackets, spaces between
// operands, long collection literals wrapped, and (optionally) words for the statement sigils:
// `^x` -> `return x`, `+m.f` -> `import m.f`, `!E` -> `raise E`, `x 5` -> `x = 5`.

const TERMS = new Set(['|', '<', ';']);
const LITERALS = new Set(['str', 'raw', 'pstr', 'char', 'num']);
const CLOSERS = new Set([')', ']', '}']);
const OPENERS = new Set(['(', '[', '{', '#[']);
// words that are never a callee, so a glued bracket after them is a group: `if(a)` -> `if (a)`
const WORDS_BEFORE_GROUP = new Set(['if', 'elif', 'while', 'for', 'match', 'guard', 'and', 'or', 'not', 'is', 'in', 'by', 'assert', 'else']);
const LOOSE_OPS = new Set(['>>', '|>', '=>']); // pipeline and lambda arrow: shown spaced, everything tighter stays as written
const DECL_WORDS = new Set(['fn', 'type', 'impl', 'ext', 'trait', 'test', 'error', 'async', 'gen']);
const MEMBER_BLOCKS = new Set(['impl', 'ext', 'trait']);

/**
 * @param {{ src: string, tokens: object[], segments: object[], implicit: object[], ast: object|null, error: object|null }} info  from `inspect()`
 * @param {{ indent?: string, keywords?: boolean, names?: Map<string,string>|null, blankLines?: boolean, unescape?: boolean, width?: number }} opts
 *   keywords: spell out `return` / `import` / `raise` / `=`;  names: long names from tl.def;
 *   unescape: show `\|` `\<` `\;` in strings as the plain character;  width: wrap collection literals longer than this (0 = never)
 * @returns {{ text: string, lines: {depth:number,start:number,line:number,text:string}[], symbols: object[], error: object|null }}
 */
export function readable(info, opts = {}) {
  const indent = opts.indent ?? '    ';
  const keywords = opts.keywords ?? true;
  const names = opts.names ?? null;
  const blankLines = opts.blankLines ?? true;
  const unescape = opts.unescape ?? true;
  const width = opts.width ?? 100;
  const { src, tokens, error } = info;

  if (!tokens.length) {
    // the lexer rejected the file: show the diagnostic and the raw text
    const head = error ? [errorLine(error)] : [];
    return { text: [...head, src].join('\n'), lines: [{ depth: 0, start: 0, line: head.length, text: src }], symbols: [], error };
  }

  const segDepth = new Map();
  for (const s of info.segments) if (!segDepth.has(s.start) || s.depth < segDepth.get(s.start)) segDepth.set(s.start, s.depth);
  const implicit = new Map();
  for (const c of info.implicit) implicit.set(c.pos, [...(implicit.get(c.pos) || []), c.ch]);
  const marks = info.ast ? statementMarks(info.ast) : { bindings: new Set(), imports: new Set(), assigns: new Set() };
  const bindings = keywords ? marks.bindings : new Set();
  const { imports, assigns } = marks;

  // ── 1. tokens -> lines of parts ──
  const lines = [];
  let cur = null;      // { depth, start, first, parts: { s, tok?, space? }[] }
  let lts = 0;         // `<` seen since the last printed token
  let afterTerm = true;
  const open = (depth, tok) => { cur = { depth: Math.max(0, depth), start: tok.pos, first: tok, parts: [], prev: null, prev2: null, spaceNext: false }; lines.push(cur); };
  const lastDepth = () => (cur ? cur.depth : 0);

  for (const tok of tokens) {
    const closers = implicit.get(tok.pos);
    if (closers && (TERMS.has(tok.t) || tok.t === 'eof')) {
      // brackets opened before a block body are closed after it, on a line of their own
      if (lts > 0 || !cur) { open(lastDepth() - lts, tok); cur.cont = true; lts = 0; }
      for (const ch of closers) cur.parts.push({ s: ch, tok: { t: 'op', v: ch } });
      cur.prev = { t: 'op', v: closers[closers.length - 1] };
    }
    if (tok.t === 'eof') break;
    if (TERMS.has(tok.t)) { if (tok.t === '<') lts++; afterTerm = true; continue; }

    let lineStart = false;
    if (segDepth.has(tok.pos)) { open(segDepth.get(tok.pos), tok); lineStart = true; }
    else if (afterTerm && lts > 0) { open(lastDepth() - lts, tok); cur.cont = true; lineStart = true; } // elif/else/catch, or the rest of a statement after a block
    else if (afterTerm) { open(lastDepth(), tok); lineStart = true; }                   // unparsed region (after an error)
    lts = 0;
    afterTerm = false;

    let text = tokenText(tok, src, names);
    if (unescape && (tok.t === 'str' || (tok.t === 'pstr' && !tok.v.raw))) text = text.replace(/\\([|<;])/g, '$1'); // escapes only the one-line form needs
    let gloss = false;
    if (keywords && lineStart && tok.t === 'op') {
      if (tok.v === '^') { text = 'return'; gloss = true; }
      else if (tok.v === '!') { text = 'raise'; gloss = true; }
      else if (tok.v === '+' && imports.has(tok.pos)) { text = 'import'; gloss = true; }
    }
    const loose = tok.t === 'op' && (LOOSE_OPS.has(tok.v) || assigns.has(tok.pos)); // operators that bind looser than a call
    if (tok.t === 'op' && tok.v === '|>') text = '>>';
    if (bindings.has(tok.pos) && !lineStart) cur.parts.push({ s: ' = ', space: true });
    else if (cur.prev && (tok.sp || loose || cur.spaceNext || humanSpace(cur.prev, tok, cur.prev2))) cur.parts.push({ s: ' ', space: true });
    cur.parts.push({ s: text, tok });
    cur.prev2 = cur.prev;
    cur.prev = tok;
    cur.spaceNext = gloss || loose;
  }

  // ── 2. lines -> text (blank lines between declarations, long literals wrapped) ──
  const out = [];
  let block = null; // keyword that opened the current top-level block
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    l.text = l.parts.map((p) => p.s).join('');
    const word = l.first.t === 'id' ? l.first.v : null;
    const prev = lines[i - 1];
    if (blankLines && prev && !l.cont) {
      const declAtTop = l.depth === 0 && (DECL_WORDS.has(word) || prev.depth > 0);
      const member = l.depth === 1 && prev.depth > 1 && MEMBER_BLOCKS.has(block);
      if (declAtTop || member) out.push('');
    }
    if (l.depth === 0) block = word;
    l.line = out.length + (error ? 1 : 0);
    const pad = indent.repeat(l.depth);
    const rows = width > 0 && pad.length + l.text.length > width ? wrapLiteral(l.parts, width - pad.length, indent) : null;
    if (rows) for (const r of rows) out.push(pad + r); else out.push(pad + l.text);
    l.lastRow = out.length - 1 + (error ? 1 : 0);
  }
  if (error) out.unshift(errorLine(error));
  const result = lines.map((l) => ({ depth: l.depth, start: l.start, line: l.line, text: l.text }));
  return { text: out.join('\n'), lines: result, symbols: symbolsOf(lines), error };
}

function errorLine(e) {
  return `⚠ ${e.code || 'error'} at column ${(e.col ?? 0) + 1}: ${e.message}`;
}

function tokenText(tok, src, names) {
  const text = src.slice(tok.pos, tok.end);
  if (tok.t === 'id' && names) return names.get(tok.short ?? tok.v) ?? text;
  if (tok.t === 'str' && tok.v.closed === false) return text + '"';
  if (tok.t === 'raw' && tok.v.closed === false) return text + '`'.repeat(/^`+/.exec(text)[0].length);
  if (tok.t === 'pstr' && tok.v.lit && tok.v.lit.closed === false) return text + (tok.v.raw ? '`'.repeat((/`+/.exec(text) || ['`'])[0].length) : '"');
  return text;
}

/** A space the source may omit but a reader wants: between two operands, and between a keyword and a group. */
function humanSpace(a, b, beforeA) {
  const aEnds = a.t === 'id' || LITERALS.has(a.t) || (a.t === 'op' && CLOSERS.has(a.v));
  if (aEnds && (b.t === 'id' || LITERALS.has(b.t))) return true;
  if (aEnds && a.t !== 'id' && b.t === 'op' && b.v === '(') return true; // `x[1](y)` is two operands, not a call
  const member = beforeA && beforeA.t === 'op' && (beforeA.v === '.' || beforeA.v === '?.'); // `s.match(x)`: a method, not the keyword
  if (a.t === 'id' && !member && WORDS_BEFORE_GROUP.has(a.v) && b.t === 'op' && OPENERS.has(b.v)) return true;
  return false;
}

/**
 * A line that is too long because of a list, set or map literal is shown with the literal's elements on their own rows:
 * map entries one per row, list and set elements filled up to the width. Returns null when there is nothing to wrap.
 */
function wrapLiteral(parts, width, indent) {
  // the first collection literal at bracket depth 0 that holds at least two elements
  let depth = 0;
  let openAt = -1;
  let closeAt = -1;
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i].tok;
    if (!t || t.t !== 'op') continue;
    if (OPENERS.has(t.v)) {
      if (depth === 0 && openAt === -1 && t.v !== '(' && !isIndex(parts, i)) openAt = i;
      depth++;
    } else if (CLOSERS.has(t.v)) {
      depth--;
      if (depth === 0 && openAt !== -1) { closeAt = i; break; }
    }
  }
  if (openAt === -1 || closeAt === -1) return null;
  // elements: at depth 1 every space separates two of them (elements are tight expressions)
  const items = [];
  let item = '';
  depth = 0;
  for (let i = openAt + 1; i < closeAt; i++) {
    const p = parts[i];
    if (p.space && depth === 0) { if (item) items.push(item); item = ''; continue; }
    if (p.tok && p.tok.t === 'op') { if (OPENERS.has(p.tok.v)) depth++; else if (CLOSERS.has(p.tok.v)) depth--; }
    item += p.s;
  }
  if (item) items.push(item);
  if (items.length < 2) return null;
  const head = parts.slice(0, openAt + 1).map((p) => p.s).join('');
  const tail = parts.slice(closeAt).map((p) => p.s).join('');
  const rows = [head];
  if (parts[openAt].tok.v === '{') for (const it of items) rows.push(indent + it);
  else {
    let row = '';
    for (const it of items) {
      if (row && indent.length + row.length + 1 + it.length > width) { rows.push(indent + row); row = ''; }
      row += (row ? ' ' : '') + it;
    }
    if (row) rows.push(indent + row);
  }
  rows.push(tail);
  return rows;
}

/** `xs[i]`: a bracket glued to the operand before it is an index (or type arguments), not a literal. */
function isIndex(parts, i) {
  const prev = parts[i - 1];
  if (!prev || prev.space || !prev.tok) return false;
  if (parts[i].tok.v === '{') return false; // `P{x:1}` record literal: wrap its fields like a map
  const t = prev.tok;
  return t.t === 'id' || LITERALS.has(t.t) || (t.t === 'op' && CLOSERS.has(t.v));
}

/** Offsets where a binding's value starts (`x 5` -> `x = 5`), where imports start, and of assignment operators. */
function statementMarks(ast) {
  const bindings = new Set();
  const imports = new Set();
  const assigns = new Set();
  const seen = new Set();
  const walk = (n) => {
    if (!n || typeof n !== 'object' || seen.has(n)) return;
    seen.add(n);
    if (Array.isArray(n)) { for (const x of n) walk(x); return; }
    if (n.k === 'Let' && typeof n.valuePos === 'number') bindings.add(n.valuePos);
    if (n.k === 'Import' && !n.implicit) imports.add(n.pos);
    if (n.k === 'Assign' && typeof n.pos === 'number') assigns.add(n.pos); // the position of `=`, `+=`, …
    for (const key of Object.keys(n)) {
      if (key === 'sym' || key === 'typeSym' || key === 'traitSym') continue; // symbol tables, not syntax
      const v = n[key];
      if (v && typeof v === 'object') walk(v);
    }
  };
  walk(ast.body);
  return { bindings, imports, assigns };
}

/** Outline: functions, types, impl blocks with their methods, tests, errors and constants. */
function symbolsOf(lines) {
  const symbols = [];
  const endOf = (i) => {
    for (let j = i + 1; j < lines.length; j++) if (lines[j].depth <= lines[i].depth && !lines[j].cont) return lines[j - 1].lastRow;
    return lines[lines.length - 1].lastRow;
  };
  let owner = null;
  lines.forEach((l, i) => {
    const w = l.text.split(/\s+/);
    const first = l.first.t === 'id' ? l.first.v : null;
    if (l.depth === 0) {
      owner = null;
      let k = 0;
      while (w[k] === 'async' || w[k] === 'gen') k++;
      const kw = w[k];
      const name = (w[k + 1] || '').replace(/[^A-Za-z0-9_.$]/g, '');
      const mk = (kind) => ({ name: name || kw, kind, line: l.line, endLine: endOf(i), detail: l.text, children: [] });
      if (kw === 'fn') symbols.push(mk('function'));
      else if (kw === 'type') symbols.push(mk('class'));
      else if (kw === 'error') symbols.push(mk('error'));
      else if (kw === 'const') symbols.push(mk('constant'));
      else if (kw === 'test') symbols.push({ ...mk('test'), name: l.text.slice(4).trim() || 'test' });
      else if (MEMBER_BLOCKS.has(kw)) { owner = { ...mk('impl'), name: w.slice(k, k + 3).join(' ') }; symbols.push(owner); }
    } else if (l.depth === 1 && owner && first) {
      const name = first === 'get' && w[1] ? w[1] : first;
      owner.children.push({ name, kind: first === 'get' ? 'property' : 'method', line: l.line, endLine: endOf(i), detail: l.text, children: [] });
    }
  });
  return symbols;
}

/** Long names from tl.def for a module: what the readable view shows instead of the symbols. */
export function longNames(def, moduleName) {
  if (!def || !def.file) return null;
  const names = new Map(def.aliases || []);
  for (const m of [def.global, def.mods.get(moduleName) || new Map()]) for (const [sym, e] of m) if (e.name) names.set(sym, e.name);
  for (const [s, l] of def.fields) if (l) names.set(s, l);
  return names.size ? names : null;
}
