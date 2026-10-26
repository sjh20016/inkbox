export class RenderDebug {
  constructor() { this.samples = []; this.sampleTotal = 0; this.metrics = {}; }
  record(dt, renderer, values) {
    if (dt > 0) {
      const sample = dt * 1000;
      this.samples.push(sample);
      this.sampleTotal += sample;
    }
    if (this.samples.length > 120) this.sampleTotal -= this.samples.shift();
    const frameMs = this.sampleTotal / (this.samples.length || 1);
    this.metrics = { fps: frameMs ? 1000 / frameMs : 0, frameMs, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, ...values };
    return this.metrics;
  }
}
