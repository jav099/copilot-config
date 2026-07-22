#!/usr/bin/env python3
"""Run Blink's official run_web_tests.py against a fallback WPT primary HTTP
port, for use when port 8001 is already occupied by another process on this
machine (e.g. a long-lived VS Code helper) that must not be killed.

This script re-execs itself under the Chromium checkout's pinned `vpython3`
environment (`vpython3 -vpython-spec <checkout>/.vpython3 <this file> ...`),
since it lives outside the checkout and plain `vpython3 run_wpt_alt_port.py`
would not discover Chromium's Python dependencies (blinkpy, etc.).

Once running under vpython3, it monkeypatches the four places the WPT test
runner and the WPTServe web server need to agree on the primary HTTP port:
  - blinkpy.web_tests.port.driver.TestURIMapper.WPT_HOST_AND_PORTS
  - blinkpy.web_tests.port.base.Port.SERVER_PORTS
  - blinkpy.web_tests.servers.wptserve.WPTServe.__init__ (self._mappings)
  - blinkpy.web_tests.servers.wptserve.WPTServe._prepare_config (config.json)
then invokes blinkpy.web_tests.run_web_tests.main() with all remaining
arguments passed through unchanged (test paths, -t, --no-retry, etc.).

IMPORTANT: run_web_tests.py runs test workers as separate `multiprocessing`
processes using the 'spawn' start method. On spawn, Python re-executes this
script's top-level (module) code in each worker to rebuild the __main__
context - but skips the `if __name__ == '__main__':` block. That's why the
patch application below is unconditional, top-level code: it must re-run in
every worker, not just in the parent process. Do not move it inside
`if __name__ == '__main__':`.

Usage:
    run_wpt_alt_port.py [--checkout PATH] [--port PORT] -- <run_web_tests.py args>

`--checkout` and `--port` are optional and, if given, must come first.
Everything else is passed through to run_web_tests.py unchanged. `--checkout`
defaults to $CHROMIUM_SRC or the nearest containing checkout of the current
directory. `--port` defaults to auto-selecting a free port (18001 preferred).

Example:
    run_wpt_alt_port.py external/wpt/css/css-gaps/flex/fragmentation/foo.html \\
        --no-retry -t debug_full_x64
"""

import json
import os
import shutil
import socket
import subprocess
import sys

# Env vars used to pass state from the outer (plain python3) launch to the
# inner (vpython3) re-exec of this same script. Presence of PORT_ENV_VAR is
# what distinguishes "we are the vpython3 child" from "we are the launcher".
PORT_ENV_VAR = 'WPT_ALT_PORT_FALLBACK_HTTP_PORT'
CHECKOUT_ENV_VAR = 'WPT_ALT_PORT_FALLBACK_CHECKOUT'

PREFERRED_PORT = 18001
PORT_SCAN_START = 18001
PORT_SCAN_END = 18100  # inclusive; small deterministic scan window

# The stock primary WPT HTTP port this script remaps away from.
DEFAULT_WPT_HTTP_PORT = 8001


class UsageError(Exception):
    """Raised for invocation errors; caught in main() and reported plainly."""


def _is_port_free(port, host='127.0.0.1'):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


def _pick_alt_port():
    """Prefer 18001; otherwise scan for another free local port.

    Never touches whatever is bound to 8001 (or any other port) - this only
    ever probes candidates in the 18000s by binding and immediately closing.
    """
    if _is_port_free(PREFERRED_PORT):
        return PREFERRED_PORT
    for port in range(PORT_SCAN_START, PORT_SCAN_END + 1):
        if port == PREFERRED_PORT:
            continue
        if _is_port_free(port):
            return port
    raise UsageError(
        f'No free port found in {PORT_SCAN_START}-{PORT_SCAN_END}; cannot '
        'select a fallback WPT primary HTTP port.')


def _looks_like_checkout(path):
    return (os.path.isfile(
        os.path.join(path, 'third_party', 'blink', 'tools',
                      'run_web_tests.py'))
            and os.path.isfile(os.path.join(path, '.vpython3')))


