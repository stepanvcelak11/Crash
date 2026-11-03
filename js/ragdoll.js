// Rigged ragdoll dummy: 17 bones, cone-twist joints, per-bone fracture / dislocation model.
import { THREE, CANNON, GROUP, ALL, M, S, world, addEntity, mat } from './engine.js';

const PI = Math.PI;
const B = (name, parent, attach, half, ext, mass, o) => Object.assign({ name, parent, attach, half, ext, mass }, o);

// attach = joint position in parent frame (from parent's proximal joint); ext = joint -> bone centre.
// fracV = impact speed (m/s) that fractures, torqueW = angular-velocity jump (rad/s per step) that dislocates, pts = score value.
export const BONES = [
  B('pelvis', null, [0, 0, 0], [0.16, 0.10, 0.10], [0, 0.10, 0], 10, { label: 'Pánev', fracV: 17, torqueW: 24, pts: 450, color: 0xf2c230, ang: 0, tw: 0 }),
  B('abdomen', 'pelvis', [0, 0.20, 0], [0.15, 0.10, 0.09], [0, 0.10, 0], 5, { label: 'Bederní páteř', fracV: 15, torqueW: 20, pts: 400, color: 0xf2c230, ang: 0.45, tw: 0.35 }),
  B('chest', 'abdomen', [0, 0.20, 0], [0.19, 0.15, 0.11], [0, 0.15, 0], 12, { label: 'Hrudník', fracV: 16, torqueW: 20, pts: 500, color: 0xf2c230, ang: 0.45, tw: 0.35 }),
  B('neck', 'chest', [0, 0.30, 0], [0.05, 0.05, 0.05], [0, 0.05, 0], 1.5, { label: 'Krk', fracV: 11, torqueW: 14, pts: 700, color: 0xdddddd, ang: 0.55, tw: 0.5 }),
  B('head', 'neck', [0, 0.10, 0], [0.12, 0.12, 0.12], [0, 0.12, 0], 5, { label: 'Hlava', fracV: 13, torqueW: 16, pts: 800, color: 0xeeeeee, sphere: true, ang: 0.7, tw: 0.6 }),
  B('upperArmL', 'chest', [0.24, 0.27, 0], [0.05, 0.14, 0.05], [0, -0.14, 0], 2.2, { label: 'L paže', fracV: 12, torqueW: 24, pts: 200, color: 0xdddddd, ang: 1.5, tw: 1.0 }),
  B('foreArmL', 'upperArmL', [0, -0.28, 0], [0.045, 0.13, 0.045], [0, -0.13, 0], 1.5, { label: 'L předloktí', fracV: 11, torqueW: 26, pts: 150, color: 0xdddddd, ang: 0.9, tw: 0.2 }),
  B('handL', 'foreArmL', [0, -0.26, 0], [0.04, 0.05, 0.025], [0, -0.05, 0], 0.6, { label: 'L zápěstí', fracV: 9, torqueW: 32, pts: 100, color: 0xf2c230, ang: 0.7, tw: 0.5 }),
  B('upperArmR', 'chest', [-0.24, 0.27, 0], [0.05, 0.14, 0.05], [0, -0.14, 0], 2.2, { label: 'P paže', fracV: 12, torqueW: 24, pts: 200, color: 0xdddddd, ang: 1.5, tw: 1.0 }),
  B('foreArmR', 'upperArmR', [0, -0.28, 0], [0.045, 0.13, 0.045], [0, -0.13, 0], 1.5, { label: 'P předloktí', fracV: 11, torqueW: 26, pts: 150, color: 0xdddddd, ang: 0.9, tw: 0.2 }),
  B('handR', 'foreArmR', [0, -0.26, 0], [0.04, 0.05, 0.025], [0, -0.05, 0], 0.6, { label: 'P zápěstí', fracV: 9, torqueW: 32, pts: 100, color: 0xf2c230, ang: 0.7, tw: 0.5 }),
  B('thighL', 'pelvis', [0.09, 0.02, 0], [0.075, 0.21, 0.075], [0, -0.21, 0], 8, { label: 'L stehno', fracV: 15, torqueW: 22, pts: 250, color: 0x3a6fd8, ang: 1.2, tw: 0.45 }),
  B('shinL', 'thighL', [0, -0.42, 0], [0.06, 0.21, 0.06], [0, -0.21, 0], 4, { label: 'L holeň', fracV: 13, torqueW: 24, pts: 200, color: 0x3a6fd8, ang: 0.95, tw: 0.15 }),
  B('footL', 'shinL', [0, -0.42, 0], [0.05, 0.04, 0.11], [0, -0.04, 0.06], 1, { label: 'L kotník', fracV: 10, torqueW: 30, pts: 100, color: 0x222222, ang: 0.6, tw: 0.25 }),
  B('thighR', 'pelvis', [-0.09, 0.02, 0], [0.075, 0.21, 0.075], [0, -0.21, 0], 8, { label: 'P stehno', fracV: 15, torqueW: 22, pts: 250, color: 0x3a6fd8, ang: 1.2, tw: 0.45 }),
  B('shinR', 'thighR', [0, -0.42, 0], [0.06, 0.21, 0.06], [0, -0.21, 0], 4, { label: 'P holeň', fracV: 13, torqueW: 24, pts: 200, color: 0x3a6fd8, ang: 0.95, tw: 0.15 }),
  B('footR', 'shinR', [0, -0.42, 0], [0.05, 0.04, 0.11], [0, -0.04, 0.06], 1, { label: 'P kotník', fracV: 10, torqueW: 30, pts: 100, color: 0x222222, ang: 0.6, tw: 0.25 }),
];

