# Project 5 — Concurrent bank ledger — 2026-10-02

| | JS | TS | TL |
|---|---|---|---|
| files | js/ledger.js | ts/ledger.ts | tl/ledger.tl, tl/tl.def |
| non-empty lines | 32 | 35 | 1 |
| characters | 1383 (100%) | 1721 (124%) | 727 (53%) |
| tokens o200k (GPT-4o/5) | 395 (100%) | 471 (119%) | 263 (67%) |
| tokens cl100k (GPT-4) | 392 (100%) | 468 (119%) | 258 (66%) |
| token reduction vs JS | — | -19% | 33% |
| of which the dictionary (tl.def) | — | — | 0 tokens |
| source files only | — | — | 263 (33% less than JS) |
| token reduction vs TS | 16% | — | 44% |
| shared tests | pass (3 passed, 0 failed) | pass (3 passed, 0 failed) | pass (3 passed, 0 failed) |
| run | `node js/ledger.js` | `node ts/ledger.ts` | `node ../../lib/bin/tl.js run tl/ledger.tl` |

Percentages in parentheses are the size relative to JavaScript; the reduction rows are how many fewer tokens (o200k) a version uses. TL counts include `tl.def` when present.
