// Static map environment (ground, pits, set pieces, decor). Built once per map and cached, so editing obstacles stays instant.
import { THREE, CANNON, GROUP, ALL, M, S, mat, boxGeo, rng } from './engine.js';

// ---------- procedural textures ----------
const texCache = {};
export function canvasTex(key, w, h, draw, rep) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(...rep);
  return (texCache[key] = t);
}
function noise(g, w, h, n, base, amp, sz = 2, tint = [0, 0, 4]) { const R = rng(7); for (let i = 0; i < n; i++) { const v = base + R() * amp; g.fillStyle = `rgb(${v + tint[0]},${v + tint[1]},${v + tint[2]})`; g.fillRect(R() * w, R() * h, sz, sz); } }
const chk = (g, w, h, a, b) => { g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2); };
const GROUND_TEX = {
  grass: () => canvasTex('grass', 256, 256, (g, w, h) => { chk(g, w, h, '#5f8f3c', '#6a9b44'); noise(g, w, h, 1800, 70, 60, 2, [-40, 30, -50]); g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h); }, [140, 160]),
  sand: () => canvasTex('sand', 256, 256, (g, w, h) => { chk(g, w, h, '#d9b676', '#e0bf80'); const R = rng(3); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(150,110,50,${R() * .22})`; g.fillRect(R() * w, R() * h, 2, 2); } g.strokeStyle = 'rgba(120,80,30,.1)'; g.strokeRect(0, 0, w, h); }, [140, 160]),
  snow: () => canvasTex('snow', 256, 256, (g, w, h) => { chk(g, w, h, '#eef4fa', '#e1ebf5'); noise(g, w, h, 600, 220, 30, 2, [-10, -4, 0]); g.strokeStyle = 'rgba(120,160,210,.22)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h); }, [140, 160]),
  moon: () => canvasTex('moon', 256, 256, (g, w, h) => { g.fillStyle = '#8b8b90'; g.fillRect(0, 0, w, h); noise(g, w, h, 2200, 80, 80, 3); const R = rng(9); for (let i = 0; i < 6; i++) { const x = R() * w, y = R() * h, r = 10 + R() * 26; g.strokeStyle = 'rgba(40,40,46,.5)'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); } }, [140, 160]),
  concrete: () => canvasTex('conc', 256, 256, (g, w, h) => { g.fillStyle = '#9a9a96'; g.fillRect(0, 0, w, h); noise(g, w, h, 1800, 110, 70, 3); g.strokeStyle = 'rgba(40,40,40,.45)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h); }, [30, 30]),
  neon: () => canvasTex('neon', 256, 256, (g, w, h) => { g.fillStyle = '#0b0b16'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ff2fb4'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2); g.strokeStyle = 'rgba(40,220,255,.4)'; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke(); }, [140, 160]),
  skate: () => canvasTex('skate', 256, 256, (g, w, h) => { chk(g, w, h, '#8d93a0', '#9aa1ae'); noise(g, w, h, 1500, 120, 60, 3); g.strokeStyle = 'rgba(255,120,30,.5)'; g.lineWidth = 4; g.strokeRect(0, 0, w, h); }, [40, 40]),
  canyon: () => canvasTex('canyon', 256, 256, (g, w, h) => { chk(g, w, h, '#b8643a', '#c3703f'); noise(g, w, h, 2000, 110, 90, 3, [40, 0, -30]); }, [140, 160]),
  dirt: () => canvasTex('dirt', 256, 256, (g, w, h) => { chk(g, w, h, '#8a6a46', '#94724c'); noise(g, w, h, 2400, 90, 80, 3, [30, 10, -10]); }, [140, 160]),
  candy: () => canvasTex('candy', 256, 256, (g, w, h) => { chk(g, w, h, '#ffb8dc', '#b8ffe6'); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h); }, [140, 160]),
  basalt: () => canvasTex('basalt', 256, 256, (g, w, h) => { g.fillStyle = '#2b2624'; g.fillRect(0, 0, w, h); noise(g, w, h, 2500, 30, 50, 3, [10, 0, 0]); const R = rng(4); g.strokeStyle = 'rgba(255,90,20,.35)'; g.lineWidth = 2; for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(R() * w, R() * h); g.lineTo(R() * w, R() * h); g.stroke(); } }, [90, 100]),
  wood: () => canvasTex('wood', 256, 256, (g, w, h) => { g.fillStyle = '#c89a62'; g.fillRect(0, 0, w, h); const R = rng(8); for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(${90 + R() * 40},${50 + R() * 30},20,.28)`; g.fillRect(i * w / 12, 0, w / 12 - 2, h); } noise(g, w, h, 800, 120, 40, 2, [30, 10, -30]); }, [8, 60]),
};
export const roadTex = neon => canvasTex(neon ? 'roadN' : 'road', 256, 512, (g, w, h) => {
  g.fillStyle = neon ? '#15151f' : '#3a3b40'; g.fillRect(0, 0, w, h); noise(g, w, h, 4000, 40, 40);
  g.fillStyle = neon ? '#2fe6ff' : '#e8e8e8'; g.fillRect(6, 0, 7, h); g.fillRect(w - 13, 0, 7, h);
  g.fillStyle = neon ? '#ff2fb4' : '#f0c030'; g.fillRect(w / 2 - 3, 0, 6, h * 0.5);
}, [1, 40]);
export const concreteTex = () => canvasTex('concB', 128, 128, (g, w, h) => { g.fillStyle = '#9b9b96'; g.fillRect(0, 0, w, h); noise(g, w, h, 700, 120, 60, 3); g.strokeStyle = 'rgba(60,60,60,.5)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2); });
export const hazardTex = () => canvasTex('haz', 128, 128, (g, w, h) => { g.fillStyle = '#f2b81c'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1a1a'; for (let i = -4; i < 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 16, 0); g.lineTo(i * 32 + 16 + h, h); g.lineTo(i * 32 + h, h); g.fill(); } });
export const boostTex = () => canvasTex('boost', 128, 256, (g, w, h) => { g.fillStyle = '#062a12'; g.fillRect(0, 0, w, h); g.strokeStyle = '#4dff7c'; g.lineWidth = 14; g.lineCap = 'round'; for (let i = 0; i < 3; i++) { const y = 40 + i * 70; g.beginPath(); g.moveTo(20, y + 38); g.lineTo(w / 2, y); g.lineTo(w - 20, y + 38); g.stroke(); } });
const windowTex = () => canvasTex('win', 128, 256, (g, w, h) => { g.fillStyle = '#10121c'; g.fillRect(0, 0, w, h); const R = rng(5); for (let y = 6; y < h; y += 14) for (let x = 6; x < w; x += 14) { if (R() < 0.45) { g.fillStyle = R() < 0.5 ? '#ffd27a' : '#7fe3ff'; g.fillRect(x, y, 8, 8); } } });
const trampTex = () => canvasTex('tramp', 128, 128, (g, w, h) => { g.fillStyle = '#1a1a22'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ff4fa8'; g.lineWidth = 8; g.beginPath(); g.arc(64, 64, 52, 0, 7); g.stroke(); g.strokeStyle = '#4fd6ff'; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 28, 0, 7); g.stroke(); });
export { trampTex };

const stat = (hx, hy, hz, x, y, z, q) => {
  const b = new CANNON.Body({ mass: 0, material: M.ground, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) });
  b.position.set(x, y, z); if (q) b.quaternion.copy(q);
  b.collisionFilterGroup = GROUP.STATIC; b.collisionFilterMask = ALL; return b;
};

export class Env {
  constructor(id, map) {
    this.id = id; this.map = map; this.group = new THREE.Group(); this.bodies = []; this.anim = []; this.water = null; this.lava = null;
    this.h = map.h || (() => 0);
    this.R = rng(11);
    this.ground(); this.decor(); this.lampPosts();
    if (this['feature_' + map.feature]) this['feature_' + map.feature]();
    this.group.traverse(o => { if (o.isMesh) { o.matrixAutoUpdate = true; } });
  }
  addBody(b) { b.updateAABB(); this.bodies.push(b); return b; }
  box(hx, hy, hz, x, y, z, material, q, shadow = true) {
    const b = this.addBody(stat(hx, hy, hz, x, y, z, q));
    const m = new THREE.Mesh(boxGeo(hx * 2, hy * 2, hz * 2), material); m.position.set(x, y, z); if (q) m.quaternion.set(q.x, q.y, q.z, q.w);
    m.castShadow = shadow; m.receiveShadow = true; this.group.add(m); return b;
  }

  // ---------------- ground / pits ----------------
  ground() {
    const m = this.map, tex = GROUND_TEX[m.ground]();
    const slab = (z0, z1, top = 0) => {
      const len = z0 - z1, cz = (z0 + z1) / 2;
      const gb = new CANNON.Body({ mass: 0, material: M.ground, shape: new CANNON.Box(new CANNON.Vec3(600, 5, len / 2)) });
      gb.position.set(0, top - 5, cz); gb.collisionFilterGroup = GROUP.GROUND; gb.collisionFilterMask = ALL; this.addBody(gb);
      const t = tex.clone(); t.needsUpdate = true; t.repeat.set(tex.repeat.x, len / 1300 * tex.repeat.y * 1.0);
      const v = new THREE.Mesh(new THREE.PlaneGeometry(1200, len), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, envMapIntensity: 0.15 }));
      v.rotation.x = -Math.PI / 2; v.position.set(0, top - 0.01, cz); v.receiveShadow = true; this.group.add(v);
    };
    const roadStrip = (z0, z1) => {
      const len = z0 - z1, t = roadTex(m.ground === 'neon').clone(); t.needsUpdate = true; t.repeat.set(1, len / 16);
      const r = new THREE.Mesh(new THREE.PlaneGeometry(14, len), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, envMapIntensity: 0.2 }));
      r.rotation.x = -Math.PI / 2; r.position.set(0, 0.005, (z0 + z1) / 2); r.receiveShadow = true; this.group.add(r);
    };
    if (m.pit) {
      const { z0, z1, depth } = m.pit;
      slab(400, z0); slab(z1, -900);
      if (m.road) { roadStrip(60, z0); roadStrip(z1, -600); }
      const rock = mat(m.rock ?? 0x6b5a48, { roughness: 1 });
      for (const z of [z0, z1]) { const f = new THREE.Mesh(boxGeo(1200, depth, 1), rock); f.position.set(0, -depth / 2, z); f.receiveShadow = true; this.group.add(f); }
      const fb = new CANNON.Body({ mass: 0, material: M.ground, shape: new CANNON.Box(new CANNON.Vec3(600, 5, (z0 - z1) / 2 + 20)) });
      fb.position.set(0, -depth - 5, (z0 + z1) / 2); this.addBody(fb);
      const floorMat = m.lavaPit ? new THREE.MeshStandardMaterial({ color: 0x331000, emissive: 0xff5a10, emissiveIntensity: 2.2, roughness: 0.9 }) : new THREE.MeshStandardMaterial({ color: m.pitColor ?? 0x4a4038, roughness: 1 });
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(1200, z0 - z1), floorMat);
      floor.rotation.x = -Math.PI / 2; floor.position.set(0, -depth, (z0 + z1) / 2); floor.receiveShadow = true; this.group.add(floor);
      if (m.lavaPit) { this.lava = { y: -depth, z0, z1 }; this.anim.push(t => { floorMat.emissiveIntensity = 1.8 + Math.sin(t * 2.3) * 0.5; }); }
      if (m.waterY !== undefined) this.makeWater(m.waterY, z0, z1);
    } else {
      slab(400, -900);
      if (m.road) roadStrip(60, -600);
    }
    if (m.road) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.6), new THREE.MeshBasicMaterial({ color: 0xdddddd }));
      line.rotation.x = -Math.PI / 2; line.position.set(0, 0.012, 4); this.group.add(line);
    }
    // world limits
    for (const z of [-898, 398]) this.addBody(stat(600, 40, 2, 0, 35, z));      // invisible world limits
    if (m.walls) {
      const W = m.walls;
      for (const [x, z, hx, hz] of [[0, W, W + 2, 1], [0, -W, W + 2, 1], [W, 0, 1, W], [-W, 0, 1, W]]) {
        const t = concreteTex().clone(); t.needsUpdate = true; t.repeat.set(Math.max(hx, hz) / 3, 1.3);
        this.box(hx, 4, hz, x, 4, z, new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, flatShading: true }));
      }
    }
  }
  makeWater(y, z0, z1) {
    this.water = { y, z0, z1 };
    const t = canvasTex('water', 128, 128, (g, w, h) => { g.fillStyle = '#2a7fc2'; g.fillRect(0, 0, w, h); const R = rng(2); for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(255,255,255,${R() * .25})`; g.lineWidth = 2; g.beginPath(); const x = R() * w, yy = R() * h; g.moveTo(x, yy); g.quadraticCurveTo(x + 12, yy - 5, x + 26, yy); g.stroke(); } }, [60, 60]);
    const wm = new THREE.MeshStandardMaterial({ map: t, color: 0xaad8ff, transparent: true, opacity: 0.82, roughness: 0.08, metalness: 0.2 });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1200, z0 - z1), wm); p.rotation.x = -Math.PI / 2; p.position.set(0, y, (z0 + z1) / 2); this.group.add(p);
    this.anim.push(tt => { t.offset.set(tt * 0.01, tt * 0.015); });
  }

  // ---------------- decor ----------------
  decor() {
    const m = this.map, R = this.R, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const inst = (geo, material, N, place, shadow = true, rotate = false) => {
      const im = new THREE.InstancedMesh(geo, material, N); im.castShadow = shadow; im.frustumCulled = false;
      for (let n = 0; n < N; n++) { const [x, y, z, sc, sy] = place(n); if (rotate) q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28); else q.identity(); m4.compose(p.set(x, y, z), q, s.set(sc, sy ?? sc, sc)); im.setMatrixAt(n, m4); }
      this.group.add(im); return im;
    };
    const sideX = (minX, span) => (R() < 0.5 ? -1 : 1) * (minX + R() * span);
    const zr = () => 60 - R() * 700;
    const open = m.road ? 14 : 45;
    const d = m.decor;
    if (d === 'trees' || d === 'pines') {
      const snow = d === 'pines', pl = []; for (let i = 0; i < 150; i++) pl.push([sideX(open, 160), zr(), 0.7 + R() * 1.1]);
      inst(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6), mat(0x6b4a2c), 150, n => [pl[n][0], 1.1 * pl[n][2], pl[n][1], pl[n][2]]);
      inst(new THREE.ConeGeometry(2.0, 5, 7), mat(snow ? 0xdfeaf0 : 0x2f6b34), 150, n => [pl[n][0], 4.2 * pl[n][2], pl[n][1], pl[n][2]]);
      inst(new THREE.ConeGeometry(1.5, 3.6, 7), mat(snow ? 0xffffff : 0x3b8040), 150, n => [pl[n][0], 6.4 * pl[n][2], pl[n][1], pl[n][2] * 0.9]);
      this.cityBlocks(40, 130, 120, [0x8f9aa8, 0xa89a8f, 0x7c8d9a, 0xb5a98c]);
    } else if (d === 'cacti') {
      const pl = []; for (let i = 0; i < 90; i++) pl.push([sideX(40, 200), zr(), 0.7 + R() * 0.9]);
      inst(new THREE.CylinderGeometry(0.35, 0.4, 3.2, 7), mat(0x3f8a45), 90, n => [pl[n][0], 1.6 * pl[n][2], pl[n][1], pl[n][2]]);
      inst(new THREE.CylinderGeometry(0.2, 0.22, 1.4, 6), mat(0x3f8a45), 90, n => [pl[n][0] + 0.7 * pl[n][2], 2.3 * pl[n][2], pl[n][1], pl[n][2]]);
      inst(new THREE.DodecahedronGeometry(1.4, 0), mat(0xa9845a), 60, n => [sideX(35, 220), 0.6, zr(), 0.5 + R()], true, true);
    } else if (d === 'rocks') {
      inst(new THREE.DodecahedronGeometry(1.6, 0), mat(m.rockCol ?? 0x6e6e74), 130, n => [sideX(40, 260), 0.7, zr(), 0.5 + R() * 2.2], true, true);
    } else if (d === 'mesas') {
      for (let i = 0; i < 26; i++) { const w = 30 + R() * 60, h = 25 + R() * 55, dd = 30 + R() * 60; const me = new THREE.Mesh(boxGeo(w, h, dd), mat(0xb4562c, { roughness: 1 })); me.position.set(sideX(70, 170), h / 2, zr()); me.castShadow = me.receiveShadow = true; this.group.add(me); }
      inst(new THREE.DodecahedronGeometry(1.5, 0), mat(0x9a4a28), 80, n => [sideX(40, 200), 0.6, zr(), 0.5 + R() * 1.4], true, true);
    } else if (d === 'city') {
      const wt = windowTex();
      for (let i = 0; i < 44; i++) {
        const w = 12 + R() * 22, h = 20 + R() * 80, dd = 12 + R() * 22, t = wt.clone(); t.needsUpdate = true; t.repeat.set(w / 12, h / 12);
        const me = new THREE.Mesh(boxGeo(w, h, dd), new THREE.MeshStandardMaterial({ color: 0x20243a, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: m.cityGlow ?? 1.4, map: t, flatShading: true }));
        me.position.set(sideX(m.cityMin ?? 30, 130), h / 2, 60 - R() * 640); this.group.add(me);
      }
    } else if (d === 'palms') {
      const pl = []; for (let i = 0; i < 70; i++) pl.push([sideX(open + 6, 120), 60 - R() * 360, 0.8 + R() * 0.7]);
      inst(new THREE.CylinderGeometry(0.2, 0.32, 5, 6), mat(0x8a6a3c), 70, n => [pl[n][0], 2.5 * pl[n][2], pl[n][1], pl[n][2]]);
      for (let k = 0; k < 4; k++) inst(new THREE.ConeGeometry(2.6, 0.5, 4), mat(0x2f9a4a), 70, n => [pl[n][0] + Math.cos(k * 1.57) * 1.0, 5.2 * pl[n][2], pl[n][1] + Math.sin(k * 1.57) * 1.0, pl[n][2]], true, true);
    } else if (d === 'candy') {
      const cols = [0xff5fa8, 0x5fd6ff, 0xffe24a, 0x8dff6b, 0xb88bff];
      for (let c = 0; c < 5; c++) {
        const pl = []; for (let i = 0; i < 22; i++) pl.push([sideX(open + 8, 200), zr(), 0.8 + R() * 1.4]);
        inst(new THREE.CylinderGeometry(0.2, 0.2, 6, 6), mat(0xffffff), 22, n => [pl[n][0], 3 * pl[n][2], pl[n][1], pl[n][2]], false);
        inst(new THREE.SphereGeometry(2.0, 14, 10), mat(cols[c], { roughness: 0.3, flatShading: false }), 22, n => [pl[n][0], 7 * pl[n][2], pl[n][1], pl[n][2]]);
      }
      inst(new THREE.ConeGeometry(1.8, 3.6, 10), mat(0xff8ad0, { flatShading: false }), 40, n => [sideX(open + 6, 220), 1.8, zr(), 0.6 + R()]);
    } else if (d === 'volcano') {
      const lavaM = new THREE.MeshStandardMaterial({ color: 0x2a1a14, emissive: 0xff5a10, emissiveIntensity: 1.2, roughness: 1 });
      for (let i = 0; i < 7; i++) { const r = 40 + R() * 50, h = 40 + R() * 60; const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), mat(0x2a2220, { roughness: 1 })); cone.position.set(sideX(130, 180), h / 2, -100 - R() * 700); this.group.add(cone); const tip = new THREE.Mesh(new THREE.ConeGeometry(r * 0.18, h * 0.12, 9), lavaM); tip.position.set(cone.position.x, h * 0.95, cone.position.z); this.group.add(tip); }
      inst(new THREE.DodecahedronGeometry(1.6, 0), mat(0x3a3330), 120, n => [sideX(40, 260), 0.7, zr(), 0.5 + R() * 2], true, true);
    }
  }
  cityBlocks(n, minX, span, cols) {
    const bm = cols.map(c => mat(c, { roughness: 0.9 })), R = this.R;
    for (let i = 0; i < n; i++) { const w = 12 + R() * 26, h = 14 + R() * 50, d = 12 + R() * 26, b = new THREE.Mesh(boxGeo(w, h, d), bm[i % bm.length]); b.position.set((R() < 0.5 ? -1 : 1) * (minX + R() * span), h / 2, 60 - R() * 640); b.castShadow = true; this.group.add(b); }
  }
  lampPosts() {
    const m = this.map; if (!m.lamps) return;
    const neon = m.ground === 'neon';
    const lit = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: neon ? 0xff5ad0 : 0xfff0c0, emissiveIntensity: neon ? 3 : 1.6 });
    for (let z = 10; z > -430; z -= 40) for (const sx of [-1, 1]) {
      if (m.pit && z < m.pit.z0 + 10 && z > m.pit.z1 - 10) continue;
      const pole = new THREE.Mesh(boxGeo(0.25, 9, 0.25), mat(0x555a60)); pole.position.set(sx * 10.5, 4.5, z); pole.castShadow = true;
      const lamp = new THREE.Mesh(boxGeo(1.4, 0.2, 0.5), lit); lamp.position.set(sx * 9.8, 9, z); this.group.add(pole, lamp);
    }
  }

  // ---------------- map set pieces ----------------
  feature_stairs() {
    const cm = mat(0xb4b6b2, { roughness: 0.9 });
    this.box(15, 8, 45, 0, 8, 15, cm);                                  // top platform (z 60 .. -30)
    const stepM = [new THREE.MeshStandardMaterial({ color: 0xb9b9b4, roughness: 0.9, flatShading: true }), new THREE.MeshStandardMaterial({ color: 0xa4a49f, roughness: 0.9, flatShading: true })];
    for (let k = 0; k < 40; k++) { const top = 16 - 0.4 * (k + 1); if (top <= 0) break; this.box(15, top / 2, 0.7, 0, top / 2, -30 - 1.4 * k - 0.7, stepM[k % 2]); }
    const rail = mat(0xc03030);
    for (const sx of [-1, 1]) { this.box(0.15, 0.6, 45, sx * 14.9, 16.6, 15, rail); this.box(0.15, 0.5, 30, sx * 14.9, 11.5, -58, rail, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.27)); }
  }
  feature_rooftop() {
    const wt = windowTex(), t = wt.clone(); t.needsUpdate = true; t.repeat.set(8, 9);
    const roofM = mat(0x4a4d55, { roughness: 0.9 });
    this.box(25, 35, 105, 0, 35, -45, new THREE.MeshStandardMaterial({ color: 0x242a3a, map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.9, flatShading: true }));
    this.group.children[this.group.children.length - 1].material.map = t;
    const cap = new THREE.Mesh(boxGeo(50, 0.1, 210), roofM); cap.position.set(0, 70.05, -45); cap.receiveShadow = true; this.group.add(cap);
    const par = mat(0x8d8f96);
    this.box(0.4, 0.7, 105, 25 - 0.4, 70.7, -45, par); this.box(0.4, 0.7, 105, -25 + 0.4, 70.7, -45, par); this.box(25, 0.7, 0.4, 0, 70.7, 60 - 0.4, par);
    for (let i = 0; i < 4; i++) this.box(3, 1.6, 3, (i % 2 ? 1 : -1) * 19, 71.6, 30 - i * 40, mat(0x70747c));   // AC units
    const hp = mat(0xf2c230); const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.1, 24), hp); pad.position.set(0, 70.1, 10); this.group.add(pad);
  }
  feature_bridge() {
    const { z0, z1 } = this.map.pit, len = z0 - z1, cz = (z0 + z1) / 2, steel = mat(0x9aa4b0, { metalness: 0.6, roughness: 0.4 });
    const road = new THREE.MeshStandardMaterial({ map: (() => { const t = roadTex(false).clone(); t.needsUpdate = true; t.repeat.set(1, len / 16); return t; })(), roughness: 0.8 });
    this.box(7, 0.5, len / 2, 0, -0.5, cz, road);
    for (const sx of [-1, 1]) {
      this.box(0.2, 0.6, len / 2, sx * 6.9, 0.7, cz, steel);
      for (let z = z0 - 8; z > z1; z -= 16) { this.box(0.3, 8, 0.3, sx * 7.2, 4, z, steel); }
      this.box(0.2, 0.2, len / 2, sx * 7.2, 8.1, cz, steel);
    }
    for (let z = z0 - 20; z > z1; z -= 40) { const p = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 14, 8), mat(0x80858c)); p.position.set(0, -7.5, z); p.castShadow = true; this.group.add(p); }
  }
  feature_pier() {
    const wood = new THREE.MeshStandardMaterial({ map: GROUND_TEX.wood().clone(), roughness: 0.9 }), z0 = this.map.pier.z0, z1 = this.map.pier.z1, len = z0 - z1, cz = (z0 + z1) / 2;
    wood.map.needsUpdate = true; wood.map.repeat.set(2, len / 4);
    this.box(5, 0.3, len / 2, 0, -0.3, cz, wood);
    for (const sx of [-1, 1]) for (let z = z0 - 4; z > z1; z -= 8) this.box(0.25, 3, 0.25, sx * 4.8, 1.2, z, mat(0x6b4a2c));
    for (const sx of [-1, 1]) for (let z = z0 - 4; z > z1; z -= 8) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 9, 6), mat(0x5a3f26)); p.position.set(sx * 4.6, -4.5, z); this.group.add(p); }
  }
  feature_beach() { this.feature_pier(); }
  feature_skate() {
    const R = this.R, cm = new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.9, flatShading: true });
    const cols = [0xff5a3c, 0x3cb4ff, 0xffd23c]; let i = 0;
    for (const [x, z, hx, hz, h] of [[-30, 20, 6, 6, 1.4], [30, -10, 8, 5, 1.0], [-28, -35, 5, 8, 1.8], [28, 28, 6, 4, 0.8]]) this.box(hx, h / 2, hz, x, h / 2, z, cm);
    for (const [x, z, len, ang] of [[0, -20, 14, 0], [-15, 5, 12, 1.57], [18, -38, 10, 0.4]]) { this.box(len / 2, 0.15, 0.15, x, 0.7, z, mat(cols[i++ % 3], { metalness: 0.7 }), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang)); for (const s of [-1, 1]) this.box(0.12, 0.35, 0.12, x + Math.cos(ang) * s * len / 2.3, 0.35, z - Math.sin(ang) * s * len / 2.3, mat(0x555a60)); }
    // colourful wall stripes
    for (const [x, z, rot] of [[0, 59.1, 0], [0, -59.1, 0]]) { const st = new THREE.Mesh(new THREE.PlaneGeometry(116, 3), new THREE.MeshBasicMaterial({ color: cols[(R() * 3) | 0] })); st.position.set(x, 5, z); st.rotation.y = rot; this.group.add(st); }
  }
  feature_construction() {
    const R = this.R, cols = [0xd04a2a, 0x2a6fd0, 0xe8b020, 0x3a9a5a, 0xb0b0b0];
    for (let i = 0; i < 18; i++) {
      const sx = R() < 0.5 ? -1 : 1, x = sx * (14 + R() * 24), z = 10 - R() * 280, c = mat(cols[(R() * 5) | 0], { roughness: 0.6, metalness: 0.3 });
      this.box(1.3, 1.3, 3, x, 1.3, z, c); if (R() < 0.5) this.box(1.3, 1.3, 3, x, 3.9, z, mat(cols[(R() * 5) | 0], { roughness: 0.6, metalness: 0.3 }));
    }
    const steel = mat(0xe8b020, { metalness: 0.4 });   // crane
    for (const [x, z] of [[-38, -120]]) { const t = new THREE.Mesh(boxGeo(2, 50, 2), steel); t.position.set(x, 25, z); t.castShadow = true; this.group.add(t); const j = new THREE.Mesh(boxGeo(50, 1.5, 1.5), steel); j.position.set(x + 18, 50, z); j.castShadow = true; this.group.add(j); const w = new THREE.Mesh(boxGeo(0.2, 20, 0.2), mat(0x222222)); w.position.set(x + 34, 40, z); this.group.add(w); }
    for (let z = 20; z > -300; z -= 22) for (const sx of [-1, 1]) this.box(1, 0.5, 2.5, sx * 9, 0.5, z, mat(0xe8e8e8));   // jersey barriers (static, off the lane)
  }
  feature_bowling() {
    const R = this.R, wood = new THREE.MeshStandardMaterial({ map: GROUND_TEX.wood().clone(), roughness: 0.35, metalness: 0.1 }); wood.map.needsUpdate = true; wood.map.repeat.set(1.5, 45);
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(14, 700), wood); lane.rotation.x = -Math.PI / 2; lane.position.set(0, 0.01, -300); lane.receiveShadow = true; this.group.add(lane);
    const dark = mat(0x2a1a14, { roughness: 0.6 }), neon = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff2fb4, emissiveIntensity: 3 }), neon2 = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x2fe6ff, emissiveIntensity: 3 });
    for (const sx of [-1, 1]) {
      this.box(0.6, 0.9, 350, sx * 7.6, 0.9, -300, dark);        // gutter walls
      const st = new THREE.Mesh(boxGeo(0.1, 0.12, 700), sx < 0 ? neon : neon2); st.position.set(sx * 7.0, 1.85, -300); this.group.add(st);
    }
    for (let z = 20; z > -420; z -= 20) { const a = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 3), mat(0x5a2a10)); a.rotation.x = -Math.PI / 2; a.position.set(0, 0.03, z); this.group.add(a); }
    this.box(8, 3, 1, 0, 3, -442, dark);                                       // back wall behind the pins
  }
}
