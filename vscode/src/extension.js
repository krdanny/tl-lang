// TL Readable View: .tl files are one line for the LLM; people read this rendering instead.
// The rendering is a virtual document (scheme `tl-readable`), so it is read-only by construction and still gets
// the native editor: find, folding, outline, minimap, themes.

import * as vscode from 'vscode';
import fs from 'node:fs';
import { render, clearCache } from './render.js';
import { GLOSSARY, glossaryKeyAt } from './glossary.js';

const SCHEME = 'tl-readable';
const SUFFIX = '.view';

const toReadable = (uri) => uri.with({ scheme: SCHEME, path: uri.path + SUFFIX });
const toSource = (uri) => uri.with({ scheme: 'file', path: uri.path.slice(0, -SUFFIX.length) });
const isSource = (uri) => !!uri && uri.scheme === 'file' && uri.path.endsWith('.tl');
const isReadable = (uri) => !!uri && uri.scheme === SCHEME;
const config = () => vscode.workspace.getConfiguration('tl');

/** Raw documents the user asked to see: these are not swapped for the readable view. */
const rawWanted = new Set();
/** Raw documents the user unlocked for editing. */
const unlocked = new Set();
/** Raw documents this session already locked. */
const locked = new Set();

function sourceText(uri) {
  const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  if (open) return open.getText();
  return fs.readFileSync(uri.fsPath, 'utf8');
}

function renderFor(sourceUri) {
  const c = config();
  return render(sourceText(sourceUri), sourceUri.fsPath, {
    keywords: c.get('readable.keywords', true),
    longNames: c.get('readable.longNames', true),
    indent: ' '.repeat(c.get('readable.indent', 4)),
    width: c.get('readable.wrapWidth', 100),
  });
}

class ReadableProvider {
  constructor() {
    this.emitter = new vscode.EventEmitter();
    this.onDidChange = this.emitter.event;
  }

  provideTextDocumentContent(uri) {
    try {
      return renderFor(toSource(uri)).text;
    } catch (e) {
      return `⚠ cannot show ${toSource(uri).fsPath}: ${e.message}`;
    }
  }

  refresh(sourceUri) { this.emitter.fire(toReadable(sourceUri)); }

  refreshAll() {
    clearCache();
    for (const d of vscode.workspace.textDocuments) if (isReadable(d.uri)) this.emitter.fire(d.uri);
  }
}

const SYMBOL_KINDS = { function: 'Function', class: 'Class', error: 'Event', constant: 'Constant', test: 'Method', impl: 'Namespace', method: 'Method', property: 'Property' };

function toSymbol(s, doc) {
  const last = Math.min(s.endLine, doc.lineCount - 1);
  const range = new vscode.Range(s.line, 0, last, doc.lineAt(last).text.length);
  const selection = new vscode.Range(s.line, 0, s.line, doc.lineAt(Math.min(s.line, doc.lineCount - 1)).text.length);
  const sym = new vscode.DocumentSymbol(s.name || '?', '', vscode.SymbolKind[SYMBOL_KINDS[s.kind] || 'Variable'], range, selection);
  sym.children = s.children.map((c) => toSymbol(c, doc));
  return sym;
}

/** The readable line that shows the source offset, and the other way round. */
function lineForOffset(lines, offset) {
  let best = lines[0];
  for (const l of lines) if (l.start <= offset) best = l; else break;
  return best ? best.line : 0;
}
function offsetForLine(lines, line) {
  let best = lines[0];
  for (const l of lines) if (l.line <= line) best = l; else break;
  const next = lines[lines.indexOf(best) + 1];
  return best ? { start: best.start, end: next ? next.start : undefined } : { start: 0 };
}

function tabsFor(uri) {
  const out = [];
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uri.toString()) out.push(tab);
    }
  }
  return out;
}

