import test from 'node:test';import assert from 'node:assert/strict';import{applyArmor}from'../game3d/src/inventory.js';
test('armor blocks 65 percent and depletes',()=>assert.deepEqual(applyArmor(100,20),{armor:87,damage:7}));
test('damage passes through after armor runs out',()=>assert.deepEqual(applyArmor(5,20),{armor:0,damage:15}));
