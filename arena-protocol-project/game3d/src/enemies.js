import * as THREE from 'three';

// Steps 34-35 (Phase 4): target dummies with health that register hits and die.
// Steps 41, 47 (Phase 5): moving enemies with simple AI (move toward player, attack in range).
export function createEnemies(scene, collider) {
  const enemies = []; // active enemy objects
  const enemyMat = () => new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.7 });

  const ENEMY_RADIUS = 0.5;
  const ENEMY_HEIGHT = 1.8;

  function spawn(x, z, { health = 30, speed = 2.2, damage = 10, type = 'grunt', ranged = false } = {}) {
    // A capsule-ish body (cylinder + sphere head) so raycasts have something to hit.
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(ENEMY_RADIUS, ENEMY_HEIGHT - ENEMY_RADIUS * 2, 4, 8),
      new THREE.MeshStandardMaterial({ color: type === 'boss' ? 0x8d35d1 : type === 'tank' ? 0x9b3b32 : type === 'runner' ? 0xff6b35 : type === 'ranged' ? 0x2f77d0 : 0xcc3333, roughness: 0.7 })
    );
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const scale = type === 'boss' ? 2.2 : type === 'tank' ? 1.45 : type === 'runner' ? .78 : 1;
    group.scale.setScalar(scale);
    group.position.set(x, ENEMY_HEIGHT * scale / 2, z);
    group.userData.enemy = {
      health,
      maxHealth: health,
      speed,
      damage,
      attackCooldown: 0, type, ranged,
    };
    scene.add(group);
    enemies.push(group);
    return group;
  }

  // Step 35: apply damage; returns true if this hit killed the enemy.
  function damage(group, amount, hitPoint) {
    const e = group.userData.enemy;
    const localY = hitPoint ? hitPoint.y - group.position.y : 0;
    const headshot = localY > (e.type === 'boss' ? 1.15 : .45);
    e.health -= amount * (headshot ? 1.75 : 1);
    // Flash brighter on hit.
    group.children[0].material.emissive = new THREE.Color(0x550000);
    setTimeout(() => {
      if (group.children[0]) group.children[0].material.emissive = new THREE.Color(0x000000);
    }, 80);

    if (e.health <= 0) {
      remove(group);
      return { killed: true, headshot };
    }
    return { killed: false, headshot };
  }

  function remove(group) {
    const idx = enemies.indexOf(group);
    if (idx >= 0) enemies.splice(idx, 1);
    scene.remove(group);
    group.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
  }

  // Steps 41 & 47: move each enemy toward the player; attack when in contact range.
  // Calls onAttack(damage) when an enemy lands a hit on the player.
  const dir = new THREE.Vector3();
  function update(delta, playerPos, onAttack) {
    for (const group of enemies) {
      const e = group.userData.enemy;
      e.attackCooldown = Math.max(0, e.attackCooldown - delta);

      dir.set(playerPos.x - group.position.x, 0, playerPos.z - group.position.z);
      const dist = dir.length();

      const ATTACK_RANGE = e.ranged ? 11 : (e.type === 'boss' ? 3 : 1.6);
      if (dist > ATTACK_RANGE) {
        if (!e.ranged || dist > 8) dir.normalize().multiplyScalar(e.speed * delta);
        else dir.set(0,0,0);
        // Resolve against obstacles so enemies don't walk through cover.
        const corrected = collider.resolveXZ(
          group.position.x + dir.x,
          group.position.z + dir.z
        );
        group.position.x = corrected.x;
        group.position.z = corrected.z;
        // Face the player.
        group.rotation.y = Math.atan2(
          playerPos.x - group.position.x,
          playerPos.z - group.position.z
        );
      } else if (e.attackCooldown === 0) {
        // In range: attack on a cooldown.
        e.attackCooldown = 1.0;
        onAttack(e.damage);
      }
    }
  }

  function clear() {
    [...enemies].forEach(remove);
  }

  return {
    spawn,
    damage,
    remove,
    update,
    clear,
    get list() { return enemies; },
    get count() { return enemies.length; },
  };
}
