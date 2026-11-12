# treehouse: a world-map family tree viewer

## Context

Jesse has been reconciling two Ancestry trees in this session. He now wants a web app, **treehouse**, to *view* a tree on a world map: walk the tree person by person and have the camera fly to where each person was born, so that following a line travels from Vancouver back to Scotland. The tree research is parked; the data stays as it is.

Requirements from Jesse:
- Navigate the tree; the camera animates to each person's birthplace.
- Click a node for details similar to an Ancestry profile.
- Optional "threads" drawn on the map between relatives.
- Production loads a **GEDCOM file** in the browser. His own data is for local testing only and must never be committed.
- Remember previous imports and selections, with a way to sync/update an import from its file.
- A full **agentic harness** so an agent can validate, measure and monitor the app as it is built and deployed.
- **Plan only on this thread.** Implementation happens in a new session.

Decisions Jesse made (12 Nov 2026): hybrid geocoding; GitHub Pages; synthetic monitoring plus opt-in error reports and usage stats; React + TypeScript with MapLibre GL.

## Shape of the app

A static single-page app with no backend. The GEDCOM is parsed in the browser and stored in IndexedDB; the file is never uploaded.

- **Stack:** Vite, React, TypeScript, MapLibre GL JS (globe projection, flat toggle), Zustand for state, `idb` for IndexedDB, `fflate` to read `.zip` exports, Vitest, Playwright.
- **Basemap:** a keyless vector tile source (OpenFreeMap first choice, Protomaps as fallback; confirm terms at build time). Tests use a bundled offline style (Natural Earth land polygons) so they need no network.
- **Repo:** `C:\Users\jesse\Developer\git\jessecolinscott\treehouse`, following the `meanwhile` conventions: `AGENTS.md` with a one-line `CLAUDE.md` that imports it, PR-only protected `main`, squash merges, SemVer. Local commits only; no push, no GitHub repo creation and no PR until Jesse asks.

### What a "node" is
- **Places are the map markers.** One marker per geocoded place, sized by how many people have events there, clustered when zoomed out. Clicking one lists the people there.
- **People are the tree nodes.** Focusing a person flies the camera to their birthplace and opens their profile. If there is no birthplace, fall back to baptism, earliest residence, marriage, death, then the nearest relative's place, and label it approximate.

### Features
1. **Import and library:** drag in a `.ged` or `.zip`; pick the root ("home") person; a home screen lists previous imports with open, rename, delete and sync.
2. **Profile panel:** name, lifespan, relationship to the root (for example "2nd great-grandfather"), a timeline of facts with clickable places, and chips for parents, spouses, children and siblings.
3. **Navigation:** chips, arrow keys (up father, shift+up mother, down child, left/right spouse and siblings), name search, a breadcrumb of the line back to the root, and a small pedigree overlay.
4. **Journey mode:** choose a line (paternal, maternal, or the path to any ancestor) and autoplay it generation by generation with a scrubber and speed control. Honors reduced-motion with jump cuts.
5. **Threads (toggles):** lineage thread (root to focused person), family threads (focused person to parents, spouse, children), all-ancestors web, and one person's migration (birth, residences, death). Drawn as great-circle arcs in GeoJSON line layers.
6. **Sync/update:** re-read the file, compare by hash, show a diff (people added, removed, changed; new places), then apply. People are matched by GEDCOM id (Ancestry ids are stable across exports), so root, last selection and manual pins survive. Chromium re-reads via a stored file handle; other browsers use a file picker.
7. **Remembered state per import:** root, focused person, camera, thread toggles.

### Geocoding (hybrid)
- A bundled gazetteer built from GeoNames (CC BY 4.0: populated places plus country and region centroids), compacted by a build script and lazy-loaded in a worker.
- Matching: normalize the place string, match the most specific part, disambiguate with the region and country parts, and fall back to the next broader part flagged "approximate".
- Unmatched places: optional online lookup (Nominatim, 1 request per second), off until the user opts in; only the place string is sent, never people.
- Manual pin: drag or click to set any place. The geocode cache is shared across imports and can be exported and imported as JSON.
- A place-review screen lists unresolved and approximate places.

### Data quirks to design for (seen in Jesse's exports)
UTF-8 with BOM; `CONT`/`CONC` lines; people with two parent families; duplicates; detached branches; trailing spaces in surnames; names with quotes, parentheses and Gaelic; dates such as "Abt. 1883", "After 1881", "Jul 1823" and ambiguous numeric dates ("05 11 1977"); lowercase place names; street addresses and croft numbers inside places; people with no places at all.

## The agentic harness (built first, in M0)

