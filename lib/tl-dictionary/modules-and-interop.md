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
- A JS function with no parameters is called with `()`: `os.platform()`, `Date.now()`.
- A JS method with arguments: `arr.slice 1 3`.
- JS values: arrays are lists, `Map`/`Set` stay `Map`/`Set`, objects support `obj.field`.
- Compiled TL modules are ES modules; JS can `import { fnName } from "./module.js"`.

## Module rules

- Every top-level `fn`, `type`, `error` and `const` of a module is exported.
- A file named `prelude.tl` is imported (`+prelude.*`) into every other `.tl` file of its folder automatically:
  put shared helpers there instead of repeating `+util.*` in each module.
- The main file's top-level segments run like a script. Other modules should only declare things.
- Names from `tl.def` compile to their long names in JavaScript (see tl-def.md).
