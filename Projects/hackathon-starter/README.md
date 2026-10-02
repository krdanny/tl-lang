# hackathon-starter in TL

[hackathon-starter](https://github.com/sahat/hackathon-starter) v10.0.0 (commit `d390f81`, MIT, see
`LICENSE.hackathon-starter`) is an Express 5 web application: local and OAuth accounts (Passport), sessions in
MongoDB, two-factor and passkey login, e-mail flows, a set of third-party API examples and three AI examples.
This folder holds its server-side JavaScript next to a module-by-module TL translation and runs the
application's own mocha suite against both.

| | |
|---|---|
| `original/` | the upstream application, untouched: `app.js`, `config/`, `controllers/`, `models/` (the 16 modules that are counted), plus what they need at run time and are not counted (`views/`, `public/`, `test/`, `.env.example`) |
| `tl/` | the translation: 16 modules, `prelude.tl`, `dotenv.tl` and the dictionary `tl.def` |
| `tests/run.js` | runs `original/test/*.test.js` unchanged against `original` or `tl` |
| `tests/build.js` | builds `tl/` into `tl-build/`, laid out like the original |
| `tests/equivalence/` | differential runs of both implementations for the code the upstream suite does not reach |
| `patches/`, `package.json` | the upstream dependency set and its `patch-package` patches |

```
npm install                          # once (also in ../../lib and ..)
node tests/run.js original           # 327 passed, 0 failed
node tests/run.js tl                 # 327 passed, 0 failed
node tests/equivalence/run.js        # 495 identical, 0 different
cd .. && node bench.js hackathon-starter
```

## Modules

TL modules live in one flat folder, so names that collide or are not plain words are mapped:

| TL module | original | | TL module | original |
|---|---|---|---|---|
| `app.tl` | `app.js` | | `cachebust.tl` | `config/cacheBust.js` |
| `agent.tl` | `controllers/ai-agent.js` | | `flash.tl` | `config/flash.js` |
| `ai.tl` | `controllers/ai.js` | | `morgan.tl` | `config/morgan.js` |
| `api.tl` | `controllers/api.js` | | `mailer.tl` | `config/nodemailer.js` |
| `contact.tl` | `controllers/contact.js` | | `passport.tl` | `config/passport.js` |
| `home.tl` | `controllers/home.js` | | `revocation.tl` | `config/token-revocation.js` |
| `user.tl` | `controllers/user.js` | | `session.tl` | `models/Session.js` (exports `sessions`) |
| `webauthn.tl` | `controllers/webauthn.js` | | `usermodel.tl` | `models/User.js` (exports `users`) |

Two TL modules have no file of their own in the original:

- `prelude.tl` (imported into every module automatically): `{…}.js` turns a TL map literal into a plain JavaScript
  object, deeply (`res.render"home"{title:"Home"}.js`); `del` (`delete o[k]`), `undef`/`isnull` (`=== undefined`,
  `=== null`), `isa` (`instanceof` for an imported class), `nth` (`xs?.[i]`), `isobj` (`typeof x === 'object' && x`).
- `dotenv.tl` is lines 18–29 of `app.js` (load `.env.example`). TL imports are hoisted, and the controllers read
  `process.env` while they load, so that block has to be a module that `app.tl` imports before them.

## How the unchanged tests run the TL build

The upstream suite is CommonJS through and through: it deletes `require.cache` entries and re-requires a controller,
replaces `Module.prototype.require` to hand a controller a fake `'../models/User'` or `'../config/nodemailer'`,
patches `require.cache[…].exports`, and stubs exported functions with sinon. ES modules, which is what `tlc` emits,
cannot be re-evaluated or intercepted that way. `tests/build.js` therefore rewrites every compiled module 1:1 into
a CommonJS file at the path of the module it replaces (`tl-build/controllers/user.js`, …): `import` lines become
`require` calls with the original relative ids, `export` declarations become plain properties of `exports`
(`module.exports = …` for `app`, `models/User` and `models/Session`), and nothing else changes. The tests are
copied to `tl-build/test/` unmodified.

## Tests

- Baseline and TL: the full upstream `npm test` selection, `mocha --exclude "test/*links.test.js"` — 13 files,
  327 tests. Nothing is excluded beyond what upstream itself excludes: `app-links.test.js` and
  `docs-links.test.js` crawl external links, and the Playwright suites (`test/e2e*`) need a browser and API keys.
- `tests/equivalence/` covers what that suite does not: the API, AI and AI-agent controllers, the OAuth
  strategies and the routes of `app.js`. Both implementations run the same calls in separate processes with the
  same stubs (fetch, SDK clients, MongoDB driver; an in-memory MongoDB for `app.js`), and everything observable is
  compared: render/redirect/json arguments, flash messages, console output, outgoing requests, database calls,
  response status, headers and bodies.

## Known differences

- A panic (member of `none`, index out of range) is not caught by `catch`, where JavaScript's `TypeError` is. Error
  paths that rely on a `TypeError` from a missing object reach Express's error handler instead of the local
  `catch` block.
- `!err` re-raises `Error` instances as they are; any other thrown value is wrapped in a TL error.
- `==` treats `null` and `undefined` as equal (the places that need `=== null`/`=== undefined` use `isnull`/`undef`).
- Every top-level function of a module is exported, so the TL modules export their private helpers too.
