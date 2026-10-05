# TL for Node.js (TL/JS 0.1)

TL (Token Language) is a token-minimal language for LLM-written software. This package compiles TL to
JavaScript and runs it on Node.js the way TypeScript does: a compiler (`tlc`, like `tsc`), a project file
(`tlconfig.json`, like `tsconfig.json`), a loader for running `.tl` files directly (like `tsx`), and plain
JavaScript output that imports npm packages and can be imported by JS.

The compiler, runtime and tooling are plain JavaScript (ES modules) with no dependencies and no build step.

The language itself is specified in `TL_Language_Specification_v0.1.docx`.

```
+node.path|n"World|print"Hello {n}!|for i 0..3|print i (path.join"a""b")
```

## Quick start

```sh
npm link                      # from this directory: puts `tl` and `tlc` on your PATH
mkdir hello && cd hello
tl init                       # tlconfig.json, package.json, src/main.tl, src/tl.def
tl run src/main.tl            # compile in memory and run
tlc                           # compile src/ -> dist/ (like tsc)
node dist/main.js             # plain JavaScript
```

| TypeScript | TL |
|---|---|
| `tsc` | `tlc` |
| `tsconfig.json` | `tlconfig.json` (`rootDir`, `outDir`, `runtime`, `include`) |
| `tsc --watch` / `--noEmit` | `tlc --watch` / `--noEmit` |
| `tsx app.ts`, `node --import tsx app.ts` | `tl run app.tl`, `node --import tl-lang/register app.tl` |
| `tslib` helpers | `tl-runtime.js`, copied into `outDir` (or `"runtime": "package"` to import `tl-lang/runtime`) |
| `.d.ts` declarations | `tl.def` semantic dictionary (`.d.ts` emit is planned) |

## Commands

| Command | What it does |
|---|---|
| `tlc [files…] [-p tlconfig.json] [--outDir d] [--rootDir r] [--watch] [--noEmit]` | Compile a project or files to `.js` |
| `tl run <file.tl> [args…]` | Compile in memory and run |
| `tl test [files\|dirs]` | Run `test"name|…` blocks |
| `tl check <files>` | Diagnostics only |
| `tl compile <file.tl>` | Print the generated JavaScript |
| `tl fmt <files> [--check]` | Rewrite in canonical form: minimal spaces, no redundant closers (spec §53) |
| `tl def [dir] [--check]` | Create or update the mandatory dictionary `tl.def`: a short symbol for every compound name, sources rewritten |
| `tl view <file.tl>` | Readable view: indented, closers restored, long names from `tl.def` (`--short`, `--sigils`, `--plain`) |
| `tl init` | Create a project |

Diagnostics use the compact spec format (§59):

```
E116@main:c22 'f' takes 2 operand(s) but got 1 fixes paren|add-operands
  fn f a b|a+b<print(f 1)
                        ^
```

## A short tour

Each line below is a complete `.tl` file (TL source is always one line).

```
xs[5 3 8 1|print(xs>>filter _>3>>map _*10>>list)(xs>>sum)
fn fact n|if 2>n|1<else|n*(fact n-1)<<print(fact 10)
type Sh|Circle f64|Rect{w f64 h f64}|Empty<impl Sh|area self|match self|Circle r|3.14*r*r<Rect{w h|w*h<Empty|0.0<<<<print(Circle 2.0).area
error NF|fn load id>str!NF|if id==1|"ann"<else|!NF<<print(load 1)(load 2)|x try|load 2?<catch NF|"fallback"<print x
async fn dbl n|await sleep 10ms|n*2<rs[1 2 3]>>map dbl>>all>>await|print rs
srv http.serve 3000 req=>|match req.path|"/"|"hello from TL"<_|{"status":404 "body":"not found"}<<<print"listening
```

More complete programs are in `examples/`, one per feature area:
- **Language:** `loops.tl`, `match.tl`, `errors.tl`, `pipelines.tl`, `async.tl`, `misc.tl`
- **Interop and servers:** `interop.tl`, `server.tl`
- **Modules and tests:** `app/` (a multi-module project using `tl.def`), `math.test.tl`

## The semantic dictionary (`tl.def`)

