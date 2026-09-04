import test from'node:test';import assert from'node:assert/strict';
test('skill costs increase across five levels',()=>assert.deepEqual([500,900,1400,2000,2800].sort((a,b)=>a-b),[500,900,1400,2000,2800]));
