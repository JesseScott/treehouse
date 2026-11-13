# treehouse

A world-map family tree viewer. Open a GEDCOM file, walk the tree person by person, and the camera flies to where
each person was born, so following a line can take you from Vancouver back to Scotland.

treehouse is a static web app with no backend. Your file is read in your browser and stored there; it is never
uploaded.

## Status

Early. What exists today is the **empty shell and the test harness** (milestone M0): a globe that renders from a
bundled offline map, a debug API for automated checks, synthetic test trees, and a check ladder. Importing a GEDCOM,
geocoding places, profiles, journeys and threads are planned; see [`docs/PLAN.md`](docs/PLAN.md).

## Develop

Requires Node 22 or newer.

```bash
npm ci
npx playwright install chromium   # once, for the browser checks
npm run dev                       # http://localhost:5173
npm run verify                    # the whole check ladder; report in reports/verify.md
```

- [`AGENTS.md`](AGENTS.md): architecture, commands, definition of done, privacy and git rules.
- [`docs/HARNESS.md`](docs/HARNESS.md): how to validate a change, the debug API, fixtures, budgets, CI and monitoring.

## Privacy

Real family data never goes into this repository. The only GEDCOM files here are generated and fictional
(`fixtures/synthetic/`), and a guard in the check ladder fails if anything else appears.

## Licence

treehouse is free software, licensed under the GNU General Public License, version 3. See [LICENSE](LICENSE).

## Credits

Offline basemap made with [Natural Earth](https://www.naturalearthdata.com/) (public domain). Maps drawn with
[MapLibre GL JS](https://maplibre.org/).
