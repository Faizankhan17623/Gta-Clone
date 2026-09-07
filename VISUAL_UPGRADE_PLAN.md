# Open City visual upgrade: plan and status

## Goal

Give the existing Three.js game more convincing buildings, roads, vehicles and
characters while preserving driving, swinging and missions. Work is in
`github-deploy/`; Arena Protocol is a separate project.

The delivered art direction is semi-realistic procedural 3D. This is not a claim
that every legacy asset has become photorealistic.

## Realism pass (branch `visual-realism`) - phases 1-6 implemented

A second pass on the `visual-realism` branch (not yet merged to `main`) adds a
real lighting/rendering foundation while keeping the game a small, offline-safe
PWA that holds 60 FPS on both a desktop and a phone-sized viewport. No binary
texture or model files were added - every new surface and shape is generated in
code.

- **Phase 1 - foundation** (`js/graphics.js`). Low/medium/high quality tiers,
  auto-detected from GPU string + core count + touch, with the legacy `lowGfx`
  toggle mapping to `low`. A procedural sky bake replaces the indoor studio
  environment probe so car paint, glass and metal reflect the real sky, and it
  re-bakes as the sun moves. A single wide, camera-facing, texel-snapped sun
  shadow (110/200/300 m per tier) replaces the old 180 m player-centred box, so
  shadows now reach across the whole visible street. CSM was built and rejected
  (tripled draw calls on the streamed city).
- **Phase 2 - post-processing.** Per-tier composer: SMAA (medium+), bloom
  (medium+), a code-generated 16^3 film colour-grade LUT (high). GTAO contact
  ambient occlusion exists but is opt-in only (settings: AMBIENT OCCLUSION),
  because it renders a full extra normal pass over the city and roughly halves
  the frame rate on a mid GPU.
- **Phase 3 - materials.** Clearcoat automotive paint (`MeshPhysicalMaterial`)
  on sedans, tanks and monster trucks; dark reflective windscreen glass; wet
  roads - `world.roadWet` chases rain up fast and dries over ~40 s, dropping
  road roughness ~70% and tripling reflections while wet. Garage respray and
  damage-darkening still work.
- **Phase 4 - PBR surfaces** (`js/textures.js`). One tileable value-noise
  height field produces a coherent colour + Sobel normal + roughness set.
  Applied to the road (real asphalt aggregate grain that catches the low sun
  and wet reflections) and to district pavement (concrete grain). Zero
  downloads.
- **Phase 5 - character model** (`js/characterModel.js`). The player and
  pedestrian rig rebuilt with capsule limbs (rounded joints), a lathed torso
  (narrow waist, broader chest), a jaw, modelled hands and rounded shoes. The
  rig contract (limb/joint groups, first three root children) is unchanged, so
  animation, wardrobe suits and character swaps are untouched.
- **Phase 6 - performance + review.** GTAO moved to opt-in after it was seen
  halving desktop frame rate. Final headless samples: desktop high tier
  16.7 ms median / ~17-33 ms p95; phone-sized low tier 16.7 ms median /
  ~17 ms p95. Full gameplay smoke suite passes (the one pre-existing
  `web attack (Q)` failure is present on `main` and unrelated). No runtime
  errors, no failed asset requests, all collision/model contracts pass.

Not done: merge to `main` and deploy (a deliberately separate user-approved
step); real GLB hero assets (rejected for this pass - would add repo weight and
a mobile perf cliff for little gain over the improved procedural geometry);
Mixamo skeletal animation.

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
