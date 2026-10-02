# Hubot in TL

[Hubot](https://github.com/hubotio/hubot) (commit `628ec6c`, MIT, see `LICENSE.hubot`) converted to TL module by module.

| Folder | What |
|---|---|
| `original/` | the upstream application as it is: `index.mjs`, `bin/`, `src/`, `configuration/`, and its test suite `test/` |
| `tl/` | the TL conversion: one `.tl` per source module, `prelude.tl`, and the dictionary `tl.def` |
| `tests/run.js` | runs Hubot's own tests (`original/test/*.mjs`, node:test, unchanged) against either implementation |

```sh
npm install                    # express, express-basic-auth, pino (the dependencies of Hubot)
node tests/run.js original     # 286 passed, 0 failed
node tests/run.js tl           # compiles tl/ with tlc, then the same suite
node tests/run.js tl Brain     # only the test files whose name contains "Brain"
node ../../lib/bin/tl.js view tl/Robot.tl   # read a module with long names and indentation
```

## Module mapping

The TL folder is flat. Every original module has one TL module of the same name:

| Original | TL | Exports used by the shim |
|---|---|---|
| `index.mjs` | `tl/index.tl` | `hubot` (the default export object; the named exports are its properties) |
| `bin/Hubot.mjs` | `tl/Hubot.tl` | `robot` (default) |
| `src/Adapter.mjs`, `Brain.mjs`, `Middleware.mjs`, `OptParse.mjs`, `Response.mjs`, `Robot.mjs`, `User.mjs` | `tl/<same>.tl` | the class (default) |
| `src/CommandBus.mjs`, `Listener.mjs` | `tl/<same>.tl` | named classes |
| `src/DataStore.mjs`, `Message.mjs` | `tl/<same>.tl` | named classes, also as the default object |
| `src/GenHubot.mjs` | `tl/GenHubot.tl` | `create` (default) |
| `src/HttpClient.mjs` | `tl/HttpClient.tl` | `create` (as the default object `{ create }`) |
| `src/adapters/Campfire.mjs`, `src/adapters/Shell.mjs` | `tl/Campfire.tl`, `tl/Shell.tl` | `use` (as the default object `{ use }`) |
| `src/datastores/Memory.mjs` | `tl/Memory.tl` | `InMemoryDataStore` (default) |

`tl/prelude.tl` holds one helper shared by three modules (`jsType`, JavaScript's `typeof`). `bin/hubot`, the two-line
launcher, is used unchanged by both implementations and is not counted.

## How the TL version is tested

TL modules have named exports only, and the tests import `../index.mjs`, `../src/User.mjs`, … with default exports.
`tests/run.js tl` therefore builds a tree with the layout of the Hubot repository under `tl-build/tl/`: `tlc` compiles
`tl/*.tl` into `src/`, and each original module path gets a one-line shim that re-exports the compiled TL module in the
original shape (the table is `SHIMS` in `tests/run.js`). `test/`, `configuration/`, `package.json` and `bin/hubot` are
copied from `original/`. The original runs the same way from `tl-build/original/`, so neither run writes into `original/`.

## Notes on the conversion

- Classes are TL types (`type Robot;` + `impl Robot|init self …`), subclasses use `type Shell:Adapter;`, so
  `instanceof`, `constructor.name` and subclassing from JavaScript (the tests' adapters) work as before.
- `super(…)` is `Reflect.apply Base.prototype["init"] self [args]`; `super.close()` likewise.
- Private fields of the Shell adapter (`#rl`, `#levels`, …) live in a module-level `WeakMap`.
- `ScopedClient`'s HTTP verbs, generated in a loop over `prototype` in the original, are written out as methods.
- A function-valued property is read with an index (`spec["handler"]`, `adapter["use"]`), because `x.name` calls a
  zero-argument function.
