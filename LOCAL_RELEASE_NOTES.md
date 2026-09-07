# Local handoff — deployment intentionally withheld

## Completed local fixes

- Keyboard, touch, gamepad and visible WASD controls preserve independent held-key ownership. D turns the car right and moves the character camera-right. Shift modifiers are captured at press time for actions such as stock selling.
- Additional vendors, payphones, ATMs and the car-wash arch were moved clear of road lanes. Land race start rings are shallow road markers rather than tall barriers. The site audit now checks 47 reserved activity sites; all are off-road. Non-solid mission/waypoint beams are intentionally retained.
- Moving train colliders are queried dynamically; district/roadblock changes invalidate the static grid even when the collider count stays unchanged.
- Standing web launches receive a small vertical lift so they cannot immediately count as a landing. Airborne catches retain their existing vertical momentum.
- Local purchases costing more than $10,000 can use cash plus local savings. Smaller purchases retain cash-only rules. Online funds are never spent based only on a cached browser balance.
- Bank typing remains stable across frames, transactions cannot be double-clicked concurrently, and the panel pauses gameplay. Shift+K opens the bank; K retains skateboard control. Overflow deposits show a toast instead of forcibly opening the panel.
- New Game+ explicitly resets cash/savings instead of accidentally granting the new-player welcome cash. Prison-reported escapes bypass the random civilian-witness rule.

## Admin email — configuration still required

Render's free web-service tier blocks SMTP ports 25, 465 and 587. Correct SMTP passwords alone cannot fix that hosting restriction. Source: https://render.com/docs/free

The backend now supports an HTTPS delivery path without an extra SDK:

    MAIL_PROVIDER=resend
    RESEND_API_KEY=<set privately on the server>
    MAIL_FROM=<verified sender address>
    ADMIN_EMAIL=<recipient address>

Use the provider's domain verification and recipient rules. API reference: https://resend.com/docs/api-reference/emails/send-email

Alternatively set MAIL_PROVIDER=smtp on an SMTP-capable host and configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and ADMIN_EMAIL. Gmail app-password display spaces are removed; other providers' password spaces are preserved.

Use Node 24 LTS. Start the backend from arena-protocol-project/server with npm.cmd start, then open its /admin route. The static preview server cannot send admin tokens. The example .env contains no secrets; do not overwrite an existing .env or paste credentials into chat.

Mock mail and local admin/browser checks passed. No real mail was sent, no provider account created, and live inbox delivery is not claimed. After privately configuring a provider, an approved end-to-end delivery/login check is still necessary.

## Local-only verification

Run from the repository root:

    node --test test/admin-mail.test.mjs test/input.test.mjs test/wallet.test.mjs
    node test/admin-integration.mjs
    node test/run-local-suite.mjs

The suite owns a temporary loopback server and stops it afterwards. Browser tests require Edge and network access to the existing Three.js CDN. Focused additional checks:

    node test/run-local-suite.mjs final-regressions visual-review street-review

Tests, screenshots and reports remain local under ignored test/ and artifacts/. Previously tracked tests/QA helpers were removed from the Git index but retained on disk. CI still builds and syntax-checks; it no longer expects private local test files.

The latest headless desktop visual sample measured 16.9 ms median and 34.3 ms p95 frame time, 815,318 triangles and 1,660 draw calls. This is one local sample, not a guarantee of 60 FPS on phones or VR headsets. See artifacts/final-review/report.json. Detailed security findings and release gates are in artifacts/full-review/SECURITY_REVIEW.md.

## AWS EC2 — feasible, not provisioned

Assuming “AWS S2” means EC2: the Node/Express/Socket.IO backend can run on an EC2 VM. This does not move Three.js rendering off players' CPUs/GPUs. It can improve backend capacity and remove free-service sleep constraints, but VM sizing needs expected concurrent players and a load test, not just polygon counts.

Before any migration: choose a budget/region, use Node 24 LTS, configure an HTTPS reverse proxy with WebSocket support, restrict management access, preserve the managed PostgreSQL database/backups, configure mail, measure concurrency, and retain a rollback plan. Keep the app's private port off the public security group. AWS security groups control ingress and egress: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-security-groups.html

