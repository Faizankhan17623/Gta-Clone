# Open City local visual upgrade

## What changed

Open City already used Three.js 3D. This pass adds original procedural models
with a semi-realistic appearance, not photorealistic imported assets.

- City-wide brick, stone and office facade kit: windows, sills, shallow residential
  rails, storefronts, awnings, signs, parapets and rooftop equipment.
- Nearby two-by-two-block neighborhoods stream in; distant buildings keep simpler
  facades. Residency is capped at four neighborhoods normally, two on low graphics.
  Unloading restores original materials and disposes detail resources.
- Asphalt, lane arrows, center/edge lines and crossings across the road grid.
  Central dividers are painted hatching, not physical barriers or new traffic AI.
- Central paving, curbs, benches, bins, drains, street signs and eight trees.
  Solid street furniture stays out of traffic lanes. Other neighborhoods do not
  add furniture over existing mission sites.
- Detailed ordinary civilian, traffic, parked and police sedans: shaped body and
  cabin, glazing, trim, lights, grille and wheel rims. Resprays affect all painted
  panels, braking brightens tail lights, and distant trim is hidden.
- Human-proportioned characters with knees/elbows integrated into walk, idle,
  landing and web poses. Wardrobe and existing limb handles remain compatible.
- Instanced detail geometry, distance-based detail, two base-building material
  draw groups instead of six, and refreshed service-worker asset caching.

Tanks, monster trucks, bikes, aircraft, landmarks and arcade mission markers keep
their existing models. Advanced skeletal animation, vehicle interiors, physical
road diversions and photorealistic art remain future work.

## Local server

From `github-deploy`:

```powershell
npm run dev:local
```

Open http://localhost:8080/. If that port is occupied:

```powershell
$env:PORT='8082'
npm run dev:local
```

The server binds only to this computer; stop it with Ctrl+C. The current review
session uses http://localhost:8082/. An existing process on 8080 was not stopped.
Nothing has been pushed or deployed by this visual-upgrade pass.

Three.js still loads from the existing CDN. New geometry/textures need no external
asset downloads. See `ASSET_SOURCES.md`.

## Run checks

Keep the local server running; match PORT in the test terminal:

```powershell
$env:PORT='8082'
node --test test/input.test.mjs
npm run test:gameplay
npm run test:models
npm run check:district -- local-review
npm run check:district -- mobile-review --mobile
```

Browser checks require Edge, playwright-core and access to the Three.js CDN.
Visual/model browsers close after testing. Screenshots and JSON reports are in
ignored `artifacts/<label>/`. Touch emulation is not a real-phone benchmark.

## Verification, September 6, 2026

- Input regression and JavaScript syntax checks passed.
- Full gameplay suite passed: movement, weapons, web attach/swing/release/landing,
  chained traversal, driving/steering, helicopters, police, web combat, robbery,
  gang territory, motorbike and army spawning. Zero runtime JavaScript errors.
- The landing test now waits for grounded state, bounded to eight seconds, instead
  of assuming a fixed two-second flight. Logged failures cause a nonzero exit.
- Model checks passed for human scale, shared wardrobe palette, knee animation
  and reset, isolated full-panel resprays, wheels, police bar and brake lights.
- Two city tours passed disposal, facade restoration, stable window registration
  and nonduplicated street-collider checks. Low-graphics residency stayed at two
  at a four-neighborhood boundary.
- Desktop and touch-view integration checks passed; day, dusk, night, street and
  sedan views were captured. No failed asset requests or runtime errors.

Headless median frame times have varied around 33-50 ms; 60 FPS has not been
established. Post-optimization measurements are recorded in
`artifacts/optimized-desktop/report.json` and
`artifacts/optimized-mobile/report.json`.
Manual playtesting, physical-device profiling and deployment approval remain.
