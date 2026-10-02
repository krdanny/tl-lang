// Tests for the extension: its logic against a mocked `vscode` API, and the grammars against a real TextMate engine.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');

const mock = require('./vscode-mock.cjs');
const load = Module._load;
Module._load = function (request, ...rest) { return request === 'vscode' ? mock : load.call(this, request, ...rest); };
const ext = require('../dist/extension.js');

const { Uri, workspace, window, commands, __state: state } = mock;
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const results = [];
const test = (name, fn) => results.push({ name, fn });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-readable-'));
const write = (name, text) => { const p = path.join(dir, name); fs.writeFileSync(p, text); return Uri.file(p); };
write('tl.def', 'SV SemVer\nte throwErrors\n'); // the project's dictionary: without it nothing compiles
const parseTl = write('parse.tl', '+semver.SV|fn parse version options=none te=false|if version is SV|^version<try|SV version options<catch e|if not te|^null<!e');
write('semver.tl', 'type SV|raw str<impl SV|init self v o=none|self.raw=v<get short self|self.raw.slice 0 1<<');
const badTl = write('bad.tl', 'fn f a b|x a+|print x');
const tableTl = write('table.tl', 'const codes{' + Array.from({ length: 30 }, (_, i) => `k${i}:/^${i}\\d+$/`).join(' ') + '}|fn has c|codes.has c');

async function openAsUser(uri, opts) {
  const doc = await workspace.openTextDocument(uri);
  await window.showTextDocument(doc, opts);
  await tick(5);
  return window.activeTextEditor;
}
const active = () => window.activeTextEditor.document;
const rawTabs = (uri) => window.tabGroups.all[0].tabs.filter((t) => t.input.uri && t.input.uri.toString() === uri.toString());

let api;
test('activates and registers the provider, commands and providers', async () => {
  api = ext.activate({ subscriptions: [] });
  assert.ok(state.providers.has('tl-readable'));
  for (const c of ['tl.openReadable', 'tl.openReadableToSide', 'tl.openSource', 'tl.revealInSource', 'tl.unlockSource', 'tl.toggleKeywords', 'tl.toggleLongNames']) assert.ok(state.commands.has(c), c);
  assert.equal(state.symbolProviders.length, 1);
  assert.equal(state.hoverProviders.length, 1);
});

test('opening a .tl file shows the readable view and closes the raw tab', async () => {
  await openAsUser(parseTl);
  assert.equal(active().uri.scheme, 'tl-readable');
  assert.equal(active().uri.path, parseTl.path + '.view');
  assert.equal(active().languageId, 'tl-readable');
  assert.equal(rawTabs(parseTl).length, 0, 'the one-line tab is gone');
  assert.equal(active().getText(), [
    'import semver.SemVer',
    '',
    'fn parse version options=none throwErrors=false',
    '    if version is SemVer',
    '        return version',
    '    try',
    '        SemVer version options',
    '    catch e',
    '        if not throwErrors',
    '            return null',
    '        raise e',
  ].join('\n'));
  assert.ok(state.statusItems[0].visible, 'status bar says the view is read-only');
});

test('the readable document cannot be edited: it comes from a content provider, there is no file to write', async () => {
  assert.equal(typeof state.providers.get('tl-readable').provideTextDocumentContent, 'function');
  assert.equal(fs.existsSync(parseTl.path + '.view'), false);
});

test('"Open Raw Source" shows the one-line file, locked, and does not bounce back', async () => {
  state.executed.length = 0;
  await commands.executeCommand('tl.openSource');
  await tick(5);
  assert.equal(active().uri.toString(), parseTl.toString());
  assert.ok(state.executed.includes('workbench.action.files.setActiveEditorReadonlyInSession'));
  await openAsUser(parseTl); // focusing the raw tab again keeps it raw
  assert.equal(active().uri.scheme, 'file');
});

test('"Unlock Raw Source" makes it writable and it is not locked again', async () => {
  state.executed.length = 0;
  await commands.executeCommand('tl.unlockSource');
  await tick(5);
  assert.ok(state.executed.includes('workbench.action.files.setActiveEditorWriteableInSession'));
  state.executed.length = 0;
  await openAsUser(parseTl);
  assert.ok(!state.executed.includes('workbench.action.files.setActiveEditorReadonlyInSession'));
});

test('"Open Readable View" from the raw editor returns to the rendering', async () => {
  await commands.executeCommand('tl.openReadable');
  await tick(5);
  assert.equal(active().uri.scheme, 'tl-readable');
  assert.equal(rawTabs(parseTl).length, 0);
});

test('the view follows the file: a change on disk re-renders it', async () => {
  const doc = active();
  fs.writeFileSync(parseTl.path, '+semver.SV|fn parse version|^version');
  state.watchers[0].change.fire(parseTl);
  await tick(250);
  assert.equal(doc.getText(), 'import semver.SemVer\n\nfn parse version\n    return version');
});

