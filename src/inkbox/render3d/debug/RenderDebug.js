export class RenderDebug {
  constructor() { this.samples = []; this.metrics = {}; }
  record(dt, renderer, values) {
    if (dt > 0) this.samples.push(dt * 1000);
    if (this.samples.length > 120) this.samples.shift();
    const frameMs = this.samples.reduce((a, b) => a + b, 0) / (this.samples.length || 1);
    this.metrics = { fps: frameMs ? 1000 / frameMs : 0, frameMs, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, ...values };
    return this.metrics;
  }
}
