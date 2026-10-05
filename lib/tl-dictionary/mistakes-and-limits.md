# Common mistakes and limits

## Mistakes

| Wrong | Right | Why |
|---|---|---|
| `if a<b\|…` | `if b>a\|…` | `<` always exits a scope; there is no less-than |
| `print add 2 3==5` | `print(add 2 3)==5` | operators bind tighter than calls |
| `n*fact n-1` | `n*(fact n-1)` | same |
| `os.platform()=="linux"` | `p os.platform()\|p=="linux"` | `()=="linux"` would be the argument |
| `x = 5` / `x=5` for a new name | `x 5` | `=` only assigns to existing places |
| `print "a" "b"` | `print"a""b` | minimal spacing and closers |
| `print"a<b"` | `print"a\<b"` | `<` ends a string |
| `if a\|x<\|else\|y` | `if a\|x<else\|y` | `else` directly after `<` |
| `match v\|A\|1<B\|2<\|next` | `match v\|A\|1<B\|2<<next` | close the match with its own `<` |
| `x try\|…<catch E\|…<<next` | `x try\|…<catch E\|…<next` | try/catch bodies each take one `<` |
| `orderby x=>x.age desc=true` | `orderby(x=>x.age)desc=true` | the trailing lambda would absorb `desc=true` |
| `for x in xs\|` | `for x xs\|` | no `in` |
| `a && b`, `!x` | `a and b`, `not x` | `!` raises errors |
| `xs.map(f)` | `xs.map f` or `xs>>map f` | no call parentheses |
| `big 5` as a variable | `bn 5` | `big` is a conversion function |
| file ending in `<` | drop it | end of file closes all scopes |
| newline or comment in `.tl` | none | one physical line |
| `s.split"".rev` | `(s.split"").rev` | a glued `.rev` binds to the `""` argument, not to the call |
| `xs.map ch i=>…` | `xs.enum>>map (i,ch)=>…` | `map` passes one value; `enum` yields `(index, value)` |
| `fn f char\|…`, `list 3` as a name | `fn f ch\|…` | `char`, `list`, `str`, `sum`, `int`, `float` … are prelude functions or types, not free names |
| `fn f s\|assertString s\|…` (hand-written type checks) | `fn f s:str\|…` | annotated simple types are checked at run time |
| `if x==true`, `if s!=none and s!=""` | `if x`, `if s` | conditions use JavaScript truthiness |
| `parseInt(s.charAt i)10` | `int s[i]` | `int` parses digit strings; strings index like JavaScript |
| `+util.*` in every file | `prelude.tl` in the folder | it is imported everywhere automatically |
| `fn isValidEmail s\|…`, `user_id 5`, `s.toUpperCase` | `ive isValidEmail` in `tl.def`, `fn ive s\|…` in the source | compound names live in `tl.def`; the source writes the symbol (`E261`) |
| compiling a folder that has no `tl.def` | create it (`tl def`), even empty | the dictionary is mandatory (`E260`) |
| `fn f M m\|…`, `x=>M` | lowercase names | a capitalized parameter is a type pattern |
| `"$mj.0.0"` | `"{mj}.0.0"` | `$a.b` interpolation takes the `.0` as a member |
| `int x+1` | `(int x)+1` | tight operators bind before the call: `int(x+1)` |
| `xs.set[0]`, `self.set[0]` | `(self.set)[0]` | `set` is a method name, so the glued `[0]` becomes its argument |
| `[V"1" V"2"]` | `[(V"1") (V"2")]` | list elements are tight: a call inside a list needs parentheses |
| `if cmp a b\|…` where `cmp` raises | `if cmp a b?\|…` | an unpropagated result is an `Ok`/`Err` object, which is truthy |
| `cache LRUCache` | `cache new LRUCache` | a bare type name is the type; `new T` or `T args` constructs |
| `LEN 8` | `len8 8` | a capitalized name is a type or variant, so it cannot be bound |
| `m[k]` on a map that may lack `k` | `m.get k` | indexing a missing key panics; `get` gives `none` |
| `xs+ys` for lists | `xs.concat ys` | `+` is not list concatenation |
| `"a\|b"` meant literally | `"a\\|b"` or `` `a\|b` `` | `\|` `\<` `\;` `\{` are the escapes; raw strings need none |
| `x==y` inside an argument: `s.charAt 5==""` | `(s.charAt 5)==""` | tight operators bind before the call |
| `if c a else b` | `if c a b` | inline `if` has no `else` |
| `f x` when `f x` is the last value of a block and `f` is `if` | `^if c a b` | an `if` at segment start is a block; make the value explicit |
| `for h hs\|h 1` to call a function held in a loop variable | `for h hs\|(h 1)` | at segment start `h 1` binds `h`; parentheses make it a call |
| `x -1` | `x-1` | a spaced `-1` is an operand: `x(-1)` |
| `timeout 5`, `error e`, `match m` as variable names | another name | prelude functions (`timeout`, `list`, `str`, …) and keywords (`error match type test ext alias pass static`) cannot be bound; `catch error` fails |
| `x is str or x is num` | `(x is str)or(x is num)` | `or` after `is` continues the pattern |
| `new URLSearchParams{a:"1"}` | `new URLSearchParams #{a:"1"}` | `Name{` is a record literal of type `Name` |
| `o.run` to read a function from a JS object | `o["run"]` | a property that holds a function is called when read last in a chain |
| `req["app"].db` | `req.app.db` | in the middle of a chain a function with parameters is read, not called |
| `{a:1}` or `obj{a:1}` passed to a JS library | `#{a:1}` | `{…}` is a `Map`; `#{…}` is a plain object, and so is every `{…}` nested in it |
| `if not x\|…` | `guard x\|…` | one token less, same meaning |
| `fn all xs\|xs.map(x=>half x?)` called as `all xs` | `all xs?` | `?` or `!` inside a lambda makes the enclosing `fn` raising: without `?` the caller gets `Ok(…)` |
| `try\|x.name<catch e\|…` with `x` none | `if x\|…` or `x?.name` | a panic (member of `none`, index out of range) is not caught by `catch` |
| a plain word that is already a symbol in `tl.def` (`send` when `send sendEmail` exists) | rename the symbol in `tl.def` first | a symbol always compiles to its long name; check `tl.def` before using a short word as a real name |

