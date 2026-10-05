// Hover help: what a TL word or sigil means, for people who read TL but do not write it.

export const GLOSSARY = {
  return: '**return** — leaves the function with a value. Written `^` in the TL source. The last line of a body is its value, so most functions need no `return`.',
  '^': '**`^` return** — leaves the function with a value. The last line of a body is its value, so most functions need none.',
  import: '**import** — written `+` in the TL source. `import util.*` brings in every export of `util.tl`; `import parse.parse` one name; `import node.fs` a Node.js module.',
  raise: '**raise** — throws an error. Written `!` in the TL source (`!NotFound`, `!Bad "why"`). A function that raises makes its callers handle or pass on the error (`?`).',
  '!': '**`!` raise** — throws an error (`!NotFound`, `!Bad "why"`).',
  '=': '**`name = value`** — in the TL source a new name is bound without a sign (`total 0`); `=` there only assigns to a name that already exists (`total=total+1`). The readable view writes both with `=`.',
  '>>': '**`>>` pipeline** — passes the value on the left into the step on the right: `xs >> filter f >> map g >> list`. Steps are lazy until a consumer such as `list`, `sum`, `join`, `count`.',
  '=>': '**`=>` lambda** — an anonymous function: `x => x*2`, `a b => a+b`. With an indented body below it, the body is a block.',
  '??': '**`??` default** — the value on the right is used when the left side is `none` (or failed): `port ?? 8080`.',
  '?': '**`?` propagate** — if the call before it failed (or gave `none`), the current function returns that failure immediately; otherwise the value is used.',
  '?.': '**`?.` optional member** — reads the member only when the value is not `none`.',
  '..': '**`a..b` range** — from `a` up to but not including `b`. `for i 0..n` runs `n` times. `xs[1..3]` slices.',
  '..=': '**`a..=b` range** — from `a` up to and including `b`.',
  '#[': '**`#[…]` set literal** — a set of unique values. `[…]` is a list, `{k:v}` a map.',
  fn: '**fn** — declares a function: `fn name param param`. Parameters are separated by spaces; `p=5` has a default, `p:str` is checked at run time, `..rest` collects the remaining arguments.',
  type: '**type** — declares a record (fields below it) or an enum (variants below it).',
  impl: '**impl T** — the methods of type `T`. A method with `self` is called on a value (`v.method a`), one without is static (`T.method a`).',
  init: '**init** — the constructor of the type: `T args` runs it.',
  get: '**get name** — a property computed on read: `value.name`, no call needed.',
  error: '**error** — declares an error type that can be raised with `raise` (`!` in the source).',
  test: '**test** — a test case, run by `tl test`.',
  const: '**const** — a module-level constant; it is exported.',
  guard: '**guard cond** — the short form of `if not cond`: the indented body runs when the condition is false. Shown as `if not` in the readable view.',
  match: '**match value** — picks the first arm whose pattern fits; `_` is the default arm.',
  loop: '**loop** — repeats until `break` or `return`.',
  for: '**for x xs** — loops over a collection or range (`for i 0..n`, `for k,v map`). There is no `in` keyword.',
  if: '**if** — a condition. Written on one line as `if cond a b` it is a value: `a` when true, otherwise `b`.',
  elif: '**elif** — "else if".',
  is: '**is** — tests a value against a type or pattern: `v is SemVer`, `r is Ok x`.',
  none: '**none** — the absent value (JavaScript `undefined`).',
  self: '**self** — the value a method was called on.',
  defer: '**defer expr** — runs `expr` when the enclosing body exits.',
  try: '**try / catch** — runs the body; if it raises, the matching `catch` body runs instead. It is also a value.',
  catch: '**catch** — handles an error raised in the `try` body above; `catch e` binds it.',
  and: '**and** — both must be true. `and`, `or`, `not` bind looser than every symbol operator.',
  or: '**or** — true when either side is true; also gives the right side when the left is falsy.',
  not: '**not** — logical negation.',
  await: '**await** — waits for an async call to finish.',
  async: '**async fn** — a function that can `await`.',
  panic: '**panic "msg"** — stops with an error that `catch` does not handle (a bug, not an expected failure).',
};

const TOKEN = /\.\.=|>>|=>|\?\?|\?\.|\.\.|#\[|[A-Za-z_][A-Za-z0-9_]*|[?^!=]/g;

/** The glossary key under a column, or null (strings are skipped). */
export function glossaryKeyAt(line, col) {
  let inString = false;
  for (let i = 0; i < col && i < line.length; i++) {
    if (line[i] === '\\') { i++; continue; }
    if (line[i] === '"') inString = !inString;
  }
  if (inString) return null;
  TOKEN.lastIndex = 0;
  let m;
  while ((m = TOKEN.exec(line))) {
    const start = m.index;
    const end = start + m[0].length;
    if (col < start) return null;
    if (col >= start && col < end) {
      const key = m[0];
      if (key === '=' && (line[start - 1] === '=' || line[end] === '=' || '!<>+-*/%'.includes(line[start - 1] || ' '))) return null; // ==, !=, >=, +=
      if (key === '!' && line[end] === '=') return null;
      if (key === '?' && /[A-Za-z0-9_)\]"]/.test(line[start - 1] || '') === false) return null;
      return { key, start, end };
    }
  }
  return null;
}
