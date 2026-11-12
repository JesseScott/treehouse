# AGENTS.md

Notes for AI coding agents and new contributors. `README.md` says what the app is, `docs/PLAN.md` is the approved
plan with its milestones, and `docs/HARNESS.md` explains how to validate a change and read the monitors.

treehouse is a world-map family tree viewer: a static web app with no backend. It reads a GEDCOM file in the browser,
keeps it in IndexedDB, and flies the camera to each person's birthplace as you walk the tree. The file is never
uploaded. Status: **M0** (harness and empty shell) is built; M1 to M7 in `docs/PLAN.md` are not.

## Privacy rules (these come first)

- **Real family data never enters the repository**: no real `.ged` or `.zip`, and no real names, dates or places of
  real people in code, fixtures, tests, docs, commit messages, screenshots or reports. Jesse's own exports live
  outside the repo (or in git-ignored `local-data/`) and are for local testing only.
- The only GEDCOM files in the repo are the generated, fictional ones in `fixtures/synthetic/`. Change them by
  changing `tools/fixtures/generate.mjs` and running `npm run fixtures`; never edit them by hand, and never invent
  people who resemble real ones (the generator uses made-up surnames on purpose).
- `npm run check:privacy` (`harness/privacy-guard.mjs`) enforces this and runs first in the ladder and in CI. Do not
  weaken it, and do not add exceptions to the `*.ged` / `*.zip` rules in `.gitignore`.
- `reports/` is git-ignored. Anything produced from real data goes there or stays outside the repo.
- The app sends nothing about a tree anywhere. Later milestones add opt-in place lookups (place string only) and
  opt-in telemetry with a fixed vocabulary; neither may ever carry names, dates, places of people, or file content.

## Git rules

- Commit locally in small, logical steps once a unit of work is finished and `npm run verify` is green, and say what
  you committed. **Never `git push` and never open a pull request unless Jesse asks.**
- Anything that changes GitHub (pushing, branch protection, enabling Pages, secrets, labels) needs Jesse's explicit
  go-ahead each time.
- Target convention once the repo is live: every change goes through a pull request into a protected `main`, squash
  merged, with the **Verify** check required. Versions follow SemVer (`version` in `package.json`).
- Line endings are LF (`.gitattributes`); the fixtures keep their BOM and CRLF on purpose.

## Commands

```bash
npm run dev          # dev server on http://localhost:5173 (debug API always on)
npm run build        # production build into dist/, with dist/version.json
npm run preview      # serve dist/ on http://localhost:4173

npm run check:fast   # privacy guard, typecheck, lint, format check, unit tests (seconds)
npm run check:e2e    # build, then Playwright against the built app
npm run check:perf   # build, then bundle-size and Lighthouse budgets
npm run verify       # the whole ladder; writes reports/verify.json and reports/verify.md

npm run fixtures     # regenerate fixtures/synthetic/ from the generator
npm run format       # Prettier
npm run smoke -- --url <deployed url>   # smoke-test a deployed build
```

Node 22 or newer. Run `npx playwright install chromium` once before the e2e, smoke or perf checks.
`.claude/launch.json` defines the `dev` and `preview` servers for the browser pane, and `/verify` runs the ladder.

## Definition of done

1. `npm run verify` passes, and you have read `reports/verify.md` (not just the exit code).
2. New behaviour has a test at the lowest rung that can catch it: Vitest for logic, Playwright for what the user sees.
   End-to-end tests assert through `window.__treehouse.state()`, not pixels, wherever they can.
3. For anything visible, you opened the app from `.claude/launch.json`, looked at it, and checked
   `__treehouse.state()` and the console.
4. A budget in `harness/budgets.json` is only raised deliberately, in its own commit, with the reason.
5. Docs that describe what you changed (`AGENTS.md`, `docs/HARNESS.md`, `README.md`) still tell the truth.
6. Committed locally in logical steps; nothing pushed.

## Architecture

- **Stack:** Vite, React, TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`),
  MapLibre GL JS with the globe projection, Zustand. Planned: `idb`, `fflate`, a parser worker (see `docs/PLAN.md`).
- `src/main.tsx` installs the debug API and renders `src/App.tsx`.
- `src/map/`: `MapView.tsx` owns the one MapLibre map and registers it in `mapRegistry.ts`. `camera.ts` is the single
  place that moves the camera (`moveCamera`: a flight, or a jump cut when motion is off) and decides when the map is
  idle. `offlineStyle.ts` is a style with no network needs: one bundled Natural Earth land GeoJSON
  (`src/map/basemap/`, built by `npm run basemap`), no tiles, glyphs or sprites. It is the only style until M3 adds
  an online basemap; tests must keep using the offline one.
- `src/state/appStore.ts`: Zustand store for app-wide UI state.
- `src/harness/`: `flags.ts` reads `?harness=1` and `?motion=off`; `debugApi.ts` builds `window.__treehouse`;
  `types.ts` is its contract, shared with the e2e tests. When a feature adds state an agent should be able to
  assert, extend `TreehouseState` and the e2e tests in the same change.
- `harness/` (repo root) is the check ladder: `verify.mjs`, `perf.mjs`, `smoke.mjs`, `privacy-guard.mjs`,
  `budgets.json`. `e2e/` holds the Playwright specs. `tools/` holds generators and the Python reference scripts for
  the M1 parser port (`tools/reference/`).
- The build uses a relative base (`./`), so the same `dist/` works at `/` and under `/treehouse/` on GitHub Pages.
  Anything fetched from inside a worker needs an absolute URL (see `MapView.tsx`).

## Conventions and gotchas

- UI elements a test or agent needs get a stable `data-testid`. Do not rename one without updating `e2e/`.
- All camera movement goes through `moveCamera`, so `?motion=off` and reduced motion keep working.
- MapLibre 6 is ESM-only, has named exports (no default export) and loads its worker from a URL set with
  `setWorkerUrl`. Its `ProjectionSpecification` type sends type-aware ESLint into a very long loop if you chain
  through it; go through `projectionName()` in `camera.ts`.
- Headless Chromium renders WebGL in software; the flags are in `playwright.config.ts` and `harness/lib/browser.mjs`.
- Avoid pasting invisible characters (a byte-order mark, a raw carriage return) into source; build them with
  `String.fromCharCode` as the generator does.
