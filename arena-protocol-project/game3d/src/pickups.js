import * as THREE from 'three';

export function createPickups(scene) {
  const items = [];
  const spots = [[-18,-18], [18,-18], [-18,18], [18,18], [0,-8], [8,10], [-10,2]];
  const types = ['rifle', 'health', 'shotgun', 'ammo', 'sniper', 'health', 'ammo'];

  function spawnAll() {
    clear();
    spots.forEach(([x,z], i) => spawn(types[i], x, z));
  }

  function spawn(type, x, z) {
    const color = type === 'health' ? 0x35df77 : type === 'ammo' ? 0xffca3a :
      type === 'rifle' ? 0x62d68b : type === 'shotgun' ? 0xee9b52 : 0x72a7ff;
    const mesh = new THREE.Mesh(
      type === 'health' ? new THREE.BoxGeometry(.65,.65,.65) : new THREE.CylinderGeometry(.28,.28,.85,8),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .28 })
    );
    mesh.position.set(x, .7, z);
    mesh.rotation.z = type === 'health' ? 0 : Math.PI / 2;
    mesh.userData.pickup = type;
    scene.add(mesh);
    items.push(mesh);
  }

  function update(delta, playerPos, collect) {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      item.rotation.y += delta * 1.8;
      item.position.y = .7 + Math.sin(performance.now() * .003 + i) * .12;
      if (item.position.distanceTo(playerPos) < 1.35 && collect(item.userData.pickup)) {
        scene.remove(item); item.geometry.dispose(); item.material.dispose(); items.splice(i, 1);
      }
    }
  }
  function clear() { while (items.length) { const i=items.pop(); scene.remove(i); i.geometry.dispose(); i.material.dispose(); } }
  return { spawnAll, update, clear };
}
