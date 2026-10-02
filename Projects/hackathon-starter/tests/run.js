// Runs hackathon-starter's own mocha suite (original/test/*.test.js, unchanged) against an implementation.
//   node tests/run.js original         the original JavaScript (original/)
//   node tests/run.js tl               the TL modules (tl/), built into tl-build/ first (see tests/build.js)
// Same command line as upstream `npm test` (without the c8 coverage wrapper):
//   mocha --timeout=60000 --exit --exclude "test/*links.test.js"
// Extra arguments are passed to mocha (e.g. `node tests/run.js tl test/user.test.js`).
'use strict'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const which = process.argv[2] || 'original'
const extra = process.argv.slice(3)
const root = path.resolve(__dirname, '..')
if (!['original', 'tl'].includes(which)) { console.log('usage: node tests/run.js original|tl'); process.exit(2) }
if (!fs.existsSync(path.join(root, 'node_modules'))) { console.log('run `npm install` in Projects/hackathon-starter first'); process.exit(2) }

const original = path.join(root, 'original')
if (!require('./build.js').prepare()) { console.log('0 passed, 1 failed (scss build)'); process.exit(1) }

let app = original
if (which === 'tl') {
  try { app = require('./build.js').build() } catch (e) { console.log(String(e.message || e)); console.log('0 passed, 1 failed (build)'); process.exit(1) }
}

const stats = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hs-')), 'stats.json')
const r = spawnSync(process.execPath, [path.join(root, 'node_modules/mocha/bin/mocha.js'), '--timeout=60000', '--exit', '--exclude', 'test/*links.test.js', '--reporter', path.join(__dirname, 'reporter.js'), ...extra], {
  cwd: app,
  stdio: 'inherit',
  env: { ...process.env, TL_BENCH_STATS: stats },
})
let s = null
try { s = JSON.parse(fs.readFileSync(stats, 'utf8')) } catch {}
fs.rmSync(path.dirname(stats), { recursive: true, force: true })
if (!s) { console.log('0 passed, 1 failed (mocha did not finish)'); process.exit(1) }
console.log(`${s.passes} passed, ${s.failures} failed${s.pending ? ` (${s.pending} pending)` : ''}`)
process.exit(s.failures || r.status ? 1 : 0)
