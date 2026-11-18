/**
 * 纯表现层画布：浏览器中返回真实 2D 画布；无 DOM 的 Node 测试中返回无副作用桩，
 * 让装饰层可以被构造（纹理不会上传，也不影响任何模拟 / 拾取 / 存档）。
 */
const gradient = { addColorStop() {} };
const stubContext = new Proxy({}, {
  get(target, key) {
    if (key in target) return target[key];
    if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createPattern') return () => gradient;
    if (key === 'measureText') return () => ({ width: 0 });
    if (key === 'getImageData' || key === 'createImageData') return (x, y, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
    return () => {};
  },
  set(target, key, value) { target[key] = value; return true; },
});
export function makeCanvas(width, height) {
  if (globalThis.OffscreenCanvas) return new OffscreenCanvas(width, height);
  if (globalThis.document?.createElement) return Object.assign(document.createElement('canvas'), { width, height });
  return { width, height, getContext: () => stubContext, stub: true };
}
