# Testing

`test"name|body<` declares a test; `test"name"async|…` for async tests. A test passes if its body finishes
without a panic or error. Run with `tl test file.tl` or `tl test dir`.

```tl
fn add a b|a+b<test"add|assert(add 2 3)==5<test"split|assert("a-b".split"-")==["a""b<test"async"async|await sleep 1ms|assert true
```

`tl test` prints:
```text
  ok   add
  ok   split
  ok   async

3 passed, 0 failed
```

- `assert cond` or `assert cond "message"`; the condition must be `bool`.
- Parenthesize calls inside assertions: `assert(add 2 3)==5`, not `assert add 2 3==5`.
- `==` compares deeply (lists, maps, records).
- Test files are usually named `*.test.tl`; tests may also live in normal modules.
- Top-level code in the file runs before the tests.