def _discover_checkout(explicit):
    """Find the Chromium src checkout: explicit arg, then $CHROMIUM_SRC, then
    walk up from the current directory. Raises UsageError with no silent
    fallback if none is found or the given one doesn't look right.
    """
    if explicit:
        candidate = os.path.abspath(os.path.expanduser(explicit))
        if not _looks_like_checkout(candidate):
            raise UsageError(
                f'--checkout {candidate} does not look like a Chromium src '
                'checkout (missing third_party/blink/tools/run_web_tests.py '
                'or .vpython3).')
        return candidate

    env_checkout = os.environ.get('CHROMIUM_SRC')
    if env_checkout:
        candidate = os.path.abspath(os.path.expanduser(env_checkout))
        if not _looks_like_checkout(candidate):
            raise UsageError(
                f'$CHROMIUM_SRC={candidate} does not look like a Chromium '
                'src checkout (missing third_party/blink/tools/'
                'run_web_tests.py or .vpython3).')
        return candidate

    current = os.path.abspath(os.getcwd())
    while True:
        if _looks_like_checkout(current):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent

    raise UsageError(
        'Could not discover a Chromium src checkout from the current '
        'directory. Pass --checkout <path>, set $CHROMIUM_SRC, or run this '
        'from inside a checkout.')


def _parse_outer_args(argv):
    """Consume leading --checkout/--port flags; everything else (in order)
    is passed through unchanged to run_web_tests.py.
    """
    argv = list(argv)
    checkout_override = None
    port_override = None
    while argv and argv[0] in ('--checkout', '--port'):
        flag = argv.pop(0)
        if not argv:
            raise UsageError(f'{flag} requires a value')
        value = argv.pop(0)
        if flag == '--checkout':
            checkout_override = value
        else:
            try:
                port_override = int(value)
            except ValueError:
                raise UsageError(f'--port value must be an integer, got {value!r}')
    return checkout_override, port_override, argv


def _run_outer(argv):
    """Plain-python3 entry point: pick a port, find the checkout, and re-exec
    this same script under the checkout's vpython3.
    """
    checkout_override, port_override, passthrough_args = _parse_outer_args(argv)

    checkout = _discover_checkout(checkout_override)

    if port_override is not None:
        if not _is_port_free(port_override):
            raise UsageError(
                f'--port {port_override} is not free; omit --port to let '
                'this script auto-select an alternate port instead.')
        port = port_override
    else:
        port = _pick_alt_port()

    vpython3_path = shutil.which('vpython3')
    if not vpython3_path:
        raise UsageError(
            'vpython3 not found on PATH; cannot invoke the checkout\'s '
            'pinned Python environment.')

    vpython_spec = os.path.join(checkout, '.vpython3')

    print(f'[wpt-port-fallback] checkout: {checkout}', file=sys.stderr)
    print(f'[wpt-port-fallback] fallback WPT primary HTTP port: {port} '
          f'(port {DEFAULT_WPT_HTTP_PORT} left untouched)', file=sys.stderr)

    env = os.environ.copy()
    env[PORT_ENV_VAR] = str(port)
    env[CHECKOUT_ENV_VAR] = checkout

    cmd = [
        vpython3_path, '-vpython-spec', vpython_spec,
        os.path.abspath(__file__)
    ] + passthrough_args
    result = subprocess.run(cmd, env=env)
    return result.returncode


