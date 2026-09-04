// Step 8: render loop with requestAnimationFrame.
// Step 14: extracted into its own module.
// Step 24 (later): delta-time is provided to update callbacks.
export function createLoop(renderer, scene, camera, { onUpdate, stats } = {}) {
  let last = performance.now();
  let running = false;

  function tick(now) {
    if (!running) return;
    const delta = (now - last) / 1000; // seconds since last frame
    last = now;

    if (stats) stats.begin();
    if (onUpdate) onUpdate(delta);
    renderer.render(scene, camera);
    if (stats) stats.end();

    requestAnimationFrame(tick);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(tick);
    },
    stop() {
      running = false;
    },
  };
}
