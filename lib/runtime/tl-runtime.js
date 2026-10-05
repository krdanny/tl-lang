// TL/JS runtime: the small library every compiled TL module imports as `$`.
// Plain JavaScript, no dependencies beyond Node's standard library.

import nodeFs from 'node:fs';
import nodePath from 'node:path';
import childProcess from 'node:child_process';
import http from 'node:http';

// ───────────────────────── errors, panics, results ─────────────────────────
export const NONE = Object.freeze({ toString: () => 'none' });

export class TLErrorBase extends Error {
  get tlName() { return this.constructor.$tlName || this.constructor.name; }
}

const errorTypes = new Map();
/** `error NF` / tl.def `NF error NotFound "doc {field}"` */
export function errorType(name, fields = [], doc = '') {
  const key = `${name}|${fields.join(',')}|${doc}`;
  if (errorTypes.has(key)) return errorTypes.get(key);
  const C = class extends TLErrorBase {
    constructor(...args) {
      super('');
      fields.forEach((f, i) => { this[f] = args[i]; });
      this.message = doc ? doc.replace(/\{(\w+)\}/g, (_, k) => show(this[k])) : fields.length ? `${name}(${fields.map((f) => show(this[f], true)).join(', ')})` : name;
      this.name = name;
    }
  };
  Object.defineProperty(C, 'name', { value: name });
  C.$tlName = name;
  C.$fields = fields;
  errorTypes.set(key, C);
  return C;
}

export const IoErr = errorType('IoErr', ['why'], 'io error: {why}');
export const ProcErr = errorType('ProcErr', ['code', 'err'], 'process exited with {code}: {err}');
export const TimeoutErr = errorType('Timeout', [], 'timed out');
export const ParseErr = errorType('ParseErr', ['text'], 'cannot parse {text}');
export const Closed = errorType('Closed', [], 'channel closed');

// Errors that http.serve turns into a status code
function httpError(name, status, fields, doc) { const C = errorType(name, fields, doc); C.prototype.status = status; return C; }
export const Missing = httpError('Missing', 404, [], 'not found');
export const Invalid = httpError('Invalid', 400, ['msg'], '{msg}');
export const NotFound = Missing;
export const BadRequest = Invalid;
export const Unauthorized = httpError('Unauthorized', 401, [], 'unauthorized');
export const Forbidden = httpError('Forbidden', 403, [], 'forbidden');
export const Conflict = httpError('Conflict', 409, ['msg'], '{msg}');

export function panicErr(msg, value) {
  const e = new Error(value === undefined ? msg : `${msg}: ${show(value, true)}`);
  e.$panic = true;
  return e;
}
export function isPanic(e) { return !!(e && e.$panic); }

export function raise(x) {
  if (typeof x === 'function' && x.prototype instanceof Error) return new x();
  if (x instanceof Error) return x;
  if (x instanceof Result && !x.ok) return raise(x.error);
  if (x !== null && typeof x === 'object' && Object.getPrototypeOf(x) === Object.prototype) return x; // a plain JavaScript object is thrown as it is (`throw {code: 1}`)
  return new TLErrorBase(typeof x === 'string' ? x : show(x));
}
export function throwNow(x) { throw raise(x); }
export function errName(e) { return e?.constructor?.$tlName || e?.name || e?.constructor?.name; }

export class Result {
  constructor(ok, value, error) { this.ok = ok; this.value = value; this.error = error; }
  get $tag() { return this.ok ? 'Ok' : 'Err'; }
  is_ok() { return this.ok; }
  is_err() { return !this.ok; }
  get failed() { return !this.ok; }
  unwrap() { if (this.ok) return this.value; throw panicErr('unwrap on Err', this.error); }
  expect(msg) { if (this.ok) return this.value; throw panicErr(msg, this.error); }
  err() { return this.ok ? undefined : this.error; }
  ctx(msg) { if (this.ok) return this; const e = new TLErrorBase(`${msg}: ${this.error?.message ?? show(this.error)}`); e.src = this.error; return new Result(false, undefined, e); }
}
export const Ok = (v) => new Result(true, v, undefined);
export const Err = (e) => new Result(false, undefined, e);
export const Some = (v) => v;
export const isOk = (v) => v instanceof Result ? v.ok : v !== undefined;
export const isErr = (v) => v instanceof Result && !v.ok;
export const unwrapOk = (v) => (v instanceof Result ? v.value : v);

/** Unpropagated call to an erroring function becomes Ok/Err (TL/JS binding of R-25.3). */
export function res(fn) {
  try { return Ok(fn()); } catch (e) { if (e === NONE || isPanic(e)) throw e; return Err(e); }
}
export function resP(p) {
  return Promise.resolve(p).then(Ok, (e) => { if (e === NONE || isPanic(e)) throw e; return Err(e); });
}
/** Postfix `?` on optionals and Result values. */
export function q(v) {
  if (v === undefined || v === null) throw NONE;
  if (v instanceof Result) { if (v.ok) return v.value; throw v.error; }
  return v;
}
/** `a??b` where `a` may raise: default on error or none (R-25.4). */
export function co(l, r) {
  try { return orElse(l(), r); } catch (e) { if (e === NONE || isPanic(e)) throw e; return r(); }
}
export async function coP(l, r) {
  try { return orElse(await l(), r); } catch (e) { if (e === NONE || isPanic(e)) throw e; return r(); }
}
export function orElse(v, r) {
  if (v === undefined || v === null) return r();
  if (v instanceof Result) return v.ok ? v.value : r();
  return v;
}

// ───────────────────────── types ─────────────────────────
const types = new Map();

class Lit { constructor(o) { this.o = o; } }
/** A record literal `T{…}` (never routed through `init`). */
export function lit(o) { return new Lit(o); }

