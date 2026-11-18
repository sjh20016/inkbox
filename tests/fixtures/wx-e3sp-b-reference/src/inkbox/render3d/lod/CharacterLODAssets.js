import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PIGMENT = Object.freeze({ ink: '#303537', blue: '#697b83', wood: '#79664f',
  cyan: '#9aaea3', skin: '#c9b698', earth: '#918773' });

function colored(geometry, pigment, x = 0, y = 0, z = 0) {
  if (geometry.index) {
    const nonIndexed = geometry.toNonIndexed();
    geometry.dispose();
    geometry = nonIndexed;
  }
  geometry.translate(x, y, z);
  const color = new THREE.Color(PIGMENT[pigment]);
  const values = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let i = 0; i < values.length; i += 3) {
    values[i] = color.r; values[i + 1] = color.g; values[i + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
  return geometry;
}

function combine(parts, name) {
  const geometry = mergeGeometries(parts, false);
  if (!geometry) throw new Error(`Unable to merge ${name} LOD geometry`);
  geometry.name = name;
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  for (const part of parts) part.dispose();
  return geometry;
}

function character(middle, ghost = false) {
  const cloth = ghost ? 'cyan' : 'blue';
  if (!middle) return combine([
    colored(new THREE.CylinderGeometry(0.11, 0.18, 1.35, 4), cloth, 0, 0.79),
    colored(new THREE.TetrahedronGeometry(0.20), ghost ? 'cyan' : 'skin', 0, 1.54),
  ], `Character:${ghost ? 'ghost' : 'cultivator'}:L2`);
  return combine([
    colored(new THREE.CylinderGeometry(0.24, 0.37, 1.25, 6), cloth, 0, 0.72),
    colored(new THREE.IcosahedronGeometry(0.23, 0), ghost ? 'cyan' : 'skin', 0, 1.58),
    colored(new THREE.ConeGeometry(0.23, 0.25, 5), 'ink', 0, 1.88),
  ], `Character:${ghost ? 'ghost' : 'cultivator'}:L1`);
}

function human(middle) {
  return combine(middle ? [
    colored(new THREE.TetrahedronGeometry(0.57), 'earth', 0, 0.68),
    colored(new THREE.TetrahedronGeometry(0.25), 'skin', 0, 1.35),
  ] : [
    colored(new THREE.TetrahedronGeometry(0.49), 'earth', 0, 0.70),
  ], `Character:human:L${middle ? 1 : 2}`);
}

function beast(middle) {
  return combine(middle ? [
    colored(new THREE.BoxGeometry(1.48, 0.58, 0.70), 'wood', 0, 0.60),
  ] : [colored(new THREE.TetrahedronGeometry(0.60).scale(1.65, 0.65, 0.80), 'wood', 0, 0.54)],
  `Character:beast:L${middle ? 1 : 2}`);
}

function wraith(middle) {
  return combine(middle ? [
    colored(new THREE.TetrahedronGeometry(0.59), 'cyan', 0, 0.76),
    colored(new THREE.TetrahedronGeometry(0.24), 'cyan', 0, 1.48),
  ] : [colored(new THREE.TetrahedronGeometry(0.48), 'cyan', 0, 0.82)],
  `Character:wraith:L${middle ? 1 : 2}`);
}

function spirit(middle) {
  return combine([colored(middle ? new THREE.IcosahedronGeometry(0.63, 0) : new THREE.TetrahedronGeometry(0.48), 'cyan',
    0, middle ? 0.72 : 0.44)], `Character:spirit:L${middle ? 1 : 2}`);
}

/** Closed, non-billboard volumes stay visible at every camera yaw. */
export function createCharacterLODGeometries(styles = {}) {
  return Object.fromEntries(['human', 'cultivator', 'beast', 'spirit', 'wraith', 'ghost'].map(cls => {
    const make = middle => cls === 'human' ? human(middle)
      : cls === 'beast' ? beast(middle)
        : cls === 'spirit' ? spirit(middle)
          : cls === 'wraith' ? wraith(middle)
            : character(middle, cls === 'ghost');
    const height = styles[cls === 'ghost' ? 'cultivator' : cls]?.size?.[1];
    const geometries = [make(true), make(false)];
    for (const geometry of geometries) {
      // Keep the existing class height and foot anchor across geometry changes.
      // The source is EntityLayer STYLE, also used for projected pixel selection.
      const box = geometry.boundingBox, span = box.max.y - box.min.y;
      if (Number.isFinite(height) && span > 0) {
        geometry.translate(0, -box.min.y, 0); geometry.scale(1, height / span, 1);
        geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      }
    }
    return [cls, geometries];
  }));
}
