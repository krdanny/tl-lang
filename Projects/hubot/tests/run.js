// Runs Hubot's own test suite (original/test/, node:test, unchanged) against an implementation.
//   node tests/run.js original         the original JavaScript (original/)
//   node tests/run.js tl               the TL modules (tl/), compiled by tlc
//   node tests/run.js tl Brain         only the test files whose name contains "Brain"
//
// Both implementations run from a scratch tree under tl-build/<impl>/ (the tests write files such as
// .hubot_history into the working directory). The tree has the layout of the Hubot repository:
//   package.json  index.mjs  bin/  src/  configuration/  test/
// For `tl`, tlc compiles tl/*.tl into src/ and every original module is replaced by a one-line shim that
// re-exports the compiled TL module with the original export shape (see SHIMS below).
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const which = process.argv[2] || 'original'
const only = process.argv[3]
const root = path.resolve(__dirname, '..')
const original = path.join(root, 'original')
const tree = path.join(root, 'tl-build', which)

if (!['original', 'tl'].includes(which)) {
  console.log('usage: node tests/run.js original|tl [filter]')
  process.exit(2)
}

// original module -> shim source (TL modules are flat: src/adapters/Shell.mjs is tl/Shell.tl, bin/Hubot.mjs is tl/Hubot.tl)
const SHIMS = {
  'index.mjs': "import * as m from './src/index.js'\nexport * from './src/index.js'\nexport default { Adapter: m.Adapter, User: m.User, Brain: m.Brain, Robot: m.Robot, Response: m.Response, Listener: m.Listener, TextListener: m.TextListener, Message: m.Message, TextMessage: m.TextMessage, EnterMessage: m.EnterMessage, LeaveMessage: m.LeaveMessage, TopicMessage: m.TopicMessage, CatchAllMessage: m.CatchAllMessage, DataStore: m.DataStore, DataStoreUnavailable: m.DataStoreUnavailable, CommandBus: m.CommandBus, loadBot: m.loadBot }\n",
  'bin/Hubot.mjs': "export { robot as default } from '../src/Hubot.js'\n",
  'src/Adapter.mjs': "export { Adapter as default } from './Adapter.js'\n",
  'src/Brain.mjs': "export { Brain as default } from './Brain.js'\n",
  'src/CommandBus.mjs': "export { CommandBus } from './CommandBus.js'\n",
  'src/DataStore.mjs': "import { DataStore, DataStoreUnavailable } from './DataStore.js'\nexport { DataStore, DataStoreUnavailable }\nexport default { DataStore, DataStoreUnavailable }\n",
  'src/GenHubot.mjs': "export { create as default } from './GenHubot.js'\n",
  'src/HttpClient.mjs': "import { create } from './HttpClient.js'\nexport default { create }\n",
  'src/Listener.mjs': "export { Listener, TextListener } from './Listener.js'\n",
  'src/Message.mjs': "import { Message, TextMessage, EnterMessage, LeaveMessage, TopicMessage, CatchAllMessage } from './Message.js'\nexport { Message, TextMessage, EnterMessage, LeaveMessage, TopicMessage, CatchAllMessage }\nexport default { Message, TextMessage, EnterMessage, LeaveMessage, TopicMessage, CatchAllMessage }\n",
  'src/Middleware.mjs': "export { Middleware as default } from './Middleware.js'\n",
  'src/OptParse.mjs': "export { OptParse as default } from './OptParse.js'\n",
  'src/Response.mjs': "export { Response as default } from './Response.js'\n",
  'src/Robot.mjs': "export { Robot as default } from './Robot.js'\n",
  'src/User.mjs': "export { User as default } from './User.js'\n",
  'src/adapters/Campfire.mjs': "import { use } from '../Campfire.js'\nexport default { use }\n",
  'src/adapters/Shell.mjs': "import { use } from '../Shell.js'\nexport default { use }\n",
  'src/datastores/Memory.mjs': "export { InMemoryDataStore as default } from '../Memory.js'\n"
}

fs.rmSync(tree, { recursive: true, force: true })
fs.mkdirSync(tree, { recursive: true })
const copy = (rel) => fs.cpSync(path.join(original, rel), path.join(tree, rel), { recursive: true })
for (const rel of ['package.json', 'test', 'configuration', 'bin/hubot']) copy(rel)

if (which === 'original') {
  for (const rel of ['index.mjs', 'src', 'bin/Hubot.mjs']) copy(rel)
} else {
  try {
    execFileSync(process.execPath, [path.join(root, '../../lib/bin/tlc.js'), '--rootDir', 'tl', '--outDir', path.join(tree, 'src')], { cwd: root, stdio: 'inherit' })
  } catch {
    console.log('tlc failed')
    console.log('0 passed, 1 failed')
    process.exit(1)
  }
  for (const [rel, text] of Object.entries(SHIMS)) {
    fs.mkdirSync(path.dirname(path.join(tree, rel)), { recursive: true })
    fs.writeFileSync(path.join(tree, rel), text)
  }
}

// the same command as `npm test` in the Hubot repository
const files = fs.readdirSync(path.join(tree, 'test')).filter((f) => /[-_]test\.mjs$|Test\.mjs$/.test(f)).filter((f) => !only || f.includes(only)).sort().map((f) => path.join('test', f))
const env = { ...process.env }
delete env.NODE_TEST_CONTEXT
const r = spawnSync(process.execPath, ['--test', '--test-timeout=40000', ...(only ? files : [])], { cwd: tree, encoding: 'utf8', env, maxBuffer: 1 << 28 })
const out = (r.stdout || '') + (r.stderr || '')
const num = (key) => { const m = out.match(new RegExp(`^(?:# |ℹ )${key} (\\d+)`, 'm')); return m ? Number(m[1]) : null }
const pass = num('pass')
const fail = num('fail')
const cancelled = num('cancelled') || 0
if (pass === null || fail === null) {
  console.log(out)
  console.log('0 passed, 1 failed')
  process.exit(1)
}
if (fail + cancelled > 0 || process.env.VERBOSE) console.log(out)
console.log(`${num('tests')} tests in ${num('suites')} suites`)
console.log(`${pass} passed, ${fail + cancelled} failed`)
process.exit(fail + cancelled > 0 || r.status !== 0 ? 1 : 0)