for (const b of BONES) b.fracV *= 1.45;   // tuned so a hard landing breaks several bones, not all of them

// joint (what the user perceives as a "bone joint") names for the X-ray / report
export const POSES = {
  sitting: { label: 'Sedící', rot: { thighL: [-PI / 2, 0, 0.05], thighR: [-PI / 2, 0, -0.05], shinL: [PI / 2, 0, 0], shinR: [PI / 2, 0, 0], upperArmL: [-0.5, 0, 0.1], upperArmR: [-0.5, 0, -0.1], foreArmL: [-0.9, 0, 0], foreArmR: [-0.9, 0, 0], abdomen: [0.05, 0, 0] }, sit: true },
  standing: { label: 'Stojící', rot: { upperArmL: [0, 0, 0.12], upperArmR: [0, 0, -0.12] } },
  superman: { label: 'Superman', rot: { pelvis: [PI / 2, 0, 0], upperArmL: [PI, 0, 0.1], upperArmR: [PI, 0, -0.1], chest: [-0.2, 0, 0], head: [-0.3, 0, 0] } },
  bent: { label: 'Skloněný', rot: { abdomen: [0.8, 0, 0], chest: [0.6, 0, 0], head: [-0.6, 0, 0], thighL: [-0.7, 0, 0.05], thighR: [-0.7, 0, -0.05], shinL: [1.1, 0, 0], shinR: [1.1, 0, 0], footL: [-0.4, 0, 0], footR: [-0.4, 0, 0], upperArmL: [-0.6, 0, 0.1], upperArmR: [-0.6, 0, -0.1], foreArmL: [-0.5, 0, 0], foreArmR: [-0.5, 0, 0] } },
  salto: { label: 'Salto', spin: 8, rot: { thighL: [-1.9, 0, 0.1], thighR: [-1.9, 0, -0.1], shinL: [2.2, 0, 0], shinR: [2.2, 0, 0], abdomen: [0.5, 0, 0], chest: [0.45, 0, 0], head: [0.3, 0, 0], upperArmL: [-1.4, 0, 0.2], upperArmR: [-1.4, 0, -0.2], foreArmL: [-1.9, 0, 0], foreArmR: [-1.9, 0, 0] } },
  armsup: { label: 'Vzpažený', rot: { upperArmL: [PI * 0.97, 0, 0.15], upperArmR: [PI * 0.97, 0, -0.15] } },
  tpose: { label: 'T', rot: { upperArmL: [0, 0, PI / 2], upperArmR: [0, 0, -PI / 2] } },
};

const _e = new THREE.Euler(), _v = new THREE.Vector3();

// forward kinematics -> world transforms of every bone for a pose
export function poseTransforms(pose, rootPos, rootQuat) {
  const def = POSES[pose] || POSES.standing;
  const out = {};
  for (const b of BONES) {
    const lq = new THREE.Quaternion().setFromEuler(_e.set(...(def.rot[b.name] || [0, 0, 0]), 'XYZ'));
    const parent = b.parent ? out[b.parent] : null;
    let joint, q;
    if (!parent) { joint = rootPos.clone(); q = rootQuat.clone().multiply(lq); }
    else { joint = parent.joint.clone().add(_v.set(...b.attach).applyQuaternion(parent.q)); q = parent.q.clone().multiply(lq); }
    const center = joint.clone().add(new THREE.Vector3(...b.ext).applyQuaternion(q));
    out[b.name] = { joint, q, center };
  }
  return out;
}
// lowest world-space y reached by the posed skeleton (conservative AABB of each box)
export function lowestPoint(tr) {
  let low = Infinity;
  for (const b of BONES) {
    const t = tr[b.name];
    const m = new THREE.Matrix4().makeRotationFromQuaternion(t.q);
    const e = m.elements; // column-major
    const ext = Math.abs(e[1]) * b.half[0] + Math.abs(e[5]) * b.half[1] + Math.abs(e[9]) * b.half[2];
    low = Math.min(low, t.center.y - (b.sphere ? b.half[1] : ext));
  }
  return low;
}

