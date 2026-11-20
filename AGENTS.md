# AGENTS.md

Notes for AI coding agents and new contributors. `README.md` says what the app is, `docs/PLAN.md` is the approved
plan with its milestones, and `docs/HARNESS.md` explains how to validate a change and read the monitors.

treehouse is a world-map family tree viewer: a static web app with no backend. It reads a GEDCOM file in the browser,
keeps it in IndexedDB, and flies the camera to each person's birthplace as you walk the tree. The file is never
uploaded. Status: **M0** (harness and empty shell), **M1** (GEDCOM import, library, home-person picker), **M2**
(geocoding, place review, pins, opt-in online lookup), **M3** (place markers, focus fly-to, profile, navigation,
search), **M4** (threads and journey mode), **M5** (sync from the file, remembered state per import, pins
file) and **M6** (hide living people, a motion setting, keyboard and screen-reader polish, a phone layout) are
built; M7 in `docs/PLAN.md` is not. The live site is https://jessescott.github.io/treehouse/.

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
- The app sends nothing about a tree anywhere, with one opt-in exception: the online lookup on the place-review
  screen sends the text of a place, and only that, to Nominatim, and only after the user turns it on
  (`src/geocode/nominatim.ts` is the only code that calls it). M7 adds opt-in telemetry with a fixed vocabulary.
  Neither may ever carry names, dates or file content, and tests must never reach the real service.
- `reports/data-places.json` (written by `check:data`) holds real place names. Do not print it, quote it or copy
  from it; work from the aggregate numbers.

## Git rules

- Commit locally in small, logical steps once a unit of work is finished and `npm run verify` is green, and say what
  you committed. **Never `git push` and never open a pull request unless Jesse asks.**
- Anything that changes GitHub (pushing, branch protection, enabling Pages, secrets, labels) needs Jesse's explicit
  go-ahead each time.
- `main` is protected by a ruleset: every change goes through a pull request, squash merged, with the **Verify**
  check required; nobody can push to it directly, force-push it or delete it. Work on a branch. Merging to `main`
  deploys to GitHub Pages. Versions follow SemVer (`version` in `package.json`).
- Line endings are LF (`.gitattributes`); the fixtures keep their BOM and CRLF on purpose.

## Commands