`tl.def` is mandatory: a project does not compile without it (`E260`). Compound names (camelCase, snake_case) are
not written in `.tl` files (`E261`); each gets a pair `<symbol> <longName>` on the names line of `tl.def` and the source uses the
symbol, so a long name is paid for once. `tl def` writes the file for you. Typed entries additionally give
symbols their signatures and error sets (spec §10). The compiler uses it to parse calls without parentheses, emit readable JavaScript with the long
names, and map short field names to real property names.

```
@mod users
U   type  User      {i=id:int n=name:str a=active:bool=true}
gu  fn    getUser   (i=id:int) >U !NF
NF  error Missing  "user not found"
```

With that dictionary, `fn gu|u db>>find x=>x.i==i|if u is Some v|v<else|!NF<<` compiles to
`function getUser(id) { … x.id === id … }`.

## JavaScript and npm interop

| TL | JavaScript |
|---|---|
| `+node.fs` | `import * as fs from "node:fs"` |
| `+npm.lodash:ld` | `import * as ld$ns from "lodash"; const ld = ld$ns.default ?? ld$ns` |
| `+"./helper.js":h` | import a local JS module |
| `+users` / `+users.gu` | import a sibling TL module / one item |
| `fs.readFileSync p "utf8"` | calls a JS function with operands |
| `os.platform()` | a JS function with no parameters is called with `()` |

Compiled TL modules are ordinary ES modules, so JavaScript can import them (`import { getUser } from "./users.js"`).

## How TL maps to JavaScript (TL/JS host binding)

| TL | JavaScript |
|---|---|
| `int`, `f64` | `number`; `big`, `i64`, `u64` → `BigInt` |
| `[a b]`, `{k:v}`, `#[a]` | `Array`, `Map`, `Set` |
| tuples `a,b` | arrays |
| `type U|…` records | classes (`$.record`) with defaults |
| enums / variants | tagged class instances (`$.enumType`) |
| `T?`, `none` | `undefined` |
| `!E`, `?` on errors | `throw` / normal propagation |
| call to an erroring function without `?` | an `Ok`/`Err` value |
| `x.f a` | method, then extension, then helper with `x` first (uniform call syntax) |
| `async`/`await`, `scope`, `chan` | Promises, a task group, an async channel |
| `with`, `defer` | `try/finally` |
| `test"name|…` | registered, run by `tl test` |

## Status: what TL/JS 0.1 does not do yet

- **No static type checker.** Types are parsed and then erased (the way `tsc --noCheck` erases them). Arity,
  error sets and names come from `tl.def` and declarations. Checking is the next milestone.
- **Numbers are JavaScript numbers.** There are no overflow checks, and `/` on integers is floating-point
  division (use `//` for floor division).
- **Not supported yet:** ownership and borrowing, `$` compile-time code and macros, effects and `handle`,
  HTTP route segments, `fuzz`/`bench`, source maps, and `.d.ts` output.
- **Threads:** `thread` runs as an async task. Worker-backed threads are planned.

## Things that surprise people (and are by design)

- Symbolic operators bind tighter than a call (R-6.5). `f(a)+1` passes `(a)+1` to `f`; write `(f a)+1`.
  Likewise `assert(xs.split",")==[…]` needs the parentheses shown.
- `<` always closes a scope. There is no less-than operator: write `b>a` (R-8.3). Inside strings, `|`, `<`
  and `;` must be escaped.
- Built-in callables (`print`, `str`, `int`, `big`, …) are calls, not bindings: `big 5` calls `big`. Iterator
  helpers (`sum`, `count`, `first`, `map`, …) are pipeline stages and methods only, so they are free to use as
  variable names.

## Layout

```
bin/            tl, tlc
src/            lexer, parser, emitter, tl.def reader, formatter, CLI, Node loader hooks
runtime/        tl-runtime.js (imported by compiled code)
examples/       feature examples with expected output (.out)
tests/run.js    test suite: examples, loader, tlc output, tl test, formatter, diagnostics
tests/docs.js   runs every example in the LLM instructions and dictionary
```

## Teaching an LLM to write TL

Give the model `TL_INSTRUCTIONS.md` (the core rules and an index). It opens topic files from
`tl-dictionary/` (loops, match, errors, async, stdlib, recipes, …) only when a task needs them.

Run the tests with `npm test`.
