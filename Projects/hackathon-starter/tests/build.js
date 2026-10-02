// Builds the TL implementation into tl-build/, laid out like the original application so that the
// unchanged upstream tests (`require('../controllers/user')`, `require('../app')`, …) load it.
//
//   tl/*.tl --tlc--> tl-build/.esm/*.js (ES modules) --this file--> tl-build/<original path>.js (CommonJS)
//
// The upstream suite is CommonJS all the way down: it deletes `require.cache` entries and re-requires a
// controller, swaps `Module.prototype.require` to hand a controller fake '../models/User' or
// '../config/nodemailer' modules, patches `require.cache[...]`.exports and stubs exported functions with
// sinon. None of that reaches ES modules, so every compiled module is rewritten 1:1 into a CommonJS file:
//   import … from "x"            ->  const … = require("x")   (sibling modules by their original relative id)
//   export function f / const c   ->  exports.f = f / exports.c = c   (plain writable properties)
// No code is added or removed; only the module wrapper changes.
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const out = path.join(root, 'tl-build')

// TL module (tl/<name>.tl, flat folder) -> the original module it replaces
const MODULES = {
  app: 'app.js',
  agent: 'controllers/ai-agent.js',
  ai: 'controllers/ai.js',
  api: 'controllers/api.js',
  contact: 'controllers/contact.js',
  home: 'controllers/home.js',
  user: 'controllers/user.js',
  webauthn: 'controllers/webauthn.js',
  session: 'models/Session.js',
  usermodel: 'models/User.js',
  cachebust: 'config/cacheBust.js',
  flash: 'config/flash.js',
  morgan: 'config/morgan.js',
  mailer: 'config/nodemailer.js',
  passport: 'config/passport.js',
  revocation: 'config/token-revocation.js',
  prelude: 'tl/prelude.js', // shared TL helpers (no counterpart in the original)
}
// modules whose original does `module.exports = <one value>`: the TL module's export of that name
const MAIN = { app: 'app', session: 'sessions', usermodel: 'users' }

const requireId = (from, to) => {
  let rel = path.relative(path.dirname(MODULES[from]), MODULES[to]).replace(/\\/g, '/').replace(/\.js$/, '')
  if (!rel.startsWith('.')) rel = './' + rel
  return rel
}

function toCommonJS(name, src) {
  const lines = src.split('\n')
  const res = ["'use strict';"]
  const exported = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let m
    if ((m = /^import \* as \$ from ".*";$/.exec(line))) {
      let rel = path.relative(path.dirname(MODULES[name]), 'tl/tl-runtime.js').replace(/\\/g, '/')
      if (!rel.startsWith('.')) rel = './' + rel
      res.push(`const $ = require(${JSON.stringify(rel)});`)
    } else if ((m = /^import \* as (\S+)\$ns from (".*");$/.exec(line))) {
      // `+npm.x` / `+"x"`: tlc emits a namespace import followed by `const x = x$ns.default ?? x$ns;`
      if (!lines[i + 1].startsWith(`const ${m[1]} = ${m[1]}$ns.default`)) throw new Error(`${name}: unexpected import shape: ${line}`)
      i++
      res.push(`const ${m[1]} = require(${m[2]});`)
    } else if ((m = /^import \* as (\S+) from "(node:[^"]+)";$/.exec(line))) {
      res.push(`const ${m[1]} = require(${JSON.stringify(m[2])});`)
    } else if ((m = /^import \* as (\S+) from "\.\/(\w+)\.js";$/.exec(line))) {
      const id = JSON.stringify(requireId(name, m[2]))
      res.push(MAIN[m[2]] ? `const ${m[1]} = { ${MAIN[m[2]]}: require(${id}) };` : `const ${m[1]} = require(${id});`)
    } else if ((m = /^import \{ (.*) \} from "\.\/(\w+)\.js";$/.exec(line))) {
      const id = JSON.stringify(requireId(name, m[2]))
      const items = m[1].split(', ').map((x) => x.split(' as '))
      if (MAIN[m[2]]) {
        for (const [imp, local] of items) {
          if (imp !== MAIN[m[2]]) throw new Error(`${name}: '${imp}' is not what ${MODULES[m[2]]} exports`)
          res.push(`const ${local || imp} = require(${id});`)
        }
      } else if (m[2] === 'prelude') {
        res.push(`const { ${items.map(([imp, local]) => (local ? `${imp}: ${local}` : imp)).join(', ')} } = require(${id});`)
      } else {
        res.push(`const { ${items.map(([imp, local]) => (local ? `${imp}: ${local}` : imp)).join(', ')} } = require(${id});`)
      }
    } else if (/^import /.test(line)) {
      throw new Error(`${name}: unhandled import: ${line}`)
    } else if ((m = /^export ((?:async )?function\*?|const|let|class) ([\w$]+)/.exec(line))) {
      exported.push(m[2])
      res.push(line.slice('export '.length))
    } else if (/^export /.test(line)) {
      throw new Error(`${name}: unhandled export: ${line}`)
    } else {
      res.push(line)
    }
  }
  if (MAIN[name]) {
    if (!exported.includes(MAIN[name])) throw new Error(`${name}: no export named '${MAIN[name]}'`)
    res.push(`module.exports = ${MAIN[name]};`)
  } else {
    for (const e of exported) res.push(`exports.${e} = ${e};`)
  }
  return res.join('\n') + '\n'
}

function build() {
  const esm = path.join(out, '.esm')
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(esm, { recursive: true })
  execFileSync(process.execPath, [path.join(root, '../../lib/bin/tlc.js'), '--rootDir', 'tl', '--outDir', esm], { cwd: root, stdio: 'inherit' })

  const sources = fs.readdirSync(path.join(root, 'tl')).filter((f) => f.endsWith('.tl')).map((f) => f.slice(0, -3))
  for (const name of sources) if (!MODULES[name]) throw new Error(`tl/${name}.tl has no entry in MODULES (tests/build.js)`)
  for (const name of sources) {
    const target = path.join(out, MODULES[name])
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, toCommonJS(name, fs.readFileSync(path.join(esm, name + '.js'), 'utf8')))
  }
  // the TL runtime, as CommonJS
  const esbuild = require('esbuild')
  const runtime = esbuild.transformSync(fs.readFileSync(path.join(esm, 'tl-runtime.js'), 'utf8'), { format: 'cjs', target: 'node22' })
  fs.mkdirSync(path.join(out, 'tl'), { recursive: true })
  fs.writeFileSync(path.join(out, 'tl/tl-runtime.js'), runtime.code)

  // everything else the application and its tests read from the application folder
  fs.cpSync(path.join(root, 'original/test'), path.join(out, 'test'), { recursive: true })
  for (const f of ['views', 'public', '.env.example']) fs.symlinkSync(path.join('../original', f), path.join(out, f))
  fs.symlinkSync('../node_modules', path.join(out, 'node_modules'), 'dir')
  return out
}

module.exports = { build, MODULES, MAIN }
if (require.main === module) build()
