// Names and the dictionary rule (spec §10): a compound name (camelCase, PascalCase of several words, snake_case)
// costs several tokens every time it is written, so it lives in tl.def once and the source uses a short symbol.

import { PRELUDE, PIPELINE, STD, METHODS, KEYWORDS, HTTP_ERRORS, PRIMITIVE_TYPES, JS_GLOBALS } from './prelude.js';

/** camelCase / PascalCase with more than one word, an acronym followed by a word, or snake_case. */
export function isCompound(name) {
  return /[a-z0-9][A-Z]|[A-Z]{2}[a-z]|[A-Za-z0-9]_[A-Za-z0-9]/.test(name);
}

/** Names that belong to the language itself: they need no dictionary entry and cannot be used as symbols. */
export const BUILTIN_NAMES = new Set([
  ...Object.keys(PRELUDE), ...Object.keys(PIPELINE), ...Object.keys(METHODS), ...Object.keys(HTTP_ERRORS),
  ...Object.keys(STD), ...Object.values(STD).flatMap((m) => Object.keys(m)),
  ...KEYWORDS, ...PRIMITIVE_TYPES, ...JS_GLOBALS,
  'and', 'or', 'not', 'is', 'by', 'band', 'bor', 'bxor', 'bnot', 'shl', 'shr', 'self', 'true', 'false', 'none', 'null', '_',
]);

/** Words of a compound name: `isPrereleaseIdentifier` -> is, Prerelease, Identifier; `MAX_LENGTH` -> MAX, LENGTH. */
export function wordsOf(name) {
  return name.split(/_+|(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/).filter(Boolean);
}
