// Arcade raycast car with vertex-based soft-body deformation, detachable parts and shattering glass.
import { THREE, CANNON, GROUP, ALL, M, S, world, addEntity, mat, activateEntity, entities, disposers } from './engine.js';
import { fx } from './fx.js';

const P = (x, y, z) => new THREE.Vector3(x, y, z);
const hash = i => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// part table: name, size, local centre, segments, detach limit
const PARTS = [
  { name: 'tub', size: [1.7, 0.56, 4.2], pos: [0, 0, 0], seg: [5, 3, 14], limit: Infinity },
  { name: 'hood', size: [1.62, 0.1, 1.35], pos: [0, 0.31, -1.42], seg: [5, 1, 5], limit: 0.9 },
  { name: 'trunk', size: [1.62, 0.1, 0.8], pos: [0, 0.31, 1.7], seg: [5, 1, 3], limit: 0.9 },
  { name: 'bumperF', size: [1.8, 0.24, 0.3], pos: [0, -0.1, -2.2], seg: [6, 2, 2], limit: 0.65 },
  { name: 'bumperR', size: [1.8, 0.24, 0.3], pos: [0, -0.1, 2.2], seg: [6, 2, 2], limit: 0.65 },
  { name: 'doorL', size: [0.09, 0.42, 1.1], pos: [0.88, 0.08, 0.3], seg: [1, 3, 5], limit: 0.7 },
  { name: 'doorR', size: [0.09, 0.42, 1.1], pos: [-0.88, 0.08, 0.3], seg: [1, 3, 5], limit: 0.7 },
  { name: 'roof', size: [1.5, 0.08, 1.9], pos: [0, 1.07, 0.25], seg: [4, 1, 5], limit: Infinity },
];

