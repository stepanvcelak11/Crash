// Test-course: road, scenery, obstacle slots and all obstacle behaviours (ramp, boost, mine, oil, wall, piston).
import { THREE, CANNON, GROUP, ALL, M, S, world, addEntity, activateEntity, deactivateEntity, mat, boxGeo, rng, levelGroup, sun, entities } from './engine.js';
import { fx } from './fx.js';

export const SLOT_POS = [[0, -50], [-3.5, -88], [0, -125], [3.5, -162], [0, -200], [-3.5, -238], [0, -275], [3.5, -312], [0, -350], [0, -388]];
export const END_Z = -440;
export const OBSTACLES = {
  ramp: { label: 'Můstek', icon: '◢' },
  boost: { label: 'Turbo', icon: '»' },
  mine: { label: 'Mina', icon: '✹' },
  oil: { label: 'Olej', icon: '●' },
  wall: { label: 'Zeď', icon: '▦' },
  piston: { label: 'Píst', icon: '▥' },
};
export const CAM_POINTS = [];
for (let k = 0; k < 11; k++) CAM_POINTS.push(new THREE.Vector3((k % 2 ? 1 : -1) * (13 + (k % 3) * 3), 2.2 + (k % 3), 10 - k * 48));

// ---- procedural textures ----
function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(...rep);
  return t;
}
let TEX = null;
function textures() {
  if (TEX) return TEX;
  const R = rng(7);
  TEX = {
    road: canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#3a3b40'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) { const v = 40 + R() * 40; g.fillStyle = `rgb(${v},${v},${v + 4})`; g.fillRect(R() * w, R() * h, 2, 2); }
      g.fillStyle = '#e8e8e8'; g.fillRect(6, 0, 7, h); g.fillRect(w - 13, 0, 7, h);
      g.fillStyle = '#f0c030'; g.fillRect(w / 2 - 3, 0, 6, h * 0.5);
    }, [1, 40]),
    grass: canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#5f8f3c'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#6a9b44'; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2);
      g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
    }, [140, 160]),
    concrete: canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#9b9b96'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 700; i++) { const v = 120 + R() * 60; g.fillStyle = `rgb(${v},${v},${v - 4})`; g.fillRect(R() * w, R() * h, 3, 3); }
      g.strokeStyle = 'rgba(60,60,60,.5)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
    }),
    hazard: canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#f2b81c'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1a1a';
      for (let i = -4; i < 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 16, 0); g.lineTo(i * 32 + 16 + h, h); g.lineTo(i * 32 + h, h); g.fill(); }
    }),
    boost: canvasTex(128, 256, (g, w, h) => {
      g.fillStyle = '#062a12'; g.fillRect(0, 0, w, h); g.strokeStyle = '#4dff7c'; g.lineWidth = 14; g.lineCap = 'round';
      for (let i = 0; i < 3; i++) { const y = 40 + i * 70; g.beginPath(); g.moveTo(20, y + 38); g.lineTo(w / 2, y); g.lineTo(w - 20, y + 38); g.stroke(); }
    }),
  };
  return TEX;
}

const SPECS = { cone: [0.32, 0.5, 0.32], barrel: [0.3, 0.45, 0.3] };

export class Track {
  constructor(slotTypes) {
    this.slotTypes = slotTypes;
    this.zones = []; this.mines = []; this.pistons = []; this.breakables = []; this.anim = [];
    this.pendingExplosions = [];
    this.hooks = {};
    this.slotRings = []; this.slotPickers = [];
    this.slotGroup = new THREE.Group(); levelGroup.add(this.slotGroup);
    this.buildGround();
    this.buildScenery();
    this.buildProps();
    SLOT_POS.forEach(([x, z], i) => this.buildSlot(i, x, z, slotTypes[i]));
    this.buildEnd();
  }

