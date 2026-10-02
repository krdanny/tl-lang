// TL lexer: turns one physical line of TL source into tokens.
// Spec: R-5.x (physical format), R-6.x (tokens, spacing), R-12.x, R-13.x (literals).

import { TLError } from './errors.js';

const OPS = [
  '|>', '=>', '>>', '>=', '==', '!=', '??', '?.', '..=', '**=', '//=', '..', '**', '//',
  '+=', '-=', '*=', '/=', '%=', '+%', '-%', '*%', '#[',
  '+', '-', '*', '/', '%', '>', '=', '?', ',', '.', ':', '&', '^', '!', '\\', '@', '$',
  '(', ')', '[', ']', '{', '}',
];
const TERMS = new Set(['|', '<', ';']);
const REGEX_AFTER_WORD = new Set(['if', 'elif', 'while', 'guard', 'and', 'or', 'not', 'in', 'match', 'for', 'return', 'yield', 'case', 'else', 'do', 'is']);
const DURATION = { ns: 1e-6, us: 1e-3, ms: 1, s: 1000, min: 60000, h: 3600000, d: 86400000 };
const SIZE = { b: 1, kb: 1e3, kib: 1024, mb: 1e6, mib: 1048576, gb: 1e9, gib: 1073741824 };
const ESC = { $: '$', n: '\n', t: '\t', r: '\r', '0': '\0', '"': '"', '\\': '\\', '|': '|', '<': '<', ';': ';', '{': '{', '}': '}', "'": "'", '`': '`' };

const isIdStart = (c) => /[A-Za-z_]/.test(c);
const isId = (c) => /[A-Za-z0-9_]/.test(c);

/**
 * @param {string} src  one line of TL
 * @param {string} file for diagnostics
 * @param {number} base offset added to positions (used for interpolation sub-lexing)
 */