export function record(name, fields, base) {
  if (types.has(name)) return types.get(name);
  const C = class extends (base || Object) {
    constructor(...args) {
      // a TL base is built without running its init (this type's init does the work); a JavaScript base gets no arguments
      super(...(base && base.$tlName ? [new Lit({})] : []));
      const literal = args[0] instanceof Lit;
      const o = literal ? args[0].o : typeof this.init === 'function' ? {} : (args[0] ?? {});
      for (const f of fields) this[f.js] = o[f.js] !== undefined ? o[f.js] : f.def ? f.def() : undefined;
      for (const k of Object.keys(o)) if (!(k in this)) this[k] = o[k];
      if (!literal && typeof this.init === 'function') { const r = this.init(...args); if (r instanceof C) return r; } // `^other` from init substitutes an instance
    }
  };
  Object.defineProperty(C, 'name', { value: name });
  C.$tlName = name;
  C.$fields = fields.map((f) => f.js);
  types.set(name, C);
  return C;
}

export function tupleType(name, n) {
  if (types.has(name)) return types.get(name);
  const C = class { constructor(...a) { for (let i = 0; i < n; i++) this[i] = a[i]; } };
  Object.defineProperty(C, 'name', { value: name });
  C.$tlName = name;
  C.$tuple = n;
  types.set(name, C);
  return C;
}

export function enumType(name, variants) {
  if (types.has(name)) return types.get(name);
  const C = class { constructor(tag, payload) { Object.defineProperty(this, '$tag', { value: tag, enumerable: false }); Object.assign(this, payload); } };
  Object.defineProperty(C, 'name', { value: name });
  C.$tlName = name;
  C.$variants = variants;
  for (const v of variants) {
    if (v.named) C[v.name] = (o = {}) => new C(v.name, o);
    else if (v.arity > 0) C[v.name] = (...a) => new C(v.name, Object.fromEntries(a.map((x, i) => [i, x])));
    else {
      const inst = new C(v.name, {});
      if (v.value !== undefined) Object.defineProperty(inst, 'code', { value: v.value, enumerable: false });
      C[v.name] = Object.freeze(inst);
    }
  }
  C.from = (code) => variants.filter((v) => v.value === code).map((v) => C[v.name])[0];
  types.set(name, C);
  return C;
}

export function trait(name, defaults) { return { $trait: name, defaults }; }

export function impl(T, inst, stat, tr, getters) {
  Object.assign(T.prototype, inst);
  if (getters) for (const [k, f] of Object.entries(getters)) Object.defineProperty(T.prototype, k, { get: f, configurable: true });
  for (const [k, v] of Object.entries(stat)) Object.defineProperty(T, k, { value: v, writable: true, configurable: true });
  if (tr) for (const [k, v] of Object.entries(tr.defaults)) if (!(k in T.prototype)) T.prototype[k] = v;
}

const EXT = {};
export function ext(kind, methods) {
  const k = { f64: 'num', f32: 'num', int: 'num', i32: 'num', i64: 'num', u8: 'num', u32: 'num', u64: 'num', float: 'num', num: 'num' }[kind] || kind;
  EXT[k] = { ...(EXT[k] || {}), ...methods };
}

export function tag(v) {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'object' && '$tag' in v) return v.$tag;
  return v?.constructor?.$tlName;
}

export function tuple(...items) { return items; }

// ───────────────────────── display, equality, formatting ─────────────────────────
export function show(v, nested = false) {
  if (v === undefined || v === null) return 'none';
  switch (typeof v) {
    case 'string': return nested ? JSON.stringify(v) : v;
    case 'number': return Number.isInteger(v) ? String(v) : String(v);
    case 'bigint': return String(v);
    case 'boolean': return String(v);
    case 'function': return v.$tlName ? `<type ${v.$tlName}>` : `<fn ${v.name || 'lambda'}>`;
    case 'symbol': return v.toString();
    default:
  }
  if (v === NONE) return 'none';
  if (Array.isArray(v)) return `[${v.map((x) => show(x, true)).join(', ')}]`;
  if (v instanceof Map) return `{${[...v].map(([k, x]) => `${show(k, true)}: ${show(x, true)}`).join(', ')}}`;
  if (v instanceof Set) return `#[${[...v].map((x) => show(x, true)).join(', ')}]`;
  if (v instanceof Result) return v.ok ? `Ok(${show(v.value, true)})` : `Err(${show(v.error, true)})`;
  if (v instanceof Range) return `${v.lo ?? ''}..${v.incl ? '=' : ''}${v.hi ?? ''}`;
  if (v instanceof Error) return v instanceof TLErrorBase ? v.message : `${v.name}: ${v.message}`;
  if (v instanceof Uint8Array) return `b[${[...v].join(' ')}]`;
  if (typeof v.text === 'function' && v.constructor?.$tlName) return v.text();
  const C = v.constructor;
  if (C && C.$variants) {
    const keys = Object.keys(v);
    if (!keys.length) return v.$tag;
    if (keys.every((k) => /^\d+$/.test(k))) return `${v.$tag}(${keys.map((k) => show(v[k], true)).join(', ')})`;
    return `${v.$tag}{${keys.map((k) => `${k}: ${show(v[k], true)}`).join(', ')}}`;
  }
  if (C && C.$tuple) return `${C.$tlName}(${Array.from({ length: C.$tuple }, (_, i) => show(v[i], true)).join(', ')})`;
  if (typeof v[Symbol.iterator] === 'function' || typeof v.next === 'function') return '<iter>';
  if (typeof v.then === 'function') return '<task>';
  const name = C && C.$tlName ? C.$tlName : '';
  return `${name}{${Object.keys(v).map((k) => `${k}: ${show(v[k], true)}`).join(', ')}}`;
}

export function eq(a, b) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return a === b || (Number.isNaN(a) && Number.isNaN(b) && false);
  if (a === undefined || a === null || b === undefined || b === null) return (a ?? undefined) === (b ?? undefined);
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => eq(x, b[i]));
  if (a instanceof Map) return b instanceof Map && a.size === b.size && [...a].every(([k, v]) => b.has(k) && eq(v, b.get(k)));
  if (a instanceof Set) return b instanceof Set && a.size === b.size && [...a].every((x) => b.has(x));
  if (a instanceof Result) return b instanceof Result && a.ok === b.ok && eq(a.value, b.value) && eq(a.error, b.error);
  if (a.constructor !== b.constructor) return false;
  if (typeof a.eq === 'function') return a.eq(b);
  if ('$tag' in a && a.$tag !== b.$tag) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => eq(a[k], b[k]));
}

