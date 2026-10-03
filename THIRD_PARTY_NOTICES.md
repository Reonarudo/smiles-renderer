# Third-party notices

The library's own TypeScript, tests and scripts are MIT licensed (see `LICENSE`). This does
not relicense its dependencies. Neither is bundled: both are runtime dependencies installed
from the npm registry, pinned exactly in `package.json` and `package-lock.json`. The test suite
checks that the installed packages, the lock file, this notice and the licence copies agree.

## OpenChemLib

`openchemlib` 9.25.0, the JavaScript build of OpenChemLib by Actelion Pharmaceuticals Ltd and
the cheminfo contributors, parses SMILES and SMARTS, generates 2D coordinates and depicts each
structure as SVG.

OpenChemLib is distributed under the **BSD 3-Clause License**; the full text is in
`licenses/OPENCHEMLIB-LICENSE`. Upstream repositories:
<https://github.com/cheminfo/openchemlib-js> (JavaScript build) and
<https://github.com/Actelion/openchemlib> (Java source). npm integrity
`sha512-FGTaZLJRTGXNC7khx8QvX/EiQBHpH1ncUbT7YXDJhw/Y/aDUKe5WrUIqTguMEtSs3GUHcRUjNUhfkpxulx2UXw==`.

## XML parser

`@xmldom/xmldom` 0.9.12 parses OpenChemLib's SVG before it is rebuilt from the allowlist. Its
MIT licence and attribution are in `licenses/XMLDOM-LICENSE`. npm integrity
`sha512-5AXjrcMClTryPe9LgZrygpB1lj7s0S9E0+W+AHaVKAVyHanafK86iPSvG5xHVSp/jC+VH1UXu0TAEmY279xH7A==`.
