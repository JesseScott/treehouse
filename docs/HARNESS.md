# The treehouse harness

How an agent (or a person) validates a change, measures it, and reads the monitors. The rules that go with it are in
`AGENTS.md`.

## The short version

```bash
npm run verify        # everything; about half a minute on the empty shell
```

Then read `reports/verify.md`. If it says PASSED and you looked at the app yourself, the change is validated.

## The check ladder

Each rung is slower and catches different things. Run the lowest rung that covers what you changed while you work,
and the whole ladder before you commit.

| Script                  | What it runs                                                         | What it catches                                                |
| ----------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| `npm run check:privacy` | `harness/privacy-guard.mjs`                                          | Family data about to be committed                              |
| `npm run check:fast`    | privacy guard, lockfile check, `tsc`, ESLint, Prettier check, Vitest | Type errors, logic bugs, fixture drift                         |
| `npm run check:e2e`     | build, then Playwright against `vite preview`                        | What a user would see: rendering, camera, flags, accessibility |
| `npm run check:perf`    | build, then bundle sizes and Lighthouse                              | Size and speed regressions against `harness/budgets.json`      |
| `npm run verify`        | all of the above plus a local smoke test, once each                  | Everything; writes the report                                  |

`npm run check:data -- <path to a .ged or .zip>` is local only and not part of `verify`. It runs the importer over a
real export on this machine and prints aggregate numbers: counts, warnings by code, date and place coverage, and
the masked shape of any date it could not get a year from (letters become `a`, digits `9`). It never prints or
stores a name, place or date; the summary goes to git-ignored `reports/data.json`. It also matches the export's
places against the bundled gazetteer (never online) and reports how many were placed exactly, approximately (and at
what level: place, area, region or country) or not at all, by place and by event. The places that were not placed
exactly are written, as text, to git-ignored `reports/data-places.json` for Jesse to read; that file holds real
place names, so an agent does not print it or copy from it.

First-time setup: `npm ci`, then `npx playwright install chromium`.

## Reading the report

`npm run verify` clears and rewrites `reports/` (git-ignored):

