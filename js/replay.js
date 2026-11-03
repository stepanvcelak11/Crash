// Time-line recorder (30 Hz, interpolated) + replay scrubber with slow motion.
import { THREE, entities, S } from './engine.js';
import { fxLog } from './fx.js';

const HZ = 30, STRIDE = 8;
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

export const rec = {
  data: null, n: 0, frames: 0, max: 0, acc: 0, duration: 0,
  start(maxSeconds = 70) {
    this.n = entities.length; this.max = Math.floor(maxSeconds * HZ);
    this.data = new Float32Array(this.max * this.n * STRIDE);
    this.frames = 0; this.acc = 0; this.duration = 0;
    this.capture();
  },
  /** call once per physics step (dt) */
  tick(dt) {
    this.acc += dt;
    while (this.acc >= 1 / HZ - 1e-6) { this.acc -= 1 / HZ; this.capture(); }
  },
  capture() {
    if (!this.data || this.frames >= this.max) return;
    const o = this.frames * this.n * STRIDE, d = this.data;
    for (let i = 0; i < this.n; i++) {
      const e = entities[i], b = e.body, k = o + i * STRIDE;
      d[k] = e.mesh && e.mesh.visible ? 1 : 0;
      d[k + 1] = b.position.x; d[k + 2] = b.position.y; d[k + 3] = b.position.z;
      d[k + 4] = b.quaternion.x; d[k + 5] = b.quaternion.y; d[k + 6] = b.quaternion.z; d[k + 7] = b.quaternion.w;
    }
    this.frames++; this.duration = (this.frames - 1) / HZ;
  },
  /** apply interpolated state at time t to all entity meshes */
  apply(t) {
    if (!this.data || this.frames < 1) return;
    const f = Math.max(0, Math.min(this.frames - 1, t * HZ));
    const i0 = Math.floor(f), i1 = Math.min(this.frames - 1, i0 + 1), a = f - i0;
    const d = this.data, n = this.n;
    for (let i = 0; i < n; i++) {
      const e = entities[i]; if (!e.mesh) continue;
      const k0 = i0 * n * STRIDE + i * STRIDE, k1 = i1 * n * STRIDE + i * STRIDE;
      const vis = d[k0] > 0.5;
      e.mesh.visible = vis;
      if (!vis) continue;
      e.mesh.position.set(d[k0 + 1] + (d[k1 + 1] - d[k0 + 1]) * a, d[k0 + 2] + (d[k1 + 2] - d[k0 + 2]) * a, d[k0 + 3] + (d[k1 + 3] - d[k0 + 3]) * a);
      _q1.set(d[k0 + 4], d[k0 + 5], d[k0 + 6], d[k0 + 7]); _q2.set(d[k1 + 4], d[k1 + 5], d[k1 + 6], d[k1 + 7]);
      e.mesh.quaternion.copy(_q1).slerp(_q2, a);
    }
  },
};

export const replay = {
  active: false, t: 0, playing: true, speed: 0.5, lastFx: 0, lastDent: -1, car: null,
  begin(car, startAtEnd = true) {
    this.active = true; this.playing = !startAtEnd; this.car = car;
    this.t = startAtEnd ? rec.duration : 0;
    if (!startAtEnd) this.t = 0;
    this.lastFx = this.t; this.lastDent = -1;
  },
  end() { this.active = false; if (this.car) this.car.restoreAt(Infinity); },
  seek(t) {
    this.t = Math.max(0, Math.min(rec.duration, t));
    this.lastFx = this.t - 0.0001;   // don't replay FX when scrubbing
    this.apply();
  },
  apply() {
    rec.apply(this.t);
    if (this.car) {
      const di = this.car.dentLog.findIndex(d => d.t > this.t);
      const key = (di < 0 ? this.car.dentLog.length : di) * 1000 + this.car.parts.filter(p => p.detachFrame <= this.t).length + (this.car.glassFrame <= this.t ? 500 : 0);
      if (key !== this.lastDent) { this.lastDent = key; this.car.restoreAt(this.t); }
    }
  },
  /** returns fx events crossed since last call (forward playback only) */
  step(dt, emit) {
    if (this.playing) {
      const prev = this.t;
      this.t += dt * this.speed;
      if (this.t >= rec.duration) { this.t = rec.duration; this.playing = false; }
      for (const e of fxLog) if (e.t > prev && e.t <= this.t) emit(e);
    }
    this.apply();
  },
};
