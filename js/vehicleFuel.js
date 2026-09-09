import { runtime } from './runtime.js';

// Litres belong to a vehicle, never to the driver. Rates are arcade-time rates.
export function initVehicleFuel(v, opts = {}) {
  const definition = runtime.vehicle(v.modelId);
  const capacity = opts.fuelCapacityLiters ?? definition?.fuelCapacityLiters ?? (v.bike ? 15 : v.monster ? 90 : v.tank ? 500 : 55);
  v.fuelCapacityLiters = Number.isFinite(capacity) && capacity > 0 ? capacity : 55;
  v.fuelLiters = Number.isFinite(opts.fuelLiters)
    ? Math.max(0, Math.min(v.fuelCapacityLiters, opts.fuelLiters)) : v.fuelCapacityLiters;
  v.fuelType = definition?.fuelType ?? (v.tank ? 'diesel' : 'petrol');
}

export function consumeFuel(v, dt, throttle, boosting = false) {
  if (v.dead || v.refuelling) return;
  const rate = (v.bike ? .035 : v.monster ? .16 : .09);
  v.fuelLiters = Math.max(0, v.fuelLiters - Math.max(0, dt) *
    (.003 + rate * Math.min(1, Math.abs(throttle)) * (boosting ? 1.7 : 1)));
}

export const FUEL_PRICE = 2; // dollars / litre
export const FUEL_RATE = 4; // litres / second
export function refillVehicle(v, dt, money) {
  const litres = Math.max(0, Math.min(v.fuelCapacityLiters - v.fuelLiters,
    FUEL_RATE * Math.max(0, dt), Math.max(0, money) / FUEL_PRICE));
  v.fuelLiters = Math.min(v.fuelCapacityLiters, v.fuelLiters + litres);
  return { litres, money: Math.max(0, money - litres * FUEL_PRICE) };
}

export function describeVehicle(v) {
  if (!v) return null;
  return { modelId: v.modelId, bike: !!v.bike, monster: !!v.monster,
    color: v.paintColor || '#' + (v.mesh.children[0]?.material?.color?.getHexString() || '3d6b8f'),
    accel: v.accel, top: v.top, rad: v.rad,
    fuelCapacityLiters: v.fuelCapacityLiters, fuelLiters: v.fuelLiters };
}
