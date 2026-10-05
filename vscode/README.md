# TL Readable View

TL (Token Language) source is written for a language model: every `.tl` file is one line, with as few tokens as
possible. This extension is for the people who have to read it. Opening a `.tl` file shows an indented,
syntax-highlighted rendering instead of the line, and that rendering is **read-only**.

```
+sem.Sem|fn parse version options=none the=false|if version is Sem|^version<try|Sem version options<catch e|guard the|^null<!e
```

with the project's dictionary `tl.def` (`Sem SemVer`, `the throwErrors`, …)

is shown as

```
import semver.SemVer

fn parse version options=none throwErrors=false
    if version is SemVer
        return version
    try
        SemVer version options
    catch e
        if not throwErrors
            return null
        raise e
```

## What the view does

- One statement per line, indentation for every body; `elif` / `else` / `catch` line up with their `if` / `try`.
- Shows the long names from the project's `tl.def` instead of the short symbols the source is written with
  (`Sem` → `SemVer`). The toolbar button switches to the symbols as written.
- Puts back what TL leaves out: closing quotes and brackets, and spaces between operands (`print"a"x` → `print "a" x`).
- Spells out the statement sigils: `^x` → `return x`, `+m.f` → `import m.f`, `!E` → `raise E`, a binding `x 5` → `x = 5`.
  (Setting `tl.readable.keywords`, or the toolbar button, switches to the exact TL tokens.)
- Shows long lists, sets and maps with their elements on separate rows.
- Outline and breadcrumbs (functions, types, `impl` blocks and their methods, tests), folding, find, minimap.
- Hover on a word or sigil (`>>`, `??`, `?`, `guard`, …) explains it.
- Compile errors appear in the Problems panel and as a banner on the first line; the rest of the file is still shown.
- Follows the file: when the source changes (the model rewrites it, or `git pull`), the view updates.

The rendering never reorders or rewrites expressions: the tokens are the source's tokens, in order. Operators stay
as written because spacing has meaning in TL: tight operators bind before a call, so `f a+1` is `f(a+1)`.

## Read-only, on purpose

- The readable view is a virtual document: there is nothing to type into or save.
- The one-line source opens locked as well (`tl.lockSource`). **TL: Unlock Raw Source for Editing** lifts the lock
  for that editor when a hand edit is really wanted.

## Commands

| Command | What it does |
|---|---|
| TL: Open Readable View | the rendering, in place of the source tab |
| TL: Open Readable View to the Side | rendering next to the one-line source |
| TL: Open Raw Source (one line) | the file itself (locked) |
| TL: Reveal This Line in Raw Source | selects the segment behind the current readable line |
| TL: Unlock Raw Source for Editing | make the source editable in this editor |
| TL: Toggle Words for Sigils | `return` / `import` / `raise` / `=` on or off |
| TL: Toggle Long Names / Symbols (tl.def) | long names from `tl.def`, or the symbols as written |

## Settings

| Setting | Default | |
|---|---|---|
| `tl.readable.openByDefault` | `true` | opening a `.tl` file shows the readable view |
| `tl.readable.keywords` | `true` | words for the statement sigils |
| `tl.readable.longNames` | `true` | long names from `tl.def` instead of the symbols |
| `tl.readable.indent` | `4` | spaces per level |
| `tl.readable.wrapWidth` | `100` | wrap collection literals on longer lines (0 = never) |
| `tl.lockSource` | `true` | raw source opens read-only |
| `tl.diagnostics` | `true` | compile errors in the Problems panel |

## Build, test, install

```sh
npm install
npm test            # builds dist/extension.js, then runs test/run.cjs
npm run package     # tl-readable-0.2.2.vsix
code --install-extension tl-readable-0.2.2.vsix
```

To try it without installing: open this folder in VS Code and press F5 ("Run TL Readable View").

The rendering is the TL compiler's own `tl view` (`../lib/src/readable.js`), bundled into `dist/extension.js`, so the
editor and the command line show the same text:

```sh
tl view file.tl            # readable view in the terminal
tl view file.tl --sigils   # keep ^ + ! as written
tl view file.tl --short    # the symbols as written, without tl.def's long names
```
