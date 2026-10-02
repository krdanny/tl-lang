// Programmatic API (like the `typescript` package's compiler API).
export { compileSource, compileFile, formatError, inspect } from './compile.js';
export { readable, longNames } from './readable.js';
export { canonicalize, view } from './fmt.js';
export { lex } from './lexer.js';
export { Parser } from './parser.js';
export { parseDef } from './def.js';
export { TLError } from './errors.js';
