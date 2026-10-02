# Collections

| Kind | Literal | JS value |
|---|---|---|
| list | `[1 2 3` / `[]` | `Array` |
| map | `{a:1 b:2` / `{}` | `Map`; bare keys are strings, `"a b":1` or `(expr):1` for other keys |
| set | `#[1 2 3` | `Set` |
| tuple | `1,"x"` | array |
| range | `0..10` | lazy range |

Elements are tight expressions separated by spaces; nested calls need parentheses: `[(f 1)(f 2)`.

```tl
xs[3 1 2|xs.push 4|m{"a":1"b":2|m["c"]=3|s#[1 2 2|t 1,"x|print xs.len xs[0](m.get"z"0)m.keys s.len t[1
```
```text
4 3 0 ["a", "b", "c"] 2 x
```

## Access

- `xs[i]` (panics out of range), `xs.get i` (none if missing), `xs.get i d` (default), `xs.first`, `xs.last`
- slices `xs[1..3]`, `xs[..2]`, `xs[2..]`; nested `mat[1][0]`
- maps: `m[k]` (panics if missing), `m.get k`, `m.get k 0`, `m.has k`, `m.keys`, `m.vals`, `m.items`, `m.del k`;
  string keys also read and write as fields: `m.name`, `m.count+=1` (JSON objects behave the same way)
- sets: `s.has x`, `s.add x`, `s.union t`, `s.inter t`, `s.diff t`

## Change

`xs.push x`, `xs.pop`, `xs.insert i x`, `xs.remove i`, `xs.retain p`, `xs.sort` (in place), `xs.clear`,
`m[k]=v`, `m[k]+=1`, `xs[i]=v`.

## Build

Spread `[..a ..b 0`, `{..m k:1`; repeat `[0]*3`; from pipelines `xs>>list`, `xs>>set`, `pairs>>dict`.
Map keys are bare when they are words, numbers and `-` glued to the `:` (`{en-US:1 0:"z"}`, always string keys);
anything else is an expression key (`{"a b":1 (k):v}`).

```tl
a[1 2|b[..a 3|mat[[1 2] [3 4|print b(b>>set)mat[1][0]([0]*3
```
```text
[1, 2, 3] #[1, 2, 3] 3 [0, 0, 0]
```
```tl
m{en-US:"."0:"zero"sr-RS:",|print m["en-US"]m["0"]m.size
```
```text
. zero 3
```

`xs.sort_with (a b=>a-b)` sorts in place with a comparator (JavaScript's sort); `xs>>sort_with f` sorts a copy.

## Iterate

`for x xs|…`, `for i,x xs.enum|…`, `for k,v m|…`. See loops.md and pipelines-and-iterators.md.
