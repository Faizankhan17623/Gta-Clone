# OPEN CITY — implementation plans for the big features

These are the six large items that don't fit in one session. Each is broken
into phases that ship and are testable on their own, with the files touched,
the risks, and the point where you'd stop if the payoff isn't there.

Ground rules that apply to all of them, from the existing project:

- No build step. Plain ES modules, Three.js r170 from a CDN import map.
- No binary assets in the repo unless a plan explicitly adds an asset pipeline
  (only #2 does). Everything else stays procedural.
- One file per system in `js/`, imported and `init*/update*`-wired in
  `js/main.js`. New systems follow that contract.
- `world` is the shared bus. Save state goes through `saveGame()` in
  `js/main.js` and rides `localStorage` (now via `js/saveslots.js`).
- Every phase ends with: `node --check` on touched files, the Node unit tests,
  and the relevant browser smoke suite in `test/` (run headless).

Priority order by value-to-effort: **#1 co-op → #4 save/cloud → #2 animation
→ #6 economy → #3 mission editor → #5 interiors → #7 VR**.

---

## 1. Co-op multiplayer for OPEN CITY

**Goal:** 2–4 players share one city instance — see each other, shared wanted
level, revive a downed friend, and eventually run co-op heists. Free-roam
first; PvP is explicitly out of scope.

**What already exists to reuse** (`arena-protocol-project/`):

- `server/server.js` — Socket.IO server, 20 Hz snapshot tick (`TICK_HZ`),
  `join-room` with codes, `identify`, `chat`, `emote`, reconnect, a matchmaking
  queue, an admin panel. Runs on the same Render service as the game.
- `game3d/src/remotePlayers.js` — client-side entity interpolation with a
  100 ms render delay and a 1 s history buffer. Drop-in reusable.
- `game3d/src/netHud.js` — connection state / ping HUD.

### Phase 1 — ghost players (position sync only) — ~3–4 days

The whole simulation stays local and single-player. Other players are
non-colliding ghosts.

- **New `js/net.js`.** Wraps a Socket.IO client (`https://cdn.socket.io/…`,
  add to the import map or load as a UMD script). Exposes:
  `connectCoop(code)`, `disconnectCoop()`, `netSendState(player, dt)`,
  `netUpdate(dt)`, `world.net = { connected, peers, code }`.
- **Server:** add a `city` namespace or a `mode: 'coop'` room type. Reuse
  `join-room`. New snapshot payload: `{ id, x, y, z, ry, anim, veh }` where
  `anim` is a small enum (idle/walk/run/swing/fall/drive) and `veh` is a
  vehicle-kind string or null. Server just fans out; no authority yet.
- **Client send:** in `js/main.js` update loop, after the player move, call
  `netSendState`. Throttle to ~15 Hz. Send position, `player.heading`, a
  derived anim enum, and `player.inCar?.kind ?? null`.
- **Client receive:** adapt `remotePlayers.js` → `js/netghosts.js`. Build a
  ghost from `js/characters.js` `createCharacter()` so wardrobe colours work.
  For a ghost "in a vehicle", spawn a lightweight car mesh from
  `js/vehicleModel.js` and hide the character. Interpolate exactly as arena
  does.
- **HUD:** peer list + connection pill (port `netHud.js`). A menu field to
  enter/generate a room code. Persist last code in settings.

**Test:** two headless browser contexts join the same code; assert each sees
the other's ghost move within ~1 m of the sender's real position after the
render delay. (Pattern: `arena-protocol-project` already has multi-context
tests.)

**Stop here if:** latency feel is bad on Render's free tier, or the fan-out
cost is too high. Ghosts alone are still a fun "we're in the same city" toy.

### Phase 2 — shared world authority (host model) — ~1–2 weeks

One player is the **host**; their machine is authoritative for traffic, peds,
police, wanted level, mission/event state. Clients render the host's world and
send only their own input/actions.

- **Host election:** room creator is host. On host disconnect, either end the
  session or promote the lowest-latency peer (hard — probably just end it for
  v1).
- **Server relays a "world snapshot"** from the host at 10 Hz: a capped list of
  nearby traffic/ped/cop transforms (id, kind, x, z, ry, state), the shared
  `wanted`, active event flags. Cap payload size (arena uses
  `maxHttpBufferSize: 16384` — budget similarly; cull by distance to the
  *nearest* player).
- **Clients:** `js/npc.js`, `js/police.js`, `js/army.js` gain a "remote" mode
  where `update*` just interpolates toward the host snapshot instead of
  simulating. Gate with `if (world.net?.isHost) simulate(); else interpolate();`
  at the top of each `update*`.
- **Shared wanted level:** any player's crime adds to the host's `world.wanted`
  via an action message (`addCrime`). Stars, chase music, spawns all key off
  the shared value.
- **Pickups / money:** host owns pickup state; grabbing one sends a claim, host
  confirms and credits that player. Money stays per-player.
- **Reconcile the local player** against the host only for anti-cheat-ish
  sanity (teleport clamp); otherwise trust local movement for feel.

**Risk:** this is the hard part. `js/main.js` is 3.5k lines and ~130 `update*`
calls; each stateful system needs a remote branch. Do it system-by-system,
shipping with "only traffic + police + wanted are shared, everything else is
still local per-player" as an intermediate milestone.

### Phase 3 — co-op interactions — ~1 week on top

- **Revive:** a downed player (health 0) enters a 20 s "bleed-out" instead of
  WASTED. A teammate holding **E** over them for 3 s revives at 30 HP. Wire
  into `triggerOver()` in `js/main.js` — check `world.net?.connected` before
  the normal over-screen.
- **Co-op bank heist:** `js/heist.js` gains role assignment — one player drills
  (holds E at the vault), the others hold the lobby. Drill progresses only
  while a player is present. Payout splits.
- **Shared vehicles:** passenger seats. `player.inCar` gains a `seat` field;
  a second player pressing E near a driven car rides along, camera follows the
  car, they can lean out and shoot (reuse the drive-by path).
- **Ping / marker:** middle-click drops a world marker all peers see (reuse the
  waypoint beam mesh).

**Server/deploy:** the game already ships next to the arena server on one
Render service (`README.md`). Add the coop room type there. Env: reuse
`CLIENT_ORIGIN`. Budget concurrent rooms; free tier will cap low.

**Total estimate:** Phase 1 alone is a good release. Phases 1–3 = ~4–6 weeks
of focused work.

---

## 2. Skeletal animation (GLB + AnimationMixer)

**Goal:** replace the procedural pose-lerp animation on the player and
pedestrians with real rigged skeletal animation — walk / run / idle / turn /
jump / fall, blended — plus proper hand-to-weapon attachment.

**This is the one plan that adds an asset pipeline and binary files.**

### Phase 1 — loader + one rigged hero — ~1 week

- **Assets:** one rigged humanoid GLB (Mixamo "Y Bot" or a CC0 character from
  Quaternius / Kenney), plus these Mixamo clips retargeted onto it: Idle,
  Walk, Run, Left Turn, Right Turn, Jump, Falling, Landing. Export as **one
  GLB with all clips** (Blender: import FBX clips, retarget, export glTF with
  "animations"). Keep under ~2 MB (Draco-compress the mesh; animations are
  cheap). Put it in `assets/char/hero.glb`. Record the license in
  `ASSET_SOURCES.md`.
- **`js/gltfChar.js` (new):**
  - `GLTFLoader` + `DRACOLoader` from `three/addons` (already in the import
    map path). Load once, `SkeletonUtils.clone()` per instance.
  - `createGltfCharacter()` returns the same shape the rest of the code
    expects from `js/characters.js` (`{ group, palette, … }`) plus
    `{ mixer, actions }`.
  - A `setLocomotion(speed, grounded, vy)` that cross-fades Idle↔Walk↔Run by
    speed and fires Jump/Fall/Land, and `poseAim(pitch)` that additively
    layers an upper-body aim (bone rotation on spine/arm, or a dedicated
    additive clip).
  - Wardrobe: recolour via material swap on named submeshes (skin/shirt/
    pants), matching `applySuitColors()` in `js/main.js`.
- **Wire behind a flag.** `world.settings.gltfChars` (default off). In
  `js/main.js`, if on, `createGltfCharacter()` instead of `createCharacter()`
  for the player; call `mixer.update(dt)` in the loop; route the existing
  `animateWalk/animateIdle/animateLand` call sites to `setLocomotion`.
- **Keep the procedural rig as the fallback** — it's the low-graphics path and
  the offline-safe path if the GLB fails to load.

**Test:** load with the flag on, assert no console errors, `mixer` advances,
the hero's feet don't skate (compare root delta vs. a walk-cycle distance),
wardrobe colours still apply. Frame time within +3 ms of procedural on the
high tier.

### Phase 2 — pedestrians + LOD — ~1 week

- Pedestrians use the same GLB via `SkeletonUtils.clone()`. This is the perf
  risk: 64 skinned meshes + mixers. Mitigations:
  - Only the nearest ~12 peds get a live mixer; the rest freeze on a single
    pose (or keep the procedural rig at distance — a true LOD swap).
  - Share one `AnimationMixer` update budget; stagger with the
    `world.perf.detailTick` lane system from `js/perf.js`.
  - Cap skinning bones; merge ped materials.
- Tie the ped detail radius to the graphics tier (`js/graphics.js`).

### Phase 3 — weapons + polish — ~3–5 days

- A weapon socket bone on the right hand; attach the existing procedural
  weapon models (`js/combat-view.js`) to it. Recoil as an additive pose.
- Vehicle enter/exit clips (short), swing pose (may stay procedural — the web
  physics drives the torso; layer an additive arm-reach).
- Death: a ragdoll is out of scope; use a "hit reaction" + "die" clip.

**Stop here if:** mobile frame time craters (likely at 64 skinned peds). The
Phase 1 hero-only upgrade is the 80/20 win — it's what the player looks at.

**Note in the repo already flags this** (`LOCAL_RELEASE_NOTES.md`,
`VISUAL_UPGRADE_PLAN.md`): preserve +Z forward and metres, GLB with applied
scale, named clips, hand/weapon sockets.

---

## 3. Mission editor / scripting sandbox

**Goal:** an in-game editor to place a custom mission — checkpoints, a target
vehicle, a timer, a reward — and share it as a URL-encoded string. Turns the
hardcoded `js/missions.js` into a template for infinite community content.

### Phase 1 — data model + runner — ~4–5 days

- **`js/usermissions.js` (new).** A mission is plain JSON:
  ```
  { v:1, name, author, reward, timeLimit,
    start:{x,z}, vehicle:'none'|'car'|'bike'|'heli',
    steps:[ {type:'goto', x,z, radius}, {type:'collect', x,z},
            {type:'wreck', target:'nearestCar'}, {type:'wait', secs} ] }
  ```
- A generic runner: reuses the existing mission HUD (`#mission` panel, marker
  on the minimap, `showMissionMsg`). Steps advance on proximity / timer /
  vehicle-destroyed. Fail on timeout. Pay `reward` via `world.awardMoney`.
- Encode: `btoa(JSON.stringify(m))` → `#m=<blob>` URL fragment, or a copyable
  code string. On load, if `location.hash` has `m=`, offer "Play shared
  mission" on the start screen.
- **No arbitrary code.** Only the fixed step vocabulary. This keeps it safe to
  share — a shared mission can't run script.

### Phase 2 — the editor UI — ~1 week

- A `gameState === 'editor'` mode (like `photo`): free-fly camera, click the
  ground to drop a step, a side panel to set type/radius/reward/timer, drag to
  reorder, delete. Reuse the photo-mode camera code in `js/main.js`.
- Live preview: "Test" runs the mission from the current draft without saving.
- Save drafts to `localStorage` (a `usermissions` array in the save blob).
- Enter from the pause menu → "MISSION EDITOR".

### Phase 3 — sharing + a browser — ~3 days

- A "Community" tab on the start screen: paste a code, or a short list of
  built-in example missions shipped as JSON in `js/usermissions.js`.
- Optional: a server endpoint (`arena-protocol-project/server`) to store and
  list shared missions by code, with the existing Postgres (`server/db.js`).
  Rate-limit; sanitise `name`/`author` (already a pattern in `server.js`
  chat handling).

**Stop here if:** Phase 1 + a code string is already the whole value. The
visual editor is polish.

---

## 4. Save slots + cloud save — DONE

**Slots** (`js/saveslots.js`) and **cloud save Phase 1** (`js/cloudsave.js` +
`arena-protocol-project/server/save-api.js`) are both shipped.

Cloud save as built: `PUT/GET/DELETE /api/save/:slot` + `GET /api/save` on the
server, keyed by the bank account's bearer token (a `cloud_saves` JSONB table).
The client pushes the active slot (debounced ~12 s off `saveGame()`, flushed on
`pagehide`, plus an immediate `world.cloud.push()`), pulls per slot from the
start screen, and a stale `baseRev` returns 409 → `world.cloud.conflict()` →
the pause menu asks keep-local vs take-server. Server sanitises every uploaded
blob against an allow-list and caps it at 96 KB. Offline / no-DB / no-account
all degrade to local-only silently.

Phase 2 hardening (conflict UI showing both summaries side by side, a
"download all slots" bundle) is still open but not blocking.

### Phase 1 — account-backed save — DONE (see above)

- **Server** (`arena-protocol-project/server`): the game already has a bank API
  (`server/bank-api.js`) and Postgres (`server/db.js`) with a user concept and
  the admin token flow. Add:
  - `POST /save/:slot` — body is the save blob (cap ~64 KB), keyed by user id.
  - `GET /save/:slot` — returns the blob + a server timestamp.
  - `GET /saves` — list slots with timestamps + summaries.
  - Auth: reuse whatever identifies a user for the bank API (session cookie /
    token). Never trust a client-declared user id.
- **Client `js/cloudsave.js` (new):**
  - `cloudPush(slot, blob)` — debounced, called from `saveGame()` when signed
    in and online. Last-write-wins with a timestamp; on conflict (server
    newer) prompt "Server has a newer save — keep local or pull?".
  - `cloudPull(slot)` — on the start screen, per slot, a "☁ from cloud"
    button that overwrites the local slot and reloads.
  - Offline: queue the latest blob, flush on reconnect.
- **Start-screen slot cards** (`js/saveslots.js`) gain a cloud status dot and
  push/pull actions when signed in.

### Phase 2 — hardening — ~3 days

- Conflict UI that shows both summaries (money / level / missions) before
  choosing.
- Blob validation server-side: must be JSON, size cap, strip anything not in a
  known key allowlist (mirror the keys written in `saveGame()`).
- A "download all slots" bundle (client-side zip via a tiny CDN lib, or just
  N sequential JSON downloads).

**Risk:** low. The infra exists; it's mostly an endpoint + a debounced client.

---

## 5. Interiors

**Goal:** a handful of real walk-in interiors (casino first, then gun shop,
nightclub, hospital) instead of facades. Load on a trigger, fade, teleport to
an interior cell above the city, fade back.

### Phase 1 — the interior system — ~1 week

- **`js/interiors.js` (new).** An interior is a self-contained room built from
  primitives + the existing `js/textures.js` PBR helpers, placed far above the
  map (e.g. y = 2000) so it never intersects the city. A registry:
  `{ key, build(scene), entryDoor:{x,z}, exitPoint:{x,z}, spawn, lights }`.
- **Trigger:** a door prop in the world with a prompt ("Press E to enter").
  On enter: fade `#damage`/a new `#fade` div to black, set
  `player.pos` to the interior spawn, set `world.interior = key`, swap fog +
  disable sky/weather/traffic updates while inside, fade in.
- **While inside:** most `update*` systems early-return on `world.interior`
  (add a one-line guard, or gate the whole block in `js/main.js`). Peds/cars
  inside are their own small list.
- **Exit:** a door back → reverse the transition to `exitPoint`.
- **Minimap:** swap to a simple interior floor plan while inside.

### Phase 2 — content — ~1 week per interior

- **Casino** first (most reasons to go in): slot floor, the blackjack/roulette/
  poker tables become physical objects you walk to and press E at, a bar, a
  cashier cage (the bank), a back room for the casino heist setup.
- Then gun shop (the workbench + ammo counter), nightclub (dance floor,
  DJ booth, VIP), hospital (the $100 heal desk, a pharmacy side job).

**Risk:** medium. It's mostly level-building time. The transition needs care so
no system keeps simulating the player against city colliders while they're at
y = 2000 (hence the `world.interior` guards).

**Stop here if:** the transition feels janky or the guard sweep across 130
`update*` calls is too invasive. One good interior (casino) is a fine ship.

---

## 6. Dynamic economy & progression rework

**Goal:** the 168 systems each hand out cash independently and there's no sink
once you own the empire. Add real money sinks, dynamic prices, and a proper
endgame.

### Phase 1 — sinks — ~1 week

- **Property upkeep.** Owned properties (`js/empire.js`, `js/safehouses.js`,
  `js/mayor.js`) charge a daily maintenance that scales with holdings. Miss it
  → the property stops paying and can be repossessed (`js/repo.js` already
  has a repo-man). Wire into `newDay()` in `js/economy.js`.
- **Vehicle insurance.** A garaged/owned car that gets wrecked costs a
  deductible to replace, or a monthly premium that waives it. `js/garage_multi.js`,
  `js/impound.js`.
- **Wanted "rap sheet."** A persistent notoriety stat (separate from live
  stars) that rises with lifetime crime and slowly decays. High notoriety →
  shops charge more, cops respond faster, some jobs refuse you. Lawyers
  (`js/lawyer.js`) and bribes reduce it.

### Phase 2 — dynamic prices — ~4–5 days

- Store stock + prices in `js/shops.js`, `js/armsdealer.js`, `js/streetfood.js`
  drift with supply/demand: robbing a store spikes its prices for days;
  flooding the market via `js/export.js` / `js/chopshop.js` depresses payouts
  for that vehicle class temporarily.
- A small `js/market.js` that owns the drift model and is read by the shops.

### Phase 3 — endgame — ~1 week

- **District takeover campaign.** Buy the city block by block (10×10 grid).
  Each district: a purchase price that scales, a takeover mission, then
  passive income + a defence event (`js/propraid.js` pattern). Owning all
  districts is a new completion-board line (`js/legend.js`) and a second
  ending after the crown.
- A running "net worth" stat and a leaderboard hook (cloud, see #4).

**Risk:** balancing. Ship Phase 1 behind a `world.settings.hardEconomy`
toggle so it doesn't wreck existing saves, tune, then make it default.

---

## 7. WebXR / VR mode

**Goal:** an optional comfort-first VR free-roam mode. Flatscreen game stays
the default and the fallback.

### Phase 1 — render path — ~1–2 weeks

- **The blocker:** the post-processing chain (`js/graphics.js` — bloom, SMAA,
  colour-grade LUT, optional GTAO) renders through an `EffectComposer`, which
  doesn't work unchanged in WebXR's multiview render loop.
- Build a **VR render tier** in `js/graphics.js`: `renderer.xr.enabled = true`,
  `renderer.setAnimationLoop`, and either no composer (forward render only) or
  a very cheap post pass known to be XR-safe. Accept a visual downgrade in VR.
- Add a "VR" button on the start screen (only if `navigator.xr` +
  `isSessionSupported('immersive-vr')`). Enter/exit session handling.

### Phase 2 — locomotion + interaction — ~2 weeks

- **Comfort locomotion:** teleport (arc + fade) as default; smooth locomotion
  with a vignette as an option. A player rig (dolly) that the camera sits in;
  `player.pos` follows the dolly.
- **Controllers:** map to the existing action set — trigger = shoot,
  grip = web-shoot, thumbstick = teleport/turn (snap-turn default). Reuse the
  gamepad mapping ideas in `js/input.js`.
- **HUD in world space:** the DOM HUD can't render in VR. A minimal
  world-locked panel (health, wanted, minimap as a texture) attached to the
  rig or the off-hand.
- **Vehicles/swinging in VR:** heavy nausea risk. Gate swinging behind the
  comfort options; consider a "cockpit frame" for driving.

### Phase 3 — the long tail

Menus, missions, casino games, every overlay currently in DOM needs a
world-space equivalent or a "take the headset off for this" fallback. This is
open-ended — scope it to "free-roam + combat + traversal work in VR; menus
kick you to a floating screen."

**Risk:** high, and needs a physical headset to test. This is the lowest
priority for a reason. Phase 1 (proving the render path) is the go/no-go gate.

---

## Suggested sequencing

1. ~~**Cloud save (#4)**~~ — DONE.
2. **Co-op Phase 1 (#1)** — ghost players. High wow-factor, self-contained. 1 wk.
3. **Skeletal animation Phase 1 (#2)** — hero GLB. Biggest feel upgrade. 1 wk.
4. **Economy Phase 1 (#6)** — sinks behind a toggle. 1 wk.
5. **Mission editor Phase 1 (#3)** — data model + runner + code string. 1 wk.
6. Then decide: deepen co-op (Phase 2 world authority) vs. interiors vs. VR
   render-path spike, based on what players ask for.

Each step above is a shippable release on its own.
