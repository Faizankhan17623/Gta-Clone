# OPEN CITY — 3D model & asset generation plan

A plan file to pick up later. How to make 3D models (AI or free packs) that
drop into this game, which tools to use, and the exact pipeline from
"generated blob" to "loads in the browser at 60 FPS".

Context: today the game ships **zero binary model files** — everything is
procedural Three.js geometry (see `ASSET_SOURCES.md`). Introducing real models
means adding a GLB loader and an `assets/` folder, and accepting some repo
weight + a mobile perf budget. `js/graphics.js` already has quality tiers to
hang an LOD off.

---

## 0. TL;DR — what to do

1. **Characters:** generate a mesh with **Meshy** or **Tripo** (free tier) →
   rig + animate with **Mixamo** (free) → export one GLB with all clips.
2. **Vehicles & props:** start with **Kenney** / **Quaternius** free CC0 packs
   (they match this game's low-poly style, no cleanup). Only use AI for
   specific hero items you can't find.
3. **Every model** goes through **Blender** (free): decimate to the triangle
   budget, apply scale, set +Z forward, atlas the textures, export `.glb` with
   Draco.
4. Load with `GLTFLoader` + `DRACOLoader` from `three/addons` (already on the
   import-map path). Behind a `world.settings` flag, with the procedural mesh
   as the offline/low-end fallback.

**Cost: can be 100% free.** Paid (~$10–16/mo Meshy or Tripo) only buys volume
and guaranteed commercial licensing.

---

## 1. Target format & budgets (non-negotiable for this game)

| Thing | Value |
| --- | --- |
| File format | **`.glb`** (glTF 2.0 binary), Draco-compressed mesh |
| Up axis / forward | **Y up, +Z forward**, scale applied (Blender: Apply → All Transforms) |
| Units | **metres** (a sedan ≈ 4.3 m long, a person ≈ 1.8 m tall) |
| Prop triangles | **1k–8k** |
| Vehicle triangles | **6k–15k** |
| Hero character triangles | **12k–20k** |
| Pedestrian triangles | **4k–8k** (LOD: procedural rig past ~35 m) |
| Textures | **one 1k or 2k atlas** per model (baseColor + normal + ORM). No 4k. |
| Character rig | Humanoid, ≤ ~60 bones, **named animation clips** in the same GLB |
| Weapon sockets | An empty/bone on the right hand named `socket_hand_R` |

If a generated model busts the triangle budget, decimate in Blender
(Decimate modifier, Collapse, ~0.3–0.6 ratio) until it fits.

---

## 2. AI text/image → 3D tools (compared)

| Tool | Free tier | Paid | Best for | Rig+anim | Commercial on free tier |
| --- | --- | --- | --- | --- | --- |
| **Meshy AI** | ~200 credits/mo | ~$16/mo+ | **Best all-rounder.** Props + characters, auto-retopo, PBR, **auto-rig + animate humanoids**, GLB/FBX export | **Yes** | Check current terms — usually paid only |
| **Tripo AI** | Generous | ~$10/mo+ | Fast props + characters, clean topology, GLB/FBX | Partial | Check terms |
| **Rodin / Hyper3D** | Trial | Paid | **Highest fidelity**, crisp detail | No | Paid |
| **Hunyuan3D 2** (Tencent) | **Free & open source** (local GPU or HF Space) | — | Single-image → 3D, unlimited if self-hosted | No | Yes (Apache-style, verify) |
| **TripoSR / Stable Fast 3D** | **Free & open source** | — | Instant single-image → 3D, rough. Background clutter. | No | Yes (verify) |
| **Luma Genie** | Free | — | Quick text → 3D concepts | No | Check terms |

Also reachable from the Blender MCP in a Claude Code session: Rodin (Hyper3D),
Hunyuan3D, Sketchfab search, Poly Haven, Poly Pizza.

**Recommendation:** Meshy first (the rig+animate export is what the character
plan needs). Tripo as the backup / for topology. Hunyuan3D if you want a
$0-forever image→3D path and have a GPU.

---

## 3. Free non-AI sources (the reliable path for shipping)

| Source | Licence | Content | Why |
| --- | --- | --- | --- |
| **Kenney.nl** | CC0 | Low-poly cars, city kit, characters, props | **Matches this game's exact art style.** Zero cleanup, zero licensing worry. Start here. |
| **Quaternius** | CC0 | Low-poly **rigged** characters, vehicles, nature | Free rigged humanoids — skip Mixamo entirely for these |
| **Poly Pizza** | CC0 / CC-BY | Huge low-poly model library | Fill gaps fast |
| **Poly Haven** | CC0 | HDRIs, PBR textures, some models | For real texture sets if you drop the procedural ones |
| **Mixamo** (Adobe) | Free for use | **Auto-rig any humanoid mesh + 100s of mocap clips** | The animation pipeline for plan #2. Upload mesh → download rigged FBX with clips → convert to GLB |
| **Sketchfab** | Varies — **filter to "Downloadable" + CC0/CC-BY** | Everything | Read each model's licence individually |

**Licensing rule before shipping:** CC0 = do anything. CC-BY = credit the
author in `ASSET_SOURCES.md`. AI-tool free tiers = read the current terms for
commercial use; assume you may need the paid tier for a released game. Record
every asset's source + licence in `ASSET_SOURCES.md`.

---

## 4. The pipeline (any model, AI or pack)

```
generate / download
   ↓
Blender (free):
   - import (glTF / FBX / OBJ)
   - scale to metres, rotate so +Z is forward, Apply All Transforms
   - Decimate modifier → hit the triangle budget
   - one material, bake textures to a single 1k/2k atlas (baseColor, normal, ORM)
   - name the mesh parts the wardrobe code expects: skin / shirt / pants
   - characters: keep the Mixamo rig, name clips (Idle, Walk, Run, TurnL,
     TurnR, Jump, Fall, Land), add an empty on the right hand: socket_hand_R
   - export glTF Binary (.glb): +Y up, apply modifiers, compression: Draco
   ↓
assets/  (new folder)
   assets/char/hero.glb
   assets/veh/sedan_a.glb
   assets/prop/dumpster.glb
   ↓
code:
   - GLTFLoader + DRACOLoader from three/addons (import-map path already set)
   - load once, SkeletonUtils.clone() per instance for characters
   - wrap in a factory that returns the SAME shape js/characters.js /
     js/vehicleModel.js return today ({ group, palette, ... })
   - gate behind world.settings.gltfChars / gltfVehicles (default OFF)
   - procedural mesh stays as the fallback (offline-safe + low-graphics tier)
```

Tooling notes:
- `gltf-transform` CLI (npm) — batch Draco compression, texture resize, prune.
  Good for a `scripts/optimize-assets.mjs` step.
- `gltf-pipeline` — alternative Draco/quantise CLI.
- Keep each GLB **under ~2 MB**. Total added repo weight target: **< 15 MB**
  for a first hero set (1 character + 4 vehicles + ~10 props).
- The service worker (`sw.js`) caches `js/` and `assets/` — bump `CACHE` when
  assets change.

---

## 5. Where this plugs into the code

| Asset type | Factory today | New GLB factory | Call sites |
| --- | --- | --- | --- |
| Player + peds | `createCharacter()` in `js/characters.js` | `js/gltfChar.js` → `createGltfCharacter()` | `js/main.js` player create; `js/npc.js` `spawnPeds` |
| Sedans / traffic | `js/vehicleModel.js` | `js/gltfVehicle.js` | `js/car.js`, `js/npc.js` `spawnParked/spawnTraffic` |
| Props (bins, benches, signs) | `js/district.js` primitives | `js/gltfProps.js` (instanced) | `js/city.js` / `js/district.js` decoration pass |
| Weapons | `js/combat-view.js` procedural silhouettes | attach GLB to `socket_hand_R` | `createWeaponModel()` in `js/combat-view.js` |

Animation wiring for characters is spelled out in
`BIG_FEATURE_PLANS.md` → **#2 Skeletal animation**.

---

## 6. First session's shopping list (when you pick this up)

1. Make an `assets/` folder + add a `GLTFLoader`/`DRACOLoader` helper module
   (`js/gltf.js`) — load once, cached, promise-based.
2. Grab the **Kenney "Car Kit"** + **"City Kit (Roads/Commercial)"** (CC0) as
   the first real vehicles + props. Run them through Blender → `.glb` → Draco.
3. Generate ONE hero character in Meshy (or grab a Quaternius rigged one) →
   Mixamo for Idle/Walk/Run/Turn/Jump/Fall/Land → one `hero.glb`.
4. Build `js/gltfChar.js` per plan #2 Phase 1, behind
   `world.settings.gltfChars`.
5. Measure: frame time vs. procedural on the high tier and a phone viewport.
   Decide go/no-go for pedestrians.
6. Record every asset in `ASSET_SOURCES.md` with source + licence.

Stop after step 4–5 if the perf or the look isn't a clear win — the
procedural game already holds 60 FPS and ships nothing.
