# Functions and lambdas

## Functions

`fn name params [>RetType] [!ErrorSet]|body<`. The last segment is the return value; `^value` returns early.

```tl
fn add a b|a+b<fn fact n|if 2>n|1<else|n*(fact n-1<<fn divmod a b|a//b,a%b<q,r divmod 7 2|print(add 2 3)(fact 5)q r
```
```text
5 120 3 1
```

```tl
fn greet name:str times=1|"hi $name"*times<fn opt a b|"$a{b??0}<print(greet"bo")(opt 7
```
```text
hi bo 70
```

- Parameters: `x`, typed `x:int`, default `x=5`, variadic `..xs`, destructured `(x,y)`.
- A parameter typed `str`, `num`, `int`, `bool`, `list`, `map`, `set`, `fn`, `date` or `regex` is **checked at run time**
  (`fn f s:str` panics with `'s' expects str but received a num`); `s:str?` also allows `none`. Other types are erased.
- Trailing operands may be left out when the call ends at `|`, `<`, `;` or a closing bracket: with `fn f a b`,
  `f 1|` passes `none` for `b`. A call with no operands at all is still an error (use `\f` for a reference).
- Types after `>` and error sets after `!` are optional documentation, except `!Err`, which marks a function
  that raises (see errors-and-optionals.md).
- `async fn` for async; `gen` for generators (see pipelines-and-iterators.md).
- Functions can be used before they are declared.

## Lambdas

`x=>expr`, `a b=>expr`, `()=>expr`, block body `x=>|seg|seg<`. Binding a lambda makes a callable local.

```tl
sq x=>x*x|pl a b=>a+b|f x=>|y x*2|y+1<print(sq 4)(pl 2 3)(f 5
```
```text
16 5 11
```

- A lambda may be unparenthesized only as the **last** operand, and its body runs to the end of the operand
  list. If anything follows it (another operand, a named argument), wrap it: `orderby(x=>x.age)desc=true`.
- Placeholders: an operand containing `_` becomes a lambda: `map _*2`, `filter _>3`, `fold 0 _+_`.
- Projections: `.name` is `x=>x.name`; `.0` is the first tuple item: `orderby .age`, `map .1`.
- Function reference without calling: `\f`. Compose with a lambda: `clean x=>upper(trim x)`.

```tl
xs[5 3 8|print(xs>>map _*10>>list)(xs>>filter _>4>>list)(xs>>fold 0 _+_
```
```text
[50, 30, 80] [5, 8] 16
```

## Returning early

```tl
fn neg xs|for x xs|if 0>x|^x<<none<print(neg[3 -2 5])(neg[1
```
```text
-2 none
```

Inside a lambda, `^` returns from the lambda.