EC2 restricts outbound port 25 by default; use an HTTPS email provider or a supported SMTP submission port with suitable network rules. https://docs.aws.amazon.com/en_en/ses/latest/dg/send-email-set-up-vpc-endpoints.html

No AWS resources, billing changes, DNS changes, migration, push or deployment were performed.

## Three.js animations and WebXR

The project already uses Three.js. Better character animation can use rigged GLB/glTF assets and AnimationMixer for walking/running/turning/blended actions; asset quality, materials and lighting determine realism, not simply importing the library. https://threejs.org/docs/pages/AnimationMixer.html

WebXR is feasible as an optional VR/AR mode. It requires supported browser/device and HTTPS, an XR animation loop, controller input, a player rig, XR-compatible UI/rendering and comfort/performance work. Desktop bloom/composer rendering cannot simply be assumed to work unchanged in VR. Keep the ordinary keyboard/touch game as fallback. https://threejs.org/manual/en/webxr-basics.html

Neither a new animation asset pipeline nor WebXR was implemented in this bug-fix pass. Resolve the security release gates and test normal play before expanding into those features.

## Camera, combat and city follow-up — September 7, 2026

Local implementation only; no deployment or push by this session.

- Player locomotion/landing animations no longer modify the physics-root height. On-foot camera uses exponential smoothing, shoulder offset and a padded wall sweep. Impact shake is off by default, optional in pause settings.
- F2 switches on-foot first/third person. Hold Ctrl to aim; wheel cycles weapons while pointer-locked (X/digits retained). Right-click retains web-swinging. Touch has VIEW/AIM buttons and the existing WPN control.
- Exploration hides the centre reticle; aiming, firing and web traversal show it. First-person hides the avatar and displays placeholder hands/weapon. These are NOT production-quality art.
- Six replaceable procedural weapon silhouettes, basic recoil and muzzle flashes. Player hitscan resolves crosshair parallax and tests walls from the muzzle, including a body-to-muzzle sweep. Gang members, hunters, SWAT and train guards now use attached weapons and wall-checked muzzle shots. Other specialized combat systems still need their own animation/authority review; full reload/weapon animation clips are not implemented.
- Stadium fits within its block. Spire, stadium and central park lots are reserved before generic buildings are generated. Shop sites and hospital reserve off-road space. Full static building-sized collider audit excludes infrastructure outside the city bounds; it is not a claim that every decorative mesh or mission obstacle is off-road.
- CITY GUN SUPPLY uses the existing ammo-sale system with a storefront. Hospital has a signed entrance and $100 treatment respecting max health; healthy players are not charged. H/G minimap markers are persistent. Neither is a walk-in authored interior yet.
- Follow-up inspector fixes: third-person web attack now uses a chest-aligned, forgiving body volume so the camera reticle and Q ray agree; corner-store robbery sites are placed through the off-road site allocator so collision resolution cannot move the player outside the interaction radius.

Verification this pass: 18 Node tests; camera-combat, final-regressions, fulltest, mobiletest, newfeatures, season3test, season4test, season8btest, season9test and season10test browser suites. Reports/screenshots in ignored artifacts/camera-combat/ and artifacts/full-review/. Phone emulation is not physical-device performance certification.

## Save slots, instant replay, accessibility, perf governor — local only

Four self-contained modules, no deployment or push by this session.

- **Save slots** (`js/saveslots.js`). Three independent save files. A pointer
  (`opencity-active-slot`) picks which slot's blob is copied into the game's
  single live key (`opencity-save-v1`) at boot; every `saveGame()` mirrors the
  live key back into the active slot. Start-screen cards show money / level /
  missions / packages per slot with rename, per-slot export/import and delete.
  Switching or deleting the active slot reloads (safest way to re-seed 168
  modules). Players upgrading from the pre-slots single save keep it as slot 1.
- **Instant replay** (`js/replay.js`, key O). Passive 20-second rolling buffer
  at 30 Hz of camera + up to ~20 moving-object transforms. O freezes the game
  into a `replay` state (like the pause overlay) with a scrub bar, play/pause
  (Space), restart (R), a WASD/mouse free-fly camera, a PNG "still" via the
  existing capture path, and a full-buffer JSON export
  (`open-city-replay-v1`). It replays VISUALS only — it does not rewind the
  simulation. Live transforms are stashed on open and restored on close
  (`player.pos` is the same reference as the mesh position, so this matters).