// ---- visual builders ----
const jointMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.6, flatShading: true });
const jointGeo = new THREE.IcosahedronGeometry(0.055, 0); jointGeo.userData.shared = true;
export function buildBoneMesh(b, colorOverride, noJoint) {
  const m = mat(colorOverride ?? b.color, { roughness: 0.5 });
  let g;
  if (b.sphere) g = new THREE.IcosahedronGeometry(b.half[0], 1);
  else g = new THREE.BoxGeometry(b.half[0] * 2, b.half[1] * 2, b.half[2] * 2);
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true; mesh.receiveShadow = true;
  if (!noJoint && b.parent) {
    const j = new THREE.Mesh(jointGeo, jointMat);
    j.position.set(-b.ext[0], -b.ext[1], -b.ext[2]); j.castShadow = true;
    mesh.add(j);
  }
  if (b.name === 'head') { // eyes / visor so facing direction reads
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, flatShading: true }));
    v.position.set(0, 0.02, 0.115); mesh.add(v);
  }
  return mesh;
}

export class Dummy {
  /** @param {string} pose  @param {THREE.Vector3} rootPos pelvis-bottom joint position  @param {THREE.Quaternion} rootQuat */
  constructor(pose, rootPos, rootQuat) {
    this.pose = pose;
    this.bones = {}; this.list = [];
    this.attached = false; this.lock = null; this.freeAt = 0; this.ejected = false;
    this.contactTime = -10;
    this.tr = poseTransforms(pose, rootPos, rootQuat);
    const joints = [];
    for (const def of BONES) {
      const t = this.tr[def.name];
      const body = new CANNON.Body({ mass: def.mass, material: M.dummy, linearDamping: 0.02, angularDamping: 0.25 });
      body.addShape(def.sphere ? new CANNON.Sphere(def.half[0]) : new CANNON.Box(new CANNON.Vec3(...def.half)));
      body.position.set(t.center.x, t.center.y, t.center.z);
      body.quaternion.set(t.q.x, t.q.y, t.q.z, t.q.w);
      body.collisionFilterGroup = GROUP.DUMMY; body.collisionFilterMask = ALL;
      body.allowSleep = true; body.sleepSpeedLimit = 0.15; body.sleepTimeLimit = 0.8;
      const mesh = buildBoneMesh(def);
      const entity = addEntity(body, mesh, { kind: 'bone' });
      mesh.position.copy(t.center); mesh.quaternion.copy(t.q);
      const bone = { def, body, mesh, entity, dmg: 0, fractured: false, dislocated: false, lastW: new CANNON.Vec3(), peak: 0 };
      body.bone = bone; body.dummy = this;
      body.addEventListener('collide', e => this.onCollide(bone, e));
      this.bones[def.name] = bone; this.list.push(bone);
      if (def.parent) joints.push([def, this.bones[def.parent]]);
    }
    // joints
    for (const [def, pb] of joints) {
      const cb = this.bones[def.name];
      const t = this.tr[def.name];
      const jw = new CANNON.Vec3(t.joint.x, t.joint.y, t.joint.z);
      const dirW = new THREE.Vector3(...def.ext).normalize().applyQuaternion(t.q);
      const aw = new CANNON.Vec3(dirW.x, dirW.y, dirW.z);
      const c = new CANNON.ConeTwistConstraint(pb.body, cb.body, {
        pivotA: pb.body.pointToLocalFrame(jw), pivotB: cb.body.pointToLocalFrame(jw),
        axisA: pb.body.vectorToLocalFrame(aw), axisB: cb.body.vectorToLocalFrame(aw),
        angle: def.ang, twistAngle: def.tw, maxForce: 4e5, collideConnected: false,
      });
      world.addConstraint(c);
    }
    this.pelvis = this.bones.pelvis; this.head = this.bones.head; this.chest = this.bones.chest;
    this.onFracture = null; this.onDislocate = null;
  }

