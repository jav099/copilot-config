#!/usr/bin/env node
'use strict';

/**
 * Launch a browser via Playwright and capture a deterministic screenshot.
 *
 * Resolves Playwright via resolve-playwright.cjs (never installs). Launches
 * either:
 *   - a local Chromium source build (--executable <path>), or
 *   - an installed Edge channel (--channel msedge|msedge-beta|msedge-dev|msedge-canary), or
 *   - Playwright's own bundled browser (no --executable/--channel; requires
 *     `playwright install` to have been run already).
 *
 * For --executable, tries a normal pipe launch first. If that fails (e.g. the
 * SIGTRAP pipe-launch failure seen with some local Chromium builds), falls
 * back to: spawn with --remote-debugging-port=0 and a fresh profile, read
 * DevToolsActivePort, and attach with connectOverCDP().
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { resolvePlaywright } = require('./resolve-playwright.cjs');

const DISABLE_ANIMATIONS_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
`;

function parseArgs(argv) {
  const args = {
    target: null,
    executable: null,
    channel: null,
    screenshot: null,
    viewport: '800x600',
    dsf: 1,
    flags: [],
    features: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--executable') args.executable = argv[++i];
    else if (a === '--channel') args.channel = argv[++i];
    else if (a === '--screenshot') args.screenshot = argv[++i];
    else if (a === '--viewport') args.viewport = argv[++i];
    else if (a === '--dsf') args.dsf = parseFloat(argv[++i]);
    else if (a === '--flag') args.flags.push(argv[++i]);
    else if (a === '--feature') args.features.push(argv[++i]);
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!a.startsWith('--')) args.target = a;
  }
  return args;
}

// A URI scheme per RFC 3986: ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ) ":".
// This matches "http:", "data:", "about:", "blob:", "chrome:", etc. - schemes
// that don't necessarily have a "//" authority part.
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

// A Windows drive-letter path (e.g. "C:\foo" or "C:/foo"), which would
// otherwise be misdetected as a one-letter URI scheme by SCHEME_RE.
const WINDOWS_DRIVE_RE = /^[a-zA-Z]:[\\/]/;

// Normalize a navigation target into a URL Playwright's page.goto() can use.
// Real URI schemes (http:, https:, file:, data:, about:, blob:, chrome:, ...)
// are passed through unchanged. Everything else - including Windows drive
// paths, which would otherwise look like a one-letter scheme - is treated as
// a filesystem path and converted with pathToFileURL for correct escaping.
function toNavigationUrl(target) {
  if (!WINDOWS_DRIVE_RE.test(target) && SCHEME_RE.test(target)) return target;
  return pathToFileURL(path.resolve(target)).href;
}

async function waitForDevToolsActivePort(profileDir, timeoutMs = 15000) {
  const file = path.join(profileDir, 'DevToolsActivePort');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8').split('\n');
      const port = content[0].trim();
      if (port) return port;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for DevToolsActivePort in ${profileDir}`);
}

// Launch a custom executable, falling back to a manual spawn + CDP attach if
// the normal pipe launch fails (observed as a SIGTRAP crash for some local
// Chromium builds).
async function launchExecutable(playwright, executable, launchArgs, errors) {
  try {
    const browser = await playwright.chromium.launch({ executablePath: executable, args: launchArgs });
    return { browser, launchMethod: 'pipe', profileDir: null };
  } catch (e) {
    errors.push(`normal launch failed, falling back to CDP: ${e.message}`);
  }

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-cdp-profile-'));
  const child = spawn(
    executable,
    ['--remote-debugging-port=0', `--user-data-dir=${profileDir}`, ...launchArgs],
    { stdio: 'ignore', detached: true } // own process group, so we can kill all its helper processes together
  );
  child.on('error', (e) => errors.push(`spawn error: ${e.message}`));

  // If anything from here fails (e.g. DevToolsActivePort never appears, or
  // connectOverCDP itself fails), the caller never receives child/profileDir
  // to clean up. Kill the spawned process tree and remove the profile dir
  // ourselves before rethrowing, so a failed fallback attempt never orphans
  // a process or a temp profile.
  try {
    const port = await waitForDevToolsActivePort(profileDir);
    const browser = await playwright.chromium.connectOverCDP(`http://localhost:${port}`);
    return { browser, launchMethod: 'cdp-fallback', profileDir, child };
  } catch (e) {
    killProcessTree(child);
    await removeDirWithRetry(profileDir);
    throw e;
  }
}

// Kill the whole process group spawned for the CDP fallback. A plain
// child.kill() only signals the top-level Chrome process; its renderer/GPU
// helper processes keep running and keep files in the profile dir open,
// which races a subsequent rmSync of that directory.
function killProcessTree(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform === 'win32') {
      child.kill();
    } else {
      process.kill(-child.pid, 'SIGKILL'); // negative pid targets the whole process group
    }
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      // best-effort; nothing more we can do
    }
  }
}

// Helper processes can hold the profile directory open briefly after being
// killed, so retry the removal a few times before giving up.
async function removeDirWithRetry(dir, attempts = 5, delayMs = 200) {
  for (let i = 0; i < attempts; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (e) {
      if (i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.target) {
    console.log('Usage: render-page.cjs <url-or-path> [options]');
    console.log('  --executable <path>   Local Chromium build binary (with CDP fallback)');
    console.log('  --channel <name>      Playwright native channel (msedge, msedge-beta, msedge-dev, msedge-canary)');
    console.log('  --screenshot <path>   Output PNG path (required to capture a screenshot)');
    console.log('  --viewport WxH        Default 800x600');
    console.log('  --dsf <n>             Device scale factor, default 1');
    console.log('  --flag <arg>          Repeatable extra browser flag');
    console.log('  --feature <name>      Repeatable Blink feature (merged into --enable-blink-features)');
    process.exit(args.help ? 0 : 1);
  }

  const resolved = resolvePlaywright({ cwd: process.cwd() });
  if (!resolved.ok) {
    console.log(JSON.stringify({ ok: false, error: 'Playwright unavailable', diagnostics: resolved.diagnostics }, null, 2));
    process.exit(1);
  }
  const playwright = require(resolved.packageDir);

  const [vw, vh] = args.viewport.split('x').map((n) => parseInt(n, 10));
  const launchArgs = [...args.flags];
  if (args.features.length > 0) {
    launchArgs.push(`--enable-blink-features=${args.features.join(',')}`);
  }

  const errors = [];
  const consoleErrors = [];
  let browser;
  let launchMethod;
  let profileDir = null;
  let ownedProcess = null; // set only for the cdp-fallback path; browser.close()
                           // on a connectOverCDP() session disconnects but does
                           // NOT terminate the process, so we must kill it ourselves.
  let browserSelection;

  const cleanup = async () => {
    try {
      if (browser) await browser.close();
    } catch {
      // ignore close errors during cleanup
    }
    killProcessTree(ownedProcess);
    if (profileDir) await removeDirWithRetry(profileDir);
  };

  try {
    if (args.channel) {
      browser = await playwright.chromium.launch({ channel: args.channel, args: launchArgs });
      launchMethod = 'channel';
      browserSelection = { kind: 'channel', channel: args.channel };
    } else if (args.executable) {
      const result = await launchExecutable(playwright, args.executable, launchArgs, errors);
      browser = result.browser;
      launchMethod = result.launchMethod;
      profileDir = result.profileDir;
      if (result.launchMethod === 'cdp-fallback') ownedProcess = result.child;
      browserSelection = { kind: 'executable', executable: args.executable };
    } else {
      browser = await playwright.chromium.launch({ args: launchArgs });
      launchMethod = 'bundled';
      browserSelection = { kind: 'bundled' };
    }

    // Reuse an existing context (CDP-attached browsers already have one from
    // launch) rather than assuming we can always create a fresh one.
    let context = browser.contexts()[0];
    if (!context) {
      context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: args.dsf });
    }
    await context.addInitScript((css) => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
      });
    }, DISABLE_ANIMATIONS_CSS);

    // Always open a fresh page rather than reusing an existing one: a
    // CDP-attached browser's default page is often mid-navigation to
    // chrome://new-tab-page, which races with our own page.goto().
    const page = await context.newPage();
    await page.setViewportSize({ width: vw, height: vh });

    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
    });

    const url = toNavigationUrl(args.target);
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );

    let screenshotPath = null;
    let hash = null;
    let dimensions = null;
    if (args.screenshot) {
      screenshotPath = path.resolve(args.screenshot);
      await page.screenshot({ path: screenshotPath });
      const buf = fs.readFileSync(screenshotPath);
      hash = crypto.createHash('sha256').update(buf).digest('hex');
      dimensions = { width: vw, height: vh, deviceScaleFactor: args.dsf };
    }

    const result = {
      ok: true,
      packageSource: resolved.source,
      packageVersion: resolved.version,
      browserSelection,
      launchMethod,
      errors: [...errors, ...consoleErrors],
      screenshotPath,
      screenshotHash: hash,
      dimensions,
      title: await page.title(),
      url: page.url(),
    };
    console.log(JSON.stringify(result, null, 2));

    await cleanup();
    process.exit(0);
  } catch (e) {
    errors.push(e.message);
    console.log(JSON.stringify({ ok: false, packageSource: resolved.source, packageVersion: resolved.version, errors }, null, 2));
    await cleanup();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { launchExecutable, waitForDevToolsActivePort, killProcessTree, removeDirWithRetry, toNavigationUrl };
