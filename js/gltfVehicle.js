import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { runtime } from './runtime.js';

const assetPromises = new Map();

export function attachVehicleAsset(v) {
  const definition = runtime.vehicle(v.modelId)?.asset;
  if (!definition) { v.assetReady = Promise.resolve(false); return; }
  const fallback = [...v.mesh.children];
  if (!assetPromises.has(definition.url)) {
    assetPromises.set(definition.url, new GLTFLoader().loadAsync(definition.url).catch(error => {
      assetPromises.delete(definition.url);
      throw error;
    }));
  }
  v.assetReady = assetPromises.get(definition.url).then(gltf => {
    if (v.dead) return false;
    const root = gltf.scene.clone(true);
    const materials = new Map();
    root.traverse(o => {
      if (o.isLight) { o.intensity = 0; o.visible = false; } // shared gameplay spotlight supplies beams
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const clone = m => {
        if (!materials.has(m)) materials.set(m, m.clone());
        return materials.get(m);
      };
      o.material = Array.isArray(o.material) ? o.material.map(clone) : clone(o.material);
    });
    const wheels = definition.wheels.map(n => root.getObjectByName(n));
    if (wheels.some(w => !w)) throw new Error('Vehicle wheel pivots missing');
    wheels.forEach(w => { w.rotation.order = 'YXZ'; });
    const panels = {};
    for (const [name, { node: nodeName, axis, angle }] of Object.entries(definition.panels || {})) {
      const node = root.getObjectByName(nodeName);
      if (!node) throw new Error('Vehicle mechanism missing: ' + nodeName);
      panels[name] = { node, axis, angle, open: false };
    }
    fallback.forEach(o => { o.visible = false; });
    v.mesh.userData.modelDetail = null;
    v.mesh.add(root);
    v.wheels = wheels;
    v.asset = { root, panels, materials: [...materials.values()], clips: gltf.animations,
      materialRoles: definition.materials || {} };
    v.headlightsOn = true;
    for (const m of v.asset.materials) {
      if (m.name === v.asset.materialRoles.paint && v.paintColor) m.color.set(v.paintColor);
    }
    return true;
  }).catch(error => {
    v.assetError = error.message;
    console.warn('Vehicle asset unavailable; using procedural fallback:', error.message);
    return false;
  });
}

export function setVehiclePanel(v, name, open) {
  const panel = v?.asset?.panels[name];
  if (panel) panel.open = !!open;
}

export function updateVehicleAsset(v, dt, driving = false, braking = false) {
  if (!v.asset) return;
  for (const [name, p] of Object.entries(v.asset.panels)) {
    if (name === 'Fuel_Flap') p.open = !!v.refuelling;
    else if (v.vel.lengthSq() > 4) p.open = false;
    const target = p.open && !v.dead ? p.angle : 0;
    p.node.rotation[p.axis] = THREE.MathUtils.damp(p.node.rotation[p.axis], target, 9, dt);
  }
  for (const m of v.asset.materials) {
    if (m.name === v.asset.materialRoles.headlight) m.emissiveIntensity = !v.dead && v.headlightsOn ? 3 : 0;
    if (m.name === v.asset.materialRoles.tail) m.emissiveIntensity = v.dead ? 0 : driving && braking ? 3 : v.headlightsOn ? .5 : 0;
  }
}

export function vehicleControls(v, pressed) {
  if (!v.asset) return;
  if (pressed.Equal) v.headlightsOn = !v.headlightsOn;
  if (v.vel.lengthSq() > 1) return;
  if (pressed.BracketLeft) {
    const firstDoor = ['Door_FL', 'Door_FR', 'Door_RL', 'Door_RR'].find(n => v.asset.panels[n]);
    const open = firstDoor ? !v.asset.panels[firstDoor].open : false;
    for (const n of ['Door_FL', 'Door_FR', 'Door_RL', 'Door_RR']) setVehiclePanel(v, n, open);
  }
  if (pressed.BracketRight) setVehiclePanel(v, 'Hood', !v.asset.panels.Hood?.open);
  if (pressed.Backslash) setVehiclePanel(v, 'Trunk', !v.asset.panels.Trunk?.open);
}
