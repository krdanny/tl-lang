# Writing TL — core rules for LLMs

TL is a token-minimal language that compiles to JavaScript and runs on Node.js (TL/JS 0.1). The parser never
guesses: follow these rules exactly. This file holds only the rules every program needs. For anything
specific, open the matching file in `tl-dictionary/` (see the index at the end) instead of guessing.

## The dictionary rule (read this first)

**Every TL project has a `tl.def` file, and no compound name is ever written in a `.tl` file.**

- A compound name is camelCase, PascalCase of several words, or snake_case: `isValidEmail`, `SemVer`,
  `user_id`, `MAX_LENGTH`, and also JavaScript members such as `toUpperCase`, `startsWith`.
- Give it a short symbol in `tl.def` as a pair `<symbol> <longName>`, all pairs on the first line separated by
  spaces, and write only the symbol in the source:

  `tl.def`:
  ```
  ive isValidEmail ui user_id
  ```
  source: `fn ive s:str|s.has"@"<print(ive"a@b.c")`

- Plain single words (`name`, `options`, `count`, `parse`) and the language's own names (`type_of`, `parseInt`,
  `sort_with`, …) are written as they are: they need no entry.
- A symbol is a short plain word that is not used for anything else in the project and is not a word of the
  language. It means the same thing in every file. One symbol per name, one name per symbol.
- When you introduce a new compound concept, add its line to `tl.def` in the same change.
- The generated JavaScript, error messages and the readable view use the long names.
- Without `tl.def` nothing compiles (`E260`; an empty file is fine when there is nothing to declare). A compound
  name in a source is `E261`. `tl def` creates the file, picks one-token symbols and rewrites the sources.

## The ten rules that matter most

1. **A `.tl` file is one physical line.** No newlines, tabs or comments.
2. **`|` ends a segment and enters a body; `<` exits one body.** After `<` the next segment follows directly:
   `if x>10|print"big<print"done`. Never end a file with `<`.
3. **Continuation keywords** (`elif else catch finally`, and `while` after `do`) come directly after the `<`
   that closed the body they continue: `if a|x<else|y`.
4. **No `<` operator.** Write `b>a` for "a less than b" and `b>=a` for "a ≤ b". Logic is `and or not`.
5. **Spaces only where needed**: between two words/numbers (`x 10`, `for u us`), around `and or not is by`,
   and before an operand starting with `- * . ..`. Never around symbolic operators (`a+b`, `c+=1`).
6. **Closers only when more follows**: `n"Ann|print n`, `xs[1 2 3|…`; but `print"a""b` (first `"` needed).
   Map literals use bare keys: `{status:200 body:t}`.
7. **Calls have no parentheses or commas**: `add 2 3`. Operands are tight expressions, so a nested call must be
   parenthesized: `print(add 2 3)`, `(f x)+1`, `assert(f x)==y`. `f x+1` means `f(x+1)`.
8. **Binding vs call**: `name value` binds when `name` is not a function, and calls it when it is:
   `x 10` binds, `print x` calls.
9. **Strings end at an unescaped `|`, `<` or `;`.** Escape them (`\|`, `\<`, `\;`), or use a raw string in backticks;
   `` $`<b>$name</b>` `` is a raw string with `$name` interpolation (best for HTML/templates). In normal strings
   `$name` interpolates a variable and `{expr}` any expression.
10. **Errors**: raise with `!Err`, propagate with `call?`, handle with `try|…<catch Err|…`. Optionals are
    `T?`, `none`, `x??default`, `o is Some v`.

```tl
fn classify n|if n>100|"huge<elif n>10|"big<else|"small<<for n[5 50 500|print n(classify n
```
```text
5 small
50 big
500 huge
```

## Workflow

`tl def` (create or update `tl.def`) → `tl check f.tl` (diagnostics like `E116@main:c22 … fixes …`, `c22` = column) → `tl shrink f.tl` (canonical
spacing and closers, and every token that does not change the program removed) → `tl run f.tl` / `tl test` / `tlc`.

## Dictionary: open the file for the task

| When you need to… | Read |
|---|---|
| understand `\|`, `<`, `;`, nesting, `else`/`catch` placement | `tl-dictionary/structure.md` |
| decide where a space or a closing quote/bracket goes | `tl-dictionary/spacing-and-closers.md` |
| bind, mutate, destructure, call, use named/default args | `tl-dictionary/bindings-and-calls.md` |
| write numbers, durations, strings, interpolation, format specs, raw strings, regex | `tl-dictionary/literals-and-strings.md` |
| look up an operator (comparison, ranges, `??`, `?.`, `//`, `>>`) | `tl-dictionary/operators.md` |
| use lists, maps, sets, tuples, indexing, slicing, spread | `tl-dictionary/collections.md` |
| write `if`/`elif`/`else`, inline if, `guard`, `is` tests | `tl-dictionary/conditionals.md` |
| write any loop: for, ranges, while, do-while, loop value, labels, for-else | `tl-dictionary/loops.md` |
| pattern match (`match`, all pattern forms, guards) | `tl-dictionary/match.md` |
| declare functions, lambdas, `_` placeholders, `.field` projections, return | `tl-dictionary/functions-and-lambdas.md` |
| use pipelines `>>`, iterator helpers, generators | `tl-dictionary/pipelines-and-iterators.md` |
| declare records, enums, tuple structs, methods, traits, extensions | `tl-dictionary/types-and-methods.md` |
| raise/handle errors, results, optionals, `defer`, `panic`, `assert` | `tl-dictionary/errors-and-optionals.md` |
| write async code, tasks, timeouts, channels | `tl-dictionary/async.md` |
| import TL modules, Node modules, npm packages, JS files | `tl-dictionary/modules-and-interop.md` |
| find a built-in function, method or std module (`fs json env proc log http …`) | `tl-dictionary/stdlib.md` |
| write a `tl.def` semantic dictionary | `tl-dictionary/tl-def.md` |
| write tests | `tl-dictionary/testing.md` |
| copy a ready recipe (files, JSON, CLI args, processes, HTTP server) | `tl-dictionary/recipes.md` |
| check what is unsupported and review common mistakes | `tl-dictionary/mistakes-and-limits.md` |
| use the `tl`/`tlc` tools and read diagnostics | `tl-dictionary/tooling.md` |
