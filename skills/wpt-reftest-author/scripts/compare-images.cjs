#!/usr/bin/env node
'use strict';

/**
 * Standalone exact comparison of two PNG files, using the browser's Canvas
 * (no pngjs dependency). Spins up its own short-lived headless page since it
 * has no capture session to reuse - prefer capture-reftest.cjs's built-in
 * comparison when already capturing a test/ref pair.
 */

const { loadPlaywright } = require('./lib/playwright-loader.cjs');
const { compareImagesWithPage } = require('./lib/image-diff.cjs');

function parseArgs(argv) {
  const args = { a: null, b: null, diffOutput: null, playwrightPackage: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--diff-output') args.diffOutput = argv[++i];
    else if (arg === '--playwright-package') args.playwrightPackage = argv[++i];
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (!args.a) args.a = arg;
    else if (!args.b) args.b = arg;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.a || !args.b) {
    console.log('Usage: compare-images.cjs <image-a.png> <image-b.png> [--diff-output <path>] [--playwright-package <dir>]');
    console.log('Reports dimensions, differing-pixel count, and bounding rectangle. A pixel diff is informational, not a failure - only script errors exit non-zero.');
    process.exit(args.help ? 0 : 1);
  }

  const { playwright, version } = loadPlaywright({ playwrightPackage: args.playwrightPackage });
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage();
    const result = await compareImagesWithPage(page, args.a, args.b, { diffOutputPath: args.diffOutput });
    console.log(JSON.stringify({ ok: true, packageVersion: version, ...result }, null, 2));
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.log(JSON.stringify({ ok: false, error: e.message }, null, 2));
    process.exit(1);
  });
}
