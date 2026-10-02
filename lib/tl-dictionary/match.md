# Pattern matching

`match subject|` opens the match. Each arm is `pattern [if guard]|body<`. Close the match with one more `<`.

```tl
type Sh|Circle f64|Rect{w f64 h f64|Empty<fn area s|match s|Circle r|3.14*r*r<Rect{w h|w*h<Empty|0<<<print(area(Circle 1.0))(area(Rect{w:2.0 h:3.0}))(area Empty
```
```text
3.14 6 0
```

## Patterns

| Pattern | Example |
|---|---|
| wildcard | `_` |
| literal | `0`, `"quit"`, `'x'`, `true`, `none` |
| range | `1..=9`, `'a'..='z'` |
| bind | `x` |
| bind whole + test | `1..=9 as d` |
| variant | `Circle r`, `Empty`, `Ok v`, `Err e`, `Some v` |
| record / named variant | `Rect{w h}`, `P{x:0 y}`, `Rect{w ..}` |
| tuple | `x,y`, `(a,b),c` |
| list | `[]`, `[x]`, `[h ..t]`, `[.. last]` |
| alternatives | `Ready or Idle` |
| type | `str s`, `int`, `U u` |

```tl
fn d v|match v|0|"zero<1..=9 as n|"digit $n<x,y if x==y|"diag<x,y|"pt<[|"empty<[h ..t|"head $h<str s|"str $s<_|"other<<<print(d 0)(d 7)(d(2,2))(d(1,2))(d[])(d[5 6 7])(d"hi")(d 99
```
```text
zero digit 7 diag pt empty head 5 str hi other
```

## Subject-less match

Arms are conditions; `_` is the default.

```tl
k 15|match|k%15==0|print"fizzbuzz<k%3==0|print"fizz<_|print k
```
```text
fizzbuzz
```

## Match as a value

```tl
r match 3|1|"one<_|"many<<print r
```
```text
many
```

Matches over a subject panic at run time if no arm matches; add `_` when unsure.

In TL/JS tuples are arrays, so a tuple pattern `x,y` also matches a two-element list. Put the more specific
arm first, or match lists and tuples in separate matches.
