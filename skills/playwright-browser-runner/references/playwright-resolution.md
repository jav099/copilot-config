# Playwright Package Resolution

## Priority order

1. **Project dependency**: `require.resolve('playwright/package.json', { paths: [cwd] })` - normal
   Node resolution starting at the working directory. This is what a repo with Playwright as a
   declared dependency would use.
2. **Global npm package**: `npm root -g`, then check `<root>/playwright`.
3. **Persistent npx cache**: `~/.npm/_npx/*/node_modules/playwright`. Multiple cached versions can
   coexist under different hash directories; pick the **newest version** (compare `package.json`
   `version` fields), not the most recently modified directory.
4. **`/tmp/node_modules/playwright`**: explicitly ephemeral fallback. Only used if nothing else
   resolves. The result is flagged `ephemeral: true` in the JSON output.
5. **Unavailable**: exit non-zero with a diagnostics list explaining what was tried. **Stop and ask
   the user before installing anything.** Never install Playwright silently at any priority level.

Every candidate is validated before being accepted: read `package.json` version, then `require()`
the package directory and confirm it exports a `chromium` launcher. A stale or corrupt cache entry
is skipped with a diagnostic, not silently accepted.

## Verified environment fact

In this environment, Playwright **1.61.1** in the persistent npx cache
(`~/.npm/_npx/<hash>/node_modules/playwright`) successfully launches the local Chromium source
build. A second, older cached version (1.58.2) also exists in a different hash directory - the
resolver picks 1.61.1 because it compares versions, not directory mtimes.

## CLI usage

```bash
node scripts/resolve-playwright.cjs [--cwd <dir>]
```

Prints JSON: `{ ok, source, packageDir, nodeModulesPath, version, diagnostics }` (or
`{ ok: false, diagnostics }` on failure). Exit code mirrors `ok`.

## Importable API

```js
const { resolvePlaywright } = require('./resolve-playwright.cjs');
const resolved = resolvePlaywright({ cwd: process.cwd() });
if (resolved.ok) {
  const playwright = require(resolved.packageDir);
}
```
