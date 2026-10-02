# Project 1 — Todo REST API — 2026-10-02

| | JS | TS | JS-EXPRESS | TS-EXPRESS | TL |
|---|---|---|---|---|---|
| files | js/server.js | ts/server.ts | js-express/server.js | ts-express/server.ts | tl/server.tl, tl/tl.def |
| non-empty lines | 71 | 74 | 53 | 57 | 2 |
| characters | 2847 (100%) | 3243 (114%) | 2081 (73%) | 2707 (95%) | 831 (29%) |
| tokens o200k (GPT-4o/5) | 774 (100%) | 870 (112%) | 584 (75%) | 733 (95%) | 295 (38%) |
| tokens cl100k (GPT-4) | 764 (100%) | 860 (113%) | 583 (76%) | 732 (96%) | 295 (39%) |
| token reduction vs JS | — | -12% | 25% | 5% | 62% |
| of which the dictionary (tl.def) | — | — | — | — | 4 tokens |
| source files only | — | — | — | — | 291 (62% less than JS) |
| token reduction vs TS | 11% | — | 33% | 16% | 66% |
| shared tests | pass (22 passed, 0 failed) | pass (22 passed, 0 failed) | pass (22 passed, 0 failed) | pass (22 passed, 0 failed) | pass (22 passed, 0 failed) |
| run | `node js/server.js` | `node ts/server.ts` | `node js-express/server.js` | `node ts-express/server.ts` | `node ../../lib/bin/tl.js run tl/server.tl` |

Percentages in parentheses are the size relative to JavaScript; the reduction rows are how many fewer tokens (o200k) a version uses. TL counts include `tl.def` when present.
