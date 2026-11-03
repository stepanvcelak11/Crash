// Map instance + free-placed obstacles + drawn route.
// Obstacles: ramp, boost, bounce, mine, oil, wall, piston, block, barrel.
import { THREE, CANNON, GROUP, ALL, M, S, QUAL, setSurface, world, scene, addEntity, activateEntity, deactivateEntity, mat, boxGeo, rng, levelGroup, entities } from './engine.js';
import { fx } from './fx.js';
import { Env, hazardTex, boostTex, concreteTex, trampTex } from './env.js';

export const OBSTACLES = {
  ramp: { label: 'Můstek', icon: '◢' }, boost: { label: 'Turbo', icon: '»' }, bounce: { label: 'Trampolína', icon: '◉' }, mine: { label: 'Mina', icon: '✹' },
  oil: { label: 'Olej', icon: '●' }, wall: { label: 'Zeď', icon: '▦' }, piston: { label: 'Píst', icon: '▥' }, block: { label: 'Blok', icon: '■' }, barrel: { label: 'Sud', icon: '🛢' },
};
const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
const qYaw = a => new THREE.Quaternion().setFromAxisAngle(Y, a);
const cq = q => new CANNON.Quaternion(q.x, q.y, q.z, q.w);

const envs = {}; let curEnv = null;
function getEnv(id, map) { return envs[id] || (envs[id] = new Env(id, map)); }

export class Track {
  /** @param id map id  @param map map def  @param objects S.objects  @param path [[x,z]..]  @param sel selected object index */
  constructor(id, map, objects, path, sel) {
    this.id = id; this.map = map; this.objects = objects;
    this.zones = []; this.mines = []; this.pistons = []; this.breakables = []; this.anim = []; this.hooks = {};
    this.pickers = []; this.editGroup = new THREE.Group(); levelGroup.add(this.editGroup);
    this.pathMesh = null; this.splashed = new WeakSet();
    // static environment (cached per map)
    const env = this.env = getEnv(id, map);
    if (curEnv !== env) { if (curEnv) scene.remove(curEnv.group); scene.add(env.group); curEnv = env; }
    for (const b of env.bodies) world.addBody(b);
    objects.forEach((o, i) => this.buildObject(o, i));
    if (map.endWalls) this.buildEnd();
    if (map.feature === 'bowling') this.buildPins();
    if (map.feature === 'construction') this.buildCrates();
    this.setPath(path);
    this.setSelected(sel);
  }
  height(x, z) { return this.env.h(x, z); }

