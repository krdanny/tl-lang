// Names and arities the compiler needs to parse calls without parentheses (spec §9).
// -1 means "variadic / optional parameters": the callee takes every remaining operand (R-9.3).
// Implementations live in runtime/tl-runtime.js; the two lists must stay in sync.

export const PRELUDE = {
  // output, assertions, control
  print: -1, eprint: -1, assert: -1, debug_assert: -1, panic: -1, unreachable: -1, todo: -1,
  sleep: 1, exit: -1, type_of: 1, show: 1, dbg: 1,
  // conversions (types used as functions, R-12.6)
  str: 1, int: 1, i32: 1, i64: 1, u8: 1, u16: 1, u32: 1, u64: 1, f32: 1, f64: 1, float: 1, bool: 1, big: 1, char: 1, dec: 1,
  // optionals and results
  Some: 1, Ok: 1, Err: 1,
  // async and concurrency (R-35, R-36)
  spawn: 1, run: 1, scope: -1, timeout: 2, thread: 1, chan: -1,
  // misc
  lazy: 1, Cell: 1, Mutex: 1, new: -1, obj: 1,
};

// Iterator consumers and adapters (R-23.2). They are available as pipeline stages (`xs|>sum`)
// and as methods (`xs.sum`, uniform call syntax R-9.7) but are not global names, so common
// words such as count, sum, first, max and find stay free for variables.
export const PIPELINE = {
  list: 1, set: 1, dict: 1, sum: 1, count: -1, counts: 1, oks: 1, min: 1, max: 1, first: 1, last: 1,
  map: 2, filter: 2, fold: 3, reduce: 2, find: 2, any: -1, all: -1, each: 2, take: 2, skip: 2, step: 2,
  sort: 1, orderby: -1, rev: 1, enum: -1, zip: 2, join: -1, groups: 2, flat: -1, chunks: 2, win: 2,
  pairs: 1, cycle: 1, uniq: 1, scan: 3, lin: 3, keys: 1, vals: 1, len: 1, has: 2, range: -1,
  settle: 1, race: 1, first_ok: 1, buffer: 2, par: 1,
  // aliases kept for older code (canonical names above are one token each)
  map_of: 1, tally: 1, all_ok: 1, sort_by: -1, sort_with: 2, group_by: 2, buffered: 2,
};

// Standard modules available without import (spec §46.8 prelude) and their function arities.
export const STD = {
  fs: { read: 1, read_bytes: 1, write: 2, append: 2, exists: 1, rm: 1, mkdir: 1, ls: 1, lines: 1, open: 1, walk: 1, stat: 1 },
  json: { de: 1, en: -1, pretty: 1, store: 2 },
  env: { get: -1, set: 2, vars: 0 },
  proc: { run: -1, sh: -1, exit: -1, args: 0, pid: 0, cwd: 0, spawn: -1 },
  time: { now: 0, ms: 0, since: 1 },
  log: { info: -1, warn: -1, error: -1, debug: -1 },
  path: { join: -1, base: 1, dir: 1, ext: 1, abs: 1 },
  math: { sqrt: 1, abs: 1, floor: 1, ceil: 1, round: 1, pow: 2, min: -1, max: -1, rand: 0, randint: 2, PI: 0 },
  http: { get: -1, post: -1, serve: -1 },
};

// Methods on built-in values (strings, lists, maps, sets, numbers) with fixed arity.
// Unknown methods take all remaining operands (R-9.3).
export const METHODS = {
  len: 0, upper: 0, lower: 0, trim: 0, chars: 0, bytes: 0, lines: 0, words: 0, rev: 0,
  push: 1, pop: 0, shift: 0, insert: 2, remove: 1, clear: 0, retain: 1, clone: 0,
  first: 0, last: 0, unwrap: 0, expect: 1, is_ok: 0, is_err: 0, failed: 0, empty: 0, is_some: 0, is_none: 0, ok: 0, err: 0,
  starts: 1, ends: 1, has: 1, find: 1, replace: 2, sub: 2, repeat: 1, parse: 0,
  keys: 0, vals: 0, items: 0, entries: 0, set: -1, get: -1, del: 1, add: 1,
  abs: 0, sqrt: 0, floor: 0, ceil: 0, round: 0, trunc: 0, pow: 1, sign: 0,
  enum: -1, sum: 0, count: 0, list: 0, sort: 0, sort_with: 1, min: 0, max: 0, any: -1, all: -1,
  map: 1, filter: 1, fold: 2, each: 1, take: 1, skip: 1, zip: 1, win: 1, chunks: 1, tally: 0,
  or_err: 1, ctx: 1, then: 1,
};

// Words that are reserved at the start of a segment or in expressions (spec §65.2, TL/JS subset).
export const KEYWORDS = new Set([
  'fn', 'gen', 'type', 'trait', 'impl', 'ext', 'mod', 'alias', 'const', 'static', 'var', 'let', 'error',
  'test', 'if', 'elif', 'else', 'match', 'guard', 'while', 'for', 'loop', 'repeat', 'do', 'break',
  'continue', 'yield', 'pass', 'try', 'catch', 'finally', 'defer', 'errdefer', 'async', 'await',
  'with', 'move', 'own', 'unsafe', 'and', 'or', 'not', 'is', 'by', 'true', 'false', 'none',
  'band', 'bor', 'bxor', 'bnot', 'shl', 'shr', 'requires', 'ensures',
]);

// Errors that http.serve maps to a status code (spec §52.2 `errors` clause). Arity 1 = takes a message.
export const HTTP_ERRORS = { Missing: 0, Invalid: 1, Unauthorized: 0, Forbidden: 0, Conflict: 1, NotFound: 0, BadRequest: 1 };

export const PRIMITIVE_TYPES = new Set([
  'bool', 'int', 'uint', 'i8', 'i16', 'i32', 'i64', 'i128', 'isize', 'u8', 'u16', 'u32', 'u64', 'u128', 'usize',
  'f32', 'f64', 'float', 'dec', 'big', 'char', 'str', 'bytes', 'unit', 'never', 'any', 'dur', 'list', 'map', 'num',
]);

// JavaScript globals known to the compiler (so `parseInt x 10` is a call, never a binding).
export const JS_GLOBALS = ['parseInt', 'parseFloat', 'isNaN', 'isFinite', 'Number', 'String', 'Boolean', 'Array', 'Object', 'Date', 'RegExp',
  'Math', 'JSON', 'console', 'process', 'Buffer', 'Promise', 'Symbol', 'Map', 'Set', 'WeakMap', 'Error', 'TypeError', 'RangeError',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI', 'globalThis', 'NaN', 'Infinity', 'undefined', 'BigInt', 'Intl',
  'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder', 'fetch', 'structuredClone', 'queueMicrotask', 'setTimeout', 'clearTimeout',
  'setInterval', 'clearInterval', 'setImmediate', 'atob', 'btoa', 'Reflect', 'Proxy', 'Uint8Array', 'ArrayBuffer', 'Function'];

// Identifiers that are JavaScript reserved words must be renamed in output.
export const JS_RESERVED = new Set([
  'arguments', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
  'do', 'else', 'enum', 'eval', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'implements',
  'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null', 'package', 'private', 'protected', 'public',
  'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'undefined', 'var', 'void',
  'while', 'with', 'yield', 'NaN', 'Infinity',
]);
