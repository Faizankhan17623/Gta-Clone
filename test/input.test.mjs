import test from 'node:test';
import assert from 'node:assert/strict';
import { namesFor } from '../js/input.js';

test('D key is normalized from modern and legacy keyboard events', () => {
  assert.ok(namesFor({ code: 'KeyD', key: 'd' }).includes('KeyD'));
  assert.ok(namesFor({ keyCode: 68 }).includes('KeyD'));
  assert.ok(namesFor({ which: 68 }).includes('KeyD'));
});
