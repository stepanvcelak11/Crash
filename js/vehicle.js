// Generic raycast vehicle (car, cart, kart, van, monster truck) with vertex soft-body deformation,
// detachable parts and shattering glass. Everything is driven by a spec from vehicles.js.
import { THREE, CANNON, GROUP, ALL, M, S, world, addEntity, mat, paint, activateEntity, disposers } from './engine.js';
import { fx } from './fx.js';

const P = (x, y, z) => new THREE.Vector3(x, y, z);
const _rv = new CANNON.Vec3();
const hash = i => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export class Car {
  constructor(spec, x, z, yaw = 0, color = null, y0 = 0, pitch = 0) {
    this.spec = spec;
    const body = new CANNON.Body({ mass: spec.mass, material: M.car, linearDamping: 0.01, angularDamping: 0.25 });
    for (const s of spec.shapes) body.addShape(new CANNON.Box(new CANNON.Vec3(...s.h)), new CANNON.Vec3(...s.o));
    body.position.set(x, y0 + spec.rideY, z);
    const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch));
    body.quaternion.set(q0.x, q0.y, q0.z, q0.w);
    this.y0 = y0; this.launchT = 0; this.power = 1;
    body.collisionFilterGroup = GROUP.CAR; body.collisionFilterMask = ALL;
    body.allowSleep = false;
    this.body = body;

    const w = spec.wheels;
    this.vehicle = new CANNON.RaycastVehicle({ chassisBody: body, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
    const wopt = {
      radius: w.r, directionLocal: new CANNON.Vec3(0, -1, 0), axleLocal: new CANNON.Vec3(-1, 0, 0),
      suspensionStiffness: w.stiff, suspensionRestLength: w.rest, maxSuspensionTravel: w.travel, maxSuspensionForce: 1e5 * (spec.mass / 900),
      dampingRelaxation: w.damp[0], dampingCompression: w.damp[1], frictionSlip: w.slip, rollInfluence: w.roll,
      useCustomSlidingRotationalSpeed: true, customSlidingRotationalSpeed: -30,
    };
    this.rs = w.rs || [w.r, w.r, w.r, w.r];
    w.pts.forEach((p, i) => {
      const py = w.rs ? w.rest + this.rs[i] - spec.rideY : p[1];   // per-wheel radius: keep every wheel touching the ground
      this.vehicle.addWheel(Object.assign({}, wopt, { radius: this.rs[i], chassisConnectionPointLocal: new CANNON.Vec3(p[0], py, p[2]) }));
    });
    this.vehicle.addToWorld(world);
    disposers.push(() => this.vehicle.removeFromWorld(world));
    this.slipMul = 1;

    // ---- visuals ----
    this.group = new THREE.Group();
    const col = color ?? spec.color;
    const mats = {
      body: paint(col, { vertexColors: true }),
      trim: mat(0x222226, { roughness: 0.6, vertexColors: true }),
      dark: mat(0x2b2b30, { roughness: 0.7, vertexColors: true }),
      wire: mat(0xc9d1da, { roughness: 0.45, metalness: 0.5, vertexColors: true, wireframe: true, flatShading: false }),
    };
    this.parts = [];
    for (const def of spec.parts) {
      const g = new THREE.BoxGeometry(...def.size, ...def.seg);
      const n = g.attributes.position.count;
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      const p = { def, geo: g, base: g.attributes.position.array.slice(), center: P(...def.pos), damage: 0, detached: false, detachFrame: Infinity };
      p.mesh = new THREE.Mesh(g, mats[def.mat] || mats.body);
      p.mesh.position.copy(p.center); p.mesh.castShadow = def.mat !== 'wire'; p.mesh.receiveShadow = true; p.mesh.frustumCulled = false;
      this.group.add(p.mesh);
      this.parts.push(p);
    }
    this.partMap = Object.fromEntries(this.parts.map(p => [p.def.name, p]));
    this.glassBroken = false; this.glassFrame = Infinity; this.glass = null;
    if (spec.glass) {
      this.glass = new THREE.Mesh(new THREE.BoxGeometry(...spec.glass.size), new THREE.MeshStandardMaterial({ color: 0x9fd0ff, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.45, flatShading: true }));
      this.glass.position.set(...spec.glass.pos); this.group.add(this.glass);
    }
    if (spec.lights) {
      const hl = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xfff2b0, emissiveIntensity: 3 });
      const tl = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 2.2 });
      const front = this.partMap.bumperF || this.parts[0];
      front.lights = [];
      for (const pt of spec.lights.head) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.05), hl); m.position.set(...pt); this.group.add(m); front.lights.push(m); }
      for (const pt of spec.lights.tail) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.05), tl); m.position.set(...pt); this.group.add(m); }
    }
    this.entity = addEntity(body, this.group, { kind: 'car' });

    // ---- wheels: visual entities driven by the raycast vehicle + dormant free wheels ----
    this.wheels = [];
    const tireMat = mat(0x151515, { roughness: 0.9 }), hubMat = mat(0xb8bcc4, { metalness: 0.7, roughness: 0.3 });
    const mkTire = r => { const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w.w, r > 0.5 ? 20 : 14), tireMat); t.rotation.z = Math.PI / 2; t.castShadow = true; return t; };
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group(); g.add(mkTire(this.rs[i]));
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(this.rs[i] * 0.5, this.rs[i] * 0.5, w.w + 0.02, 6), hubMat); hub.rotation.z = Math.PI / 2; g.add(hub);
      const proxy = { position: new CANNON.Vec3(), quaternion: new CANNON.Quaternion() };
      const ent = addEntity(proxy, g, { kind: 'wheel', noWorld: true }); ent.noWorld = true; ent.inWorld = false;
      const fb = new CANNON.Body({ mass: Math.max(4, spec.mass / 36), material: M.debris, shape: new CANNON.Box(new CANNON.Vec3(w.w / 2, this.rs[i] * 0.95, this.rs[i] * 0.95)) });
      fb.collisionFilterGroup = GROUP.DEBRIS; fb.collisionFilterMask = ALL & ~GROUP.CAR;
      const fg = new THREE.Group(); fg.add(mkTire(this.rs[i])); fg.visible = false;
      const fent = addEntity(fb, fg, { kind: 'freewheel', dormant: true });
      this.wheels.push({ ent, proxy, free: fent, off: false, offFrame: Infinity });
    }
    // detached parts
    for (const p of this.parts) {
      if (p.def.limit === Infinity) continue;
      const sz = p.def.size;
      const fb = new CANNON.Body({ mass: THREE.MathUtils.clamp(sz[0] * sz[1] * sz[2] * 90, 3, 80), material: M.debris, shape: new CANNON.Box(new CANNON.Vec3(sz[0] / 2, Math.max(sz[1] / 2, 0.04), Math.max(sz[2] / 2, 0.03))) });
      fb.collisionFilterGroup = GROUP.DEBRIS; fb.collisionFilterMask = ALL & ~GROUP.CAR;
      const fm = new THREE.Mesh(p.geo, p.mesh.material); fm.castShadow = true; fm.visible = false; fm.frustumCulled = false;
      p.free = addEntity(fb, fm, { kind: 'part', dormant: true });
    }

    this.dentLog = []; this.totalDent = 0;
    this.engineOn = false; this.target = 0; this.steerInput = 0;
    this.crashed = false; this.burning = false; this.slick = false;
    this.dummy = null; this.onDamage = null; this.hitCool = 0;
    body.addEventListener('collide', e => this.onCollide(e));
    this.contacts = [false, false, false, false];
    this.syncWheels();
  }

  get forward() { const f = new CANNON.Vec3(0, 0, -1); this.body.quaternion.vmult(f, f); return f; }
  get speed() { return this.body.velocity.length(); }
  get fwdSpeed() { return this.body.velocity.dot(this.forward); }
  get grounded() { return this.contacts.some(Boolean); }
  get airborne() { return !this.grounded && this.body.position.y > this.y0 + this.spec.rideY + 0.7; }

  syncWheels() {
    for (let i = 0; i < 4; i++) {
      this.contacts[i] = this.vehicle.wheelInfos[i].isInContact;      // updateWheelTransform() resets the flag, so read it first
      this.vehicle.updateWheelTransform(i);
      const t = this.vehicle.wheelInfos[i].worldTransform, w = this.wheels[i];
      w.proxy.position.copy(t.position); w.proxy.quaternion.copy(t.quaternion);
      if (this.spec.wheels.center) {      // outrigger physics wheels, drawn on the centre line (bikes)
        const sh = this.spec.wheels.pts[i][0], q = this.body.quaternion; _rv.set(1, 0, 0); q.vmult(_rv, _rv);
        w.proxy.position.x -= _rv.x * sh; w.proxy.position.y -= _rv.y * sh; w.proxy.position.z -= _rv.z * sh;
      }
      w.ent.mesh.position.set(w.proxy.position.x, w.proxy.position.y, w.proxy.position.z);
      w.ent.mesh.quaternion.set(t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w);
    }
  }

  step(dt) {
    const v = this.vehicle, b = this.body, sp = this.spec, m = sp.mass, fl = sp.fly;
    const slip = this.slick ? 0.45 * Math.min(1, this.slipMul * 2) : sp.wheels.slip * this.slipMul;
    const load = 1;      // springs must also carry the rider's weight
    for (let i = 0; i < 4; i++) { const wi = v.wheelInfos[i]; wi.frictionSlip = slip; wi.suspensionStiffness = Math.min(sp.wheels.stiff * load, Math.max(sp.wheels.stiff, 75)); wi.dampingCompression = sp.wheels.damp[1] * Math.sqrt(load); wi.dampingRelaxation = sp.wheels.damp[0] * Math.sqrt(load); wi.maxSuspensionForce = 1e5 * (m / 900) * load; }
    let steer = 0;
    if (this.engineOn && !this.crashed) {
      if (!fl) {
        const err = this.target - this.fwdSpeed;
        const f = Math.max(-2.8 * m, Math.min(12.2 * m * sp.accel, err * 0.78 * m * sp.accel));
        for (let i = 0; i < 4; i++) v.applyEngineForce(this.wheels[i].off ? 0 : f / 4, i);
      } else for (let i = 0; i < 4; i++) v.applyEngineForce(0, i);
      steer = this.steerInput * sp.steer / (1 + this.speed * 0.045);
    } else for (let i = 0; i < 4; i++) v.applyEngineForce(0, i);
    v.setSteeringValue(steer, 0); v.setSteeringValue(steer, 1);
    const grounded = this.grounded;
    if (grounded && !fl) { const s = this.speed; b.applyForce(new CANNON.Vec3(0, -0.0024 * m * s * s, 0)); }
    if (fl && this.engineOn) this.flight(dt);
    if (sp.upright && grounded) this.upright(dt);
    this.hitCool -= dt;
  }

  /** plane / rocket aerodynamics (simple, arcade) */
  flight(dt) {
    const b = this.body, sp = this.spec, fl = sp.fly, m = sp.mass, g = Math.abs(world.gravity.y);
    const q = b.quaternion, f = this.forward, up = new CANNON.Vec3(0, 1, 0); q.vmult(up, up);
    const right = f.cross(up), wv = b.angularVelocity, vf = this.fwdSpeed;
    const wr = wv.dot(right), wf = wv.dot(f);
    if (fl.type === 'plane') {
      const thrust = Math.max(-m, Math.min(6 * m, (this.target - vf) * 0.9 * m));
      b.applyForce(f.scale(thrust));
      const lk = Math.max(0, vf / fl.takeoff);
      if (lk > 0.75) b.applyForce(up.scale(Math.min(lk * lk, 1.7) * g * m));
      const pitch = Math.asin(Math.max(-1, Math.min(1, f.y)));
      const des = vf > fl.takeoff ? (b.position.y - this.y0 < 38 ? 0.17 : 0.0) : 0;
      const tp = m * (10 * (des - pitch) - 6 * wr) * (lk > 0.5 ? 1 : 0.1);
      const bank = this.steerInput * 0.45, tr = m * (10 * (right.y - bank) - 6 * wf) * (lk > 0.6 ? 1 : 0);
      b.torque.x += right.x * tp + f.x * tr + up.x * m * this.steerInput * 2.5 * Math.min(1, lk);
      b.torque.y += right.y * tp + f.y * tr + up.y * m * this.steerInput * 2.5 * Math.min(1, lk);
      b.torque.z += right.z * tp + f.z * tr + up.z * m * this.steerInput * 2.5 * Math.min(1, lk);
    } else if (fl.type === 'rocket') {
      const t = S.time - this.launchT;
      if (t < fl.burn) b.applyForce(f.scale(fl.thrust * g * m * (0.55 + 0.45 * this.power)));
      const v = b.velocity, s2 = v.length();
      if (s2 > 12) {
        const vd = v.scale(1 / s2), cr = f.cross(vd);
        b.torque.x += cr.x * m * 10 - wv.x * m * 5; b.torque.y += cr.y * m * 10 - wv.y * m * 5; b.torque.z += cr.z * m * 10 - wv.z * m * 5;
      }
      b.torque.x += up.x * m * this.steerInput * 3; b.torque.y += up.y * m * this.steerInput * 3; b.torque.z += up.z * m * this.steerInput * 3;
    }
  }

  /** self-balancing for bikes: velocity-level roll controller (stable at any inertia) */
  upright(dt) {
    const b = this.body, f = this.forward, up = new CANNON.Vec3(0, 1, 0); b.quaternion.vmult(up, up);
    const right = f.cross(up), wf = b.angularVelocity.dot(f), k = this.spec.upright, kd = 1.4 * Math.sqrt(k);
    const dw = dt * (k * right.y - kd * wf);
    b.angularVelocity.x += f.x * dw; b.angularVelocity.y += f.y * dw; b.angularVelocity.z += f.z * dw;
    if (this.dummy && this.dummy.attached) for (const bn of this.dummy.list) { const w = bn.body.angularVelocity; w.x += f.x * dw; w.y += f.y * dw; w.z += f.z * dw; }
  }

  onCollide(e) {
    const other = e.body;
    if (other.dummy && other.dummy.attached) return;
    const c = e.contact;
    const v = Math.abs(c.getImpactVelocityAlongNormal());
    if (v < 3.5) return;
    const b = this.body;
    const isI = c.bi === b;
    const rel = isI ? c.ri : c.rj;
    const wp = new CANNON.Vec3(b.position.x + rel.x, b.position.y + rel.y, b.position.z + rel.z);
    const push = isI ? new CANNON.Vec3(-c.ni.x, -c.ni.y, -c.ni.z) : new CANNON.Vec3(c.ni.x, c.ni.y, c.ni.z);
    const lp = b.pointToLocalFrame(wp), ld = b.vectorToLocalFrame(push);
    const mf = other.mass > 0 ? Math.min(1, other.mass / (this.spec.mass * 0.3)) : 1;
    const mag = Math.min(0.75, Math.max(0, (v - 3) * 0.05)) * mf * (this.spec.dentScale > 0.6 ? 1 : 1.4);
    if (mag > 0.02) this.dent(P(lp.x, lp.y, lp.z), P(ld.x, ld.y, ld.z).normalize(), mag, true);
    if (this.hitCool <= 0) { this.hitCool = 0.08; fx('impact', wp.x, wp.y, wp.z, v * mf); }
    if (v > 14 && this.dummy && this.dummy.attached) this.onEjectRequest && this.onEjectRequest('crash', this.body.velocity.clone());
    if (v > 9) this.crashed = this.crashed || this.totalDent > 1.4;
  }

  dent(lp, dir, mag, log = true) {
    const R = (0.75 + mag * 1.2) * this.spec.dentScale;
    for (const p of this.parts) {
      if (p.detached) continue;
      const pos = p.geo.attributes.position.array, col = p.geo.attributes.color.array, base = p.base;
      const cx = p.center.x, cy = p.center.y, cz = p.center.z;
      const pd = Math.hypot(lp.x - cx, lp.y - cy, lp.z - cz);
      const sz = p.def.size, reach = Math.max(sz[0], sz[1], sz[2]) * 0.5 + R;
      if (pd > reach) continue;
      let moved = false;
      const lim = 0.8 * this.spec.dentScale;
      for (let i = 0; i < pos.length; i += 3) {
        const vx = pos[i] + cx, vy = pos[i + 1] + cy, vz = pos[i + 2] + cz;
        const d = Math.hypot(vx - lp.x, vy - lp.y, vz - lp.z);
        if (d >= R) continue;
        const w = Math.pow(1 - d / R, 1.4), h = hash(i + p.def.name.length * 31);
        const k = mag * w * (0.65 + 0.7 * h) * this.spec.dentScale;
        let nx = pos[i] + dir.x * k + (h - 0.5) * 0.25 * k, ny = pos[i + 1] + dir.y * k + (hash(i + 7) - 0.5) * 0.25 * k, nz = pos[i + 2] + dir.z * k + (hash(i + 13) - 0.5) * 0.25 * k;
        const bx = nx - base[i], by = ny - base[i + 1], bz = nz - base[i + 2], bl = Math.hypot(bx, by, bz);
        if (bl > lim) { const s = lim / bl; nx = base[i] + bx * s; ny = base[i + 1] + by * s; nz = base[i + 2] + bz * s; }
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
      const g = this.spec.glass;
      if (g && !this.glassBroken && mag > 0.14 && Math.hypot(lp.x - g.pos[0], lp.y - g.pos[1], lp.z - g.pos[2]) < Math.max(...g.size) * 1.1) this.breakGlass();
      if (mag > 0.28) for (let i = 0; i < 4; i++) {
        const w = this.wheels[i]; if (w.off) continue;
        const cp = this.vehicle.wheelInfos[i].chassisConnectionPointLocal;
        if (Math.hypot(lp.x - cp.x, lp.y - cp.y, lp.z - cp.z) < this.spec.wheels.r * 2.6 + 0.3 && Math.random() < 0.7) this.detachWheel(i);
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
    p.detached = true; p.detachFrame = S.time; p.mesh.visible = false;
    if (p.lights) for (const l of p.lights) l.visible = false;
    const f = p.free, b = f.body, cb = this.body;
    const wp = cb.pointToWorldFrame(new CANNON.Vec3(p.center.x, p.center.y, p.center.z));
    b.position.copy(wp); b.quaternion.copy(cb.quaternion); b.velocity.copy(cb.velocity);
    b.velocity.x += (Math.random() - 0.5) * 5; b.velocity.y += 3 + Math.random() * 3; b.velocity.z += (Math.random() - 0.5) * 5;
    b.angularVelocity.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    activateEntity(f, true); f.mesh.position.copy(wp);
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

  /** Rebuild deformation for replay time t */
  restoreAt(t) {
    for (const p of this.parts) { p.geo.attributes.position.array.set(p.base); p.geo.attributes.color.array.fill(1); p.detached = false; }
    for (const d of this.dentLog) {
      if (d.t > t) break;
      for (const p of this.parts) p.detached = p.detachFrame <= d.t;
      this.dent(P(...d.p), P(...d.d), d.m, false);
    }
    for (const p of this.parts) {
      p.detached = isFinite(p.detachFrame) && p.detachFrame <= t;
      p.mesh.visible = !p.detached;
      if (p.lights) for (const l of p.lights) l.visible = !p.detached;
      p.geo.attributes.position.needsUpdate = true; p.geo.attributes.color.needsUpdate = true;
    }
    if (this.glass) this.glass.visible = !(isFinite(this.glassFrame) && this.glassFrame <= t);
    for (const w of this.wheels) w.ent.mesh.visible = !(isFinite(w.offFrame) && w.offFrame <= t);
  }
}
