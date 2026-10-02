# Literals and strings

| Kind | Examples | Notes |
|---|---|---|
| integer | `42` `1_000` `0xff` `0b101` `0o17` | JS number |
| float | `3.14` `6e23` | |
| suffix | `42u8` `1.5f32` | accepted, informational |
| BigInt | `2**64big`, `10i64` | JS `BigInt` |
| duration | `5s` `250ms` `2min` `1h` `1d` | milliseconds |
| size | `64kib` `2mb` | bytes |
| bool / none | `true` `false` `none` | |
| char | `'x'` `'\n'` | closing quote required |
| string | `"text` | closing `"` only if more follows |
| raw string | `` `C:\path|no escapes` `` | N backticks open and close; nothing is special inside |
| interpolating raw string | `` $`<li>$name</li>` `` | like a raw string, but `$name` interpolates; best for HTML, SQL and templates (no escapes needed) |
| regex | `/^\d+$/i` or `` $re`^\d+$`i `` | compiled `RegExp`; flags follow the closing `/` or backtick |
| bytes | `$b"\x00\x01` | `Uint8Array` |

## Escapes

`\n \t \r \0 \" \\ \| \< \; \{ \} \u{1F600} \x7F`. A `{` in a normal string starts an
interpolation, so write JSON, templates or code as raw strings: `` json.de`{"x":1}` ``. For HTML or templates
that need values, use an interpolating raw string: `` $`<li>$x</li>` `` (no escapes, `$name` interpolates). An unescaped `|`, `<` or `;` **ends the string** (it ends the
segment). Use a raw string for text full of them.

```tl
print"a\|b \<tag> 50\;60"`raw | text < ok`
```
```text
a|b <tag> 50;60 raw | text < ok
```

## Regex literals

`/…/flags` is a regex wherever an operand can start (after `|`, `(`, `:`, `=`, `,`, `and`, `not`, `if`, …) and after a
space when the `/` is glued to what follows (`rx /a+/`, `s.replace /\d/g "#"`). `a/b` and `a//b` stay divisions.
`` $re`…`flags `` is the same thing and is the form to use when the text has `/` outside a `[…]` class or starts with a space.

```tl
rx /^(\+?1)?\d{10}$/|print(rx.test"12025550123")("a1b22".replace /\d+/g"#")("x/y".split /\//
```
```text
true a#b# ["x", "y"]
```

## Interpolation and formatting

`$name` and `$a.b` interpolate a variable or field (one token). `{expr}` interpolates any expression; `{expr:spec}`
formats; `{expr=}` prints `expr=value`. A literal `$` before a letter is written `\$`.

| Spec | Meaning | Example → output |
|---|---|---|
| `.2` | precision | `{3.14159:.2}` → `3.14` |
| `>8` `-8` `^8` | right / left / center pad | `{42:>6}` → `    42` |
| `x` `b` `o` `e` | hex, binary, octal, exponent | `{255:x}` → `ff` |
| `%` | percent | `{0.256:.1%}` → `25.6%` |
| `?` | debug form | `{"a":?}` → `"a"` |

```tl
amt 3.14159|n 42|print"pi={amt:.2} [{n:>5}] [{n:-5}] {255:x} {0.256:.1%} {n=}
```
```text
pi=3.14 [   42] [42   ] ff 25.6% n=42
```

## String helpers

`s.len` (bytes), `s.chars`, `s.upper`, `s.lower`, `s.trim`, `s.split` (whitespace) / `s.split","`, `s.lines`,
`s.has"x"`, `s.starts"x"`, `s.ends"x"`, `s.find"x"` (index or none), `s.replace"a""b"`, `s.rev`, `"-"*3`,
`a+b`, slicing `s[0..3]`, indexing `s[0]` (one UTF-16 unit, like JavaScript; out of range panics — use `s.chars` for code points).

```tl
s"  Hello, TL  ".trim|print s.upper(s.split", ")(s.replace"TL""JS")(s[0..5])("="*5
```
```text
HELLO, TL ["Hello", "TL"] Hello, JS Hello =====
```
