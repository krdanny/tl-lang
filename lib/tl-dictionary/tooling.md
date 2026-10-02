# Tooling and diagnostics

| Command | Purpose |
|---|---|
| `tl run f.tl [args]` | compile in memory and run |
| `tl check f.tl` | diagnostics only |
| `tl fmt f.tl` / `--check` | rewrite in canonical form (minimal spaces and closers) |
| `tl def [dir]` | create or update `tl.def`: every compound name gets a one-token symbol, the sources are rewritten to use it. `--check` only reports. |
| `tl view f.tl` | readable view for people: one statement per line, indented, closers restored, long names from `tl.def`, `return`/`import`/`raise`/`=` spelled out. `--short` shows the symbols as written, `--sigils` keeps `^ + !`, `--plain` only splits segments. The VS Code extension (`vscode/`) shows the same text read-only when a `.tl` file is opened |
| `tl compile f.tl` | print the generated JavaScript |
| `tl test [files\|dirs]` | run `test"…` blocks |
| `tl init` | create `tlconfig.json`, `package.json`, `src/main.tl`, `src/tl.def` |
| `tlc` | compile the project in `tlconfig.json` (`rootDir`, `outDir`) to `.js` |
| `tlc --watch`, `tlc --noEmit` | recompile on change / check only |
| `node --import tl-lang/register f.tl` | run `.tl` directly with Node |

## Diagnostics

Format: `CODE@module:cCOLUMN message fixes fix1|fix2`, then the source with a caret. The file is one line, so
the column locates the error.

```
E116@main:c22 'f' takes 2 operand(s) but got 1 fixes paren|add-operands
  fn f a b|a+b<print(f 1)
                        ^
```

| Code | Meaning | Usual fix |
|---|---|---|
| E001 | newline in a `.tl` file | join into one line |
| E002 | tab or non-ASCII space | use a single space |
| E004 | space next to a symbolic operator | remove it |
| E101–E103 | expected token / unclosed delimiter | add the closer, or end the segment |
| E104 | `<` with no scope to exit | remove the extra `<` |
| E105 | empty segment (`\|\|`, `<\|`) | remove the extra `\|` |
| E106 | leftover tokens in a segment | parenthesize a nested call, or add `\|` |
| E107 | construct needs a body | add `\|body` |
| E109 | `else`/`catch`/`elif` not after `<` | put it right after the closing `<` |
| E116 | too few operands | pass all arguments, or parenthesize |
| E120 | assignment to a non-place | assign to a variable, field or index |
| E140–E145 | expected an expression / bad interpolation | check quotes and operators |
| E160 | bad pattern | see match.md |
| E240–E241 | module or item not found | check the file name and exports |
| E901 | feature not supported yet | see mistakes-and-limits.md |

Runtime failures print `error: Name` (an uncaught TL error) or `panic: message`.
