# TL — Token Language

TL is a programming language designed to be written and read by language models with as few tokens as possible.
It compiles to JavaScript and runs on Node.js, the way TypeScript does. People do not read the source directly:
a VS Code extension (and `tl view`) renders it as ordinary indented code.

On the two real-world libraries converted so far, the TL version needs **32–35% fewer tokens** than the same
JavaScript with its comments removed, and passes the libraries' own test suites unchanged.

```
+semver.Sem|fn parse version options=none the=false|if version is Sem|^version<try|Sem version options<catch e|if not the|^null<!e
```

That is a complete TL module (one line, 39 tokens). The editor shows it like this:

```
import semver.SemVer

fn parse version options=none throwErrors=false
    if version is SemVer
        return version
    try
        SemVer version options
    catch e
        if not throwErrors
            return null
        raise e
```

## Contents

- [What is in this repository](#what-is-in-this-repository)
- [Quick start](#quick-start)
- [How the language saves tokens](#how-the-language-saves-tokens)
- [The dictionary: `tl.def`](#the-dictionary-tldef)
- [Toolchain](#toolchain)
- [Benchmarks](#benchmarks)
- [VS Code extension](#vs-code-extension)
- [For a model that writes TL](#for-a-model-that-writes-tl)
- [Status and limits](#status-and-limits)
- [Third-party code](#third-party-code)

## What is in this repository

| Folder | What it is |
|---|---|
| `lib/` | The compiler and tools (`tl-lang`): lexer, parser, JavaScript emitter, runtime, formatter, CLI (`tl`, `tlc`), Node loader, tests. Pure JavaScript, no build step. |
| `lib/TL_INSTRUCTIONS.md`, `lib/tl-dictionary/` | The language reference written for models: core rules in one file, 21 topic files to open on demand. Every example in them is run by the test suite. |
| `lib/TL_Language_Specification_v0.5.docx` | The original design specification. It predates several changes made during implementation; the instructions and dictionary above describe the language as it works today. |
| `Projects/` | Token benchmarks: five small programs written in JavaScript, TypeScript and TL, and two open-source libraries (validator.js, node-semver) converted to TL. `bench.js` counts tokens and runs every version against shared tests. |
| `vscode/` | The VS Code extension that shows `.tl` files as readable, read-only code. |

## Quick start

Requires Node.js 20.6 or newer.

```sh
cd lib && npm install        # one dependency: the tokenizer `tl def` uses to pick symbols
npm test                     # 40 checks + 189 documentation examples

node bin/tl.js run examples/loops.tl      # compile in memory and run
node bin/tl.js view examples/loops.tl     # the readable rendering
node bin/tl.js compile examples/loops.tl  # the generated JavaScript
```

A project works like a TypeScript project: `tl init` creates `tlconfig.json`, `tlc` compiles `.tl` files to
`.js`, and `node --import tl-lang/register app.tl` runs TL directly through a loader hook.

## How the language saves tokens

- **One line per file.** `|` ends a statement and enters a body, `<` leaves a body. No indentation, no braces, no
  newlines.
- **No call punctuation.** `add 2 3` instead of `add(2, 3)`. Tightly written operators bind first, so `f a+1`
  is `f(a+1)`.
- **Closers only when something follows.** `print"hi` and `xs[1 2 3` are complete at the end of a statement.
- **Bindings without a sign.** `x 5` declares, `x=6` assigns.
- **Short statement forms.** `^x` returns, `!Err` raises, `call?` propagates an error, `+mod.name` imports.
- **Pipelines.** `xs>>filter f>>map g>>list`.
- **A standard library that removes boilerplate.** For example an HTTP server with JSON persistence and route
  patterns; this is where the largest saving comes from (62% on the Todo API below).
- **A dictionary for long names** — next section.

The generated JavaScript is plain ES modules and uses the long, readable names, so a TL module can be imported
from JavaScript like any other module.

## The dictionary: `tl.def`

Every TL project has a `tl.def` file; the compiler refuses to compile without one. Compound names — camelCase,
multi-word PascalCase, snake_case — are not allowed in `.tl` files. Each gets one line in `tl.def` and the source
writes only the short symbol:

```
ip includePrerelease
cid compareIdentifiers
Sem SemVer
```

The reason is how tokenizers work: `options` is one token, but `isPrereleaseIdentifier` is four, every time it is
written. With the dictionary a long name is paid for once. The generated JavaScript, error messages and the
readable view all show the long names.

`tl def` writes the file for an existing project: it finds every compound name, picks a symbol that is a single
token, rewrites the sources and adds the lines.

What it is worth, measured: source files shrink 7% (semver) and 4% (validator). Counting the dictionary itself,
semver is 2.6% smaller and validator 0.2% larger, because most of validator's 401 compound names are used only once
or twice. The rule is unconditional anyway: a model writing code cannot know in advance how often a name will be
used. Details in `lib/tl-dictionary/tl-def.md`.

## Toolchain

All commands are `node lib/bin/tl.js <command>` (or `tl <command>` once the package is linked).

| Command | What it does |
|---|---|
| `tl run file.tl` | compile in memory and run |
| `tl check file.tl` | diagnostics only, in a compact form with a column and suggested fixes |
| `tl compile file.tl` | print the generated JavaScript |
| `tl fmt file.tl` | rewrite in canonical form (minimal spaces and closers) |
| `tl def [dir]` | create or update `tl.def` and replace compound names by symbols |
| `tl view file.tl` | readable rendering: indented, closers restored, long names |
| `tl test` | run `test"…"` blocks |
| `tlc` | compile a project described by `tlconfig.json`, like `tsc` |

## Benchmarks

Tokens are counted with the `o200k` tokenizer (GPT-4o / GPT-5 family). A version only counts if it passes the
same tests as the others. TL counts include `tl.def`.

### Two real libraries, converted from their original JavaScript

| | Original JS | JS without comments | TL (source + `tl.def`) | TL vs JS | TL vs JS without comments | Tests (both versions) |
|---|---|---|---|---|---|---|
| **node-semver** 7.8.5, 47 modules | 19,189 | 15,044 | 9,715 (9,246 + 469) | **−49%** | **−35%** | 9,074 assertions pass |
| **validator.js** 13.15, 103 modules | 71,443 | 61,301 | 41,815 (39,887 + 1,928) | **−41%** | **−32%** | 13,289 cases pass |

The fair comparison is the one against JavaScript without comments, because TL files carry none.

The tests are the libraries' own: semver's tap test files run unchanged against the compiled TL through a
`require` redirect, and validator's mocha cases are replayed against both implementations.

About 42% of the TL version of validator is regular-expression text (phone numbers, postal codes, IBANs), which is
the same in any language; that is why it gains a little less than semver, which is mostly logic.

### Five small programs, written from one specification in each language

| Program | JS | TS | TL | TL vs JS | TL vs TS |
|---|---|---|---|---|---|
| Todo REST API | 774 | 870 | 295 | −62% | −66% |
| Log analyzer CLI | 704 | 732 | 495 | −30% | −32% |
| Inventory manager | 747 | 842 | 552 | −26% | −34% |
| Markdown to HTML | 699 | 728 | 584 | −16% | −20% |
| Concurrent bank ledger | 395 | 471 | 263 | −33% | −44% |

The Todo API result comes mostly from TL's built-in HTTP and storage helpers; against JavaScript written with
Express it is −49%. The other four show what the syntax alone gives: 16–33%.

### Reproducing

```sh
cd Projects && npm install
node bench.js              # every project: token counts and tests; writes results/
node bench.js semver       # one project
```

Per-project tables are in `Projects/results/`. How each project is tested is described in `Projects/README.md`.

## VS Code extension

`vscode/` contains **TL Readable View**. TL source is a single dense line, so the extension shows people a
rendering instead, and that rendering is read-only.

What it does when a `.tl` file is opened:

- Shows one statement per line with indentation, in place of the one-line source.
- Shows the long names from `tl.def` instead of the symbols.
- Restores closing quotes and brackets, and spaces between operands.
- Spells out the statement sigils: `^` as `return`, `+` as `import`, `!` as `raise`, a binding `x 5` as `x = 5`.
- Wraps long lists and maps, so large tables show one entry per row.
- Provides syntax highlighting, outline, folding, hover help for TL words and sigils, and compile errors in the
  Problems panel.
- Re-renders when the file changes.

The rendering never reorders or rewrites expressions; it prints the source's own tokens. This is checked: for
every `.tl` file in the repository the rendering lexes back to the identical token stream.

Read-only by design: the view is a virtual document, and the raw one-line source also opens locked. The commands
**TL: Open Raw Source** and **TL: Unlock Raw Source for Editing** are there for the cases where a hand edit is
wanted. Toolbar buttons switch between long names and symbols, and between words and sigils.

Build and install:

```sh
cd vscode && npm install
npm test                 # builds, then 19 tests
npm run package          # tl-readable-<version>.vsix
code --install-extension tl-readable-0.2.1.vsix
```

The extension works in Restricted Mode (untrusted folders): it only reads and renders files. Settings and the
full command list are in `vscode/README.md`. The same rendering is available in a terminal with `tl view`.

## For a model that writes TL

Give the model `lib/TL_INSTRUCTIONS.md`. It contains the dictionary rule, the ten core rules, and an index of the
topic files in `lib/tl-dictionary/` (loops, errors, pipelines, types, interop, a list of common mistakes, …) so it
can open only the topic it needs instead of loading the whole reference.

The workflow is `tl def` → `tl check` → `tl fmt` → `tl run`. Diagnostics are written for a model: an error code,
the column, and named fixes.

## Status and limits

TL/JS 0.1 is a working compiler, not a finished language.

- Types are parsed and erased, except simple parameter annotations (`s:str`), which are checked at run time.
- No bitwise operators, macros, effects or ownership; `thread` is an async task.
- A call to a function that can raise must be propagated with `?` or handled; used directly in a condition it
  is an always-true result object. This is the easiest mistake to make in TL today.
- The token figures are for the `o200k` tokenizer. Other tokenizers will give somewhat different numbers.
- `lib/ROADMAP.md` is the earlier long-term plan (a native core and more host languages). What exists is the
  pure-JavaScript compiler for Node.js described here.

## Third-party code

`Projects/validator/` and `Projects/semver/` include the sources and tests of validator.js (MIT) and node-semver
(ISC) so the benchmarks can run against the originals. See `THIRD_PARTY.md`.
