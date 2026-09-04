import test from 'node:test';
import assert from 'node:assert/strict';
import { applyInput, MOVE } from './movement.js';

test('D moves right at yaw zero', () => {
  const p = applyInput({ x: 0, z: 0 }, { right: true, yaw: 0, dt: 1 });
  assert.equal(p.x, MOVE.WALK_SPEED); assert.equal(p.z, 0);
});
test('A and D are exact opposites at any camera yaw', () => {
  const base={x:4,z:-7},yaw=1.234,dt=.25;
  const r=applyInput(base,{right:true,yaw,dt}),l=applyInput(base,{left:true,yaw,dt});
  assert.ok(Math.abs((r.x-base.x)+(l.x-base.x))<1e-10); assert.ok(Math.abs((r.z-base.z)+(l.z-base.z))<1e-10);
});
test('diagonal movement is normalized', () => {
  const p=applyInput({x:0,z:0},{forward:true,right:true,yaw:0,dt:1});
  assert.ok(Math.abs(Math.hypot(p.x,p.z)-MOVE.WALK_SPEED)<1e-10);
});
