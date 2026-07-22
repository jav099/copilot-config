#!/usr/bin/env node
'use strict';

/**
 * Locate a local Chromium source build's browser binary.
 *
 * Priority order:
 *   1. --executable: use exactly what the user gave, validated.
 *   2. Discover all out/* platform binaries under the given --src (or a single
 *      --out directory if given), rank by binary mtime.
 *   3. Print every candidate found (never silently pick one when there is
 *      ambiguity) plus the selected path and the reason for the choice.
 *
 * Installed Edge channels (msedge, msedge-beta, msedge-dev, msedge-canary) are
 * NOT discovered here - Playwright's native `channel` launch option already
 * resolves those. This script only covers local Chromium source builds.
 */

const fs = require('fs');
const path = require('path');

const PLATFORM_BINARY = {
  darwin: (outDir) => path.join(outDir, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
  linux: (outDir) => path.join(outDir, 'chrome'),
  win32: (outDir) => path.join(outDir, 'chrome.exe'),
};

const EDGE_CHANNELS = ['msedge', 'msedge-beta', 'msedge-dev', 'msedge-canary'];

function parseArgs(argv) {
  const args = { src: null, out: null, executable: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--src') args.src = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--executable') args.executable = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  return args;
}

function findCandidates(src, singleOutDir) {
  const platformFn = PLATFORM_BINARY[process.platform];
  if (!platformFn) {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }

  let outDirs;
  if (singleOutDir) {
    outDirs = [singleOutDir];
  } else {
    const outRoot = path.join(src, 'out');
    if (!fs.existsSync(outRoot)) return [];
    outDirs = fs
      .readdirSync(outRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(outRoot, d.name));
  }

  const candidates = [];
  for (const outDir of outDirs) {
    const binaryPath = platformFn(outDir);
    if (fs.existsSync(binaryPath)) {
      const stat = fs.statSync(binaryPath);
      candidates.push({ path: binaryPath, outDir, mtimeMs: stat.mtimeMs, mtime: stat.mtime.toISOString() });
    }
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: find-browser.cjs --src <chromium-src> [--out <out-dir>] [--executable <path>]');
    console.log('Discovers local Chromium source build binaries under out/*, ranked by mtime.');
    console.log(`Edge channels for Playwright's native launch: ${EDGE_CHANNELS.join(', ')} (not discovered here).`);
    process.exit(0);
  }

  if (args.executable) {
    const exists = fs.existsSync(args.executable);
    const result = {
      ok: exists,
      selected: exists ? args.executable : null,
      reason: exists ? 'explicit --executable path, used as-is' : `--executable path does not exist: ${args.executable}`,
      candidates: [],
      edgeChannels: EDGE_CHANNELS,
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(exists ? 0 : 1);
  }

  if (!args.src) {
    console.error('Error: --src <chromium-src> is required (or pass --executable directly).');
    process.exit(1);
  }

  let candidates;
  try {
    candidates = findCandidates(args.src, args.out);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }

  const result = {
    ok: candidates.length > 0,
    selected: candidates.length > 0 ? candidates[0].path : null,
    reason:
      candidates.length === 0
        ? `no platform binary found under ${args.out || path.join(args.src, 'out/*')}`
        : candidates.length === 1
          ? `only candidate found (${candidates[0].outDir})`
          : `newest mtime among ${candidates.length} candidates (${candidates[0].outDir}, ${candidates[0].mtime})`,
    candidates,
    edgeChannels: EDGE_CHANNELS,
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { findCandidates };