export function cmp(a, b) {
  if (typeof a === 'number' || typeof a === 'bigint' || typeof a === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (Array.isArray(a)) { for (let i = 0; i < Math.min(a.length, b.length); i++) { const c = cmp(a[i], b[i]); if (c) return c; } return a.length - b.length; }
  if (a && typeof a.cmp === 'function') { const c = a.cmp(b); return typeof c === 'number' ? c : c?.$tag === 'Lt' ? -1 : c?.$tag === 'Gt' ? 1 : 0; }
  return 0;
}

/** Format spec (R-13.3): [fill][> ^ -][+][width][.prec][x b o e % ?] */
export function fmt(v, spec) {
  const m = /^(.?[>^-])?(\+)?(\d+)?(?:\.(\d+))?([xboe%?])?$/.exec(spec);
  if (!m) return show(v);
  let [, align, plus, width, prec, type] = m;
  let s;
  if (type === '?') s = show(v, true);
  else if (type === 'x') s = Number(v).toString(16);
  else if (type === 'b') s = Number(v).toString(2);
  else if (type === 'o') s = Number(v).toString(8);
  else if (type === 'e') s = Number(v).toExponential(prec !== undefined ? +prec : undefined);
  else if (type === '%') s = `${(Number(v) * 100).toFixed(prec !== undefined ? +prec : 0)}%`;
  else if (prec !== undefined && typeof v === 'number') s = v.toFixed(+prec);
  else s = show(v);
  if (plus && typeof v === 'number' && v >= 0) s = `+${s}`;
  if (width) {
    const w = +width;
    let fill = ' ', dir = typeof v === 'number' ? '>' : '-';
    if (align) { dir = align.slice(-1); if (align.length === 2) fill = align[0]; }
    const pad = Math.max(0, w - s.length);
    if (dir === '>') s = fill.repeat(pad) + s;
    else if (dir === '^') s = fill.repeat(Math.floor(pad / 2)) + s + fill.repeat(Math.ceil(pad / 2));
    else s += fill.repeat(pad);
  }
  return s;
}

// ───────────────────────── ranges and iteration ─────────────────────────
export class Range {
  constructor(lo, hi, incl, step = 1) { this.lo = lo; this.hi = hi; this.incl = incl; this.stepBy = step; }
  *[Symbol.iterator]() {
    if (this.lo === undefined) throw panicErr('a range without a start cannot be iterated');
    if (this.stepBy <= 0) throw panicErr('range step must be positive');
    const hi = this.hi === undefined ? Infinity : this.hi;
    for (let i = this.lo; this.incl ? i <= hi : i < hi; i += this.stepBy) yield i;
  }
  has(x) { return (this.lo === undefined || x >= this.lo) && (this.hi === undefined || (this.incl ? x <= this.hi : x < this.hi)); }
  rev() { return [...this].reverse(); }
  len() { return Math.max(0, Math.ceil(((this.incl ? this.hi + 1 : this.hi) - this.lo) / this.stepBy)); }
  step(n) { return new Range(this.lo, this.hi, this.incl, n); }
}
export function range(lo, hi, incl = false, step = 1) { return new Range(lo, hi, incl, step); }

export function iter(x) {
  if (x === undefined || x === null) throw panicErr('cannot iterate none');
  if (x instanceof Map) return x.entries();
  if (typeof x[Symbol.iterator] === 'function') return x;
  if (typeof x.next === 'function') return { [Symbol.iterator]: () => x };
  if (typeof x === 'object') return Object.entries(x);
  throw panicErr('value is not iterable', x);
}
export function aiter(x) {
  if (x && typeof x[Symbol.asyncIterator] === 'function') return x;
  return iter(x);
}
/** Run-time check of an annotated parameter: `fn f s:str` panics when `s` is not a string. */
export function check(v, kind, name, optional) {
  if (optional && v == null) return;
  const t = type_of(v);
  const ok = kind === 'int' ? (t === 'num' && Number.isInteger(v)) : t === kind;
  if (!ok) throw panicErr(`'${name}' expects ${kind}${optional ? '?' : ''} but received ${t === 'none' ? 'none' : `a ${t}`}`);
}

export function entries(x) { return x instanceof Map ? [...x] : Object.entries(x); }

// ───────────────────────── indexing and operators ─────────────────────────
export function idx(obj, i) {
  if (i instanceof Range) {
    const lo = i.lo ?? 0;
    const hi = i.hi === undefined ? undefined : i.incl ? i.hi + 1 : i.hi;
    if (typeof obj === 'string' || Array.isArray(obj) || obj instanceof Uint8Array) return obj.slice(lo, hi);
    throw panicErr('value cannot be sliced', obj);
  }
  if (Array.isArray(obj) || obj instanceof Uint8Array || typeof obj === 'string') {
    if (!Number.isInteger(i) || i < 0 || i >= obj.length) throw panicErr(`index ${i} out of range for length ${obj.length}`);
    return obj[i];
  }
  if (obj instanceof Map) {
    if (!obj.has(i)) throw panicErr('missing key', i);
    return obj.get(i);
  }
  if (obj === undefined || obj === null) throw panicErr('cannot index none');
  if (typeof obj.index === 'function') return obj.index(i);
  return obj[i];
}
export function setIdx(obj, i, v) {
  if (obj instanceof Map) { obj.set(i, v); return; }
  if (Array.isArray(obj)) {
    if (!Number.isInteger(i) || i < 0 || i >= obj.length) throw panicErr(`index ${i} out of range for length ${obj.length}`);
    obj[i] = v;
    return;
  }
  obj[i] = v;
}
export function fdiv(a, b) {
  if (typeof a === 'bigint') { const q = a / b; return (a % b !== 0n && (a < 0n) !== (b < 0n)) ? q - 1n : q; }
  if (b === 0) throw panicErr('division by zero');
  return Math.floor(a / b);
}
export function mul(a, b) {
  if (typeof a === 'string') return a.repeat(b);
  if (Array.isArray(a)) return Array.from({ length: b }, () => a).flat();
  if (typeof b === 'string' || Array.isArray(b)) return mul(b, a);
  return a * b;
}
export function add(a, b) {
  if (Array.isArray(a)) return [...a, ...b];
  return a + b;
}
export function compose(f, g) { return (...a) => g(f(...a)); }

// ───────────────────────── method dispatch (R-9.7) ─────────────────────────
function kindOf(v) {
  if (typeof v === 'string') return 'str';
  if (typeof v === 'number' || typeof v === 'bigint') return 'num';
  if (typeof v === 'boolean') return 'bool';
  if (Array.isArray(v)) return 'list';
  if (v instanceof Map) return 'map';
  if (v instanceof Set) return 'set';
  return 'obj';
}

const METHODS = {
  str: {
    len: (s) => Buffer.byteLength(s), chars: (s) => Array.from(s), bytes: (s) => new TextEncoder().encode(s),
    upper: (s) => s.toUpperCase(), lower: (s) => s.toLowerCase(), trim: (s) => s.trim(),
    split: (s, sep) => (sep === undefined ? s.split(/\s+/).filter(Boolean) : s.split(sep)),
    lines: (s) => s.split(/\r?\n/), words: (s) => s.split(/\s+/).filter(Boolean),
    has: (s, x) => s.includes(x), starts: (s, x) => s.startsWith(x), ends: (s, x) => s.endsWith(x),
    find: (s, x) => { const i = s.indexOf(x); return i < 0 ? undefined : i; },
    replace: (s, a, b) => (a instanceof RegExp ? s.replace(a.global ? a : new RegExp(a.source, a.flags + 'g'), b) : s.split(a).join(b)), sub: (s, a, b) => s.replace(a, b), repeat: (s, n) => s.repeat(n), rev: (s) => Array.from(s).reverse().join(''),
    parse: (s) => { const n = Number(s); if (s.trim() === '' || Number.isNaN(n)) throw new ParseErr(s); return n; },
    first: (s) => Array.from(s)[0], last: (s) => Array.from(s).at(-1),
  },
  list: {
    len: (a) => a.length, push: (a, x) => { a.push(x); }, pop: (a) => a.pop(), first: (a) => a[0], last: (a) => a.at(-1),
    get: (a, i, d) => (i >= 0 && i < a.length ? a[i] : d), insert: (a, i, x) => { a.splice(i, 0, x); },
    remove: (a, i) => a.splice(i, 1)[0], clear: (a) => { a.length = 0; }, clone: (a) => a.slice(),
    sort_with: (a, cmp) => a.sort(cmp), // in place, with a comparator (like JavaScript's sort)
    retain: (a, p) => { const keep = a.filter((x) => p(x)); a.length = 0; a.push(...keep); },
    has: (a, x) => a.some((y) => eq(x, y)), sort: (a) => a.sort(cmp), rev: (a) => a.slice().reverse(),
    at: (a, i) => a.at(i), is_empty: (a) => a.length === 0, empty: (a) => a.length === 0,
  },
  map: {
    len: (m) => m.size, get: (m, k, d) => (m.has(k) ? m.get(k) : d), set: (m, k, v) => { m.set(k, v); }, has: (m, k) => m.has(k),
    del: (m, k) => m.delete(k), keys: (m) => [...m.keys()], vals: (m) => [...m.values()], items: (m) => [...m], entries: (m) => [...m],
    clone: (m) => new Map(m), is_empty: (m) => m.size === 0, empty: (m) => m.size === 0,
  },
  set: {
    len: (s) => s.size, has: (s, x) => s.has(x), add: (s, x) => { s.add(x); }, del: (s, x) => s.delete(x),
    union: (a, b) => new Set([...a, ...b]), inter: (a, b) => new Set([...a].filter((x) => b.has(x))), diff: (a, b) => new Set([...a].filter((x) => !b.has(x))),
    clone: (s) => new Set(s),
  },
  num: {
    abs: Math.abs, sqrt: Math.sqrt, floor: Math.floor, ceil: Math.ceil, round: Math.round, trunc: Math.trunc, sign: Math.sign,
    pow: (a, b) => a ** b, min: (a, b) => Math.min(a, b), max: (a, b) => Math.max(a, b), clamp: (a, lo, hi) => Math.min(hi, Math.max(lo, a)),
    sat_add: (a, b) => a + b, chk_add: (a, b) => (Number.isSafeInteger(a + b) ? a + b : undefined),
  },
  bool: {},
};

// own entries only: `x.toString`, `x.constructor`, … must reach the value, not Object.prototype of a lookup table
const own = (table, name) => (table && Object.hasOwn(table, name) ? table[name] : undefined);

function lookupMethod(obj, name) {
  const kind = kindOf(obj);
  const builtin = own(METHODS[kind], name);
  if (builtin) return { fn: builtin, recvFirst: true };
  const ext = own(EXT[kind], name) || own(EXT.any, name);
  if (ext) return { fn: ext, recvThis: true };
  if (obj !== null && obj !== undefined && name in Object(obj)) {
    const v = obj[name];
    if (typeof v === 'function') return { fn: v, recvThis: true, js: true };
    return { value: v };
  }
  if (obj instanceof Map) return obj.has(name) ? { value: obj.get(name) } : null;
  // helper-by-name fallback (uniform call syntax) only for sequences, never for plain objects
  const proto = Object.getPrototypeOf(obj);
  if (proto === Object.prototype || proto === null) return null;
  const pre = own(PRELUDE_FNS, name);
  if (pre) return { fn: pre, recvFirst: true };
  return null;
}

/** `x.name = v` for maps and objects alike. */
export function setm(obj, name, v) {
  if (obj instanceof Map) obj.set(name, v); else obj[name] = v;
}

/** Matches a request against `GET/todos/:id`; returns the captured params or undefined. */
export function route(req, method, segs) {
  if (!req || req.method !== method) return undefined;
  const parts = String(req.path).split('/').filter(Boolean);
  const params = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s === '*') { params.push(parts.slice(i).join('/')); return params; }
    if (i >= parts.length) return undefined;
    if (s === ':') params.push(decodeURIComponent(parts[i]));
    else if (s !== parts[i]) return undefined;
  }
  return parts.length === segs.length ? params : undefined;
}

