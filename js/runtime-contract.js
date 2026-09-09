// Build-time composition seam. This module has no edition/content imports.
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function createRuntime(profile) {
  const config = structuredClone(profile);
  if (config.contractVersion !== 1 || !config.id) throw new Error('Unsupported runtime profile');
  const { save, vehicles = [], starterVehicle, settingsDefaults, graphics } = config;
  if (!save || !['live', 'slotPrefix', 'namePrefix', 'active'].every(k => typeof save[k] === 'string' && save[k])) {
    throw new Error('Runtime profile requires explicit save keys');
  }
  if (!settingsDefaults || !graphics) throw new Error('Runtime profile requires settings/graphics policy');
  const definitions = new Map();
  for (const definition of vehicles) {
    if (!definition.id || definitions.has(definition.id)) throw new Error('Missing or duplicate vehicle ID');
    if (!(Number.isFinite(definition.fuelCapacityLiters) && definition.fuelCapacityLiters > 0)) {
      throw new Error('Invalid vehicle fuel capacity');
    }
    if (definition.asset) {
      const { url, wheels, panels = {} } = definition.asset;
      if (typeof url !== 'string' || !url || wheels?.length !== 4 || !wheels.every(n => typeof n === 'string' && n)) {
        throw new Error('Asset requires a URL and four wheel pivots');
      }
      for (const panel of Object.values(panels)) {
        if (!panel.node || !['x', 'y', 'z'].includes(panel.axis) || !Number.isFinite(panel.angle)) {
          throw new Error('Invalid vehicle panel contract');
        }
      }
    }
    definitions.set(definition.id, definition);
  }
  if (!starterVehicle || !definitions.has(starterVehicle.modelId)) throw new Error('Starter vehicle is not registered');
  freeze(config);
  return Object.freeze({
    profile: config,
    vehicle: id => definitions.get(id),
    saveKeys: Object.freeze({
      live: save.live, active: save.active,
      slot: i => `${save.slotPrefix}${i}`, name: i => `${save.namePrefix}${i}`,
      cloudRev: i => `${save.slotPrefix}cloudrev-${i}`,
    }),
    settings(saved = {}) {
      return { ...config.settingsDefaults, ...(saved.settings || {}),
        fuel: saved.fuelVersion === 2 ? saved.settings?.fuel !== false : true };
    },
  });
}