test('settings: sigils instead of words, symbols instead of long names, indent width', async () => {
  await commands.executeCommand('tl.toggleKeywords');
  await tick(5);
  assert.equal(active().getText(), '+semver.SemVer\n\nfn parse version\n    ^version');
  await commands.executeCommand('tl.toggleLongNames');
  await tick(5);
  assert.equal(active().getText(), '+semver.SV\n\nfn parse version\n    ^version', 'the symbols as written in the source');
  await workspace.getConfiguration('tl').update('readable.indent', 2);
  await tick(5);
  assert.equal(active().getText(), '+semver.SV\n\nfn parse version\n  ^version');
  await commands.executeCommand('tl.toggleKeywords');
  await commands.executeCommand('tl.toggleLongNames');
  await workspace.getConfiguration('tl').update('readable.indent', 4);
});

test('a folder without tl.def: the view says so (E260) and still shows the source', async () => {
  const lone = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-nodef-'));
  fs.writeFileSync(path.join(lone, 'package.json'), '{}'); // project boundary: do not look further up
  fs.writeFileSync(path.join(lone, 'a.tl'), 'x 1|print x');
  await openAsUser(Uri.file(path.join(lone, 'a.tl')));
  const lines = active().getText().split('\n');
  assert.match(lines[0], /^⚠ E260 /);
  assert.equal(lines[1], 'x 1|print x');
  fs.rmSync(lone, { recursive: true, force: true });
});

test('outline: functions, types, impl blocks with methods and getters', async () => {
  await openAsUser(Uri.file(path.join(dir, 'semver.tl')));
  assert.equal(active().uri.scheme, 'tl-readable');
  const symbols = state.symbolProviders[0].provideDocumentSymbols(active());
  assert.deepEqual(symbols.map((s) => s.name), ['SemVer', 'impl SemVer'], 'the outline uses the long names');
  assert.deepEqual(symbols[1].children.map((s) => [s.name, s.kind]), [['init', mock.SymbolKind.Method], ['short', mock.SymbolKind.Property]]);
  assert.ok(symbols[1].range.end.line > symbols[1].range.start.line);
});

test('hover explains TL words and sigils', async () => {
  const doc = { lineAt: () => ({ text: '    return xs >> map f ?? none' }) };
  const at = (col) => state.hoverProviders[0].provideHover(doc, new mock.Position(0, col));
  assert.match(at(5).contents.value, /Written `\^`/);
  assert.match(at(14).contents.value, /pipeline/);
  assert.match(at(23).contents.value, /default/);
  assert.equal(at(11), undefined, 'a plain name has no entry');
  const inString = { lineAt: () => ({ text: 'print "return >> x"' }) };
  assert.equal(state.hoverProviders[0].provideHover(inString, new mock.Position(0, 9)), undefined);
});

test('a file with a compile error still renders, with a banner and a diagnostic at the right column', async () => {
  await openAsUser(badTl);
  assert.equal(active().uri.scheme, 'tl-readable');
  assert.match(active().getText().split('\n')[0], /^⚠ E140 at column 14: /);
  const diags = state.diagnostics.get(badTl.toString());
  assert.equal(diags.length, 1);
  assert.equal(diags[0].range.start.character, 13);
});

test('long map literals are shown one entry per row', async () => {
  await openAsUser(tableTl);
  const lines = active().getText().split('\n');
  assert.equal(lines[0], 'const codes = {');
  assert.equal(lines[1], '    k0:/^0\\d+$/');
  assert.equal(lines[31], '}');
  assert.equal(lines[33], 'fn has c');
});

test('"Reveal in Raw Source" selects the segment that the readable line shows', async () => {
  window.activeTextEditor.selection = new mock.Selection(new mock.Position(34, 4), new mock.Position(34, 4)); // `codes.has c`
  await commands.executeCommand('tl.revealInSource');
  await tick(5);
  assert.equal(active().uri.toString(), tableTl.toString());
  const sel = window.activeTextEditor.selection;
  assert.equal(active().getText().slice(sel.start.character, sel.end.character), 'codes.has c');
});

test('diff editors are left alone', async () => {
  const other = write('diffed.tl', 'x 1|print x');
  await openAsUser(other, { asDiff: true });
  assert.equal(active().uri.scheme, 'file');
});

