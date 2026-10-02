# TL Roadmap

Three stages, delivered in order, sharing one core:

1. **TL the independent language** — its own compiler, runtime, standard library and CLI.
2. **TL for JavaScript** — TL as a compile-to-JS language, the way TypeScript is.
3. **TL for VS Code** — an extension that translates `.tl` files into a host language (JavaScript first) and is built so more languages can be plugged in.

Spec reference: `TL_Language_Specification_v0.5.docx` (section numbers below point into it).

---

## Guiding decisions

| Decision | Choice | Why |
|---|---|---|
| Core implementation language | **Rust** | Stage 1 needs a native compiler and runtime. The same crates compile to WASM and to a Node addon (napi-rs), so Stages 2 and 3 reuse the exact same parser and checker (the model used by SWC, Biome and Oxc). |
| One front end for everything | `tl-syntax`, `tl-def`, `tl-resolve`, `tl-check` are shared | A bug fixed once is fixed in the CLI, the JS compiler and the editor. |
| Stage gating | Stage 2 starts at **M1.4** (interpreter running), not after the native backend | Otherwise the JS target waits a year for work it doesn't need. Stage 1 native work continues in parallel. |
| Host plugin interface | Defined in Stage 2, used in Stage 3 | Adding Python/Go/Rust later means writing an adapter, not changing the extension. |
| Conformance suite | Every TL example in the spec is a test | The spec and the implementation cannot drift apart. |

```
                 ┌──────────────── core (Rust) ────────────────┐
                 │ syntax · canon · view · def · resolve · check │
                 └──────┬───────────────┬───────────────┬──────┘
                        │               │               │
        Stage 1         │   Stage 2     │    Stage 3    │
   interpreter / VM     │  JS emitter   │  WASM build   │
   native (Cranelift)   │  @tl/rt       │  LSP + VS Code│
   stdlib, tl CLI       │  npm, .d.ts   │  host adapters│
```

---

## Stage 0 — Validate the idea (2–3 weeks, before building much)

The cheapest way to reduce risk. If this fails, the syntax changes before any compiler work is spent on it.

- Hand-translate ~50 realistic tasks into TL, Python and TypeScript.
- Measure tokens across several model tokenizers, including the projected `tl.def`.
- Give models only the spec, ask them to write TL, and score parse rate and test pass rate.
- Specifically test the riskiest rules: no `<` operator (R-8.3), arity-driven calls (R-9.1), minimal spacing (R-6.4), open strings (R-7.5).

**Exit:** TL uses clearly fewer total tokens per correct task than TS/Python at comparable correctness, or the spec is revised until it does.

---

## Stage 1 — TL as an independent language

### M1.1 Syntax front end (6 weeks)
- One-line lexer; parser with scope and delimiter stacks (§7); spacing rules (R-6.4, R-6.7).
- Syntax tree with stable node IDs (needed for agent patches, §58).
- Canonicalizer `tl fmt` and `--repair` (§53); virtual view `tl view` (§55).
- Parser fuzzing; the spec's ~200 TL examples as golden tests.
- **Exit:** every spec example parses; `fmt` output re-parses to identical bytes.

### M1.2 Dictionary, resolver, namespaces (5 weeks)
- `tl.def` parser and writer (§10), namespaces and imports (§46), short-symbol allocator.
- Binding-vs-call, arity, glued-`[` resolution (R-11.1, R-9.1, R-6.7).
- `tl def sync / repack / rename`.
- **Exit:** all spec examples resolve against the shared example dictionary.

### M1.3 Type checker, core subset (10 weeks)
- Bindings, functions, records, tuples, enums, `match` with exhaustiveness, optionals, error sets and `?`, generics, traits, pipelines, closures.
- Compact diagnostics format and codes (§59).
- **Exit:** type-checks the spec's worked examples (§61–63) with correct diagnostics on seeded bugs.

### M1.4 Interpreter and `script` profile — **TL 0.1 release** (8 weeks)
- Bytecode VM with a tracing GC; REPL (`tl repl`); `tl run`.
- Core stdlib: `core`, `col`, `text`, `fs`, `io`, `proc`, `env`, `json`, `time`.
- `tl.pkg` and `tl.lock` basics, `tl test`.
- **Exit:** a user can build and test a real CLI tool in TL. **→ Stage 2 starts here.**

### M1.5 Async, concurrency, processes (8 weeks)
- `async`/`await`, structured `scope`, cancellation (§35); threads, channels, locks (§36); subprocesses, signals (§37).
- Effects and handlers for testing (§43).

### M1.6 Native backend, `app` profile — **TL 0.5 release** (12 weeks)
- Cranelift code generation, native binaries for Linux/macOS/Windows; WASM target.
- Package registry, capabilities and `tl audit` (§44, §47).

### M1.7 Ownership and `system` profile (later; does not block anything)
- Borrow checker with automatic borrows (§32), lifetimes in `tl.def`, `unsafe`, FFI to C (§40–41), no-std.
- Road to **TL 1.0**: syntax freeze after re-running the Stage 0 benchmark on the real toolchain.

---

## Stage 2 — TL for JavaScript (like TypeScript)

