// Differential check of the two implementations beyond what the upstream mocha suite covers.
//   node tests/equivalence/run.js [scenario…]
// Each scenario file drives the same calls against original/ and against the TL build (tl-build/), in separate
// processes, with network, database and SDK clients replaced by the same stubs, and the recordings are compared
// line by line: arguments of res.render/redirect/json, flash messages, console output, outgoing HTTP requests,
// database calls, and for app.js the status, headers and (normalised) body of 136 requests against an in-memory MongoDB.
'use strict'
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '../..')
const all = ['api', 'ai', 'internals', 'rag', 'passport', 'app']
const chosen = process.argv.slice(2).length ? process.argv.slice(2) : all
const { build, prepare } = require('../build.js')
if (!prepare()) { console.log('scss build failed'); process.exit(1) }
build()

const lines = (dir, scenario) => {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'scenario.js'), path.join(root, dir), scenario + '.js'], { encoding: 'utf8', maxBuffer: 1 << 28 })
  return (r.stdout || '').split('\n').filter((l) => l.startsWith('{'))
}
let same = 0, different = 0
for (const s of chosen) {
  const a = lines('original', s), b = lines('tl-build', s)
  let ok = 0, bad = 0
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== undefined && a[i] === b[i]) { ok++; continue }
    bad++
    let name = '?'; try { name = JSON.parse(a[i] || b[i]).name } catch {}
    console.log(`  DIFF ${s}: ${name}\n    original: ${(a[i] || '(missing)').slice(0, 600)}\n    tl:       ${(b[i] || '(missing)').slice(0, 600)}`)
  }
  if (!a.length) { bad++; console.log(`  ${s}: the scenario produced no output`) }
  console.log(`${s}: ${ok} identical, ${bad} different`)
  same += ok; different += bad
}
console.log(`${same} identical, ${different} different`)
process.exit(different ? 1 : 0)