| Path                                            | What it is                                                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reports/verify.md`                             | Summary: each step, test counts, every metric against its budget                                                                                                    |
| `reports/verify.json`                           | The same, machine-readable. `ok` is the verdict; `steps[]` has status and seconds; `metrics[]` has `name`, `value`, `budget`, `direction` (`max` or `min`) and `ok` |
| `reports/logs/<step>.log`                       | Full output of each step. Read this first when a step fails                                                                                                         |
| `reports/e2e/screenshots/`                      | Screenshots the tests take on purpose (`shell.png`, `land.png`, `ocean.png`)                                                                                        |
| `reports/e2e/artifacts/`                        | Per-test Playwright trace and final screenshot. Open a trace with `npx playwright show-trace <trace.zip>`                                                           |
| `reports/e2e/html/`                             | Playwright's HTML report                                                                                                                                            |
| `reports/e2e/results.json`, `reports/unit.json` | Raw test results                                                                                                                                                    |
| `reports/perf.json`, `reports/lighthouse.html`  | Metrics, and the full Lighthouse report                                                                                                                             |
| `reports/smoke.json`                            | The smoke test's checks                                                                                                                                             |

A failed build skips the rungs that need one; every other step still runs, so one run shows everything that is wrong.

## The debug API: `window.__treehouse`

The app exposes a small API so tests and agents can assert what the app is doing without comparing pixels. It is on
in the dev server, and in a production build only when the URL has `?harness=1`.

| Call                                          | Returns                                                                    |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `__treehouse.state()`                         | A plain-JSON snapshot (below)                                              |
| `await __treehouse.whenIdle()`                | Resolves when the map has loaded, stopped moving and rendered              |
| `__treehouse.place(text)`                     | Where a place string of the open tree is (below), or `null`                |
| `await __treehouse.focus(id)`                 | Focus a person. A stub until M3: always `{ ok: false, reason: 'no-tree' }` |
| `await __treehouse.flyTo({ lng, lat, zoom })` | Move the camera the way a focus will, then wait for idle                   |

`state()` returns:

```jsonc
{
  "app": { "name": "treehouse", "version": "0.1.0", "commit": "<sha the build came from>" },
  "flags": { "harness": true, "motion": false },
  "map": {
    "loaded": true,
    "moving": false,
    "style": "offline",
    "projection": "globe",
    "center": { "lng": -123.12, "lat": 49.28 },
    "zoom": 5,
    "bearing": 0,
    "pitch": 0,
  },
  "screen": "tree", // "library", "root-picker", "tree" or "places"
  "library": {
    "loaded": true, // false until IndexedDB has been read
    "imports": [
      {
        "id": "<uuid>",
        "name": "treehouse-30",
        "people": 30,
        "families": 11,
        "rootId": "@I420000000001@",
      },
    ],
  },
  "tree": {
    // the open import; null on the library screen
    "importId": "<uuid>",
    "name": "treehouse-30",
    "people": 30,
    "families": 11,
    "warnings": 0, // lines and links in the file that could not be read
    "rootId": "@I420000000001@", // the home person; null until one is chosen
  },
  "import": {
    "busy": false,
    "attempts": 1, // imports started in this page load
    "error": null, // a fixed code such as "not-gedcom", never file content
    "lastMs": 12, // worker time to read and parse the last import
    "alreadyImported": false, // the file was already in the library and was opened instead
  },
  "focusedPersonId": null, // until M3
  "threads": { "lineage": 0, "family": 0, "ancestors": 0, "migration": 0 }, // arcs drawn; M4
  "geocode": {
    // the open tree's distinct places; resolved + approximate + unresolved = places
    "busy": false, // true while they are being matched against the bundled gazetteer
    "error": null, // "gazetteer-unavailable" when the place data could not be loaded
    "places": 28,
    "resolved": 25,
    "approximate": 3,
    "unresolved": 0,
    "pinned": 0, // resolved places that are pins the user set
    "online": 0, // resolved places that came from an online lookup
  },
  "placeReview": { "selected": false, "pinning": false }, // pinning: the next map click sets the place
  "onlineLookup": {
    "enabled": false, // the user's opt-in; nothing is sent without it
    "running": false,
    "done": 0,
    "total": 0,
    "error": null, // "online-unavailable" when the lookup service could not be reached
  },
}
```

`state()` never contains a place string, so it stays safe to paste. To ask about one place, call
`__treehouse.place('Barvas, Lewis, Ross and Cromarty, Scotland')`: it returns `{ status: 'unresolved' }`, or
`{ status: 'resolved' | 'approximate', lng, lat, level, source }` where `level` is `place`, `area`, `region` or
`country` and `source` is `gazetteer`, `online` or `manual`; `null` when the open tree does not name that place.
Spelling differences in case, accents and spacing do not matter.

The contract is `src/harness/types.ts`. When a feature adds something worth asserting, add it there, to
`debugApi.ts`, and to an e2e test, in the same change.

URL flags:

- `?harness=1`: expose the debug API in a production build.
- `?motion=off`: camera moves are instant. Use it in tests unless the test is about animation. The app also treats
  the reduced-motion system setting as motion off.

`whenIdle()` waits for the map, for the library to have been read from IndexedDB, and for any import, geocoding or
online lookup to finish.
In a test, wait for `state().import.attempts` to go up after choosing a file, then call `whenIdle()`; see
`importFile` in `e2e/helpers.ts`.

Stable `data-testid`s so far:

- Shell: `app-shell` (also carries `data-map-loaded` and `data-screen`), `app-header`, `map`, `drop-overlay`.
- Library: `library-panel`, `empty-state`, `file-input`, `open-file-button`, `import-status`, `import-error` (carries
  `data-error-code`), `library-list`, `library-item` (carries `data-import-id`), `library-open`, `rename-button`,
  `rename-input`, `rename-save`, `delete-button`, `delete-confirm`.
- Home-person picker: `root-picker`, `root-search`, `root-result-count`, `root-options`, `root-option` (carries
  `data-person-id`), `root-cancel`, `back-to-library`.
- Tree: `tree-panel`, `tree-name`, `tree-counts`, `home-person` (carries `data-person-id`), `tree-warnings`,
  `already-imported`, `change-root`, `back-to-library`, `geocode-summary`, `review-places`.
- Places: `places-panel`, `places-summary`, `geocode-error`, `filter-attention`, `filter-all`, `places-empty`,
  `place-list`, `place-option` (carries `data-status`), `place-actions`, `pin-place`, `reset-place`, `pin-hint`,
  `online-opt-in`, `online-start`, `online-stop`, `online-status`, `online-error`, `back-to-tree`, and `place-pin`
  (the marker on the map).

End-to-end tests never reach the real lookup service: `e2e/places.spec.ts` answers requests to Nominatim itself with
`page.route`, and asserts that nothing is requested until the user opts in. Keep it that way.

To import a fixture by hand in the browser pane (the dev server serves the repository's files):

```js
const blob = await fetch('/fixtures/synthetic/treehouse-30.ged').then((r) => r.blob());
const transfer = new DataTransfer();
transfer.items.add(new File([blob], 'treehouse-30.ged'));
const input = document.querySelector('[data-testid=file-input]');
input.files = transfer.files;
input.dispatchEvent(new Event('change', { bubbles: true }));
```

## Checking a change in the browser pane

1. Start `dev` (or `preview`, after `npm run build`) from `.claude/launch.json`.
2. Open `/?harness=1&motion=off` (the dev server has the API on regardless).
3. Run, for example: `await __treehouse.whenIdle(); await __treehouse.flyTo({ lng: -6.39, lat: 58.21, zoom: 6 });
__treehouse.state()` and check the camera is where you expect.
4. Take a screenshot and read the console for errors.

The browser pane has to be visible. A hidden pane runs the page in the background, where animation frames stop, so
the map never finishes loading and `whenIdle()` never resolves. If `state().map.loaded` stays `false`, show the pane
and reload. (Playwright is not affected.)

The offline basemap is Natural Earth at 1:110m, which is coarse: small islands, the Outer Hebrides among them, are
not drawn. Assert positions through `state().map.center`, not by looking for the island.

## Fixtures

`fixtures/synthetic/` holds fictional GEDCOM 5.5.1 files of 30, 500 and 5,000 people, written by
`tools/fixtures/generate.mjs` (`npm run fixtures`). They are deterministic, and a unit test fails if the committed
files differ from what the generator writes.

Every file follows one paternal line from Vancouver through Ontario and Quebec to the Isle of Lewis, and copies the
awkward things real exports contain: a byte-order mark and CRLF, `CONT`/`CONC` notes, a person with two parent
families, a duplicate record, a detached branch, a trailing space in a surname, nicknames in quotes, alternate names
in parentheses, Gaelic spellings, dates like `Abt. 1842`, `After 1870`, `Jul 1813` and the ambiguous `05 11 1986`,
lowercase places, street addresses and croft numbers inside places, people with no places, and a Stornoway in Quebec
as well as the one on Lewis.

`fixtures/synthetic/manifest.json` gives, per file, the root id, the paternal line with approximate coordinates for
each birthplace (use a tolerance), and the ids of the people carrying each structural quirk. Its top-level `places`
lists every place the fixtures use with approximate coordinates; `tests/geocode-fixtures.test.ts` checks that the
geocoder puts every fixture place within 15 km of them. Later milestones should assert against the manifest rather
than hard-coding ids.

## The gazetteer

`public/gazetteer/` is the bundled place data, built from GeoNames by `tools/gazetteer/build.mjs`
(`npm run gazetteer`) and committed, like the basemap. It is not part of the page load: `index.json` (countries and
first-level regions) and one `<country code>.txt` per country a tree names are fetched by a worker when a tree is
opened, plus `world.txt` (towns of 15,000 or more) when a place names no country. Every country has its places of
500 people or more; the countries in `DETAIL` in the build script (Canada, the United Kingdom, Ireland) also have
every village and their counties, parishes and islands. Adding a country to `DETAIL` is the way to improve coverage
for it; rebuild and commit the result on its own. Downloads are cached in git-ignored `tools/gazetteer/.cache/`.

Unit tests for the matcher's rules use a tiny made-up gazetteer (`src/geocode/geocode.test.ts`); tests of the real
data live in `tests/geocode-*.test.ts` and read `public/gazetteer/` from disk.

## Budgets

`harness/budgets.json` holds the ceilings (bundle gzip sizes, gazetteer sizes, largest contentful paint, total
blocking time, layout shift) and floors (Lighthouse scores). The gazetteer is counted apart from the bundle, since
it is fetched one country at a time after a tree is opened: its index, its largest single file and its total size
each have a ceiling. They were set from the M0 shell with a little headroom: MapLibre and its
worker are most of the JavaScript. If a change needs more room, raise the budget on purpose in its own commit and
say why.

Lighthouse runs in software-rendered headless Chromium, and a single run is noisy: the same build has measured 280 ms
and 1,474 ms of total blocking time back to back on the GitHub runner. So `check:perf` runs Lighthouse three times
and judges each metric by its median. `reports/perf.json` keeps every run's value in `samples`, the step log prints
them, and `reports/lighthouse.html` is the run with the median performance score. Set `LIGHTHOUSE_RUNS=1` for a quick
local look. If the median still misses narrowly on a slow runner, look at the samples before assuming a regression.

The timing budgets have to hold on the GitHub runner, which is much slower at drawing the globe in software than a
laptop with a GPU. On the first CI run of the M0 shell, total blocking time was 976 ms on the runner against 54 to
195 ms locally, and the performance score was 0.78 against 0.90 to 0.97. The total blocking time ceiling is
therefore 1,500 ms: it is sized for the runner, so a local run sits far below it.

## CI, deploys and the monitor

The workflow files are in `.github/workflows/`. The site is https://jessescott.github.io/treehouse/. CI and Deploy
have run green on `main`. Two paths have not been exercised yet: the pull request metrics comment, and the monitor
(its issue is only opened when production fails).

- **`ci.yml` (Verify)**: on pull requests and on `main`. Runs `npm run verify`, uploads `reports/` as the
  `verify-reports` artifact, and on pull requests posts (and keeps updating) one comment with the metrics table
  compared against the latest green run on `main`.
- **`deploy.yml` (Deploy)**: on `main`, or by hand for any ref. Builds, publishes `dist/` to GitHub Pages, then runs
  `npm run smoke -- --url <site> --expect-commit <sha>`, which fails unless the live `/version.json` names the commit
  that was just deployed and the live app boots, loads its map and moves its camera.
- **`monitor.yml` (Monitor)**: daily. Runs the same smoke test against production. On failure it opens an issue
  labelled `monitor`, or adds a comment to the open one; when the site recovers it comments and closes it.

How to read them once they are live:

```bash
gh run list --workflow ci.yml --limit 5              # recent verify runs
gh run download <run-id> -n verify-reports           # the reports/ folder of a run
gh run list --workflow deploy.yml --limit 5          # deploys and their smoke tests
gh issue list --label monitor --state open           # is production currently failing?
curl -s https://jessescott.github.io/treehouse/version.json   # which commit is live
npm run smoke -- --url https://jessescott.github.io/treehouse/  # test production from here
```

Rollback: run **Deploy** by hand (`gh workflow run deploy.yml -f ref=<last good sha>`). The smoke test then expects
that commit.

Dependency checks in the monitor (tile host, gazetteer asset, Nominatim) are added in the milestones that introduce
those dependencies; the M0 shell has none.
