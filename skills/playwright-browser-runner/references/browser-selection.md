# Browser Selection

## Local Chromium source build binary paths

A Chromium checkout's `out/<Config>/` directory holds the built binary at a fixed,
platform-specific path:

| Platform | Binary path relative to `out/<Config>/` |
|----------|------------------------------------------|
| macOS | `Chromium.app/Contents/MacOS/Chromium` |
| Linux | `chrome` |
| Windows | `chrome.exe` |

`scripts/find-browser.cjs` scans every directory under `<src>/out/*` for this binary (or just the
one directory given via `--out`), ranks the ones that exist by file **mtime**, and reports:

- every candidate found (path, containing `out` dir, mtime)
- the **selected** path
- the **reason** ("only candidate found", "newest mtime among N candidates", etc.)

It never silently picks a candidate when there is more than one - the full candidate list is always
in the JSON output so the caller can override the choice if the mtime-based pick is wrong (e.g. a
build that was touched but not rebuilt).

If the user already knows the executable path, pass `--executable <path>` directly; the script
validates it exists and skips discovery entirely.

## Installed Edge channels

Prefer Playwright's **native channel launch** over probing for an executable path:

```js
await playwright.chromium.launch({ channel: 'msedge' });        // Stable
await playwright.chromium.launch({ channel: 'msedge-beta' });    // Beta
await playwright.chromium.launch({ channel: 'msedge-dev' });     // Dev
await playwright.chromium.launch({ channel: 'msedge-canary' });  // Canary
```

Playwright resolves the installed application for each channel itself (macOS `/Applications/...`,
Windows registry, Linux package paths). Only fall back to manually finding an executable path if
the native channel launch throws (e.g. a non-standard install location) - and even then, prefer
fixing the channel name/registration over hardcoding a path.

`find-browser.cjs` reports these channel names in its output/help text as a reminder, but does not
implement its own Edge discovery - there's no need to reinvent what Playwright already does
natively.