- **Accessibility** (`js/accessibility.js`, pause menu → ♿ ACCESSIBILITY).
  Rebind 11 non-movement actions — a physical→logical remap table in
  `input.js` (`setRemap`); every game module keeps checking the same logical
  names. WASD / Shift / Ctrl / Space are fixed. Also: reduced camera motion
  (kills shake, trims speed-FOV), colour-blind minimap CSS filters
  (deuteranopia / protanopia / tritanopia / high-contrast), opt-in gentle aim
  assist (~10° cone pull, never a lock), HUD size 0.7–1.4×. All in
  `world.settings`, so autosaved.
- **Perf governor + FPS meter** (`js/perf.js`). Rolling median frame-time
  governor: when frames sustain >24 ms it staggers the pedestrian and vehicle
  close-up detail passes (`world.perf.detailTick(lane)` in the main loop) to
  1/2 then 1/3 of frames; steps back up under 15 ms. Never changes the
  graphics tier (that needs a reload). Optional on-screen FPS / frame-time /
  draw-call readout (settings: SHOW FPS METER).

Pause menu made overflow-safe (`justify-content: safe center` + padding) now
that it has a fifth button.

## Persistent damage, reactive news, NPC memory, photo bounties — local only

Four more self-contained modules, no deployment or push by this session. All
four are observer-style: they watch `world` state each frame and touch no other
system except one 4-line hook in `js/npc.js` (the flee check reads `p.mem`).

- **Persistent damage** (`js/scars.js`). Scorch/oil decals and shattered-glass
  litter that stay on the street after a fight and fade only once the player
  gets far (95 m keep radius, 140 m fade). Hard cap 90 decals, oldest recycled.
  `explodeVehicle` / `explodeRocket` in `js/main.js` call `world.scars.boom()`;
  dead vehicles leave a one-time oil scorch; ground-hit bullets occasionally
  leave a graze. Each decal owns a cloned material; all share 2 geometries.
- **Reactive news** (`js/citynews.js`). The existing `showNews()` ticker now
  reports the player's own actions: wanted-level escalation ("POLICE
  HELICOPTER scrambled", "National Guard called in"), store robberies with a
  rolling per-hour count ("3rd store hit this hour"), big heists, multi-car
  pileups, rampage/chaos thresholds, and quiet time-of-day colour when nothing
  else is happening. Rate-limited (7 s + weight), tracks a rolling in-game hour.
- **NPC memory** (`js/npcmemory.js`). Pedestrians get tagged `afraid` (saw you
  shoot / drive recklessly nearby — flees on sight for ~150 s) or `friendly`
  (near you when you shook the cops — waves, and rarely tips you off, adding a
  few seconds to the wanted decay). Memory decays and is wiped when that ped
  object respawns. `js/npc.js` gained a 4-line flee-check hook on `p.mem`.
- **Photo bounties** (`js/photobounty.js`). A camera board near spawn (marker +
  `world.photoBoardHint`) with 3 rotating targets from a 12-entry catalog
  (Spire / stadium / park / harbor boat / police chopper / vehicle fire /
  kaiju / army tank / night 3-star selfie / dawn skyline). On the photo-capture
  frame (`world.captureNext`, the existing G path) it builds the camera frustum
  and pays out if a target sphere is in shot. Daily reset; `photoDone` /
  `photoDay` persist via `photoBountySave()` in the save blob.

Verification: `node --check` all files; `node --test` 7/7; browser suites
fulltest (all PASS, 0 errors), newfeatures (18/18, 0 errors), season10test
(25/25, 0 errors); targeted tests — scar decal on `boom()`, news fires on
wanted change, `npcMemory.afraidCount` rises after shooting near a ped, photo
bounty pays $300 for a framed park shot and refills the target list.

`sw.js` cache bumped to `opencity-v5-slots-replay-a11y` (covers all 8 new
modules — the `js/` glob in the fetch handler caches them automatically).