```bash
npm run dev          # dev server on http://localhost:5173 (debug API always on)
npm run build        # production build into dist/, with dist/version.json
npm run preview      # serve dist/ on http://localhost:4173

npm run check:fast   # privacy guard, typecheck, lint, format check, unit tests (seconds)
npm run check:e2e    # build, then Playwright against the built app
npm run check:perf   # build, then bundle-size, Lighthouse and journey frame-time budgets
npm run verify       # the whole ladder; writes reports/verify.json and reports/verify.md

npm run check:data -- <path>   # local only: aggregate import report for a real export (never names or places)
npm run lockfile:check   # is package-lock.json complete for Linux? (part of check:fast)
npm run lockfile:fix     # restore the entries npm drops on Windows, from origin/main
npm run fixtures     # regenerate fixtures/synthetic/ from the generator
npm run gazetteer    # rebuild public/gazetteer/ from GeoNames (downloads; rarely needed)
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
  MapLibre GL JS with the globe projection, Zustand, `idb` (IndexedDB) and `fflate` (reading `.zip` exports).
- `src/main.tsx` installs the debug API, the focus camera and the journey player, and renders `src/App.tsx`.
- `src/map/`: `MapView.tsx` owns the one MapLibre map and registers it in `mapRegistry.ts`. `camera.ts` is the single
  place that moves the camera (`moveCamera`: a flight, or a jump cut when motion is off) and decides when the map is
  idle. `offlineStyle.ts` is a style with no network needs: one bundled Natural Earth land GeoJSON
  (`src/map/basemap/`, built by `npm run basemap`), no tiles, glyphs or sprites (so map layers cannot draw text).
  It is the only style until an online basemap is added; tests must keep using the offline one.
  `PlaceMarkers.tsx` draws one clustered circle per place on the map (`markerData.ts` builds the GeoJSON);
  `focusCamera.ts` is a store subscription that flies to each newly focused person, so the flight has started
  before anything awaits idle; `FocusPin.tsx` marks where the focused person is shown.
  `Threads.tsx` draws great-circle lines between relatives under the markers (`threadData.ts` builds them: lineage,
  close family, all ancestors, one person's moves; a thread joins people's own places, never a place borrowed from a
  relative). `journeyPlayer.ts` is a store subscription that moves a playing journey on once the camera has landed.
  `panelPadding.ts` pads the map by the height of the panel when, on a phone, the panel is a sheet along the
  bottom, so flights land in the part of the map you can see.
- `src/gedcom/`: everything about reading a file. `parse.ts` (text to `Tree`; forgiving, problems become coded
  `warnings`), `dates.ts` (free-text dates), `types.ts` (the data model), `people.ts` (lifespan, name search),
  `readGedcom.ts` (unzip, decode, check, parse, hash; throws `ImportError` with a fixed code),
  `import.worker.ts` and `importFile.ts` (the same, off the main thread). Person and family ids are the GEDCOM
  cross-reference ids, kept as written, because later milestones match people across re-exports by them.
  `relatives.ts` reads parents, spouses, children and siblings, labels the relationship to the home person
  (genealogists' terms: "2nd great-grandfather", "1st cousin once removed", "Wife of uncle") with the line between
  them, and decides where each arrow key goes. `lines.ts` gives the stops of a journey (father's line, mother's
  line, or up to one ancestor) and every ancestor link. `living.ts` decides who is presumed living (no death or
  burial, and born, or guessed from relatives to be born, within 100 years) and builds the tree as shown with them
  hidden: kept in the tree as "Living", with no events or notes. `testTree.ts` builds small made-up trees for unit tests.
- `src/geocode/`: putting place strings on the map. `normalize.ts` (how names are compared; `placeKey` is the
  identity of a place, shared by every spelling), `gazetteer.ts` (the bundled data in memory), `match.ts` (the
  matching rules: most specific known part wins, the country and region the string names are never left, a broader
  match is flagged approximate), `geocoder.ts` (loads only the country files the strings need), `geocode.worker.ts`
  and `geocodePlaces.ts` (the same, off the main thread), `treePlaces.ts` (a tree's distinct places, coverage,
  and who has events at each), `focusPlace.ts` (where a person is shown: birth, then baptism, earliest residence,
  marriage, death, burial, then the nearest relative's place; anything but an exactly found birthplace is
  approximate), `nominatim.ts` (the opt-in online lookup). The data is `public/gazetteer/`, built by `tools/gazetteer/build.mjs`.
- `src/library/db.ts`: the IndexedDB library. An `ImportRecord` (name, file hash, counts, home person) and its
  parsed `Tree` are stored together; a file with a hash already in the library is opened, not stored again. The
  `places` store holds pins and online answers by `placeKey`, shared by every import. Gazetteer matches are not
  stored: they are recomputed when a tree is opened, so a better gazetteer improves old imports. Version 3 (M5)
  adds the `handles` store (a File System Access handle per import id, Chromium only) and, on the record, `view`
  (focused person, camera, projection, thread toggles) and `syncedAt`. `syncDiff.ts` compares two readings of a
  file by GEDCOM id (people added, removed, changed; family changes; new and dropped place keys).
  `fileAccess.ts` wraps `showOpenFilePicker`, the permission re-request and dropped handles; other browsers use
  a file input. `placeCache.ts` writes, validates and merges the pins file (a pin beats an online answer,
  otherwise the newer wins); it holds place keys, coordinates and labels, never names or dates.
- `src/ui/`: the side panels (`LibraryPanel`, `RootPicker`, `TreePanel`, `PlacesPanel`), the focused person's
  `Profile`, `Navigation.tsx` (search, breadcrumb, pedigree), `useArrowKeys.ts`, `PlaceCard` (the people at a
  clicked marker), `Journey.tsx` (thread check boxes, journey buttons and the play, scrubber and speed bar),
  `SyncReview.tsx` (a sync's diff and its Apply button, inside a library item) and `messages.ts`, which holds the wording for error codes, counts, events and place outcomes.
- `src/state/appStore.ts`: Zustand store: the library, the open tree and its places, import and lookup progress,
  and the actions the panels call. `screenOf` derives which panel shows; a tree with no home person goes to the
  picker. Opening a tree restores its remembered view (focus, threads, projection, and `cameraRestore`, which
  `focusCamera.ts` applies as a jump cut instead of flying), or else focuses its home person; the open import's id
  is kept in `localStorage` so a reload reopens it before the library counts as loaded. `viewMemory.ts` writes
  the view back (debounced, and on `moveend` via `MapView.tsx`); `whenIdle` waits for the write. Sync and the
  pins file are store actions too (`syncImport`, `syncFromFile`, `applySync`, `exportPlaces`, `importPlaces`).
  `OpenTree` holds `full` (as read from the file; places are geocoded from it, and the home-person picker lists it)
  and `tree` (as shown: `full`, or with living people hidden when `hideLiving` is on), so everything that draws or
  searches people reads `tree`. `hideLiving` and `motion` are kept in `localStorage` for every tree;
  `src/state/motion.ts` says whether the camera flies now (`?motion=off`, then the setting, then the system). `src/state/focus.ts` derives the focused person, where they are
  shown and their relationship, memoised so components and the debug API share one answer; `threads.ts` does the
  same for the threads. Focusing someone by hand pauses a journey (and moves its scrubber if they are a stop).
  `src/map/PlacePin.tsx` draws the selected place's pin and turns map clicks and drags into pins.
- `src/ui/DisplaySettings.tsx` is the Display section (hide living people, camera motion); `panelFocus.ts` moves
  keyboard focus to the panel's heading when the panel changes, and the skip link uses it too.
- `src/harness/`: `flags.ts` reads `?harness=1` and `?motion=off`; `debugApi.ts` builds `window.__treehouse`;
  `types.ts` is its contract, shared with the e2e tests. When a feature adds state an agent should be able to
  assert, extend `TreehouseState` and the e2e tests in the same change.
- `harness/` (repo root) is the check ladder: `verify.mjs`, `perf.mjs`, `smoke.mjs`, `privacy-guard.mjs`,
  `budgets.json`, `check-data.mjs`. `e2e/` holds the Playwright specs and `e2e/helpers.ts`. `tests/` holds Vitest
  tests that need Node (reading fixture files). `tools/` holds generators, the lockfile check, and the Python
  reference scripts the parser was ported from (`tools/reference/`).
- The build uses a relative base (`./`), so the same `dist/` works at `/` and under `/treehouse/` on GitHub Pages.
  Anything fetched from inside a worker needs an absolute URL (see `MapView.tsx`).

## Conventions and gotchas

- UI elements a test or agent needs get a stable `data-testid`. Do not rename one without updating `e2e/`.
- All camera movement goes through `moveCamera` with `motionOn()`, so `?motion=off`, the motion setting and reduced
  motion keep working.
- Anything that shows people reads `open.tree`, never `open.full`, so hiding living people cannot be bypassed.
  Each panel's `h2` carries `tabIndex={-1}` and `data-panel-heading` so focus can move to it.
- MapLibre 6 is ESM-only, has named exports (no default export) and loads its worker from a URL set with
  `setWorkerUrl`. Its `ProjectionSpecification` type sends type-aware ESLint into a very long loop if you chain
  through it; go through `projectionName()` in `camera.ts`.
- Headless Chromium renders WebGL in software; the flags are in `playwright.config.ts` and `harness/lib/browser.mjs`.
- Avoid pasting invisible characters (a byte-order mark, a raw carriage return) into source; build them with
  `String.fromCharCode` as the generator does.
- After any `npm install` on Windows, run `npm run lockfile:check`. npm there silently drops the `@emnapi/core`
  and `@emnapi/runtime` entries that Linux needs, and `npm ci` then fails in CI. `npm run lockfile:fix` copies them
  back from `origin/main`. `check:fast` runs the check, so a broken lockfile fails before it is pushed.
- A test source file must not contain a line that is exactly a GEDCOM header (level 0, `HEAD`): the privacy guard
  reads it as family data. Build test GEDCOMs from an array of lines, as `src/gedcom/parse.test.ts` does.
- A database schema change bumps the version in `src/library/db.ts` and adds an `oldVersion` step; never edit an
  earlier step, because browsers that already hold a library run only the new ones.
- `public/gazetteer/` is generated: never edit it by hand, and rebuild it in its own commit.
- Error and warning values that reach the UI or the debug API are fixed codes (`ImportErrorCode`, `ParseWarning`),
  never text from the file. The debug state has place counts only; `__treehouse.place(text)` answers for a string
  the caller already has. Keep it that way: the debug state and the reports must be safe to paste anywhere.
- A reload reopens the import that was open. In the dev build's own library (which may hold a real tree), only open
  `treehouse-…` imports and go back to the library before you finish, so the next visit opens on the library.
