# Project 2 — Log analyzer CLI — 2026-10-05

| | JS | TS | TL |
|---|---|---|---|
| files | js/analyze.js | ts/analyze.ts | tl/analyze.tl, tl/tl.def |
| non-empty lines | 42 | 42 | 1 |
| characters | 1953 (100%) | 2070 (106%) | 1067 (55%) |
| tokens o200k (GPT-4o/5) | 704 (100%) | 732 (104%) | 492 (70%) |
| tokens cl100k (GPT-4) | 697 (100%) | 725 (104%) | 484 (69%) |
| token reduction vs JS | — | -4% | 30% |
| of which the dictionary (tl.def) | — | — | 0 tokens |
| source files only | — | — | 492 (30% less than JS) |
| token reduction vs TS | 4% | — | 33% |
| shared tests | pass (3 passed, 0 failed) | pass (3 passed, 0 failed) | pass (3 passed, 0 failed) |
| run | `node js/analyze.js` | `node ts/analyze.ts` | `node ../../lib/bin/tl.js run tl/analyze.tl` |

Percentages in parentheses are the size relative to JavaScript; the reduction rows are how many fewer tokens (o200k) a version uses. TL counts include `tl.def` when present.
