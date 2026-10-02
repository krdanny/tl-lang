# Project 4 — Markdown to HTML converter

Converts a Markdown subset to HTML. `<program> <file.md>` prints the HTML to stdout. Output must be
byte-identical to the shared cases.

## Block rules (line by line, top to bottom)

| Input | Output |
|---|---|
| line starting with ```` ``` ```` | fenced code until the next ```` ``` ```` line: `<pre><code>LINES</code></pre>` (lines escaped, joined with `\n`, no inline processing) |
| `# text` … `###### text` | `<h1>INLINE</h1>` … `<h6>` |
| exactly `---` | `<hr>` |
| consecutive lines starting with `> ` or equal to `>` | `<blockquote><p>INLINE</p></blockquote>` (prefix removed, empty lines dropped, lines joined with a space) |
| consecutive lines starting with `- ` | `<ul><li>INLINE</li>…</ul>` |
| consecutive lines starting with `1. ` (any number) | `<ol><li>INLINE</li>…</ol>` |
| blank line | ends the current block |
| anything else | paragraph: consecutive lines joined with a space: `<p>INLINE</p>` |

Blocks are joined with `\n`; the output ends with `\n`. List items and blockquote lines get inline processing.

## Inline rules (applied to INLINE text)

1. Escape `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;` in the whole text first.
2. Code spans `` `x` `` → `<code>x</code>`; nothing inside a code span is processed further.
3. Outside code spans, in this order: links `[text](url)` → `<a href="url">text</a>`,
   bold `**x**` → `<strong>x</strong>`, italic `*x*` → `<em>x</em>`.
