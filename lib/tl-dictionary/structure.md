# Structure: segments and scopes

| Symbol | Meaning |
|---|---|
| `\|` | ends a segment; if the segment started a construct with a body, enters that body |
| `<` | ends the segment and exits **one** body (`<<` two, `<<<` three) |
| `;` | ends a declaration that has no body, when a sibling follows |
| end of file | closes everything (never write a trailing `<`) |

Constructs with a body: `fn gen type trait impl ext if elif else match` (and each match arm) `guard while for
loop repeat do try catch finally with scope test unsafe`, lambda blocks `x=>|…<`.

After a `<`, the next segment starts immediately — no `|`.

```tl
x 12|if x>10|print"big<print"done
```
```text
big
done
```

Count `<`: one for every body you leave. A `match` inside a function needs three to get back out: arm, match,
function (`fn f v|match v|_|1<<<print(f 0)`).

```tl
for i 1..3|for j 1..3|if i==j|print i j<<<print"end
```
```text
1 1
2 2
end
```

## Continuation keywords

`elif`, `else`, `catch`, `finally`, and `while` after `do|…`, must come directly after the `<` that closed the
body they continue. `else` attaches to the construct whose body that `<` just closed.

```tl
a true|b false|if a|if b|print"both<else|print"a only
```
```text
a only
```

With `<<else`, the `else` belongs to the outer `if` instead.

## Bodyless declarations

`;` ends a declaration without entering a body when another segment follows. Before `<` or end of file it is
not needed.

```tl
type Id(int;type Name(str;i Id 5|print i.0
```
```text
5
```

## Blocks as values

`if`, `match`, `try`, `loop`, `do` produce values; a body's value is its last segment.

```tl
v do|a 3|b 4|a*b<print v
```
```text
12
```
