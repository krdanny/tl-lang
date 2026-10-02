# TL token benchmarks

Twelve projects, each in JavaScript and in TL, checked by the same tests and then measured in tokens.

- Projects 1–5 are small programs written from one shared spec in JavaScript, TypeScript and TL.
- Projects 6–7 are open-source libraries and projects 8–12 are open-source applications, converted from their
  original JavaScript to TL module by module and checked by the project's own test suite.

```
Projects/
  bench.js              runs the benchmark (token counts + shared tests) and writes results/
  results/              README.md summary, <project>.md and <project>.json per project
  <project>/
    spec.md             the spec every implementation follows
    bench.json          files to count and commands to run, per language
    tests/              shared black-box tests and fixtures
    js/  ts/  tl/       the implementations (plus js-express/ ts-express/ where a framework row exists)
  <converted project>/
    original/           the upstream sources and tests, untouched
    tl/                 the TL modules and the dictionary tl.def
    tests/run.js        runs the upstream test suite against `original` or `tl`
    bench.json          files to count and commands to run
    LICENSE.<project>   the upstream license
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
- For the converted projects the JavaScript token count is also reported with comments stripped (`acorn`),
  because TL files carry none. That is the fairer comparison.
- In projects 1–5, implementations are written from the spec, not translated from each other, in the plain idiomatic style of
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

### Applications (projects 8–12)

Each application folder has its own dependencies: run `npm install` inside it once. `node tests/run.js original`
runs the application's own test suite on the upstream JavaScript; `node tests/run.js tl` compiles `tl/` and runs
the same, unchanged test files against it. In the TL run every upstream source file is replaced by a one-line shim
that loads the compiled TL module, so the tests load the application exactly as they do upstream. No test is
excluded or edited for either version.

The upstream suites do not reach every module of an application, so each conversion was also compared with the
original side by side on code the suite misses. Where that comparison is a script in the repository it is named
below; the others were one-off runs during the conversion.

8. `expresscart` — [expressCart](https://github.com/mrvautin/expressCart) 1.1.19, an online shop on Express and
   MongoDB: products, cart, checkout, orders, admin, nine payment gateways. 34 modules, ~6.8k lines. Its ava
   suite (86 tests) needs a MongoDB server:

   ```sh
   cd expresscart && npm install
   docker run -d --name tl-bench-mongo-expresscart -p 127.0.0.1:27117:27017 mongo:7
   node tests/run.js original
   node tests/run.js tl
   docker stop tl-bench-mongo-expresscart && docker rm tl-bench-mongo-expresscart
   ```

   `EXPRESSCART_MONGO` selects another server. Side-by-side run during the conversion: 228 HTTP requests against
   both versions from the same database state, 227 identical responses and identical final content of 11
   collections. The code paths that call the payment providers' APIs were never executed.

9. `hackathon-starter` — [hackathon-starter](https://github.com/sahat/hackathon-starter) 10.0.0, an Express 5 web
   application: local and OAuth accounts (Passport), sessions in MongoDB, two-factor and passkey login, e-mail
   flows, third-party API examples. 16 modules, ~6.1k lines. Its mocha suite (327 tests) uses an in-memory
   MongoDB. `tests/equivalence/run.js` is the side-by-side run: 495 results compared, all identical. Details in
   `hackathon-starter/README.md`.

10. `hubot` — [Hubot](https://github.com/hubotio/hubot) (commit `628ec6c`), GitHub's chat bot: robot, brain,
    listeners, middleware, adapters, script loading. 18 modules (`.mjs`), ~3.6k lines. Its `node:test` suite has
    286 tests. Details in `hubot/README.md`.

11. `ungit` — the server of [Ungit](https://github.com/FredrikNoren/ungit) 1.5.30, a web UI for git: REST and
    socket API, git command runner, output parsers. 12 modules, ~3.1k lines. Its mocha unit tests (17 spec
    files, 230 tests, 2 skipped upstream) create real git repositories in the system temp folder.
    `tests/smoke.js` is the side-by-side run for the modules the unit tests never load: 82 answers compared,
    2 differ in an error text.

12. `raneto` — [Raneto](https://github.com/ryanlelek/Raneto) 0.18.1, a Markdown knowledge-base web application:
    page rendering, search, editing, authentication. 34 modules, ~2k lines. Its jest suite has 221 tests.

Known differences between the TL versions and the originals (none is reached by the upstream suites):

- Reading a member of `undefined` is a TL panic, an `Error` that TL `catch` does not catch, where JavaScript
  throws a catchable `TypeError`. This is the one differing line in the Hubot, Ungit and expressCart side-by-side
  runs: same failure, different error class or text.
- `==` in TL is deep equality and treats `null` and `undefined` as equal.
- Interpolating a missing value prints `none` where JavaScript prints `undefined`; the conversions use `+` where
  the exact text matters.
- TL has no `__dirname`; the conversions use `import.meta.dirname` or the start directory, so expressCart must be
  started from its root folder.
- Imports are hoisted, so a module that reads configuration while loading sees it only if the configuration is
  loaded by a module imported first (hackathon-starter's `dotenv.tl`).

Current results: `results/README.md`.