/** `x.name` in value position: fields, or zero-argument methods called automatically (R-9.5). */
export function get(obj, name) {
  if (obj === undefined || obj === null) throw panicErr(`cannot read '${name}' of none`);
  const m = lookupMethod(obj, name);
  if (!m) return typeof obj === 'object' ? obj[name] : undefined;
  if ('value' in m) return m.value;
  if (m.recvFirst) return m.fn(obj);
  return m.fn.call(obj);
}
/**
 * `a.b` in the middle of a chain (`a.b.c`, `a.b.c x`, `a.b[0]`). A JavaScript function stored in `b` that takes
 * parameters is the value there (`req.app.db`, `logger.debug.bind`); one without parameters is called (`s.trim.x`).
 */
export function prop(obj, name) {
  if (obj === undefined || obj === null) throw panicErr(`cannot read '${name}' of none`);
  const m = lookupMethod(obj, name);
  if (m && m.js && (m.fn.length > 0 || isClass(m.fn))) return m.fn;
  return get(obj, name);
}
const classes = new WeakMap();
function isClass(f) {
  let c = classes.get(f);
  if (c === undefined) { c = /^class\b/.test(Function.prototype.toString.call(f)); classes.set(f, c); }
  return c;
}
export function getOpt(obj, name) { return obj === undefined || obj === null ? undefined : get(obj, name); }