  // ---------------- ground ----------------
  buildGround() {
    const T = textures();
    const gb = new CANNON.Body({ mass: 0, material: M.ground, shape: new CANNON.Box(new CANNON.Vec3(500, 5, 650)) });
    gb.position.set(0, -5, -250); gb.collisionFilterGroup = GROUP.GROUND; gb.collisionFilterMask = ALL;
    addEntity(gb, null, { kind: 'ground' });
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1300), new THREE.MeshStandardMaterial({ map: T.grass, roughness: 0.95 }));
    grass.rotation.x = -Math.PI / 2; grass.position.set(0, -0.01, -250); grass.receiveShadow = true;
    levelGroup.add(grass);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(14, 640), new THREE.MeshStandardMaterial({ map: T.road, roughness: 0.85 }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.005, -270); road.receiveShadow = true;
    levelGroup.add(road);
    // start line
    const line = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    line.rotation.x = -Math.PI / 2; line.position.set(0, 0.012, 4); levelGroup.add(line);
    // far wall of the world
    const fw = new CANNON.Body({ mass: 0, material: M.ground, shape: new CANNON.Box(new CANNON.Vec3(500, 30, 2)) });
    fw.position.set(0, 25, -585); addEntity(fw, null);
    const fwm = new THREE.Mesh(boxGeo(1000, 60, 4), new THREE.MeshStandardMaterial({ color: 0x777b84, flatShading: true }));
    fwm.position.copy(fw.position); levelGroup.add(fwm);
  }

  buildScenery() {
    const R = rng(11);
    // trees (instanced)
    const trunkG = new THREE.CylinderGeometry(0.25, 0.35, 2.2, 5), leafG = new THREE.ConeGeometry(2.0, 5, 6);
    const N = 150;
    const trunks = new THREE.InstancedMesh(trunkG, mat(0x6b4a2c), N), leaves = new THREE.InstancedMesh(leafG, mat(0x2f6b34), N);
    trunks.castShadow = leaves.castShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    let n = 0;
    while (n < N) {
      const x = (R() < 0.5 ? -1 : 1) * (14 + R() * 150), z = 40 - R() * 640;
      const sc = 0.7 + R() * 1.1;
      m4.compose(p.set(x, 1.1 * sc, z), q, s.set(sc, sc, sc)); trunks.setMatrixAt(n, m4);
      m4.compose(p.set(x, 4.2 * sc, z), q, s.set(sc, sc, sc)); leaves.setMatrixAt(n, m4);
      n++;
    }
    levelGroup.add(trunks, leaves);
    // blocky background buildings
    const bmat = [0x8f9aa8, 0xa89a8f, 0x7c8d9a, 0xb5a98c].map(c => mat(c, { roughness: 0.9 }));
    for (let i = 0; i < 40; i++) {
      const w = 12 + R() * 26, h = 14 + R() * 50, d = 12 + R() * 26;
      const m = new THREE.Mesh(boxGeo(w, h, d), bmat[i % 4]);
      m.position.set((R() < 0.5 ? -1 : 1) * (130 + R() * 120), h / 2, 60 - R() * 640); m.castShadow = true; m.receiveShadow = true;
      levelGroup.add(m);
    }
    // jersey barriers lining the first stretch + lamp posts
    const cmat = new THREE.MeshStandardMaterial({ map: textures().concrete, roughness: 0.9, flatShading: true });
    for (let z = 20; z > -420; z -= 12) for (const sx of [-1, 1]) {
      const b = new CANNON.Body({ mass: 0, material: M.ground, shape: new CANNON.Box(new CANNON.Vec3(0.35, 0.45, 2.9)) });
      b.position.set(sx * 8.4, 0.45, z); b.collisionFilterGroup = GROUP.STATIC; b.collisionFilterMask = ALL;
      const m = new THREE.Mesh(boxGeo(0.7, 0.9, 5.8), cmat); m.castShadow = m.receiveShadow = true;
      addEntity(b, m, { kind: 'static' }); m.position.copy(b.position);
    }
    for (let z = 10; z > -430; z -= 40) for (const sx of [-1, 1]) {
      const pole = new THREE.Mesh(boxGeo(0.25, 9, 0.25), mat(0x555a60)); pole.position.set(sx * 10.5, 4.5, z); pole.castShadow = true;
      const lamp = new THREE.Mesh(boxGeo(1.4, 0.2, 0.5), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0c0, emissiveIntensity: 1.5 }));
      lamp.position.set(sx * 9.8, 9, z); levelGroup.add(pole, lamp);
    }
  }

  buildProps() {
    const R = rng(23);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6, flatShading: true });
    const barMat = new THREE.MeshStandardMaterial({ color: 0x2e63c4, roughness: 0.5, flatShading: true });
    const mk = (kind, x, z) => {
      const sp = SPECS[kind];
      const b = new CANNON.Body({ mass: kind === 'cone' ? 4 : 18, material: M.debris, shape: new CANNON.Box(new CANNON.Vec3(...sp)) });
      b.position.set(x, sp[1] + 0.01, z); b.quaternion.setFromEuler(0, R() * 6, 0);
      b.collisionFilterGroup = GROUP.DEBRIS; b.collisionFilterMask = ALL; b.allowSleep = true; b.sleepSpeedLimit = 0.3;
      const g = kind === 'cone' ? new THREE.ConeGeometry(0.34, 1.0, 5) : new THREE.CylinderGeometry(0.34, 0.34, 0.9, 8);
      const m = new THREE.Mesh(g, kind === 'cone' ? coneMat : barMat); m.castShadow = m.receiveShadow = true;
      addEntity(b, m, { kind }); m.position.copy(b.position);
      b.sleep();
    };
    for (let z = 5; z > -420; z -= 14) { mk('cone', 6.2 + R() * 0.8, z); mk('cone', -6.2 - R() * 0.8, z - 5); }
    for (let i = 0; i < 18; i++) mk('barrel', (R() - 0.5) * 8, -30 - R() * 380);
  }

  // ---------------- slots & obstacles ----------------
  buildSlot(i, x, z, type) {
    const col = type ? 0xffc02a : 0x4fd6ff;
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.9, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.07, z); this.slotGroup.add(ring); this.slotRings.push(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.3, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.14, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.set(x, 0.065, z); this.slotGroup.add(disc);
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.fillText(String(i + 1), 32, 48);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
    label.scale.set(3, 3, 3); label.position.set(x, 3.4, z); label.renderOrder = 50; this.slotGroup.add(label);
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 3, 12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    pick.position.set(x, 1.5, z); pick.userData.slot = i; this.slotGroup.add(pick); this.slotPickers.push(pick);
    if (type) this['build_' + type](x, z);
  }
  setHover(i) {
    this.slotRings.forEach((r, k) => { r.scale.setScalar(k === i ? 1.12 : 1); r.material.opacity = k === i ? 1 : 0.85; });
  }

  staticBox(hx, hy, hz, x, y, z, mesh, q) {
    const b = new CANNON.Body({ mass: 0, material: M.ground, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) });
    b.position.set(x, y, z); if (q) b.quaternion.copy(q);
    b.collisionFilterGroup = GROUP.STATIC; b.collisionFilterMask = ALL;
    const e = addEntity(b, mesh, { kind: 'static' });
    if (mesh) { mesh.position.copy(b.position); mesh.quaternion.copy(b.quaternion); mesh.castShadow = mesh.receiveShadow = true; }
    return e;
  }

  build_ramp(x, z) {
    // two chained slabs (gentle entry, steeper lip) so the rigid chassis doesn't nose into it
    const w = 6.5, th = 0.4, hz = new THREE.MeshStandardMaterial({ map: textures().hazard, roughness: 0.6, flatShading: true });
    const segs = [[0.06, 7], [0.16, 6], [0.28, 5]];
    let y0 = 0, z0 = z + 9;          // low end (top surface) of the first slab
    const prof = [[z0, 0], [z0, y0]];
    for (const [a, L] of segs) {
      const dy = Math.sin(a), dz = -Math.cos(a), ny = Math.cos(a), nz = Math.sin(a);
      const cy = y0 + dy * L / 2 - ny * th / 2, cz = z0 + dz * L / 2 - nz * th / 2;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
      const m = new THREE.Mesh(boxGeo(w, th, L), hz);
      this.staticBox(w / 2, th / 2, L / 2, x, cy, cz, m, new CANNON.Quaternion(q.x, q.y, q.z, q.w));
      y0 += dy * L; z0 += dz * L; prof.push([z0, y0]);
    }
    // grey body under the slabs (visual only)
    const sh = new THREE.Shape(); sh.moveTo(-prof[0][0], 0);
    for (const [pz, py] of prof.slice(1)) sh.lineTo(-pz, Math.max(0, py - 0.3));
    sh.lineTo(-prof[prof.length - 1][0], 0); sh.closePath();
    const eg = new THREE.ExtrudeGeometry(sh, { depth: w - 0.2, bevelEnabled: false }); eg.translate(0, 0, -(w - 0.2) / 2);
    const em = new THREE.Mesh(eg, mat(0x4a4f57)); em.rotation.y = Math.PI / 2; em.position.set(x, 0, 0); em.castShadow = em.receiveShadow = true;
    levelGroup.add(em);
  }
  build_boost(x, z) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 10), new THREE.MeshStandardMaterial({ map: textures().boost, emissiveMap: textures().boost, emissive: 0xffffff, emissiveIntensity: 1.8, roughness: 0.5 }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, z); m.receiveShadow = true; levelGroup.add(m);
    this.zones.push({ type: 'boost', x, z, hw: 2.3, hl: 5 });
    this.anim.push(t => { m.material.emissiveIntensity = 1.4 + Math.sin(t * 9) * 0.7; });
  }
  build_oil(x, z) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(3.4, 28), new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.06, metalness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2; m.scale.set(1.15, 1, 1); m.position.set(x, 0.025, z); m.receiveShadow = true; levelGroup.add(m);
    this.zones.push({ type: 'oil', x, z, r: 3.5, used: false });
  }
  build_mine(x, z) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.22, 10), mat(0x303236)); base.position.y = 0.11;
    const lightM = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 2 });
    const light = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 8), lightM); light.position.y = 0.26;
    g.add(base, light); g.position.set(x, 0, z); g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    levelGroup.add(g);
    const mine = { x, z, mesh: g, armed: true };
    this.mines.push(mine);
    this.anim.push(t => { lightM.emissiveIntensity = mine.armed ? (Math.sin(t * 10) > 0 ? 3.5 : 0.3) : 0; });
  }
  build_wall(x, z) { this.breakables.push(new Breakable(this, x, z, 6.4, 2.6, 0.9, 8, 4)); }
  build_piston(x, z) {
    const side = x >= -1 ? 1 : -1;
    const bx = x + side * 6.5;
    const housing = new THREE.Mesh(boxGeo(2.4, 3, 3.4), mat(0x44484f, { roughness: 0.6 }));
    this.staticBox(1.2, 1.5, 1.7, bx + side * 2.2, 1.5, z, housing);
    const blockM = new THREE.Mesh(boxGeo(1.6, 2.2, 3), new THREE.MeshStandardMaterial({ map: textures().hazard, roughness: 0.5, flatShading: true }));
    const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: M.car, shape: new CANNON.Box(new CANNON.Vec3(0.8, 1.1, 1.5)) });
    b.position.set(bx, 1.1, z); b.collisionFilterGroup = GROUP.STATIC; b.collisionFilterMask = ALL;
    const e = addEntity(b, blockM, { kind: 'piston' }); blockM.castShadow = true; blockM.position.copy(b.position);
    this.pistons.push({ b, x0: bx, side, z, state: 0, travel: 0 });
  }

  buildEnd() {
    for (let k = -1; k <= 1; k++) this.breakables.push(new Breakable(this, k * 6.6, END_Z, 6.4, 3.2, 1.2, 8, 5));
    for (let k = -1; k <= 1; k++) this.breakables.push(new Breakable(this, k * 6.6, END_Z - 12, 6.4, 3.8, 1.2, 8, 6));
  }

  // ---------------- per-step logic ----------------
  /** @param {{car:any, dummy:any}} s */
  step(dt, s) {
    const car = s.car, dummy = s.dummy;
    const subj = [];
    if (car) subj.push(car.body);
    if (dummy) for (const b of dummy.list) subj.push(b.body);
    // breakables: shatter just before the car arrives so it can plough through
    if (car) {
      const cb = car.body;
      const sp = cb.velocity.length();
      if (sp > 8) {
        const f = car.forward;
        for (const w of this.breakables) {
          if (w.broken) continue;
          const px = cb.position.x + f.x * 2.2 + cb.velocity.x * dt * 3, pz = cb.position.z + f.z * 2.2 + cb.velocity.z * dt * 3;
          if (Math.abs(px - w.x) < w.w / 2 + 0.6 && Math.abs(pz - w.z) < w.d / 2 + 0.3 && cb.position.y < w.h + 0.5) w.shatter(cb.velocity, new CANNON.Vec3(px, 1, pz), Math.min(1, sp / 28));
        }
      }
    }
    let inOil = false, dummyOil = false;
    for (const z of this.zones) {
      if (z.type === 'boost') {
        for (const b of subj) {
          if (Math.abs(b.position.x - z.x) < z.hw && Math.abs(b.position.z - z.z) < z.hl && b.position.y < 3) {
            if (b.dummy && b.dummy.attached) continue;
            const mx = b === car.body ? 1 : 1;
            if (b.velocity.z > -78) b.velocity.z -= 52 * dt * mx;
          }
        }
      } else if (z.type === 'oil') {
        if (car) {
          const cb = car.body;
          if (Math.hypot((cb.position.x - z.x) / 1.15, cb.position.z - z.z) < z.r && cb.position.y < 1.3) {
            inOil = true;
            if (!z.used) { z.used = true; cb.angularVelocity.y += (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2); }
          }
        }
        if (dummy) for (const b of dummy.list) if (Math.hypot((b.body.position.x - z.x) / 1.15, b.body.position.z - z.z) < z.r && b.body.position.y < 0.6) dummyOil = true;
      }
    }
    if (car) car.slick = inOil;
    const cmat = world.getContactMaterial(M.dummy, M.ground);
    if (cmat) cmat.friction = dummyOil ? 0.04 : 0.7;
    // mines
    for (const m of this.mines) {
      if (!m.armed) continue;
      for (const b of subj) {
        if (Math.hypot(b.position.x - m.x, b.position.z - m.z) < 1.9 && b.position.y < 1.6 && !(b.dummy && b.dummy.attached)) { this.explode(m); break; }
      }
    }
    // pistons
    for (const p of this.pistons) {
      const trig = (car && !car.crashed ? car.body : (dummy ? dummy.pelvis.body : null));
      if (p.state === 0 && trig) {
        const lead = Math.max(2, trig.velocity.length() * 0.22);
        if (trig.position.z < p.z + lead && trig.position.z > p.z - 2) { p.state = 1; p.b.velocity.x = -p.side * 34; }
      } else if (p.state === 1) {
        p.travel = Math.abs(p.b.position.x - p.x0);
        if (p.travel > 5.5) { p.state = 2; p.b.velocity.x = p.side * 5; }
      } else if (p.state === 2) {
        if (Math.abs(p.b.position.x - p.x0) < 0.1) { p.b.velocity.x = 0; p.b.position.x = p.x0; p.state = 3; }
      }
    }
    // delayed explosions & chunk-flight queue
    for (const w of this.breakables) w.step(dt);
  }

  explode(m) {
    m.armed = false; m.mesh.visible = false;
    const y = 0.5;
    fx('explosion', m.x, y, m.z, 1);
    const R = 15;
    for (const e of entities) {
      const b = e.body; if (!b || b.mass <= 0 || !e.inWorld) continue;
      const dx = b.position.x - m.x, dy = b.position.y - y, dz = b.position.z - m.z;
      const d = Math.hypot(dx, dy, dz); if (d > R) continue;
      const k = Math.pow(1 - d / R, 1.1);
      const isCar = b === this.car?.body;
      const dv = (isCar ? 14 : 30) * k;
      const nx = dx / (d || 1), nz = dz / (d || 1);
      b.velocity.x += nx * dv * 0.8; b.velocity.z += nz * dv * 0.8; b.velocity.y += (isCar ? 9 : 14) * k + 2 * k;
      b.angularVelocity.x += (Math.random() - 0.5) * 8 * k; b.angularVelocity.z += (Math.random() - 0.5) * 8 * k;
      b.wakeUp();
    }
    for (const w of this.breakables) if (!w.broken && Math.hypot(w.x - m.x, w.z - m.z) < 9) w.shatter(new CANNON.Vec3(0, 0, 0), new CANNON.Vec3(m.x, 0.5, m.z), 0.6, true);
    if (this.hooks.explosion) this.hooks.explosion(m.x, y, m.z);
  }

  update(t) { for (const a of this.anim) a(t); }
  setSlotsVisible(v) { this.slotGroup.visible = v; }
}

