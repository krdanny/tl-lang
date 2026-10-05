# TL Roadmap

TL is one language with several host languages. The source, the dictionary (`tl.def`) and the tools stay the same;
what changes per host is the code the compiler emits and a small runtime library. JavaScript is the first host and
works today. This document says what exists, what comes next for JavaScript, and how Python, C#, Rust and further
hosts are added, in both directions: **TL → host** (run TL there) and **host → TL** (bring existing code into TL).

Status marks: ✅ done · ◐ partly done · ☐ planned.

## Where TL is today

| Area | Status | What exists |
|---|---|---|
| Language | ✅ | TL/JS 0.1: one-line syntax, minimal closure, pipelines, records, enums, `match`, errors and `?`, async, subclasses, bit operators, tests |
| Compiler | ✅ | Pure JavaScript, no build step: lexer, symbol-directed parser, JavaScript emitter, runtime (`lib/`) |
| Tools | ✅ | `tl run / check / compile / fmt / def / view / test / init`, `tlc` (like `tsc`), Node loader hook |
| Dictionary | ✅ | `tl.def` is mandatory; compound names live there; `tl def` creates and maintains it |
| Readable view | ✅ | `tl view` and the VS Code extension (`vscode/`): read-only rendering with long names |
| Model documentation | ✅ | `TL_INSTRUCTIONS.md` and the topic dictionary; every example is run by the test suite |
| Benchmarks | ✅ | Five small programs (JS / TS / TL), two real libraries (validator.js, node-semver) and five real applications (expressCart, hackathon-starter, Hubot, Ungit, Raneto), each converted project checked by its own test suite |
| JavaScript interop | ◐ | Any npm package can be called, and five applications built on Express, MongoDB and Passport run this way; several JavaScript forms still need workarounds (JS0 below) |
| Static type checking | ☐ | Types are parsed and erased; only simple parameter annotations are checked at run time |
| Source maps, `.d.ts` output | ☐ | |
| Language server | ☐ | The extension renders and reports compile errors, but has no rename or go-to-definition |
| Other host languages | ☐ | This document |
| Independent runtime | ☐ | See [the long view](#the-long-view-tl-as-an-independent-language) |

## Principles

1. **One compiler, many emitters.** The compiler stays one JavaScript program. A new host is a new emitter and a
   new runtime library, selected with `tlc --target <host>`; the lexer, parser, dictionary and tools are shared.
2. **TL semantics are fixed by TL, not by the host.** What `==`, truthiness, integer division, string indexing and
   map ordering mean is decided once in the core specification. Each host's runtime makes it true there, so the same
   `.tl` file behaves the same everywhere.
3. **Every host proves itself with the same evidence.** The shared conformance suite must pass, the five benchmark
   programs must pass their tests in that host, and one real open-source project of that language is converted
   and passes its own tests. Token counts are published next to the host's own code.
4. **Both directions.** A host is complete when existing code in that language can be imported into TL, not only
   when TL can be emitted to it.
5. **The dictionary carries the host's names.** A host's libraries are used through `tl.def` entries generated
   from that host's own type information, so models never write long host names.

## Shared foundation

These are needed once, and every host after JavaScript depends on them. They are the next work regardless of
which host comes first.

| Step | What | Why it is needed |
|---|---|---|
| **F1** ☐ | **Target-neutral program representation.** The parser's tree is lowered to a small typed intermediate form (bindings, calls, blocks as expressions, pattern tests) before any host code is produced. The JavaScript emitter is moved onto it first. | Today the emitter works directly on the syntax tree and makes JavaScript decisions as it goes. A second emitter would have to repeat that. |
| **F2** ☐ | **Host adapter interface.** One contract per host: `emit` (representation → source), `runtime` (the helper library), `names` (reserved words, name mangling), `interop` (how `+host.module` imports resolve) and `import` (host source → TL). | Adding a host becomes filling in an interface, and the VS Code extension can list the installed hosts. |
| **F3** ☐ | **Conformance suite.** The documentation examples and the `lib/examples` programs become host-independent tests: TL source plus expected output. | The definition of "the same program behaves the same everywhere". |
| **F4** ☐ | **Type checker.** Inference for locals, checked signatures from `tl.def`, records, enums with exhaustive `match`, optionals, error sets, generics. | JavaScript and Python can run without it. C# and Rust cannot be emitted without knowing the types. It also gives JavaScript users compile-time errors. |
| **F5** ☐ | **Standard library contract.** The list of built-in functions, methods and modules (`fs`, `json`, `http`, `time`, …) with their exact behaviour, separate from the JavaScript runtime that implements them today. | Each host runtime implements the same contract. |
| **F6** ☐ | **Importer framework.** Host source is parsed with that language's tree-sitter grammar (available as WebAssembly, so it runs inside the JavaScript compiler), converted to the representation of F1, and printed as TL plus `tl.def` lines. | The shared half of "host → TL". Only the per-language conversion rules differ. |

Order: F1 → F2 → F3 can start now. F5 is written while the Python runtime is built. F4 is required before C# and
Rust. F6 is first exercised by the JavaScript importer.

```
            tl source + tl.def
                   │
        lexer · parser · dictionary            (shared, exists)
                   │
        F1 representation · F4 types           (shared, planned)
                   │
   ┌───────────┬───┴───────┬───────────┬───────────┐
 JavaScript   Python       C#          Rust       more…
 emitter ✅   emitter ☐    emitter ☐   emitter ☐
 runtime ✅   runtime ☐    runtime ☐   runtime ☐
 importer ☐   importer ☐   importer ☐  importer ☐
```

---

## JavaScript — finishing the first host

| Step | What | Done when |
|---|---|---|
| **JS0** ◐ | **Interop gaps found by converting five applications.** Done: (a) the plain-object literal `#{…}`; (b) in the middle of a chain a JavaScript function with parameters is read, not called (`req.app.db`); bare imports `+express`; `env.NAME`. Open: (b′) reading a function at the end of a chain without `["name"]`; (c) Panics on a member of `none` and on an index out of range become catchable errors. (d) `x?.method args`, `delete`, `in`, `typeof`, an identity test, `this` for callbacks that receive it, arguments to a JavaScript base constructor, default exports. (e) `tl def` refuses a symbol that a source already uses as a plain name, also on incremental runs. (f) Arity of built-in method names applies only to TL values, so `cursor.sort spec` and `list.push a b` on JavaScript objects work. | The five applications are rebuilt without the interop helpers in their `prelude.tl` files, still pass their suites, and their token counts are published again. |
| **JS1** ☐ | Move the emitter onto the shared representation (F1) and the adapter interface (F2). | All current tests and the twelve benchmark projects pass unchanged. |
| **JS2** ☐ | Source maps from generated JavaScript back to TL segments. | A stack trace and a debugger breakpoint point at the readable view. |
| **JS3** ☐ | `.d.ts` output from `tl.def` and inferred signatures. | A TypeScript project imports a TL module with types. |
| **JS4** ☐ | npm interop: generate `tl.def` entries from a package's `.d.ts`. | `tl def --from npm:express` gives one-token symbols for the package's API. |
| **JS5** ☐ | Type checker in the JavaScript pipeline (F4). | Seeded type errors in the benchmark projects are reported at compile time. |
| **JS6** ☐ | **JavaScript/TypeScript → TL importer** (F6). | The seven converted projects are re-imported automatically and still pass their tests. |
| **JS7** ☐ | Language server: rename (source and `tl.def` together), go to definition, hover from the dictionary. | Available in the VS Code extension. |
| **JS8** ☐ | Build-tool plugins: Vite, esbuild, Bun, Deno. | A mixed `.ts` + `.tl` project builds with one command. |

Known gaps to close along the way: a raising call used in a condition without `?` should be a compile error rather
than a truthy result object; type names should be scoped per module rather than per process.

---

## Python

Python is the second host because it is dynamic like JavaScript: it can be emitted before the type checker exists.

**TL → Python**

| Step | What | Done when |
|---|---|---|
| **PY1** ☐ | Host binding note: how each TL construct maps (table below) and where Python differs. | Reviewed against the conformance suite list. |
| **PY2** ☐ | Emitter: indented Python 3.12+ from the shared representation. Block expressions and multi-statement lambdas are hoisted to local functions, since Python lambdas hold one expression. | Conformance suite passes. |
| **PY3** ☐ | Runtime package `tl_rt` (pure Python, on PyPI): TL equality, truthiness, pipelines, pattern helpers, results, the standard library contract (F5). | The five benchmark programs pass their tests on Python. |
| **PY4** ☐ | Running: `tl run --target py file.tl`, `tlc --target py`, and an import hook so `import module` loads `module.tl` directly (the counterpart of the Node loader). | A Python project mixes `.py` and `.tl` files. |
| **PY5** ☐ | Interop: `+py.requests:rq` imports; `tl def --from py:requests` builds dictionary entries from type stubs (`.pyi`) and inspection. | A TL program uses `requests` and `pathlib` through symbols. |
| **PY6** ☐ | Benchmark: the five small programs in Python vs TL, and one real Python project converted with its own tests passing. | Published in `Projects/results/`. |

**Python → TL**

| Step | What | Done when |
|---|---|---|
| **PY7** ☐ | Importer: Python source (tree-sitter-python) → TL + `tl.def`. Comprehensions become pipelines, `with` becomes `with`, decorators and keyword arguments are mapped. | The real project of PY6 is produced by the importer, with hand edits listed. |
| **PY8** ☐ | Round trip: Python → TL → Python passes the project's tests. | Reported per project. |

How TL maps to Python:

| TL | Python |
|---|---|
| record `type P\|x int` | `@dataclass` class with `__slots__` |
| enum and `match` | classes per variant, `match` statement |
| `T?`, `none` | `Optional[T]`, `None` |
| `!Err`, `call?`, `try/catch` | exceptions; `?` re-raises; results as a small class |
| `async fn`, `await`, `scope` | `asyncio` coroutines and task groups |
| `xs>>filter f>>map g` | generator pipeline |
| map `{k:v}`, set `#[…]`, list | `dict`, `set`, `list` |
| `fn` values and lambdas | functions; block lambdas hoisted to `def` |

What needs care: Python treats empty lists and strings as false and TL does not; `//` and `%` differ for negative
numbers; closures need `nonlocal`; names such as `list`, `type`, `id` are built-ins. All are handled in the emitter
and runtime so the TL meaning holds.

---

## C# (.NET)

C# is statically typed, so it depends on the type checker (F4). It is the first typed host because its model
(garbage collection, classes, exceptions, async tasks, generics) is close to what TL already has.

**TL → C#**

| Step | What | Done when |
|---|---|---|
| **CS1** ☐ | Host binding note and the typed subset: every binding and parameter must have a known type (inferred or from `tl.def`). | The conformance suite is annotated: which examples are typed, which rely on dynamic behaviour. |
| **CS2** ☐ | Emitter: C# 12 source from the typed representation. Top-level TL functions become static members of a module class; generics are carried through. | Typed conformance examples compile with `dotnet build` and pass. |
| **CS3** ☐ | Runtime library `Tl.Runtime` (NuGet): pipelines over `IEnumerable<T>`, pattern helpers, `Result<T,E>`, the standard library contract. | The five benchmark programs pass their tests on .NET. |
| **CS4** ☐ | Build integration: `dotnet tl build` and an MSBuild step that compiles `.tl` files before the C# compiler runs, so a `.csproj` can hold both. | A C# project calls a TL module and the reverse. |
| **CS5** ☐ | Interop: `+net.System.Text.Json:js` imports; `tl def --from nuget:<package>` reads assembly metadata and writes dictionary entries with full signatures. | A TL program uses `HttpClient` and `System.Text.Json` through symbols. |
| **CS6** ☐ | Benchmark: five small programs in C# vs TL, one real C# project converted with its tests passing. | Published. C# is verbose, so this is where the largest savings are expected; that is a prediction to be measured. |

**C# → TL**

| Step | What | Done when |
|---|---|---|
| **CS7** ☐ | Importer: C# source (tree-sitter-c-sharp, or Roslyn through a helper process when semantic information is needed) → TL + `tl.def`. Properties become fields and getters, LINQ becomes pipelines, namespaces become modules. | The real project of CS6 is produced by the importer, with hand edits listed. |
| **CS8** ☐ | Round trip C# → TL → C# passes the project's tests. | Reported per project. |

How TL maps to C#:

| TL | C# |
|---|---|
| record | `record class` (or `record struct` when marked) |
| enum with payloads and `match` | abstract record with sealed cases, `switch` expression |
| `T?` | nullable reference or `Nullable<T>` |
| `!Err`, `call?` | exceptions by default; `Result<T,E>` for functions declared with an error set |
| `async fn`, `await` | `Task<T>`, `await`, cancellation tokens for `scope` |
| pipelines | LINQ operators |
| map, set, list | `Dictionary<K,V>`, `HashSet<T>`, `List<T>` |
| `type Kid:Base`, traits | class inheritance, interfaces |

What needs care: TL code written without types cannot be emitted; the compiler must say which annotation is
missing. Integer overflow, string indexing (UTF-16 in both, which helps) and structural equality of records follow
the TL rules through the runtime.

---

## Rust

Rust is the hardest host and comes after C#: it needs the type checker and an answer for ownership, which TL/JS
accepts in the syntax (`&`, `&mut`, `own`) and ignores.

**TL → Rust**

| Step | What | Done when |
|---|---|---|
| **RS1** ☐ | Host binding note and two profiles. **Managed profile:** values are shared with reference counting (`Rc`/`Arc`, interior mutability where a binding is mutated), so any typed TL program can be emitted. **Owned profile:** TL's borrow syntax is checked and emitted as real borrows, giving idiomatic Rust. | The profiles and their limits are written down with examples. |
| **RS2** ☐ | Emitter, managed profile: Rust 2021 source; TL enums and `match` map directly, `?` maps to Rust's `?`, traits and `impl` map to traits and `impl`. | Typed conformance examples build with `cargo build` and pass. |
| **RS3** ☐ | Runtime crate `tl-rt`: pipelines as iterator adapters, TL strings and collections, the standard library contract. | The five benchmark programs pass their tests as native binaries. |
| **RS4** ☐ | Build integration: `cargo tl` and a `build.rs` helper that compiles `.tl` files into the crate. | A Rust crate calls a TL module and the reverse. |
| **RS5** ☐ | Interop: `+rs.serde_json:sj` imports; `tl def --from crate:<name>` builds dictionary entries from rustdoc's JSON output. | A TL program uses `serde_json` and `reqwest` through symbols. |
| **RS6** ☐ | Owned profile: ownership and borrow checking in the TL compiler for code that uses `&`, `&mut` and `own`, emitted without reference counting. | The benchmark programs compile in the owned profile and their speed is compared with hand-written Rust. |
| **RS7** ☐ | Benchmark: five small programs in Rust vs TL, one real Rust project converted with its tests passing. | Published. |

**Rust → TL**

| Step | What | Done when |
|---|---|---|
| **RS8** ☐ | Importer: Rust source (tree-sitter-rust) → TL + `tl.def`. Lifetimes and generic bounds move into the dictionary signatures; macros are expanded first (`cargo expand`) or kept as opaque calls. | The real project of RS7 is produced by the importer, with hand edits listed. |
| **RS9** ☐ | Round trip Rust → TL → Rust passes the project's tests in the owned profile. | Reported per project. |

How TL maps to Rust:

| TL | Rust |
|---|---|
| record, tuple struct | `struct` |
| enum and `match` | `enum` and `match` (direct) |
| `T?` | `Option<T>` |
| `fn f!Err`, `call?` | `Result<T, Err>` and `?` (direct) |
| traits and `impl` | traits and `impl` (direct) |
| `async fn` | `async fn` on Tokio |
| pipelines | iterator chains |
| map, set, list | `HashMap` (insertion-ordered variant where TL requires order), `HashSet`, `Vec` |
| `type Kid:Base` | composition with a trait; Rust has no class inheritance |

What needs care: macros and lifetimes have no TL syntax of their own; the managed profile costs performance; class
inheritance must be rewritten. Rust is also where TL saves the least visible punctuation per line, so the token
benefit has to be measured rather than assumed.

---

## Further hosts

Considered after the three above, each following the same steps (binding note, emitter, runtime, build
integration, interop from the host's type information, benchmark, importer):

| Host | Notes |
|---|---|
| **Go** | Typed, garbage collected, simple. Errors as values match TL's error sets well. No generics-heavy library style, so the dictionary generator is straightforward (`go doc`). |
| **Java / Kotlin** | Same shape as C#. Kotlin output is closer to TL (data classes, sealed classes, null safety); Java gives the larger token saving. |
| **TypeScript** | Not a new runtime: the JavaScript emitter with type annotations, once the type checker (F4) exists. |
| **Swift** | Enums with payloads, optionals and `throws` map directly. Depends on demand. |
| **PHP, Ruby** | Dynamic like Python; could come early if there is a user for them. |

## VS Code extension

| Step | What |
|---|---|
| **VS1** ✅ | Readable, read-only view with long names, outline, hover, diagnostics (version 0.2.1). |
| **VS2** ☐ | Language server features from JS7: rename, go to definition, completion from `tl.def`. |
| **VS3** ☐ | **Show as host language:** a side panel with the generated JavaScript, and later Python, C# or Rust, that follows the cursor; the status bar lists the installed hosts. |
| **VS4** ☐ | **Open as TL:** view an existing `.js`, `.py`, `.cs` or `.rs` file through the importer as TL, read-only at first. |
| **VS5** ☐ | Tools for assistants: an MCP server exposing dictionary lookup, context export, check and patch, so an assistant reads and edits a project through TL. |

## Order of work

```
now        F1 representation ── F2 adapter interface ── F3 conformance suite
             │
next       JS0 interop gaps ── JS1 ── JS2 source maps ── JS4 npm dictionary ── JS6 JavaScript importer (first use of F6)
             │
then       PY1–PY6 Python host ── PY7–PY8 Python importer
             │
           F4 type checker (also JS5, JS3)
             │
then       CS1–CS6 C# host ── CS7–CS8 C# importer
             │
then       RS1–RS5 Rust, managed profile ── RS6 owned profile ── RS7–RS9
             │
later      Go · Java/Kotlin · others        VS2–VS5 alongside, as each host lands
```

Rough sizes, as estimates rather than commitments: the shared foundation F1–F3 is a few weeks of work; Python is
the smallest host because it reuses the dynamic model; the type checker is the largest single piece; C# and Rust
are each larger than Python, and Rust's owned profile is a project of its own.

## The long view: TL as an independent language

The original plan put a native TL first: its own virtual machine, native code generation and a `system` profile
with ownership (specification §32, §40–41). The implementation went the other way, JavaScript first, because that
gave a working language and real measurements quickly. A native TL remains possible and would reuse what the
host work produces: the type checker (F4), the standard library contract (F5), and the Rust emitter, whose output
is already a native binary. Whether a separate TL runtime is still worth building is a question for after the
Rust host exists.

## How progress is measured

For every host, the same table is published in `Projects/results/`:

- tokens of the host-language version (with and without comments) against TL including `tl.def`
- the shared tests passing on both
- for the converted real project: the project's own test suite passing on the TL version
- for the importer: how much of the project was converted automatically and what was edited by hand
