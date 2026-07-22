#!/usr/bin/env node
'use strict';

/**
 * Generate a labeled contact sheet PNG from a set of comparison images
 * (e.g. the *-comparison.png files produced by capture-reftest.cjs), using
 * Playwright/HTML rather than ImageMagick.
 */

const fs = require('fs');
const path = require('path');
const { loadPlaywright } = require('./lib/playwright-loader.cjs');
const { getPngDimensions } = require('./lib/image-diff.cjs');

function parseArgs(argv) {
  const args = { images: [], out: null, playwrightPackage: null, columns: 2 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--playwright-package') args.playwrightPackage = argv[++i];
    else if (a === '--columns') args.columns = parseInt(argv[++i], 10);
    else if (a === '--help' || a === '-h') args.help = true;
    else args.images.push(a);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.images.length === 0 || !args.out) {
    console.log('Usage: make-contact-sheet.cjs <image1.png> [image2.png ...] --out <sheet.png> [--columns <n>] [--playwright-package <dir>]');
    process.exit(args.help ? 0 : 1);
  }

  const { playwright } = loadPlaywright({ playwrightPackage: args.playwrightPackage });
  const browser = await playwright.chromium.launch();
  try {
    // Size the viewport to fit every image at full scale - a viewport smaller
    // than the grid's natural size causes CSS grid tracks to shrink images.
    const dims = args.images.map(getPngDimensions);
    const maxW = Math.max(...dims.map((d) => d.width));
    const maxH = Math.max(...dims.map((d) => d.height));
    const rows = Math.ceil(args.images.length / args.columns);
    const gap = 12;
    const padding = 12;
    const captionHeight = 24;
    const viewport = {
      width: args.columns * maxW + (args.columns - 1) * gap + padding * 2,
      height: rows * (maxH + captionHeight) + (rows - 1) * gap + padding * 2,
    };

    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const figures = args.images
      .map((imgPath) => {
        const dataUrl = `data:image/png;base64,${fs.readFileSync(imgPath).toString('base64')}`;
        const label = path.basename(imgPath);
        return `<figure><figcaption>${label}</figcaption><img src="${dataUrl}"></figure>`;
      })
      .join('\n');

    await page.setContent(`
      <!DOCTYPE html>
      <style>
        body { margin: 0; font-family: sans-serif; background: #fff; }
        .sheet { display: grid; grid-template-columns: repeat(${args.columns}, auto); gap: ${gap}px; padding: ${padding}px; }
        figure { margin: 0; flex-shrink: 0; }
        figcaption { font-size: 12px; text-align: center; word-break: break-all; }
        img { display: block; border: 1px solid #ccc; }
      </style>
      <div class="sheet">${figures}</div>
    `);
    await page.locator('.sheet').screenshot({ path: args.out });
    console.log(JSON.stringify({ ok: true, out: path.resolve(args.out), imageCount: args.images.length }, null, 2));
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
