// A small stand-in for the `vscode` API: enough to drive the extension's logic (documents, editors, tabs,
// providers, commands, configuration) without launching the editor.
'use strict';
const fs = require('node:fs');

class EventEmitter {
  constructor() { this.listeners = []; this.event = (fn) => { this.listeners.push(fn); return { dispose: () => { this.listeners = this.listeners.filter((x) => x !== fn); } }; }; }
  fire(v) { for (const fn of [...this.listeners]) fn(v); }
}

class Uri {
  constructor(scheme, path) { this.scheme = scheme; this.path = path; }
  static file(p) { return new Uri('file', p); }
  get fsPath() { return this.path; }
  with(change) { return new Uri(change.scheme ?? this.scheme, change.path ?? this.path); }
  toString() { return `${this.scheme}://${this.path}`; }
}
class Position { constructor(line, character) { this.line = line; this.character = character; } }
class Range {
  constructor(a, b, c, d) { if (a instanceof Position) { this.start = a; this.end = b; } else { this.start = new Position(a, b); this.end = new Position(c, d); } }
}
class Selection extends Range { constructor(a, b) { super(a, b); this.anchor = a; this.active = b; } }
class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } }
class DocumentSymbol { constructor(name, detail, kind, range, selectionRange) { Object.assign(this, { name, detail, kind, range, selectionRange, children: [] }); } }
class MarkdownString { constructor(value) { this.value = value; } }
class Hover { constructor(contents, range) { this.contents = contents; this.range = range; } }
class TabInputText { constructor(uri) { this.uri = uri; } }
class TabInputTextDiff { constructor(original, modified) { this.original = original; this.modified = modified; } }

const state = {
  config: {},              // 'readable.keywords' -> value
  providers: new Map(),    // scheme -> content provider
  commands: new Map(),
  executed: [],            // every executeCommand call
  symbolProviders: [],
  hoverProviders: [],
  diagnostics: new Map(),  // uri string -> Diagnostic[]
  statusItems: [],
  messages: [],
  watchers: [],
};

const onDidChangeActiveTextEditor = new EventEmitter();
const onDidChangeTextDocument = new EventEmitter();
const onDidOpenTextDocument = new EventEmitter();
const onDidCloseTextDocument = new EventEmitter();
const onDidChangeConfiguration = new EventEmitter();

function makeDocument(uri, text, languageId) {
  const doc = {
    uri, languageId, isDirty: false, _text: text,
    get fileName() { return uri.fsPath; },
    getText() { return this._text; },
    get lineCount() { return this._text.split('\n').length; },
    lineAt(i) { return { text: this._text.split('\n')[i] ?? '' }; },
  };
  return doc;
}

const workspace = {
  textDocuments: [],
  workspaceFolders: [{ uri: Uri.file('/') }],
  getConfiguration(section) {
    return {
      get: (key, def) => (`${section}.${key}` in state.config ? state.config[`${section}.${key}`] : def),
      update: async (key, value) => { state.config[`${section}.${key}`] = value; onDidChangeConfiguration.fire({ affectsConfiguration: (s) => s === section }); },
    };
  },
  registerTextDocumentContentProvider(scheme, provider) {
    state.providers.set(scheme, provider);
    provider.onDidChange?.((uri) => {
      const doc = workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
      if (doc) doc._text = provider.provideTextDocumentContent(uri);
    });
    return { dispose() {} };
  },
  async openTextDocument(uri) {
    const existing = workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    if (existing) return existing;
    let doc;
    if (uri.scheme === 'file') doc = makeDocument(uri, fs.readFileSync(uri.fsPath, 'utf8'), uri.path.endsWith('.tl') ? 'tl' : 'plaintext');
    else {
      const provider = state.providers.get(uri.scheme);
      if (!provider) throw new Error(`no provider for ${uri.scheme}`);
      doc = makeDocument(uri, provider.provideTextDocumentContent(uri), uri.path.endsWith('.tl.view') ? 'tl-readable' : 'plaintext');
    }
    workspace.textDocuments.push(doc);
    onDidOpenTextDocument.fire(doc);
    return doc;
  },
  createFileSystemWatcher() {
    const w = { change: new EventEmitter(), create: new EventEmitter(), del: new EventEmitter(), dispose() {} };
    w.onDidChange = w.change.event; w.onDidCreate = w.create.event; w.onDidDelete = w.del.event;
    state.watchers.push(w);
    return w;
  },
  onDidChangeTextDocument: onDidChangeTextDocument.event,
  onDidOpenTextDocument: onDidOpenTextDocument.event,
  onDidCloseTextDocument: onDidCloseTextDocument.event,
  onDidChangeConfiguration: onDidChangeConfiguration.event,
};