  // ---------------- dynamic map props ----------------
  buildPins() {
    const prof = [[0.0, 0], [0.32, 0.05], [0.42, 0.3], [0.3, 0.7], [0.17, 1.0], [0.2, 1.15], [0.27, 1.3], [0.2, 1.45], [0.0, 1.5]].map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(prof, 12); geo.userData.shared = true;
    const white = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.3 });
    const k = 2.2;
    for (let row = 0; row < 4; row++) for (let c = 0; c <= row; c++) {
      const x = (c - row / 2) * 2.6, z = -330 - row * 2.4;
      const b = new CANNON.Body({ mass: 70, material: M.debris, shape: new CANNON.Box(new CANNON.Vec3(0.42 * k * 0.8, 0.75 * k, 0.42 * k * 0.8)) });
      b.position.set(x, 0.75 * k, z); b.collisionFilterGroup = GROUP.DEBRIS; b.collisionFilterMask = ALL; b.allowSleep = true; b.sleepSpeedLimit = 0.3;
      const g = new THREE.Group(); const body = new THREE.Mesh(geo, white); body.scale.setScalar(k); body.position.y = -0.75 * k; body.castShadow = true; g.add(body);
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * k, 0.2 * k, 0.1 * k, 12), new THREE.MeshStandardMaterial({ color: 0xd02020 })); stripe.position.y = 0.45 * k; g.add(stripe);
      addEntity(b, g, { kind: 'pin' }); g.position.copy(b.position); b.sleep();
    }
  }
  buildCrates() {
    const wood = new THREE.MeshStandardMaterial({ color: 0xb08850, roughness: 0.9, flatShading: true }), R = rng(31);
    for (let g = 0; g < 4; g++) {
      const bx = (R() < 0.5 ? -1 : 1) * (4 + R() * 3), bz = -70 - g * 55;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3 - r; c++) {
        const b = new CANNON.Body({ mass: 25, material: M.debris, shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)) });
        b.position.set(bx + (c - (2 - r) / 2) * 1.05, 0.51 + r * 1.02, bz); b.collisionFilterGroup = GROUP.DEBRIS; b.collisionFilterMask = ALL; b.allowSleep = true;
        const m = new THREE.Mesh(boxGeo(1, 1, 1), wood); m.castShadow = m.receiveShadow = true; addEntity(b, m, { kind: 'crate' }); m.position.copy(b.position); b.sleep();
      }
    }
  }
  buildEnd() {
    const k = Math.max(0.6, QUAL[S.quality].chunks);
    for (let i = -1; i <= 1; i++) this.breakables.push(new Breakable(this, { x: i * 6.6, z: -440, yaw: 0, s: 1.2, y: 0 }, 6.4, 3.2, 1.2, Math.round(8 * k), Math.round(5 * k)));
    for (let i = -1; i <= 1; i++) this.breakables.push(new Breakable(this, { x: i * 6.6, z: -452, yaw: 0, s: 1.2, y: 0 }, 6.4, 3.8, 1.2, Math.round(8 * k), Math.round(6 * k)));
  }

  // ---------------- objects ----------------
  staticBox(hx, hy, hz, pos, mesh, q) {
    const b = new CANNON.Body({ mass: 0, material: M.ground, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) });
    b.position.set(pos.x, pos.y, pos.z); if (q) b.quaternion.copy(q.isQuaternion ? cq(q) : q);
    b.collisionFilterGroup = GROUP.STATIC; b.collisionFilterMask = ALL;
    const e = addEntity(b, mesh, { kind: 'static', static: true });
    if (mesh) { mesh.position.copy(b.position); mesh.quaternion.copy(b.quaternion); mesh.castShadow = mesh.receiveShadow = true; }
    return e;
  }
  buildObject(src, i) {
    const o = { ...src, y: src.y + this.height(src.x, src.z) };      // elevated surfaces (roof, stairs…) lift the object with them
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 3, 14), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    const r = Math.max(2.4, ({ ramp: 5, boost: 4, bounce: 3, wall: 3.6, piston: 5, block: 2.6, oil: 3.6, mine: 1.8, barrel: 1.4 })[o.type] * o.s);
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
  build_bounce(o) {
    const r = 2.6 * o.s, g = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, 0.45, 24), mat(0x30323a, { roughness: 0.5 })); rim.position.y = 0.22;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.1, 24), new THREE.MeshStandardMaterial({ map: trampTex(), emissive: 0xffffff, emissiveMap: trampTex(), emissiveIntensity: 0.9, roughness: 0.4 })); top.position.y = 0.47;
    g.add(rim, top); g.position.set(o.x, o.y, o.z); g.traverse(c => { if (c.isMesh) { c.castShadow = c.receiveShadow = true; } }); levelGroup.add(g);
    this.zones.push({ type: 'bounce', x: o.x, z: o.z, y: o.y, r: r * 0.95, s: o.s, top });
    this.anim.push(t => { top.material.emissiveIntensity = 0.7 + Math.sin(t * 6) * 0.3; });
    this.staticBox(r * 0.7, 0.22, r * 0.7, new THREE.Vector3(o.x, o.y + 0.22, o.z), null);
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
  build_wall(o) {
    const k = QUAL[S.quality].chunks;
    this.breakables.push(new Breakable(this, o, 6.4 * o.s, 2.6 * o.s, 0.9 * Math.max(1, o.s * 0.8), Math.max(5, Math.round(8 * k)), Math.max(3, Math.round(4 * o.s * k))));
  }
  build_block(o) {
    const s = o.s, m = new THREE.Mesh(boxGeo(3 * s, 2 * s, 3 * s), new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.9, flatShading: true }));
    this.staticBox(1.5 * s, s, 1.5 * s, new THREE.Vector3(o.x, o.y + s, o.z), m, qYaw(o.yaw));
  }
  build_barrel(o) {
    const s = o.s, b = new CANNON.Body({ mass: 18 * s * s * s, material: M.debris, shape: new CANNON.Box(new CANNON.Vec3(0.3 * s, 0.45 * s, 0.3 * s)) });
    b.position.set(o.x, o.y + 0.46 * s, o.z); b.quaternion.setFromEuler(0, o.yaw, 0);
    b.collisionFilterGroup = GROUP.DEBRIS; b.collisionFilterMask = ALL; b.allowSleep = true; b.sleepSpeedLimit = 0.3;
    const me = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * s, 0.34 * s, 0.9 * s, 10), new THREE.MeshStandardMaterial({ color: 0x2e63c4, roughness: 0.4, metalness: 0.3, flatShading: true }));
    me.castShadow = me.receiveShadow = true; addEntity(b, me, { kind: 'barrel' }); me.position.copy(b.position); b.sleep();
  }
  build_piston(o) {
    const s = o.s, ax = new THREE.Vector3(Math.cos(o.yaw), 0, -Math.sin(o.yaw));
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
    const r = this.pickers[i].userData.r, g = new THREE.Group(), y = o.y + this.height(o.x, o.z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.35, 40), new THREE.MeshBasicMaterial({ color: 0xffc02a, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 4), new THREE.MeshBasicMaterial({ color: 0xffc02a }));
    arrow.rotation.x = -Math.PI / 2; arrow.position.set(0, 0.2, -r - 1.2);
    g.add(ring, arrow); g.position.set(o.x, y + 0.08, o.z); g.rotation.y = o.yaw;
    this.selRing = g; this.editGroup.add(g);
  }
  moveSelRing(x, z) { if (this.selRing) this.selRing.position.set(x, this.height(x, z) + (this.objects[S.sel]?.y || 0) + 0.08, z); }
  setEditorVisible(v) { this.editGroup.visible = v; }

  // ---------------- route ribbon ----------------
  setPath(path) {
    if (this.pathMesh) { levelGroup.remove(this.pathMesh); this.pathMesh.traverse(o => o.geometry && o.geometry.dispose()); this.pathMesh = null; }
    if (!path || path.length < 2) return;
    const g = new THREE.Group(), pos = [], idx = [], hw = 0.35, hy = i => this.height(path[i][0], path[i][1]) + 0.1;
    for (let i = 0; i < path.length; i++) {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      pos.push(path[i][0] - dz * hw, hy(i), path[i][1] + dx * hw, path[i][0] + dz * hw, hy(i), path[i][1] - dx * hw);
      if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 1.3, 1.9), side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }));
    m.frustumCulled = false; g.add(m);
    const s = path[0], e = path[path.length - 1];
    const st = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20), new THREE.MeshBasicMaterial({ color: 0x4dff7c })); st.rotation.x = -Math.PI / 2; st.position.set(s[0], hy(0) + 0.02, s[1]);
    const en = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20), new THREE.MeshBasicMaterial({ color: 0xff4a4a })); en.rotation.x = -Math.PI / 2; en.position.set(e[0], hy(path.length - 1) + 0.02, e[1]);
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
        for (const w of this.breakables) if (!w.broken && w.contains(fx2, fz2, cb.position.y)) w.shatter(cb.velocity, new CANNON.Vec3(fx2, cb.position.y, fz2), Math.min(1, sp / 28));
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
      } else if (z.type === 'bounce') {
        for (const b of subj) {
          if (b.dummy && b.dummy.attached) continue;
          if (Math.hypot(b.position.x - z.x, b.position.z - z.z) < z.r && b.position.y < z.y + 1.4 && b.velocity.y < 9 && (b._bt || 0) < S.time) {
            b._bt = S.time + 0.35; b.velocity.y = (b === car?.body ? 16 : 22) * Math.sqrt(z.s); b.wakeUp();
            fx('boing', b.position.x, z.y + 0.5, b.position.z, 1);
          }
        }
        // car riding on top of the pad (its wheels are rays, so use the chassis)
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
    const fr = dummyOil ? 0.04 : (this.map.dummyFriction ?? 0.7);
    if (fr !== this._fr) { this._fr = fr; setSurface(fr, this.map.bounce); }
    // water: drag + buoyancy + splash
    const w = this.env.water;
    if (w) for (const b of subj) {
      if (b.position.y < w.y && b.position.z < w.z0 && b.position.z > w.z1) {
        if (!this.splashed.has(b)) { this.splashed.add(b); fx('splash', b.position.x, w.y, b.position.z, Math.min(2, b.velocity.length() / 15)); }
        const k = Math.exp(-2.8 * dt); b.velocity.x *= k; b.velocity.z *= k; b.velocity.y = b.velocity.y * Math.exp(-4 * dt) + (b === car?.body ? 8 : 14) * dt * Math.min(1, (w.y - b.position.y) + 0.5);
        b.angularVelocity.scale(Math.exp(-2 * dt), b.angularVelocity);
      }
    }
    // lava burns
    const lv = this.env.lava;
    if (lv && dummy && !this.burned && dummy.pelvis.body.position.y < lv.y + 2 && dummy.pelvis.body.position.z < lv.z0 && dummy.pelvis.body.position.z > lv.z1) {
      this.burned = true; const p = dummy.pelvis.body.position; fx('explosion', p.x, lv.y + 0.5, p.z, 1.2); this.hooks.lava && this.hooks.lava();
    }
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
      const k = Math.pow(1 - d / R, 1.1), isCar = b === this.car?.body, dv = (isCar ? 14 : 30) * k * (isCar ? Math.min(1, 900 / Math.max(300, this.car.spec.mass)) : 1), nx = dx / (d || 1), nz = dz / (d || 1);
      b.velocity.x += nx * dv * 0.8; b.velocity.z += nz * dv * 0.8; b.velocity.y += (isCar ? 9 : 14) * k + 2 * k;
      b.angularVelocity.x += (Math.random() - 0.5) * 8 * k; b.angularVelocity.z += (Math.random() - 0.5) * 8 * k; b.wakeUp();
    }
    for (const w of this.breakables) if (!w.broken && Math.hypot(w.x - m.x, w.z - m.z) < 9) w.shatter(new CANNON.Vec3(0, 0, 0), new CANNON.Vec3(m.x, 0.5, m.z), 0.6, true);
    if (this.hooks.explosion) this.hooks.explosion(m.x, y, m.z);
  }
  update(t) { for (const a of this.anim) a(t); for (const a of this.env.anim) a(t); }
}

class Breakable {
  constructor(track, o, w, h, d, cols, rows) {
    this.track = track; this.x = o.x; this.z = o.z; this.y = o.y; this.yaw = o.yaw; this.w = w; this.h = h; this.d = d; this.broken = false;
    this.c = Math.cos(o.yaw); this.sn = Math.sin(o.yaw);
    const cmat = new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.9, flatShading: true });
    const solid = new THREE.Mesh(boxGeo(w, h, d), cmat);
    this.solid = track.staticBox(w / 2, h / 2, d / 2, new THREE.Vector3(o.x, o.y + h / 2, o.z), solid, qYaw(o.yaw));
    this.solid.static = false;     // its visibility changes when it shatters (recorded for replay)
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