def _apply_patches(alt_port):
    """Monkeypatch the four places the runner and WPTServe must agree on the
    primary HTTP port. Only ever changes the primary HTTP port; every other
    WPT port (secure, alt, local, public, h2, ws, wss, webtransport) is left
    as-is.
    """
    from blinkpy.web_tests.port.driver import TestURIMapper
    from blinkpy.web_tests.port.base import Port
    from blinkpy.web_tests.servers.wptserve import WPTServe

    if getattr(WPTServe, '_wpt_alt_port_patched', False):
        return  # already patched in this interpreter; avoid double-wrapping

    # 1. TestURIMapper.WPT_HOST_AND_PORTS: (hostname, insecure_port, secure_port)
    hostname, insecure_port, secure_port = TestURIMapper.WPT_HOST_AND_PORTS
    if insecure_port != DEFAULT_WPT_HTTP_PORT:
        raise RuntimeError(
            f'TestURIMapper.WPT_HOST_AND_PORTS insecure port is '
            f'{insecure_port}, not the expected {DEFAULT_WPT_HTTP_PORT}; '
            'blinkpy internals may have changed - refusing to patch blindly.')
    TestURIMapper.WPT_HOST_AND_PORTS = (hostname, alt_port, secure_port)

    # 2. Port.SERVER_PORTS: flat list of ports the port layer manages.
    if DEFAULT_WPT_HTTP_PORT not in Port.SERVER_PORTS:
        raise RuntimeError(
            f'Port.SERVER_PORTS does not contain {DEFAULT_WPT_HTTP_PORT}; '
            'blinkpy internals may have changed - refusing to patch blindly.')
    Port.SERVER_PORTS = [
        alt_port if p == DEFAULT_WPT_HTTP_PORT else p for p in Port.SERVER_PORTS
    ]

    # 3. WPTServe.__init__: rewrite the port->scheme mapping it builds.
    original_init = WPTServe.__init__

    def patched_init(self, port_obj, output_dir):
        original_init(self, port_obj, output_dir)
        for mapping in self._mappings:
            if mapping['port'] == DEFAULT_WPT_HTTP_PORT:
                mapping['port'] = alt_port

    WPTServe.__init__ = patched_init

    # 4. WPTServe._prepare_config(): rewrite the generated config.json so the
    # `wpt serve` subprocess actually binds the fallback port.
    original_prepare_config = WPTServe._prepare_config

    def patched_prepare_config(self):
        original_prepare_config(self)
        fs = self._filesystem
        config = json.loads(fs.read_text_file(self._config_file))
        http_ports = config.get('ports', {}).get('http')
        if not http_ports or http_ports[0] != DEFAULT_WPT_HTTP_PORT:
            raise RuntimeError(
                'Generated WPT config.json ports.http does not start with '
                f'{DEFAULT_WPT_HTTP_PORT} ({http_ports!r}); blinkpy/WPT '
                'internals may have changed - refusing to patch blindly.')
        http_ports[0] = alt_port
        fs.write_text_file(self._config_file, json.dumps(config))

    WPTServe._prepare_config = patched_prepare_config

    WPTServe._wpt_alt_port_patched = True


# --- Module-level (unconditional) setup -------------------------------------
#
# This block runs every time this file is executed as a script, including
# when multiprocessing's 'spawn' start method re-executes it (with __name__
# set to '__mp_main__', not '__main__') to rebuild worker processes. That is
# why the patch call lives here rather than inside `if __name__ == '__main__'`.

_alt_port_str = os.environ.get(PORT_ENV_VAR)
if _alt_port_str:
    _checkout = os.environ.get(CHECKOUT_ENV_VAR)
    if not _checkout:
        raise RuntimeError(
            f'{PORT_ENV_VAR} is set but {CHECKOUT_ENV_VAR} is not; '
            'corrupt environment for wpt-port-fallback child process.')

    _tools_dir = os.path.join(_checkout, 'third_party', 'blink', 'tools')
    _search_paths = os.environ.get('PYTHONPATH', _tools_dir).split(os.pathsep)
    if _tools_dir not in _search_paths:
        _search_paths.append(_tools_dir)
    os.environ['PYTHONPATH'] = os.pathsep.join(_search_paths)
    if _tools_dir not in sys.path:
        sys.path.append(_tools_dir)

    _apply_patches(int(_alt_port_str))


def main():
    if _alt_port_str:
        # Running under vpython3 with the checkout's blinkpy on sys.path and
        # patches already applied above: hand off to the official runner.
        import multiprocessing
        multiprocessing.set_start_method('spawn')
        from blinkpy.web_tests import run_web_tests
        return run_web_tests.main(sys.argv[1:], sys.stderr)

    # Plain launch: pick a port/checkout and re-exec under vpython3.
    try:
        return _run_outer(sys.argv[1:])
    except UsageError as e:
        print(f'[wpt-port-fallback] error: {e}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
