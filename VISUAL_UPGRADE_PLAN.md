# Open City visual upgrade: plan and status

## Goal

Give the existing Three.js game more convincing buildings, roads, vehicles and
characters while preserving driving, swinging and missions. Work is in
`github-deploy/`; Arena Protocol is a separate project.

The delivered art direction is semi-realistic procedural 3D. This is not a claim
that every legacy asset has become photorealistic.

## 1. Baseline and repeatable local testing - implemented

Local-only server, seeded building layout, camera-based screenshot checks,
renderer statistics and desktop/touch-viewport review. Baseline comparisons are
approximate because traffic, events and headless frame pacing vary.

## 2. Asset foundations - implemented

Building/lot metadata, explicit collision checks and reusable modules:
`district.js`, `vehicleModel.js`, `characterModel.js`.
Original geometry and canvas textures require no new third-party asset license.
GLB loading is unnecessary for this pass; add a loader and attribution when
imported models are introduced.

## 3. First playable district - implemented and checked

Sixteen central buildings with detailed windows, storefronts, awnings, roof
equipment and shallow residential rails; paving, curbs, benches, bins, signs,
drains and trees. Street-prop colliders stay clear of roads. Roof and building
collision checks pass. Road surfacing, markings and crossings extend city-wide;
central dividers are painted and preserve the existing traffic paths.

## 4. Vehicle and character integration - implemented and checked

Ordinary sedans now use shaped bodies/cabins, trim, rims and lights, including
traffic and police variants. Respray, wheels, braking and police bar tests pass.
Human-proportioned characters have elbows and knees, wardrobe-compatible
materials and procedural idle/walk/landing/web poses. Gameplay smoke tests pass.
Special vehicles and advanced skeletal animation remain separate future work.

## 5. Lighting and performance - integrated, further profiling needed

Materials use the existing environment and day/night lighting; day, dusk and
night captures have been inspected. Repeated detail is instanced, car/character
fine detail is distance-limited, and base-building faces use two material groups
instead of six. City details stream with a four-neighborhood cap, two on low
graphics; cleanup and repeat-tour tests pass.

Post-optimization headless samples: desktop median 33.4 ms / p95 50 ms,
touch viewport median 50.2 ms / p95 66.9 ms. These are short local samples, not
certified device benchmarks. A sustained 60 FPS desktop or 30 FPS phone target
has not been demonstrated. Continue profiling on actual target hardware.

## 6. Expansion and handoff - city kit expanded; deployment pending

The kit now streams across the full grid with old-town brick, central mixed
facades, northern residential and eastern stone/warehouse styling.
Additional street furniture is restricted to the central district to avoid
unreviewed collisions with existing mission locations.

Remaining art scope: bespoke landmarks, park assets, tanks/monster trucks,
bikes, aircraft, vehicle interiors and arcade mission markers. Physical road
diversions need a separately tested traffic-routing change. These are not
silently claimed complete by the current building/car/character pass.

Local tests and screenshots are available; see `LOCAL_DEVELOPMENT.md` for commands
and results. Publishing remains a later user-approved step. No push or deployment
was performed for this pass.

## Acceptance record

Passed: input regression, module syntax, full gameplay smoke suite, model
contracts, building/roof collision, road clearance, desktop/touch visual checks,
two resource-cleanup tours and low-graphics residency cap. No runtime errors or
failed asset requests in the visual checks.

Still required before a release-quality realism claim: user visual review,
longer manual play sessions, physical-device performance testing, remaining
legacy-art replacement and deployment/cache verification on the hosted build.