export function lex(src, file = '<input>', base = 0) {
  if (base === 0) {
    // Editors often append a final newline; the canonicalizer removes it (R-5.1 otherwise).
    if (src.endsWith('\n')) src = src.replace(/\r?\n$/, '');
    const nl = src.search(/[\r\n]/);
    if (nl !== -1) throw new TLError('E001', 'a .tl file is exactly one physical line; found a line break', file, nl);
    if (src.charCodeAt(0) === 0xfeff) throw new TLError('E001', 'byte-order mark is not allowed', file, 0);
  }
  const toks = [];
  let i = 0;
  let sp = false;
  const push = (t, v, start, extra = {}) => { toks.push({ t, v, pos: base + start, end: base + i, sp, ...extra }); sp = false; };

  while (i < src.length) {
    const c = src[i];
    const start = i;
    if (c === ' ') { sp = true; i++; continue; }
    if (c === '\t' || /\s/.test(c)) throw new TLError('E002', 'only U+0020 space is allowed as whitespace', file, base + i);

    if (TERMS.has(c)) {
      if (c === '|' && src[i + 1] === '>') { i += 2; push('op', '|>', start); continue; }
      i++; push(c, c, start); continue;
    }
    if (c === '"') { const v = lexString(); push('str', v, start); continue; }
    if (c === '$' && src[i + 1] === '`') { i++; const r = lexRaw(); push('str', { parts: dollarParts(r.text, start + 2), closed: r.closed }, start); continue; }
    if (c === '`') { const v = lexRaw(); push('raw', v, start); continue; }
    if (c === "'") {
      const m = /^'(\\u\{[0-9a-fA-F]+\}|\\x[0-9a-fA-F]{2}|\\.|[^\\'])'/u.exec(src.slice(i));
      if (m) { i += m[0].length; push('char', unescape(m[1].replace(/^'|'$/g, '')), start); continue; }
      const l = /^'([A-Za-z_][A-Za-z0-9_]*)/.exec(src.slice(i));
      if (l) { i += l[0].length; push('label', l[1], start); continue; }
      throw new TLError('E010', 'bad character literal or label', file, base + i);
    }
    if (c === '$' && isIdStart(src[i + 1] || '')) {
      // $name"…  /  $name`…`  literal prefixes (R-13.5); otherwise `$` is the compile-time sigil
      let j = i + 1;
      while (j < src.length && isId(src[j])) j++;
      if (src[j] === '"' || src[j] === '`') {
        const prefix = src.slice(i + 1, j);
        i = j;
        const isRaw = src[i] === '`';
        const v = isRaw ? lexRaw() : lexString();
        let flags = '';
        if (prefix === 're' && isRaw) { const fm = /^[a-z]+/.exec(src.slice(i)); if (fm) { flags = fm[0]; i += flags.length; } }
        push('pstr', { prefix, lit: v, raw: isRaw, flags }, start);
        continue;
      }
    }
    if (c === '/' && src[i + 1] !== '/' && regexPosition()) {
      // /…/flags regex literal: only where an operand can start, so a/b stays a division (R-13.6)
      const r = lexRegex();
      push('pstr', { prefix: 're', lit: { text: r.text }, raw: true, flags: r.flags, slash: true }, start);
      continue;
    }
    if (/[0-9]/.test(c)) { push('num', lexNumber(), start); continue; }
    if (isIdStart(c)) {
      while (i < src.length && isId(src[i])) i++;
      push('id', src.slice(start, i), start);
      continue;
    }
    if (c === '…') { i++; push('id', '…', start); continue; }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) { i += op.length; push('op', op, start); continue; }
    throw new TLError('E011', `unexpected character '${c}'`, file, base + i);
  }
  toks.push({ t: 'eof', v: null, pos: base + src.length, end: base + src.length, sp });
  return toks;

  // A `/` starts a regex when the previous token cannot end an operand (JS uses the same rule),
  // or when it is spaced on the left only: `rx /a+/` is a binding, `a/b` and `a / b` divide (like the spaced `-` of R-6.4).
  function regexPosition() {
    const prev = toks[toks.length - 1];
    if (!prev) return true;
    if (TERMS.has(prev.t)) return true;
    if (prev.t === 'op' && ![')', ']', '}'].includes(prev.v)) return true;
    if (prev.t === 'id' && REGEX_AFTER_WORD.has(prev.v)) return true;
    return sp && src[i + 1] !== ' ' && src[i + 1] !== undefined;
  }

  function lexRegex() {
    i++; // opening slash
    let text = '';
    let inClass = false;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '\\') { text += ch + (src[i + 1] ?? ''); i += 2; continue; }
      if (ch === '[') inClass = true;
      else if (ch === ']') inClass = false;
      else if (ch === '/' && !inClass) break;
      text += ch; i++;
    }
    if (src[i] !== '/') throw new TLError('E014', 'unterminated regex literal', file, base + i);
    i++;
    const fm = /^[a-z]*/.exec(src.slice(i));
    const flags = fm[0]; i += flags.length;
    return { text, flags };
  }

  function lexNumber() {
    const prev = toks[toks.length - 1];
    const afterDot = prev && prev.t === 'op' && (prev.v === '.' || prev.v === '?.') && !prev.sp;
    const rest = src.slice(i);
    let m;
    if (afterDot) m = /^[0-9]+/.exec(rest);
    else m = /^(0x[0-9a-fA-F_]+|0b[01_]+|0o[0-7_]+|[0-9][0-9_]*(\.[0-9][0-9_]*)?([eE][+-]?[0-9]+)?)/.exec(rest);
    let text = m[0];
    i += text.length;
    let suffix = '';
    if (!afterDot) {
      const s = /^[a-z][a-z0-9]*/.exec(src.slice(i));
      if (s) { suffix = s[0]; i += suffix.length; }
    }
    const clean = text.replace(/_/g, '');
    let value;
    if (suffix === 'big' || suffix === 'i64' || suffix === 'u64' || suffix === 'i128' || suffix === 'u128') {
      value = BigInt(clean.startsWith('0') && clean.length > 1 && /^0[xbo]/.test(clean) ? clean : clean.split('.')[0]);
    } else if (clean.startsWith('0b')) value = parseInt(clean.slice(2), 2);
    else if (clean.startsWith('0o')) value = parseInt(clean.slice(2), 8);
    else value = Number(clean);
    let kind = 'num';
    if (suffix in DURATION) { value = value * DURATION[suffix]; kind = 'dur'; }
    else if (suffix in SIZE) { value = value * SIZE[suffix]; kind = 'size'; }
    else if (suffix && !/^(u8|u16|u32|u64|u128|i8|i16|i32|i64|i128|isize|usize|f32|f64|dec|big)$/.test(suffix)) {
      throw new TLError('E012', `unknown numeric suffix '${suffix}'`, file, base + i - suffix.length);
    }
    return { value, text, suffix, kind, float: /[.eE]/.test(clean) && !clean.startsWith('0x') };
  }

  function unescape(s) {
    return s.replace(/\\(u\{([0-9a-fA-F]+)\}|x([0-9a-fA-F]{2})|.)/g, (_, e, u, x) => {
      if (u) return String.fromCodePoint(parseInt(u, 16));
      if (x) return String.fromCharCode(parseInt(x, 16));
      if (e in ESC) return ESC[e];
      throw new TLError('E013', `unknown escape '\\${e}'`, file, base + i);
    });
  }

  // "…  ends at unescaped " or implicitly at | < ; EOF (R-13.1). {expr[:spec]} interpolates (R-13.3).
  function lexString() {
    i++; // opening quote
    const parts = [];
    let buf = '';
    let closed = false;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '\\') {
        const m = /^\\(u\{[0-9a-fA-F]+\}|x[0-9a-fA-F]{2}|.)/.exec(src.slice(i));
        buf += unescape(m[0]);
        i += m[0].length;
        continue;
      }
      if (ch === '"') { i++; closed = true; break; }
      if (TERMS.has(ch)) break;
      if (ch === '$' && /[A-Za-z_]/.test(src[i + 1] || '')) {
        // $name and $a.b interpolate (one token); {expr} is for anything else
        if (buf) { parts.push(buf); buf = ''; }
        const m = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_0-9][A-Za-z0-9_]*)*/.exec(src.slice(i + 1));
        parts.push({ code: m[0], pos: base + i + 1, fmt: null, dbg: false });
        i += 1 + m[0].length;
        continue;
      }
      if (ch === '{') {
        if (buf) { parts.push(buf); buf = ''; }
        i++;
        const exprStart = i;
        let depth = 0;
        while (i < src.length) {
          const d = src[i];
          if (d === '{' || d === '[' || d === '(') depth++;
          else if (d === ']' || d === ')') depth--;
          else if (d === '}') { if (depth === 0) break; depth--; }
          else if (d === '"' || TERMS.has(d)) break;
          i++;
        }
        let code = src.slice(exprStart, i);
        if (src[i] === '}') i++;
        let fmt = null;
        let dbg = false;
        const colon = topLevelColon(code);
        if (colon !== -1) { fmt = code.slice(colon + 1); code = code.slice(0, colon); }
        if (code.endsWith('=') && !code.endsWith('==')) { dbg = true; code = code.slice(0, -1); }
        parts.push({ code, pos: base + exprStart, fmt, dbg });
        continue;
      }
      buf += ch;
      i++;
    }
    if (buf || parts.length === 0) parts.push(buf);
    return { parts, closed };
  }

  function topLevelColon(code) {
    let depth = 0;
    for (let k = 0; k < code.length; k++) {
      const d = code[k];
      if ('([{'.includes(d)) depth++;
      else if (')]}'.includes(d)) depth--;
      else if (d === ':' && depth === 0) return k;
    }
    return -1;
  }

  /** Splits raw text into literal parts and $name interpolations (used by $`…` strings). */
  function dollarParts(text, pos) {
    const parts = [];
    let buf = '';
    for (let k = 0; k < text.length;) {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_0-9][A-Za-z0-9_]*)*)/.exec(text.slice(k));
      if (m) { if (buf) { parts.push(buf); buf = ''; } parts.push({ code: m[1], pos: pos + k + 1, fmt: null, dbg: false }); k += m[0].length; continue; }
      buf += text[k++];
    }
    if (buf || !parts.length) parts.push(buf);
    return parts;
  }

  // N backticks open, N backticks close (R-13.4)
  function lexRaw() {
    let n = 0;
    while (src[i] === '`') { n++; i++; }
    const fence = '`'.repeat(n);
    const end = src.indexOf(fence, i);
    let text;
    if (end === -1) { text = src.slice(i); i = src.length; }
    else { text = src.slice(i, end); i = end + n; }
    return { text, closed: end !== -1 };
  }
}

export const WORD_OPS = new Set(['and', 'or', 'not', 'is', 'by', 'band', 'bor', 'bxor', 'bnot', 'shl', 'shr', 'ushr']);
