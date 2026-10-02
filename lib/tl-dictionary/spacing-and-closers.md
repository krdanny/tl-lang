# Spacing and closers

## Spaces

Write a single space only in these cases:

1. Between two word-like tokens (names, keywords, numbers) that would otherwise merge: `x 10`, `for u us`, `repeat 3`.
2. Around word operators: `a and b`, `a or b`, `not ready`, `x is Some v`, `0..10 by 2`.
3. Before an operand that starts with `-`, `*`, `.` or `..`: `f -1`, `filter .age`, `print ..xs`.
4. Before a `[` that starts a new list after something indexable: `[[1 2] [3 4]`.
5. Before a `{` that starts a map after an uppercase name.

Everywhere else, write nothing: `n"lala`, `print"a""b`, `f(g x)y`, `xs[1 2 3`, `s&a[1..3`, `break'o`.
Symbolic operators never touch a space: `a+b`, `x>=10`, `c+=1`, `k=v`. `x 1 +2` is an error.

## Closers

Quotes `"`, and `)`, `]`, `}` close automatically at `|`, `<`, `;` or end of file. Write a closer only when more
content follows in the same segment.

```tl
ns[1 2 3|m"hello $ns.len|print m(ns>>sum
```
```text
hello 3 6
```

| Write | Not |
|---|---|
| `n"jgh\|…` | `n"jgh"\|…` |
| `print(f x` at end of segment | `print(f x)` |
| `print"a""b` | `print "a" "b"` |
| `m{a:1 b:2` | `m {"a": 1, "b": 2}` |
| `os.platform()` (empty `()` keeps its `)`) | `os.platform(` |

`tl fmt` rewrites a file into this canonical form; run it when unsure.
