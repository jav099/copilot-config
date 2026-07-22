'use strict';

/**
 * Load a caller-provided Playwright package. This skill never installs
 * Playwright and does not reach into another skill's files - the caller
 * (or the `playwright-browser-runner` skill's resolve-playwright.cjs) is
 * expected to supply a working package path.
 *
 * Resolution order:
 *   1. --playwright-package <dir> / { playwrightPackage } option
 *   2. Any directory on NODE_PATH that contains a `playwright` package
 *   3. Normal `require.resolve('playwright')` from the given cwd
 *
 * Throws a clear, actionable error if none resolve. Never installs anything.
 */

const fs = require('fs');
const path = require('path');

function fromNodePath(diagnostics) {
  const nodePath = process.env.NODE_PATH;
  if (!nodePath) {
    diagnostics.push('NODE_PATH is not set');
    return null;
  }
  for (const dir of nodePath.split(path.delimiter)) {
    const candidate = path.join(dir, 'playwright');
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
  }
  diagnostics.push(`no playwright found on NODE_PATH (${nodePath})`);
  return null;
}

function fromCwdResolve(cwd, diagnostics) {
  try {
    const resolved = require.resolve('playwright/package.json', { paths: [cwd] });
    return path.dirname(resolved);
  } catch (e) {
    diagnostics.push(`cwd-resolve failed from ${cwd}: ${e.message}`);
    return null;
  }
}

function loadPlaywright({ playwrightPackage, cwd = process.cwd() } = {}) {
  const diagnostics = [];
  let packageDir = null;

  if (playwrightPackage) {
    if (fs.existsSync(path.join(playwrightPackage, 'package.json'))) {
      packageDir = playwrightPackage;
    } else {
      diagnostics.push(`--playwright-package given but no package.json at ${playwrightPackage}`);
    }
  }

  if (!packageDir) packageDir = fromNodePath(diagnostics);
  if (!packageDir) packageDir = fromCwdResolve(cwd, diagnostics);

  if (!packageDir) {
    const message =
      'Playwright not found. Pass --playwright-package <dir>, set NODE_PATH, or run ' +
      'this from a directory where `playwright` resolves. The playwright-browser-runner ' +
      "skill's resolve-playwright.cjs can locate a working package and print its path.\n" +
      `Diagnostics: ${diagnostics.join('; ')}`;
    throw new Error(message);
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  return { playwright: require(packageDir), packageDir, version: pkg.version };
}

module.exports = { loadPlaywright };