/** `x.name a b` */
export function call(obj, name, args, fallback) {
  if (obj === undefined || obj === null) throw panicErr(`cannot call '${name}' on none`);
  const m = lookupMethod(obj, name);
  if (!m) {
    if (fallback) return fallback(obj, ...args);
    throw panicErr(`no method '${name}' on ${kindOf(obj) === 'obj' ? show(obj.constructor?.$tlName || 'value') : kindOf(obj)}`);
  }
  if ('value' in m) {
    if (!args.length) return m.value;
    if (typeof m.value === 'function') return m.value(...args);
    throw panicErr(`'${name}' is not a method`);
  }
  if (m.recvFirst) return m.fn(obj, ...args);
  return m.fn.apply(obj, args);
}

export function method(obj, name) { return (...args) => call(obj, name, args); }

// ───────────────────────── prelude functions ─────────────────────────
function* mapG(it, f) { for (const x of iter(it)) yield f(x); }
function* filterG(it, p) { for (const x of iter(it)) if (p(x)) yield x; }
function* takeG(it, n) { if (n <= 0) return; let i = 0; for (const x of iter(it)) { yield x; if (++i >= n) return; } }
function* skipG(it, n) { let i = 0; for (const x of iter(it)) if (i++ >= n) yield x; }
function* stepG(it, n) { let i = 0; for (const x of iter(it)) if (i++ % n === 0) yield x; }
function* enumG(it, start = 0) { let i = start; for (const x of iter(it)) yield [i++, x]; }
function* zipG(a, b) { const ib = iter(b)[Symbol.iterator](); for (const x of iter(a)) { const y = ib.next(); if (y.done) return; yield [x, y.value]; } }
function* flatG(it, f) { for (const x of iter(it)) yield* iter(f ? f(x) : x); }
function* chunksG(it, n) { let c = []; for (const x of iter(it)) { c.push(x); if (c.length === n) { yield c; c = []; } } if (c.length) yield c; }
function* winG(it, n) { const w = []; for (const x of iter(it)) { w.push(x); if (w.length > n) w.shift(); if (w.length === n) yield w.slice(); } }
function* pairsG(it) { let prev, first = true; for (const x of iter(it)) { if (!first) yield [prev, x]; prev = x; first = false; } }
function* cycleG(it) { const all = [...iter(it)]; if (!all.length) return; for (;;) yield* all; }
function* uniqG(it) { const seen = []; for (const x of iter(it)) if (!seen.some((y) => eq(x, y))) { seen.push(x); yield x; } }
function* scanG(it, init, f) { let acc = init; for (const x of iter(it)) { acc = f(acc, x); yield acc; } }

function sortedBy(it, key, opts = {}) {
  const arr = [...iter(it)];
  const k = key || ((x) => x);
  const dir = opts.desc ? -1 : 1;
  arr.sort((a, b) => dir * cmp(k(a), k(b)));
  return arr;
}

