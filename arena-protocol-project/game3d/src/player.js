import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { applyInput } from '../../shared/movement.js';

// Phase 3 controls + Phase 7 client-side prediction & reconciliation.
// Steps 21-28: mouse-look, WASD, camera-relative + delta-time movement,
//   collision, gravity + jump, vertical-look clamp, sprint.
// Step 63: client-side prediction — we move locally immediately.
// Step 64: server reconciliation — re-apply unacknowledged inputs on correction.
export function createPlayer(camera, scene, collider, domElement, { sendInput } = {}) {
  const controls = new PointerLockControls(camera, domElement);
  scene.add(controls.getObject());

  const EYE_HEIGHT = 1.7;
  controls.getObject().position.set(0, EYE_HEIGHT, 10);

  const GRAVITY = 25;
  const JUMP_SPEED = 8;

  const keys = { forward: false, back: false, left: false, right: false, sprint: false };
  let verticalVelocity = 0;
  let onGround = true;
  let bobTime = 0;
  let speedMultiplier = 1;
  let mobileActive = false;

  // Step 63/64: prediction state.
  let seq = 0;                 // input sequence counter
  const pending = [];          // inputs sent but not yet acknowledged by the server
  // Our predicted horizontal position (authoritative axis the server owns).
  const predicted = { x: controls.getObject().position.x, z: controls.getObject().position.z };

  document.addEventListener('keydown', onKey(true));
  document.addEventListener('keyup', onKey(false));
  window.addEventListener('blur', clearKeys);

  function clearKeys() {
    Object.keys(keys).forEach((key) => { keys[key] = false; });
  }

  function onKey(isDown) {
    return (e) => {
      const code = e.code || ({ w: 'KeyW', a: 'KeyA', s: 'KeyS', d: 'KeyD' }[e.key?.toLowerCase()] ?? e.key);
      switch (code) {
        case 'KeyW': case 'ArrowUp': keys.forward = isDown; break;
        case 'KeyS': case 'ArrowDown': keys.back = isDown; break;
        case 'KeyA': case 'ArrowLeft': keys.left = isDown; break;
        case 'KeyD': case 'ArrowRight': keys.right = isDown; break;
        case 'ShiftLeft': case 'ShiftRight': keys.sprint = isDown; break;
        case 'Space':
          if (isDown && onGround) { verticalVelocity = JUMP_SPEED; onGround = false; }
          break;
      }
      if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(code)) e.preventDefault();
    };
  }

  const _fwd = new THREE.Vector3();
  function currentYaw() {
    camera.getWorldDirection(_fwd);
    return Math.atan2(_fwd.x, _fwd.z);
  }

  function update(delta) {
    const obj = controls.getObject();
    const yaw = currentYaw();

    // Build this frame's input command.
    const cmd = {
      seq: ++seq,
      forward: keys.forward, back: keys.back,
      left: keys.left, right: keys.right,
      sprint: keys.sprint,
      yaw,
      dt: delta * speedMultiplier,
    };

    // Step 63: predict immediately using the SAME physics the server runs.
    const moved = applyInput(predicted, cmd);
    // Step 25: local collision (the server also resolves it authoritatively).
    const corrected = collider.resolveXZ(moved.x, moved.z);
    predicted.x = corrected.x;
    predicted.z = corrected.z;

    obj.position.x = predicted.x;
    obj.position.z = predicted.z;

    // Remember this input until the server acknowledges it.
    pending.push(cmd);
    if (pending.length > 200) pending.shift(); // safety cap

    // Step 65: hand the input to the server (authority).
    if (sendInput) sendInput(cmd);

    // --- Local-only vertical motion + head-bob (not server-authoritative) ---
    const movingHoriz = (keys.forward || keys.back || keys.left || keys.right) && onGround;
    let bobOffset = 0;
    if (movingHoriz) {
      bobTime += delta * (keys.sprint ? 14 : 10);
      bobOffset = Math.sin(bobTime) * 0.05;
    } else {
      bobTime = 0;
    }

    verticalVelocity -= GRAVITY * delta;
    obj.position.y += verticalVelocity * delta;
    if (obj.position.y <= EYE_HEIGHT) {
      obj.position.y = EYE_HEIGHT;
      verticalVelocity = 0;
      onGround = true;
    }
    if (onGround) obj.position.y = EYE_HEIGHT + bobOffset;
  }

  // Step 64: reconcile against the server's authoritative state for OUR player.
  // serverSelf = { x, z, seq } where seq is the last input the server applied.
  function reconcile(serverSelf) {
    // Drop inputs the server has already accounted for.
    while (pending.length && pending[0].seq <= serverSelf.seq) pending.shift();

    // Start from the authoritative position...
    let x = serverSelf.x;
    let z = serverSelf.z;
    // ...then re-apply every input the server hasn't processed yet.
    for (const cmd of pending) {
      const m = applyInput({ x, z }, cmd);
      const c = collider.resolveXZ(m.x, m.z);
      x = c.x; z = c.z;
    }

    predicted.x = x;
    predicted.z = z;

    const obj = controls.getObject();
    obj.position.x = x;
    obj.position.z = z;
  }

  function resetTo(x, y, z) {
    const obj = controls.getObject();
    obj.position.set(x, y, z);
    predicted.x = x; predicted.z = z;
    pending.length = 0;
    verticalVelocity = 0;
    onGround = true;
  }

  function setSpeedMultiplier(value, seconds = 0) {
    speedMultiplier = value;
    if (seconds) setTimeout(() => { speedMultiplier = 1; }, seconds * 1000);
  }
  function setSensitivity(value) { controls.pointerSpeed = value; }
  function setAction(action, value) { if (action in keys) keys[action] = !!value; }
  function setMobileActive(value) { mobileActive = !!value; }
  return { controls, update, reconcile, resetTo, setSpeedMultiplier, setSensitivity, setAction, setMobileActive, get isActive() { return mobileActive || controls.isLocked; }, object: controls.getObject() };
}