export function activate(context) {
  const provider = new ReadableProvider();
  const diagnostics = vscode.languages.createDiagnosticCollection('tl');
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  status.command = 'tl.openSource';
  const sub = (d) => context.subscriptions.push(d);
  sub(diagnostics);
  sub(status);
  sub(vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider));

  // ── showing documents ──
  async function showReadable(sourceUri, { viewColumn, offset, replace, preview = false } = {}) {
    const doc = await vscode.workspace.openTextDocument(toReadable(sourceUri));
    if (doc.languageId !== 'tl-readable') await vscode.languages.setTextDocumentLanguage(doc, 'tl-readable');
    const editor = await vscode.window.showTextDocument(doc, { viewColumn, preview });
    if (typeof offset === 'number') {
      const line = Math.min(lineForOffset(renderFor(sourceUri).lines, offset), doc.lineCount - 1);
      const pos = new vscode.Position(line, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
    if (replace) {
      const tabs = tabsFor(sourceUri).filter((t) => !t.isDirty);
      if (tabs.length) await vscode.window.tabGroups.close(tabs, true);
    }
    return editor;
  }

  async function showSource(sourceUri, { viewColumn, range } = {}) {
    rawWanted.add(sourceUri.toString());
    const doc = await vscode.workspace.openTextDocument(sourceUri);
    const editor = await vscode.window.showTextDocument(doc, { viewColumn, preview: false });
    if (range) {
      const end = range.end === undefined ? doc.lineAt(0).text.length : range.end;
      editor.selection = new vscode.Selection(new vscode.Position(0, range.start), new vscode.Position(0, end));
      editor.revealRange(editor.selection, vscode.TextEditorRevealType.InCenter);
    }
    await lock(editor);
    return editor;
  }

  /** Raw TL is written by the model; opened by a person it is read-only unless they ask otherwise. */
  async function lock(editor) {
    const key = editor.document.uri.toString();
    if (!config().get('lockSource', true) || unlocked.has(key) || locked.has(key)) return;
    if (vscode.window.activeTextEditor !== editor) return;
    locked.add(key);
    await vscode.commands.executeCommand('workbench.action.files.setActiveEditorReadonlyInSession');
  }

  // ── opening a .tl file shows the readable view ──
  let redirecting = false;
  async function onActiveEditor(editor) {
    updateStatus(editor);
    if (!editor || redirecting) return;
    const uri = editor.document.uri;
    if (!isSource(uri)) return;
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    const plainTab = tab && tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uri.toString();
    if (!plainTab) return; // diff editors, peek views, notebooks: leave them alone
    if (config().get('readable.openByDefault', true) && !rawWanted.has(uri.toString()) && !editor.document.isDirty) {
      redirecting = true;
      try {
        // a single click in the Explorer opens a preview tab: the readable view takes its place as one too
        await showReadable(uri, { viewColumn: editor.viewColumn, offset: editor.selection.active.character, replace: true, preview: !!tab.isPreview });
      } finally { redirecting = false; }
      return;
    }
    await lock(editor);
  }

  function updateStatus(editor) {
    if (editor && isReadable(editor.document.uri)) {
      status.text = '$(lock) TL readable view';
      status.tooltip = 'Read-only rendering of the one-line TL source. Click to open the source.';
      status.show();
    } else status.hide();
  }

  // ── diagnostics ──
  function check(sourceUri) {
    if (!config().get('diagnostics', true)) { diagnostics.delete(sourceUri); return; }
    let r;
    try { r = renderFor(sourceUri); } catch { diagnostics.delete(sourceUri); return; }
    if (!r.error) { diagnostics.delete(sourceUri); diagnostics.delete(toReadable(sourceUri)); return; }
    const col = Math.max(0, r.error.col ?? 0);
    const message = `${r.error.code}: ${r.error.message}`;
    const d = new vscode.Diagnostic(new vscode.Range(0, col, 0, col + 1), message, vscode.DiagnosticSeverity.Error);
    d.source = 'tl';
    diagnostics.set(sourceUri, [d]);
    const banner = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 200), message, vscode.DiagnosticSeverity.Error);
    banner.source = 'tl';
    diagnostics.set(toReadable(sourceUri), [banner]);
  }

  const timers = new Map();
  function changed(sourceUri) {
    const key = sourceUri.toString();
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => { timers.delete(key); provider.refresh(sourceUri); check(sourceUri); }, 150));
  }

  // ── commands ──
  const sourceOf = (arg) => {
    const uri = arg instanceof vscode.Uri ? arg : vscode.window.activeTextEditor?.document.uri;
    if (isReadable(uri)) return toSource(uri);
    return isSource(uri) ? uri : null;
  };
  const cursorOffset = (uri) => {
    const e = vscode.window.activeTextEditor;
    return e && e.document.uri.toString() === uri.toString() ? e.selection.active.character : undefined;
  };

  sub(vscode.commands.registerCommand('tl.openReadable', async (arg) => {
    const uri = sourceOf(arg);
    if (!uri) return vscode.window.showInformationMessage('TL: open a .tl file first.');
    rawWanted.delete(uri.toString());
    return showReadable(uri, { viewColumn: vscode.window.activeTextEditor?.viewColumn, offset: cursorOffset(uri), replace: true });
  }));

  sub(vscode.commands.registerCommand('tl.openReadableToSide', async (arg) => {
    const uri = sourceOf(arg);
    if (!uri) return vscode.window.showInformationMessage('TL: open a .tl file first.');
    rawWanted.add(uri.toString()); // keep the source tab that is being compared
    return showReadable(uri, { viewColumn: vscode.ViewColumn.Beside, offset: cursorOffset(uri) });
  }));

  sub(vscode.commands.registerCommand('tl.openSource', async (arg) => {
    const uri = sourceOf(arg);
    if (!uri) return vscode.window.showInformationMessage('TL: no TL file is active.');
    return showSource(uri, { viewColumn: vscode.window.activeTextEditor?.viewColumn });
  }));

  sub(vscode.commands.registerCommand('tl.revealInSource', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isReadable(editor.document.uri)) return;
    const uri = toSource(editor.document.uri);
    const range = offsetForLine(renderFor(uri).lines, editor.selection.active.line);
    return showSource(uri, { viewColumn: vscode.ViewColumn.Beside, range });
  }));

  sub(vscode.commands.registerCommand('tl.unlockSource', async (arg) => {
    const uri = sourceOf(arg);
    if (!uri) return;
    unlocked.add(uri.toString());
    const editor = await showSource(uri, { viewColumn: vscode.window.activeTextEditor?.viewColumn });
    if (vscode.window.activeTextEditor === editor) await vscode.commands.executeCommand('workbench.action.files.setActiveEditorWriteableInSession');
  }));

  const toggle = (key, fallback) => async () => {
    const c = config();
    const target = vscode.workspace.workspaceFolders ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    await c.update(key, !c.get(key, fallback), target);
  };
  sub(vscode.commands.registerCommand('tl.toggleKeywords', toggle('readable.keywords', true)));
  sub(vscode.commands.registerCommand('tl.toggleLongNames', toggle('readable.longNames', true)));

  // ── language features of the readable view ──
  const selector = { scheme: SCHEME };
  sub(vscode.languages.registerDocumentSymbolProvider(selector, {
    provideDocumentSymbols(doc) {
      try { return renderFor(toSource(doc.uri)).symbols.map((s) => toSymbol(s, doc)); } catch { return []; }
    },
  }));

  sub(vscode.languages.registerHoverProvider([selector, { language: 'tl' }], {
    provideHover(doc, position) {
      const line = doc.lineAt(position.line).text;
      const hit = glossaryKeyAt(line, position.character);
      if (!hit || !GLOSSARY[hit.key]) return undefined;
      const md = new vscode.MarkdownString(GLOSSARY[hit.key]);
      return new vscode.Hover(md, new vscode.Range(position.line, hit.start, position.line, hit.end));
    },
  }));

  // ── keeping the view current ──
  sub(vscode.workspace.onDidChangeTextDocument((e) => { if (isSource(e.document.uri)) changed(e.document.uri); }));
  sub(vscode.workspace.onDidOpenTextDocument((d) => { if (isSource(d.uri)) check(d.uri); }));
  const isOpen = (uri) => vscode.workspace.textDocuments.some((d) => d.uri.toString() === uri.toString());
  sub(vscode.workspace.onDidCloseTextDocument((d) => {
    const key = d.uri.toString();
    if (isSource(d.uri)) { rawWanted.delete(key); locked.delete(key); }
    // a problem stays listed while the file is shown in either form
    const source = isReadable(d.uri) ? toSource(d.uri) : isSource(d.uri) ? d.uri : null;
    if (source && !isOpen(source) && !isOpen(toReadable(source))) { diagnostics.delete(source); diagnostics.delete(toReadable(source)); }
  }));
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.{tl,def}');
  const onFile = (uri) => { if (uri.path.endsWith('.tl')) changed(uri); else provider.refreshAll(); };
  sub(watcher);
  sub(watcher.onDidChange(onFile));
  sub(watcher.onDidCreate(onFile));
  sub(watcher.onDidDelete(onFile));
  sub(vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('tl')) provider.refreshAll(); }));
  sub(vscode.window.onDidChangeActiveTextEditor((e) => { onActiveEditor(e).catch((err) => console.error('tl-readable', err)); }));

  for (const d of vscode.workspace.textDocuments) if (isSource(d.uri)) check(d.uri);
  onActiveEditor(vscode.window.activeTextEditor).catch((err) => console.error('tl-readable', err));

  return { toReadable, toSource, provider }; // for tests
}

export function deactivate() {}
