# Async

- `async fn name params|…` declares an async function; `await expr` waits. Top-level `await` is allowed in the
  main file.
- `expr>>await` awaits the end of a pipeline: `urls>>map fetch>>all>>await`.
- `sleep 100ms`, `timeout 2s(task)` (raises `Timeout`), `spawn f`, `scope s|s.spawn f<` (waits for all tasks).
- Channels: `tx,rx chan 10`, `await tx.send v`, `v await rx.recv`, `tx.close`, `for await v rx|…`.
- Limit concurrency with `>>buffer n` on a lazy `map` of async lambdas.

```tl
async fn dbl n|await sleep 10ms|n*2<a await dbl 1|rs[1 2 3]>>map dbl>>all>>await|print a rs
```
```text
2 [2, 4, 6]
```

```tl
scope s|s.spawn()=>print"task ran<print"scope done|t try|await timeout 20ms(sleep 100ms|"done<catch e|"timed out<print t
```
```text
task ran
scope done
timed out
```

```tl
tx,rx chan 2|async fn producer|for i 0..3|await tx.send i<tx.close<producer|for await v rx|print"got"v
```
```text
got 0
got 1
got 2
```

```tl
ys[1 2 3]>>map async x=>|await sleep 5ms|x+1<>>buffer 2>>list>>await|print ys
```
```text
[2, 3, 4]
```

`thread f` runs `f` as a background task (not an OS thread in TL/JS 0.1); `h.join` waits for it.
