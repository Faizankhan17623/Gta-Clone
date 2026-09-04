import * as THREE from 'three';

// Step 6: Scene. Steps 9, 11, 12, 13, 15, 16, 17 build the world here.
export function createScene() {
  const scene = new THREE.Scene();

  // Step 12: solid sky color so it doesn't look void-like.
  scene.background = new THREE.Color(0x87ceeb);

  // Step 13: fog for depth/atmosphere (matches the sky color).
  scene.fog = new THREE.Fog(0x87ceeb, 30, 120);

  addLights(scene);
  addGround(scene);
  // Step 25: collect obstacle meshes so the collision system can test against them.
  const obstacles = addObstacles(scene);
  addGridHelper(scene);

  // Expose obstacles on the scene for the collision system (Phase 3).
  scene.userData.obstacles = obstacles;

  return scene;
}

// Step 9: DirectionalLight + AmbientLight. Step 17: directional light casts shadows.
function addLights(scene) {
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  ambient.name = 'ambient';
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.name = 'sun';
  sun.position.set(20, 40, 20);
  sun.castShadow = true;

  // Step 19: tune the shadow camera/quality so it runs smoothly.
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
}

// Step 11: large flat ground plane. Step 17: receives shadows.
function addGround(scene) {
  const geometry = new THREE.PlaneGeometry(200, 200);
  const material = new THREE.MeshStandardMaterial({ color: 0x4a7c3a });
  const ground = new THREE.Mesh(geometry, material);
  ground.rotation.x = -Math.PI / 2; // rotate flat
  ground.receiveShadow = true;
  scene.add(ground);
}

// Step 15: static obstacle boxes/walls as cover (placeholder map).
// Step 17: obstacles cast and receive shadows.
function addObstacles(scene) {
  const obstacles = [];
  const material = new THREE.MeshStandardMaterial({ color: 0x8a8a8a });

  const blocks = [
    // [x, z, width, height, depth]
    [-8, -6, 3, 2, 3],
    [6, -10, 4, 3, 2],
    [10, 4, 2, 4, 2],
    [-12, 8, 5, 2, 2],
    [0, -16, 6, 2, 1],
    [-4, 12, 2, 5, 2],
    [14, -2, 2, 2, 6],
    // Buildings, raised cover, and a central combat lane.
    [-17, -2, 6, 6, 5], [17, 13, 7, 5, 6], [3, 17, 8, 3, 4],
    [0, 3, 7, 1.2, 2], [-8, 17, 2, 2.5, 7], [17, -16, 5, 2, 3],
  ];

  for (const [x, z, w, h, d] of blocks) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    box.position.set(x, h / 2, z);
    box.castShadow = true;
    box.receiveShadow = true;
    box.userData.isObstacle = true;
    scene.add(box);
    obstacles.push(box);
  }

  // A perimeter of low walls to bound the arena.
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6b5b4b });
  const wallSpecs = [
    [0, -25, 50, 3, 1],
    [0, 25, 50, 3, 1],
    [-25, 0, 1, 3, 50],
    [25, 0, 1, 3, 50],
  ];
  for (const [x, z, w, h, d] of wallSpecs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    wall.position.set(x, h / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    wall.userData.isObstacle = true;
    scene.add(wall);
    obstacles.push(wall);
  }

  // Explosive arena barrels; shooting one damages nearby enemies once.
  for (const [x,z] of [[-6,2],[7,-4],[13,18],[-18,-12]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.45,.45,1.3,12), new THREE.MeshStandardMaterial({color:0xd94b32,metalness:.45,roughness:.55}));
    barrel.position.set(x,.65,z); barrel.castShadow=true; barrel.userData.isObstacle=true; barrel.userData.explosive=true; scene.add(barrel); obstacles.push(barrel);
  }

  return obstacles;
}

// Step 16: grid helper during development to judge distances.
function addGridHelper(scene) {
  const grid = new THREE.GridHelper(200, 100, 0x000000, 0x444444);
  grid.material.opacity = 0.25;
  grid.material.transparent = true;
  scene.add(grid);
}
