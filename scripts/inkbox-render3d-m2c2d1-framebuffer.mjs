// Pure CPU analysis of actual gl.readPixels bytes. Serializable into the page.
// Texture diagnostics use a fixed 2x2 box downsample, linear luminance [0,1].
// They describe this framebuffer, never judge artistic quality.
export function analyzeFramebuffer(buf, W, H, paper) {
  if (W < 6 || H < 6 || buf.length !== W * H * 4) throw Error('invalid framebuffer');
  const linear = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const pr = parseInt(paper.slice(1, 3), 16), pg = parseInt(paper.slice(3, 5), 16), pb = parseInt(paper.slice(5, 7), 16);
  const lstar = []; let sat = 0, paperN = 0, dark30 = 0, dark20 = 0;
  // Keep legacy tonal sampling identical (every second framebuffer pixel).
  for (let i = 0; i < buf.length; i += 8) {
    const R = buf[i], G = buf[i + 1], B = buf[i + 2];
    const Y = .2126 * linear(R) + .7152 * linear(G) + .0722 * linear(B);
    const L = Y > .008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
    lstar.push(L); dark30 += L <= 30; dark20 += L < 20;
    const max = Math.max(R, G, B), min = Math.min(R, G, B);
    sat += max ? (max - min) / max : 0;
    paperN += Math.max(Math.abs(R - pr), Math.abs(G - pg), Math.abs(B - pb)) < 23;
  }
  const w = Math.floor(W / 2), h = Math.floor(H / 2), luminance = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let total = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const i = ((2 * y + dy) * W + 2 * x + dx) * 4;
      total += .2126 * linear(buf[i]) + .7152 * linear(buf[i + 1]) + .0722 * linear(buf[i + 2]);
    }
    luminance[y * w + x] = total / 4;
  }
  let high = 0, contrast = 0, edges = 0, lowSum = 0, lowSquared = 0, n = 0;
  const edgeThreshold = .08; // normalized Sobel magnitude; diagnostic definition, not gate
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const at = (dx, dy) => luminance[(y + dy) * w + x + dx];
    let mean = 0, square = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const v = at(dx, dy); mean += v; square += v * v;
    }
    mean /= 9;
    high += Math.abs(at(0, 0) - mean);
    contrast += Math.sqrt(Math.max(0, square / 9 - mean * mean));
    const gx = -at(-1, -1) + at(1, -1) - 2 * at(-1, 0) + 2 * at(1, 0) - at(-1, 1) + at(1, 1);
    const gy = -at(-1, -1) - 2 * at(0, -1) - at(1, -1) + at(-1, 1) + 2 * at(0, 1) + at(1, 1);
    edges += Math.hypot(gx, gy) / 4 > edgeThreshold;
    lowSum += mean; lowSquared += mean * mean; n++;
  }
  lstar.sort((a, b) => a - b);
  const pct = q => lstar[Math.min(lstar.length - 1, Math.floor(lstar.length * q))];
  return { bufferSize: [W, H], samples: lstar.length, lstarP2: pct(.02), lstarP98: pct(.98), lstarSpan: pct(.98) - pct(.02),
    darkRatioL30: dark30 / lstar.length, darkRatioL20: dark20 / lstar.length, nearPaperRatio: paperN / lstar.length, meanSaturation: sat / lstar.length,
    localContrast: contrast / n, edgeDensity: edges / n, highFreqEnergy: high / n,
    lowFreqEnergy: Math.sqrt(Math.max(0, lowSquared / n - (lowSum / n) ** 2)),
    textureAnalysis: { downsample: '2x2 linear-luminance box', size: [w, h], samples: n, neighbour: '3x3',
      localContrast: 'mean 3x3 standard deviation', highFreqEnergy: 'mean abs(center - 3x3 mean)',
      lowFreqEnergy: 'standard deviation of 3x3 means', edgeOperator: 'Sobel / 4', edgeThreshold, units: 'linear luminance [0,1]' } };
}

export function framebufferBody(paper) {
  return `const r=window.inkbox.render3d.renderer,gl=r.gpu.getContext();r.render();
    const W=gl.drawingBufferWidth,H=gl.drawingBufferHeight,buf=new Uint8Array(W*H*4);
    gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,buf);
    const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('framebuffer read GL error '+error);
    return (${analyzeFramebuffer.toString()})(buf,W,H,${JSON.stringify(paper)});`;
}