Starts after M1.4. Reuses the Stage 1 front end unchanged.

### M2.1 JS host binding spec (2 weeks)
- A new spec appendix, "TL/JS", defining the semantics mapping:
  - `int` = safe integer with overflow checks; `i64`/`u64`/`big` = `BigInt`.
  - Records → objects; enums → tagged objects; `T?` → `undefined`.
  - Errors → tagged throws, checked statically; async → Promises and `AbortController`.
  - `with`/`defer` → `using`; threads → Workers; `proc` → `node:child_process`.
- Mark what doesn't exist on JS (ownership as a guarantee, `unsafe`, `system` profile).

### M2.2 JS emitter (8 weeks)
- TL → ES2022+ JavaScript with source maps back to TL segments.
- `.d.ts` generation from `tl.def`, so TypeScript projects can import TL modules.
- `@tl/rt` runtime: checked math, match helpers, channels, scopes.
- **Exit:** the §63 application example runs on Node, Bun and Deno.

### M2.3 npm interop (6 weeks)
- `+npm.pkg:alias` imports; converter from `.d.ts` to `tl.def` so every npm package gets a compact dictionary.
- Mixed projects: `.tl` next to `.ts`/`.js`, one build.

### M2.4 Tooling and distribution — **TL/JS 0.1 release** (5 weeks)
- `npm i -D tl` (napi-rs build of the Rust compiler), `tl build --target js`, watch mode.
- Node loader hook; Vite, esbuild and Bun plugins.
- **Host adapter interface** defined here (`semantics`, `emit`, later `encode`) — the contract Stage 3 builds on.
- **Exit:** an existing TS project adds TL files without changing anything else.

---

## Stage 3 — TL for VS Code (TL → any language, JS first)

The extension runs the WASM build of the core plus the Stage 2 JS adapter.

### M3.1 Language support (6 weeks)
- Language server (LSP) from the core: diagnostics, hover with canonical names/types/effects from `tl.def`, go to definition, rename (updates source and `tl.def` together), formatting.
- Scope highlighting for `|` and `<`, breadcrumbs of the scope stack.
- Virtual view as a read-only side panel (§55).

### M3.2 Live translation to JS — **extension 0.1 on the Marketplace and Open VSX** (5 weeks)
- "Show as JavaScript": side-by-side generated JS that updates as you type, with click-through between TL segments and JS lines (source maps).
- Commands: *Export to JS*, *Copy as JS*, *Open generated file*.
- A target-language picker in the status bar that lists installed host adapters (only JS at first).

### M3.3 JS → TL (reverse direction) (8 weeks)
- *Open as TL*: view an existing `.js`/`.ts` file as one-line TL plus a generated `tl.def`.
- Edits in the TL view are written back as formatted JS (prettier). Comments kept in `.tlnote` sidecars.
- **Exit:** round-trip on a corpus of real open-source JS files gives byte-identical formatted output.

### M3.4 AI integration (4 weeks)
- Built-in MCP server exposing the agent protocol (§58): `def.lookup`, `context.export`, `patch.apply`, `check`.
- AI assistants in VS Code can read and edit any supported file through its TL view, spending fewer tokens.

### M3.5 More host languages (per language, ~8–12 weeks each)
- Adapters implement the Stage 2 interface using each language's own tooling for types: Python (Pyright), Go (gopls), Rust (rust-analyzer).
- Suggested order: **Python → Go → Rust**.
- Each adapter ships its own host binding appendix to the spec and its own round-trip corpus test.

---

## Timeline (small team of 2–3; ranges, not commitments)

| Quarter | Stage 1 | Stage 2 | Stage 3 |
|---|---|---|---|
| Q4 2026 | Stage 0 benchmark · M1.1 | | |
| Q1 2027 | M1.2 · M1.3 | | |
| Q2 2027 | M1.4 → **TL 0.1** | M2.1 · M2.2 | |
| Q3 2027 | M1.5 | M2.3 · M2.4 → **TL/JS 0.1** | M3.1 |
| Q4 2027 | M1.6 | maintenance | M3.2 → **extension 0.1** · M3.3 |
| 2028 | M1.6 → **TL 0.5** · M1.7 | | M3.4 · M3.5 (Python first) |

---

## Cross-cutting work (continuous)

- **Spec:** split into *TL Core* (syntax, `tl.def`, protocol) and *Host Bindings* (Native, JS, later Python/Go/Rust); version it alongside releases.
- **Conformance suite:** spec examples plus per-host round-trip corpora, run in CI on every change.
- **Benchmarks:** the Stage 0 token and correctness benchmark re-run at every release.
- **Docs and website:** tutorial, playground (WASM build in the browser), spec browser.
- **Governance:** RFC process for syntax changes; editions for breaking changes (§47.2).

## First two weeks

1. Set up the monorepo: `crates/` (core), `packages/` (npm, runtime), `extensions/vscode`, `spec/`, `bench/`.
2. Extract every TL example from the spec into `spec/examples/*.tl` as the first conformance tests.
3. Start the Stage 0 benchmark: pick the 50 tasks and the tokenizers; translate the first 10.
4. Write the lexer against R-5.x, R-6.x and R-13.x.
