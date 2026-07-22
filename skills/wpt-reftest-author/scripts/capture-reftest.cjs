#!/usr/bin/env node
'use strict';

/**
 * Deterministically capture and compare a WPT reftest test/ref pair for
 * authoring-time visual validation - NOT a replacement for the official
 * run_web_tests.py renderer.
 *
 * Requires a caller-provided/resolvable Playwright package (see
 * lib/playwright-loader.cjs); never installs anything.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadPlaywright } = require('./lib/playwright-loader.cjs');
const { compareImagesWithPage, getPngDimensions } = require('./lib/image-diff.cjs');

const DISABLE_ANIMATIONS_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
`;

function parseArgs(argv) {
  const args = {
    test: null,
    ref: null,
    out: null,
    viewport: '800x600',
    dsf: 1,
    executable: null,
    channel: null,
    flags: [],
    features: [],
    container: null,
    items: [],
    mocks: [],
    masks: [],
    crop: null,
    requireGeometryMatch: false,
    requirePixelMatch: false,
    geometryTolerance: 0.5,
    playwrightPackage: null,
    name: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--test') args.test = argv[++i];
    else if (a === '--ref') args.ref = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--viewport') args.viewport = argv[++i];
    else if (a === '--dsf') args.dsf = parseFloat(argv[++i]);
    else if (a === '--executable') args.executable = argv[++i];
    else if (a === '--channel') args.channel = argv[++i];
    else if (a === '--flag') args.flags.push(argv[++i]);
    else if (a === '--feature') args.features.push(argv[++i]);
    else if (a === '--container') args.container = argv[++i];
    else if (a === '--item') args.items.push(argv[++i]);
    else if (a === '--mock') args.mocks.push(argv[++i]);
    else if (a === '--mask') args.masks.push(argv[++i]);
    else if (a === '--crop') args.crop = argv[++i];
    else if (a === '--require-geometry-match') args.requireGeometryMatch = true;
    else if (a === '--require-pixel-match') args.requirePixelMatch = true;
    else if (a === '--geometry-tolerance') args.geometryTolerance = parseFloat(argv[++i]);
    else if (a === '--playwright-package') args.playwrightPackage = argv[++i];
    else if (a === '--name') args.name = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function toFileUrl(target) {
  if (/^[a-z]+:\/\//i.test(target)) return target;
  return 'file://' + path.resolve(target);
}

function printHelp() {
  console.log('Usage: capture-reftest.cjs --test <path> --ref <path> --out <dir> [options]');
  console.log('Required Playwright: --playwright-package <dir> (or set NODE_PATH, or resolve locally).');
  console.log('  --executable <path> | --channel <name>   Browser to use');
  console.log('  --viewport WxH        Default 800x600');
  console.log('  --dsf <n>             Device scale factor, default 1');
  console.log('  --flag <arg>          Repeatable extra browser flag');
  console.log('  --feature <name>      Repeatable Blink feature (merged into --enable-blink-features)');
  console.log('  --container <sel>     Selector for the container element (geometry extraction)');
  console.log('  --item <sel>          Repeatable selector for item elements (geometry extraction)');
  console.log('  --mock <sel>          Repeatable selector for manual mock elements (geometry + style)');
  console.log('  --mask <sel>          Repeatable selector to exclude from pixel diff (e.g. labels)');
  console.log('  --crop <sel>          Crop full screenshots to this element for a content crop');
  console.log('  --require-geometry-match   Fail if test/ref container+item rects differ (off by default)');
  console.log('  --require-pixel-match      Fail if any pixel differs (off by default; diff is recorded either way)');
  console.log('  --geometry-tolerance <n>   Px tolerance for geometry comparison, default 0.5');
  console.log('  --name <label>        Base name for output files, default derived from --test');
}

async function launchBrowser(playwright, args) {
  if (args.channel) {
    return playwright.chromium.launch({ channel: args.channel, args: args.flags });
  }
  const launchArgs = [...args.flags];
  if (args.features.length > 0) launchArgs.push(`--enable-blink-features=${args.features.join(',')}`);
  try {
    return await playwright.chromium.launch({ executablePath: args.executable || undefined, args: launchArgs });
  } catch (e) {
    throw new Error(
      `Browser launch failed: ${e.message}. If this is a pipe-launch/SIGTRAP failure on a local ` +
        'Chromium build, use the playwright-browser-runner skill to launch via its CDP fallback ' +
        'and pass a connected browser/page instead.'
    );
  }
}

async function capturePage(context, target, { viewport, dsf, screenshotPath, cropSelector, cropPath }) {
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
  });

  await page.setViewportSize(viewport);
  await page.goto(toFileUrl(target), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  const hasReftestWait = await page.evaluate(() => document.documentElement.classList.contains('reftest-wait'));
  if (hasReftestWait) {
    await page.waitForFunction(() => !document.documentElement.classList.contains('reftest-wait'), { timeout: 10000 });
  }
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  await page.screenshot({ path: screenshotPath });

  let cropRect = null;
  if (cropSelector) {
    const box = await page.locator(cropSelector).boundingBox();
    if (box) {
      await page.screenshot({ path: cropPath, clip: box });
      cropRect = box;
    }
  }

  return { page, consoleErrors, cropRect };
}

async function extractGeometry(page, selector) {
  if (!selector) return [];
  return page.$$eval(selector, (elements) =>
    elements.map((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        style: {
          backgroundColor: style.backgroundColor,
          borderTopColor: style.borderTopColor,
          borderTopWidth: style.borderTopWidth,
          borderTopStyle: style.borderTopStyle,
          borderRightColor: style.borderRightColor,
          borderRightWidth: style.borderRightWidth,
          borderRightStyle: style.borderRightStyle,
          borderBottomColor: style.borderBottomColor,
          borderBottomWidth: style.borderBottomWidth,
          borderBottomStyle: style.borderBottomStyle,
          borderLeftColor: style.borderLeftColor,
          borderLeftWidth: style.borderLeftWidth,
          borderLeftStyle: style.borderLeftStyle,
        },
      };
    })
  );
}

function rectsMatch(a, b, tolerance) {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  );
}

function compareGeometry(testGeom, refGeom, tolerance) {
  if (testGeom.length !== refGeom.length) {
    return { match: false, reason: `count mismatch: test has ${testGeom.length}, ref has ${refGeom.length}` };
  }
  for (let i = 0; i < testGeom.length; i++) {
    if (!rectsMatch(testGeom[i].rect, refGeom[i].rect, tolerance)) {
      return { match: false, reason: `rect ${i} differs beyond tolerance`, test: testGeom[i].rect, ref: refGeom[i].rect };
    }
  }
  return { match: true };
}

async function makeComparisonImage(browser, testScreenshot, refScreenshot, outputPath) {
  const testDataUrl = `data:image/png;base64,${fs.readFileSync(testScreenshot).toString('base64')}`;
  const refDataUrl = `data:image/png;base64,${fs.readFileSync(refScreenshot).toString('base64')}`;

  // Use a dedicated context sized to fit both images at full scale - reusing
  // the capture context's (often smaller) viewport would squeeze the images.
  const testDims = getPngDimensions(testScreenshot);
  const refDims = getPngDimensions(refScreenshot);
  const width = testDims.width + refDims.width + 64;
  const height = Math.max(testDims.height, refDims.height) + 48;

  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.setContent(`
    <!DOCTYPE html>
    <style>
      body { margin: 0; font-family: sans-serif; background: #fff; }
      .row { display: flex; align-items: flex-start; }
      figure { margin: 8px; flex-shrink: 0; }
      figcaption { font-size: 14px; font-weight: bold; text-align: center; }
      img { display: block; border: 1px solid #ccc; }
    </style>
    <div class="row">
      <figure><figcaption>TEST</figcaption><img src="${testDataUrl}"></figure>
      <figure><figcaption>REF</figcaption><img src="${refDataUrl}"></figure>
    </div>
  `);
  await page.locator('.row').screenshot({ path: outputPath });
  await context.close();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.test || !args.ref || !args.out) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const errors = [];
  let browser;
  try {
    const { playwright, packageDir, version } = loadPlaywright({
      playwrightPackage: args.playwrightPackage,
      cwd: process.cwd(),
    });

    fs.mkdirSync(args.out, { recursive: true });
    const name = args.name || path.basename(args.test).replace(/\.html?$/, '');
    const [vw, vh] = args.viewport.split('x').map((n) => parseInt(n, 10));
    const viewport = { width: vw, height: vh };

    browser = await launchBrowser(playwright, args);
    const context = await browser.newContext({ viewport, deviceScaleFactor: args.dsf });
    await context.addInitScript((css) => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
      });
    }, DISABLE_ANIMATIONS_CSS);

    const testFull = path.join(args.out, `${name}-test-full.png`);
    const refFull = path.join(args.out, `${name}-ref-full.png`);
    const testCrop = args.crop ? path.join(args.out, `${name}-test-crop.png`) : null;
    const refCrop = args.crop ? path.join(args.out, `${name}-ref-crop.png`) : null;

const testCapture = await capturePage(context, args.test, {
      viewport,
      dsf: args.dsf,
      screenshotPath: testFull,
      cropSelector: args.crop,
      cropPath: testCrop,
    });
const refCapture = await capturePage(context, args.ref, {
      viewport,
      dsf: args.dsf,
      screenshotPath: refFull,
      cropSelector: args.crop,
      cropPath: refCrop,
    });

const testGeometry = {
      container: await extractGeometry(testCapture.page, args.container),
      items: args.items.length ? await extractGeometry(testCapture.page, args.items.join(',')) : [],
      mocks: args.mocks.length ? await extractGeometry(testCapture.page, args.mocks.join(',')) : [],
    };
    const refGeometry = {
      container: await extractGeometry(refCapture.page, args.container),
      items: args.items.length ? await extractGeometry(refCapture.page, args.items.join(',')) : [],
      mocks: args.mocks.length ? await extractGeometry(refCapture.page, args.mocks.join(',')) : [],
    };

let maskRects = [];
    if (args.masks.length) {
      const testMaskRects = await extractGeometry(testCapture.page, args.masks.join(','));
      maskRects = testMaskRects.map((m) => ({
        x: Math.round(m.rect.x * args.dsf),
        y: Math.round(m.rect.y * args.dsf),
        width: Math.round(m.rect.width * args.dsf),
        height: Math.round(m.rect.height * args.dsf),
      }));
    }

const diffPath = path.join(args.out, `${name}-diff.png`);
    const pixelDiff = await compareImagesWithPage(testCapture.page, testFull, refFull, {
      diffOutputPath: diffPath,
      masks: maskRects,
    });

const comparisonPath = path.join(args.out, `${name}-comparison.png`);
    await makeComparisonImage(browser, testFull, refFull, comparisonPath);

const geometryResult = args.requireGeometryMatch
      ? {
          container: compareGeometry(testGeometry.container, refGeometry.container, args.geometryTolerance),
          items: compareGeometry(testGeometry.items, refGeometry.items, args.geometryTolerance),
        }
      : null;

    const geometryOk = !geometryResult || (geometryResult.container.match && geometryResult.items.match);
    const pixelOk = !args.requirePixelMatch || pixelDiff.diffPixelCount === 0;
    const ok = geometryOk && pixelOk;

    const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    const manifest = {
      ok,
      packageSource: args.playwrightPackage ? 'explicit' : 'resolved',
      packageDir,
      packageVersion: version,
      test: args.test,
      ref: args.ref,
      viewport,
      deviceScaleFactor: args.dsf,
      screenshots: {
        testFull,
        refFull,
        testCrop,
        refCrop,
        diff: diffPath,
        comparison: comparisonPath,
      },
      hashes: { testFull: hash(testFull), refFull: hash(refFull) },
      geometry: { test: testGeometry, ref: refGeometry },
      pixelDiff,
      requireGeometryMatch: args.requireGeometryMatch,
      requirePixelMatch: args.requirePixelMatch,
      geometryResult,
      errors: [...errors, ...testCapture.consoleErrors, ...refCapture.consoleErrors],
    };

    const manifestPath = path.join(args.out, `${name}-manifest.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify({ ...manifest, manifestPath }, null, 2));

    await browser.close();
    process.exit(ok ? 0 : 1);
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: e.message }, null, 2));
    try {
      if (browser) await browser.close();
    } catch {
      // ignore close errors during failure cleanup
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
