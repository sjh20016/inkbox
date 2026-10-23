#!/usr/bin/env node
import assert from 'node:assert/strict';
import { growLabeled, MinHeap } from '../src/inkbox/sim/territory.js';

let checks = 0;
function check(name, fn) { fn(); checks += 1; console.log(`✓ ${name}`); }

function fixture(w, h) {
  const size = w * h;
  return {
    world: {
      w, h, size,
      _terrDist: new Float32Array(size),
      _terrLabel: new Int16Array(size),
      _terrStamp: new Int32Array(size),
      _terrGen: 0,
      _terrHeap: new MinHeap(size),
    },
    costs: new Float32Array(size),
  };
}

check('uniform Float32 cost flood has bounded pushes and deterministic distances', () => {
  const w = 32, h = 32, size = w * h;
  const { world, costs } = fixture(w, h);
  costs.fill(Math.fround(1.1));
  const originalPush = MinHeap.prototype.push;
  let pushes = 0;
  MinHeap.prototype.push = function (...args) {
    pushes += 1;
    assert.ok(pushes <= size * 4, `heap push cap exceeded: ${pushes}`);
    return originalPush.apply(this, args);
  };
  try {
    const first = growLabeled(world, [{ cell: 0, label: 1 }], [0, 100], costs);
    assert.equal(first.visited, size);
    assert.equal(pushes, size);
    const firstDistances = first.dist.slice();
    const firstLabels = first.label.slice();

    pushes = 0;
    const second = growLabeled(world, [{ cell: 0, label: 1 }], [0, 100], costs);
    assert.equal(pushes, size);
    assert.deepEqual(second.dist, firstDistances);
    assert.deepEqual(second.label, firstLabels);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let expected = 0;
        for (let n = 0; n < x + y; n += 1) expected = Math.fround(expected + costs[0]);
        assert.equal(second.dist[y * w + x], expected);
      }
    }
  } finally {
    MinHeap.prototype.push = originalPush;
  }
});

check('flood keeps per-label budgets, impassable terrain, and first-seed ties', () => {
  const { world, costs } = fixture(5, 3);
  costs.fill(Math.fround(1.1));
  for (let y = 0; y < world.h; y += 1) costs[y * world.w + 2] = Infinity;
  costs[world.w + 2] = Math.fround(1.1); // a single pass through the ridge
  const result = growLabeled(world, [
    { cell: 5, label: 1 },
    { cell: 5, label: 2 },
    { cell: 9, label: 2 },
  ], [0, 2.21, 1.11], costs);
  assert.equal(result.label[5], 1);
  assert.equal(result.label[9], 2);
  assert.equal(result.stamp[0], result.gen);
  assert.equal(result.stamp[2], 0);
  assert.equal(result.stamp[14], result.gen);
  assert.equal(result.dist[14], costs[14]);
});

console.log(`\n${checks} territory checks passed`);
