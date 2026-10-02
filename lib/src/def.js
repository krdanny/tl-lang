// tl.def reader (spec §10). Each entry is one logical line:
//   <sym> <kind> <CanonicalName> [signature] {clause} ["doc"]
// Sections start with `@mod name`; entries before any section are visible to every module.

import { TLError } from './errors.js';
import { isCompound, BUILTIN_NAMES } from './names.js';

const KINDS = new Set(['fn', 'method', 'type', 'error', 'const', 'var', 'mod', 'trait']);

/**
 * @returns {{ global: Map<string, object>, mods: Map<string, Map<string, object>>, fields: Map<string,string>, aliases: Map<string,string> }}
 */
export function parseDef(text, file = 'tl.def') {
  const global = new Map();
  const mods = new Map();
  const fields = new Map();        // short field symbol -> canonical name ('' when ambiguous)
  const aliases = new Map();       // short symbol -> long name: `ipi isPrereleaseIdentifier`
  const longs = new Map();         // long name -> short symbol (a name has one symbol)
  let cur = global;

  text.split(/\r?\n/).forEach((raw, lineNo) => {
    const line = stripComment(raw).trim();
    if (!line) return;
    if (line.startsWith('@mod')) {
      const name = line.split(/\s+/)[1];
      if (!mods.has(name)) mods.set(name, new Map());
      cur = mods.get(name);
      return;
    }
    // continuation lines (indented doc / ex / note) attach to the previous entry
    if (/^\s/.test(raw) && cur.size) return;
    // a name: `<symbol> <longName> ["doc"]`: the symbol stands for the long name wherever it is written
    const a = /^([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_$][A-Za-z0-9_$]*)(?:\s+"[^"]*")?$/.exec(line);
    if (a && !KINDS.has(a[2])) {
      const [, sym, long] = a;
      if (isCompound(sym)) throw new TLError('E253', `tl.def: the symbol '${sym}' is itself a compound name; a symbol is a short word`, file, lineNo);
      if (BUILTIN_NAMES.has(sym)) throw new TLError('E254', `tl.def: '${sym}' is a word of the language and cannot be a symbol`, file, lineNo);
      if (aliases.has(sym) && aliases.get(sym) !== long) throw new TLError('E251', `tl.def: the symbol '${sym}' already stands for '${aliases.get(sym)}'`, file, lineNo);
      if (longs.has(long) && longs.get(long) !== sym) throw new TLError('E252', `tl.def: '${long}' already has the symbol '${longs.get(long)}'`, file, lineNo);
      aliases.set(sym, long);
      longs.set(long, sym);
      return;
    }
    const m = /^(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/.exec(line);
    if (!m) throw new TLError('E250', `malformed tl.def entry: ${line}`, file, lineNo);
    const [, sym, kind, name, restRaw] = m;
    const { rest, doc } = splitDoc(restRaw);
    const e = { sym, kind, name, doc, pub: /\bpub\b/.test(rest), line: lineNo + 1 };

    if (kind === 'fn' || kind === 'method') {
      const sig = /^\(([^)]*)\)\s*(.*)$/.exec(rest);
      e.params = sig ? parseParams(sig[1]) : [];
      const after = sig ? sig[2] : rest;
      const errs = /(?:^|\s)!([A-Za-z_][\w,]*)/.exec(after);
      e.errors = errs ? errs[1].split(',').filter(Boolean) : [];
      e.async = /\basync\b/.test(after);
      const ret = /(?:^|\s)>(\S+)/.exec(after);
      e.ret = ret ? ret[1] : null;
    } else if (kind === 'type' || kind === 'error') {
      const rec = /^\{([^}]*)\}/.exec(rest);
      const tup = /^\(([^)]*)\)/.exec(rest);
      if (rec) {
        e.fields = parseParams(rec[1]);
        for (const f of e.fields) {
          if (f.short !== f.long) {
            if (fields.has(f.short) && fields.get(f.short) !== f.long) fields.set(f.short, '');
            else fields.set(f.short, f.long);
          }
        }
      } else if (tup) {
        e.tuple = tup[1].split(',').map((s) => s.trim()).filter(Boolean);
        if (kind === 'error') e.fields = parseParams(tup[1]);
      }
      e.derive = (/\bderive\s+([\w ]+?)(?=\s+(pub|pin|invariant|where)\b|$)/.exec(rest) || [, ''])[1].split(/\s+/).filter(Boolean);
    } else if (kind === 'const') {
      const v = /=\s*(.+)$/.exec(rest);
      e.value = v ? v[1].trim() : null;
    } else if (kind === 'mod') {
      e.path = name;
    }
    cur.set(sym, e);
  });
  return { global, mods, fields, aliases };
}

// "(i=userId:I n:str=3 ..xs:[T])" and "{i=id:I a=active:bool=true}"
function parseParams(s) {
  const out = [];
  const re = /(\.\.)?(?:([A-Za-z_]\w*)=)?([A-Za-z_]\w*)(?::((?:&mut |\*mut |&'\w+ )?[^\s=]+))?(?:=(\S+))?/g;
  let m;
  while ((m = re.exec(s))) {
    if (!m[0]) { re.lastIndex++; continue; }
    const [, variadic, short, long, type, def] = m;
    out.push({ short: short || long, long, type: type || null, default: def ?? null, variadic: !!variadic });
  }
  return out;
}

function stripComment(line) {
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inStr = !inStr;
    else if (line[i] === '#' && !inStr && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function splitDoc(rest) {
  const m = /\s*"([^"]*)"\s*$/.exec(rest);
  return m ? { rest: rest.slice(0, m.index), doc: m[1] } : { rest, doc: null };
}