1. **Agent rules:** `AGENTS.md` (architecture, commands, definition of done, privacy rules), `docs/HARNESS.md` (how to validate a change and read the monitors), `.claude/launch.json` (dev and preview servers), `.claude/settings.json` (allowlist for the npm scripts), and a `/verify` skill that runs the ladder below and summarizes the report.
2. **Test surface inside the app:** `window.__treehouse`, enabled in dev and with `?harness=1`: `state()` (tree, focused person, camera center/zoom, thread counts, geocode coverage), `whenIdle()` (map idle and animations finished), `focus(id)`; `?motion=off` makes camera moves instant; stable `data-testid`s. This lets an agent assert "the camera is over Lewis" without comparing pixels.
3. **Synthetic fixtures:** a generator script produces fictional GEDCOMs that copy the quirks above and follow a Vancouver, Ontario, Quebec, Scotland route, at 30, 500 and 5,000 people. Only these are committed.
4. **Check ladder** (`npm run verify` runs all and writes `reports/verify.json` plus a Markdown summary):
   - `check:fast`: typecheck, lint, Vitest (parser, dates, geocoder matching, relationship labels, arcs, sync diff, telemetry vocabulary).
   - `check:e2e`: Playwright on the built app with the fixtures: import, reload remembers the import, sync diff, focus moves the camera, journey ends within tolerance of the expected coordinates, thread counts, profile content, keyboard navigation, axe accessibility scan. Screenshots and traces are saved for the agent to inspect.
   - `check:perf`: bundle-size budget, Lighthouse budgets, import time per 1,000 people, frame-time p95 during a journey. Budgets live in `harness/budgets.json`.
   - `check:data` (local only): runs against Jesse's real GEDCOM from a git-ignored path and reports geocode coverage and unresolved places to git-ignored `reports/`.
5. **Privacy guard:** `.gitignore` blocks `*.ged` and `*.zip` outside `fixtures/synthetic/`; a CI script fails if a GEDCOM header appears anywhere else.
6. **CI/CD (GitHub Actions):**
   - `ci.yml` on pull requests and `main`: the ladder, artifacts, and a PR comment with a metrics table against `main`.
   - `deploy.yml` on `main`: build, deploy to GitHub Pages, then a post-deploy smoke test against production that checks `/version.json` matches the commit and runs the fixture journey.
   - `monitor.yml` daily: production smoke test plus dependency checks (tile host, gazetteer asset, Nominatim); on failure it opens or updates a GitHub issue labelled `monitor`.
   - Rollback: re-run `deploy.yml` for the last good commit.
7. **Opt-in telemetry (M7):** off by default; one consent switch with a versioned consent record; a typed, fixed event vocabulary with no free text (a unit test enforces this), so no names, places or file content can be sent; error reports carry type and stack only. Provider sits behind a small interface; recommended PostHog EU free tier with autocapture, replay and IP capture off (needs an account from Jesse, so confirm at M7). An in-app privacy page states all of this, including that map tiles and opt-in lookups contact third parties.

## Milestones (each lands as reviewed PRs with a green ladder)

- **M0 Harness and walking skeleton:** repo, rules, scaffold, debug API stub, offline test style, fixture generator, ladder, CI, privacy guard, Pages deploy of the empty shell, post-deploy smoke and daily monitor.
- **M1 GEDCOM core:** worker parser and data model (port of the session's `parse_ged.py`), date parsing, import UI, IndexedDB library, root picker.
- **M2 Geocoding:** gazetteer build, matcher, cache, place-review screen, manual pins, opt-in online lookup.
- **M3 Map and focus:** globe, place markers, focus fly-to, profile panel, navigation, search.
- **M4 Threads and journey mode.**
- **M5 Sync/update and remembered state;** geocode cache export.
- **M6 Polish:** accessibility, reduced motion, small screens, "hide living people" toggle.
- **M7 Opt-in telemetry and privacy page.**

## Reuse from this session
- `C:\Users\jesse\AppData\Local\Temp\claude\538f7a08cf676ad1\c10c2bc2-38b4-4a99-9ebc-9b18257da47f\scratchpad\scripts\parse_ged.py`: GEDCOM line grammar, `CONT`/`CONC` handling, individual and family extraction. Reference for the TypeScript parser.
- `...\scripts\root_view.py`: ahnentafel walk and F/M path labels. Reference for lineage paths, journey lines and relationship labels.
- The scratchpad is temporary, so the first implementation step copies both scripts (they contain no personal data) into `tools/reference/`.
- Local-only test data: `C:\Users\jesse\Downloads\Mireille Family Tree.ged` and `C:\Users\jesse\Downloads\Jesse Scott Family Tree.zip`. The Jesse export predates this session's Ancestry edits; re-export for a current file.

## Open items to confirm during implementation
- Licence (GPL-3.0 like Meanwhile is assumed).
- Creating a `Creative/Apps/Treehouse.md` vault note (ask first, per the vault rules).
- Repo exists (Jesse created it 12 Nov 2026): local `C:\Users\jesse\Developer\git\jessecolinscott\treehouse` (git initialised, `README.md` only), remote https://github.com/JesseScott/treehouse. Pushing, branch protection and Pages settings still need Jesse's go-ahead.
- Telemetry provider and account (M7).

## Verification
- **Per change:** `npm run verify` is green; the agent starts the preview from `.claude/launch.json`, drives it in the browser pane with `?harness=1`, and checks screenshots and `__treehouse.state()`.
- **End to end on synthetic data:** import the 30-person fixture, choose the root, run the paternal journey, and assert the camera starts near Vancouver and ends near the fixture's Scottish birthplace; toggle each thread type and assert the arc counts; reload and confirm the import, focus and camera are restored; modify the fixture, sync, and confirm the diff and that pins survive.
- **On Jesse's real data (local only):** `check:data` reports geocode coverage; Jesse walks his own line from Vancouver to Scotland in the dev build.
- **Deployed:** the post-deploy smoke passes, `/version.json` matches the commit, and the daily monitor stays green; a deliberately broken deploy on a test branch confirms the monitor opens an issue.
