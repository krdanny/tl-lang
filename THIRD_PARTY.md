# Third-party code

Seven benchmark projects contain code from open-source libraries and applications, used to measure TL against
real-world JavaScript.
The TL versions in the `tl/` folders are translations of that code and are covered by the same licenses.

| Folder | Library | Version | License | What is included |
|---|---|---|---|---|
| `Projects/validator/original/`, `original-build/`, `tests/upstream/` | [validator.js](https://github.com/validatorjs/validator.js) | master at 9ff3424 (13.15.x) | MIT — `Projects/validator/LICENSE.validator.js` | library sources and its test files |
| `Projects/semver/original/`, `tests/suite/` | [node-semver](https://github.com/npm/node-semver) | 7.8.5 | ISC — `Projects/semver/LICENSE.node-semver` | library sources and its test files |
| `Projects/expresscart/original/` | [expressCart](https://github.com/mrvautin/expressCart) | 1.1.19 (commit b31302f) | MIT — `Projects/expresscart/LICENSE.expresscart` | application sources, views, public files and its test files |
| `Projects/hackathon-starter/original/`, `patches/` | [hackathon-starter](https://github.com/sahat/hackathon-starter) | 10.0.0 (commit d390f81) | MIT — `Projects/hackathon-starter/LICENSE.hackathon-starter` | application sources, views, public files, dependency patches and its test files |
| `Projects/hubot/original/` | [Hubot](https://github.com/hubotio/hubot) | commit 628ec6c | MIT — `Projects/hubot/LICENSE.hubot` | application sources and its test files |
| `Projects/ungit/original/`, `tests/suite/` | [Ungit](https://github.com/FredrikNoren/ungit) | 1.5.30 | MIT — `Projects/ungit/LICENSE.ungit` | server sources and its unit tests |
| `Projects/raneto/original/` | [Raneto](https://github.com/ryanlelek/Raneto) | 0.18.1 (commit a42f280) | MIT — `Projects/raneto/LICENSE.raneto` | application sources, example content and its test files |

`original-build/` is validator.js with `.js` suffixes added to its imports so Node can run the sources directly;
nothing else is changed.
