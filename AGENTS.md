# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is
A collection of scripts for the iOS [Scripting](https://scriptingapp.github.io) app, written in TypeScript/TSX. Three scripts live here: `Surge Panel/` (a Surge monitoring panel), `frp-manager/` (an frp Admin API manager) and `cf-observability/` (Cloudflare Workers / Pages usage, analytics and Workers Logs, plus a home/lock screen widget in `widget.tsx`). UI is built from the `scripting` runtime module (SwiftUI-backed views/hooks like `VStack`, `TabView`, `useObservable`), which exists **only inside the iOS Scripting app**.

### Shared design system
- All scripts use the same visual language. Design tokens live in `Surge Panel/lib/ui.ts`, `frp-manager/lib/theme.ts` and `cf-observability/lib/theme.ts`, and components live in `components/Kit.tsx` in each script (`Card`, `HeroCard`, `MetricTile`, `ChipBar`, `ListRow`, `StatusPill`, `Tag`, `LIST_STYLE`, `BARE_ROW`, …).
- The three `Kit.tsx` files are intentionally identical apart from the token import path (`../lib/ui` vs `../lib/theme`) because each script is packaged standalone. Keep them in sync when you change any one.
- Liquid Glass (`glassEffect`, `buttonStyle="glass"`) is only used on floating controls and is gated by `IS_GLASS` (iOS 26+); older systems fall back to `thinMaterial`. Content cards use opaque grouped backgrounds.
- Surge Panel tabs are addressed by `TabId` (`"dashboard" | "routing" | "activity" | "settings"`, ordered by `TAB_ORDER` in `lib/store.ts`), never by numeric index. Use `openActivity(segment)` to jump to the Activity tab.

### Environment / dependencies
- There is **no `package.json`, lockfile, `tsconfig.json`, test framework, or lint config** in the repo. Do **not** add a build/test toolchain unless asked — this project is edited as plain source and imported from GitHub folders.
- Cloud Agent `install` caches host tools under `/usr/local` and `/opt/scripting` (not in the repo):
  - `node` 22+ (required; `scripting-cli` needs Node 20+)
  - `scripting-cli` (official desktop ↔ Scripting App sync CLI)
  - `esbuild` (TSX/TS syntax checks without adding repo tooling)
  - Official development skill mirror: `/opt/scripting/scripting-app-development` ([ScriptingApp/scripting-app-development](https://github.com/ScriptingApp/scripting-app-development))
  - Official LLM docs index cache: `/opt/scripting/llms.txt` (live source: <https://scriptingapp.github.io/llms.txt>)
- There is no `start` service. Do **not** auto-run `scripting-cli start` on boot — it needs an interactive editor choice and a reachable Scripting App on the same LAN (or a tunnel). Cloud VMs normally cannot reach the user's iPhone.

### Scripting API / skill workflow
Before changing Scripting-specific APIs or entry points, follow the official skill:
1. Read `/opt/scripting/scripting-app-development/SKILL.md` and the matching file under `references/` / `checklists/`.
2. Look up the exact API in `/opt/scripting/llms.txt` (or the live index) and open the linked guide page — do not invent APIs from Swift/React memory.
3. If `scripting-cli` has already synced app `.d.ts` files into the workspace, use those for exact signatures **together with** the docs for permissions and host constraints.

### Running / testing (Linux limitations)
- The apps **cannot run on Linux**: almost every file imports from `"scripting"` (an iOS-only runtime), so they can't be executed or fully type-checked without the device.
- OS-agnostic modules: `Surge Panel/lib/metrics.ts` (Prometheus parsing, formatters, `downsample`), `frp-manager/lib/frpCore.ts` (request building, error parsing, `formatBytes` / `splitBytes`) and `cf-observability/lib/cfCore.ts` (plan limits, billing periods, GraphQL / telemetry query builders and parsers, formatters). Run/verify them on Linux with Node's built-in TS stripping, e.g.:
  ```bash
  node --experimental-strip-types your_harness.ts   # import from "Surge Panel/lib/metrics.ts"
  ```
- TSX/TS syntax check (already on PATH after install):
  ```bash
  esbuild --bundle=false --outdir=/tmp/esbuild-check --loader:.tsx=tsx --loader:.ts=ts "Surge Panel/index.tsx"
  ```
- Desktop live sync (when the user has Scripting App reachable, typically on their own machine — not assumed in Cloud Agents):
  ```bash
  scripting-cli start --editor=none --no-auto-open
  ```
  After the app connects and selects a project, search the synced `.d.ts` files for API signatures. Keep CLI sync evidence separate from Widget / Intent / notification / Live Activity / Safari host E2E.
- Real end-to-end testing requires the iOS Scripting app plus a reachable Surge instance (HTTP API + Prometheus Metrics Endpoint), frp instance (admin / dashboard port) or a Cloudflare user API token (see `cf-observability/README.md` for required permissions). This can't be done from the cloud VM alone.

### Distribution (no build step)
- Scripts are imported straight from their GitHub folder URL (e.g. `https://github.com/bluenight91/Scripting-Scripts/tree/main/cf-observability`). Do **not** generate or commit `.scripting` zip bundles.
- Each script's section in the root `README.md` (and its own `README.md`) carries a one-click import link: `https://www.scripting.fun/import_scripts/?urls=` + URL-encoded JSON array of folder URLs (spaces in the folder name are double-encoded, e.g. `Surge%2520Panel`). The official generator is <https://www.scripting.fun/import_scripts>.
- When releasing, bump `version` in the script's `script.json` and add a `changelog.md` entry.
