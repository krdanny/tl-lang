# Loops

| Intent | TL |
|---|---|
| each element | `for x xs\|…` |
| counted range | `for i 0..10\|…` (exclusive), `0..=10` (inclusive) |
| step / reverse | `for i 0..100 by 5\|…`, `for i(1..=10).rev\|…` |
| repeat N times | `repeat 3\|…`, with counter `repeat 3 i\|…` |
| while | `while cond\|…` |
| do-while | `do\|…<while cond` |
| infinite | `loop\|…` |
| loop with a value | `v loop\|…\|break value` |
| pattern loop | `while q.pop is Some j\|…` |
| index + value | `for i,x xs.enum\|…` |
| pairs | `for a,b xs.zip ys\|…` |
| map entries | `for k,v m\|…` |
| mutate in place | `for x&mut xs\|x*=2` |
| async stream | `for await x stream\|…` |
| skip / stop | `continue`, `break`, `break value` |
| nested exit | `'o for …\|for …\|break'o` |
| no-break clause | `for …\|…<else\|…` |

There is no C-style `for(;;)`.

```tl
for i 0..3|print i<for i 0..=10 by 5|print i<for i(1..=3).rev|print i<repeat 2 k|print"r"k<n 0|while 3>n|n+=1<do|n-=1<while n>0|v loop|n+=1|if n==4|break n*10<<print n v
```
```text
0
1
2
0
5
10
3
2
1
r 0
r 1
4 40
```

## continue, labels, for-else

```tl
for x[1 2 3 4|if x%2==0|continue<print"odd"x<'o for a 1..4|for b 1..4|if a*b==6|print"found"a b|break'o<<<for q[3 5|if q==4|break<<else|print"no four
```
```text
odd 1
odd 3
found 2 3
no four
```

`else` after a loop runs only when the loop finished without `break`.

## Collections

```tl
for i,x["a""b"].enum|print i x<for k,v{"x":1|print k v<xs[1 2 3|for x&mut xs|x*=10<print xs|st[1 2|while st.pop is Some t|print"pop"t
```
```text
0 a
1 b
x 1
[10, 20, 30]
pop 2
pop 1
```

Do not add or remove elements of a list while looping over it; build a new list with a pipeline instead.
