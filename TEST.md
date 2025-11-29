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
