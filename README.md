# treehouse

A world-map family tree viewer. Open a GEDCOM file, walk the tree person by person, and the camera flies to where
each person was born, so following a line can take you from Vancouver back to Scotland.

treehouse is a static web app with no backend. Your file is read in your browser and stored there; it is never
uploaded.

## Status

Early. Three milestones exist so far:

- **M0, the shell and test harness:** a globe that renders from a bundled offline map, a debug API for automated
  checks, synthetic test trees, and a check ladder.
- **M1, GEDCOM import:** open a `.ged` file or the `.zip` an export comes in (button or drag and drop), choose the
  home person, and keep a library of imports in the browser that you can reopen, rename and delete.
- **M2, geocoding:** every place a tree names is put on the map from a list of places bundled with the app. A review
  screen shows the places that were only placed approximately or not at all; you can set any of them by clicking the
  map or dragging its pin, or turn on an online lookup for them.

Only the place selected on the review screen is drawn on the map so far. Place markers, profiles, journeys and
threads are planned; see
[`docs/PLAN.md`](docs/PLAN.md).

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

The app itself sends nothing about your tree anywhere. Places are looked up in a list that ships with the app. The
one exception is the online lookup on the place-review screen, which is off until you turn it on: it then sends the
text of the places it could not place (for example "Barvas, Lewis, Scotland"), one at a time, to OpenStreetMap's
Nominatim service, and nothing else.

## Licence

treehouse is free software, licensed under the GNU General Public License, version 3. See [LICENSE](LICENSE).

## Credits

Offline basemap made with [Natural Earth](https://www.naturalearthdata.com/) (public domain). Place data from
[GeoNames](https://www.geonames.org/) (CC BY 4.0). Optional online lookups by
[Nominatim](https://nominatim.org/), data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors. Maps drawn with
[MapLibre GL JS](https://maplibre.org/).