  /** pin the dummy to a moving vehicle until it's ejected / the car crashes */
  attachTo(chassis) {
    this.attached = true;
    this.lock = new CANNON.LockConstraint(chassis, this.pelvis.body, { maxForce: 3e5 });
    world.addConstraint(this.lock);
    this.chassis = chassis;
    for (const b of this.list) b.body.collisionFilterMask = ALL & ~GROUP.CAR;
  }
  eject(vel, extraUp = 0) {
    if (!this.attached) return false;
    world.removeConstraint(this.lock); this.lock = null; this.attached = false; this.ejected = true;
    this.freeAt = S.time + 0.3;
    this.contactTime = S.time;
    for (const b of this.list) { b.body.velocity.set(vel.x, vel.y + extraUp, vel.z); b.body.wakeUp(); }
    const spin = (POSES[this.pose] || {}).spin;
    if (spin) this.spin(spin);
    return true;
  }
  /** give the whole ragdoll a pitch spin about its own (local) X axis */
  spin(w) {
    const q = this.pelvis.body.quaternion;
    const axis = new CANNON.Vec3(1, 0, 0); q.vmult(axis, axis);
    // pose root may be rotated (superman etc.) - use the pelvis yaw only
    const fwd = new CANNON.Vec3(0, 0, 1); q.vmult(fwd, fwd);
    const yaw = Math.atan2(fwd.x, fwd.z);
    const ax = new CANNON.Vec3(Math.cos(yaw), 0, -Math.sin(yaw));
    const c = this.centerOfMass();
    for (const b of this.list) {
      const r = b.body.position.vsub(c);
      const wv = new CANNON.Vec3(ax.x * w, ax.y * w, ax.z * w);
      const lv = wv.cross(r);
      b.body.velocity.vadd(lv, b.body.velocity);
      b.body.angularVelocity.set(wv.x, wv.y, wv.z);
    }
  }
  centerOfMass() {
    const c = new CANNON.Vec3(); let m = 0;
    for (const b of this.list) { c.x += b.body.position.x * b.def.mass; c.y += b.body.position.y * b.def.mass; c.z += b.body.position.z * b.def.mass; m += b.def.mass; }
    c.scale(1 / m, c); return c;
  }
  launch(vel, angVel) {
    for (const b of this.list) { b.body.velocity.copy(vel); if (angVel) b.body.angularVelocity.copy(angVel); b.body.wakeUp(); }
    const spin = (POSES[this.pose] || {}).spin; if (spin) this.spin(spin);
  }
  setCollideWithCar(on) {
    for (const b of this.list) b.body.collisionFilterMask = on ? ALL : ALL & ~GROUP.CAR;
  }

  onCollide(bone, e) {
    const other = e.body;
    if (other.dummy === this) return;
    if (this.attached) return;
    let v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (v < 2.2) return;
    this.contactTime = S.time;
    let f = 1;
    if (other.mass > 0) f = Math.min(1, other.mass / (bone.def.mass * 2.5));
    v *= f;
    if (S.time < this.freeAt) v *= 0.4;
    bone.peak = Math.max(bone.peak, v);
    bone.dmg += Math.pow(v / bone.def.fracV, 2);
    if (bone.dmg >= 1 && !bone.fractured) {
      bone.fractured = true;
      bone.entity.mesh.material.emissive.setHex(0x661111);
      if (this.onFracture) this.onFracture(bone, v, bone.body.position);
    }
  }
  /** per-step torque check: sudden angular-velocity change at a bone shortly after contact */
  postStep() {
    if (this.attached) { for (const b of this.list) b.lastW.copy(b.body.angularVelocity); return; }
    const recent = S.time - this.contactTime < 0.06;
    for (const b of this.list) {
      const w = b.body.angularVelocity;
      if (recent && !b.dislocated && !b.fractured && S.time > this.freeAt) {
        const dx = w.x - b.lastW.x, dy = w.y - b.lastW.y, dz = w.z - b.lastW.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > b.def.torqueW * 2.3) {
          b.dislocated = true; b.dmg = Math.max(b.dmg, 0.5);
          if (this.onDislocate) this.onDislocate(b, d, b.body.position);
        }
      }
      b.lastW.copy(w);
    }
  }
  get speed() { return this.pelvis.body.velocity.length(); }
  get airborne() { return S.time - this.contactTime > 0.12 && this.pelvis.body.position.y > 0.9; }
}

// colour ramp for the heat map: 0 = green, 0.5 = yellow, >=1 red
export function heatColor(dmg, fractured) {
  const t = fractured ? 1 : Math.min(0.95, dmg);
  const c = new THREE.Color();
  if (t < 0.5) c.setRGB(0.15 + t * 2 * 0.85, 0.85, 0.2 * (1 - t * 2));
  else c.setRGB(1, 0.85 * (1 - (t - 0.5) * 2), 0.05);
  return c;
}
