# Bindings, mutation and calls

## Bindings

`name value` binds (no `=`). Rebinding the same name shadows it.

```tl
x 10|n"Ann|xs[1 2|m{"k":1|x:u8 5|print x n xs m
```
```text
5 Ann [1, 2] {"k": 1}
```

- Annotation: `x:u8 5`, `xs:[str][]`, `o:int? none`.
- `let name value` forces a binding when `name` is also a function; `const N 3`, `var s 0`.
- Destructuring: `a,b pair`, `[h ..t]xs`, `U{n a}u`, swap `a,b b,a`.

```tl
a,b 1,2|a,b b,a|[h ..t][10 20 30|print a b h t
```
```text
2 1 10 [20, 30]
```

## Mutation

Only as a whole segment: `c=5`, `c+=1`, `-=`, `*=`, `/=`, `//=`, `%=`, `**=`; fields `u.name="Bo"`; indexes
`m["k"]=v`, `xs[0]=9`.

## Calls

- No parentheses, no commas: `add 2 3`, `print"x"y`. The callee's arity decides how many operands it takes.
- Operands are **tight** expressions (no spaces inside). Symbolic operators bind tighter than calls:
  `f x+1` is `f(x+1)`.
- A nested call used as an operand must be parenthesized: `print(add 2 3)`, `f a(g b)c`, `(f x)+1`,
  `n*(fact n-1)`. The last operand may be an unparenthesized call of known arity: `print len xs`.
- Parentheses always group; they are never call syntax. `f(a)+1` passes `(a)+1` to `f`.
- Zero-argument functions are called when named: `ready`, `xs.len`, `u.upper`. Pass one without calling it:
  `\ready`.
- Methods: `x.f a` is the same as `f x a`.

```tl
fn add a b|a+b<fn inc x|x+1<print(add 2 3)(inc 4)+1(inc(add 1 1
```
```text
5 6 3
```

## Named and default arguments

```tl
fn greet name greeting="Hello|"$greeting, $name!<print(greet"Ann")(greet"Bo"greeting="Hi
```
```text
Hello, Ann! Hi, Bo!
```

Variadic: `fn total ..xs|xs>>sum<print(total 1 2 3)`; spread: `f ..list`.

## Binding vs call at the start of a segment

`name operand…` calls `name` when it is a function (your `fn`, a lambda-bound local, a parameter, or a global
built-in such as `print str int big f64 sleep`), otherwise binds. Iterator helpers (`sum count first max …`)
are not global, so they are safe variable names.
