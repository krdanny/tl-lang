# Project 3 — Inventory manager — 2026-10-02

| | JS | TS | TL |
|---|---|---|---|
| files | js/inventory.js | ts/inventory.ts | tl/inventory.tl, tl/tl.def |
| non-empty lines | 83 | 86 | 1 |
| characters | 2608 (100%) | 2984 (114%) | 1525 (58%) |
| tokens o200k (GPT-4o/5) | 747 (100%) | 842 (113%) | 552 (74%) |
| tokens cl100k (GPT-4) | 744 (100%) | 839 (113%) | 548 (74%) |
| token reduction vs JS | — | -13% | 26% |
| of which the dictionary (tl.def) | — | — | 0 tokens |
| source files only | — | — | 552 (26% less than JS) |
| token reduction vs TS | 11% | — | 34% |
| shared tests | pass (1 passed, 0 failed) | pass (1 passed, 0 failed) | pass (1 passed, 0 failed) |
| run | `node js/inventory.js` | `node ts/inventory.ts` | `node ../../lib/bin/tl.js run tl/inventory.tl` |

Percentages in parentheses are the size relative to JavaScript; the reduction rows are how many fewer tokens (o200k) a version uses. TL counts include `tl.def` when present.