## Not supported in TL/JS 0.1

- Compile-time code and macros: `$(…)`, `$for`, `$if`, `macro`, `$deco`.
- Effects and handlers: `effect`, `handle`.
- Ownership: `&`, `&mut` are accepted and ignored.
- HTTP route segments `GET/path`, `fuzz`, `bench`, `fixture`, `lock`, `select`, `region`, `arena`, `txn`, `span`.
- Static type checking: types are parsed and erased, and arity and names come from declarations and `tl.def`.
- Integers are JavaScript numbers (no overflow checks; `/` is float division, use `//` for floor division).
- `thread` is a background async task, not an OS thread.
- Tuples are arrays: a tuple pattern `x,y` also matches a two-element list.

## Checklist before answering

- [ ] `tl.def` exists; every compound name has its line there and the source uses only the symbol.
- [ ] One line; no newline, tab or comment.
- [ ] Every `<` closes exactly one body; no `<` used as comparison; no trailing `<`.
- [ ] `elif/else/catch/finally` directly after `<`.
- [ ] Nested calls in operands are parenthesized.
- [ ] Spaces only between words and around `and or not is by`; none around symbolic operators.
- [ ] No closer before `|` `<` `;` or end of file; closers present when more follows.
- [ ] No raw `|` `<` `;` inside strings.
- [ ] Lambdas last or parenthesized.
- [ ] Raising functions declare `!Err`; callers use `?`, `try`, `??` or handle `Ok`/`Err`.
- [ ] Pipelines end in a consumer before printing.
