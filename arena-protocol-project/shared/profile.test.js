import test from'node:test';import assert from'node:assert/strict';import{createProfile}from'../game3d/src/profile.js';
test('profile saves and restores preferences',()=>{const m=new Map(),s={getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};const a=createProfile(s);a.set('sensitivity',1.8);assert.equal(createProfile(s).data.sensitivity,1.8);});