test('with openByDefault off the raw file opens (locked) and the readable view is one command away', async () => {
  await workspace.getConfiguration('tl').update('readable.openByDefault', false);
  const plain = write('plain.tl', 'x 1|print x');
  state.executed.length = 0;
  await openAsUser(plain);
  assert.equal(active().uri.scheme, 'file');
  assert.ok(state.executed.includes('workbench.action.files.setActiveEditorReadonlyInSession'));
  await commands.executeCommand('tl.openReadableToSide');
  await tick(5);
  assert.equal(active().uri.scheme, 'tl-readable');
  assert.equal(active().getText(), 'x = 1\nprint x');
  assert.equal(rawTabs(plain).length, 1, 'to the side keeps the source tab');
  await workspace.getConfiguration('tl').update('readable.openByDefault', true);
});

test('unsaved edits of the raw document are rendered (the view reads the open document, not the disk)', async () => {
  const live = write('live.tl', 'x 1');
  await commands.executeCommand('tl.openSource', live);
  await tick(5);
  await commands.executeCommand('tl.openReadableToSide');
  await tick(5);
  const view = active();
  const raw = workspace.textDocuments.find((d) => d.uri.toString() === live.toString());
  raw._text = 'x 1|y x+1';
  mock.__events.onDidChangeTextDocument.fire({ document: raw });
  await tick(250);
  assert.equal(view.getText(), 'x = 1\ny = x+1');
});

async function grammars() {
  const tm = require('vscode-textmate');
  const onig = require('vscode-oniguruma');
  const wasm = fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer;
  await onig.loadWASM(wasm);
  const registry = new tm.Registry({
    onigLib: Promise.resolve({ createOnigScanner: (p) => new onig.OnigScanner(p), createOnigString: (s) => new onig.OnigString(s) }),
    loadGrammar: async (scope) => {
      const file = scope === 'source.tl' ? 'tl.tmLanguage.json' : 'tl-readable.tmLanguage.json';
      return tm.parseRawGrammar(fs.readFileSync(path.join(__dirname, '../syntaxes', file), 'utf8'), file);
    },
  });
  const scopesOf = async (scope, line) => {
    const g = await registry.loadGrammar(scope);
    return g.tokenizeLine(line, tm.INITIAL).tokens.map((t) => [line.slice(t.startIndex, t.endIndex), t.scopes[t.scopes.length - 1]]);
  };
  const find = (toks, text) => (toks.find((t) => t[0] === text) || [])[1];

  test('grammar (readable): keywords, names, strings, regex, pipeline', async () => {
    let t = await scopesOf('source.tl.readable', 'fn parse version options=none');
    assert.equal(find(t, 'fn'), 'storage.type.function.tl');
    assert.equal(find(t, 'parse'), 'entity.name.function.tl');
    assert.equal(find(t, 'none'), 'constant.language.tl');
    t = await scopesOf('source.tl.readable', '    return xs >> map id => /^\\d+$/i.test id');
    assert.equal(find(t, 'return'), 'keyword.control.tl');
    assert.equal(find(t, '>>'), 'keyword.operator.pipeline.tl');
    assert.equal(find(t, '=>'), 'storage.type.function.arrow.tl');
    assert.equal(find(t, '/^\\d+$/i'), 'string.regexp.tl');
    t = await scopesOf('source.tl.readable', '    raise TypeError "Invalid Version: $version" a/b');
    assert.equal(find(t, 'raise'), 'keyword.control.tl');
    assert.equal(find(t, 'TypeError'), 'entity.name.type.tl');
    assert.equal(find(t, '$version'), 'variable.other.interpolated.tl');
    assert.equal(find(t, '/'), 'keyword.operator.arithmetic.tl', 'a/b is a division, not a regex');
    t = await scopesOf('source.tl.readable', '⚠ E140 at column 14: expected an expression');
    assert.equal(t[0][1], 'invalid.illegal.banner.tl');
  });

  test('grammar (raw one-line source): terminators, sigils, unclosed strings', async () => {
    const t = await scopesOf('source.tl', 'fn f a|if a|^"yes<x a+1|print"hi $x|!Bad"no');
    assert.equal(find(t, 'fn'), 'storage.type.function.tl');
    assert.equal(find(t, '|'), 'punctuation.terminator.segment.tl');
    assert.equal(find(t, '<'), 'punctuation.terminator.segment.tl');
    assert.equal(find(t, '^'), 'keyword.control.sigil.tl');
    assert.equal(find(t, '!'), 'keyword.control.sigil.tl');
    assert.equal(find(t, 'yes'), 'string.quoted.double.tl');
    assert.equal(t[t.findIndex((x) => x[0] === 'yes') + 1][0], '<', 'an unclosed string ends at the terminator');
    assert.equal(find(t, '$x'), 'variable.other.interpolated.tl');
  });
}

(async () => {
  await grammars();
  let failed = 0;
  for (const { name, fn } of results) {
    try { await fn(); console.log(`  ok   ${name}`); } catch (e) { failed++; console.log(`  FAIL ${name}\n       ${String(e.message).split('\n').join('\n       ')}`); }
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
