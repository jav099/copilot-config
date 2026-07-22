---
name: wpt-port-fallback
description: Run Chromium/Blink `run_web_tests.py` WPT tests when the primary WPTServe HTTP port 8001 is already occupied by another process on this machine, or when asked to use an alternate/fallback WPT port instead of killing whatever holds 8001. Use for "port 8001 in use", "address already in use" wptserve failures, or requests to run web tests on a different WPT port without terminating the process squatting on 8001.
---

# WPT Port Fallback

Runs Blink's official `run_web_tests.py` against an alternate WPT primary HTTP
port (18001 by default, or another free port it selects) instead of 8001,
when 8001 is occupied by a process that must not be killed.

## Workflow

1. **Never touch whatever holds port 8001.** Do not kill, signal, or
   reconfigure that process. Only probe candidate ports in the 18000s by
   binding and immediately closing a socket.
2. **Run the wrapper from (or pointed at) a Chromium `src` checkout:**
   ```
   scripts/run_wpt_alt_port.py [--checkout PATH] [--port PORT] -- <run_web_tests.py args>
   ```
   - `--checkout` and `--port` are optional and, if given, must come first.
     Everything after them (or all args, if neither is given) is passed
     through to `run_web_tests.py` completely unchanged - test paths, `-t
     debug_full_x64`, `--no-retry`, etc.
   - `--checkout` defaults to `$CHROMIUM_SRC`, then the nearest containing
     checkout of the current directory.
   - `--port` defaults to auto-selecting a free port, preferring 18001, then
     scanning upward for another free one.
3. **The script re-execs itself under the checkout's pinned `vpython3`**
   (`vpython3 -vpython-spec <checkout>/.vpython3 <script> ...`), since it
   lives outside the checkout and plain `vpython3` alone won't find
   Chromium's Python dependencies.
4. **It remaps the primary HTTP port everywhere it must agree**, by
   monkeypatching (not editing) `TestURIMapper.WPT_HOST_AND_PORTS`,
   `Port.SERVER_PORTS`, `WPTServe.__init__`'s port mapping, and the
   `config.json` `WPTServe._prepare_config()` generates - so the test runner
   and the WPTServe subprocess agree on the same fallback port. All other WPT
   ports (secure, alt, local, public, h2, ws, wss, webtransport) are left
   untouched.
5. **Errors are surfaced directly**, not swallowed: an unfindable checkout,
   missing `vpython3`, no free port in the scan range, or blinkpy internals
   that no longer match this script's assumptions all raise/print a clear
   message and a non-zero exit instead of silently falling back to port 8001.

## Example

```
scripts/run_wpt_alt_port.py \
    external/wpt/css/css-gaps/flex/fragmentation/flex-gap-decorations-fragmentation-027.html \
    --no-retry -t debug_full_x64
```
