// Runs node-semver's own test files (tests/suite/) against an implementation.
//   node tests/run.js original         the original JavaScript (original/)
//   node tests/run.js tl               the TL modules, compiled to tl-build/ first
// Every `require('../../x/y')` inside the suite is redirected to the chosen implementation.
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { execFileSync } = require('node:child_process')

const which = process.argv[2] || 'original'
const only = process.argv[3]
const root = path.resolve(__dirname, '..')
const tap = require('./tap.js')

let load
if (which === 'original') {
  load = (rel) => require(path.join(root, 'original', rel === '' ? 'index.js' : rel))
} else {
  try { execFileSync(process.execPath, [path.join(root, '../../lib/bin/tlc.js'), '--rootDir', 'tl', '--outDir', 'tl-build'], { cwd: root, stdio: 'inherit' }) } catch { console.log('tlc failed'); process.exit(1) }
  // CommonJS shape of each module: `module.exports = X` when the file has one main export named after it
  const main = { 'classes/semver': 'SemVer', 'classes/range': 'Range', 'classes/comparator': 'Comparator', 'internal/lrucache': 'LRUCache', 'internal/parse-options': 'parseOptions', 'internal/debug': 'debug', 'ranges/simplify': 'simplifyRange' }
  const camel = (s) => s.replace(/-(\w)/g, (_, c) => c.toUpperCase())
  // the TL modules are flat: classes/semver -> semver.tl, ranges/valid -> validRange.tl, internal/parse-options -> parseOptions.tl
  load = (rel) => {
    const file = rel === '' ? 'index' : rel.replace(/\.js$/, '')
    if (file === 'classes') { const a = require(path.join(root, 'tl-build', 'index.js')).semver; return { SemVer: a.SemVer, Range: a.Range, Comparator: a.Comparator } }
    const flat = file === 'ranges/valid' ? 'validRange' : camel(path.basename(file))
    const ns = require(path.join(root, 'tl-build', flat + '.js'))
    const name = main[file] || flat
    if (file === 'index') return ns.semver
    if (file.startsWith('internal/') && !main[file]) return ns
    return name in ns ? ns[name] : ns
  }
}

const suite = path.join(__dirname, 'suite')
const origRequire = Module.prototype.require
Module.prototype.require = function (request) {
  if (this.filename && this.filename.startsWith(suite)) {
    if (request === 'tap') return tap
    if (request.startsWith('../') && !request.startsWith('../fixtures')) return load(request.replace(/^\.\.\/(\.\.\/)?/, '').replace(/\/$/, ''))
  }
  return origRequire.call(this, request)
}

const files = []
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (f !== 'fixtures') walk(p) } else if (p.endsWith('.js')) files.push(p) } }
walk(suite)
for (const f of files.sort()) {
  if (only && !f.includes(only)) continue
  const before = tap.stats.fail
  try { require(f) } catch (e) { tap.stats.fail++; tap.stats.msgs.push(`${path.relative(suite, f)}: LOAD FAIL ${e.message.split('\n')[0]}`) }
  if (tap.stats.fail > before) console.log(`  FAIL ${path.relative(suite, f)} (${tap.stats.fail - before})`)
}
for (const m of tap.stats.msgs) console.log('   ', m.slice(0, 300))
console.log(`${files.length} test files, ${tap.stats.pass} assertions passed, ${tap.stats.fail} failed`)
process.exit(tap.stats.fail ? 1 : 0)
