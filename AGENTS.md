# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is
A collection of scripts for the iOS [Scripting](https://scriptingapp.github.io) app, written in TypeScript/TSX. Two scripts live here: `Surge Panel/` (a Surge monitoring panel) and `frp-manager/` (an frp Admin API manager). UI is built from the `scripting` runtime module (SwiftUI-backed views/hooks like `VStack`, `TabView`, `useObservable`), which exists **only inside the iOS Scripting app**.

### Shared design system
- Both scripts use the same visual language. Design tokens live in `Surge Panel/lib/ui.ts` and `frp-manager/lib/theme.ts`, and components live in `components/Kit.tsx` in each script (`Card`, `HeroCard`, `MetricTile`, `ChipBar`, `ListRow`, `StatusPill`, `Tag`, `LIST_STYLE`, `BARE_ROW`, …).
- The two `Kit.tsx` files are intentionally identical apart from the token import path (`../lib/ui` vs `../lib/theme`) because each script is packaged standalone. Keep them in sync when you change either one.
- Liquid Glass (`glassEffect`, `buttonStyle="glass"`) is only used on floating controls and is gated by `IS_GLASS` (iOS 26+); older systems fall back to `thinMaterial`. Content cards use opaque grouped backgrounds.
- Surge Panel tabs are addressed by `TabId` (`"dashboard" | "routing" | "activity" | "settings"`, ordered by `TAB_ORDER` in `lib/store.ts`), never by numeric index. Use `openActivity(segment)` to jump to the Activity tab.

### Environment / dependencies
- There is **no `package.json`, lockfile, `tsconfig.json`, test framework, or lint config**. Nothing needs to be installed; `node` (v22+) is preinstalled and is all that's used here. The startup update script is a no-op runtime check.
- Do **not** add a build/test toolchain unless asked — this project is edited as plain source and packaged as a zip.

### Running / testing (Linux limitations)
- The apps **cannot run on Linux**: almost every file imports from `"scripting"` (an iOS-only runtime), so they can't be executed or fully type-checked without the device.
- OS-agnostic modules: `Surge Panel/lib/metrics.ts` (Prometheus parsing, formatters, `downsample`) and `frp-manager/lib/frpCore.ts` (request building, error parsing, `formatBytes` / `splitBytes`). Run/verify them on Linux with Node's built-in TS stripping, e.g.:
  ```bash
  node --experimental-strip-types your_harness.ts   # import from "Surge Panel/lib/metrics.ts"
  ```
- For a syntax check of TSX without adding tooling to the repo, install esbuild in a temp directory (e.g. `/tmp`) and run `esbuild --loader:.tsx=tsx` over the files.
- Real end-to-end testing requires the iOS Scripting app plus a reachable Surge instance (HTTP API + Prometheus Metrics Endpoint) or frp instance (admin / dashboard port). This can't be done from the cloud VM.

### "Build" = packaging the `.scripting` bundles
Each `.scripting` file is a plain zip of its script directory (imported by opening it in the Scripting app). Reproduce them with:
```bash
zip -r -X "Surge Panel.scripting" "Surge Panel" -x '*.DS_Store'
zip -r -X "frp-manager.scripting" "frp-manager" -x '*.DS_Store'
```
Keep both bundles in sync with their folders, and bump `version` in the script's `script.json` (plus a `changelog.md` entry) when packaging a release.
