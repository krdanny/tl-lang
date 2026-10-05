# Modules and JavaScript interop

Imports are segments starting with `+`, written first.

| TL | Brings in |
|---|---|
| `+users` | sibling file `users.tl`, used as `users.fn` |
| `+users.gu` | one item, used as `gu` |
| `+users.(gu ls)` | several items |
| `+users:u` | alias |
| `+node.fs`, `+node.path` | Node built-in modules |
| `+npm.lodash:ld` | an npm package (default export, else the namespace) |
| `+"./helper.js":h` | a local JavaScript file |

Standard modules need no import: `fs json env proc time log path math http` (see stdlib.md).

```tl
+node.path|+node.os|p os.platform()|print(path.basename"/a/b/c.txt")(path.join"x""y")(p.len>0
```
```text
c.txt x/y true
```

## Calling JavaScript

- JS functions take operands like TL functions: `fs.readFileSync p"utf8"`.
- A JS function with no parameters is called with `()`: `os.platform()`, `Date.now()`, `next()`, `new Date()`.
  Bind the result before using an operator on it: `p os.platform()|p=="linux"`.
- A JS method with arguments: `arr.slice 1 3`.
- JS values: arrays are lists, `Map`/`Set` stay `Map`/`Set`, objects support `o.field` and `o.field=v`.
- Compiled TL modules are ES modules; JS can `import { fnName } from "./module.js"`.
- The module's own location: `import.meta.dirname`, `import.meta.url`. Dynamic import: `await import"node:os"`.

```tl
m await import"node:os|p m.platform()|print(p.length>0)(import.meta.url.length>0
```
```text
true true
```

## Plain objects and function values

- `{a:1}` is a TL map (a JS `Map`). A JS library that expects an options object gets `#{a:1}`, a plain object.
- Every `{…}` written inside `#{…}` is a plain object too: `#{a:1 b:{c:2} xs:[{d:3}]}`. Maps written inside a
  lambda in it stay maps. `obj m` converts an existing map (one level).
- Reading a property that holds a function **calls it**: `o.run` is `o.run()`. To read the function itself, index
  by name: `o["run"]`. The same for `req["app"]`, `x["constructor"]`, `lib["SomeClass"]`.
- A function passed as an operand: `\f` (see functions-and-lambdas.md). A lambda inside a literal needs
  parentheses: `run:(()=>7)`.

```tl
o #{a:1 run:(()=>7|f o["run|r o.run|print r(f())(JSON.stringify #{a:1 b:{c:2
```
```text
7 7 {"a":1,"b":{"c":2}}
```

## Where TL differs from JavaScript

| JavaScript | TL |
|---|---|
| `undefined` / `null` | `none` is `undefined`; `null` is `null`; `x==none` is true for both |
| `a === b` | `==` compares lists, maps and objects by content; `Object.is a b` is the identity test |
| `` `v=${x}` `` with `x` undefined | `"v=$x"` prints `v=none`; `"v="+x` prints `v=undefined` |
| `s.replace("a", "b")` (first match) | `s.sub"a""b"`; `s.replace"a""b"` replaces every match |
| `xs.sort((a, b) => …)` | `xs.sort_with(a b=>…)`; `xs.sort` takes no comparator |
| `xs[9]` out of range gives `undefined` | `xs[9]` panics; `xs.at 9` gives `none` |
| `xs.push(a, b)` | `xs.push a\|xs.push b`: built-in method names take a fixed number of operands on any object |
| `throw {code: 5}` | `!#{code:5}`: an `Error` or a plain object is thrown unchanged; `!"text"` raises an error with that message |
| `try { x.name } catch {}` with `x` undefined | not caught: a member of `none` or an index out of range is a panic, and `catch` does not catch panics. Test first: `if x\|…` or `x?.name` |
| `x?.m(1)` | `?.` covers member reads (`x?.name`); guard a method call with `if x\|…` |
| `this`, `super`, `delete o.k`, `k in o`, `typeof x` | no syntax. Use `self` in methods, `Reflect.deleteProperty`, `Reflect.has o"k"`, `x is str` |
| `export default` | named exports only |

```tl
o #{a:1|x o.b|print"v=$x"("v="+x)(x==null)(Object.is x null
```
```text
v=none v=undefined true false
```

## Module rules

- Every top-level `fn`, `type`, `error` and `const` of a module is exported.
- A file named `prelude.tl` is imported (`+prelude.*`) into every other `.tl` file of its folder automatically:
  put shared helpers there instead of repeating `+util.*` in each module.
- The main file's top-level segments run like a script. Other modules should only declare things.
- Names from `tl.def` compile to their long names in JavaScript (see tl-def.md).
