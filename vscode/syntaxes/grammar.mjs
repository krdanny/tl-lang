// One definition, two TextMate grammars: the readable view (multi-line, strings always closed, words for sigils)
// and the raw one-line source (strings may end at a terminator, `|` `<` `;` separate segments).

const CONTROL = 'if|elif|else|for|while|loop|match|guard|try|catch|finally|break|continue|defer|errdefer|await|yield|with|do|pass|unsafe';
const DECL = 'fn|type|impl|ext|trait|test|error|const|var|let|static|async|gen|get|mut|requires|ensures';
const WORD_OPS = 'and|or|not|is|by|in|as';

export function grammar(kind) {
  const readable = kind === 'readable';
  const interpolation = [
    { name: 'constant.character.escape.tl', match: '\\\\(u\\{[0-9a-fA-F]+\\}|x[0-9a-fA-F]{2}|.)' },
    { name: 'meta.interpolation.tl', begin: '\\{', end: '\\}', beginCaptures: { 0: { name: 'punctuation.section.interpolation.begin.tl' } }, endCaptures: { 0: { name: 'punctuation.section.interpolation.end.tl' } }, patterns: [{ include: '#expression' }] },
    { name: 'variable.other.interpolated.tl', match: '\\$[A-Za-z_][A-Za-z0-9_]*(\\.[A-Za-z_][A-Za-z0-9_]*)*' },
  ];
  const expression = [
    { name: 'string.regexp.tl', match: '\\$re(`+).*?\\1[a-z]*' },
    { name: 'string.regexp.tl', match: '(?<![\\w)\\]}"`])/(?![/\\s])(?:\\\\.|\\[(?:\\\\.|[^\\]\\\\])*\\]|[^/\\\\\\n])+/[a-z]*' },
    { name: 'string.interpolated.raw.tl', begin: '\\$(`+)', end: '\\1', patterns: [{ name: 'variable.other.interpolated.tl', match: '\\$[A-Za-z_][A-Za-z0-9_]*(\\.[A-Za-z_][A-Za-z0-9_]*)*' }] },
    { name: 'string.quoted.other.raw.tl', begin: '(`+)', end: '\\1' },
    { name: 'string.quoted.double.tl', begin: '(\\$[a-z]+)?"', end: readable ? '"' : '"|(?=[|<;])|$', beginCaptures: { 1: { name: 'storage.type.string.tl' } }, patterns: interpolation },
    { name: 'constant.character.tl', match: "'(\\\\u\\{[0-9a-fA-F]+\\}|\\\\x[0-9a-fA-F]{2}|\\\\.|[^\\\\'])'" },
    { name: 'entity.name.label.tl', match: "'[A-Za-z_][A-Za-z0-9_]*" },
    { name: 'constant.numeric.tl', match: '\\b(0x[0-9a-fA-F_]+|0b[01_]+|0o[0-7_]+|[0-9][0-9_]*(\\.[0-9][0-9_]*)?([eE][+-]?[0-9]+)?)([a-z][a-z0-9]*)?\\b' },
    { match: '\\b(fn)\\s+([A-Za-z_][A-Za-z0-9_]*)', captures: { 1: { name: 'storage.type.function.tl' }, 2: { name: 'entity.name.function.tl' } } },
    { match: '\\b(type|impl|ext|trait|error)\\s+([A-Za-z_][A-Za-z0-9_]*)', captures: { 1: { name: 'storage.type.tl' }, 2: { name: 'entity.name.type.tl' } } },
    ...(readable ? [{ name: 'keyword.control.tl', match: '\\b(return|raise|import)\\b' }] : []),
    { name: 'keyword.control.tl', match: `\\b(${CONTROL})\\b` },
    { name: 'storage.type.tl', match: `\\b(${DECL})\\b` },
    { name: 'keyword.operator.word.tl', match: `\\b(${WORD_OPS})\\b` },
    { name: 'constant.language.tl', match: '\\b(true|false|none|null)\\b' },
    { name: 'variable.language.self.tl', match: '\\bself\\b' },
    { name: 'support.function.tl', match: '\\b(print|eprint|panic|assert|type_of|int|float|str|bool|list|set|dict|map|filter|fold|sum|count|join|sort|sort_by|sort_with|take|skip|rev|enum|zip|keys|vals|len|min|max|first|last|any|all|each|new|obj)\\b(?!\\s*=(?!=))' },
    { name: 'variable.other.property.tl', match: '(?<=\\.)[A-Za-z_][A-Za-z0-9_]*' },
    { name: 'entity.name.type.tl', match: '\\b[A-Z][A-Za-z0-9_]*\\b' },
    { name: 'keyword.operator.pipeline.tl', match: '>>|\\|>' },
    { name: 'storage.type.function.arrow.tl', match: '=>' },
    { name: 'keyword.operator.optional.tl', match: '\\?\\?|\\?\\.|\\?' },
    { name: 'keyword.operator.range.tl', match: '\\.\\.=|\\.\\.' },
    { name: 'keyword.operator.comparison.tl', match: '==|!=|>=|>' },
    { name: 'keyword.operator.assignment.tl', match: '\\+=|-=|\\*=|/=|%=|=' },
    { name: 'keyword.operator.arithmetic.tl', match: '\\*\\*|//|[+\\-*/%]' },
    ...(readable ? [] : [
      { name: 'keyword.control.sigil.tl', match: '(?<=^|[|<;])[\\^!+](?=[^=\\s|<;])' },
      { name: 'punctuation.terminator.segment.tl', match: '[|<;]' },
    ]),
    { name: 'punctuation.section.brackets.tl', match: '#\\[|[()\\[\\]{}]' },
  ];
  return {
    $schema: 'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
    name: readable ? 'TL (readable view)' : 'TL',
    scopeName: readable ? 'source.tl.readable' : 'source.tl',
    patterns: [
      ...(readable ? [{ name: 'invalid.illegal.banner.tl', match: '^⚠.*$' }] : []),
      { include: '#expression' },
    ],
    repository: { expression: { patterns: expression } },
  };
}
