# Operators

| TL | Meaning | Notes |
|---|---|---|
| `+ - * / % **` | arithmetic | `/` is float division; `+` also joins strings |
| `//` | floor division | `-7//2` → `-4` |
| `==` `!=` | deep structural equality | works on lists, maps, records |
| `>` `>=` | comparison | **there is no `<` or `<=`**: write `b>a`, `b>=a` |
| `and` `or` `not` | logic, short-circuit | never `&&`, `\|\|`, `!` |
| `a..b` `a..=b` | ranges (exclusive / inclusive) | `0..10 by 2` steps; `(1..=3).rev` counts down |
| `a..` `..b` | open ranges | `xs[2..]`, `xs[..3]` |
| `x?` | propagate error or none | see errors-and-optionals.md |
| `x??d` | `d` if `x` is none or an error | `d` is evaluated lazily |
| `u?.name` | optional member | none if `u` is none |
| `x>>f a` | pipeline | same as `f x a` |
| `a,b` | tuple | |
| `[0]*3`, `"ab"*2` | repeat | |
| `x is P` | pattern test | see match.md |
| `-x`, `\f` | negate, function reference | |

Precedence, tightest first: member/index/`?` → prefix `- & * \` → `**` → `* / // %` → `+ -` → `.. ..=` →
`== != > >=` → `??` → **application (space)** → `is` → `not` → `and` → `or` → `,` → `=>` → `>>`.

```tl
x 7|print(x>3 and 10>x)(x//2)(x%3)(2**8)(3>=x)(x==7)((0..10).has x
```
```text
true 3 1 256 false true true
```

Range checks: `(lo..hi).has x`, or `x>=lo and hi>x`.