export const PRELUDE_FNS = {
  map: mapG, filter: filterG, take: takeG, skip: skipG, step: stepG, enum: enumG, zip: zipG, flat: flatG,
  chunks: chunksG, win: winG, pairs: pairsG, cycle: cycleG, uniq: uniqG, scan: scanG,
  list: (it) => (it && typeof it[Symbol.asyncIterator] === 'function' ? (async () => { const out = []; for await (const x of it) out.push(x); return out; })() : [...iter(it)]),
  set: (it) => new Set(iter(it)),
  map_of: (it) => new Map(iter(it)),
  sum: (it) => { let s = 0, first = true; for (const x of iter(it)) { s = first && typeof x === 'bigint' ? x : s + x; first = false; } return s; },
  count: (it, p) => { let n = 0; for (const x of iter(it)) if (!p || p(x)) n++; return n; },
  tally: (it) => { const m = new Map(); for (const x of iter(it)) m.set(x, (m.get(x) || 0) + 1); return m; },
  all_ok: (it) => { const out = []; for (const x of iter(it)) { if (x instanceof Result) { if (!x.ok) return x; out.push(x.value); } else out.push(x); } return Ok(out); },
  min: (it) => { let m; for (const x of iter(it)) if (m === undefined || cmp(x, m) < 0) m = x; return m; },
  max: (it) => { let m; for (const x of iter(it)) if (m === undefined || cmp(x, m) > 0) m = x; return m; },
  first: (it) => { for (const x of iter(it)) return x; return undefined; },
  last: (it) => { let l; for (const x of iter(it)) l = x; return l; },
  fold: (it, init, f) => { let acc = init; for (const x of iter(it)) acc = f(acc, x); return acc; },
  reduce: (it, f) => { let acc, first = true; for (const x of iter(it)) { acc = first ? x : f(acc, x); first = false; } return acc; },
  find: (it, p) => { for (const x of iter(it)) if (p(x)) return x; return undefined; },
  any: (it, p) => { for (const x of iter(it)) if (p ? p(x) : x) return true; return false; },
  all: (it, p) => {
    if (p === undefined) return Promise.all([...iter(it)]);
    for (const x of iter(it)) if (!p(x)) return false;
    return true;
  },
  each: (it, f) => { for (const x of iter(it)) f(x); },
  sort: (it) => sortedBy(it),
  sort_by: (it, f, opts) => sortedBy(it, f, opts),
  sort_with: (it, cmp) => [...iter(it)].sort(cmp),
  rev: (it) => (typeof it === 'string' ? Array.from(it).reverse().join('') : [...iter(it)].reverse()),
  join: (it, sep = '') => [...iter(it)].map((x) => show(x)).join(sep),
  group_by: (it, f) => { const m = new Map(); for (const x of iter(it)) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; },
  keys: (m) => (m instanceof Map ? [...m.keys()] : Object.keys(m)),
  vals: (m) => (m instanceof Map ? [...m.values()] : Object.values(m)),
  len: (x) => (typeof x === 'string' ? Buffer.byteLength(x) : x instanceof Map || x instanceof Set ? x.size : Array.isArray(x) ? x.length : [...iter(x)].length),
  has: (x, v) => (x instanceof Map || x instanceof Set ? x.has(v) : typeof x === 'string' ? x.includes(v) : x instanceof Range ? x.has(v) : [...iter(x)].some((y) => eq(y, v))),
  lin: (a, b, n) => Array.from({ length: n }, (_, i) => (n === 1 ? a : a + ((b - a) * i) / (n - 1))),
  range: (a, b, step = 1) => new Range(a, b, false, step),
  // async (R-35)
  settle: (ts) => Promise.all([...iter(ts)].map(resP)),
  race: (ts) => Promise.race([...iter(ts)]),
  first_ok: (ts) => Promise.any([...iter(ts)]),
  buffered: async function* (it, n) {
    const src = iter(it)[Symbol.iterator]();
    const inflight = [];
    let done = false;
    const fill = () => { while (!done && inflight.length < n) { const r = src.next(); if (r.done) { done = true; break; } inflight.push(Promise.resolve(r.value)); } };
    fill();
    while (inflight.length) { const v = await inflight.shift(); fill(); yield v; }
  },
  timeout: (ms, p) => Promise.race([typeof p === 'function' ? p() : p, new Promise((_, rej) => setTimeout(() => rej(new TimeoutErr()), ms))]),
  spawn: (f) => Promise.resolve().then(typeof f === 'function' ? f : () => f),
  par: (it) => it,
  run: (f) => (typeof f === 'function' ? f() : f),
};
Object.assign(PRELUDE_FNS, { dict: PRELUDE_FNS.map_of, counts: PRELUDE_FNS.tally, oks: PRELUDE_FNS.all_ok, orderby: PRELUDE_FNS.sort_by, groups: PRELUDE_FNS.group_by, buffer: PRELUDE_FNS.buffered });
export const { map, filter, take, skip, step, zip, flat, chunks, win, pairs, cycle, uniq, scan, list, set, map_of, dict, sum, count, tally, counts, all_ok, oks, min, max, first, last, fold, reduce, find, any, all, each, sort, sort_by, sort_with, orderby, rev, join, group_by, groups, keys, vals, len, has, lin, settle, race, first_ok, buffered, buffer, timeout, spawn, par, run } = PRELUDE_FNS;
export const enum_ = PRELUDE_FNS.enum;
export { enum_ as enum };

// output, assertions
export function print(...args) { console.log(args.map((a) => show(a)).join(' ')); }
export function eprint(...args) { console.error(args.map((a) => show(a)).join(' ')); }
export function assert(cond, msg) { if (cond !== true) throw panicErr(msg ? `assertion failed: ${msg}` : 'assertion failed'); }
export const debug_assert = assert;
export function panic(...msg) { throw panicErr(msg.map((m) => show(m)).join(' ') || 'panic'); }
export function unreachable(msg) { throw panicErr(`unreachable${msg ? `: ${msg}` : ''}`); }
export function todo(msg) { throw panicErr(`not implemented${msg ? `: ${msg}` : ''}`); }
export function dbg(v) { console.error(show(v, true)); return v; }
export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
export function exit(code = 0) { process.exit(code); }
export function type_of(v) {
  if (v === undefined || v === null) return 'none';
  if (typeof v === 'function') return v.$tlName ? 'type' : 'fn';
  if (v instanceof Date) return 'date';
  if (v instanceof RegExp) return 'regex';
  return v?.constructor?.$tlName || kindOf(v);
}

// conversions: types used as functions (R-12.6)
function conv(name, f, parse) {
  const fn = (v) => f(v);
  Object.defineProperty(fn, 'name', { value: name });
  fn.parse = parse || ((s) => { const v = f(s); if (Number.isNaN(v)) throw new ParseErr(s); return v; });
  fn.try = (v) => { try { const r = fn.parse(v); return Number.isNaN(r) ? undefined : r; } catch { return undefined; } };
  return fn;
}
const toInt = (v) => (typeof v === 'string' ? (/^\s*[-+]?\d+\s*$/.test(v) ? parseInt(v, 10) : NaN) : Math.trunc(Number(v)));
export const str = conv('str', (v) => show(v), (s) => s);
export const int = conv('int', toInt);
export const i32 = conv('i32', (v) => toInt(v) | 0);
export const i64 = conv('i64', (v) => BigInt.asIntN(64, BigInt(typeof v === 'number' ? Math.trunc(v) : v)), (s) => BigInt(s));
export const u8 = conv('u8', (v) => toInt(v) & 0xff);
export const u16 = conv('u16', (v) => toInt(v) & 0xffff);
export const u32 = conv('u32', (v) => toInt(v) >>> 0);
export const u64 = conv('u64', (v) => BigInt.asUintN(64, BigInt(typeof v === 'number' ? Math.trunc(v) : v)), (s) => BigInt(s));
export const f64 = conv('f64', (v) => (typeof v === 'string' && v.trim() === '' ? NaN : Number(v)));
export const f32 = conv('f32', (v) => Math.fround(Number(v)));
export const float = f64;
export const dec = f64;
export const big = conv('big', (v) => BigInt(v), (s) => BigInt(s));
export const bool = conv('bool', (v) => (typeof v === 'string' ? v === 'true' : !!v), (s) => { if (s === 'true') return true; if (s === 'false') return false; throw new ParseErr(s); });
export const char = conv('char', (v) => (typeof v === 'number' ? String.fromCodePoint(v) : String(v)[0]));

