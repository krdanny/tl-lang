// Builds dist/extension.js (one CommonJS file: the extension plus the TL lexer/parser from ../lib) and the grammars.
import fs from 'node:fs';
import { build } from 'esbuild';
import { grammar } from './syntaxes/grammar.mjs';

fs.writeFileSync(new URL('./syntaxes/tl.tmLanguage.json', import.meta.url), JSON.stringify(grammar('raw'), null, 2) + '\n');
fs.writeFileSync(new URL('./syntaxes/tl-readable.tmLanguage.json', import.meta.url), JSON.stringify(grammar('readable'), null, 2) + '\n');

await build({
  entryPoints: ['src/extension.js'],
  outfile: 'dist/extension.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  // the compiler locates its runtime with import.meta.url; in the bundle that is this file
  define: { 'import.meta.url': '__tlBundleUrl' },
  banner: { js: "const __tlBundleUrl = require('node:url').pathToFileURL(__filename).href;" },
  logLevel: 'info',
});
