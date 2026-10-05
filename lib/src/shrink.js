// `tl shrink`: removes tokens that do not change the program. Each candidate edit is kept only when the compiled
// JavaScript stays identical (compared with parentheses of the source ignored, since the output parenthesizes every
// operation itself), so the result is the same program in fewer tokens.

import fs from 'node:fs';
import { lex } from './lexer.js';
import { canonicalize } from './fmt.js';
import { compileSource } from './compile.js';

const TERM = new Set(['|', '<', ';', 'eof']);
const OPEN = new Set(['(', '[', '{', '#{', '#[']);
const CLOSE = new Set([')', ']', '}']);

// token count when gpt-tokenizer is installed (it is optional), otherwise characters without spaces
let encode = null;
try { ({ encode } = await import('gpt-tokenizer/encoding/o200k_base')); } catch {}
const size = (s) => (encode ? encode(s).length : s.replace(/ /g, '').length);

function program(src, file) {
  try { return compileSource(src, { file, bareParens: true }).js; } catch { return null; }
}

/** Candidate edits, last first, each a function src -> src (or null). Positions refer to `src` as lexed. */
function candidates(src, file) {
  const t = lex(src, file);
  const out = [];
  const cut = (a, b, s = '') => Object.assign((x) => x.slice(0, a) + s + x.slice(b), { pos: a });
  for (let i = 0; i < t.length; i++) {
    const x = t[i];
    // `^v` where the plain value would be returned anyway
    if (x.t === 'op' && x.v === '^') out.push(cut(x.pos, x.end));
    // `if not c` -> `guard c`
    if (x.t === 'id' && x.v === 'if' && t[i + 1]?.t === 'id' && t[i + 1].v === 'not' && (i === 0 || ['|', '<', ';'].includes(t[i - 1].t))) out.push(cut(x.pos, t[i + 1].end, 'guard'));
    // `+npm.x` / `+node.x` -> `+x`
    if (x.t === 'op' && x.v === '+' && (i === 0 || ['|', '<', ';'].includes(t[i - 1].t)) && t[i + 1]?.t === 'id' && ['npm', 'node'].includes(t[i + 1].v) && t[i + 2]?.v === '.') out.push(cut(t[i + 1].pos, t[i + 2].end));
    // redundant parentheses
    if (x.t === 'op' && x.v === '(') {
      let d = 0, k = i;
      for (; k < t.length; k++) {
        const y = t[k];
        if (y.t === 'op' && OPEN.has(y.v)) d++;
        else if (y.t === 'op' && CLOSE.has(y.v)) { d--; if (d === 0) break; }
        else if (TERM.has(y.t) && d === 1) { k = -1; break; } // closed implicitly at the end of the segment
      }
      if (k >= t.length) continue;
      const close = k > 0 && t[k].v === ')' ? t[k] : null;
      if (k > 0 && !close) continue;
      const prev = t[i - 1];
      const glue = !prev || TERM.has(prev.t) || (prev.t === 'op' && !CLOSE.has(prev.v)) ? '' : ' ';
      out.push(Object.assign((s) => {
        let r = s;
        if (close) r = r.slice(0, close.pos) + ' ' + r.slice(close.end);
        return r.slice(0, x.pos) + (x.sp ? '' : glue) + r.slice(x.end);
      }, { pos: x.pos }));
    }
  }
  return out.sort((a, b) => b.pos - a.pos);
}

/** @returns {{ src: string, removed: number }} the shrunk source and how many edits were kept */
export function shrinkSource(src, file) {
  src = src.replace(/\r?\n$/, '');
  const want = program(src, file);
  if (want === null) return { src, removed: 0, error: true };
  let kept = 0;
  // From the end of the file to the start; after a kept edit the candidates before it are computed again,
  // so every position refers to the current text.
  src = canonicalize(src);
  for (let sweep = 0; sweep < 4; sweep++) {
    const before = kept;
    let limit = Infinity;
    for (;;) {
      const list = candidates(src, file).filter((c) => c.pos <= limit);
      let accepted = false;
      for (const edit of list) {
        limit = edit.pos;
        let next;
        try { next = canonicalize(edit(src)); } catch { continue; }
        if (size(next) >= size(src)) continue;
        if (program(next, file) === want) { src = next; kept++; accepted = true; break; }
      }
      if (!accepted) break;
    }
    if (kept === before) break;
  }
  src = canonicalize(src);
  return { src, removed: kept };
}

export function shrinkFile(file, { write = true } = {}) {
  const before = fs.readFileSync(file, 'utf8');
  const r = shrinkSource(before, file);
  if (write && r.src !== before.replace(/\r?\n$/, '')) fs.writeFileSync(file, r.src);
  return r;
}