export function bytes(s) { return Uint8Array.from(s, (c) => c.charCodeAt(0)); }
export function strMacro(prefix, text) {
  if (prefix === 'html') return text;
  if (prefix === 'sql') return { sql: text };
  throw panicErr(`unknown string macro $${prefix}`);
}

// ───────────────────────── resources, cells, channels ─────────────────────────
export function enter(r) { return r && typeof r.enter === 'function' ? r.enter() : r; }
export function leave(r) {
  if (!r) return;
  if (typeof r.exit === 'function') r.exit();
  else if (typeof r.close === 'function') r.close();
  else if (typeof r[Symbol.dispose] === 'function') r[Symbol.dispose]();
}

export function lazy(v) { return v; }
/** `obj{a:1}` — a plain JavaScript object from a map or pairs (for JS interop) */
export function obj(m) { return m instanceof Map ? Object.fromEntries(m) : Array.isArray(m) ? Object.fromEntries(m) : { ...m }; }
/** `new Date s` — construct a JavaScript class */
export function new_(C, ...args) { return new C(...args); }
export { new_ as new };
export function Cell(v) { let x = v; return { get: () => x, set: (y) => { x = y; } }; }
export function Mutex(v) { return Cell(v); }
export function thread(f) { const p = Promise.resolve().then(f); return { join: () => resP(p) }; }

export function chan(cap = Infinity) {
  const buf = [];
  const waiters = [];
  const senders = [];
  let closed = false;
  const tx = {
    async send(v) {
      if (closed) throw new Closed();
      if (waiters.length) { waiters.shift()(v); return; }
      if (buf.length >= cap) await new Promise((r) => senders.push(r));
      buf.push(v);
    },
    close() { closed = true; while (waiters.length) waiters.shift()(NONE); },
  };
  const rx = {
    async recv() {
      if (buf.length) { const v = buf.shift(); if (senders.length) senders.shift()(); return v; }
      if (closed) throw new Closed();
      const v = await new Promise((r) => waiters.push(r));
      if (v === NONE) throw new Closed();
      return v;
    },
    async *[Symbol.asyncIterator]() { for (;;) { try { yield await rx.recv(); } catch (e) { if (e instanceof Closed) return; throw e; } } },
  };
  return [tx, rx];
}

export async function scope(body) {
  const tasks = [];
  const s = { spawn: (f) => { const p = Promise.resolve().then(typeof f === 'function' ? f : () => f); tasks.push(p); return p; } };
  const r = await body(s);
  await Promise.all(tasks);
  return r;
}

// ───────────────────────── tests ─────────────────────────
const TESTS = [];
export function test(name, fn) { TESTS.push({ name, fn }); }
export async function runTests(filter, log = console.log) {
  let passed = 0, failed = 0;
  for (const t of TESTS) {
    if (filter && !t.name.includes(filter)) continue;
    try { await t.fn(); passed++; log(`  ok   ${t.name}`); }
    catch (e) { failed++; log(`  FAIL ${t.name}: ${e?.message ?? show(e)}`); }
  }
  return { passed, failed };
}

// ───────────────────────── standard modules ─────────────────────────
function io(fn) {
  try { return fn(); } catch (e) { if (e.$panic) throw e; throw new IoErr(e.message); }
}

function fileHandle(p) {
  return {
    path: p,
    read: () => io(() => nodeFs.readFileSync(p, 'utf8')),
    lines: () => io(() => nodeFs.readFileSync(p, 'utf8').split(/\r?\n/)),
    write: (s) => io(() => nodeFs.writeFileSync(p, s)),
    close() {},
  };
}

