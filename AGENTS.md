# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is
A collection of scripts for the iOS [Scripting](https://scriptingapp.github.io) app, written in TypeScript/TSX. The only script today is `Surge Panel/` (a Surge monitoring panel). UI is built from the `scripting` runtime module (SwiftUI-backed views/hooks like `VStack`, `TabView`, `useObservable`), which exists **only inside the iOS Scripting app**.

### Environment / dependencies
- There is **no `package.json`, lockfile, `tsconfig.json`, test framework, or lint config**. Nothing needs to be installed; `node` (v22+) is preinstalled and is all that's used here. The startup update script is a no-op runtime check.
- Do **not** add a build/test toolchain unless asked — this project is edited as plain source and packaged as a zip.

### Running / testing (Linux limitations)
- The app **cannot run on Linux**: every file except `Surge Panel/lib/metrics.ts` imports from `"scripting"` (an iOS-only runtime), so it can't be executed or type-checked without the device.
- `Surge Panel/lib/metrics.ts` is the only OS-agnostic module (pure Prometheus parsing + byte/speed/time formatters). Run/verify it on Linux with Node's built-in TS stripping, e.g.:
  ```bash
  node --experimental-strip-types your_harness.ts   # import from "Surge Panel/lib/metrics.ts"
  ```
- Real end-to-end testing requires the iOS Scripting app plus a reachable Surge instance with HTTP API + Prometheus Metrics Endpoint enabled (configured in the app's Settings tab). This can't be done from the cloud VM.

### "Build" = packaging the `.scripting` bundle
`Surge Panel.scripting` is just a plain zip of the `Surge Panel/` directory (imported by opening it in the Scripting app). Reproduce it with:
```bash
zip -r -X "Surge Panel.scripting" "Surge Panel" -x '*.DS_Store'
```
Keep `Surge Panel.scripting` in sync with the folder and bump `version` in `Surge Panel/script.json` when packaging a release.
