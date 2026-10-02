# Third-party code

Two benchmark projects contain code from open-source libraries, used to measure TL against real-world JavaScript.
The TL versions in the `tl/` folders are translations of that code and are covered by the same licenses.

| Folder | Library | Version | License | What is included |
|---|---|---|---|---|
| `Projects/validator/original/`, `original-build/`, `tests/upstream/` | [validator.js](https://github.com/validatorjs/validator.js) | master at 9ff3424 (13.15.x) | MIT — `Projects/validator/LICENSE.validator.js` | library sources and its test files |
| `Projects/semver/original/`, `tests/suite/` | [node-semver](https://github.com/npm/node-semver) | 7.8.5 | ISC — `Projects/semver/LICENSE.node-semver` | library sources and its test files |

`original-build/` is validator.js with `.js` suffixes added to its imports so Node can run the sources directly;
nothing else is changed.
