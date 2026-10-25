# Testing Guide

This project supports two testing paths: **main** (default) and **next**.

## Unified Test Command

You can run all tests (build, source, package, browser) with a single command:

**Main Version:**
```bash
npm run test
```

**Next Version:**
```bash
npm run test -- next
```

## Running Tests Manually

### Source Tests

Run tests against the source code (`src/`).

**Main Version:**
```bash
npm run test:source
```

**Next Version:**
```bash
npm run test:source -- next
```
> **Note:** The `--` separator is important to pass arguments to the script.

### Package Tests

Run tests against the built package (`dist/`).

**Main Version:**
```bash
npm run test:package
```

**Next Version:**
```bash
npm run test:package -- next
```

### Browser Tests

Run regression tests in a browser environment using Playwright.

**Main Version:**
```bash
npm run test:browser
```

**Next Version:**
```bash
REF_VERSION=next npm run test:browser
```

## CI/CD (GitHub Actions)

For GitHub Actions, use the `REF_VERSION` environment variable to configure the browser tests.

```yaml
- name: Run Browser Tests (Next)
  run: npm run test:browser
  env:
    REF_VERSION: next
```

## Circuit retention regression

The unified test command now exercises SKY130, deterministic GF180, PTM90, the
30-transistor op-amp, and level-1 circuits through source and package entrypoints.
Each case repeats 500 times in one WASM instance, checks exactly one loaded
circuit after each source, compares numerical results, and limits WASM memory
growth between runs 1 and 500 to less than 64 MiB. Memory is sampled at startup
and runs 1, 10, 50, 100, 200, and 500; a constant heap size is not required.

Run one case after building the package:

```bash
node --import tsx test/test-heap-retention.mts source SKY130
node --import tsx test/test-heap-retention.mts package GF180
node --import tsx test/test-heap-retention.mts source lifecycle
```

The lifecycle case checks first-run cleanup, repeated start and run calls,
circuit replacement, noise/AC switching, independent sequential instances, and preservation
of results returned before cleanup. Circuit diagnostics are executed inside the
test netlists' control sections, including the existing GF180 control block.

`npm run test:browser:all` includes the browser memory regressions and op-amp
benchmark. The 500-run browser memory regressions run only in Chromium; Firefox
and WebKit retain the short lifecycle, simulation regression, and benchmark checks.
Set `TEST_ARTIFACT_DIR` when running the Node heap tests to save JSON
memory measurements to a chosen directory. Browser measurements are attached to
the Playwright report.

Local test helpers may live in `test/local/`, which is ignored by Git and is not
required to run the shared regression suite.

## Development tooling and consumer compatibility

Development uses native TypeScript 7 and Oxlint. No older TypeScript compiler or
compatibility alias belongs in this repository's dependency tree.

```bash
npm ci
npm run check          # Native lint, library types, shared tests and configuration
npm run test:toolchain # Compiler dependency invariant and legacy-octal rejection
npm run build         # Vite JavaScript first, then native declaration emission
npm run test:consumer  # Packed ESM and public declarations with TS6 and TS7 consumers
```

`npm run lint`, `npm run typecheck`, and `npm run build:types` also run separately.
Type checking does not require an existing `dist/`. Vite's JavaScript targets,
package entrypoints, and consumer compiler requirements remain unchanged.

The consumer smoke test packs the current build, installs it in temporary
consumer projects, and checks all public types with declaration checking enabled.
It obtains TypeScript 6.0.3 and 7.0.2 through `npm exec` outside this repository's
development tree. Network access is needed unless those compilers are cached.
Temporary projects are removed on completion. Set `TEST_ARTIFACT_DIR` to retain
the compatibility report. The unified test command includes these checks.

Oxlint's configuration was ported with the official migration tool. Existing
rule severities, options, environments, and generated-file exclusions are explicit
in `.oxlintrc.json`; no additional style preset is enabled. The strict-mode parser
rejects legacy octal literals, covered by `test/fixtures/legacy-octal.txt`.
