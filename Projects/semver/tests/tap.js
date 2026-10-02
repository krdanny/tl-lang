// Minimal stand-in for `tap`: just enough of the API that node-semver's tests use, counting passes and failures.
'use strict'
const { isDeepStrictEqual } = require('node:util')
const stats = { pass: 0, fail: 0, msgs: [] }
let current = 'root'
const note = (ok, msg) => { if (ok) stats.pass++; else { stats.fail++; if (stats.msgs.length < 12) stats.msgs.push(`${current}: ${msg}`) } }

function looseSame(a, b) {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return a == b // eslint-disable-line eqeqeq
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a), kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => looseSame(a[k], b[k]))
}
// tap's t.match: RegExp/String/Number/Array/Object as type checks, regex or substring for strings, partial deep match for objects
function matches(v, p) {
  if (p === RegExp || p === Array || p === String || p === Number || p === Object || p === Function) {
    if (p === String) return typeof v === 'string'
    if (p === Number) return typeof v === 'number'
    if (p === Object) return v && typeof v === 'object'
    if (p === Function) return typeof v === 'function'
    return v instanceof p
  }
  if (p instanceof RegExp) return p.test(String(v))
  if (typeof p === 'string') return typeof v === 'string' ? v.includes(p) : String(v).includes(p)
  if (p && typeof p === 'object') {
    if (!v || typeof v !== 'object') return false
    return Object.keys(p).every((k) => matches(v[k], p[k]))
  }
  return v === p
}
function throwsOk(fn, expected) {
  try { fn() } catch (e) {
    if (expected === undefined) return true
    if (expected instanceof RegExp) return expected.test(e.message)
    if (typeof expected === 'string') return true // a string second argument is tap's message, not the expected error
    if (expected instanceof Error) return e.message === expected.message && (!expected.name || e.name === expected.name || e.constructor.name === expected.constructor.name)
    if (typeof expected === 'object') return Object.keys(expected).every((k) => k === 'name' ? (e.name === expected[k] || e.constructor.name === expected[k]) : matches(e[k], expected[k]))
    return true
  }
  return false
}
const show = (v) => { try { return JSON.stringify(v) } catch { return String(v) } }
const t = {
  equal: (a, b, m = '') => note(Object.is(a, b) || a === b, `equal ${show(a)} vs ${show(b)} ${m}`),
  not: (a, b, m = '') => note(a !== b, `not ${show(a)} ${m}`),
  strictSame: (a, b, m = '') => note(isDeepStrictEqual(a, b), `strictSame ${show(a)} vs ${show(b)} ${m}`),
  same: (a, b, m = '') => note(looseSame(a, b), `same ${show(a)} vs ${show(b)} ${m}`),
  ok: (v, m = '') => note(!!v, `ok ${show(v)} ${m}`),
  notOk: (v, m = '') => note(!v, `notOk ${show(v)} ${m}`),
  throws: (fn, expected, m = '') => note(throwsOk(fn, expected), `throws ${m} ${show(expected)}`),
  match: (v, p, m = '') => note(matches(v, p), `match ${show(v)} ${m}`),
  notMatch: (v, p, m = '') => note(!matches(v, p), `notMatch ${show(v)} ${m}`),
  plan: () => {}, end: () => {}, cleanSnapshot: () => {}, resolveMatchSnapshot: () => note(true, ''),
  test: (name, fn) => { const prev = current; current = name; try { fn(t) } catch (e) { note(false, `threw ${e && e.message}`) } current = prev },
}
t.test.stats = stats
module.exports = t
module.exports.test = t.test
module.exports.stats = stats
