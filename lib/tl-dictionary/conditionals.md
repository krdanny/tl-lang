# Conditionals

## if / elif / else

Conditions follow JavaScript truthiness: `none`, `false`, `0`, `""` and `NaN` are false, everything else is true (`if xs.len>0` is clearer than `if xs`, but both work).

```tl
fn grade n|if n>=90|"A<elif n>=80|"B<else|"C<<print(grade 95)(grade 85)(grade 10
```
```text
A B C
```

## Inline if (a value)

`if cond a b` with three tight operands:

```tl
n 7|kind if n%2==0"even""odd|print n kind
```
```text
7 odd
```

Block form as a value: `v if c|a<else|b`.

## guard (early exit)

`guard cond|body` runs `body` when `cond` is false; the body must leave (`^`, `break`, `continue`, `!Err`).
Names bound by `is` in the condition stay visible after the guard.

```tl
fn pos n|guard n>0|^"not positive<"ok $n<print(pos -1)(pos 3
```
```text
not positive ok 3
```

## is (pattern test)

`value is Pattern` is a `bool`; in `if`/`elif`/`while`/`guard` its bindings are usable in the body.

```tl
o:int?5|if o is Some v and v>3|print"big"v<else|print"no
```
```text
big 5
```
