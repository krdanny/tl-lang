// Readable text for a TL source, computed by the TL compiler's own lexer and parser (bundled from ../lib).
import { inspect } from '../../lib/src/compile.js';
import { readable, longNames } from '../../lib/src/readable.js';

const cache = new Map(); // file -> { key, result }

/**
 * @param {string} text   contents of the .tl file (possibly unsaved)
 * @param {string} file   its path: imports and tl.def are resolved next to it
 * @param {{ keywords: boolean, longNames: boolean, indent: string, width: number }} opts
 * @returns {{ text: string, lines: object[], symbols: object[], error: object|null }}
 */
export function render(text, file, opts) {
  const key = JSON.stringify([opts.keywords, opts.longNames, opts.indent, opts.width]) + '\0' + text;
  const hit = cache.get(file);
  if (hit && hit.key === key) return hit.result;
  const info = inspect(text, { file });
  const result = readable(info, {
    keywords: opts.keywords,
    indent: opts.indent,
    width: opts.width,
    names: opts.longNames ? longNames(info.def, info.name) : null,
  });
  cache.set(file, { key, result });
  return result;
}

/** Other modules or tl.def changed: call arities and names may differ. */
export function clearCache() { cache.clear(); }
