import test from 'node:test';
import assert from 'node:assert/strict';
import { addUploadMetrics, classifyWebGLUpload } from '../scripts/inkbox-g2-h21-upload-metrics.mjs';

test('counts a complete TypedArray buffer upload exactly', () => {
  const result = classifyWebGLUpload('bufferData', [0x8892, new Uint8Array(12), 0x88e4]);
  assert.equal(result.bufferUploadBytesKnown, 12);
  assert.equal(result.uploadSourceBytesUpperBound, 12);
  assert.equal(result.uploadUnknownByteCalls, 0);
});

test('uses only a TypedArray subview range for a complete upload', () => {
  const result = classifyWebGLUpload('bufferData', [0x8892, new Uint8Array(24).subarray(5, 13), 0x88e4]);
  assert.equal(result.bufferUploadBytesKnown, 8);
  assert.equal(result.uploadSourceBytesUpperBound, 8);
});

test('decodes WebGL2 bufferSubData offset and length in typed-array elements', () => {
  const result = classifyWebGLUpload('bufferSubData', [0x8892, 16, new Uint16Array(10), 2, 3]);
  assert.equal(result.bufferUploadBytesKnown, 6);
  assert.equal(result.uploadSourceBytesUpperBound, 6);
});

test('treats numeric bufferData as allocation capacity, not upload bytes', () => {
  const result = classifyWebGLUpload('bufferData', [0x8892, 4096, 0x88e4]);
  assert.equal(result.bufferUploadBytesKnown, 0);
  assert.equal(result.bufferAllocationBytesKnown, 4096);
  assert.equal(result.uploadUnknownByteCalls, 0);
});

test('keeps uncompressed texture input as an upper bound when pixel layout is unknown', () => {
  const pixels = new Uint8Array(64).subarray(8, 40);
  const result = classifyWebGLUpload('texSubImage2D', [0x0de1, 0, 0, 0, 2, 2, 0x1908, 0x1401, pixels]);
  assert.equal(result.textureUploadBytesKnown, 0);
  assert.equal(result.uploadSourceBytesUpperBound, 32);
  assert.equal(result.uploadUnknownByteCalls, 1);
});

test('marks opaque texture sources and PBO-style offsets unknown', () => {
  const opaqueTexture = classifyWebGLUpload('texImage2D', [0x0de1, 0, 0x1908, 0x1908, 0x1401, { width: 2, height: 2 }]);
  const pboOffset = classifyWebGLUpload('texSubImage2D', [0x0de1, 0, 0, 0, 2, 2, 0x1908, 0x1401, 128]);
  assert.equal(opaqueTexture.uploadUnknownByteCalls, 1);
  assert.equal(pboOffset.uploadUnknownByteCalls, 1);
});

test('aggregates categorized upload counters by API family', () => {
  const row = {};
  addUploadMetrics(row, classifyWebGLUpload('bufferData', [0x8892, new Uint8Array(4), 0x88e4]));
  addUploadMetrics(row, classifyWebGLUpload('texImage2D', [0x0de1, 0, 0x1908, 0x1908, 0x1401, { width: 2, height: 2 }]));
  assert.equal(row.bufferUploadCalls, 1);
  assert.equal(row.textureUploadCalls, 1);
  assert.equal(row.bufferUploadBytesKnown, 4);
  assert.equal(row.uploadUnknownByteCalls, 1);
});
