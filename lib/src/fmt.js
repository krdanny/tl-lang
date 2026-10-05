// Canonicalizer (`tl fmt`, spec §53) and virtual view (`tl view`, spec §55).

import { lex, WORD_OPS } from './lexer.js';
import { KEYWORDS } from './prelude.js';

const TERMINATORS = new Set(['|', '<', ';', 'eof']);
const CLOSERS = new Set([')', ']', '}']);

const wordLike = (t) => t.t === 'id' || t.t === 'num' || t.t === 'label';

/**
 * Minimal spacing (R-6.4) and minimal closure (R-7.5), at the token level.
 * Spaces before `[`, `{` and prefix operators are kept as written, since whether they are
 * needed depends on the symbol table (R-6.7).
 */
export function canonicalize(src) {
  let cur = src.replace(/\r?\n$/, '');
  for (let i = 0; i < 8; i++) {
    const next = canonicalizeOnce(cur);
    if (next === cur) return cur;
    cur = next;
  }
  return cur;
}

function canonicalizeOnce(src) {
  const toks = lex(src, 'fmt');
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'eof') break;
    const next = toks[i + 1];
    const endsSegment = TERMINATORS.has(next.t);
    // redundant closers before a terminator
    const emptyUnit = t.v === ')' && toks[i - 1]?.t === 'op' && toks[i - 1].v === '(';
    if (t.t === 'op' && CLOSERS.has(t.v) && endsSegment && !emptyUnit) continue;
    // redundant `<` before end of file
    if (t.t === '<' && toks.slice(i + 1).every((x) => x.t === '<' || x.t === 'eof')) break;
    let text = src.slice(t.pos, t.end);
    if (t.t === 'op' && t.v === '|>') text = '>>';
    if (t.t === 'str' && text.startsWith('"') && t.v.closed && endsSegment && !text.endsWith(' "')) text = text.slice(0, -1);
    if (out.length && t.sp && needsSpace(toks[i - 1], t)) out.push(' ');
    out.push(text);
  }
  return out.join('');
}

function needsSpace(prev, t) {
  if (t.t === 'pstr' && t.v.slash) return true; // `rx /a+/`: without the space the slash would divide
  if (prev.t === 'pstr' && prev.v.prefix === 're' && prev.v.raw && (t.t === 'id' || t.t === 'num')) return true; // `/a/i key:`, `` $re`a`i key: ``: the word would be read as flags
  if (wordLike(prev) && (wordLike(t) || (t.t === 'id'))) return true;
  if ((prev.t === 'id' && WORD_OPS.has(prev.v)) || (t.t === 'id' && WORD_OPS.has(t.v))) return true;
  if (t.t === 'op' && ['-', '*', '.', '..', '[', '{', '#{'].includes(t.v)) return true;
  if (t.t === 'id' && (KEYWORDS.has(t.v) || prev.t === 'id')) return wordLike(prev);
  return false;
}

/** Indented, human-readable rendering of one-line source from the parser's segment list. */
export function view(src, segments, names = null) {
  const sorted = [...segments].sort((a, b) => a.start - b.start || a.depth - b.depth);
  const lines = [];
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (i > 0 && sorted[i - 1].start === s.start) continue;
    const end = i + 1 < sorted.length ? sorted[i + 1].start : src.length;
    let text = src.slice(s.start, Math.max(s.start, end)).replace(/[|<;]+$/, '');
    if (names) text = renameIdents(text, names);
    lines.push('  '.repeat(s.depth) + text);
  }
  return lines.join('\n');
}

function renameIdents(text, names) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (c === '"') { inStr = !inStr; out += c; i++; continue; }
    if (!inStr && /[A-Za-z_]/.test(c) && !/[A-Za-z0-9_$]/.test(text[i - 1] || '')) {
      let j = i;
      while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j++;
      const w = text.slice(i, j);
      out += names.get(w) ?? w;
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