const group = { tabs: [], activeTab: null };
const window = {
  activeTextEditor: undefined,
  tabGroups: {
    all: [group],
    activeTabGroup: group,
    async close(tabs) {
      for (const tab of [].concat(tabs)) {
        group.tabs = group.tabs.filter((t) => t !== tab);
        const uri = tab.input.uri;
        if (uri && !group.tabs.some((t) => t.input.uri?.toString() === uri.toString())) {
          const doc = workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
          if (doc) { workspace.textDocuments.splice(workspace.textDocuments.indexOf(doc), 1); onDidCloseTextDocument.fire(doc); }
        }
      }
      return true;
    },
  },
  /** opts.asDiff: show the document inside a diff tab (what Source Control does). */
  async showTextDocument(doc, opts = {}) {
    let tab = group.tabs.find((t) => t.input instanceof TabInputText && t.input.uri.toString() === doc.uri.toString() && !opts.asDiff);
    if (!tab) {
      tab = { input: opts.asDiff ? new TabInputTextDiff(doc.uri, doc.uri) : new TabInputText(doc.uri), isDirty: doc.isDirty };
      group.tabs.push(tab);
    }
    group.activeTab = tab;
    const editor = { document: doc, viewColumn: opts.viewColumn ?? 1, selection: new Selection(new Position(0, 0), new Position(0, 0)), revealed: null, revealRange(r) { this.revealed = r; } };
    window.activeTextEditor = editor;
    onDidChangeActiveTextEditor.fire(editor);
    await new Promise((r) => setImmediate(r)); // let listeners (the redirect) run, as the real editor does asynchronously
    return editor;
  },
  createStatusBarItem() { const item = { text: '', visible: false, show() { this.visible = true; }, hide() { this.visible = false; }, dispose() {} }; state.statusItems.push(item); return item; },
  showInformationMessage(m) { state.messages.push(m); return Promise.resolve(undefined); },
  onDidChangeActiveTextEditor: onDidChangeActiveTextEditor.event,
};

const languages = {
  createDiagnosticCollection() {
    return { set: (uri, list) => state.diagnostics.set(uri.toString(), list), delete: (uri) => state.diagnostics.delete(uri.toString()), dispose() {} };
  },
  registerDocumentSymbolProvider(selector, provider) { state.symbolProviders.push(provider); return { dispose() {} }; },
  registerHoverProvider(selector, provider) { state.hoverProviders.push(provider); return { dispose() {} }; },
  async setTextDocumentLanguage(doc, id) { doc.languageId = id; return doc; },
};

const commands = {
  registerCommand(id, fn) { state.commands.set(id, fn); return { dispose() {} }; },
  async executeCommand(id, ...args) {
    state.executed.push(id);
    const fn = state.commands.get(id);
    return fn ? fn(...args) : undefined;
  },
};

module.exports = {
  EventEmitter, Uri, Position, Range, Selection, Diagnostic, DocumentSymbol, MarkdownString, Hover, TabInputText, TabInputTextDiff,
  DiagnosticSeverity: { Error: 0, Warning: 1 },
  SymbolKind: { Function: 11, Class: 4, Event: 23, Constant: 13, Method: 5, Namespace: 2, Property: 6, Variable: 12 },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ViewColumn: { Active: -1, Beside: -2, One: 1, Two: 2 },
  ConfigurationTarget: { Global: 1, Workspace: 2 },
  TextEditorRevealType: { InCenter: 1, InCenterIfOutsideViewport: 2 },
  workspace, window, languages, commands,
  __state: state,
  __events: { onDidChangeTextDocument, onDidChangeActiveTextEditor },
};
