# TL token benchmarks

The same project written three times — JavaScript, TypeScript and TL — from one shared spec, checked by one
shared test suite, then measured in tokens.

```
Projects/
  bench.js              runs the benchmark (token counts + shared tests) and writes results/
  results/              README.md summary, <project>.md and <project>.json per project
  <project>/
    spec.md             the spec every implementation follows
    bench.json          files to count and commands to run, per language
    tests/              shared black-box tests and fixtures
    js/  ts/  tl/       the implementations (plus js-express/ ts-express/ where a framework row exists)
```

## Run

```sh
cd Projects
npm install            # once: installs the tokenizer (gpt-tokenizer)
node bench.js          # all projects
node bench.js todo-api # one project
node bench.js --tests-only   # only run the shared tests
```

Each implementation can also be run and tested by hand, e.g. for project 1:

```sh
cd todo-api
node tests/run.js node js/server.js
node tests/run.js node ts/server.ts
node tests/run.js node ../../lib/bin/tl.js run tl/server.tl
```

## Method

- Tokens are counted with `o200k_base` (GPT-4o / GPT-5 family) and `cl100k_base` (GPT-4). Characters and
  non-empty lines are reported too.
- TL counts include the project's `tl.def`: the dictionary is mandatory and part of TL's cost. Each result also
  shows the dictionary's share and the count for the source files alone.
- Percentages are relative to the JavaScript version.
- A version only counts if it passes the shared tests, so compactness cannot be bought with bugs.
- Implementations are written from the spec, not translated from each other, in the plain idiomatic style of
  each language. `js`/`ts` use only Node's standard library, like TL's own standard library; `js-express`/`ts-express`
  use a framework (Express, lowdb) so TL's built-in helpers are also compared against the JS ecosystem's.

## Projects

1. `todo-api` — Todo REST API with JSON persistence (web back end; also Express rows).
2. `log-analyzer` — access-log report CLI (parsing, grouping, percentiles).
3. `inventory` — warehouse command interpreter with order states (business rules).
4. `markdown` — Markdown-to-HTML converter (text processing).
5. `ledger` — concurrent bank transfers with retries and interest (async).
6. `validator` — the real-world npm library validator.js (v13.15, 103 modules, ~6k lines) converted from its
   original JavaScript into TL. Unlike projects 1–5 this is a translation of an existing code base, checked
   against the library's own mocha test cases (13,289 inputs extracted into `tests/cases.json` and
   `tests/sanitizer-cases.json`):

   ```sh
   cd validator
   node tests/run.js original        # the original JavaScript (original-build/)
   node tests/run.js tl              # the TL modules (tl/*.tl), loaded through lib/src/hooks.js
   node tests/run.js tl isEmail      # one validator
   ```

   `original/` is the untouched source that is counted; `original-build/` is the same code with `.js` import
   suffixes so Node can run it. Because the original carries ~770 lines of comments and TL files have none,
   the results also report the JavaScript token count with comments stripped (`acorn`).

7. `semver` — node-semver v7.8.5 (`npm/node-semver`, 47 modules, ~2.4k lines): classes (`SemVer`, `Range`, `Comparator`),
   range algebra and set logic, almost no data tables — the opposite profile of validator.js. Its own tap test files
   (`tests/suite/`, 9,074 assertions) run unchanged against both versions through a small tap stand-in (`tests/tap.js`) and a
   `require` redirect (`tests/run.js`):

   ```sh
   cd semver
   node tests/run.js original        # the original JavaScript (original/, CommonJS)
   node tests/run.js tl              # compiles tl/*.tl to tl-build/ with tlc, then runs the suite against it
   node tests/run.js tl classes/range
   ```

Current results: `results/README.md`.
