# XSPICE support

The engine statically links three upstream ngspice code models:

| Model | Supported behavior |
| --- | --- |
| `spice2poly` | Native E/G/F/H polynomial controlled sources, including multivariable polynomials and AC linearization |
| `pwl` | Piecewise-linear controlled sources, interpolation, smoothing, and limiting |
| `pswitch` | PSpice-style continuously varying analog switch, expressed as a native ngspice A-device |

Supply netlists through `Simulation.setNetList()`. Parsing and compatibility
processing use upstream ngspice, including `TABLE` → `pwl` and `VSWITCH` → `pswitch`.

Static integration builds on [gugray's PR #4](https://github.com/eelab-dev/EEcircuit-engine/pull/4).

## Building

```sh
./build-ngspice.sh main
# Or use the next package channel:
./build-ngspice.sh next
npm run build
```

Both channels resolve the latest stable ngspice release on every engine build.
Outputs in `Docker/build/active/`: `spice.js`, `spice.wasm`, `ngspice-native`, and
`build-meta.json`. JavaScript, WASM, and metadata are copied into `src/`.
Metadata records source revisions, toolchains, enabled models, and checksums.

## Tests

```sh
npm run test:node            # existing checks plus XSPICE and error regressions
npm run test:xspice          # analytical fixtures through source and package
npm run test:errors          # startup, fatal exits, malformed circuits/output
npm run test:xspice:native   # same-release native/WASM comparison; needs Docker build
npm run test:browser:all     # browser regression, retention, and XSPICE coverage
```

Fixtures:

- [spice2poly.test.ts](test/xspice/spice2poly.test.ts): polynomial E/F/G/H sources and AC derivatives.
- [pwl.test.ts](test/xspice/pwl.test.ts): interpolation, boundaries, AC slope, and TABLE conversion.
- [pswitch.test.ts](test/xspice/pswitch.test.ts): resistance transitions and VSWITCH conversion.

Set `TEST_ARTIFACT_DIR` to collect numerical comparison reports.

## Failures and lifecycle

Initialization failures, fatal exits, and invalid output reject the corresponding
promises. Create a new `Simulation` instance after a fatal exit. Ordinary circuit
failures allow reuse. Raw output is cleared before each run; convergence warnings
remain available in diagnostics.
