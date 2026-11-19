# treehouse

A world-map family tree viewer. Open a GEDCOM file, walk the tree person by person, and the camera flies to where
each person was born, so following a line can take you from Vancouver back to Scotland.

treehouse is a static web app with no backend. Your file is read in your browser and stored there; it is never
uploaded.

## Status

Early. Five milestones exist so far:

- **M0, the shell and test harness:** a globe that renders from a bundled offline map, a debug API for automated
  checks, synthetic test trees, and a check ladder.
- **M1, GEDCOM import:** open a `.ged` file or the `.zip` an export comes in (button or drag and drop), choose the
  home person, and keep a library of imports in the browser that you can reopen, rename and delete.
- **M2, geocoding:** every place a tree names is put on the map from a list of places bundled with the app. A review
  screen shows the places that were only placed approximately or not at all; you can set any of them by clicking the
  map or dragging its pin, or turn on an online lookup for them.

- **M3, map and focus:** every place has a marker, sized by how many people have events there and grouped when
  zoomed out; click one to see who was there. Opening a tree shows the home person; choosing anyone (by search, a
  relative's name, the breadcrumb, the small pedigree chart or the arrow keys) flies the camera to where they were
  born and opens their profile: how they are related to the home person, a timeline with clickable places, and their
  family. Someone with no birthplace on the map is shown at their baptism, home, marriage or death place, or a close
  relative's, and marked approximate. The map can be flat or a globe.
- **M4, threads and journeys:** lines on the map join relatives' places: the line from the home person to whoever
  is shown, their close family, every ancestor, or one person's moves through life, each switched on or off. A
  journey plays the father's line, the mother's line or the line to any ancestor a generation at a time, with a
  scrubber and a speed control; with reduced motion it cuts between places instead of flying.

Syncing an import and remembering where you were are planned; see [`docs/PLAN.md`](docs/PLAN.md).

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
