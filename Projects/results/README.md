# Token benchmark results

Same spec, same tests, several languages. Tokens counted with the o200k tokenizer (GPT-4o / GPT-5 family). "Reduction" = how many fewer tokens TL uses than that version. TL counts include the project dictionary (`tl.def`), which is mandatory.

| Project | JS tokens | TS tokens | TL tokens | TL reduction vs JS | TL reduction vs JS without comments | TL reduction vs TS | JS+Express | TL reduction vs Express | tests |
|---|---|---|---|---|---|---|---|---|---|
| Project 1 — Todo REST API | 774 | 870 | 295 | **62%** | same | **66%** | 584 | **49%** | js: ✓ ts: ✓ js-express: ✓ ts-express: ✓ tl: ✓ |
| Project 2 — Log analyzer CLI | 704 | 732 | 495 | **30%** | same | **32%** | — | — | js: ✓ ts: ✓ tl: ✓ |
| Project 3 — Inventory manager | 747 | 842 | 552 | **26%** | same | **34%** | — | — | js: ✓ ts: ✓ tl: ✓ |
| Project 4 — Markdown to HTML | 699 | 728 | 584 | **16%** | same | **20%** | — | — | js: ✓ ts: ✓ tl: ✓ |
| Project 5 — Concurrent bank ledger | 395 | 471 | 263 | **33%** | same | **44%** | — | — | js: ✓ ts: ✓ tl: ✓ |
| Project 6 — validator.js (real-world library, 103 modules) | 71443 | — | 41815 | **41%** | **32%** (61301 tokens) | — | — | — | js: ✓ tl: ✓ |
| Project 7 — node-semver (real-world library, 47 modules) | 19189 | — | 9715 | **49%** | **35%** (15044 tokens) | — | — | — | js: ✓ tl: ✓ |
| Project 8 — expressCart (online shop application, 34 modules) | 55690 | — | 36265 | **35%** | **28%** (50143 tokens) | — | — | — | js: ✓ tl: ✓ |
| Project 9 — hackathon-starter (web application, 16 modules) | 57691 | — | 38571 | **33%** | **22%** (49310 tokens) | — | — | — | js: ✓ tl: ✓ |
| Project 10 — Hubot (chat bot application, 18 modules) | 29411 | — | 16964 | **42%** | **26%** (22838 tokens) | — | — | — | js: ✓ tl: ✓ |
| Project 11 — Ungit server (git web UI, 12 modules) | 27773 | — | 17421 | **37%** | **30%** (25051 tokens) | — | — | — | js: ✓ tl: ✓ |
| Project 12 — Raneto (knowledge-base web application, 34 modules) | 14920 | — | 9182 | **38%** | **30%** (13126 tokens) | — | — | — | js: ✓ tl: ✓ |
| **Total** | **279436** | | **172122** | **38%** | **28%** (240132 tokens) | | | | |

Per-project details: `results/<project>.md` and `results/<project>.json`.