export class Car {
  constructor(x, z, yaw = 0) {
    // ---- physics ----
    const body = new CANNON.Body({ mass: 900, material: M.car, linearDamping: 0.01, angularDamping: 0.25 });
    // tub stays inside the wheelbase, nose / tail are raised, so wheels always meet a ramp before the chassis does
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.85, 0.2, 1.1)), new CANNON.Vec3(0, 0.03, 0));
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.85, 0.12, 0.5)), new CANNON.Vec3(0, 0.24, -1.65));
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.85, 0.12, 0.5)), new CANNON.Vec3(0, 0.24, 1.65));
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.72, 0.38, 0.95)), new CANNON.Vec3(0, 0.66, 0.25));
    body.position.set(x, 0.78, z);
    body.quaternion.setFromEuler(0, yaw, 0);
    body.collisionFilterGroup = GROUP.CAR; body.collisionFilterMask = ALL;
    body.allowSleep = false;
    this.body = body;

    this.vehicle = new CANNON.RaycastVehicle({ chassisBody: body, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
    const wopt = {
      radius: 0.38, directionLocal: new CANNON.Vec3(0, -1, 0), axleLocal: new CANNON.Vec3(-1, 0, 0),
      suspensionStiffness: 60, suspensionRestLength: 0.28, maxSuspensionTravel: 0.28, maxSuspensionForce: 1e5,
      dampingRelaxation: 3.4, dampingCompression: 5.5, frictionSlip: 3.4, rollInfluence: 0.04,
      useCustomSlidingRotationalSpeed: true, customSlidingRotationalSpeed: -30,
    };
    const wp = [[-0.95, 0, -1.4], [0.95, 0, -1.4], [-0.95, 0, 1.35], [0.95, 0, 1.35]]; // FL FR RL RR (front = -z)
    for (const p of wp) this.vehicle.addWheel(Object.assign({}, wopt, { chassisConnectionPointLocal: new CANNON.Vec3(...p) }));
    this.vehicle.addToWorld(world);
    disposers.push(() => this.vehicle.removeFromWorld(world));

    // ---- visuals ----
    this.group = new THREE.Group();
    this.bodyColor = 0xd8362a;
    this.parts = [];
    const bm = mat(this.bodyColor, { roughness: 0.45, metalness: 0.35, vertexColors: true });
    const trimMat = mat(0x222226, { roughness: 0.6, vertexColors: true });
    for (const def of PARTS) {
      const g = new THREE.BoxGeometry(...def.size, ...def.seg);
      const n = g.attributes.position.count;
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      const p = { def, geo: g, base: g.attributes.position.array.slice(), center: P(...def.pos), damage: 0, detached: false, detachFrame: Infinity, dents: 0 };
      p.mesh = new THREE.Mesh(g, (def.name.startsWith('bumper')) ? trimMat : bm);
      p.mesh.position.copy(p.center); p.mesh.castShadow = true; p.mesh.receiveShadow = true; p.mesh.frustumCulled = false;
      this.group.add(p.mesh);
      this.parts.push(p);
    }
    this.partMap = Object.fromEntries(this.parts.map(p => [p.def.name, p]));
    // glass greenhouse
    this.glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd0ff, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.45, flatShading: true });
    this.glass = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.78, 1.88), this.glassMat);
    this.glass.position.set(0, 0.67, 0.25); this.group.add(this.glass);
    this.glassBroken = false; this.glassFrame = Infinity;
    // lights (emissive => bloom)
    const hl = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xfff2b0, emissiveIntensity: 3 });
    const tl = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 2.2 });
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.05), hl); a.position.set(s * 0.6, 0.12, -2.37);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.05), tl); b.position.set(s * 0.6, 0.14, 2.37);
      this.group.add(a, b); this.partMap.bumperF.lights = (this.partMap.bumperF.lights || []).concat(a);
    }
    this.entity = addEntity(body, this.group, { kind: 'car' });

    // ---- wheels (visual entities with proxy transforms) + dormant free wheels ----
    this.wheels = [];
    const tireMat = mat(0x151515, { roughness: 0.9 }), hubMat = mat(0xb8bcc4, { metalness: 0.7, roughness: 0.3 });
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14), tireMat); tire.rotation.z = Math.PI / 2; tire.castShadow = true;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 6), hubMat); hub.rotation.z = Math.PI / 2;
      g.add(tire, hub);
      const proxy = { position: new CANNON.Vec3(), quaternion: new CANNON.Quaternion() };
      const ent = addEntity(proxy, g, { kind: 'wheel', noWorld: true }); ent.noWorld = true; ent.inWorld = false;
      // free wheel body
      const fb = new CANNON.Body({ mass: 25, material: M.debris, shape: new CANNON.Box(new CANNON.Vec3(0.15, 0.36, 0.36)) });
      fb.collisionFilterGroup = GROUP.DEBRIS; fb.collisionFilterMask = ALL & ~GROUP.CAR;
      const fg = new THREE.Group();
      const ft = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14), tireMat); ft.rotation.z = Math.PI / 2; ft.castShadow = true;
      fg.add(ft); fg.visible = false;
      const fent = addEntity(fb, fg, { kind: 'freewheel', dormant: true });
      this.wheels.push({ ent, proxy, free: fent, off: false, offFrame: Infinity });
    }
    // free (detached) parts
    for (const p of this.parts) {
      if (p.def.limit === Infinity) continue;
      const sz = p.def.size;
      const fb = new CANNON.Body({ mass: 18, material: M.debris, shape: new CANNON.Box(new CANNON.Vec3(sz[0] / 2, Math.max(sz[1] / 2, 0.05), sz[2] / 2)) });
      fb.collisionFilterGroup = GROUP.DEBRIS; fb.collisionFilterMask = ALL & ~GROUP.CAR;
      const fm = new THREE.Mesh(p.geo, p.mesh.material); fm.castShadow = true; fm.visible = false; fm.frustumCulled = false;
      p.free = addEntity(fb, fm, { kind: 'part', dormant: true });
      p.free.partOf = p;
    }

    // ---- state ----
    this.dentLog = [];            // {t,p:[x,y,z],d:[x,y,z],m} chassis-local, for replay
    this.totalDent = 0;
    this.engineOn = false; this.target = 0; this.steerInput = 0;
    this.crashed = false; this.burning = false; this.slick = false;
    this.lastVel = new CANNON.Vec3();
    this.dummy = null;
    this.onDamage = null;
    this.hitCool = 0;

    body.addEventListener('collide', e => this.onCollide(e));
    this.syncWheels();
  }

  get forward() { const f = new CANNON.Vec3(0, 0, -1); this.body.quaternion.vmult(f, f); return f; }
  get speed() { return this.body.velocity.length(); }
  get fwdSpeed() { return this.body.velocity.dot(this.forward); }
  get airborne() { return this.vehicle.wheelInfos.every(w => !w.isInContact) && this.body.position.y > 1.3; }

  syncWheels() {
    for (let i = 0; i < 4; i++) {
      this.vehicle.updateWheelTransform(i);
      const t = this.vehicle.wheelInfos[i].worldTransform, w = this.wheels[i];
      w.proxy.position.copy(t.position); w.proxy.quaternion.copy(t.quaternion);
      w.ent.mesh.position.set(t.position.x, t.position.y, t.position.z);
      w.ent.mesh.quaternion.set(t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w);
    }
  }

  /** per physics step */
  step(dt) {
    const v = this.vehicle, b = this.body;
    // slick surface
    for (let i = 0; i < 4; i++) v.wheelInfos[i].frictionSlip = this.slick ? 0.45 : 3.4;
    if (this.engineOn && !this.crashed) {
      const err = this.target - this.fwdSpeed;
      let f = Math.max(-2500, Math.min(11000, err * 700));
      const grounded = v.numWheelsOnGround || v.wheelInfos.filter(w => w.isInContact).length;
      for (let i = 0; i < 4; i++) v.applyEngineForce(this.wheels[i].off ? 0 : f / 4, i);
      v.setBrake(0, 0);
      var steer = this.steerInput * 0.42 / (1 + this.speed * 0.045);
    } else {
      for (let i = 0; i < 4; i++) v.applyEngineForce(0, i);
      var steer = 0;
    }
    v.setSteeringValue(steer, 0); v.setSteeringValue(steer, 1);
    // downforce keeps the arcade car planted at speed
    const grounded = v.wheelInfos.some(w => w.isInContact);
    if (grounded) { const sp = this.speed; b.applyForce(new CANNON.Vec3(0, -2.2 * sp * sp, 0)); }
    this.syncWheels();
    this.hitCool -= dt;
  }

  // ---- collisions / damage ----
  onCollide(e) {
    const other = e.body;
    if (other.dummy && other.dummy.attached) return;
    const c = e.contact;
    const v = Math.abs(c.getImpactVelocityAlongNormal());
    if (v < 3.5) return;
    const b = this.body;
    // contact point (world) + push direction into the chassis
    const isI = c.bi === b;
    const rel = isI ? c.ri : c.rj;
    const wp = new CANNON.Vec3(b.position.x + rel.x, b.position.y + rel.y, b.position.z + rel.z);
    const push = isI ? new CANNON.Vec3(-c.ni.x, -c.ni.y, -c.ni.z) : new CANNON.Vec3(c.ni.x, c.ni.y, c.ni.z);
    const lp = b.pointToLocalFrame(wp), ld = b.vectorToLocalFrame(push);
    const mf = other.mass > 0 ? Math.min(1, other.mass / 250) : 1;
    const mag = Math.min(0.75, Math.max(0, (v - 3) * 0.05)) * mf;
    if (mag > 0.02) this.dent(P(lp.x, lp.y, lp.z), P(ld.x, ld.y, ld.z).normalize(), mag, true);
    if (this.hitCool <= 0) {
      this.hitCool = 0.08;
      fx('impact', wp.x, wp.y, wp.z, v * mf);
      if (other.dummy === undefined && v > 7 && !this.crashed) { /* wall hit */ }
    }
    if (v > 14 && this.dummy && this.dummy.attached) this.onEjectRequest && this.onEjectRequest('crash', this.body.velocity.clone());
    if (v > 9) { this.crashed = this.crashed || this.totalDent > 1.4; }
  }

  /** push vertices around a chassis-local point */
  dent(lp, dir, mag, log = true, upToFrame = Infinity) {
    const R = 0.75 + mag * 1.2;
    for (const p of this.parts) {
      if (p.detached) continue;
      const pos = p.geo.attributes.position.array, col = p.geo.attributes.color.array, base = p.base;
      const cx = p.center.x, cy = p.center.y, cz = p.center.z;
      // part-level damage (distance from point to part centre)
      const pd = Math.hypot(lp.x - cx, lp.y - cy, lp.z - cz);
      const sz = p.def.size, reach = Math.max(sz[0], sz[1], sz[2]) * 0.5 + R;
      if (pd > reach) continue;
      let moved = false;
      for (let i = 0; i < pos.length; i += 3) {
        const vx = pos[i] + cx, vy = pos[i + 1] + cy, vz = pos[i + 2] + cz;
        const d = Math.hypot(vx - lp.x, vy - lp.y, vz - lp.z);
        if (d >= R) continue;
        const w = Math.pow(1 - d / R, 1.4), h = hash(i + p.def.name.length * 31);
        const k = mag * w * (0.65 + 0.7 * h);
        let nx = pos[i] + dir.x * k + (h - 0.5) * 0.25 * k, ny = pos[i + 1] + dir.y * k + (hash(i + 7) - 0.5) * 0.25 * k, nz = pos[i + 2] + dir.z * k + (hash(i + 13) - 0.5) * 0.25 * k;
        // limit total displacement from the pristine shape
        const bx = nx - base[i], by = ny - base[i + 1], bz = nz - base[i + 2], bl = Math.hypot(bx, by, bz);
        if (bl > 0.8) { const s = 0.8 / bl; nx = base[i] + bx * s; ny = base[i + 1] + by * s; nz = base[i + 2] + bz * s; }
        pos[i] = nx; pos[i + 1] = ny; pos[i + 2] = nz;
        const dk = 1 - Math.min(0.6, w * mag * 1.6);
        col[i] *= dk; col[i + 1] *= dk; col[i + 2] *= dk;
        moved = true;
      }
      if (moved) {
        p.geo.attributes.position.needsUpdate = true; p.geo.attributes.color.needsUpdate = true;
        p.geo.computeBoundingSphere();
        p.damage += mag * Math.max(0.3, 1 - pd / reach) * 1.6;
        if (log && p.damage > p.def.limit) this.detachPart(p);
      }
    }
    if (log) {
      this.totalDent += mag;
      this.dentLog.push({ t: S.time, p: [lp.x, lp.y, lp.z], d: [dir.x, dir.y, dir.z], m: mag });
      if (this.onDamage) this.onDamage(mag);
      // glass
      if (!this.glassBroken && mag > 0.14 && lp.y > 0.2 && Math.hypot(lp.x, lp.z - 0.25) < 1.9) this.breakGlass();
      // wheels
      if (mag > 0.28) for (let i = 0; i < 4; i++) {
        const w = this.wheels[i]; if (w.off) continue;
        const cp = this.vehicle.wheelInfos[i].chassisConnectionPointLocal;
        if (Math.hypot(lp.x - cp.x, lp.y - cp.y, lp.z - cp.z) < 1.1 && Math.random() < 0.7) this.detachWheel(i);
      }
      if (this.totalDent > 0.9) this.burning = true;
    }
  }
  breakGlass() {
    this.glassBroken = true; this.glass.visible = false; this.glassFrame = S.time;
    const w = this.body.position; fx('glass', w.x, w.y + 0.9, w.z);
  }
  detachPart(p) {
    if (p.detached) return;
    p.detached = true; p.detachFrame = S.time;
    p.mesh.visible = false;
    if (p.lights) for (const l of p.lights) l.visible = false;
    const f = p.free, b = f.body, cb = this.body;
    const wp = cb.pointToWorldFrame(new CANNON.Vec3(p.center.x, p.center.y, p.center.z));
    b.position.copy(wp); b.quaternion.copy(cb.quaternion);
    b.velocity.copy(cb.velocity);
    b.velocity.x += (Math.random() - 0.5) * 5; b.velocity.y += 3 + Math.random() * 3; b.velocity.z += (Math.random() - 0.5) * 5;
    b.angularVelocity.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    activateEntity(f, true);
    f.mesh.position.copy(wp);
    fx('impact', wp.x, wp.y, wp.z, 12);
    this.onPartLost && this.onPartLost(p.def.name);
  }
  detachWheel(i) {
    const w = this.wheels[i]; if (w.off) return;
    w.off = true; w.offFrame = S.time; w.ent.mesh.visible = false;
    const fb = w.free.body, t = this.vehicle.wheelInfos[i].worldTransform, cb = this.body;
    fb.position.set(t.position.x, t.position.y, t.position.z); fb.quaternion.copy(t.quaternion);
    fb.velocity.copy(cb.velocity); fb.velocity.y += 3 + Math.random() * 3; fb.velocity.x += (Math.random() - 0.5) * 6;
    fb.angularVelocity.set((Math.random() - 0.5) * 20, 0, (Math.random() - 0.5) * 20);
    activateEntity(w.free, true);
    this.vehicle.wheelInfos[i].suspensionRestLength = 0.02; this.vehicle.wheelInfos[i].radius = 0.05;
    this.onPartLost && this.onPartLost('wheel');
  }

  /** Rebuild deformation for replay time t (applies logged dents up to t, honours detach times). */
  restoreAt(t) {
    for (const p of this.parts) {
      p.geo.attributes.position.array.set(p.base); p.geo.attributes.color.array.fill(1);
    }
    const savedTotal = this.totalDent;
    for (const d of this.dentLog) {
      if (d.t > t) break;
      for (const p of this.parts) p.detached = p.detachFrame <= d.t;   // part no longer receives dents after it left
      this.dent(P(...d.p), P(...d.d), d.m, false);
    }
    this.totalDent = savedTotal;
    for (const p of this.parts) {
      p.detached = isFinite(p.detachFrame) && p.detachFrame <= t;
      p.mesh.visible = !p.detached;
      if (p.lights) for (const l of p.lights) l.visible = !p.detached;
      p.geo.attributes.position.needsUpdate = true; p.geo.attributes.color.needsUpdate = true;
    }
    this.glass.visible = !(isFinite(this.glassFrame) && this.glassFrame <= t);
    for (const w of this.wheels) w.ent.mesh.visible = !(isFinite(w.offFrame) && w.offFrame <= t);
  }
}
