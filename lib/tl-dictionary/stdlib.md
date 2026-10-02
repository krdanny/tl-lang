# Built-ins and standard library

## Global functions

| Group | Names |
|---|---|
| output / checks | `print eprint assert debug_assert panic unreachable todo dbg show type_of exit` |
| conversions | `str int i32 i64 u8 u16 u32 u64 f32 f64 float bool big char` (`f64.parse s` raises on bad input, `int.try s` gives none) |
| optionals / results | `Some Ok Err` |
| HTTP errors | `Missing` (404), `Unauthorized` (401), `Forbidden` (403) take no message; `Invalid"msg"` (400), `Conflict"msg"` (409) — `http.serve` turns them into the status code and `{"error":msg}` |
| async | `sleep spawn run scope timeout thread chan` |
| other | `Cell lazy` |

Iterator helpers (`map filter sum count first sort …`) are pipeline stages and methods; see
pipelines-and-iterators.md.

## Methods on built-in values

| Type | Methods |
|---|---|
| str | `len chars bytes upper lower trim split lines words has starts ends find replace repeat parse rev first last` |
| list | `len push pop first last get insert remove clear retain clone has sort rev at empty` + iterator helpers |
| map | `len get set has del keys vals items clone empty` |
| set | `len has add del union inter diff clone` |
| number | `abs sqrt floor ceil round trunc sign pow min max clamp` |
| result | `ok failed unwrap expect err` (`r.ok`, `r.failed` are booleans) |
| range | `has rev len step` |

## Standard modules (no import needed)

| Module | Functions |
|---|---|
| `fs` | `read p`, `read_bytes p`, `write p s`, `append p s`, `exists p`, `rm p`, `mkdir p`, `ls dir`, `lines p`, `open p` (`.read .lines .close`), `walk dir`, `stat p` |
| `json` | `de text`, `en value [indent]`, `pretty value`, `store path defaults` (a JSON file that loads itself and saves after every change: `st json.store"data.json"{next:1 items:[]}|st.next+=1`) |
| `env` | `get k [default]`, `set k v`, `vars` |
| `proc` | `args`, `run[argv] [check=false]` → `{code out err}`, `sh"cmd"`, `spawn[argv]`, `exit code`, `pid`, `cwd` |
| `time` | `now` (ms epoch), `ms` (monotonic), `since t` |
| `log` | `info/warn/error/debug"msg" key=value…`; `log"msg"` = `log.info` |
| `path` | `join a b…`, `base p`, `dir p`, `ext p`, `abs p` |
| `math` | `sqrt abs floor ceil round pow min max rand randint lo hi PI` |
| `http` | `get url` / `post url data` (async; `.status .body .json`), `serve port handler` (see recipes.md) |

```tl
p"/tmp/tl_stdlib_demo.txt|fs.write p"a\nb|print(fs.lines p)(fs.exists p)(json.en{"k":[1 2]})(json.de`{"x":3}`).x(env.get"NO_SUCH_VAR""dflt")(path.ext p
```
```text
["a", "b"] true {"k":[1,2]} 3 dflt .txt
```

Standard library functions raise errors (for example `IoErr`) directly; handle them with `try|…<catch e|…`.
