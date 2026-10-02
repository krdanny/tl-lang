# Project 4 — Markdown to HTML — 2026-10-02

| | JS | TS | TL |
|---|---|---|---|
| files | js/md.js | ts/md.ts | tl/md.tl, tl/tl.def |
| non-empty lines | 51 | 55 | 1 |
| characters | 2152 (100%) | 2271 (106%) | 1315 (61%) |
| tokens o200k (GPT-4o/5) | 699 (100%) | 728 (104%) | 584 (84%) |
| tokens cl100k (GPT-4) | 685 (100%) | 714 (104%) | 580 (85%) |
| token reduction vs JS | — | -4% | 16% |
| of which the dictionary (tl.def) | — | — | 0 tokens |
| source files only | — | — | 584 (16% less than JS) |
| token reduction vs TS | 4% | — | 20% |
| shared tests | pass (10 passed, 0 failed) | pass (10 passed, 0 failed) | pass (10 passed, 0 failed) |
| run | `node js/md.js` | `node ts/md.ts` | `node ../../lib/bin/tl.js run tl/md.tl` |

Percentages in parentheses are the size relative to JavaScript; the reduction rows are how many fewer tokens (o200k) a version uses. TL counts include `tl.def` when present.
