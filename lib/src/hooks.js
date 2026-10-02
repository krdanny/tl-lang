// Node.js module customization hooks: lets `node` import .tl files directly,
// the way tsx / ts-node / Node's type stripping do for TypeScript.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileSource, formatError } from './compile.js';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    // Compiled TL imports its siblings as ./name.js; in loader mode those are ./name.tl.
    if (context.parentURL && /\.js$/.test(specifier) && (specifier.startsWith('.') || specifier.startsWith('/'))) {
      const tlUrl = new URL(specifier.replace(/\.js$/, '.tl'), context.parentURL);
      if (fs.existsSync(fileURLToPath(tlUrl))) return { url: tlUrl.href, shortCircuit: true, format: 'module' };
    }
    throw err;
  }
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith('file:') || !new URL(url).pathname.endsWith('.tl')) return nextLoad(url, context);
  const file = fileURLToPath(url.replace(/[?#].*$/, ''));
  const src = fs.readFileSync(file, 'utf8');
  try {
    const { js } = compileSource(src, { file });
    return { format: 'module', source: js, shortCircuit: true };
  } catch (e) {
    const err = new Error(`\n${formatError(e, file)}\n  in ${file}`);
    err.stack = err.message;
    throw err;
  }
}
