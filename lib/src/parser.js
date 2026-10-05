// TL parser: tokens -> AST, following the structural grammar of spec §7–§9.
//  - `|` ends a segment or enters a body, `<` exits one scope, `;` ends a bodyless declaration, EOF closes all.
//  - Delimiters close implicitly at a segment terminator (Minimal Closure, R-7.5).
//  - Calls have no parentheses: the callee's arity decides how many operands it takes (R-9.1).
//  - Binding vs call and glued `[` are decided with the symbol table (R-11.1, R-6.7).

import { lex, WORD_OPS } from './lexer.js';
import { TLError } from './errors.js';
import { isCompound, BUILTIN_NAMES } from './names.js';
import { PRELUDE, PIPELINE, STD, METHODS, KEYWORDS, PRIMITIVE_TYPES, JS_RESERVED, HTTP_ERRORS, JS_GLOBALS } from './prelude.js';

const TERM = new Set(['|', '<', ';', 'eof']);
// Tight binary operators, higher binds tighter (spec §8.2 levels 3–9).
const BINARY = {
  '??': 2, '==': 3, '!=': 3, '>': 3, '>=': 3, '..': 4, '..=': 4,
  '+': 5, '-': 5, '+%': 5, '-%': 5, '*': 6, '/': 6, '//': 6, '%': 6, '*%': 6, '**': 7,
};
const RIGHT_ASSOC = new Set(['**', '??']);
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '//=', '%=', '**=']);
const NOT_OPERAND_WORDS = new Set([...WORD_OPS, 'elif', 'else', 'catch', 'finally', 'as', 'own']);
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const EXPR_KEYWORDS = new Set(['if', 'match', 'do', 'try', 'loop', 'for', 'with', 'unsafe', 'true', 'false', 'none', 'self', 'await', 'move', 'async', 'not']);

export function safeJs(name) {
  return JS_RESERVED.has(name) ? `${name}$` : name;
}

export class Parser {
  /**
   * @param {string} src   one-line TL source
   * @param {string} file  module name for diagnostics
   * @param {object} env   { defs: Map, fields: Map, moduleExports(name), prepass }
   */
  constructor(src, file, env) {
    this.src = src;
    this.file = file;
    this.env = env;
    this.compound = null; // first compound name written in the source (reported by parseProgram)
    this.toks = this.named(lex(src, file));
    this.p = 0;
    this.implicit = []; // closers the source leaves out before a terminator (Minimal Closure), for the readable view
    this.interp = 0;
    this.scopes = [new Map()];
    this.fnStack = [];
    this.segments = [];
    this.depth = 0;
    this.shadow = 0;
    this.decls = { fns: new Map(), types: new Map(), variants: new Map(), errors: new Map(), traits: new Map(), methods: new Map() };
    this.installGlobals();
  }

  // ───────────────────────── symbols ─────────────────────────
  installGlobals() {
    const g = this.scopes[0];
    for (const [name, arity] of Object.entries(PRELUDE)) g.set(name, { kind: 'builtin', arity, js: `$.${name}` });
    for (const name of Object.keys(STD)) g.set(name, { kind: 'mod', std: true, js: `$.std.${name}`, members: STD[name] });
    for (const [name, arity] of Object.entries(HTTP_ERRORS)) g.set(name, { kind: 'error', js: `$.${name}`, arity, fields: arity ? ['msg'] : [], builtin: true });
    for (const name of JS_GLOBALS) g.set(name, { kind: 'jsval', js: name, global: true });
    for (const [sym, e] of this.env.defs) g.set(sym, defSymbol(sym, e));
    const pre = this.env.prepass;
    if (pre) {
      for (const [n, v] of pre.types) g.set(n, v);
      for (const [n, v] of pre.errors) g.set(n, v);
      for (const [n, v] of pre.traits) g.set(n, v);
      for (const [n, v] of pre.variants) if (!g.has(n) || g.get(n).kind === 'builtin') g.set(n, v);
      for (const [n, v] of pre.fns) g.set(n, v);
    }
  }

  /**
   * The dictionary rule: a symbol from tl.def stands for its long name, and a compound name may not be written
   * in the source at all (it costs several tokens each time): it gets a symbol in tl.def.
   */
  named(toks) {
    const aliases = this.env.aliases;
    for (const t of toks) {
      if (t.t !== 'id') continue;
      const long = aliases && aliases.get(t.v);
      if (long) { t.short = t.v; t.v = long; continue; }
      if (!this.compound && isCompound(t.v) && !BUILTIN_NAMES.has(t.v)) this.compound = t;
    }
    return toks;
  }

