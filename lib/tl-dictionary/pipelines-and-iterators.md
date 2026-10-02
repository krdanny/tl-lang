# Pipelines and iterators

`x>>f a b` is `f x a b` (`>>` is one token; `|>` is accepted and rewritten by `tl fmt`). Stages are lazy; finish with a
consumer before printing. A string before `>>` needs its closing quote: `s.split",">>list`.

```tl
xs[5 3 8 1 9 2|print(xs>>filter _>3>>map _*10>>list)(xs>>sum)(xs>>max)(xs>>sort)(xs>>orderby(x=>x)desc=true
```
```text
[50, 80, 90] 28 9 [1, 2, 3, 5, 8, 9] [9, 8, 5, 3, 2, 1]
```

## Helpers (pipeline stages, also callable as methods: `xs.sum`)

| Kind | Names |
|---|---|
| transform (lazy) | `map f`, `filter p`, `take n`, `skip n`, `step n`, `enum`, `zip ys`, `flat [f]`, `chunks n`, `win n`, `pairs`, `cycle`, `uniq`, `scan init f` |
| consume | `list`, `set`, `dict`, `sum`, `count [p]`, `min`, `max`, `first`, `last`, `fold init f`, `reduce f`, `find p`, `any p`, `all p`, `each f`, `join sep`, `counts`, `groups f`, `oks` |
| order | `sort`, `orderby f [desc=true]`, `rev` |
| maps | `keys`, `vals` |
| async | `all` (await all tasks), `settle`, `race`, `first_ok`, `buffer n` |

These names are not global functions, so `sum`, `count`, `first`… are free variable names. Every name is a single
token in common tokenizers (which is why it is `orderby`, `counts`, `dict`, `groups`, `oks`, `buffer`).

## Common transformations

| Python | TL |
|---|---|
| `[f(x) for x in xs]` | `xs>>map f>>list` |
| `[x for x in xs if p(x)]` | `xs>>filter p>>list` |
| `sum(x*x for x in xs)` | `xs>>map x=>x*x>>sum` |
| `{k: v for k, v in ps}` | `ps>>dict` |
| `Counter(words)` | `words>>counts` |
| `sorted(xs, key=k, reverse=True)` | `xs>>orderby(k)desc=true` |
| `", ".join(xs)` | `xs>>join", "` |

```tl
words"the cat the dog the end".split|c words>>counts|top c.items>>orderby .1 desc=true>>take 2>>list|print(c.get"the"0)top
```
```text
3 [["the", 3], ["cat", 1]]
```

## Generators

`gen name params|…yield v…` returns a lazy iterator.

```tl
gen evens n|for i 0..n|yield i*2<<print(evens 5>>list)(evens 100>>skip 3>>take 3>>list
```
```text
[0, 2, 4, 6, 8] [6, 8, 10]
```
