// Runs Raneto's own jest suite (original/test/*.test.js, unchanged) against one implementation.
//
//   node tests/run.js original   the upstream JavaScript sources in original/
//   node tests/run.js tl         the TL sources in tl/, compiled with tlc
//
// For `tl` a runnable tree is generated in tl-build/: the upstream tests, content and configuration are copied,
// tl/ is compiled to tl-build/tl/, and every upstream source file is replaced by a one-line shim that re-exports
// the compiled TL module (TL has named exports only, so the shim also supplies the default export).
// The last line of stdout is `N passed, M failed`; the exit code is non-zero when anything fails.
//
// Name mapping (tl/ is one flat folder): app/core/x.js and app/functions/x.js → tl/x.tl,
// app/middleware/x.mw.js → tl/xMw.tl, app/routes/x.route.js → tl/xRoute.tl, app/index.js → tl/index.tl,
// server.js → tl/server.tl. Because the compiled modules sit in one folder, two paths differ from the original:
// language.tl reads <module dir>/translations (the original goes up from app/core), and server.tl imports
// ../config/config.js. Object default exports (utils, contentProcessors, lunr, oauth2) are `const` objects.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const original = path.join(project, 'original');
const tlc = path.resolve(project, '..', '..', 'lib', 'bin', 'tlc.js');

// upstream source file → [TL module in tl/, the name it exports that is the file's default export]
export const MODULES = {
  'app/index.js': ['index', 'initialize'],
  'app/core/configValidation.js': ['configValidation', 'validateConfig'],
  'app/core/contents.js': ['contents', 'handler'],
  'app/core/envOverrides.js': ['envOverrides', 'applyEnvOverrides'],
  'app/core/language.js': ['language', 'languageLoad'],
  'app/core/lunr.js': ['lunr', 'lunr'],
  'app/core/page.js': ['page', 'handler'],
  'app/core/search.js': ['search', 'handler'],
  'app/core/utils.js': ['utils', 'utils'],
  'app/functions/buildNestedPages.js': ['buildNestedPages', 'buildNestedPages'],
  'app/functions/contentProcessors.js': ['contentProcessors', 'contentProcessors'],
  'app/functions/createMetaInfo.js': ['createMetaInfo', 'createMetaInfo'],
  'app/functions/excludeImageDirectory.js': ['excludeImageDirectory', 'excludeImageDirectory'],
  'app/functions/getAuthContext.js': ['getAuthContext', 'getAuthContext'],
  'app/functions/getFilepath.js': ['getFilepath', 'getFilepath'],
  'app/functions/normalizeLineEndings.js': ['normalizeLineEndings', 'normalizeLineEndings'],
  'app/functions/sanitize.js': ['sanitize', 'sanitizer'],
  'app/functions/sanitizeHtmlOutput.js': ['sanitizeHtmlOutput', 'sanitizeHtmlOutput'],
  'app/middleware/authenticate.mw.js': ['authenticateMw', 'middlewareAuthenticate'],
  'app/middleware/authenticateReadAccess.mw.js': ['authenticateReadAccessMw', 'authenticateReadAccess'],
  'app/middleware/errorHandler.mw.js': ['errorHandlerMw', 'errorHandler'],
  'app/middleware/oauth2.mw.js': ['oauth2Mw', 'oauth2'],
  'app/routes/categoryCreate.route.js': ['categoryCreateRoute', 'routeCategoryCreate'],
  'app/routes/home.route.js': ['homeRoute', 'routeHome'],
  'app/routes/login.route.js': ['loginRoute', 'routeLogin'],
  'app/routes/loginPage.route.js': ['loginPageRoute', 'routeLoginPage'],
  'app/routes/logout.route.js': ['logoutRoute', 'routeLogout'],
  'app/routes/pageCreate.route.js': ['pageCreateRoute', 'routePageCreate'],
  'app/routes/pageDelete.route.js': ['pageDeleteRoute', 'routePageDelete'],
  'app/routes/pageEdit.route.js': ['pageEditRoute', 'routePageEdit'],
  'app/routes/search.route.js': ['searchRoute', 'routeSearch'],
  'app/routes/sitemap.route.js': ['sitemapRoute', 'routeSitemap'],
  'app/routes/wildcard.route.js': ['wildcardRoute', 'routeWildcard'],
  'server.js': ['server', null],
};

function buildTlTree() {
  const tree = path.join(project, 'tl-build');
  fs.rmSync(tree, { recursive: true, force: true });
  fs.mkdirSync(tree, { recursive: true });
  for (const dir of ['test', 'content', 'config']) fs.cpSync(path.join(original, dir), path.join(tree, dir), { recursive: true });

  const out = path.join(tree, 'tl');
  const r = spawnSync(process.execPath, [tlc, '--rootDir', path.join(project, 'tl'), '--outDir', out], { cwd: project, encoding: 'utf8' });
  if (r.status !== 0) {
    process.stderr.write(r.stdout + r.stderr);
    return null;
  }
  // the translations sit next to the code, as in the original (app/translations)
  fs.cpSync(path.join(original, 'app', 'translations'), path.join(out, 'translations'), { recursive: true });

  for (const [file, [mod, def]] of Object.entries(MODULES)) {
    const shim = path.join(tree, file);
    fs.mkdirSync(path.dirname(shim), { recursive: true });
    let target = path.relative(path.dirname(shim), path.join(out, `${mod}.js`)).split(path.sep).join('/');
    if (!target.startsWith('.')) target = `./${target}`;
    if (!fs.existsSync(path.join(out, `${mod}.js`))) {
      process.stderr.write(`tl/${mod}.tl is missing (needed for ${file})\n`);
      return null;
    }
    fs.writeFileSync(shim, def
      ? `export * from '${target}';\nexport { ${def} as default } from '${target}';\n`
      : `import '${target}';\n`);
  }
  return tree;
}

function main() {
  const impl = process.argv[2];
  if (impl !== 'original' && impl !== 'tl') {
    console.log('usage: node tests/run.js original|tl');
    return 2;
  }
  const tree = impl === 'original' ? original : buildTlTree();
  if (!tree) {
    console.log('0 passed, 1 failed (the TL sources did not build)');
    return 1;
  }

  const jest = path.join(project, 'node_modules', 'jest', 'bin', 'jest.js');
  const report = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'raneto-jest-')), 'report.json');
  const r = spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', jest, '--rootDir', tree, '--json', '--outputFile', report, ...process.argv.slice(3)], {
    cwd: tree,
    env: { ...process.env, NODE_ENV: 'test' },
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  let passed = 0, failed = 1, suites = '';
  if (fs.existsSync(report)) {
    const j = JSON.parse(fs.readFileSync(report, 'utf8'));
    passed = j.numPassedTests;
    // a suite that cannot be loaded has no tests: count it as one failure
    failed = j.numFailedTests + j.numRuntimeErrorTestSuites;
    suites = ` (${j.numPassedTestSuites}/${j.numTotalTestSuites} suites)`;
    fs.rmSync(path.dirname(report), { recursive: true, force: true });
  }
  if (failed || r.status !== 0) process.stderr.write(r.stderr);
  console.log(`${passed} passed, ${failed} failed${suites}`);
  return failed || r.status !== 0 ? 1 : 0;
}

process.exitCode = main();
