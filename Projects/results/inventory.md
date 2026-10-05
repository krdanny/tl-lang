# Project 3 — Inventory manager — 2026-10-05

| | JS | TS | TL |
|---|---|---|---|
| files | js/inventory.js | ts/inventory.ts | tl/inventory.tl, tl/tl.def |
| non-empty lines | 83 | 86 | 2 |
| characters | 2608 (100%) | 2984 (114%) | 1495 (57%) |
| tokens o200k (GPT-4o/5) | 747 (100%) | 842 (113%) | 550 (74%) |
| tokens cl100k (GPT-4) | 744 (100%) | 839 (113%) | 546 (73%) |
| token reduction vs JS | — | -13% | 26% |
| of which the dictionary (tl.def) | — | — | 3 tokens |
| source files only | — | — | 547 (27% less than JS) |
| token reduction vs TS | 11% | — | 35% |
| shared tests | pass (1 passed, 0 failed) | pass (1 passed, 0 failed) | pass (1 passed, 0 failed) |
| run | `node js/inventory.js` | `node ts/inventory.ts` | `node ../../lib/bin/tl.js run tl/inventory.tl` |

Percentages in parentheses are the size relative to JavaScript; the reduction rows are how many fewer tokens (o200k) a version uses. TL counts include `tl.def` when present.
