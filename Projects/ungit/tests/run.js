// Runs Ungit's own mocha unit tests (tests/suite/spec.*.js, unchanged) against an implementation of the server.
//   node tests/run.js original        the original JavaScript (original/source)
//   node tests/run.js tl              the TL modules (tl/*.tl), compiled with tlc
//   node tests/run.js tl git-parser   only the spec files whose name contains "git-parser"
//
// A runnable tree is assembled in .run/<impl>/ with the layout the tests expect (source/, test/, bin/, package.json).
// For `tl`, every file in source/ is a one-line shim that re-exports the compiled TL module, so the tests and the
// way they load the server are exactly the same for both implementations.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const which = process.argv[2] || 'original';
const only = process.argv[3];
const root = path.resolve(__dirname, '..');
const tree = path.join(root, '.run', which);

// source module -> TL module (tl/ is flat) and what its CommonJS `module.exports` is:
//   value: 'x'  -> `module.exports = x` in the original: the TL module's top-level `x`
//   (no value)  -> `exports.a = …; exports.b = …` in the original: the TL module's top-level functions and constants
const MODULES = {
  'address-parser.js': { tl: 'addressParser' },
  'bugtracker.js': { tl: 'bugtracker', value: 'BugTracker' },
  'config.js': { tl: 'config', value: 'config' },
  // git-api's exports object is written to from outside (`gitApi.pathPrefix = '/api'`), so the TL module keeps it as a value
  'git-api.js': { tl: 'gitApi', value: 'exports' },
  'git-parser.js': { tl: 'gitParser' },
  'git-promise.js': { tl: 'gitPromise', value: 'git' },
  'server.js': { tl: 'server' },
  'sysinfo.js': { tl: 'sysinfo' },
  'ungit-plugin.js': { tl: 'ungitPlugin', value: 'UngitPlugin' },
  'utils/cache.js': { tl: 'cache', value: 'cache' },
  'utils/file-type.js': { tl: 'fileType', value: 'fileType' },
  'utils/logger.js': { tl: 'logger', value: 'logger' },
};

fs.rmSync(tree, { recursive: true, force: true });
fs.mkdirSync(path.join(tree, 'source', 'utils'), { recursive: true });
fs.cpSync(path.join(root, 'original', 'bin'), path.join(tree, 'bin'), { recursive: true });
fs.cpSync(path.join(root, 'original', 'package.json'), path.join(tree, 'package.json'));
fs.cpSync(path.join(__dirname, 'suite'), path.join(tree, 'test'), { recursive: true });

if (which === 'original') {
  fs.cpSync(path.join(root, 'original', 'source'), path.join(tree, 'source'), { recursive: true });
} else {
  const out = path.join(tree, 'tl-build');
  try {
    execFileSync(process.execPath, [path.join(root, '../../lib/bin/tlc.js'), '--rootDir', which, '--outDir', out], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  } catch {
    console.log('tlc failed');
    console.log('0 passed, 1 failed');
    process.exit(1);
  }
  fs.writeFileSync(path.join(out, 'package.json'), '{ "type": "module" }\n');
  for (const [file, m] of Object.entries(MODULES)) {
    const rel = path.relative(path.dirname(path.join(tree, 'source', file)), path.join(out, `${m.tl}.js`)).split(path.sep).join('/');
    const shim = `module.exports = require('${rel}')${m.value ? `.${m.value}` : ''};\n`;
    fs.writeFileSync(path.join(tree, 'source', file), shim);
  }
}

// The tests run git. They get their own HOME and global git configuration, so nothing of the user's is read or
// written, and the temporary repositories they create live under the system temp folder.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ungit-bench-home-'));
fs.writeFileSync(path.join(home, '.gitconfig'), '[user]\n\tname = Ungit Bench\n\temail = bench@example.com\n[init]\n\tdefaultBranch = master\n[protocol "file"]\n\tallow = always\n');
const report = path.join(home, 'mocha.json');
const specs = fs.readdirSync(path.join(tree, 'test')).filter((f) => /^spec\..*\.js$/.test(f) && (!only || f.includes(only))).sort().map((f) => path.join('test', f));
const mocha = path.join(root, 'node_modules', 'mocha', 'bin', 'mocha.js');
const r = spawnSync(process.execPath, [mocha, '--timeout', '12000', '--exit', '--reporter', 'json', '--reporter-option', `output=${report}`, ...specs], {
  cwd: tree,
  encoding: 'utf8',
  env: { ...process.env, HOME: home, USERPROFILE: home, GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig'), GIT_CONFIG_NOSYSTEM: '1', NODE_ENV: 'test' },
  maxBuffer: 64 * 1024 * 1024,
});

let stats = null;
let failures = [];
try {
  const j = JSON.parse(fs.readFileSync(report, 'utf8'));
  stats = j.stats;
  failures = j.failures;
} catch { /* mocha did not get as far as writing a report */ }
fs.rmSync(home, { recursive: true, force: true });

if (!stats) {
  console.log((r.stdout || '').slice(-3000));
  console.log((r.stderr || '').slice(-3000));
  console.log('0 passed, 1 failed');
  process.exit(1);
}
for (const f of failures.slice(0, 15)) console.log(`  FAIL ${f.fullTitle}\n       ${String(f.err && f.err.message).split('\n')[0].slice(0, 300)}`);
console.log(`${specs.length} spec files, ${stats.passes} passed, ${stats.failures} failed${stats.pending ? `, ${stats.pending} pending` : ''}`);
process.exit(stats.failures || r.status ? 1 : 0);
