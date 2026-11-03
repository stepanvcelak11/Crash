// Particles (sparks, smoke, dust, glass, fire), synthesized audio and a replayable FX event log.
import { THREE, scene, camera, view, S, bloomPass } from './engine.js';

class PSys {
  constructor(n, blending, sharp) {
    this.n = n; this.i = 0;
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
    this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n);
    this.c0 = new Float32Array(n * 4); this.c1 = new Float32Array(n * 4);
    this.grav = new Float32Array(n); this.drag = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending, fog: false,
      uniforms: { scale: { value: 600 }, sharp: { value: sharp ? 1 : 0 } },
      vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC; uniform float scale;
        void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = size*scale/max(0.1,-mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying vec4 vC; uniform float sharp;
        void main(){ float d = length(gl_PointCoord-.5)*2.; float a = sharp>.5 ? step(d,1.) : smoothstep(1.,.15,d);
          gl_FragColor = vec4(vC.rgb, vC.a*a); if(gl_FragColor.a<0.01) discard; }`,
    });
    this.pts = new THREE.Points(g, this.mat);
    this.pts.frustumCulled = false;
    scene.add(this.pts);
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, grav, drag) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    for (let k = 0; k < 4; k++) { this.c0[i * 4 + k] = c0[k]; this.c1[i * 4 + k] = c1[k]; }
    this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    const sc = view.h / (2 * Math.tan(camera.fov * Math.PI / 360));
    this.mat.uniforms.scale.value = sc * renderScale();
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.max[i];
      const d = Math.exp(-this.drag[i] * dt);
      this.v[i * 3] *= d; this.v[i * 3 + 1] = this.v[i * 3 + 1] * d - this.grav[i] * dt; this.v[i * 3 + 2] *= d;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      if (this.grav[i] > 0 && this.p[i * 3 + 1] < 0.02) { this.p[i * 3 + 1] = 0.02; this.v[i * 3 + 1] *= -0.3; this.v[i * 3] *= 0.7; this.v[i * 3 + 2] *= 0.7; }
      for (let k = 0; k < 4; k++) this.col[i * 4 + k] = this.c0[i * 4 + k] + (this.c1[i * 4 + k] - this.c0[i * 4 + k]) * t;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
    }
    const g = this.pts.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
  }
  clear() { this.life.fill(0); }
}
function renderScale() { return 1; }

const sparks = new PSys(900, THREE.AdditiveBlending, false);
const fire = new PSys(500, THREE.AdditiveBlending, false);
const smoke = new PSys(900, THREE.NormalBlending, false);
const dust = new PSys(700, THREE.NormalBlending, false);
const glass = new PSys(500, THREE.NormalBlending, true);
const systems = [sparks, fire, smoke, dust, glass];

export function updateParticles(dt) { for (const s of systems) s.update(dt); }
export function clearParticles() { for (const s of systems) s.clear(); }

const R = (a = 1) => (Math.random() - 0.5) * 2 * a;

// ---------- event log (for replay) ----------
export const fxLog = [];
export const fxState = { logging: false };
let lastBoom = 0;

// type: impact | scrape | smoke | explosion | glass | fracture | pop | debris
export function fx(type, x, y, z, a = 1, extra = '') {
  if (fxState.logging) fxLog.push({ t: S.time, type, x, y, z, a, extra });
  doFx(type, x, y, z, a, extra);
}

function doFx(type, x, y, z, a, extra) {
  switch (type) {
    case 'impact': {
      const n = Math.min(40, Math.floor(6 + a * 1.4));
      for (let i = 0; i < n; i++) sparks.spawn(x, y, z, R(5 + a * .3), Math.random() * (3 + a * .35), R(5 + a * .3), 0.35 + Math.random() * 0.5, 0.09, 0.02, [3, 1.9, 0.6, 1], [1.5, 0.3, 0.05, 0], 14, 0.4);
      for (let i = 0; i < Math.min(22, 4 + a); i++) dust.spawn(x, Math.max(0.2, y), z, R(2.5), 0.5 + Math.random() * 2, R(2.5), 1.3 + Math.random(), 0.8, 2.8 + a * .06, [0.55, 0.5, 0.42, 0.55], [0.6, 0.55, 0.5, 0], -0.4, 1.4);
      sfx('thud', Math.min(1, a / 25));
      break;
    }
    case 'scrape': {
      for (let i = 0; i < 4; i++) sparks.spawn(x + R(.5), 0.08, z + R(.5), R(3), 1 + Math.random() * 3, R(3), 0.3 + Math.random() * 0.3, 0.07, 0.01, [3, 2, 0.7, 1], [1.2, 0.3, 0.05, 0], 14, 0.3);
      dust.spawn(x, 0.2, z, R(1), 0.6, R(1), 0.9, 0.5, 1.8, [0.6, 0.55, 0.5, 0.35], [0.6, 0.55, 0.5, 0], -0.3, 1.5);
      break;
    }
    case 'smoke': {
      smoke.spawn(x + R(.2), y, z + R(.2), R(.5), 1.6 + Math.random(), R(.5), 2.2 + Math.random(), 0.5, 2.6, [0.08, 0.08, 0.08, 0.6], [0.2, 0.2, 0.2, 0], -0.5, 0.6);
      break;
    }
    case 'tire': {
      smoke.spawn(x + R(.3), 0.2, z + R(.3), R(1), 0.8, R(1), 1.6, 0.5, 2.2, [0.15, 0.15, 0.15, 0.5], [0.3, 0.3, 0.3, 0], -0.4, 0.8);
      break;
    }
    case 'explosion': {
      for (let i = 0; i < 80; i++) { const d = randDir(); const sp = 4 + Math.random() * 16 * a; fire.spawn(x, y + 0.3, z, d[0] * sp, Math.abs(d[1]) * sp * 0.9, d[2] * sp, 0.4 + Math.random() * 0.7, 1.6, 4.5, [4, 2.4, 0.6, 1], [0.8, 0.1, 0.0, 0], -1.5, 2.2); }
      for (let i = 0; i < 70; i++) { const d = randDir(); const sp = 5 + Math.random() * 20; sparks.spawn(x, y + 0.3, z, d[0] * sp, Math.abs(d[1]) * sp + 4, d[2] * sp, 0.6 + Math.random() * 0.9, 0.12, 0.02, [4, 3, 1, 1], [2, 0.5, 0.1, 0], 14, 0.2); }
      for (let i = 0; i < 40; i++) { const d = randDir(); const sp = 2 + Math.random() * 7; smoke.spawn(x, y + 0.5, z, d[0] * sp, Math.abs(d[1]) * sp + 2, d[2] * sp, 2.5 + Math.random() * 2, 1.4, 6, [0.05, 0.05, 0.05, 0.75], [0.25, 0.25, 0.25, 0], -1, 1.0); }
      for (let i = 0; i < 40; i++) { const d = randDir(); dust.spawn(x, 0.3, z, d[0] * 9, 0.5 + Math.random() * 2, d[2] * 9, 1.8, 1.5, 5, [0.5, 0.45, 0.4, 0.6], [0.6, 0.55, 0.5, 0], 0, 1.8); }
      bloomPass.strength = 1.6;
      sfx('boom', 1);
      break;
    }
    case 'glass': {
      for (let i = 0; i < 70; i++) glass.spawn(x + R(.6), y + R(.2), z + R(.8), R(5), Math.random() * 5, R(5), 1.4 + Math.random(), 0.07, 0.05, [0.7, 0.9, 1, 0.9], [0.7, 0.9, 1, 0], 14, 0.2);
      sfx('glass', 1);
      break;
    }
    case 'debris': {
      for (let i = 0; i < Math.min(30, 8 + a); i++) dust.spawn(x + R(1.5), y + Math.random() * 1.5, z + R(.5), R(3), Math.random() * 3, R(3), 1.5 + Math.random(), 0.9, 3.2, [0.62, 0.6, 0.57, 0.7], [0.65, 0.63, 0.6, 0], -0.2, 1.3);
      sfx('crumble', 1);
      break;
    }
    case 'fracture': {
      for (let i = 0; i < 12; i++) sparks.spawn(x, y, z, R(4), Math.random() * 4, R(4), 0.4, 0.09, 0.02, [3, 0.4, 0.2, 1], [1.5, 0.1, 0.05, 0], 12, 0.3);
      sfx('crack', 1);
      if (typeof onFractureFx === 'function') onFractureFx(extra);
      break;
    }
  }
}
function randDir() { const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u); return [s * Math.cos(t), u, s * Math.sin(t)]; }
let onFractureFx = null;
export function setFractureFxHandler(f) { onFractureFx = f; }

// ---------- audio ----------
let ac = null, master = null, engine = null;
export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(master); o.start(); o2.start();
    engine = { o, o2, g, f };
  } catch (e) { ac = null; }
}
export function setMuted(m) { S.muted = m; if (master) master.gain.value = m ? 0 : 0.5; }
export function engineSound(speed, on) {
  if (!ac || !engine) return;
  const t = ac.currentTime;
  engine.o.frequency.setTargetAtTime(40 + speed * 3.2, t, 0.1);
  engine.o2.frequency.setTargetAtTime(20 + speed * 1.6, t, 0.1);
  engine.f.frequency.setTargetAtTime(300 + speed * 18, t, 0.1);
  engine.g.gain.setTargetAtTime(on ? 0.07 : 0, t, 0.2);
}
function noiseBuf(len) {
  const b = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function sfx(kind, vol) {
  if (!ac || S.muted) return;
  const now = ac.currentTime;
  if (kind === 'boom' && now - lastBoom < 0.1) return; if (kind === 'boom') lastBoom = now;
  const src = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
  src.buffer = noiseBuf(kind === 'boom' ? 1.6 : 0.5);
  f.type = 'lowpass';
  let dur = 0.3, fq = 800, v = 0.5 * vol;
  if (kind === 'thud') { fq = 300 + 700 * (1 - vol); dur = 0.25; v = 0.15 + 0.7 * vol; }
  if (kind === 'boom') { fq = 700; dur = 1.5; v = 1.2; f.frequency.setValueAtTime(1200, now); f.frequency.exponentialRampToValueAtTime(60, now + dur); }
  if (kind === 'glass') { f.type = 'highpass'; fq = 3500; dur = 0.45; v = 0.35; }
  if (kind === 'crack') { f.type = 'bandpass'; fq = 1800; dur = 0.12; v = 0.8; }
  if (kind === 'crumble') { fq = 500; dur = 0.7; v = 0.5; }
  if (kind !== 'boom') f.frequency.value = fq;
  g.gain.setValueAtTime(v, now); g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(now); src.stop(now + dur + 0.05);
}
export function beep(freq = 660, dur = 0.08) {
  if (!ac || S.muted) return;
  const o = ac.createOscillator(), g = ac.createGain(), now = ac.currentTime;
  o.frequency.value = freq; o.type = 'square'; g.gain.setValueAtTime(0.06, now); g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  o.connect(g); g.connect(master); o.start(now); o.stop(now + dur);
}