export const std = {
  fs: {
    read: (p) => io(() => nodeFs.readFileSync(p, 'utf8')),
    read_bytes: (p) => io(() => new Uint8Array(nodeFs.readFileSync(p))),
    write: (p, s) => io(() => nodeFs.writeFileSync(p, s)),
    append: (p, s) => io(() => nodeFs.appendFileSync(p, s)),
    exists: (p) => nodeFs.existsSync(p),
    rm: (p) => io(() => nodeFs.rmSync(p, { recursive: true, force: true })),
    mkdir: (p) => io(() => { nodeFs.mkdirSync(p, { recursive: true }); }),
    ls: (p = '.') => io(() => nodeFs.readdirSync(p)),
    lines: (p) => io(() => nodeFs.readFileSync(p, 'utf8').split(/\r?\n/)),
    open: (p) => { io(() => nodeFs.accessSync(p)); return fileHandle(p); },
    *walk(dir) {
      for (const e of nodeFs.readdirSync(dir, { withFileTypes: true })) {
        const full = nodePath.join(dir, e.name);
        if (e.isDirectory()) yield* std.fs.walk(full); else yield full;
      }
    },
    stat: (p) => io(() => { const s = nodeFs.statSync(p); return { size: s.size, dir: s.isDirectory(), modified: s.mtimeMs }; }),
  },
  json: {
    de: (t) => { try { return JSON.parse(t); } catch (e) { throw new ParseErr(String(t).slice(0, 40)); } },
    en: (v, indent) => JSON.stringify(toJson(v), null, indent),
    pretty: (v) => JSON.stringify(toJson(v), null, 2),
    /** json.store path defaults — loads the file (or the defaults) and writes it back after every change. */
    store(file, defaults) {
      const data = nodeFs.existsSync(file) ? JSON.parse(nodeFs.readFileSync(file, 'utf8')) : JSON.parse(JSON.stringify(toJson(defaults)));
      const save = () => nodeFs.writeFileSync(file, JSON.stringify(data));
      const wrap = (o) => (o && typeof o === 'object' ? new Proxy(o, {
        get: (t, k) => wrap(t[k]),
        set: (t, k, v) => { t[k] = v && typeof v === 'object' ? JSON.parse(JSON.stringify(toJson(v))) : v; save(); return true; },
        deleteProperty: (t, k) => { delete t[k]; save(); return true; },
      }) : o);
      if (!nodeFs.existsSync(file)) save();
      return wrap(data);
    },
  },
  // `env.PORT` reads and `env.PORT=v` writes process.env, next to `get`, `set` and `vars`
  env: new Proxy({
    get: (k, d) => process.env[k] ?? d,
    set: (k, v) => { process.env[k] = String(v); },
    vars: () => new Map(Object.entries(process.env)),
  }, {
    get: (t, k) => (k in t ? t[k] : process.env[k]),
    has: (t, k) => k in t || k in process.env,
    set: (t, k, v) => { process.env[k] = v; return true; },
  }),
  proc: {
    args: () => process.argv.slice(2),
    pid: () => process.pid,
    cwd: () => process.cwd(),
    exit: (c = 0) => process.exit(c),
    run: (argv, opts = {}) => {
      const r = childProcess.spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', cwd: opts.cwd, env: opts.env ? { ...process.env, ...Object.fromEntries(opts.env) } : undefined, input: opts.input });
      if (r.error) throw new IoErr(r.error.message);
      const out = { code: r.status, out: r.stdout, err: r.stderr };
      if (r.status !== 0 && opts.check !== false) throw new ProcErr(r.status, r.stderr.trim());
      return out;
    },
    sh: (cmd, opts = {}) => std.proc.run(['sh', '-c', cmd], opts),
    spawn: (argv, opts = {}) => childProcess.spawn(argv[0], argv.slice(1), { stdio: 'pipe', ...opts }),
  },
  time: {
    now: () => Date.now(),
    ms: () => performance.now(),
    since: (t) => performance.now() - t,
  },
  log: Object.fromEntries(['debug', 'info', 'warn', 'error'].map((lvl) => [lvl, (...args) => {
    const fields = args.length && args.at(-1) && typeof args.at(-1) === 'object' && !Array.isArray(args.at(-1)) && Object.getPrototypeOf(args.at(-1)) === Object.prototype ? args.pop() : null;
    const kv = fields ? ' ' + Object.entries(fields).map(([k, v]) => `${k}=${show(v, true)}`).join(' ') : '';
    console.error(`${lvl.toUpperCase().padEnd(5)} ${args.map((a) => show(a)).join(' ')}${kv}`);
  }])),
  path: {
    join: (...p) => nodePath.join(...p), base: (p) => nodePath.basename(p), dir: (p) => nodePath.dirname(p),
    ext: (p) => nodePath.extname(p), abs: (p) => nodePath.resolve(p),
  },
  math: {
    sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, pow: Math.pow,
    min: Math.min, max: Math.max, rand: Math.random, randint: (a, b) => a + Math.floor(Math.random() * (b - a + 1)), PI: Math.PI,
  },
  http: {
    async get(url, opts = {}) {
      const r = await fetch(url, { headers: opts.headers });
      const body = await r.text();
      return { status: r.status, body, json: () => JSON.parse(body) };
    },
    async post(url, data, opts = {}) {
      const r = await fetch(url, { method: 'POST', body: typeof data === 'string' ? data : JSON.stringify(toJson(data)), headers: { 'content-type': typeof data === 'string' ? 'text/plain' : 'application/json', ...(opts.headers || {}) } });
      const body = await r.text();
      return { status: r.status, body, json: () => JSON.parse(body) };
    },
    /** http.serve 3000 req=>… ; the handler returns a string, a value (sent as JSON) or {status body headers} */
    serve(port, handler) {
      const server = http.createServer(async (req, res) => {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const url = new URL(req.url, 'http://localhost');
        const text = Buffer.concat(chunks).toString('utf8');
        const request = {
          method: req.method, path: url.pathname, query: new Map(url.searchParams), headers: req.headers, body: text,
          get json() { try { return JSON.parse(text); } catch { throw new BadRequest('invalid json'); } },
        };
        try {
          let out = await handler(request);
          if (out instanceof Map && out.has('status') && out.has('body')) out = Object.fromEntries(out);
          let status = 200, headers = {}, body = out;
          if (out && typeof out === 'object' && 'status' in out && 'body' in out) ({ status, headers = {}, body } = out);
          if (typeof body !== 'string') { body = JSON.stringify(toJson(body)); headers['content-type'] ??= 'application/json'; }
          res.writeHead(status, headers).end(body);
        } catch (e) {
          if (isPanic(e) || !(e instanceof TLErrorBase)) { console.error(e); res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'internal error' })); return; }
          const status = e.status || { Missing: 404, NotFound: 404, Invalid: 400, BadRequest: 400, Unauthorized: 401, Forbidden: 403, Conflict: 409 }[errName(e)] || 400;
          res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ error: e.message }));
        }
      });
      server.listen(port);
      return server;
    },
  },
};

function toJson(v) {
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [String(k), toJson(x)]));
  if (v instanceof Set) return [...v].map(toJson);
  if (Array.isArray(v)) return v.map(toJson);
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Result) return v.ok ? { ok: toJson(v.value) } : { err: show(v.error) };
  if (v && typeof v === 'object') {
    const o = {};
    if ('$tag' in v) o.tag = v.$tag;
    for (const k of Object.keys(v)) o[k] = toJson(v[k]);
    return o;
  }
  return v;
}