## Cloud save — local only

Cloud save Phase 1: the three local save slots now mirror to the server so a
player can restore on another device. No deployment or push by this session.

- **Server** (`arena-protocol-project/server/`): new `save-api.js` router
  mounted at `/api/save`, and a `cloud_saves` JSONB table (`db.js`
  `initSchema`). Auth is the SAME bearer token the bank uses (`bank-api.js`
  pattern) — "cloud save" == "has a bank account". Endpoints: `PUT
  /api/save/:slot` (body `{ blob, baseRev? }`), `GET /api/save/:slot`, `GET
  /api/save` (list + summaries), `DELETE /api/save/:slot`. Every uploaded blob
  is filtered against an allow-list of the keys `saveGame()` writes and capped
  at 96 KB (under the 100 KB `express.json` limit). A stale `baseRev` → 409
  with the server's version. Whole router 503s when `DATABASE_URL` is unset.
- **Client** (`js/cloudsave.js`, `js/bankapi.js` gains `apiCall()`,
  `js/saveslots.js` gains blob/cloud-rev helpers): pushes the active slot —
  debounced ~12 s off `saveGame()`, a `setInterval` backstop, and a `pagehide`
  / `visibilitychange` flush so a closing tab still saves — plus an immediate
  `world.cloud.push()`. `world.cloud` also exposes `pull(slot)`,
  `resolve(slot, choice)`, `conflict()`, `list()`, `status(slot)`. Pull
  overwrites the local slot and reloads if it's active. On a 409 the local
  save is kept, a toast fires, and the pause menu prompts keep-local vs
  take-server (`maybePromptCloudConflict` in `main.js`).
- **Start screen** (`js/saveslots.js` `buildSlotPicker`): when signed in, each
  slot card shows the cloud copy's cash/level/date and a ☁↓ pull button; the
  header shows "☁ SYNCED".
- Not signed in / DB off / offline → cloud is silently unavailable, game plays
  from localStorage exactly as before.

**Testing** (kept local, under ignored `test/`):
- `test/cloudsave.test.mjs` — 6 pure-logic tests (blob sanitiser drops unknown
  and `__proto__` keys, `summary()` maths, size cap). `node --test`.
- `test/cloudsave-integration.mjs` — boots the server against the **real
  `DATABASE_URL`** from `server/.env`, registers a throwaway bank account,
  exercises auth gates / sanitise / rev+409 conflict / summary / 413 size cap /
  delete, then **deletes the test account and its rows**. Skips (exit 0) with
  no `DATABASE_URL`. 13 assertions, all pass.
- Browser end-to-end against the real DB (throwaway account, cleaned up):
  force push → server has the sanitised blob; `pagehide` flush pushes the
  pending save; pull overwrites local; out-of-band server change → client push
  → `conflict` status + `world.cloud.conflict()` populated; `resolve('local')`
  force-pushes and clears the conflict; list + delete. All pass.
- Regression: `node --test` 24/24; browser `fulltest` all PASS 0 errors,
  `newfeatures` 18/18, `admin-integration` all PASS (the `/api/save` mount
  didn't disturb the admin routes).

**Server env for the live site:** set `DATABASE_URL` on Render (same value as
`server/.env`). Nothing else — no keys, no new services. Without it the cloud
routes just 503 and the game is unchanged.

Verification: `node --check` on all touched files; `node --test
test/input.test.mjs test/wallet.test.mjs` (7/7); browser suites fulltest
(all PASS, 0 runtime errors), newfeatures (18/18, 0 errors), keytest
(movement directions correct); targeted replay open/scrub/close + live-pos
restore, accessibility panel open + rebind + palette filter, perf governor
detail-shed. The pre-existing `/health` 404 (static server has no health
route) and the `main`-branch `web attack (Q)` note are unrelated.

Blender handoff: preserve +Z forward and metres for world assets; export GLB with applied scale, hand/weapon sockets and named animation clips. Start with one rigged character, one vehicle and one weapon pack; inspect asset rights and runtime budget before expanding. Asset loading/animation blending and high-quality interiors remain the next asset-integration stage. Existing production security/email release gates above still apply.
