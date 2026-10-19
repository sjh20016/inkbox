import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MOUSE } from 'three';
import { CameraRig } from '../src/inkbox/render3d/CameraRig.js';

const listeners = new Map();
const documentStub = {
  addEventListener(name, fn) { listeners.set(`doc:${name}`, fn); },
  removeEventListener(name) { listeners.delete(`doc:${name}`); },
};
const canvas = {
  style: {}, ownerDocument: documentStub,
  addEventListener(name, fn) { listeners.set(`canvas:${name}`, fn); },
  removeEventListener(name) { listeners.delete(`canvas:${name}`); },
  getRootNode() { return documentStub; },
};
const coordinates = {
  worldToRender(x, y, z = 0) { return { x, y: z, z: y }; },
  renderToWorld(x, z) { return { x, y: z }; },
};
const rig = new CameraRig(canvas, { w: 100, h: 80 }, coordinates);
assert.equal(rig.controls.mouseButtons.RIGHT, null, 'right mouse must not pan');
assert.equal(rig.controls.mouseButtons.MIDDLE, MOUSE.ROTATE, 'middle mouse rotates');
const initialTarget = rig.controls.target.clone();
rig.moveLocal(0, 1, 1);
const forwardDelta = rig.controls.target.clone().sub(initialTarget);
assert(forwardDelta.length() > 0, 'forward input moves camera target');
const afterForward = rig.controls.target.clone();
rig.moveLocal(1, 0, 1);
const rightDelta = rig.controls.target.clone().sub(afterForward);
assert(Math.abs(forwardDelta.dot(rightDelta)) < 1e-6, 'camera-relative forward and right are perpendicular');
assert(Math.abs(rightDelta.length() - forwardDelta.length()) < 1e-6, 'forward and right have equal normal speed');
const beforeFast = rig.controls.target.clone();
rig.moveLocal(0, 1, 1, true);
const fastDistance = rig.controls.target.distanceTo(beforeFast);
assert(fastDistance > forwardDelta.length() * 2, 'Shift speed multiplier is active');
rig.dispose();

const adapter = await readFile(new URL('../src/inkbox/render3d/Render3DAdapter.js', import.meta.url), 'utf8');
assert.match(adapter, /keyup'\s*,\s*e\s*=>\s*\{\s*this\.heldCameraKeys\.delete/);
assert.match(adapter, /input, textarea, select, \[contenteditable\]/);
assert.match(adapter, /hit\(e\)\s*\{[^}]*this\.renderer\.pick\(/s, 'click picking remains fresh');
assert.match(adapter, /hoverHit\(clientX, clientY\)/);
assert.match(adapter, /instanceMatrix\?\.version/);
assert.match(adapter, /contentGeometry/);
console.log('G26 controls CPU checks passed: mouse map, camera-relative movement, Shift speed, key cleanup, editable targets, fresh click and geometry-aware hover cache.');
