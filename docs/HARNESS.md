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

| Script                  | What it runs                                         | What it catches                                                |
| ----------------------- | ---------------------------------------------------- | -------------------------------------------------------------- |
| `npm run check:privacy` | `harness/privacy-guard.mjs`                          | Family data about to be committed                              |
| `npm run check:fast`    | privacy guard, `tsc`, ESLint, Prettier check, Vitest | Type errors, logic bugs, fixture drift                         |
| `npm run check:e2e`     | build, then Playwright against `vite preview`        | What a user would see: rendering, camera, flags, accessibility |
| `npm run check:perf`    | build, then bundle sizes and Lighthouse              | Size and speed regressions against `harness/budgets.json`      |
| `npm run verify`        | all of the above plus a local smoke test, once each  | Everything; writes the report                                  |

`check:data` (geocode coverage on Jesse's real export, local only) arrives with geocoding in M2.

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
  "tree": null, // the open import; null until M1
  "focusedPersonId": null, // until M3
  "threads": { "lineage": 0, "family": 0, "ancestors": 0, "migration": 0 }, // arcs drawn; M4
  "geocode": { "places": 0, "resolved": 0, "approximate": 0, "unresolved": 0 }, // coverage; M2
}
```

The contract is `src/harness/types.ts`. When a feature adds something worth asserting, add it there, to
`debugApi.ts`, and to an e2e test, in the same change.

URL flags:

- `?harness=1`: expose the debug API in a production build.
- `?motion=off`: camera moves are instant. Use it in tests unless the test is about animation. The app also treats
  the reduced-motion system setting as motion off.

Stable `data-testid`s so far: `app-shell` (also carries `data-map-loaded`), `app-header`, `map`, `empty-state`.

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
each birthplace (use a tolerance), and the ids of the people carrying each structural quirk. Later milestones should
assert against the manifest rather than hard-coding ids.

## Budgets

`harness/budgets.json` holds the ceilings (bundle gzip sizes, largest contentful paint, total blocking time, layout
shift) and floors (Lighthouse scores). They were set from the M0 shell with a little headroom: MapLibre and its
worker are most of the JavaScript. If a change needs more room, raise the budget on purpose in its own commit and
say why. Lighthouse runs in software-rendered headless Chromium, so its timings vary between machines; treat a
narrow miss on a slow runner as a reason to look, not as proof of a regression.

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
