# tl.def — the semantic dictionary

`tl.def` sits next to the `.tl` files (or in a parent folder up to the project root). **It is mandatory**: without
it the compiler stops with `E260`. It gives short source symbols their long names, so each long name is paid for
once instead of at every use, and the generated JavaScript, the error messages and the readable view (`tl view`,
the VS Code extension) show the long names. It allows several lines and `#` comments. An empty `tl.def` is valid
for a project that has nothing to declare.

## Names: `<symbol> <longName>` pairs, all on one line

A compound name (camelCase, several-word PascalCase, snake_case) may not be written in a `.tl` file (`E261`).
It gets a `<symbol> <longName>` pair in `tl.def` and the source uses the symbol, in every position: variable,
parameter, function, type, member after `.`, map key, import. All pairs go on the first line, separated by spaces
(a newline would cost one token per name):

```
ive isValidEmail ui user_id tu toUpperCase
```

```tl
fn ive s:str|s.has"@<ui 7|print(ive"a@b.c")ui("ab".tu
```
```text
true 7 AB
```

The generated JavaScript reads `function isValidEmail(s)`, `let user_id = 7` and calls the member `toUpperCase`.

- The symbol is a plain short word; it cannot be compound (`E253`), a word of the language (`E254`), or stand for two
  names (`E251`); a name has one symbol (`E252`).
- Symbols are global to the project: the same symbol means the same name in every file, and nothing else may use
  that word. File names stay long: `+cb.cb` imports `compareBuild` from `compareBuild.tl`.
- Single words and the language's own names (`type_of`, `parseInt`, `sort_with`, `TypeError`, …) need no entry.
- Strings are not touched: `"includePrerelease"` in quotes is that text.
- `tl def [dir]` writes the file for an existing project: it finds every compound name, picks a symbol that is one
  token, replaces the name in the sources and appends the pair to the names line. `tl def --check` only reports.
- `tl def --expand [dir]` puts the long names back into the sources for a round of editing; `tl def` afterwards
  restores the same symbols.

Whether a symbol saves tokens depends on how often the name is used: the pair costs about the name's tokens plus one,
each use saves the name's tokens minus one. A four-token name pays off from its second use; a two-token name from its
fourth. The rule is still unconditional, because the writer cannot know the final count while writing.

## Typed entries

A typed entry also declares a signature, so the source can omit it. One entry per line: `<symbol> <kind> <CanonicalName> [signature] [clauses] ["doc"]`.
`@mod name` starts a section for `name.tl`; entries before any section apply to every module.

| Kind | Signature | Example |
|---|---|---|
| `fn` | `(short=long:Type …) >Ret !Err,Err [async]` | `gu fn getUser (i=id:int) >U !NF` |
| `type` | `{short=long:Type=default …}` or `(T)` | `U type User {i=id:int n=name:str a=active:bool=true}` |
| `error` | optional `(field:Type)` | `NF error Missing "user not found"` |
| `const` | `Type = value` | `M const maxRetries int = 3` |
| `var` | `Type` | `us var users [U]` |
| `mod` | — | `D mod database` (then `+D` imports `database.tl`) |

## Effects on source

- Functions declared in `tl.def` omit their parameters in source; the short names are in scope:
  `fn gu|…i…`.
- Record fields use short names in source (`u.a`, `U{i:1 n:"Ann"`) and long names in JavaScript (`u.active`).
- The error message of an error comes from its doc string.
- A function listed with `!Err` is known to raise, so callers get `Ok`/`Err` values unless they use `?`.

## Example project

`tl.def`:
```
@mod users
U   type  User      {i=id:int n=name:str a=active:bool=true}
gu  fn    getUser   (i=id:int) >U !NF    "Loads a user."
ls  fn    listUsers () >[U]
NF  error Missing  "user not found"
```

`users.tl`:
```tl
db[U{i:1 n:"Ann"}(U{i:2 n:"Bob"a:false|fn gu|u db>>find x=>x.i==i|if u is Some v|v<else|!NF<<fn ls|db
```

`main.tl`:
```tl
+users|u users.gu 1?|print u.n|print(users.gu 5|for x users.ls|if x.a|print x.n
```
```text
Ann
Err(user not found)
Ann
```

Generated JavaScript for `users.tl` contains `function getUser(id)`, `x.id`, and `new User({ id: 1, name: "Ann" })`.
