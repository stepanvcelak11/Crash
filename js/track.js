// Map + free-placed obstacles + drawn route. Obstacle behaviours: ramp, boost, mine, oil, wall, piston, block, barrel.
import { THREE, CANNON, GROUP, ALL, M, S, world, addEntity, activateEntity, deactivateEntity, mat, boxGeo, rng, levelGroup, entities } from './engine.js';
import { fx } from './fx.js';

export const OBSTACLES = {
  ramp: { label: 'Můstek', icon: '◢' }, boost: { label: 'Turbo', icon: '»' }, mine: { label: 'Mina', icon: '✹' }, oil: { label: 'Olej', icon: '●' },
  wall: { label: 'Zeď', icon: '▦' }, piston: { label: 'Píst', icon: '▥' }, block: { label: 'Blok', icon: '■' }, barrel: { label: 'Sud', icon: '🛢' },
};
const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
const qYaw = a => new THREE.Quaternion().setFromAxisAngle(Y, a);
const cq = q => new CANNON.Quaternion(q.x, q.y, q.z, q.w);

// ---------- procedural textures ----------
const texCache = {};
function canvasTex(key, w, h, draw, rep) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(...rep);
  return (texCache[key] = t);
}
function noise(g, w, h, n, base, amp, sz = 2) { const R = rng(7); for (let i = 0; i < n; i++) { const v = base + R() * amp; g.fillStyle = `rgb(${v},${v},${v + 4})`; g.fillRect(R() * w, R() * h, sz, sz); } }
const GROUND_TEX = {
  grass: () => canvasTex('grass', 128, 128, (g, w, h) => { g.fillStyle = '#5f8f3c'; g.fillRect(0, 0, w, h); g.fillStyle = '#6a9b44'; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2); g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h); }, [140, 160]),
  sand: () => canvasTex('sand', 128, 128, (g, w, h) => { g.fillStyle = '#d9b676'; g.fillRect(0, 0, w, h); g.fillStyle = '#e0bf80'; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2); const R = rng(3); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(150,110,50,${R() * .25})`; g.fillRect(R() * w, R() * h, 2, 2); } g.strokeStyle = 'rgba(120,80,30,.12)'; g.strokeRect(0, 0, w, h); }, [140, 160]),
  snow: () => canvasTex('snow', 128, 128, (g, w, h) => { g.fillStyle = '#eef4fa'; g.fillRect(0, 0, w, h); g.fillStyle = '#e1ebf5'; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2); g.strokeStyle = 'rgba(120,160,210,.25)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h); }, [140, 160]),
  moon: () => canvasTex('moon', 128, 128, (g, w, h) => { g.fillStyle = '#8b8b90'; g.fillRect(0, 0, w, h); noise(g, w, h, 900, 90, 70, 3); g.strokeStyle = 'rgba(255,255,255,.08)'; g.strokeRect(0, 0, w, h); }, [140, 160]),
  concrete: () => canvasTex('conc', 128, 128, (g, w, h) => { g.fillStyle = '#9a9a96'; g.fillRect(0, 0, w, h); noise(g, w, h, 700, 120, 60, 3); g.strokeStyle = 'rgba(40,40,40,.45)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h); }, [30, 30]),
  neon: () => canvasTex('neon', 128, 128, (g, w, h) => { g.fillStyle = '#0b0b16'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ff2fb4'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2); g.strokeStyle = 'rgba(40,220,255,.35)'; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke(); }, [140, 160]),
};
const roadTex = neon => canvasTex(neon ? 'roadN' : 'road', 256, 512, (g, w, h) => {
  g.fillStyle = neon ? '#15151f' : '#3a3b40'; g.fillRect(0, 0, w, h); noise(g, w, h, 2500, 40, 40);
  g.fillStyle = neon ? '#2fe6ff' : '#e8e8e8'; g.fillRect(6, 0, 7, h); g.fillRect(w - 13, 0, 7, h);
  g.fillStyle = neon ? '#ff2fb4' : '#f0c030'; g.fillRect(w / 2 - 3, 0, 6, h * 0.5);
}, [1, 40]);
const concreteTex = () => canvasTex('concB', 128, 128, (g, w, h) => { g.fillStyle = '#9b9b96'; g.fillRect(0, 0, w, h); noise(g, w, h, 700, 120, 60, 3); g.strokeStyle = 'rgba(60,60,60,.5)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2); });
const hazardTex = () => canvasTex('haz', 128, 128, (g, w, h) => { g.fillStyle = '#f2b81c'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1a1a'; for (let i = -4; i < 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 16, 0); g.lineTo(i * 32 + 16 + h, h); g.lineTo(i * 32 + h, h); g.fill(); } });
const boostTex = () => canvasTex('boost', 128, 256, (g, w, h) => { g.fillStyle = '#062a12'; g.fillRect(0, 0, w, h); g.strokeStyle = '#4dff7c'; g.lineWidth = 14; g.lineCap = 'round'; for (let i = 0; i < 3; i++) { const y = 40 + i * 70; g.beginPath(); g.moveTo(20, y + 38); g.lineTo(w / 2, y); g.lineTo(w - 20, y + 38); g.stroke(); } });
const windowTex = () => canvasTex('win', 128, 256, (g, w, h) => { g.fillStyle = '#10121c'; g.fillRect(0, 0, w, h); const R = rng(5); for (let y = 6; y < h; y += 14) for (let x = 6; x < w; x += 14) { if (R() < 0.45) { g.fillStyle = R() < 0.5 ? '#ffd27a' : '#7fe3ff'; g.fillRect(x, y, 8, 8); } } });

export class Track {
  /** @param map map def  @param objects S.objects  @param path [[x,z]..]  @param sel selected object index */
  constructor(map, objects, path, sel) {
    this.map = map; this.objects = objects;
    this.zones = []; this.mines = []; this.pistons = []; this.breakables = []; this.anim = []; this.hooks = {};
    this.pickers = []; this.editGroup = new THREE.Group(); levelGroup.add(this.editGroup);
    this.pathMesh = null;
    this.buildGround(); this.buildDecor();
    objects.forEach((o, i) => this.buildObject(o, i));
    if (map.endWalls) this.buildEnd();
    this.setPath(path);
    this.setSelected(sel);
  }

  // ---------------- ground ----------------
  buildGround() {
    const m = this.map, tex = GROUND_TEX[m.ground]();
    const gm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    const addGround = (z0, z1, top = 0) => {   // physics + visual slab covering z0 (near) .. z1 (far)
      const len = z0 - z1, cz = (z0 + z1) / 2;
      const gb = new CANNON.Body({ mass: 0, material: M.ground, shape: new CANNON.Box(new CANNON.Vec3(600, 5, len / 2)) });
      gb.position.set(0, top - 5, cz); gb.collisionFilterGroup = GROUP.GROUND; gb.collisionFilterMask = ALL;
      addEntity(gb, null, { kind: 'ground' });
      const t = tex.clone(); t.needsUpdate = true; t.repeat.set(140, len / 8);
      const v = new THREE.Mesh(new THREE.PlaneGeometry(1200, len), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
      v.rotation.x = -Math.PI / 2; v.position.set(0, top - 0.01, cz); v.receiveShadow = true; levelGroup.add(v);
    };
    const roadStrip = (z0, z1) => {
      const len = z0 - z1, t = roadTex(m.ground === 'neon').clone(); t.needsUpdate = true; t.repeat.set(1, len / 16);
      const r = new THREE.Mesh(new THREE.PlaneGeometry(14, len), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
      r.rotation.x = -Math.PI / 2; r.position.set(0, 0.005, (z0 + z1) / 2); r.receiveShadow = true; levelGroup.add(r);
    };
    if (m.pit) {
      const { z0, z1, depth } = m.pit;
      addGround(400, z0); addGround(z1, -900);
      if (m.road) { roadStrip(60, z0); roadStrip(z1, -600); }
      const rock = mat(0x6b5a48, { roughness: 1 });
      for (const [z, s] of [[z0, 1], [z1, -1]]) { const f = new THREE.Mesh(boxGeo(1200, depth, 1), rock); f.position.set(0, -depth / 2, z - s * 0.5 * -1 * 0); levelGroup.add(f); }
      const fb = new CANNON.Body({ mass: 0, material: M.ground, shape: new CANNON.Box(new CANNON.Vec3(600, 5, (z0 - z1) / 2 + 20)) });
      fb.position.set(0, -depth - 5, (z0 + z1) / 2); addEntity(fb, null, { kind: 'ground' });
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(1200, z0 - z1), new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 1 }));
      floor.rotation.x = -Math.PI / 2; floor.position.set(0, -depth, (z0 + z1) / 2); floor.receiveShadow = true; levelGroup.add(floor);
    } else {
      addGround(400, -900);
      if (m.road) roadStrip(60, -600);
    }
    if (m.road) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.6), new THREE.MeshBasicMaterial({ color: 0xdddddd }));
      line.rotation.x = -Math.PI / 2; line.position.set(0, 0.012, 4); levelGroup.add(line);
    }
    const fw = new CANNON.Body({ mass: 0, material: M.ground, shape: new CANNON.Box(new CANNON.Vec3(600, 40, 2)) });
    fw.position.set(0, 35, -898); addEntity(fw, null);
    const fwm = new THREE.Mesh(boxGeo(1200, 80, 4), new THREE.MeshStandardMaterial({ color: 0x777b84, flatShading: true }));
    fwm.position.copy(fw.position); levelGroup.add(fwm);
    const bw = new CANNON.Body({ mass: 0, material: M.ground, shape: new CANNON.Box(new CANNON.Vec3(600, 40, 2)) });
    bw.position.set(0, 35, 398); addEntity(bw, null);
    if (m.walls) {
      const W = m.walls, cmat = new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.9, flatShading: true });
      for (const [x, z, hx, hz] of [[0, W, W + 2, 1], [0, -W, W + 2, 1], [W, 0, 1, W], [-W, 0, 1, W]]) {
        const b = new CANNON.Body({ mass: 0, material: M.ground, shape: new CANNON.Box(new CANNON.Vec3(hx, 4, hz)) });
        b.position.set(x, 4, z); b.collisionFilterGroup = GROUP.STATIC; b.collisionFilterMask = ALL;
        const me = new THREE.Mesh(boxGeo(hx * 2, 8, hz * 2), cmat); me.castShadow = me.receiveShadow = true;
        addEntity(b, me, { kind: 'static' }); me.position.copy(b.position);
      }
    }
  }

  buildDecor() {
    const m = this.map, R = rng(11), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const inst = (geo, material, N, place) => {
      const im = new THREE.InstancedMesh(geo, material, N); im.castShadow = true;
      for (let n = 0; n < N; n++) { const [x, y, z, sc] = place(n); m4.compose(p.set(x, y, z), q, s.set(sc, sc, sc)); im.setMatrixAt(n, m4); }
      levelGroup.add(im);
    };
    const sideX = (minX, span) => (R() < 0.5 ? -1 : 1) * (minX + R() * span);
    const zr = () => 60 - R() * 700;
    if (m.decor === 'trees' || m.decor === 'pines') {
      const snow = m.decor === 'pines', minX = m.road ? 14 : 45;
      const pl = []; for (let i = 0; i < 150; i++) pl.push([sideX(minX, 160), zr(), 0.7 + R() * 1.1]);
      inst(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 5), mat(0x6b4a2c), 150, n => [pl[n][0], 1.1 * pl[n][2], pl[n][1], pl[n][2]]);
      inst(new THREE.ConeGeometry(2.0, 5, 6), mat(snow ? 0xdfeaf0 : 0x2f6b34), 150, n => [pl[n][0], 4.2 * pl[n][2], pl[n][1], pl[n][2]]);
    } else if (m.decor === 'cacti') {
      const pl = []; for (let i = 0; i < 90; i++) pl.push([sideX(40, 200), zr(), 0.7 + R() * 0.9]);
      inst(new THREE.CylinderGeometry(0.35, 0.4, 3.2, 6), mat(0x3f8a45), 90, n => [pl[n][0], 1.6 * pl[n][2], pl[n][1], pl[n][2]]);
      inst(new THREE.DodecahedronGeometry(1.4, 0), mat(0xa9845a), 60, n => [sideX(35, 220), 0.6, zr(), 0.5 + R()]);
    } else if (m.decor === 'rocks') {
      inst(new THREE.DodecahedronGeometry(1.6, 0), mat(0x6e6e74), 120, n => [sideX(40, 260), 0.7, zr(), 0.5 + R() * 2.2]);
    } else if (m.decor === 'city') {
      const wt = windowTex(), N = 40;
      for (let i = 0; i < N; i++) {
        const w = 12 + R() * 22, h = 20 + R() * 70, d = 12 + R() * 22, t = wt.clone(); t.needsUpdate = true; t.repeat.set(w / 12, h / 12);
        const me = new THREE.Mesh(boxGeo(w, h, d), new THREE.MeshStandardMaterial({ color: 0x20243a, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.4, map: t, flatShading: true }));
        me.position.set(sideX(30, 120), h / 2, 60 - R() * 640); levelGroup.add(me);
      }
    }
    if (m.decor === 'trees' || m.decor === 'pines') {
      const bm = [0x8f9aa8, 0xa89a8f, 0x7c8d9a, 0xb5a98c].map(c => mat(c, { roughness: 0.9 }));
      for (let i = 0; i < 40; i++) {
        const w = 12 + R() * 26, h = 14 + R() * 50, d = 12 + R() * 26, b = new THREE.Mesh(boxGeo(w, h, d), bm[i % 4]);
        b.position.set(sideX(130, 120), h / 2, 60 - R() * 640); b.castShadow = true; levelGroup.add(b);
      }
    }
    if (m.lamps) {
      const lit = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: m.ground === 'neon' ? 0xff5ad0 : 0xfff0c0, emissiveIntensity: 1.5 });
      for (let z = 10; z > -430; z -= 40) for (const sx of [-1, 1]) {
        if (m.pit && z < m.pit.z0 + 10 && z > m.pit.z1 - 10) continue;
        const pole = new THREE.Mesh(boxGeo(0.25, 9, 0.25), mat(0x555a60)); pole.position.set(sx * 10.5, 4.5, z); pole.castShadow = true;
        const lamp = new THREE.Mesh(boxGeo(1.4, 0.2, 0.5), lit); lamp.position.set(sx * 9.8, 9, z); levelGroup.add(pole, lamp);
      }
    }
  }

  buildEnd() {
    for (let k = -1; k <= 1; k++) this.breakables.push(new Breakable(this, { x: k * 6.6, z: -440, yaw: 0, s: 1.2, y: 0 }, 6.4, 3.2, 1.2, 8, 5));
    for (let k = -1; k <= 1; k++) this.breakables.push(new Breakable(this, { x: k * 6.6, z: -452, yaw: 0, s: 1.2, y: 0 }, 6.4, 3.8, 1.2, 8, 6));
  }

  // ---------------- objects ----------------
  staticBox(hx, hy, hz, pos, mesh, q) {
    const b = new CANNON.Body({ mass: 0, material: M.ground, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) });
    b.position.set(pos.x, pos.y, pos.z); if (q) b.quaternion.copy(q.isQuaternion ? cq(q) : q);
    b.collisionFilterGroup = GROUP.STATIC; b.collisionFilterMask = ALL;
    const e = addEntity(b, mesh, { kind: 'static' });
    if (mesh) { mesh.position.copy(b.position); mesh.quaternion.copy(b.quaternion); mesh.castShadow = mesh.receiveShadow = true; }
    return e;
  }
  buildObject(o, i) {
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 3, 14), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    const r = Math.max(2.4, ({ ramp: 5, boost: 4, wall: 3.6, piston: 5, block: 2.6, oil: 3.6, mine: 1.8, barrel: 1.4 })[o.type] * o.s);
    pick.scale.set(r, 1, r); pick.position.set(o.x, o.y + 1.5, o.z); pick.userData.idx = i; pick.userData.r = r;
    this.editGroup.add(pick); this.pickers.push(pick);
    this['build_' + o.type](o);
  }
  build_ramp(o) {
    const s = o.s, w = 6.5 * s, th = 0.4 * s, segs = [[0.06, 7], [0.16, 6], [0.28, 5]];
    const qy = qYaw(o.yaw), base = new THREE.Vector3(o.x, o.y, o.z);
    const hz = new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.6, flatShading: true });
    let y0 = 0, z0 = 9 * s; const prof = [[z0, 0], [z0, y0]];
    for (const [a, Lr] of segs) {
      const L = Lr * s, dy = Math.sin(a), dz = -Math.cos(a), ny = Math.cos(a), nz = Math.sin(a);
      const cy = y0 + dy * L / 2 - ny * th / 2, cz = z0 + dz * L / 2 - nz * th / 2;
      const q = qy.clone().multiply(new THREE.Quaternion().setFromAxisAngle(X, a));
      const c = new THREE.Vector3(0, cy, cz).applyQuaternion(qy).add(base);
      this.staticBox(w / 2, th / 2, L / 2, c, new THREE.Mesh(boxGeo(w, th, L), hz), q);
      y0 += dy * L; z0 += dz * L; prof.push([z0, y0]);
    }
    const sh = new THREE.Shape(); sh.moveTo(-prof[0][0], -o.y);
    for (const [pz, py] of prof.slice(1)) sh.lineTo(-pz, Math.max(-o.y, py - 0.3 * s));
    sh.lineTo(-prof[prof.length - 1][0], -o.y); sh.closePath();
    const eg = new THREE.ExtrudeGeometry(sh, { depth: w - 0.2, bevelEnabled: false }); eg.translate(0, 0, -(w - 0.2) / 2);
    const em = new THREE.Mesh(eg, mat(0x4a4f57)); em.rotation.y = Math.PI / 2; em.castShadow = em.receiveShadow = true;
    const g = new THREE.Group(); g.position.copy(base); g.rotation.y = o.yaw; g.add(em); levelGroup.add(g);
  }
  build_boost(o) {
    const hw = 2.3 * o.s, hl = 5 * o.s;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, hl * 2), new THREE.MeshStandardMaterial({ map: boostTex(), emissiveMap: boostTex(), emissive: 0xffffff, emissiveIntensity: 1.8, roughness: 0.5 }));
    m.quaternion.copy(qYaw(o.yaw).multiply(new THREE.Quaternion().setFromAxisAngle(X, -Math.PI / 2))); m.position.set(o.x, o.y + 0.03, o.z); m.receiveShadow = true; levelGroup.add(m);
    this.zones.push({ type: 'boost', x: o.x, z: o.z, y: o.y, hw, hl, c: Math.cos(o.yaw), s: Math.sin(o.yaw) });
    this.anim.push(t => { m.material.emissiveIntensity = 1.4 + Math.sin(t * 9) * 0.7; });
    if (o.y > 0.1) this.staticBox(hw, 0.15, hl, new THREE.Vector3(o.x, o.y - 0.15, o.z), new THREE.Mesh(boxGeo(hw * 2, 0.3, hl * 2), mat(0x44484f)), qYaw(o.yaw));
  }
  build_oil(o) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(3.4 * o.s, 28), new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.06, metalness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2; m.scale.set(1.15, 1, 1); m.position.set(o.x, o.y + 0.025, o.z); m.receiveShadow = true; levelGroup.add(m);
    this.zones.push({ type: 'oil', x: o.x, z: o.z, y: o.y, r: 3.5 * o.s, used: false });
  }
  build_mine(o) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.22, 10), mat(0x303236)); base.position.y = 0.11;
    const lightM = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 2 });
    const light = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 8), lightM); light.position.y = 0.26;
    g.add(base, light); g.position.set(o.x, o.y, o.z); g.scale.setScalar(o.s); g.traverse(c => { if (c.isMesh) c.castShadow = true; });
    levelGroup.add(g);
    const mine = { x: o.x, z: o.z, y: o.y, r: 1.9 * o.s, mesh: g, armed: true };
    this.mines.push(mine);
    this.anim.push(t => { lightM.emissiveIntensity = mine.armed ? (Math.sin(t * 10) > 0 ? 3.5 : 0.3) : 0; });
    if (o.y > 0.1) this.staticBox(1, 0.15, 1, new THREE.Vector3(o.x, o.y - 0.15, o.z), new THREE.Mesh(boxGeo(2, 0.3, 2), mat(0x44484f)));
  }
  build_wall(o) { this.breakables.push(new Breakable(this, o, 6.4 * o.s, 2.6 * o.s, 0.9 * Math.max(1, o.s * 0.8), 8, Math.max(3, Math.round(4 * o.s)))); }
  build_block(o) {
    const s = o.s, m = new THREE.Mesh(boxGeo(3 * s, 2 * s, 3 * s), new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.9, flatShading: true }));
    this.staticBox(1.5 * s, s, 1.5 * s, new THREE.Vector3(o.x, o.y + s, o.z), m, qYaw(o.yaw));
  }
  build_barrel(o) {
    const s = o.s, b = new CANNON.Body({ mass: 18 * s * s * s, material: M.debris, shape: new CANNON.Box(new CANNON.Vec3(0.3 * s, 0.45 * s, 0.3 * s)) });
    b.position.set(o.x, o.y + 0.46 * s, o.z); b.quaternion.setFromEuler(0, o.yaw, 0);
    b.collisionFilterGroup = GROUP.DEBRIS; b.collisionFilterMask = ALL; b.allowSleep = true; b.sleepSpeedLimit = 0.3;
    const me = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * s, 0.34 * s, 0.9 * s, 8), new THREE.MeshStandardMaterial({ color: 0x2e63c4, roughness: 0.5, flatShading: true }));
    me.castShadow = me.receiveShadow = true; addEntity(b, me, { kind: 'barrel' }); me.position.copy(b.position); b.sleep();
  }
  build_piston(o) {
    const s = o.s, ax = new THREE.Vector3(Math.cos(o.yaw), 0, -Math.sin(o.yaw));     // local +x in world
    const start = new THREE.Vector3(o.x, o.y + 1.1 * s, o.z).addScaledVector(ax, 6.5 * s);
    const housing = new THREE.Mesh(boxGeo(2.4 * s, 3 * s, 3.4 * s), mat(0x44484f, { roughness: 0.6 }));
    this.staticBox(1.2 * s, 1.5 * s, 1.7 * s, new THREE.Vector3(o.x, o.y + 1.5 * s, o.z).addScaledVector(ax, 8.7 * s), housing, qYaw(o.yaw));
    const blockM = new THREE.Mesh(boxGeo(1.6 * s, 2.2 * s, 3 * s), new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.5, flatShading: true }));
    const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: M.car, shape: new CANNON.Box(new CANNON.Vec3(0.8 * s, 1.1 * s, 1.5 * s)) });
    b.position.set(start.x, start.y, start.z); b.quaternion.copy(cq(qYaw(o.yaw))); b.collisionFilterGroup = GROUP.STATIC; b.collisionFilterMask = ALL;
    addEntity(b, blockM, { kind: 'piston' }); blockM.castShadow = true; blockM.position.copy(b.position); blockM.quaternion.copy(b.quaternion);
    this.pistons.push({ b, start: start.clone(), dir: ax.clone().multiplyScalar(-1), x: o.x, z: o.z, y: o.y, s, state: 0 });
  }

  // ---------------- editor visuals ----------------
  setSelected(i) {
    if (this.selRing) { this.editGroup.remove(this.selRing); this.selRing = null; }
    const o = this.objects[i]; if (!o) return;
    const r = this.pickers[i].userData.r, g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.35, 40), new THREE.MeshBasicMaterial({ color: 0xffc02a, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 4), new THREE.MeshBasicMaterial({ color: 0xffc02a })); // yaw arrow (points along object's -z = driving direction)
    arrow.rotation.x = -Math.PI / 2; arrow.position.set(0, 0.2, -r - 1.2);
    g.add(ring, arrow); g.position.set(o.x, o.y + 0.08, o.z); g.rotation.y = o.yaw;
    this.selRing = g; this.editGroup.add(g);
  }
  moveSelRing(x, z, y) { if (this.selRing) this.selRing.position.set(x, y + 0.08, z); }
  setEditorVisible(v) { this.editGroup.visible = v; }

  // ---------------- route ribbon ----------------
  setPath(path) {
    if (this.pathMesh) { levelGroup.remove(this.pathMesh); this.pathMesh.traverse(o => o.geometry && o.geometry.dispose()); this.pathMesh = null; }
    if (!path || path.length < 2) return;
    const g = new THREE.Group(), pos = [], idx = [], hw = 0.35;
    for (let i = 0; i < path.length; i++) {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      pos.push(path[i][0] - dz * hw, 0.1, path[i][1] + dx * hw, path[i][0] + dz * hw, 0.1, path[i][1] - dx * hw);
      if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 1.3, 1.9), side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }));
    m.frustumCulled = false; g.add(m);
    const s = path[0], e = path[path.length - 1];
    const st = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20), new THREE.MeshBasicMaterial({ color: 0x4dff7c })); st.rotation.x = -Math.PI / 2; st.position.set(s[0], 0.12, s[1]);
    const en = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20), new THREE.MeshBasicMaterial({ color: 0xff4a4a })); en.rotation.x = -Math.PI / 2; en.position.set(e[0], 0.12, e[1]);
    g.add(st, en); this.pathMesh = g; levelGroup.add(g);
  }

  // ---------------- per-step logic ----------------
  step(dt, s) {
    const car = s.car, dummy = s.dummy;
    const subj = [];
    if (car) subj.push(car.body);
    if (dummy) for (const b of dummy.list) subj.push(b.body);
    if (car) {
      const cb = car.body, sp = cb.velocity.length();
      if (sp > 8) {
        const f = car.forward, fx2 = cb.position.x + f.x * 2.2 + cb.velocity.x * dt * 3, fz2 = cb.position.z + f.z * 2.2 + cb.velocity.z * dt * 3;
        for (const w of this.breakables) if (!w.broken && w.contains(fx2, fz2, cb.position.y)) w.shatter(cb.velocity, new CANNON.Vec3(fx2, 1, fz2), Math.min(1, sp / 28));
      }
    }
    let inOil = false, dummyOil = false;
    for (const z of this.zones) {
      if (z.type === 'boost') {
        const dirx = -z.s, dirz = -z.c;
        for (const b of subj) {
          const dx = b.position.x - z.x, dz = b.position.z - z.z, lx = dx * z.c - dz * z.s, lz = dx * z.s + dz * z.c;
          if (Math.abs(lx) < z.hw && Math.abs(lz) < z.hl && b.position.y < z.y + 3) {
            if (b.dummy && b.dummy.attached) continue;
            if (b.velocity.x * dirx + b.velocity.z * dirz < 78) { b.velocity.x += dirx * 52 * dt; b.velocity.z += dirz * 52 * dt; }
          }
        }
      } else if (z.type === 'oil') {
        if (car) {
          const cb = car.body;
          if (Math.hypot((cb.position.x - z.x) / 1.15, cb.position.z - z.z) < z.r && cb.position.y < z.y + 1.5) {
            inOil = true;
            if (!z.used) { z.used = true; cb.angularVelocity.y += (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2); }
          }
        }
        if (dummy) for (const b of dummy.list) if (Math.hypot((b.body.position.x - z.x) / 1.15, b.body.position.z - z.z) < z.r && b.body.position.y < z.y + 0.6) dummyOil = true;
      }
    }
    if (car) car.slick = inOil;
    const cmat = world.getContactMaterial(M.dummy, M.ground);
    if (cmat) cmat.friction = dummyOil ? 0.04 : (this.map.dummyFriction ?? 0.7);
    for (const m of this.mines) {
      if (!m.armed) continue;
      for (const b of subj) if (Math.hypot(b.position.x - m.x, b.position.z - m.z) < m.r && b.position.y < m.y + 1.6 && !(b.dummy && b.dummy.attached)) { this.explode(m); break; }
    }
    for (const p of this.pistons) {
      const trig = (car && !car.crashed ? car.body : (dummy ? dummy.pelvis.body : null));
      if (p.state === 0 && trig) {
        const d = Math.hypot(trig.position.x - p.x, trig.position.z - p.z);
        if (d < trig.velocity.length() * 0.22 + 3 * p.s && trig.position.y < p.y + 3) { p.state = 1; p.b.velocity.set(p.dir.x * 34, 0, p.dir.z * 34); }
      } else if (p.state === 1) {
        if (p.b.position.vsub(new CANNON.Vec3(p.start.x, p.start.y, p.start.z)).length() > 5.5 * p.s) { p.state = 2; p.b.velocity.set(-p.dir.x * 5, 0, -p.dir.z * 5); }
      } else if (p.state === 2) {
        if (p.b.position.vsub(new CANNON.Vec3(p.start.x, p.start.y, p.start.z)).dot(new CANNON.Vec3(p.dir.x, 0, p.dir.z)) < 0.1) { p.b.velocity.set(0, 0, 0); p.b.position.set(p.start.x, p.start.y, p.start.z); p.state = 3; }
      }
    }
  }

  explode(m) {
    m.armed = false; m.mesh.visible = false;
    const y = m.y + 0.5, R = 15 * Math.max(0.7, m.r / 1.9);
    fx('explosion', m.x, y, m.z, 1);
    for (const e of entities) {
      const b = e.body; if (!b || b.mass <= 0 || !e.inWorld) continue;
      const dx = b.position.x - m.x, dy = b.position.y - y, dz = b.position.z - m.z, d = Math.hypot(dx, dy, dz);
      if (d > R) continue;
      const k = Math.pow(1 - d / R, 1.1), isCar = b === this.car?.body, dv = (isCar ? 14 : 30) * k, nx = dx / (d || 1), nz = dz / (d || 1);
      b.velocity.x += nx * dv * 0.8; b.velocity.z += nz * dv * 0.8; b.velocity.y += (isCar ? 9 : 14) * k + 2 * k;
      b.angularVelocity.x += (Math.random() - 0.5) * 8 * k; b.angularVelocity.z += (Math.random() - 0.5) * 8 * k; b.wakeUp();
    }
    for (const w of this.breakables) if (!w.broken && Math.hypot(w.x - m.x, w.z - m.z) < 9) w.shatter(new CANNON.Vec3(0, 0, 0), new CANNON.Vec3(m.x, 0.5, m.z), 0.6, true);
    if (this.hooks.explosion) this.hooks.explosion(m.x, y, m.z);
  }
  update(t) { for (const a of this.anim) a(t); }
}

class Breakable {
  constructor(track, o, w, h, d, cols, rows) {
    this.track = track; this.x = o.x; this.z = o.z; this.y = o.y; this.yaw = o.yaw; this.w = w; this.h = h; this.d = d; this.broken = false;
    this.c = Math.cos(o.yaw); this.sn = Math.sin(o.yaw);
    const cmat = new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.9, flatShading: true });
    const solid = new THREE.Mesh(boxGeo(w, h, d), cmat);
    this.solid = track.staticBox(w / 2, h / 2, d / 2, new THREE.Vector3(o.x, o.y + h / 2, o.z), solid, qYaw(o.yaw));
    this.chunks = [];
    const cw = w / cols, ch = h / rows, qy = cq(qYaw(o.yaw)), R = rng((o.x * 31 + o.z * 7) | 0);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const sx = cw * (0.92 + R() * 0.1);
      const b = new CANNON.Body({ mass: Math.max(6, cw * ch * d * 55), material: M.debris, shape: new CANNON.Box(new CANNON.Vec3(sx / 2, ch / 2 * 0.98, d / 2 * 0.98)) });
      b.collisionFilterGroup = GROUP.DEBRIS; b.collisionFilterMask = ALL; b.allowSleep = true; b.sleepSpeedLimit = 0.35; b.sleepTimeLimit = 0.6;
      const m = new THREE.Mesh(boxGeo(sx, ch * 0.98, d * 0.98), cmat); m.castShadow = m.receiveShadow = true; m.visible = false;
      const e = addEntity(b, m, { kind: 'chunk', dormant: true });
      const lx = -w / 2 + cw * (c + 0.5);
      e.home = new CANNON.Vec3(o.x + lx * this.c, o.y + ch * (r + 0.5), o.z - lx * this.sn); e.homeQ = qy;
      this.chunks.push(e);
    }
  }
  contains(px, pz, py) {
    const dx = px - this.x, dz = pz - this.z, lx = dx * this.c - dz * this.sn, lz = dx * this.sn + dz * this.c;
    return Math.abs(lx) < this.w / 2 + 0.6 && Math.abs(lz) < this.d / 2 + 0.3 && py < this.y + this.h + 0.5 && py > this.y - 1;
  }
  shatter(vel, at, strength = 1, blast = false) {
    if (this.broken) return;
    this.broken = true; deactivateEntity(this.solid);
    for (const e of this.chunks) {
      const b = e.body; b.position.copy(e.home); b.quaternion.copy(e.homeQ);
      const dx = e.home.x - at.x, dz = e.home.z - at.z, dd = Math.hypot(dx, dz) + 0.5, near = Math.max(0.15, 1 - dd / 8);
      b.velocity.set(vel.x * 0.55 * near + (Math.random() - 0.5) * 4 + (dx / dd) * 3 * strength, vel.y * 0.4 + Math.random() * 3 * strength + (blast ? 6 : 0), vel.z * 0.6 * near + (Math.random() - 0.5) * 3);
      b.angularVelocity.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
      activateEntity(e, true); e.mesh.position.copy(b.position); e.mesh.quaternion.copy(b.quaternion);
    }
    fx('debris', this.x, this.y + this.h / 2, this.z, 26);
    this.track.hooks.wallBroken && this.track.hooks.wallBroken(this);
  }
}
