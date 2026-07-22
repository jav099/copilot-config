#!/usr/bin/env node
'use strict';

/**
 * Resolve a usable Playwright package without ever installing anything.
 *
 * Priority order:
 *   1. Normal `require.resolve` from the working directory (project dependency).
 *   2. Globally resolvable package (`npm root -g`).
 *   3. Persistent npx cache (~/.npm/_npx/* /node_modules/playwright), newest version.
 *   4. /tmp/node_modules/playwright - explicitly ephemeral fallback.
 *   5. Otherwise, fail with a clear diagnostic. Never install silently.
 *
 * Usable both as a CLI (prints JSON) and as a Node module:
 *   const { resolvePlaywright } = require('./resolve-playwright.cjs');
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

function compareVersions(a, b) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function readVersion(packageJsonPath) {
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return pkg.version || null;
  } catch {
    return null;
  }
}

// Validate a candidate `playwright` package directory by requiring it and
// reading back its version. This confirms the package actually loads, not
// just that a package.json happens to exist on disk.
function validateCandidate(packageDir, diagnostics) {
  const packageJsonPath = path.join(packageDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    diagnostics.push(`${packageDir}: no package.json`);
    return null;
  }
  const version = readVersion(packageJsonPath);
  if (!version) {
    diagnostics.push(`${packageDir}: package.json missing version`);
    return null;
  }
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const mod = require(packageDir);
    if (!mod || typeof mod.chromium === 'undefined') {
      diagnostics.push(`${packageDir}: loaded but missing chromium export`);
      return null;
    }
  } catch (e) {
    diagnostics.push(`${packageDir}: failed to load (${e.message})`);
    return null;
  }
  return version;
}

function tryCwdResolve(cwd, diagnostics) {
  try {
    const resolved = require.resolve('playwright/package.json', { paths: [cwd] });
    const packageDir = path.dirname(resolved);
    const version = validateCandidate(packageDir, diagnostics);
    if (!version) return null;
    return {
      source: 'cwd-resolve',
      packageDir,
      nodeModulesPath: path.dirname(packageDir),
      version,
    };
  } catch (e) {
    diagnostics.push(`cwd-resolve: not found from ${cwd} (${e.message})`);
    return null;
  }
}

function tryGlobalResolve(diagnostics) {
  let globalRoot;
  try {
    globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  } catch (e) {
    diagnostics.push(`global: \`npm root -g\` failed (${e.message})`);
    return null;
  }
  const packageDir = path.join(globalRoot, 'playwright');
  if (!fs.existsSync(packageDir)) {
    diagnostics.push(`global: no playwright under ${globalRoot}`);
    return null;
  }
  const version = validateCandidate(packageDir, diagnostics);
  if (!version) return null;
  return { source: 'global', packageDir, nodeModulesPath: globalRoot, version };
}

function tryNpxCache(diagnostics) {
  const npxCacheRoot = path.join(os.homedir(), '.npm', '_npx');
  if (!fs.existsSync(npxCacheRoot)) {
    diagnostics.push(`npx-cache: ${npxCacheRoot} does not exist`);
    return null;
  }
  let entries;
  try {
    entries = fs.readdirSync(npxCacheRoot);
  } catch (e) {
    diagnostics.push(`npx-cache: cannot read ${npxCacheRoot} (${e.message})`);
    return null;
  }

  let best = null; // { packageDir, version }
  for (const entry of entries) {
    const packageDir = path.join(npxCacheRoot, entry, 'node_modules', 'playwright');
    if (!fs.existsSync(path.join(packageDir, 'package.json'))) continue;
    const version = readVersion(path.join(packageDir, 'package.json'));
    if (!version) continue;
    if (!best || compareVersions(version, best.version) > 0) {
      best = { packageDir, version };
    }
  }

  if (!best) {
    diagnostics.push(`npx-cache: no playwright installs found under ${npxCacheRoot}/*/node_modules`);
    return null;
  }

  const validatedVersion = validateCandidate(best.packageDir, diagnostics);
  if (!validatedVersion) return null;
  return {
    source: 'npx-cache',
    packageDir: best.packageDir,
    nodeModulesPath: path.dirname(best.packageDir),
    version: validatedVersion,
  };
}

function tryTmpFallback(diagnostics) {
  const packageDir = path.join('/tmp', 'node_modules', 'playwright');
  if (!fs.existsSync(path.join(packageDir, 'package.json'))) {
    diagnostics.push(`tmp-fallback: no playwright at ${packageDir}`);
    return null;
  }
  const version = validateCandidate(packageDir, diagnostics);
  if (!version) return null;
  return {
    source: 'tmp-fallback',
    packageDir,
    nodeModulesPath: path.dirname(packageDir),
    version,
    ephemeral: true,
  };
}

/**
 * Resolve Playwright, trying each source in priority order.
 * Returns { ok: true, ...candidate, diagnostics } or { ok: false, diagnostics }.
 * Never installs anything.
 */
function resolvePlaywright({ cwd = process.cwd() } = {}) {
  const diagnostics = [];
  const attempts = [
    () => tryCwdResolve(cwd, diagnostics),
    () => tryGlobalResolve(diagnostics),
    () => tryNpxCache(diagnostics),
    () => tryTmpFallback(diagnostics),
  ];

  for (const attempt of attempts) {
    const result = attempt();
    if (result) {
      return { ok: true, ...result, diagnostics };
    }
  }

  return { ok: false, diagnostics };
}

function main() {
  const args = process.argv.slice(2);
  let cwd = process.cwd();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd') {
      cwd = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: resolve-playwright.cjs [--cwd <dir>]');
      console.log('Prints JSON describing the resolved Playwright package.');
      console.log('Never installs Playwright; exits non-zero if unavailable.');
      process.exit(0);
    }
  }

  const result = resolvePlaywright({ cwd });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { resolvePlaywright };
