---
name: bikeshed-preview
description: Build a local Bikeshed specification and show the rendered HTML in the Browser side panel. Use when asked to preview a .bs file, render a CSS specification, show Bikeshed HTML in the side pane, or start a local spec preview with rebuilds on save. Reuse an existing preview server when possible. Use Bikeshed's built-in local server, not a custom extension.
---

# Bikeshed Preview

Build the current source, serve its directory on localhost, and open the HTML
in the Browser side panel. Do not add a custom server or repository tooling.

## 1. Select the source and output

- Read repository instructions and check the working tree. Use the requested
  `.bs` file or the specification already under discussion. Otherwise, find
  candidates in the workspace and ask the user if the target is ambiguous.
- Serve from the source directory so relative images, styles, and includes work.
- In CSSWG checkouts, use `Overview.html` only if it is ignored and untracked.
  Check with `git check-ignore` and `git ls-files`. Do not overwrite tracked HTML
  or unrelated existing files. If no safe ignored output path exists, ask before
  changing ignore rules or writing generated files into the repository.

## 2. Resolve Bikeshed

- Reuse a working executable on `PATH`, in the project's environment, or in a
  known environment from an existing preview process. Confirm it with
  `bikeshed --version`. Do not hardcode a prior session's environment path.
- Install only after confirming that Bikeshed is missing or its environment is
  broken. Use an isolated environment outside the repository, preferably in the
  session artifacts directory. Use documented repository requirements if
  available; otherwise install `bikeshed`. Do not change global Python packages
  or repository dependency files.
- If `uv pip install` fails with a connection error, try Python's pip against
  the same environment. For an environment without pip, use an available pip's
  `--python` option or run `ensurepip` in that environment. Keep TLS checks
  enabled. Report unresolved installation failures; do not upload source to an
  external build service.
- Check `bikeshed serve --help` for the installed version.

## 3. Reuse or start the preview

- Inspect known process handles and the current Browser panel. Reuse a server
  only after confirming its source directory, command, and successful current
  build. An HTTP 200 response alone does not prove that the HTML is current.
- For a new preview, build once from the source directory:

  ```text
  BIKESHED spec SOURCE.bs OUTPUT.html
  ```

  Replace placeholders with resolved values and quote paths. Check the exit
  status and diagnostics. Do not use `--force` or `--die-on=nothing` to hide
  errors. Report warnings without editing unrelated specification content.
- Select a free port, for example 8765, and start from the same directory:

  ```text
  BIKESHED serve --localhost --port PORT SOURCE.bs OUTPUT.html
  ```

  Never stop an unrelated process to free a port. Use `--no-update` only after a
  successful data update or when the user explicitly requests offline operation.
- Use the execution tool's detached-process option for an ongoing preview when
  permitted. Keep the process handle and diagnostics. If detaching is
  unavailable, explain the lifetime limit; do not bypass it with shell tricks.
- Verify that the process is running and request the exact output URL with a
  bounded retry. Inspect diagnostics on failure. Select another port if occupied.

## 4. Open and inspect the side panel

- Discover the Browser canvas schema with `list_canvas_capabilities`. Use
  `open_canvas` with a stable `instanceId` for the specification, the verified
  URL, and side-panel placement when supported. Reuse that panel for later
  navigation. Add a section fragment when requested.
- Use the same execution host as the browser. For remote builds, use supported
  port forwarding; do not assume that the browser's localhost is the remote host
  or expose the server publicly.
- Read the page through the canvas to confirm its title and expected local
  content. Check that local images load, using page JavaScript only if needed.
- If canvas tools are unavailable, give the verified URL and state that opening
  the panel is unavailable. Do not claim that a panel was opened.

## 5. Preserve source files and state the result

- State that saving triggers a rebuild and that the panel requires a reload.
  Do not promise automatic browser refresh.
- Keep build diagnostics available through the process handle. If a later build
  fails, identify remaining HTML as the last successful build, not a current
  preview. Do not claim that diagnostics appear inside the rendered page.
- Leave an explicitly requested ongoing server running. Stop only processes
  created for this preview when requested or no longer needed.
- Do not edit or touch source files to test watching, change Git state, commit,
  push, or publish anything. Keep environments and logs outside the repository.
  Check that generated output has added no unexpected working-tree changes.