class Breakable {
  constructor(track, x, z, w, h, d, cols, rows) {
    this.track = track; this.x = x; this.z = z; this.w = w; this.h = h; this.d = d; this.broken = false;
    const cmat = new THREE.MeshStandardMaterial({ map: textures().concrete, roughness: 0.9, flatShading: true });
    const solid = new THREE.Mesh(boxGeo(w, h, d), cmat);
    this.solid = track.staticBox(w / 2, h / 2, d / 2, x, h / 2, z, solid);
    solid.material = cmat.clone(); solid.material.map = solid.material.map.clone(); solid.material.map.needsUpdate = true; solid.material.map.repeat.set(w / 3, h / 3);
    this.chunks = [];
    const cw = w / cols, ch = h / rows;
    const R = rng((x * 31 + z * 7) | 0);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const sx = cw * (0.92 + R() * 0.1);
      const b = new CANNON.Body({ mass: Math.max(6, cw * ch * d * 55), material: M.debris, shape: new CANNON.Box(new CANNON.Vec3(sx / 2, ch / 2 * 0.98, d / 2 * 0.98)) });
      b.collisionFilterGroup = GROUP.DEBRIS; b.collisionFilterMask = ALL; b.allowSleep = true; b.sleepSpeedLimit = 0.35; b.sleepTimeLimit = 0.6;
      const m = new THREE.Mesh(boxGeo(sx, ch * 0.98, d * 0.98), cmat); m.castShadow = m.receiveShadow = true; m.visible = false;
      const e = addEntity(b, m, { kind: 'chunk', dormant: true });
      e.home = new CANNON.Vec3(x - w / 2 + cw * (c + 0.5), ch * (r + 0.5), z);
      this.chunks.push(e);
    }
  }
  shatter(vel, at, strength = 1, blast = false) {
    if (this.broken) return;
    this.broken = true;
    deactivateEntity(this.solid);
    for (const e of this.chunks) {
      const b = e.body;
      b.position.copy(e.home); b.quaternion.set(0, 0, 0, 1);
      const dx = e.home.x - at.x, dz = e.home.z - at.z, dd = Math.hypot(dx, dz) + 0.5;
      const near = Math.max(0.15, 1 - dd / 8);
      b.velocity.set(vel.x * 0.55 * near + (Math.random() - 0.5) * 4 + (dx / dd) * 3 * strength, vel.y * 0.4 + Math.random() * 3 * strength + (blast ? 6 : 0), vel.z * 0.6 * near + (Math.random() - 0.5) * 3 - (blast ? 0 : 1));
      b.angularVelocity.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
      activateEntity(e, true);
      e.mesh.position.copy(b.position); e.mesh.quaternion.set(0, 0, 0, 1);
    }
    fx('debris', this.x, this.h / 2, this.z, 26);
    this.track.hooks.wallBroken && this.track.hooks.wallBroken(this);
  }
  step() {}
}
