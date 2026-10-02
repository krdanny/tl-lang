# Errors and optionals

## Declare, raise, propagate

- Declare: `error NF` or with fields `error Bad why str`. A trailing string is the message: `error Bad why str"bad: $why"`
  (from JavaScript the error has `name` `Bad` and that `message`).
- A call to a raising function in a condition or a value position must use `?` (or `try`): without it the value is an
  `Ok`/`Err` result, which is always truthy.
- Raise: `!NF`, `!Bad"msg"`. A function that raises declares it: `fn load id!NF|…`.
- Propagate: `call?` returns the error from the current function.
- A call to a raising function **without** `?` gives a value `Ok v` or `Err e`.

```tl
error NF|fn load id!NF|if id==1|"ann<else|!NF<<fn twice id!NF|(load id?)+"!<print(load 1)(load 2)(twice 1|r twice 2|print r.failed
```
```text
Ok("ann") Err(NF) Ok("ann!")
true
```

## Handle

- `try|body<catch NF|…<catch Bad e|e.why<catch e|…<finally|…`, where each body closes with one `<`. It is also
  an expression.
- `match r|Ok v|…<Err e|…<<` for results.
- `(call)??default` gives a default on error or none.
- Result fields and methods: `r.ok`, `r.failed`, `r.unwrap`, `r.expect"msg"`.

```tl
error Bad why str|fn check n|if 0>n|!Bad"negative<n<y try|check -5?<catch Bad e|print"bad:"e.why|0<finally|print"finally<print y((check -1)??7
```
```text
bad: negative
finally
0 7
```

## Raising inside a lambda

A `?` or `!` inside a lambda makes the **enclosing** `fn` a raising function. Its callers must use `?` (or
`try`, `??`) too; a plain call gives the `Ok(…)` object, not the value.

```tl
fn half n!Err|if n%2|!Err"odd<n/2<fn all xs|xs.map(x=>half x?<r all[2 4|print r(all[2 4]?
```
```text
Ok([1, 2]) [1, 2]
```

## Optionals

`T?` holds `none` or a value (no wrapping). Tools: `x??d`, `u?.name`, `o is Some v`, `o.unwrap`, and `x?` inside a
function returning `T?` (returns none early).

```tl
fn lookup id>str?|if id==1|"ann<else|none<<fn initial id>str?|n lookup id?|n.upper<print(lookup 2)((lookup 2)??"guest")(initial 1)(initial 2
```
```text
none guest ANN none
```

## Cleanup, panics, assertions

- `defer expr` runs when the enclosing body exits; `errdefer expr` runs only on error.
- `panic"msg"`, `assert cond "msg"`, `unreachable"msg"`: panics are not caught by `catch`.
- Reading a member of `none` (`x.name`) and indexing out of range (`xs[9]`) are panics as well. Where JavaScript
  code relies on catching a `TypeError`, test the value first (`if x|…`, `x?.name`, `xs.at 9`).
- `!value` rethrows an `Error` or a plain JavaScript object unchanged.
- Standard library functions (`fs.read`, `json.de`, …) raise their errors directly; wrap them in `try|…<catch e|…`.

```tl
fn work|print"step 1|defer print"cleanup|print"step 2<work
```
```text
step 1
step 2
cleanup
```