  lookup(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) if (this.scopes[i].has(name)) return this.scopes[i].get(name);
    return null;
  }

  declare(name, info) {
    const scope = this.scopes[this.scopes.length - 1];
    let js = info.js || safeJs(name);
    if (scope.has(name) && !['builtin', 'mod'].includes(scope.get(name).kind)) js = `${safeJs(name)}$${++this.shadow}`;
    const sym = { ...info, js };
    scope.set(name, sym);
    return sym;
  }

  push() { this.scopes.push(new Map()); }
  pop() { this.scopes.pop(); }
  curFn() { return this.fnStack[this.fnStack.length - 1] || null; }
  outerFn() { for (let i = this.fnStack.length - 1; i >= 0; i--) if (!this.fnStack[i].lambda) return this.fnStack[i]; return null; }

  // ───────────────────────── tokens ─────────────────────────
  peek(k = 0) { return this.toks[Math.min(this.p + k, this.toks.length - 1)]; }
  next() { return this.toks[this.p++]; }
  prev() { return this.toks[this.p - 1]; }
  isOp(v, k = 0) { const t = this.peek(k); return t.t === 'op' && t.v === v; }
  isId(v, k = 0) { const t = this.peek(k); return t.t === 'id' && t.v === v; }
  isTerm(k = 0) { return TERM.has(this.peek(k).t); }
  glued(k = 0) { return !this.peek(k).sp; }
  err(code, msg, tok = this.peek(), fixes = []) { return new TLError(code, msg, this.file, tok.pos, fixes); }
  expectOp(v) {
    if (!this.isOp(v)) throw this.err('E101', `expected '${v}' but found ${describe(this.peek())}`);
    return this.next();
  }
  expectId() {
    const t = this.peek();
    if (t.t !== 'id') throw this.err('E102', `expected a name but found ${describe(t)}`);
    return this.next().v;
  }
  /** Closing delimiter: required only when more content follows in the segment (R-7.5). */
  close(v, what) {
    if (this.isOp(v)) { this.next(); return; }
    if (this.isTerm()) { if (!this.interp) this.implicit.push({ pos: this.peek().pos, ch: v }); return; }
    throw this.err('E103', `unclosed ${what}: expected '${v}' before ${describe(this.peek())}`, this.peek(), [`insert:${v}`]);
  }
  closedByLt() { const t = this.prev(); return !!t && t.t === '<'; }

  // ───────────────────────── bodies ─────────────────────────
  parseProgram() {
    if (this.compound) {
      const t = this.compound;
      throw this.err('E261', `'${t.v}' is a compound name: give it a short symbol in tl.def ('<symbol> ${t.v}') and write the symbol here ('tl def' does both)`, t, ['tl def']);
    }
    const implicit = [];
    if (this.env.prelude) {
      const node = { k: 'Import', kind: 'path', path: [this.env.prelude], items: null, star: true, pos: 0, implicit: true };
      this.bindImport(node);
      implicit.push(node);
    }
    const body = this.parseBody(true);
    return { k: 'Program', body: [...implicit, ...body], decls: this.decls };
  }

  /** Segments until a `<` (consumed) or EOF. */
  parseBody(top = false) {
    const stmts = [];
    this.depth++;
    try {
      for (;;) {
        const t = this.peek();
        if (t.t === 'eof') return stmts;
        if (t.t === '<') {
          if (top) throw this.err('E104', "'<' at top level has no scope to exit", t, ['remove:<']);
          this.next();
          return stmts;
        }
        if (t.t === '|' || t.t === ';') throw this.err('E105', 'empty segment', t);
        const start = t.pos;
        const s = this.parseSegment();
        this.segments.push({ start, end: this.prev().end, depth: this.depth - 1 });
        if (s) stmts.push(s);
        const after = this.peek();
        if (this.closedByLt() && after.t !== '|' && after.t !== ';') continue;
        if (after.t === '|' || after.t === ';') {
          this.next();
          if ((this.peek().t === 'eof' || this.peek().t === '<') && after.t === '|') throw this.err('E105', 'empty segment', this.peek());
          continue;
        }
        if (after.t === '<' || after.t === 'eof') continue;
        throw this.err('E106', `expected '|' or '<' but found ${describe(after)}`, after, ['insert:|']);
      }
    } finally {
      this.depth--;
    }
  }

  requireBody(what) {
    if (this.peek().t !== '|') throw this.err('E107', `${what} needs a body: expected '|' but found ${describe(this.peek())}`, this.peek(), ['insert:|']);
    this.next();
    return this.parseBody();
  }

  /** Body of a declaration (type/trait/impl/ext): items separated like segments. */
  parseDeclBody(parseItem) {
    if (this.peek().t !== '|') return [];
    this.next();
    const items = [];
    this.depth++;
    try {
      for (;;) {
        const t = this.peek();
        if (t.t === 'eof') break;
        if (t.t === '<') { this.next(); break; }
        const start = t.pos;
        const item = parseItem();
        this.segments.push({ start, end: this.prev().end, depth: this.depth - 1 });
        if (item) items.push(item);
        const after = this.peek();
        if (this.closedByLt() && after.t !== '|' && after.t !== ';') continue;
        if (after.t === '|' || after.t === ';') { this.next(); continue; }
        if (after.t === '<' || after.t === 'eof') continue;
        throw this.err('E106', `expected '|' or '<' but found ${describe(after)}`, after);
      }
    } finally {
      this.depth--;
    }
    return items;
  }

  // ───────────────────────── segments ─────────────────────────
  parseSegment() {
    const attrs = [];
    while (this.isOp('@')) {
      this.next();
      const name = this.expectId();
      const args = [];
      while (!this.isTerm() && !this.isOp('@') && !(this.peek().t === 'id' && ['fn', 'gen', 'async', 'type', 'impl', 'mod', 'trait', 'ext', 'test'].includes(this.peek().v))) args.push(this.next().v);
      attrs.push({ name, args });
    }
    const t = this.peek();
    let s;
    if (t.t === 'op' && t.v === '+') s = this.parseImport();
    else if (t.t === 'op' && t.v === '^') { this.next(); s = { k: 'Return', value: this.isTerm() ? null : this.parseExpr(), pos: t.pos }; }
    else if (t.t === 'op' && t.v === '!' && !this.isOp('=', 1)) { this.next(); this.markRaise(); s = { k: 'Raise', value: this.parseApp(), pos: t.pos }; }
    else if (t.t === 'label') {
      this.next();
      s = this.parseSegment();
      if (!s || !['For', 'While', 'Loop', 'Repeat', 'Block', 'DoWhile'].includes(s.k)) throw this.err('E108', 'a label must precede a loop or do block', t);
      s.label = t.v;
    } else if (t.t === 'id' && (KEYWORDS.has(t.v) || t.v === 'scope')) {
      s = this.parseKeywordSegment(t);
      if (s === undefined) s = this.parseSimpleSegment();
    } else if (t.t === 'id' && /^(GET|POST|PUT|PATCH|DELETE)$/.test(t.v) && this.isOp('/', 1)) {
      throw this.err('E901', 'HTTP route segments are not supported by TL/JS 0.1 yet', t);
    } else s = this.parseSimpleSegment();
    if (s && attrs.length) s.attrs = attrs;
    return s;
  }

  parseKeywordSegment(t) {
    switch (t.v) {
      case 'fn': case 'gen': return this.parseFn(false);
      case 'async': return this.isId('fn', 1) || this.isId('gen', 1) ? this.parseFn(false) : undefined;
      case 'type': return this.parseTypeDecl();
      case 'alias': this.next(); this.expectId(); if (this.isOp('[') && this.glued()) this.skipBrackets(); this.parseTypeExpr(); return null;
      case 'trait': return this.parseTrait();
      case 'impl': return this.parseImpl();
      case 'ext': return this.parseExt();
      case 'error': return this.parseErrorDecl();
      case 'mod': return this.parseMod();
      case 'const': case 'static': case 'let': case 'var': return this.parseDeclBinding();
      case 'if': {
        this.next();
        const cond = this.parseExpr();
        if (this.peek().t !== '|' && !this.isTerm() && startsOperand(this.peek(), this.peek().sp)) {
          const a = this.parseTight();
          const b = this.parseTight();
          return { k: 'ExprStmt', expr: { k: 'Cond', cond, a, b }, pos: t.pos };
        }
        return this.parseIfRest(cond, false);
      }
      case 'match': this.next(); return this.parseMatchRest(false);
      case 'guard': {
        this.next();
        const cond = this.parseExpr();
        // without `is` bindings to keep visible afterwards, `guard c` is `if not c` (with elif/else, inline form, value)
        if (!JSON.stringify(cond, (k, v) => (k === 'sym' ? undefined : v)).includes('"k":"Is"')) {
          const neg = { k: 'Not', expr: cond };
          if (this.peek().t !== '|' && !this.isTerm() && startsOperand(this.peek(), this.peek().sp)) {
            const a = this.parseTight();
            const b = this.parseTight();
            return { k: 'ExprStmt', expr: { k: 'Cond', cond: neg, a, b }, pos: t.pos };
          }
          return this.parseIfRest(neg, false);
        }
        this.push();
        const body = this.requireBody('guard');
        this.pop();
        return { k: 'Guard', cond, body, pos: t.pos };
      }
      case 'while': return this.parseWhile();
      case 'for': return this.parseFor(false);
      case 'loop': return this.parseLoop(false);
      case 'repeat': return this.parseRepeat();
      case 'do': return this.parseDo(false);
      case 'unsafe': return this.isOp('|', 1) || this.peek(1).t === '|' ? this.parseDo(false) : undefined;
      case 'try': return this.parseTry(false);
      case 'with': return this.parseWith(false);
      case 'scope': {
        if (!(this.peek(1).t === 'id' && this.peek(1).sp && this.peek(2).t === '|')) return undefined;
        this.next();
        this.push();
        const name = this.declare(this.next().v, { kind: 'var' }).js;
        const body = this.requireBody('scope');
        this.pop();
        this.markAsync();
        return { k: 'Scope', name, body, pos: t.pos };
      }
      case 'defer': case 'errdefer': this.next(); return { k: 'Defer', err: t.v === 'errdefer', expr: this.parseExpr(), pos: t.pos };
      case 'break': {
        this.next();
        const label = this.peek().t === 'label' ? this.next().v : null;
        const value = this.isTerm() ? null : this.parseExpr();
        return { k: 'Break', label, value, pos: t.pos };
      }
      case 'continue': {
        this.next();
        const label = this.peek().t === 'label' ? this.next().v : null;
        return { k: 'Continue', label, pos: t.pos };
      }
      case 'yield': {
        this.next();
        const f = this.curFn();
        if (f) f.gen = true;
        if (this.isOp('..')) { this.next(); return { k: 'Yield', from: true, value: this.parseExpr() }; }
        return { k: 'Yield', value: this.isTerm() ? null : this.parseExpr() };
      }
      case 'pass': this.next(); return null;
      case 'test': return this.parseTest();
      case 'requires': case 'ensures': this.next(); return { k: 'Contract', kind: t.v, cond: this.parseExpr(), pos: t.pos };
      case 'elif': case 'else': case 'catch': case 'finally':
        throw this.err('E109', `'${t.v}' must directly follow the '<' that closes the construct it continues (R-7.7)`, t);
      default:
        if (EXPR_KEYWORDS.has(t.v)) return undefined;
        throw this.err('E901', `'${t.v}' is not supported by TL/JS 0.1 yet`, t);
    }
  }

  parseSimpleSegment() {
    const t = this.peek();
    const bind = this.tryBindingPattern();
    if (bind) {
      const valuePos = this.peek().pos;
      const value = this.parseExpr();
      const pat = this.declarePattern(bind.pat, fnValueInfo(value));
      return { k: 'Let', pat, ann: bind.ann, value, pos: t.pos, valuePos };
    }
    const expr = this.parseExpr();
    const op = this.peek();
    if (op.t === 'op' && ASSIGN_OPS.has(op.v)) {
      if (op.sp || this.peek(1).sp) throw this.err('E004', `space next to operator '${op.v}'`, op, [`join:${op.v}`]);
      this.next();
      if (!isPlace(expr)) throw this.err('E120', 'the left side of an assignment must be a variable, field, index or deref', t);
      const value = this.parseExpr();
      if (expr.k === 'Ident' && expr.sym) expr.sym.mutable = true;
      return { k: 'Assign', target: expr, op: op.v, value, pos: op.pos };
    }
    return { k: 'ExprStmt', expr, pos: t.pos };
  }

  /** R-11.1: `S E` is a binding when S is not callable. Consumes the pattern when it is. */
  tryBindingPattern() {
    const t = this.peek();
    const save = this.p;
    const mark = this.implicit.length;
    const upper = t.t === 'id' && /^[A-Z]/.test(t.v);
    const destructure = (t.t === 'id' && this.isOp(',', 1) && this.glued(1))
      || (t.t === 'op' && (t.v === '[' || t.v === '('))
      || (upper && this.isOp('{', 1) && this.glued(1) && ['type', 'variant'].includes(this.lookup(t.v)?.kind));
    if (destructure) {
      try {
        const pat = this.parsePattern({ binding: true });
        if (!this.isTerm() && startsOperand(this.peek(), this.peek().sp)) return { pat, ann: null }; // `(a).f x` is a call, not a destructuring
      } catch (e) {
        if (!(e instanceof TLError)) throw e;
      }
      this.p = save;
      this.implicit.length = mark;
      return null;
    }
    if (t.t !== 'id' || KEYWORDS.has(t.v) || t.v === '_' || upper) return null;
    const n = this.peek(1);
    if (n.t === 'op' && n.v === ':' && !n.sp) {
      const name = this.next().v;
      this.next();
      const ann = this.parseTypeExpr();
      if (this.isTerm()) throw this.err('E121', `binding '${name}' needs a value after its type`);
      return { pat: { k: 'PBind', name }, ann };
    }
    const prefixWord = n.t === 'id' && (n.v === 'not' || n.v === 'bnot'); // `ok not a or b` binds a negation
    if (TERM.has(n.t) || (!startsOperand(n, false) && !prefixWord)) return null;
    const info = this.lookup(t.v);
    if (info && isCallableSym(info)) return null;
    if (info && ['mod', 'type', 'variant', 'error', 'trait'].includes(info.kind)) return null;
    if (!info && /^[A-Z]/.test(t.v)) return null;
    if (n.t === 'op' && n.v === '[' && !n.sp && info) return null; // indexing an existing value (R-6.7)
    if (n.t === 'op' && n.v === '(' && !n.sp && info && info.kind === 'jsval') return null;
    this.next();
    return { pat: { k: 'PBind', name: t.v }, ann: null };
  }

  declarePattern(pat, info = { kind: 'var' }) {
    switch (pat.k) {
      case 'PBind': { const s = this.declare(pat.name, info); return { ...pat, js: s.js }; }
      case 'PTuple': case 'PSlice': return { ...pat, items: pat.items.map((p) => this.declarePattern(p)) };
      case 'PRest': return pat.name ? { ...pat, js: this.declare(pat.name, { kind: 'var' }).js } : pat;
      case 'PRecord': return { ...pat, fields: pat.fields.map((f) => ({ ...f, pat: this.declarePattern(f.pat) })) };
      case 'PCtor': return { ...pat, args: pat.args.map((p) => this.declarePattern(p)) };
      case 'PType': return pat.bind ? { ...pat, js: this.declare(pat.bind, { kind: 'var' }).js } : pat;
      case 'PRoute': return { ...pat, segs: pat.segs.map((s) => (s.param ? { ...s, js: this.declare(s.param, { kind: 'var' }).js } : s)) };
      case 'PAs': return { ...pat, pat: this.declarePattern(pat.pat), js: this.declare(pat.name, { kind: 'var' }).js };
      case 'POr': {
        const first = this.declarePattern(pat.alts[0]);
        return { ...pat, alts: [first, ...pat.alts.slice(1).map((p) => this.rebindPattern(p))] };
      }
      default: return pat;
    }
  }

  rebindPattern(pat) {
    switch (pat.k) {
      case 'PBind': return { ...pat, js: this.lookup(pat.name)?.js || safeJs(pat.name) };
      case 'PTuple': case 'PSlice': return { ...pat, items: pat.items.map((p) => this.rebindPattern(p)) };
      case 'PCtor': return { ...pat, args: pat.args.map((p) => this.rebindPattern(p)) };
      case 'PRecord': return { ...pat, fields: pat.fields.map((f) => ({ ...f, pat: this.rebindPattern(f.pat) })) };
      case 'PType': return pat.bind ? { ...pat, js: this.lookup(pat.bind)?.js } : pat;
      default: return pat;
    }
  }

  parseDeclBinding() {
    const kw = this.next().v;
    const pat = kw === 'let' || kw === 'var' ? this.parsePattern({ binding: true }) : { k: 'PBind', name: this.expectId() };
    let ann = null;
    if (this.isOp(':') && this.glued()) { this.next(); ann = this.parseTypeExpr(); }
    const valuePos = this.peek().pos;
    const value = this.parseExpr();
    const info = fnValueInfo(value, { kind: kw === 'const' ? 'const' : 'var', mutable: kw === 'var' || kw === 'static' });
    return { k: 'Let', pat: this.declarePattern(pat, info), ann, value, decl: kw, pos: this.prev().pos, valuePos };
  }

  // ───────────────────────── imports (§46.4) ─────────────────────────
  parseImport() {
    const t = this.next();
    let node;
    if (this.peek().t === 'str') node = { k: 'Import', kind: 'js', from: strText(this.next()), pos: t.pos };
    else {
      const path = [this.expectId()];
      let items = null, star = false;
      while (this.isOp('.') && this.glued()) {
        this.next();
        if (this.isOp('*')) { this.next(); star = true; break; }
        if (this.isOp('(')) {
          this.next();
          items = [];
          while (this.peek().t === 'id') items.push(this.next().v);
          this.close(')', 'import list');
          break;
        }
        path.push(this.expectId());
      }
      node = { k: 'Import', kind: 'path', path, items, star, pos: t.pos };
    }
    if (this.isOp(':') && this.glued()) { this.next(); node.alias = this.expectId(); }
    this.bindImport(node);
    return node;
  }

  bindImport(node) {
    const g = this.scopes[0];
    if (node.kind === 'js') {
      const base = node.from.replace(/^.*\//, '').replace(/\.[cm]?js$/, '').replace(/[^A-Za-z0-9_]/g, '_');
      const alias = node.alias || base;
      node.js = safeJs(alias);
      g.set(alias, { kind: 'jsval', js: node.js });
      return;
    }
    const [head, ...rest] = node.path;
    if (head === 'node' || head === 'npm') {
      node.from = head === 'node' ? `node:${rest.join('/')}` : rest.join('/');
      const alias = node.alias || rest[rest.length - 1];
      node.js = safeJs(alias);
      node.external = head;
      g.set(alias, { kind: 'jsval', js: node.js });
      return;
    }
    if (STD[head] && !rest.length) {
      node.std = true;
      if (node.alias) g.set(node.alias, g.get(head));
      return;
    }
    const defMod = this.env.defs.get(head);
    const modName = defMod && defMod.kind === 'mod' ? defMod.name : head;
    const exports = this.env.moduleExports ? this.env.moduleExports(modName, this.file) : null;
    if (!exports) throw this.err('E240', `cannot find module '${modName}' (no ${modName}.tl next to this file)`, this.prev());
    node.module = modName;
    if (node.star) {
      node.named = [];
      for (const [n, info] of exports) {
        if (!['fn', 'type', 'variant', 'error', 'const', 'trait'].includes(info.kind) || !info.js) continue;
        g.set(n, { ...info });
        node.named.push({ name: info.js, local: info.js });
      }
      return;
    }
    if (node.items || rest.length) {
      const names = node.items || [rest[rest.length - 1]];
      node.named = names.map((n) => {
        const info = exports.get(n);
        if (!info) throw this.err('E241', `module '${modName}' has no item '${n}'`);
        const local = node.items ? n : node.alias || n;
        const localJs = safeJs(local === n ? info.js : local);
        g.set(local, { ...info, js: localJs });
        return { name: info.js, local: localJs };
      });
    } else {
      const alias = node.alias || head;
      node.js = safeJs(alias);
      g.set(alias, { kind: 'mod', js: node.js, exports, module: modName });
    }
  }

  // ───────────────────────── declarations ─────────────────────────
  parseFn(isMethod) {
    const start = this.peek();
    let async = false, gen = false;
    if (this.isId('async')) { this.next(); async = true; }
    if (!isMethod) gen = this.next().v === 'gen';
    const name = this.expectId();
    if (this.isOp('[') && this.glued()) this.skipBrackets();
    const defEntry = this.env.defs.get(name);
    const outerSym = this.lookup(name);
    this.push();
    const rec = { name, async, gen, raises: false, usesOptQ: false, lambda: false };
    this.fnStack.push(rec);
    let self = false;
    const params = [];
    while (!this.isTerm() && !this.isOp('>') && !this.isOp('!')) {
      if (this.isId('self')) { this.next(); self = true; this.declare('self', { kind: 'var', js: 'self' }); continue; }
      if (this.isOp('&')) { this.next(); if (this.isId('mut')) this.next(); continue; }
      params.push(this.parseParam());
    }
    if (this.isOp('>')) { this.next(); this.parseTypeExpr(); }
    let errors = [];
    if (this.isOp('!')) { this.next(); errors = this.parseErrorSet(); }
    if (!params.length && defEntry?.params?.length) {
      for (const p of defEntry.params) {
        const s = this.declare(p.short, { kind: 'param', js: safeJs(p.long) });
        params.push({ pat: { k: 'PBind', name: p.short, js: s.js }, variadic: p.variadic, def: null });
      }
    }
    if (!errors.length && defEntry?.errors?.length) errors = defEntry.errors;
    if (defEntry?.async) rec.async = true;
    // methods are known to the body being parsed (`self.parse x`, `^Range raw o` inside `init`)
    if (isMethod) this.recordMethod({ name, params, self });
    let body = null;
    if (this.peek().t === '|') { this.next(); body = this.parseBody(); }
    this.fnStack.pop();
    this.pop();
    const js = defEntry?.kind === 'fn' ? safeJs(defEntry.name) : outerSym?.kind === 'fn' && !outerSym.local && this.scopes.length === 1 ? outerSym.js : safeJs(name);
    const erroring = errors.length > 0 || rec.raises;
    const node = { k: 'Fn', name, js, params, body, async: rec.async, gen: gen || rec.gen, self, errors, erroring, usesOptQ: rec.usesOptQ, method: isMethod, pos: start.pos };
    if (!isMethod) {
      const info = { kind: 'fn', arity: params.some((p) => p.variadic || p.def) ? -1 : params.length, params: params.map((p) => p.pat.name), js, erroring, async: node.async, defaults: params.some((p) => p.def) };
      this.scopes[this.scopes.length - 1].set(name, info);
      if (this.scopes.length === 1) this.decls.fns.set(name, info);
    }
    return node;
  }

  parseParam() {
    let variadic = false;
    if (this.isOp('..')) { this.next(); variadic = true; }
    const pat = this.parsePatAtom({ binding: true, noArgs: true });
    let def = null, ann = null;
    if (this.isOp(':') && this.glued()) { this.next(); ann = this.parseTypeExpr(); }
    if (this.isOp('=') && this.glued()) { this.next(); def = this.parseTight(); }
    return { pat: this.declarePattern(pat, { kind: 'param' }), variadic, def, ann };
  }

  parseErrorSet() {
    if (this.isId('_')) { this.next(); return ['_']; }
    const errs = [this.expectId()];
    while (this.isOp(',') && this.glued()) { this.next(); errs.push(this.expectId()); }
    return errs;
  }

  skipBrackets() {
    let depth = 0;
    do {
      const t = this.next();
      if (t.t === 'op' && (t.v === '[' || t.v === '#[')) depth++;
      else if (t.t === 'op' && t.v === ']') depth--;
    } while (depth > 0 && !this.isTerm());
  }

  /** Type expressions are parsed for structure and then erased, as TypeScript does. */
  parseTypeExpr() {
    const t = this.peek();
    let s = '';
    if (this.isOp('&') || this.isOp('*')) {
      s += this.next().v;
      if (this.isId('mut')) { this.next(); s += 'mut '; }
      if (this.peek().t === 'label') s += `'${this.next().v} `;
      return s + this.parseTypeExpr();
    }
    if (this.isId('dyn') || this.isId('impl')) {
      s += `${this.next().v} ${this.parseTypeExpr()}`;
      while (this.isOp('+') && this.glued()) { this.next(); s += `+${this.parseTypeExpr()}`; }
      return s;
    }
    if (this.isId('fn') && this.isOp('(', 1) && this.glued(1)) {
      this.next(); this.next();
      const args = [];
      while (!this.isTerm() && !this.isOp(')')) args.push(this.parseTypeExpr());
      this.close(')', 'function type');
      s = `fn(${args.join(' ')})`;
      if (this.isOp('>') && this.glued()) { this.next(); s += `>${this.parseTypeExpr()}`; }
      if (this.isOp('!') && this.glued()) { this.next(); s += `!${this.parseErrorSet().join(',')}`; }
      return s;
    }
    if (t.t === 'op' && ['[', '#[', '{', '('].includes(t.v)) {
      const open = this.next().v;
      const closeCh = open === '{' ? '}' : open === '(' ? ')' : ']';
      const parts = [];
      while (!this.isTerm() && !this.isOp(closeCh)) {
        if (this.isOp(',') || this.isOp(':')) { parts.push(this.next().v); continue; }
        if (this.peek().t === 'num') { parts.push(` ${this.next().v.text}`); continue; }
        parts.push(this.parseTypeExpr());
      }
      if (this.isOp(closeCh)) this.next();
      s = open + parts.join('') + closeCh;
    } else if (t.t === 'id') {
      s = this.next().v;
      while (this.isOp('.') && this.glued() && this.peek(1).t === 'id') { this.next(); s += `.${this.next().v}`; }
      if (this.isOp('[') && this.glued()) { this.skipBrackets(); s += '[…]'; }
    } else {
      throw this.err('E130', `expected a type but found ${describe(t)}`);
    }
    if (this.isOp('?') && this.glued()) { this.next(); s += '?'; }
    return s;
  }

  // type Name[..]|fields-or-variants  |  type N(T,..)  |  type N;
  parseTypeDecl() {
    const start = this.next();
    const name = this.expectId();
    if (this.isOp('[') && this.glued()) this.skipBrackets();
    const defEntry = this.env.defs.get(name);
    // `type Command:EventEmitter|…`: the class extends a JavaScript class or another TL type
    let base = null;
    if (this.isOp(':') && this.glued()) { this.next(); base = this.parseTight(); }
    let tuple = null;
    if (this.isOp('(') && this.glued()) {
      this.next();
      tuple = [];
      while (!this.isTerm() && !this.isOp(')')) { tuple.push(this.parseTypeExpr()); if (this.isOp(',')) this.next(); }
      this.close(')', 'tuple struct');
    }
    const fields = [];
    const variants = [];
    this.parseDeclBody(() => {
      if (this.isOp('..')) {
        this.next();
        const f = this.expectId();
        this.parseTypeExpr();
        fields.push({ name: f, js: f, embed: true, def: null });
        return null;
      }
      const id = this.peek();
      if (id.t !== 'id') throw this.err('E131', `expected a field or variant but found ${describe(id)}`);
      this.next();
      if (/^[a-z_]/.test(id.v)) {
        this.parseTypeExpr();
        let def = null;
        if (this.isOp('=') && this.glued()) { this.next(); def = this.parseTight(); }
        const long = defEntry?.fields?.find((f) => f.short === id.v)?.long;
        fields.push({ name: id.v, js: long || id.v, def });
        return null;
      }
      const v = { name: id.v, arity: 0, named: null, value: null };
      if (this.isOp('{') && this.glued()) {
        this.next();
        v.named = [];
        while (!this.isTerm() && !this.isOp('}')) { v.named.push(this.expectId()); this.parseTypeExpr(); }
        this.close('}', 'variant fields');
      } else if (this.isOp('=') && this.glued()) {
        this.next();
        v.value = this.parseTight();
      } else {
        while (!this.isTerm() && (this.peek().sp || [']', ')', '}'].includes(this.prev().v)) && (this.peek().t === 'id' || this.isOp('[') || this.isOp('(') || this.isOp('&') || this.isOp('{'))) { this.parseTypeExpr(); v.arity++; }
      }
      variants.push(v);
      return null;
    });
    if (fields.length && variants.length) throw this.err('E221', `type '${name}' mixes fields and variants`, start);
    const js = safeJs(name);
    const canonical = defEntry?.kind === 'type' ? defEntry.name : name;
    const node = { k: 'TypeDecl', name, js, canonical, fields, variants, tuple, base, pos: start.pos };
    if (!fields.length && !variants.length && !tuple && defEntry?.fields) {
      node.fields = defEntry.fields.map((f) => ({ name: f.short, js: f.long, defText: f.default }));
    }
    const info = { kind: 'type', js, fields: node.fields, tuple: tuple ? tuple.length : 0, arity: tuple ? tuple.length : 0, variants: variants.map((v) => v.name), canonical };
    const pre = this.env.prepass?.types.get(name);
    if (pre?.init) info.init = pre.init; // an `init` seen in an earlier pass makes the type callable before its impl
    this.scopes[0].set(name, info);
    this.decls.types.set(name, info);
    for (const v of variants) {
      const vi = { kind: 'variant', js: `${js}.${v.name}`, arity: v.arity, named: v.named, enumJs: js, name: v.name };
      if (!this.scopes[0].has(v.name) || ['builtin', 'variant'].includes(this.scopes[0].get(v.name).kind)) this.scopes[0].set(v.name, vi);
      this.decls.variants.set(v.name, vi);
    }
    return node;
  }

  parseErrorDecl() {
    const start = this.next();
    const name = this.expectId();
    const fields = [];
    let doc = null;
    while (!this.isTerm()) {
      if (this.peek().t === 'str') { doc = this.next().v.parts.map((p) => (typeof p === 'string' ? p : `{${p.code}}`)).join(''); break; } // `error Bad why str"bad: $why"`: the message
      fields.push(this.expectId());
      if (!this.isTerm() && this.peek().t !== 'str') this.parseTypeExpr();
    }
    const defEntry = this.env.defs.get(name);
    const info = { kind: 'error', js: safeJs(name), arity: fields.length, fields, canonical: defEntry?.name || name };
    this.scopes[0].set(name, info);
    this.decls.errors.set(name, info);
    return { k: 'ErrorDecl', name, js: info.js, fields, canonical: info.canonical, doc: doc ?? defEntry?.doc, pos: start.pos };
  }

  parseTrait() {
    const start = this.next();
    const name = this.expectId();
    if (this.isOp('[') && this.glued()) this.skipBrackets();
    if (this.isOp(':') && this.glued()) { this.next(); this.parseTypeExpr(); while (this.isOp('+') && this.glued()) { this.next(); this.parseTypeExpr(); } }
    const methods = this.parseDeclBody(() => this.parseMember());
    const info = { kind: 'trait', js: safeJs(name) };
    this.scopes[0].set(name, info);
    this.decls.traits.set(name, info);
    return { k: 'Trait', name, js: info.js, methods: methods.filter((m) => m && m.body), pos: start.pos };
  }

  parseMember() {
    if (this.isId('type') || this.isId('const')) { while (!this.isTerm()) this.next(); return null; }
    // `get name self|body<` is a property getter: read as `obj.name` (also from JavaScript)
    const getter = this.isId('get') && this.peek(1).t === 'id' && this.isId('self', 2);
    if (getter) this.next();
    const m = this.parseFn(true);
    if (getter) { m.getter = true; return m; }
    return m;
  }

  recordMethod(m) {
    const arity = m.params.some((p) => p.variadic || p.def) ? -1 : m.params.length;
    // `init self args` is the constructor: `T args` / JS `new T(args)` run it (R-30.6); write it first in the impl
    if (m.name === 'init' && m.self && this.implType) {
      const tsym = this.lookup(this.implType);
      if (tsym && tsym.kind === 'type') tsym.init = arity;
      const d = this.decls.types.get(this.implType);
      if (d) d.init = arity;
    }
    const prev = this.decls.methods.get(m.name);
    this.decls.methods.set(m.name, prev === undefined || prev === arity ? arity : -1);
  }

  parseImpl() {
    const start = this.next();
    if (this.isOp('[') && this.glued()) this.skipBrackets();
    const first = this.parseTypeExpr();
    let trait = null, type = first;
    if (!this.isTerm()) { trait = first; type = this.parseTypeExpr(); }
    const base = type.replace(/\[.*$/, '').replace(/\?$/, '');
    const savedImpl = this.implType;
    this.implType = base;
    const methods = this.parseDeclBody(() => this.parseMember()).filter(Boolean);
    this.implType = savedImpl;
    const traitBase = trait ? trait.replace(/\[.*$/, '') : null;
    const tsym = this.lookup(base);
    return { k: 'Impl', trait: traitBase, traitSym: traitBase ? this.lookup(traitBase) : null, type: base, typeSym: tsym, methods, pos: start.pos };
  }

  parseExt() {
    const start = this.next();
    const type = this.parseTypeExpr().replace(/\[.*$/, '');
    const methods = this.parseDeclBody(() => this.parseMember()).filter(Boolean);
    return { k: 'Ext', type, typeSym: this.lookup(type), methods, pos: start.pos };
  }

  parseMod() {
    const start = this.next();
    const name = this.expectId();
    this.push();
    const body = this.peek().t === '|' ? (this.next(), this.parseBody()) : [];
    const scope = this.scopes[this.scopes.length - 1];
    const members = new Map();
    for (const [n, s] of scope) if (['fn', 'type', 'variant', 'error', 'const', 'mod'].includes(s.kind)) members.set(n, s);
    this.pop();
    const sym = this.declare(name, { kind: 'mod', exports: members });
    return { k: 'Mod', name, js: sym.js, body, exports: [...members.entries()].map(([n, s]) => ({ name: n, js: s.js })), pos: start.pos };
  }

  parseTest() {
    const start = this.next();
    let prop = false;
    if (this.isId('prop')) { this.next(); prop = true; }
    if (this.peek().t !== 'str') throw this.err('E150', 'a test needs a name string: test"name|…', this.peek());
    const name = strText(this.next());
    let async = false;
    const opts = {};
    this.push();
    this.fnStack.push({ name: `test ${name}`, async: false, lambda: false, raises: false, usesOptQ: false });
    while (!this.isTerm()) {
      if (this.isId('async')) { this.next(); async = true; continue; }
      if (this.peek().t === 'id' && this.isOp('=', 1)) { const k = this.next().v; this.next(); opts[k] = this.parseTight(); continue; }
      if (this.peek().t === 'id') { this.declare(this.next().v, { kind: 'param' }); if (this.isOp(':')) { this.next(); this.parseTypeExpr(); } continue; }
      this.next();
    }
    const body = this.requireBody('test');
    const rec = this.fnStack.pop();
    this.pop();
    return { k: 'Test', name, body, async: async || rec.async, prop, opts, usesOptQ: rec.usesOptQ, pos: start.pos };
  }

  // ───────────────────────── control flow ─────────────────────────
  parseIfRest(cond, asExpr) {
    const start = this.prev();
    cond = cond || this.parseExpr();
    const branches = [];
    this.push();
    branches.push({ cond, body: this.requireBody('if') });
    this.pop();
    let els = null;
    for (;;) {
      if (this.closedByLt() && this.isId('elif')) {
        this.next();
        const c = this.parseExpr();
        this.push();
        branches.push({ cond: c, body: this.requireBody('elif') });
        this.pop();
        continue;
      }
      if (this.closedByLt() && this.isId('else')) {
        this.next();
        this.push();
        els = this.requireBody('else');
        this.pop();
      }
      break;
    }
    return { k: 'If', branches, else: els, asExpr, pos: start.pos };
  }

  parseMatchRest(asExpr) {
    const start = this.prev();
    const subject = this.peek().t === '|' ? null : this.parseExpr();
    if (this.peek().t !== '|') throw this.err('E107', "match needs arms: expected '|'", this.peek());
    this.next();
    const arms = [];
    this.depth++;
    for (;;) {
      if (this.peek().t === 'eof') break;
      if (this.peek().t === '<') { this.next(); break; }
      const segStart = this.peek().pos;
      this.push();
      let pat = null, cond = null;
      if (subject) pat = this.declarePattern(this.parsePattern({}));
      else if (this.isId('_') && this.peek(1).t === '|') this.next();
      else cond = this.parseExpr();
      let guard = null;
      if (this.isId('if')) { this.next(); guard = this.parseExpr(); }
      this.segments.push({ start: segStart, end: this.prev().end, depth: this.depth - 1 });
      const body = this.requireBody('match arm');
      this.pop();
      arms.push({ pat, cond, guard, body });
      if (!this.closedByLt()) break;
    }
    this.depth--;
    return { k: 'Match', subject, arms, asExpr, pos: start.pos };
  }

  parseWhile() {
    const start = this.next();
    const cond = this.parseExpr();
    this.push();
    const body = this.requireBody('while');
    this.pop();
    return this.parseLoopElse({ k: 'While', cond, body, pos: start.pos });
  }

  parseFor(asExpr) {
    const start = this.next();
    let isAwait = false;
    if (this.isId('await')) { this.next(); isAwait = true; this.markAsync(); }
    this.push();
    const rawPat = this.parsePattern({ binding: true, noArgs: true });
    let mode = null;
    if (this.isId('own')) { this.next(); mode = 'own'; }
    else if (this.isOp('&')) { this.next(); mode = 'ref'; if (this.isId('mut')) { this.next(); mode = 'mut'; } }
    const iter = this.parseExpr();
    const pat = this.declarePattern(rawPat);
    const body = this.requireBody('for');
    this.pop();
    return this.parseLoopElse({ k: 'For', pat, iter, body, await: isAwait, mode, asExpr, pos: start.pos });
  }

  parseLoop(asExpr) {
    const start = this.next();
    this.push();
    const body = this.requireBody('loop');
    this.pop();
    return { k: 'Loop', body, asExpr, pos: start.pos };
  }

  parseRepeat() {
    const start = this.next();
    const count = this.parseTight();
    this.push();
    let v = null;
    if (this.peek().t === 'id' && this.peek().sp) v = this.declare(this.next().v, { kind: 'var' }).js;
    const body = this.requireBody('repeat');
    this.pop();
    return this.parseLoopElse({ k: 'Repeat', count, v, body, pos: start.pos });
  }

  parseLoopElse(node) {
    if (this.closedByLt() && this.isId('else')) {
      this.next();
      this.push();
      node.else = this.requireBody('else');
      this.pop();
    }
    return node;
  }

  parseDo(asExpr) {
    const start = this.next();
    this.push();
    const body = this.requireBody(start.v);
    if (this.closedByLt() && this.isId('while')) {
      this.next();
      const cond = this.parseExpr();
      this.pop();
      return { k: 'DoWhile', body, cond, pos: start.pos };
    }
    this.pop();
    return { k: 'Block', body, asExpr, pos: start.pos };
  }

  parseTry(asExpr) {
    const start = this.next();
    this.push();
    const body = this.requireBody('try');
    this.pop();
    const catches = [];
    let fin = null;
    while (this.closedByLt() && this.isId('catch')) {
      this.next();
      this.push();
      const pat = this.peek().t === '|' ? null : this.declarePattern(this.parsePattern({ catch: true }));
      const cbody = this.requireBody('catch');
      this.pop();
      catches.push({ pat, body: cbody });
    }
    if (this.closedByLt() && this.isId('finally')) {
      this.next();
      this.push();
      fin = this.requireBody('finally');
      this.pop();
    }
    return { k: 'Try', body, catches, fin, asExpr, pos: start.pos };
  }

  parseWith(asExpr) {
    const start = this.next();
    this.push();
    const rawPat = this.parsePatAtom({ binding: true, noArgs: true });
    const expr = this.parseExpr();
    const pat = this.declarePattern(rawPat);
    const body = this.requireBody('with');
    this.pop();
    return { k: 'With', pat, expr, body, asExpr, pos: start.pos };
  }

  markAsync() { const f = this.curFn(); if (f) f.async = true; }
  markRaise() { const f = this.outerFn(); if (f) f.raises = true; }

  // ───────────────────────── expressions ─────────────────────────
  parseExpr() {
    let left = this.parseLambdaLevel();
    while (this.isOp('|>') || this.isOp('>>')) {
      this.next();
      if (this.isId('await') && (this.isTerm(1) || this.isOp('|>', 1) || this.isOp('>>', 1) || this.isOp(')', 1))) {
        this.next();
        this.markAsync();
        left = { k: 'Await', expr: left };
        continue;
      }
      left = this.parseApp(left);
    }
    return left;
  }

  parseLambdaLevel() {
    return this.isLambdaStart() ? this.parseLambda() : this.parseTuple();
  }

  parseTuple() {
    const first = this.parseOr();
    if (!(this.isOp(',') && this.glued())) return first;
    const items = [first];
    while (this.isOp(',') && this.glued()) {
      this.next();
      if (this.isTerm() || this.isOp(')') || !startsOperand(this.peek(), true)) break;
      items.push(this.parseOr());
    }
    return { k: 'Tuple', items };
  }

  parseOr() {
    let left = this.parseAnd();
    while (this.isId('or')) { this.next(); left = { k: 'Logic', op: '||', left, right: this.parseAnd() }; }
    return left;
  }

  parseAnd() {
    let left = this.parseNot();
    while (this.isId('and')) { this.next(); left = { k: 'Logic', op: '&&', left, right: this.parseNot() }; }
    return left;
  }

  // Bit operators are words (`<` and `>>` mean other things in TL): bor < bxor < band < shl shr ushr < bnot.
  // Like `and`/`or` they sit above calls, so `f x band 255` is `f(x) & 255`; tight operators still bind first.
  parseBits(level = 0) {
    const LEVELS = [{ bor: '|' }, { bxor: '^' }, { band: '&' }, { shl: '<<', shr: '>>', ushr: '>>>' }];
    if (level === LEVELS.length) {
      if (this.isId('bnot')) { this.next(); return { k: 'BitNot', expr: this.parseBits(level) }; }
      return this.parseApp(null);
    }
    let left = this.parseBits(level + 1);
    while (this.peek().t === 'id' && Object.hasOwn(LEVELS[level], this.peek().v)) {
      const op = LEVELS[level][this.next().v];
      left = { k: 'Bit', op, left, right: this.parseBits(level + 1) };
    }
    return left;
  }

  parseNot() {
    if (this.isId('not')) { this.next(); return { k: 'Not', expr: this.parseNot() }; }
    let e = this.parseBits();
    if (this.isId('by')) {
      this.next();
      const step = this.parseApp(null);
      let r = e;
      while (r.k === 'Paren') r = r.expr;
      if (r.k !== 'Range') throw this.err('E141', "'by' applies to a range");
      e = { ...r, step };
    }
    if (this.isId('is')) {
      this.next();
      const pat = this.declarePattern(this.parsePattern({}));
      e = { k: 'Is', expr: e, pat };
    }
    return e;
  }

  /** Application (R-9.1): head operand* [?]. With `piped`, the piped value is the first argument (R-23.1). */
  parseApp(piped) {
    const start = this.peek();
    let awaited = false;
    if (!piped && this.isId('await')) { this.next(); awaited = true; this.markAsync(); }
    const head = this.parseTight('head');
    // Pipeline stages may name the iterator helpers (R-23.2) unless a user function shadows them.
    if (piped && head.k === 'Ident' && Object.hasOwn(PIPELINE, head.name) && head.sym?.kind !== 'fn') {
      head.sym = { kind: 'builtin', arity: PIPELINE[head.name], js: `$.${head.name}` };
      head.js = head.sym.js;
    } else if (piped && head.k === 'Ident' && !head.sym) {
      head.sym = { kind: 'stage', arity: this.env.methodArity?.get(head.name) ?? this.decls.methods.get(head.name) ?? (Object.hasOwn(METHODS, head.name) ? METHODS[head.name] : -1), js: head.name };
    }
    let node = head;
    const info = this.calleeInfo(head, !!piped);
    if (info) {
      const args = piped ? [piped] : [];
      const named = [];
      const greedy = info.arity < 0;
      let slots = greedy ? Infinity : info.arity - (piped && !info.stage ? 1 : 0);
      let blockEnd = false;
      while (slots > 0 && this.startsOperandHere()) {
        if (this.isNamedArg()) { named.push(this.parseNamedArg()); continue; }
        const last = slots === 1 || greedy;
        if (last && this.isLambdaStart()) { const lam = this.parseLambda(); args.push(lam); slots--; if (lam.block) blockEnd = true; break; }
        args.push(this.parseOperand(last, greedy));
        slots--;
      }
      // after the `<` that closes a block lambda the next segment starts: `x=1` there is an assignment, not a named argument
      while (!blockEnd && this.isNamedArg()) named.push(this.parseNamedArg());
      const given = args.length - (piped ? 1 : 0);
      const atEnd = this.isTerm() || this.isOp(')') || this.isOp(']') || this.isOp('}');
      if (!greedy && slots > 0 && given > 0 && !info.defaults && !atEnd) {
        throw this.err('E116', `'${calleeName(head)}' takes ${info.arity} operand(s) but got ${args.length}`, this.peek(), ['paren', 'add-operands']);
      }
      const makeCall = piped || args.length || named.length || (info.arity === 0 && head.k !== 'Member') || (greedy && info.strong && head.k !== 'Member');
      if (makeCall) {
        node = { k: 'Call', callee: head, args, named, info, pos: start.pos };
        if (info.erroring) node.erroring = true;
        if (info.async) node.async = true;
      }
    }
    if (awaited) node = { k: 'Await', expr: node };
    if (this.isOp('?') && this.glued()) {
      this.next();
      if (node.erroring || (node.k === 'Await' && node.expr.erroring)) this.markRaise();
      node = { k: 'Prop', expr: node };
      const f = this.curFn();
      if (f) f.usesOptQ = true;
    }
    return node;
  }

  /** Operand of an application: a tight expression, or a nested fixed-arity call in last position (R-9.2). */
  parseOperand(last) {
    const t = this.peek();
    if (this.isOp('..')) { this.next(); return { k: 'Spread', expr: this.parseTight() }; }
    if (t.t === 'id' && last) {
      const sym = this.lookup(t.v);
      if (sym && isCallableSym(sym) && sym.arity > 0 && this.peek(1).sp && startsOperand(this.peek(1), true) && !this.isTerm(1)) {
        return this.parseApp(null);
      }
    }
    let e = this.parseTight('operand');
    if (this.isOp('?') && this.glued() && this.peek(1).sp && startsOperand(this.peek(1), true)) { this.next(); e = { k: 'Prop', expr: e }; }
    return placeholderLambda(e);
  }

  isNamedArg() {
    const t = this.peek();
    return t.t === 'id' && !KEYWORDS.has(t.v) && this.isOp('=', 1) && this.glued(1) && !this.isTerm(2);
  }

  parseNamedArg() {
    const name = this.next().v;
    this.next();
    return { name, value: this.parseTight() };
  }

  startsOperandHere() {
    const t = this.peek();
    if (TERM.has(t.t)) return false;
    return startsOperand(t, t.sp);
  }

  /** Scans ahead for `params =>` (R-22.1). */
  isLambdaStart() {
    let k = 0;
    while (this.isId('move', k) || this.isId('async', k)) k++;
    const first = this.peek(k);
    if (first.t === 'id' && !['_'].includes(first.v)) {
      const sym = this.lookup(first.v);
      if (sym && isCallableSym(sym) && !this.isOp('=>', k + 1)) return false;
    }
    let depth = 0;
    const startK = k;
    let prevId = false;
    for (; ; k++) {
      const t = this.peek(k);
      if (TERM.has(t.t)) return false;
      if (depth > 0 && t.t === 'id' && prevId) return false; // `(f x)` is a call, not a tuple pattern
      prevId = t.t === 'id';
      if (t.t === 'op') {
        if (t.v === '=>') return depth === 0 && k > startK;
        if (t.v === '>>' || t.v === '|>') return false;
        if (t.v === '(' ) { if (this.isOp(')', k + 1) && k !== startK) return false; depth++; continue; }
        if (t.v === ')') { if (depth === 0) return false; depth--; continue; }
        if (t.v === '[' || t.v === '{') { depth++; continue; }
        if (t.v === ']' || t.v === '}') { depth--; continue; }
        if ([',', '..', ':', '&', '?'].includes(t.v)) continue;
        return false;
      }
      if (t.t === 'id') {
        if (WORD_OPS.has(t.v) || (KEYWORDS.has(t.v) && t.v !== 'mut')) return false;
        continue;
      }
      if (depth > 0) continue;
      return false;
    }
  }

  /** `name:` / `0:` / `en-US:` map keys: words, numbers and `-` glued together and ending in a glued `:` (always a string key). */
  bareKey() {
    let k = 0;
    const word = (t) => t.t === 'id' || t.t === 'num';
    if (!word(this.peek(k))) return null;
    k++;
    while (this.isOp('-', k) && this.glued(k) && word(this.peek(k + 1)) && this.glued(k + 1)) k += 2;
    if (!this.isOp(':', k) || !this.glued(k)) return null;
    let text = '';
    for (let j = 0; j < k; j++) { const t = this.next(); text += t.t === 'num' ? t.v.text : t.v; }
    return text;
  }

  parseLambda() {
    // maps inside a lambda inside `#{…}` stay maps: only directly nested `{…}` become objects
    const depth0 = this.objDepth;
    this.objDepth = 0;
    try { return this.parseLambdaInner(); } finally { this.objDepth = depth0; }
  }

  parseLambdaInner() {
    let async = false;
    while (this.isId('move') || this.isId('async')) { if (this.next().v === 'async') async = true; }
    this.push();
    const params = [];
    let variadic = false;
    if (this.isOp('(') && this.isOp(')', 1)) { this.next(); this.next(); }
    else {
      while (!this.isOp('=>')) {
        if (this.isOp('..')) { this.next(); variadic = true; }
        const pat = this.parsePatAtom({ binding: true, noArgs: true });
        if (this.isOp(':') && this.glued()) { this.next(); this.parseTypeExpr(); }
        params.push(this.declarePattern(pat, { kind: 'param' }));
        if (this.isOp(',') && this.glued()) this.next();
      }
    }
    this.expectOp('=>');
    const rec = { name: '<lambda>', async, lambda: true, raises: false, usesOptQ: false };
    this.fnStack.push(rec);
    let body, block = null;
    if (this.peek().t === '|') { this.next(); block = this.parseBody(); }
    else body = this.parseLambdaLevel();
    this.fnStack.pop();
    this.pop();
    return { k: 'Lambda', params, body, block, async: rec.async, variadic, usesOptQ: rec.usesOptQ, gen: rec.gen };
  }

  /** Which callee is this, and how many operands does it take? null when it is not callable. */
  calleeInfo(head, piped) {
    if (head.k === 'Ident') {
      const s = head.sym;
      if (!s) return piped ? { arity: -1 } : { arity: -1 };
      switch (s.kind) {
        case 'fn': return { arity: s.arity, erroring: s.erroring, async: s.async, defaults: s.defaults, strong: true, sym: s };
        case 'builtin': return { arity: s.arity, strong: true, builtin: true };
        case 'variant': return s.arity > 0 || s.named ? { arity: s.arity, ctor: 'variant', sym: s } : piped ? { arity: -1 } : null;
        case 'error': return s.arity > 0 ? { arity: s.arity, ctor: 'error', sym: s } : piped ? { arity: -1 } : null;
        case 'type':
          if (s.tuple) return { arity: s.tuple, ctor: 'type', sym: s };
          if (s.init) return { arity: s.init, ctor: 'type', sym: s, defaults: s.init < 0 };
          return piped ? { arity: -1 } : null;
        case 'param': case 'jsval': return { arity: -1 };
        case 'stage': return { arity: s.arity, strong: true, stage: true };
        case 'var': case 'const': return { arity: -1 }; // a local holding a function, called in head position
        case 'mod': return s.std && s.js === '$.std.log' ? { arity: -1, strong: true, logCall: true } : piped ? { arity: -1 } : null;
        default: return piped ? { arity: -1 } : null;
      }
    }
    if (head.k === 'Member') {
      const obj = head.obj;
      if (obj.k === 'Ident' && obj.sym?.kind === 'mod') {
        const m = obj.sym;
        if (m.std && head.name in m.members) return { arity: m.members[head.name], strong: m.members[head.name] !== 0 };
        const ex = m.exports?.get(head.name);
        if (ex) {
          if (ex.kind === 'fn') return { arity: ex.arity, erroring: ex.erroring, async: ex.async, defaults: ex.defaults, strong: true };
          if (ex.kind === 'variant') return ex.arity > 0 ? { arity: ex.arity, ctor: 'variant', sym: ex } : null;
          if (ex.kind === 'type' && ex.tuple) return { arity: ex.tuple, ctor: 'type', sym: ex };
          if (ex.kind === 'type' && ex.init) return { arity: ex.init, ctor: 'type', sym: ex, defaults: ex.init < 0 };
          return piped ? { arity: -1 } : null;
        }
        return { arity: -1 };
      }
      if (obj.k === 'Ident' && obj.sym?.kind === 'type') {
        const a = this.env.methodArity?.get(head.name) ?? this.decls.methods.get(head.name);
        if (obj.sym.variants?.includes(head.name)) {
          const v = this.lookup(head.name);
          return v && v.kind === 'variant' && v.arity > 0 ? { arity: v.arity, ctor: 'variant', sym: v } : null;
        }
        return { arity: a ?? -1 };
      }
      if (obj.k === 'Ident' && (!obj.sym || obj.sym.kind === 'jsval')) return { arity: -1 }; // members of JS values
      const a = this.env.methodArity?.get(head.name) ?? this.decls.methods.get(head.name);
      if (a !== undefined) return { arity: a };
      if (Object.hasOwn(METHODS, head.name)) return { arity: METHODS[head.name] };
      return { arity: -1 };
    }
    if (head.k === 'FnRef' || head.k === 'Paren' || head.k === 'Lambda') return piped ? { arity: -1 } : null;
    return piped ? { arity: -1 } : null;
  }

  // Tight expressions: binary operators without spaces (levels 1–9).
  parseTight(mode = 'free') { return this.parseBinary(0, mode); }

  parseBinary(minPrec, mode) {
    let left = this.parseUnary(mode);
    for (;;) {
      const t = this.peek();
      if (t.t !== 'op' || !(t.v in BINARY) || t.sp) break;
      const prec = BINARY[t.v];
      if (prec < minPrec) break;
      this.next();
      if ((t.v === '..' || t.v === '..=') && (this.isTerm() || this.isOp(')') || this.isOp(']') || this.peek().sp)) {
        left = { k: 'Range', lo: left, hi: null, incl: false };
        continue;
      }
      if (this.peek().sp) throw this.err('E004', `space after operator '${t.v}'`, t, [`join:${t.v}`]);
      const right = this.parseBinary(RIGHT_ASSOC.has(t.v) ? prec : prec + 1, mode);
      if (t.v === '..' || t.v === '..=') left = { k: 'Range', lo: left, hi: right, incl: t.v === '..=' };
      else left = { k: 'Binary', op: t.v, left, right };
    }
    return left;
  }

  parseUnary(mode) {
    const t = this.peek();
    if (t.t === 'op') {
      switch (t.v) {
        case '-': this.next(); return { k: 'Neg', expr: this.parseUnary(mode) };
        case '&': this.next(); if (this.isId('mut') && this.peek(1).sp) this.next(); return this.parseUnary(mode);
        case '*': this.next(); return this.parseUnary(mode);
        case '\\': this.next(); return { k: 'FnRef', expr: this.parsePostfix(this.parsePrimary(), 'free') };
        case '!': this.next(); this.markRaise(); return { k: 'RaiseExpr', value: this.parseApp(null) }; // `x??!Bad"why"`
        case '..': this.next(); return { k: 'Range', lo: null, hi: this.parseBinary(5, mode), incl: false };
        case '.': {
          if (this.peek(1).sp) break;
          const path = [];
          while (this.isOp('.') && this.glued(1)) { this.next(); const n = this.next(); path.push(n.t === 'num' ? String(n.v.value) : n.v); }
          return { k: 'Proj', path };
        }
        default:
      }
    }
    return this.parsePostfix(this.parsePrimary(), mode);
  }

  parsePostfix(e, mode) {
    for (;;) {
      const t = this.peek();
      if (t.t !== 'op' || t.sp) break;
      if (t.v === '.' || t.v === '?.') {
        const nt = this.peek(1);
        if (nt.t !== 'id' && nt.t !== 'num') break;
        this.next();
        this.next();
        e = { k: 'Member', obj: e, name: nt.t === 'num' ? String(nt.v.value) : nt.v, opt: t.v === '?.', field: this.env.fields?.get(nt.v) || null };
        continue;
      }
      if (t.v === '[') {
        if (this.isCallableHead(e)) break;
        if (e.k === 'Ident' && ((e.sym && ['type', 'trait'].includes(e.sym.kind)) || (!e.sym && /^[A-Z]/.test(e.name)))) { this.skipBrackets(); continue; }
        this.next();
        const index = this.parseExpr();
        this.close(']', 'index');
        e = { k: 'Index', obj: e, index };
        continue;
      }
      if (t.v === '?') {
        // In head/operand position a trailing `?` belongs to the whole application (R-9.8).
        const n = this.peek(1);
        const continues = n.t === 'op' && !n.sp && ['.', '[', '?.'].includes(n.v);
        if (!continues && mode !== 'free') break;
        this.next();
        e = { k: 'Prop', expr: e };
        const f = this.curFn();
        if (f) f.usesOptQ = true;
        continue;
      }
      break;
    }
    return e;
  }

  isCallableHead(e) {
    if (e.k === 'Ident') return !!(e.sym && isCallableSym(e.sym) && e.sym.kind !== 'param' && e.sym.kind !== 'jsval');
    if (e.k === 'Member' && e.obj.k === 'Ident' && e.obj.sym?.kind === 'mod') {
      const m = e.obj.sym;
      if (m.std) return (m.members[e.name] ?? 0) !== 0;
      const ex = m.exports?.get(e.name);
      return !!ex && ex.kind === 'fn';
    }
    if (e.k === 'Member') {
      const a = this.env.methodArity?.get(e.name) ?? this.decls.methods.get(e.name) ?? (Object.hasOwn(METHODS, e.name) ? METHODS[e.name] : undefined);
      return a !== undefined && a !== 0;
    }
    return false;
  }

  parsePrimary() {
    const t = this.peek();
    switch (t.t) {
      case 'num': this.next(); return { k: 'Num', ...t.v };
      case 'str': this.next(); return this.stringNode(t);
      case 'raw': this.next(); return { k: 'Str', parts: [t.v.text] };
      case 'char': this.next(); return { k: 'Str', parts: [t.v] };
      case 'pstr': this.next(); return { k: 'PStr', prefix: t.v.prefix, text: t.v.raw ? t.v.lit.text : null, str: t.v.raw ? null : this.stringNode({ v: t.v.lit }), flags: t.v.flags || '', pos: t.pos };
      case 'id': return this.parseIdentPrimary();
      case 'op': break;
      default: throw this.err('E140', `expected an expression but found ${describe(t)}`);
    }
    switch (t.v) {
      case '(': {
        this.next();
        if (this.isOp(')')) { this.next(); return { k: 'Unit' }; }
        const e = this.parseExpr();
        this.close(')', 'parenthesis');
        return { k: 'Paren', expr: e };
      }
      case '[': {
        this.next();
        const items = this.parseElems(']');
        this.close(']', 'list');
        return { k: 'List', items };
      }
      case '#[': {
        this.next();
        const items = this.parseElems(']');
        this.close(']', 'set');
        return { k: 'SetLit', items };
      }
      case '#{':
      case '{': {
        // `#{a:1}` is a plain JavaScript object; every `{…}` nested inside it is one too
        const plain = t.v === '#{' || this.objDepth > 0;
        this.next();
        const depth0 = this.objDepth || 0;
        if (plain) this.objDepth = depth0 + 1;
        const entries = [];
        try {
          while (!this.isTerm() && !this.isOp('}')) {
            if (this.isOp('..')) { this.next(); entries.push({ spread: this.parseTight() }); continue; }
            let key;
            const bare = this.bareKey();
            if (bare !== null) key = { k: 'Str', parts: [bare] };
            else key = this.parseTight();
            if (!this.isOp(':')) throw this.err('E142', "map entries are written key:value", this.peek());
            this.next();
            entries.push({ key, value: this.parseTight() });
          }
        } finally { this.objDepth = depth0; }
        this.close('}', plain ? 'object' : 'map');
        return { k: plain ? 'ObjLit' : 'MapLit', entries };
      }
      case '$': {
        this.next();
        if (this.isOp('(') && this.glued()) { this.next(); const e = this.parseExpr(); this.close(')', 'compile-time expression'); return { k: 'Paren', expr: e }; }
        if (this.isId('embed')) { this.next(); const s = this.parsePrimary(); return { k: 'Embed', path: s }; }
        throw this.err('E901', 'macros and compile-time code are not supported by TL/JS 0.1 yet', t);
      }
      default: throw this.err('E140', `expected an expression but found ${describe(t)}`);
    }
  }

  parseElems(closeCh) {
    const items = [];
    while (!this.isTerm() && !this.isOp(closeCh)) {
      if (this.isOp('..')) { this.next(); items.push({ k: 'Spread', expr: this.parseTight() }); continue; }
      items.push(this.parseTight());
    }
    return items;
  }

  parseIdentPrimary() {
    const t = this.next();
    switch (t.v) {
      case 'true': return { k: 'Bool', value: true };
      case 'false': return { k: 'Bool', value: false };
      case 'none': return { k: 'None' };
      case 'self': return { k: 'Ident', name: 'self', js: 'self', sym: this.lookup('self') };
      case 'if': return this.parseIfExpr();
      case 'match': return this.parseMatchRest(true);
      case 'do': this.p--; return this.parseDo(true);
      case 'try': this.p--; return this.parseTry(true);
      case 'loop': this.p--; return this.parseLoop(true);
      case 'for': this.p--; return this.parseFor(true);
      case 'with': this.p--; return this.parseWith(true);
      case 'unsafe': if (this.peek().t === '|') { this.p--; return this.parseDo(true); } break;
      case 'move': case 'async': this.p--; if (this.isLambdaStart()) return this.parseLambda(); break;
      case 'await': { this.markAsync(); return { k: 'Await', expr: this.parseTight() }; }
      default:
    }
    if (KEYWORDS.has(t.v) && t.v !== '_') throw this.err('E143', `'${t.v}' cannot start an expression here`, t);
    if (/^[A-Z]/.test(t.v) && this.isOp('{') && this.glued()) return this.parseRecord(t);
    if (t.v === '_') return { k: 'Ident', name: '_', js: '_', placeholder: true };
    const sym = this.lookup(t.v);
    return { k: 'Ident', name: t.v, js: sym ? sym.js : t.v, sym: sym || null, pos: t.pos };
  }

  parseIfExpr() {
    const save = this.p;
    const mark = this.implicit.length;
    let cond = this.parseTight();
    if (this.peek().t === '|') return this.parseIfRest(cond, true);
    if (this.isId('is') || this.isId('and') || this.isId('or')) {
      this.p = save;
      this.implicit.length = mark;
      cond = this.parseOr();
      return this.parseIfRest(cond, true);
    }
    const a = this.parseTight();
    const b = this.parseTight();
    return { k: 'Cond', cond, a, b };
  }

  parseRecord(t) {
    this.next(); // {
    const sym = this.lookup(t.v);
    const fields = [];
    let spread = null;
    while (!this.isTerm() && !this.isOp('}')) {
      if (this.isOp('..')) { this.next(); spread = this.parseTight(); continue; }
      const name = this.expectId();
      let value;
      if (this.isOp(':') && this.glued()) { this.next(); value = this.parseTight(); }
      else { const s = this.lookup(name); value = { k: 'Ident', name, js: s ? s.js : safeJs(name), sym: s }; }
      fields.push({ name, value });
    }
    this.close('}', `record ${t.v}`);
    return { k: 'Record', type: t.v, sym, fields, spread, pos: t.pos };
  }

  stringNode(t) {
    const parts = t.v.parts.map((p) => {
      if (typeof p === 'string') return p;
      if (!p.code.trim()) throw this.err('E144', 'empty interpolation', { pos: p.pos });
      const saved = [this.toks, this.p];
      this.toks = this.named(lex(p.code, this.file, p.pos));
      this.p = 0;
      this.interp++;
      let expr;
      try {
        expr = this.parseExpr();
        if (this.peek().t !== 'eof') throw this.err('E145', `unexpected ${describe(this.peek())} in interpolation`);
      } finally { this.interp--; }
      [this.toks, this.p] = saved;
      return { expr, fmt: p.fmt, dbg: p.dbg, code: p.code };
    });
    return { k: 'Str', parts };
  }

  // ───────────────────────── patterns (§20.2) ─────────────────────────
  parsePattern(opts) {
    let pat = this.parsePatTuple(opts);
    if (this.isId('or')) {
      const alts = [pat];
      while (this.isId('or')) { this.next(); alts.push(this.parsePatTuple(opts)); }
      pat = { k: 'POr', alts };
    }
    if (this.isId('as')) { this.next(); pat = { k: 'PAs', pat, name: this.expectId() }; }
    return pat;
  }

  parsePatTuple(opts) {
    const items = [this.parsePatAtom(opts)];
    while (this.isOp(',') && this.glued()) { this.next(); items.push(this.parsePatAtom(opts)); }
    return items.length > 1 ? { k: 'PTuple', items } : items[0];
  }

  parsePatAtom(opts = {}) {
    const t = this.peek();
    if (t.t === 'id' && t.v === '_') { this.next(); return { k: 'PWild' }; }
    const lit = this.tryPatLiteral();
    if (lit) {
      if ((this.isOp('..') || this.isOp('..=')) && this.glued()) {
        const incl = this.next().v === '..=';
        const hi = this.tryPatLiteral();
        return { k: 'PRange', lo: lit, hi, incl };
      }
      return { k: 'PLit', value: lit };
    }
    if (t.t === 'op') {
      if (t.v === '(') { this.next(); const p = this.parsePattern(opts); this.close(')', 'pattern'); return p; }
      if (t.v === '[') {
        this.next();
        const items = [];
        while (!this.isTerm() && !this.isOp(']')) {
          if (this.isOp('..')) {
            this.next();
            const name = this.peek().t === 'id' && !this.peek().sp ? this.next().v : null;
            items.push({ k: 'PRest', name });
            continue;
          }
          items.push(this.parsePatAtom({ ...opts, noArgs: true }));
        }
        this.close(']', 'slice pattern');
        return { k: 'PSlice', items };
      }
      if (t.v === '&') { this.next(); return this.parsePatAtom(opts); }
      if (t.v === '{') {
        let depth = 0;
        do { const x = this.next(); if (x.v === '{') depth++; else if (x.v === '}') depth--; } while (depth > 0 && !this.isTerm());
        const bind = this.peek().t === 'id' && !NOT_OPERAND_WORDS.has(this.peek().v) && this.peek().v !== 'if' ? this.next().v : null;
        return { k: 'PType', type: 'map', bind };
      }
    }
    if (t.t !== 'id') throw this.err('E160', `expected a pattern but found ${describe(t)}`);
    this.next();
    if (/^[a-z_]/.test(t.v)) {
      if (PRIMITIVE_TYPES.has(t.v) && !opts.binding) {
        const n = this.peek();
        const bind = n.t === 'id' && n.sp && /^[a-z_]/.test(n.v) && !KEYWORDS.has(n.v) ? this.next().v : null;
        return { k: 'PType', type: t.v, bind };
      }
      return { k: 'PBind', name: t.v };
    }
    if (HTTP_METHODS.has(t.v) && this.isOp('/') && this.glued()) {
      const segs = [];
      while (this.isOp('/') && this.glued()) {
        this.next();
        if (this.isOp(':') && this.glued()) { this.next(); segs.push({ param: this.expectId() }); }
        else if (this.isOp('*')) { this.next(); segs.push({ rest: true }); }
        else if (this.peek().t === 'id' && this.glued()) segs.push({ lit: this.next().v });
        else break;
      }
      return { k: 'PRoute', method: t.v, segs };
    }
    let name = t.v;
    while (this.isOp('.') && this.glued() && this.peek(1).t === 'id') { this.next(); name += `.${this.next().v}`; }
    const sym = this.lookup(name.split('.').pop()) || this.lookup(name.split('.')[0]);
    if (this.isOp('{') && this.glued()) {
      this.next();
      const fields = [];
      let rest = false;
      while (!this.isTerm() && !this.isOp('}')) {
        if (this.isOp('..')) { this.next(); rest = true; continue; }
        const f = this.expectId();
        const pat = this.isOp(':') && this.glued() ? (this.next(), this.parsePatAtom({ ...opts, noArgs: true })) : { k: 'PBind', name: f };
        fields.push({ name: f, pat });
      }
      this.close('}', 'record pattern');
      return { k: 'PRecord', name, sym, fields, rest };
    }
    const args = [];
    if (!opts.noArgs) {
      while (this.peek().sp && patAtomStart(this.peek())) args.push(this.parsePatAtom({ ...opts, noArgs: true, binding: false }));
    }
    return { k: 'PCtor', name, sym, args };
  }

  tryPatLiteral() {
    const t = this.peek();
    if (t.t === 'num') { this.next(); return { k: 'Num', ...t.v }; }
    if (t.t === 'op' && t.v === '-' && this.peek(1).t === 'num') { this.next(); const n = this.next(); return { k: 'Num', ...n.v, value: -n.v.value }; }
    if (t.t === 'str') { this.next(); return this.stringNode(t); }
    if (t.t === 'char') { this.next(); return { k: 'Str', parts: [t.v] }; }
    if (t.t === 'id' && (t.v === 'true' || t.v === 'false')) { this.next(); return { k: 'Bool', value: t.v === 'true' }; }
    if (t.t === 'id' && t.v === 'none') { this.next(); return { k: 'None' }; }
    return null;
  }
}

// ───────────────────────── helpers ─────────────────────────
/** Symbol info for a binding: locals bound to lambdas, compositions and function references are callable. */
function fnValueInfo(value, fallback = { kind: 'var' }) {
  if (value.k === 'Lambda') return { kind: 'fn', arity: value.variadic ? -1 : value.params.length, local: true, async: value.async };
  if ((value.k === 'Binary' && value.op === '>>') || value.k === 'FnRef' || value.k === 'Proj') return { kind: 'fn', arity: -1, local: true };
  return fallback;
}

function defSymbol(sym, e) {
  const js = safeJs(e.name);
  switch (e.kind) {
    case 'fn': case 'method':
      return { kind: 'fn', arity: e.params.some((p) => p.variadic || p.default !== null) ? -1 : e.params.length, params: e.params.map((p) => p.short), js, erroring: e.errors.length > 0, async: e.async, defaults: e.params.some((p) => p.default !== null) };
    case 'type': return { kind: 'type', js, fields: (e.fields || []).map((f) => ({ name: f.short, js: f.long, defText: f.default })), tuple: e.tuple ? e.tuple.length : 0, arity: e.tuple ? e.tuple.length : 0, canonical: e.name, def: true };
    case 'error': return { kind: 'error', js: safeJs(e.name), arity: (e.fields || []).length, fields: (e.fields || []).map((f) => f.long), canonical: e.name, def: true };
    case 'const': return { kind: 'const', js, value: e.value };
    case 'mod': return { kind: 'defmod', js: safeJs(sym), name: e.name };
    default: return { kind: 'var', js };
  }
}

export function isCallableSym(s) {
  switch (s.kind) {
    case 'fn': case 'builtin': case 'param': case 'jsval': return true;
    case 'variant': return s.arity > 0 || !!s.named;
    case 'error': return s.arity > 0;
    case 'type': return s.tuple > 0 || !!s.init;
    default: return false;
  }
}

/** Can this token begin an operand? `spaced` = there is a space before it. */
export function startsOperand(t, spaced) {
  switch (t.t) {
    case 'num': case 'str': case 'raw': case 'pstr': case 'char': return true;
    case 'id': return !NOT_OPERAND_WORDS.has(t.v) && (!KEYWORDS.has(t.v) || EXPR_KEYWORDS.has(t.v));
    case 'op':
      if (['(', '[', '{', '#[', '#{', '\\', '&', '$'].includes(t.v)) return true;
      if (t.v === '!') return true;
      if (['-', '*', '.', '..'].includes(t.v)) return !!spaced;
      return false;
    default: return false;
  }
}

function patAtomStart(t) {
  if (t.t === 'id') return !['if', 'or', 'as', 'and', 'is', 'own'].includes(t.v);
  if (['num', 'str', 'char'].includes(t.t)) return true;
  return t.t === 'op' && ['(', '[', '&', '-', '{'].includes(t.v);
}

function isPlace(e) {
  return e.k === 'Ident' || e.k === 'Member' || e.k === 'Index';
}

function placeholderLambda(e) {
  let n = 0;
  const walk = (x) => {
    if (!x || typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map(walk);
    if (x.k === 'Lambda') return x;
    if (x.k === 'Ident' && x.placeholder) return { k: 'Ident', name: `$p${n}`, js: `$p${n++}` };
    const out = {};
    for (const [key, v] of Object.entries(x)) out[key] = key === 'sym' || key === 'info' ? v : walk(v);
    return out;
  };
  const body = walk(e);
  if (!n) return e;
  const params = Array.from({ length: n }, (_, i) => ({ k: 'PBind', name: `$p${i}`, js: `$p${i}` }));
  return { k: 'Lambda', params, body, block: null };
}

function calleeName(e) {
  if (e.k === 'Ident') return e.name;
  if (e.k === 'Member') return `${calleeName(e.obj)}.${e.name}`;
  return 'expression';
}

export function strText(tok) {
  return tok.v.parts.filter((p) => typeof p === 'string').join('');
}

function describe(t) {
  switch (t.t) {
    case 'eof': return 'end of file';
    case 'id': return `'${t.v}'`;
    case 'op': return `'${t.v}'`;
    case 'num': return `number ${t.v.text}`;
    case 'str': return 'a string';
    default: return `'${t.t}'`;
  }
}
