// Game flow: setup -> launch (power meter) -> run -> results / replay.  Cameras, scoring, UI.
import {
  THREE, CANNON, S, renderer, scene, camera, composer, bloomPass, blurPass, view, world, sun, sunOffset, entities,
  clearLevel, syncEntities,
} from './engine.js';
import { fx, fxLog, fxState, updateParticles, clearParticles, initAudio, setMuted, engineSound, beep, setFractureFxHandler } from './fx.js';
import { Dummy, BONES, POSES, poseTransforms, lowestPoint, buildBoneMesh, heatColor } from './ragdoll.js';
import { Car } from './vehicle.js';
import { Track, SLOT_POS, OBSTACLES, CAM_POINTS, END_Z } from './track.js';
import { rec, replay } from './replay.js';

const $ = id => document.getElementById(id);
const Yaxis = new THREE.Vector3(0, 1, 0);
const H = 1 / 120;
const clamp = THREE.MathUtils.clamp;
const CAMS = [['chase', 'Chase'], ['pov', 'POV'], ['fly', 'Fly-by'], ['free', 'Free']];

let track, car, dummy;
let sc, flipAcc, airT, quietT, pendingEject, startZ;

S.slots = SLOT_POS.map(() => null);
S.slots[0] = 'ramp'; S.slots[2] = 'boost'; S.slots[4] = 'mine'; S.slots[6] = 'wall';
try { S.best = +localStorage.getItem('turbocrash.best') || 0; } catch (e) { }

// ===================================================== build / reset
function resetScore() {
  sc = { fracture: 0, dislocation: 0, air: 0, flips: 0, eject: 0, vehicle: 0, destruction: 0, nFrac: 0, nDisl: 0, nFlip: 0 };
  flipAcc = { d: 0, dn: 0, c: 0, cn: 0 }; airT = 0; quietT = 0; pendingEject = null;
  $('feed').innerHTML = '';
}
const total = () => Math.round(sc.fracture + sc.dislocation + sc.air + sc.flips + sc.eject + sc.vehicle + sc.destruction);

function build() {
  rec.data = null; replay.active = false;
  clearLevel(); clearParticles(); fxLog.length = 0; fxState.logging = false;
  S.time = 0; S.ejectTime = Infinity;
  resetScore();
  track = new Track(S.slots);
  track.hooks.wallBroken = () => addScore('destruction', 150, 'Zeď rozbita', false);
  track.hooks.explosion = () => { S.shake = 1; if (dummy && dummy.attached && car) pendingEject = { vel: car.body.velocity.clone(), up: 6 }; };
  car = null;
  if (S.place !== 'road') {
    car = new Car(0, 8, 0);
    car.body.position.y = 0.66;
    track.car = car; car.dummy = null; car.hist = new Array(20).fill(null);
    car.onDamage = m => addScore('vehicle', m * 160, null);
    car.onPartLost = n => addScore('vehicle', 120, n === 'wheel' ? 'Kolo odpadlo' : 'Díl auta odpadl', false);
    car.onEjectRequest = (r, vel) => { if (!pendingEject) pendingEject = { vel, up: 3 }; };
  }
  // ---- dummy placement ----
  const yaw = new THREE.Quaternion().setFromAxisAngle(Yaxis, Math.PI);
  const low = lowestPoint(poseTransforms(S.pose, new THREE.Vector3(), yaw));
  let tx = 0, tz = 2, ty = 0.0;
  if (car) {
    const c = car.body.position;
    if (S.place === 'inside') { tz = c.z + 0.3; ty = c.y - 0.24; }
    if (S.place === 'roof') { tz = c.z + 0.25; ty = c.y + 1.13; }
    if (S.place === 'hood') { tz = c.z - 1.4; ty = c.y + 0.39; }
  }
  dummy = new Dummy(S.pose, new THREE.Vector3(tx, ty - low + 0.01, tz), yaw);
  dummy.onFracture = (bone, v, p) => {
    sc.nFrac++; addScore('fracture', bone.def.pts, `${bone.def.label} – zlomenina!`, true);
    fx('fracture', p.x, p.y, p.z, 1, bone.def.name); S.flash = 1; S.shake = Math.max(S.shake || 0, 0.35);
  };
  dummy.onDislocate = (bone, w, p) => {
    sc.nDisl++; addScore('dislocation', bone.def.pts * 0.25, `${bone.def.label} – vykloubení`, true);
    fx('fracture', p.x, p.y, p.z, 1, bone.def.name);
  };
  if (car) car.dummy = dummy;
  syncEntities();
  if (car) car.syncWheels();
  track.setSlotsVisible(true);
  startZ = tz;
  S.mode = 'setup'; setUIMode();
  $('score').textContent = '0';
  $('result').style.display = 'none';
  $('xrayFrame').style.display = 'none';
  S.xrayUntil = 0;
  orbit.target.set(0, 1.5, orbitTargetZ); camMode();
  drawMinimap();
}

// ===================================================== scoring
let scoreShown = 0;
function addScore(key, pts, msg, bad) {
  if (S.mode !== 'running') return;
  sc[key] += pts;
  if (msg) feed(msg, Math.round(pts), bad);
}
function feed(msg, pts, bad) {
  const d = document.createElement('div');
  d.className = 'fi' + (bad ? ' bad' : '');
  d.innerHTML = `${msg} <b>+${pts}</b>`;
  const f = $('feed'); f.prepend(d);
  while (f.children.length > 7) f.lastChild.remove();
  setTimeout(() => d.remove(), 3600);
}
function scoringStep(h) {
  if (dummy && !dummy.attached) {
    if (dummy.airborne) {
      sc.air += 85 * h; airT += h;
      flipAcc.d += dummy.pelvis.body.angularVelocity.length() * h;
      const n = Math.floor(flipAcc.d / (Math.PI * 2));
      if (n > flipAcc.dn) { sc.flips += 250 * (n - flipAcc.dn); sc.nFlip += n - flipAcc.dn; feed(`Salto ×${n}`, 250 * (n - flipAcc.dn)); flipAcc.dn = n; }
    } else { if (airT > 1.2) feed(`Čas ve vzduchu ${airT.toFixed(1)} s`, Math.round(airT * 85)); airT = 0; }
  }
  if (car) {
    if (car.airborne) {
      sc.air += 40 * h; flipAcc.c += car.body.angularVelocity.length() * h;
      const n = Math.floor(flipAcc.c / (Math.PI * 2));
      if (n > flipAcc.cn) { sc.flips += 150 * (n - flipAcc.cn); sc.nFlip += n - flipAcc.cn; feed(`Auto salto ×${n}`, 150 * (n - flipAcc.cn)); flipAcc.cn = n; }
    }
  }
}

// ===================================================== launch / run
let meterT = 0;
function startLaunch() {
  if (S.mode !== 'setup') return;
  initAudio(); S.mode = 'launching'; meterT = 0; S.power = 0;
  $('meter').style.display = 'block'; $('bLaunch').classList.add('held');
  beep(440);
}
function releaseLaunch() {
  if (S.mode !== 'launching') return;
  $('meter').style.display = 'none'; $('bLaunch').classList.remove('held');
  doLaunch(Math.max(0.08, S.power));
}
function doLaunch(p) {
  S.mode = 'running'; S.time = 0; S.cam = S.cam === 'free' ? 'chase' : S.cam; camMode();
  fxLog.length = 0; fxState.logging = true;
  cs.init = false; cs.pos.copy(camera.position); cs.head.set(0, 0, -1); cs.look.copy(orbit.target); cs.sp = 0;
  track.setSlotsVisible(false);
  if (car) {
    const target = 14 + p * 50;
    car.target = target; car.engineOn = true;
    const f = car.forward, v0 = target * 0.6;
    car.body.velocity.set(f.x * v0, 0, f.z * v0);
    dummy.attachTo(car.body);
    for (const b of dummy.list) b.body.velocity.copy(car.body.velocity);
    // the car body is placed a bit high above its suspension: let it settle first
  } else {
    const sp = 12 + p * 38;
    dummy.launch(new CANNON.Vec3(0, sp * 0.34, -sp * 0.94));
    S.ejectTime = 0;
  }
  rec.start(75);
  setUIMode();
  beep(880, 0.12);
}
function doEject(user) {
  if (!dummy || !dummy.attached || !car) return;
  const v = pendingEject ? pendingEject.vel : car.body.velocity;
  const f = car.forward, sp = v.length();
  const vel = new CANNON.Vec3(v.x + f.x * 1.5, v.y, v.z + f.z * 1.5);
  dummy.eject(vel, pendingEject ? pendingEject.up : (user ? 6 : 3));
  S.ejectTime = S.time;
  addScore('eject', 100 + sp * 14, 'Figurína vyhozena!', false);
  S.shake = Math.max(S.shake || 0, 0.2);
  pendingEject = null;
  setUIMode();
}

let smokeT = 0, scrapeT = 0;
function physicsStep(h) {
  track.step(h, { car, dummy });
  if (car) { car.steerInput = S.steer ? steerAxis : 0; car.step(h); }
  world.step(h);
  S.time += h;
  if (car) car.syncWheels();
  if (dummy) dummy.postStep();
  // sudden loss of speed (wall, hard landing) throws the dummy out of the car
  if (car) {
    const hv = car.hist, i = car.histI = ((car.histI || 0) + 1) % 20, cv = car.body.velocity;
    const old = hv[i]; hv[i] = [cv.x, cv.y, cv.z];
    if (old && dummy && dummy.attached && !pendingEject && S.time > 0.6) {
      const dv = Math.hypot(cv.x - old[0], cv.y - old[1], cv.z - old[2]);
      if (dv > 11) pendingEject = { vel: new CANNON.Vec3(old[0], old[1], old[2]), up: 2 };
    }
  }
  if (pendingEject && dummy && dummy.attached) doEject(false);
  else pendingEject = null;
  if (dummy && dummy.ejected && !dummy.freeCar && S.time > dummy.freeAt) { dummy.freeCar = true; dummy.setCollideWithCar(true); }
  scoringStep(h);
  rec.tick(h);
  // continuous effects (logged so the replay shows them)
  smokeT += h; scrapeT += h;
  if (smokeT > 0.07) {
    smokeT = 0;
    if (car && car.burning && car.speed > 1) { const p = car.body.position, f = car.forward; fx('smoke', p.x + f.x * 1.4, p.y + 0.7, p.z + f.z * 1.4); }
    if (car && car.slick && car.speed > 5) { const p = car.body.position; fx('tire', p.x + (Math.random() - .5) * 1.5, 0.2, p.z + (Math.random() - .5) * 3); }
  }
  if (scrapeT > 0.05) {
    scrapeT = 0;
    if (car && car.speed > 6 && car.body.position.y < 0.55 && !car.vehicle.wheelInfos.some(w => w.isInContact)) { const p = car.body.position; fx('scrape', p.x, 0.1, p.z); }
    if (dummy && !dummy.attached && dummy.pelvis.body.position.y < 0.4 && dummy.speed > 7) { const p = dummy.pelvis.body.position; fx('scrape', p.x, 0.1, p.z); }
  }
  // end detection
  const quiet = (!dummy || dummy.speed < 0.9) && (!car || car.speed < 1.0);
  if (S.time > 3 && quiet) quietT += h; else quietT = 0;
  if ((quietT > 1.4 || S.time > 60 || rec.frames >= rec.max - 2) && S.mode === 'running') endRun();
}

function endRun() {
  S.mode = 'ended'; fxState.logging = false;
  rec.capture();
  if (car) { car.engineOn = false; engineSound(0, false); }
  S.cam = 'free'; camMode(); orbit.dist = 12; orbit.yaw = 0.6; orbit.pitch = 0.3;
  // flush air time
  if (airT > 0.4) sc.air += 0;
  showResult();
}

// ===================================================== results + heat map
const heat = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(33, 190 / 330, 0.1, 50), group: null };
heat.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
{ const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(2, 3, 4); heat.scene.add(d); }
heat.cam.position.set(0, 0.2, 5.2); heat.cam.lookAt(0, 0.1, 0);
const heatR = new THREE.WebGLRenderer({ antialias: true, alpha: true });
heatR.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); heatR.setSize(190, 330);
heatR.toneMapping = THREE.ACESFilmicToneMapping;
heatR.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border-radius:10px';
$('heat').prepend(heatR.domElement);

function showResult() {
  const T = total();
  let newBest = false;
  if (T > S.best) { S.best = T; newBest = true; try { localStorage.setItem('turbocrash.best', String(T)); } catch (e) { } }
  const row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
  $('breakdown').innerHTML =
    row(`Zlomeniny (${sc.nFrac})`, Math.round(sc.fracture)) + row(`Vykloubení (${sc.nDisl})`, Math.round(sc.dislocation)) +
    row('Čas ve vzduchu', Math.round(sc.air)) + row(`Salta / rotace (${sc.nFlip})`, Math.round(sc.flips)) +
    row('Bonus za vyhození', Math.round(sc.eject)) + row('Poškození auta', Math.round(sc.vehicle)) + row('Destrukce', Math.round(sc.destruction)) +
    `<tr class="total"><td>CELKEM</td><td>${T}</td></tr>` + row(newBest ? '🏆 NOVÝ REKORD' : 'Rekord', S.best);
  const fr = dummy.list.filter(b => b.fractured).map(b => b.def.label);
  const di = dummy.list.filter(b => b.dislocated && !b.fractured).map(b => b.def.label);
  $('fracList').innerHTML = (fr.length ? '🦴 Zlomeno: ' + fr.join(', ') : 'Žádná zlomenina.') + (di.length ? `<br><span style="color:#ffd38a">Vykloubeno: ${di.join(', ')}</span>` : '');
  // heat model
  if (heat.group) { heat.scene.remove(heat.group); }
  const g = new THREE.Group();
  const tr = poseTransforms('tpose', new THREE.Vector3(), new THREE.Quaternion());
  for (const b of dummy.list) {
    const m = buildBoneMesh(b.def, heatColor(b.dmg, b.fractured).getHex());
    m.material.roughness = 0.6;
    if (b.fractured) { m.material.emissive = heatColor(1, true); m.material.emissiveIntensity = 0.5; }
    const t = tr[b.def.name]; m.position.copy(t.center); m.quaternion.copy(t.q); g.add(m);
  }
  heat.group = g; heat.scene.add(g);
  $('result').style.display = 'block';
  setUIMode();
}

// ===================================================== X-ray
const xray = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(38, 250 / 330, 0.1, 30), bones: {} };
xray.cam.position.set(3.4, 0.3, 0); xray.cam.lookAt(0, 0.1, 0);
for (const def of BONES) {
  const g = def.sphere ? new THREE.IcosahedronGeometry(def.half[0], 1) : new THREE.BoxGeometry(def.half[0] * 2, def.half[1] * 2, def.half[2] * 2);
  const fill = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x3aa8ff, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0xbfeaff }));
  const grp = new THREE.Group(); grp.add(fill, edges); xray.scene.add(grp);
  xray.bones[def.name] = { grp, fill, edges };
}
function showXray(name) {
  S.xrayUntil = performance.now() + 1800; S.xrayBone = name; S.flash = 1;
  const d = BONES.find(b => b.name === name);
  $('xrayBone').textContent = d ? d.label.toUpperCase() : '';
  $('xrayFrame').style.display = 'block';
  for (const k in xray.bones) { const on = k === name; xray.bones[k].fill.material.color.setHex(on ? 0xff2a2a : 0x3aa8ff); xray.bones[k].fill.material.opacity = on ? 0.85 : 0.28; xray.bones[k].edges.material.color.setHex(on ? 0xffb0b0 : 0xbfeaff); }
}
setFractureFxHandler(showXray);

// ===================================================== cameras
const orbit = { yaw: 0, pitch: 0.42, dist: 36, target: new THREE.Vector3(0, 1.5, -6) };
let orbitTargetZ = -6;
const cs = { pos: new THREE.Vector3(0, 8, 20), look: new THREE.Vector3(), head: new THREE.Vector3(0, 0, -1), prev: new THREE.Vector3(), vel: new THREE.Vector3(), fly: 0, init: false, sp: 0 };
function camMode() { $('camName').textContent = S.mode === 'setup' || S.mode === 'launching' && false ? 'Editor' : (CAMS.find(c => c[0] === S.cam) || CAMS[0])[1]; }
function cycleCam(to) {
  if (to) S.cam = to; else { const i = CAMS.findIndex(c => c[0] === S.cam); S.cam = CAMS[(i + 1) % CAMS.length][0]; }
  if (S.cam === 'free') { orbit.target.copy(cs.look); orbit.dist = Math.max(8, camera.position.distanceTo(cs.look)); const d = camera.position.clone().sub(cs.look); orbit.yaw = Math.atan2(d.x, d.z); orbit.pitch = clamp(Math.asin(d.y / d.length()), 0.05, 1.4); }
  camMode();
}
function subject() {
  const t = S.mode === 'replay' ? replay.t : S.time;
  const useDummy = !car || t >= S.ejectTime;
  return { useDummy, mesh: useDummy ? dummy.pelvis.mesh : car.group };
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const rotYpi = new THREE.Quaternion().setFromAxisAngle(Yaxis, Math.PI);
function updateCamera(dt) {
  const k = (r) => 1 - Math.exp(-dt * r);
  if (S.mode === 'setup' || S.mode === 'launching') {
    placeOrbit(dt, true); return;
  }
  const sj = subject(), pos = sj.mesh.position;
  if (!cs.init) { cs.prev.copy(pos); cs.look.copy(pos); cs.init = true; }
  cs.vel.copy(pos).sub(cs.prev).divideScalar(Math.max(dt, 1e-3)); cs.prev.copy(pos);
  const speed = cs.vel.length(); cs.sp += (speed - cs.sp) * k(6);
  let fov = 62 + clamp(cs.sp / 60, 0, 1) * 16;
  const headMesh = dummy.head.mesh;
  headMesh.visible = true;
  if (S.cam === 'chase' || (S.cam === 'pov' && false)) {
    if (cs.sp > 3) { _a.set(cs.vel.x, 0, cs.vel.z).normalize(); cs.head.lerp(_a, k(2)).normalize(); }
    const dist = sj.useDummy ? 6.5 : 10, h = sj.useDummy ? 2.4 : 3.8;
    _b.copy(pos).addScaledVector(cs.head, -dist); _b.y = pos.y + h;
    cs.pos.lerp(_b, k(5)); cs.pos.y = Math.max(cs.pos.y, 0.7);
    _a.copy(pos); _a.y += 0.9; cs.look.lerp(_a, k(9));
    camera.position.copy(cs.pos); camera.lookAt(cs.look);
  } else if (S.cam === 'pov') {
    const hm = headMesh; hm.visible = false;
    _a.set(0, 0.05, 0.16).applyQuaternion(hm.quaternion).add(hm.position);
    camera.position.lerp(_a, 0.9);
    _q.copy(hm.quaternion).multiply(rotYpi);
    camera.quaternion.slerp(_q, k(14)); fov = 80;
    cs.look.copy(hm.position);
  } else if (S.cam === 'fly') {
    let best = cs.fly, bd = CAM_POINTS[best].distanceTo(pos);
    for (let i = 0; i < CAM_POINTS.length; i++) { const d = CAM_POINTS[i].distanceTo(pos); if (d < bd * 0.7) { best = i; bd = d; } }
    cs.fly = best;
    camera.position.copy(CAM_POINTS[best]);
    cs.look.lerp(_a.copy(pos).setY(pos.y + 0.8), k(10)); camera.lookAt(cs.look);
    fov = clamp(Math.atan(6 / Math.max(bd, 6)) * 2 * 57.3, 20, 70);
  } else { // free
    orbit.target.lerp(_a.copy(pos).setY(pos.y + 0.8), k(4)); cs.look.copy(orbit.target);
    placeOrbit(dt, false);
  }
  if (camera.fov !== fov) { camera.fov += (fov - camera.fov) * k(5); camera.updateProjectionMatrix(); }
  if (S.shake > 0.01) {
    const s = S.shake * 0.35; camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; camera.position.z += (Math.random() - 0.5) * s;
    S.shake *= Math.exp(-dt * 5);
  }
}
function placeOrbit(dt, setup) {
  if (setup) orbit.target.z += (orbitTargetZ - orbit.target.z) * (1 - Math.exp(-dt * 6));
  const cp = Math.cos(orbit.pitch);
  camera.position.set(orbit.target.x + Math.sin(orbit.yaw) * cp * orbit.dist, Math.max(0.6, orbit.target.y + Math.sin(orbit.pitch) * orbit.dist), orbit.target.z + Math.cos(orbit.yaw) * cp * orbit.dist);
  camera.lookAt(orbit.target);
  if (camera.fov !== 62) { camera.fov = 62; camera.updateProjectionMatrix(); }
}

// ===================================================== input
let steerAxis = 0;
const keys = {};
addEventListener('keydown', e => {
  if (e.repeat) return;
  const k = e.key.toLowerCase(); keys[k] = true;
  if (k === ' ') {
    e.preventDefault();
    if (S.mode === 'setup') startLaunch(); else if (S.mode === 'running') doEject(true);
  }
  if (k === 'r') { if (S.mode !== 'launching') build(); }
  if (k === 'c') cycleCam();
  if (k >= '1' && k <= '4' && S.mode !== 'setup') cycleCam(CAMS[+k - 1][0]);
  if (k === 'm') toggleMute();
  if (k === 'p') togglePause();
  if (k === 'escape' && S.mode === 'replay') exitReplay();
  updateSteer();
});
addEventListener('keyup', e => {
  const k = e.key.toLowerCase(); keys[k] = false;
  if (k === ' ') releaseLaunch();
  updateSteer();
});
function updateSteer() { steerAxis = ((keys['a'] || keys['arrowleft']) ? 1 : 0) - ((keys['d'] || keys['arrowright']) ? 1 : 0); }

const cv = renderer.domElement;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let drag = null;
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (S.mode === 'setup' || S.cam === 'free') { orbit.yaw -= dx * 0.006; orbit.pitch = clamp(orbit.pitch + dy * 0.005, 0.03, 1.5); }
  } else if (S.mode === 'setup') hoverSlot(e);
});
cv.addEventListener('pointerup', e => {
  if (drag && drag.moved < 6 && S.mode === 'setup') clickSlot(e);
  drag = null;
});
cv.addEventListener('wheel', e => { e.preventDefault(); orbit.dist = clamp(orbit.dist * (1 + Math.sign(e.deltaY) * 0.1), 4, 140); }, { passive: false });
function pickSlot(e) {
  ndc.set(e.clientX / view.w * 2 - 1, -(e.clientY / view.h) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(track.slotPickers, false)[0];
  return hit ? hit.object.userData.slot : -1;
}
function hoverSlot(e) { const i = pickSlot(e); track.setHover(i); cv.style.cursor = i >= 0 ? 'pointer' : 'grab'; }
function clickSlot(e) { const i = pickSlot(e); if (i >= 0) toggleSlot(i); }
function toggleSlot(i) {
  S.slots[i] = S.slots[i] === S.selectedObstacle ? null : S.selectedObstacle;
  build();
}

// ===================================================== UI wiring
function setUIMode() {
  const m = S.mode;
  $('setup').style.display = m === 'setup' ? 'block' : 'none';
  $('minimap').style.display = m === 'setup' ? 'block' : 'none';
  $('launch').style.display = (m === 'setup' || m === 'launching' || m === 'running') ? 'block' : 'none';
  $('bPause').style.display = (m === 'running' || m === 'ended') && m !== 'replay' ? 'inline-block' : 'none';
  $('bCam').style.display = m === 'setup' ? 'none' : 'inline-block';
  const bl = $('bLaunch');
  if (m === 'running') {
    const canEject = dummy && dummy.attached;
    bl.className = 'eject'; bl.style.visibility = canEject ? 'visible' : 'hidden';
    bl.innerHTML = 'DISMOUNT! <small>(MEZERNÍK)</small>';
    $('hint').textContent = S.steer && car ? 'A / D = řízení • MEZERNÍK = vyhodit figurínu • C = kamera • P = pauza/replay' : 'MEZERNÍK = vyhodit figurínu • C = kamera • P = pauza/replay • R = restart';
  } else if (m === 'setup') {
    bl.className = ''; bl.style.visibility = 'visible';
    bl.innerHTML = 'PODRŽ = NABÍJEJ &nbsp;•&nbsp; PUSŤ = ODPAL <small>(MEZERNÍK)</small>';
    $('hint').textContent = 'Vyber překážku vlevo a klikni na slot na trati (nebo na minimapu)';
  } else $('hint').textContent = m === 'ended' ? 'R = znovu • tahem myši otáčíš kamerou' : '';
  $('hud').style.display = m === 'replay' ? 'block' : 'block';
  $('gauges').style.display = m === 'setup' ? 'none' : 'flex';
  $('replayBar').style.display = m === 'replay' ? 'flex' : 'none';
  if (m !== 'ended') $('result').style.display = 'none';
}

function mkBtns(host, items, cur, cb, fmt) {
  host.innerHTML = '';
  items.forEach(([k, label]) => {
    const b = document.createElement('button'); b.innerHTML = fmt ? fmt(k, label) : label; b.dataset.k = k;
    if (k === cur()) b.classList.add('on');
    b.onclick = () => { cb(k); [...host.children].forEach(c => c.classList.toggle('on', c.dataset.k === cur())); };
    host.appendChild(b);
  });
}
mkBtns($('poseBtns'), Object.entries(POSES).filter(([k]) => k !== 'tpose').map(([k, v]) => [k, v.label]), () => S.pose, k => { S.pose = k; build(); });
mkBtns($('placeBtns'), [['inside', 'V autě'], ['roof', 'Na střeše'], ['hood', 'Na kapotě'], ['road', 'Na silnici']], () => S.place, k => { S.place = k; build(); });
mkBtns($('obsBtns'), Object.entries(OBSTACLES).map(([k, v]) => [k, v.label]), () => S.selectedObstacle, k => { S.selectedObstacle = k; drawMinimap(); }, (k, l) => `<div style="font-size:18px">${OBSTACLES[k].icon}</div>${l}`);
$('bClear').onclick = () => { S.slots = SLOT_POS.map(() => null); build(); };
$('bRandom').onclick = () => { const ks = Object.keys(OBSTACLES); S.slots = SLOT_POS.map(() => Math.random() < 0.65 ? ks[Math.floor(Math.random() * ks.length)] : null); build(); };
$('chkSteer').onchange = e => { S.steer = e.target.checked; setUIMode(); };
$('bCam').onclick = () => cycleCam();
function toggleMute() { setMuted(!S.muted); $('bMute').textContent = S.muted ? '🔇' : '🔊'; }
$('bMute').onclick = toggleMute;
$('bPause').onclick = () => togglePause();
$('bRetry').onclick = () => build();
$('bSetup').onclick = () => { build(); };
$('bReplay').onclick = () => togglePause();
const lb = $('bLaunch');
lb.addEventListener('pointerdown', e => { e.preventDefault(); if (S.mode === 'setup') startLaunch(); else if (S.mode === 'running') doEject(true); });
addEventListener('pointerup', () => releaseLaunch());

// ---- replay UI
let replayReturn = 'ended';
function togglePause() {
  if (S.mode === 'replay') return exitReplay();
  if (S.mode !== 'running' && S.mode !== 'ended') return;
  replayReturn = S.mode;
  if (S.mode === 'running') { rec.capture(); }
  S.mode = 'replay'; replay.begin(car, true); replay.playing = false; replay.t = rec.duration;
  track.setSlotsVisible(false);
  if (S.cam === 'free') cycleCam('chase');
  cs.init = false;
  $('rPlay').textContent = '▶'; setUIMode();
  $('bReplay').textContent = '⏪ REPLAY'; $('result').style.display = 'none';
}
function exitReplay() {
  replay.end();
  S.mode = replayReturn;
  if (S.mode === 'running') { syncEntities(); car && car.syncWheels(); }
  if (S.mode === 'ended') { rec.apply(rec.duration); $('result').style.display = 'block'; }
  cs.init = false; setUIMode();
}
$('rExit').onclick = exitReplay;
$('rPlay').onclick = () => {
  if (!replay.playing && replay.t >= rec.duration - 0.01) replay.seek(0);
  replay.playing = !replay.playing; $('rPlay').textContent = replay.playing ? '⏸' : '▶';
};
$('rScrub').oninput = e => { clearParticles(); cs.init = false; replay.seek(+e.target.value / 1000 * rec.duration); replay.playing = false; $('rPlay').textContent = '▶'; };
{
  const host = $('rSpeeds');
  const lab = document.createElement('span'); lab.id = 'rSpd'; lab.style.cssText = 'font-size:12px;min-width:58px;text-align:right'; lab.textContent = 'Slow-mo 0.5×';
  const rng = document.createElement('input'); rng.type = 'range'; rng.min = 0.1; rng.max = 1; rng.step = 0.05; rng.value = 0.5; rng.style.cssText = 'width:110px;accent-color:#4fd6ff';
  rng.oninput = () => { replay.speed = +rng.value; lab.textContent = `Slow-mo ${(+rng.value).toFixed(2).replace(/0$/, '')}×`; };
  host.append(lab, rng);
  for (const v of [0.1, 0.25, 1]) { const b = document.createElement('button'); b.textContent = v + '×'; b.onclick = () => { rng.value = v; rng.oninput(); }; host.appendChild(b); }
}
function emitReplayFx(e) { fx(e.type, e.x, e.y, e.z, e.a, e.extra); }

// ---- minimap
const mm = $('minimap'), mg = mm.getContext('2d');
const mmY = z => 14 + (-z + 20) / 420 * 392;
function drawMinimap() {
  mg.clearRect(0, 0, mm.width, mm.height);
  mg.fillStyle = '#2a2d33'; mg.fillRect(26, 6, 32, 408);
  mg.strokeStyle = '#ffc02a'; mg.setLineDash([6, 8]); mg.beginPath(); mg.moveTo(42, 6); mg.lineTo(42, 414); mg.stroke(); mg.setLineDash([]);
  mg.fillStyle = '#fff'; mg.fillRect(26, mmY(4), 32, 2);
  mg.fillStyle = '#ff4040'; mg.fillRect(20, mmY(END_Z), 44, 4);
  mg.textAlign = 'center'; mg.font = 'bold 13px sans-serif'; mg.textBaseline = 'middle';
  SLOT_POS.forEach(([x, z], i) => {
    const px = 42 + x * 2.3, py = mmY(z), t = S.slots[i];
    mg.beginPath(); mg.arc(px, py, 11, 0, 7); mg.fillStyle = t ? '#ffc02a' : 'rgba(79,214,255,.35)'; mg.fill(); mg.strokeStyle = '#fff'; mg.stroke();
    mg.fillStyle = t ? '#111' : '#fff'; mg.fillText(t ? OBSTACLES[t].icon : String(i + 1), px, py + 1);
  });
  mg.fillStyle = '#25d940'; mg.fillRect(2, mmY(orbitTargetZ) - 2, 12, 4);
}
mm.addEventListener('pointerdown', e => {
  const r = mm.getBoundingClientRect(), x = (e.clientX - r.left) * mm.width / r.width, y = (e.clientY - r.top) * mm.height / r.height;
  let hit = -1;
  SLOT_POS.forEach(([sx, sz], i) => { if (Math.hypot(42 + sx * 2.3 - x, mmY(sz) - y) < 14) hit = i; });
  if (hit >= 0) toggleSlot(hit);
  else { orbitTargetZ = clamp(20 - (y - 14) / 392 * 420, END_Z, 20); drawMinimap(); }
});

// ===================================================== main loop
function renderOverlay(scn, cam, el, t) {
  const r = el.getBoundingClientRect(); if (r.width < 2) return;
  const x = r.left, y = view.h - r.bottom;
  renderer.autoClear = false; renderer.setScissorTest(true);
  renderer.setViewport(x, y, r.width, r.height); renderer.setScissor(x, y, r.width, r.height);
  renderer.setClearColor(0x060a12, 1); renderer.clear(true, true, false);
  cam.aspect = r.width / r.height; cam.updateProjectionMatrix();
  renderer.render(scn, cam);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, view.w, view.h); renderer.autoClear = true;
}

let last = performance.now(), acc = 0, hudT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  let simDt = dt;
  if (S.mode === 'launching') {
    meterT += dt; const ph = (meterT / 1.05) % 2; S.power = ph < 1 ? ph : 2 - ph;
    $('meterFill').style.width = (S.power * 100) + '%'; $('needle').style.left = `calc(${S.power * 100}% - 2px)`; $('meterVal').textContent = Math.round(S.power * 100);
  }
  if (S.mode === 'setup') { if (keys['w'] || keys['arrowup']) { orbitTargetZ = Math.max(END_Z, orbitTargetZ - 60 * dt); drawMinimap(); } if (keys['s'] || keys['arrowdown']) { orbitTargetZ = Math.min(20, orbitTargetZ + 60 * dt); drawMinimap(); } }
  if (S.mode === 'running') {
    acc += dt; let n = 0;
    while (acc >= H && n < 6) { physicsStep(H); acc -= H; n++; if (S.mode !== 'running') break; }
    if (n >= 6) acc = 0;
    syncEntities();
  } else if (S.mode === 'replay') {
    replay.step(dt, emitReplayFx);
    simDt = dt * (replay.playing ? replay.speed : 0);
    const sc2 = $('rScrub'); if (document.activeElement !== sc2) sc2.value = rec.duration ? replay.t / rec.duration * 1000 : 0;
    $('rTime').textContent = `${replay.t.toFixed(1)} / ${rec.duration.toFixed(1)} s`;
    if (!replay.playing) $('rPlay').textContent = '▶';
  } else if (S.mode === 'setup' || S.mode === 'launching') {
    track.update(now / 1000);
  }
  track && track.update(now / 1000);
  updateParticles(simDt);
  updateCamera(dt);
  // HUD
  hudT += dt;
  if (hudT > 0.05 && S.mode !== 'setup') {
    hudT = 0;
    const sj = subject();
    const v = S.mode === 'replay' ? cs.sp : (sj.useDummy ? dummy.pelvis.body.velocity.length() : car.body.velocity.length());
    $('gSpeed').textContent = Math.round(v * 3.6);
    $('gDist').textContent = Math.max(0, Math.round(startZ - sj.mesh.position.z));
    $('gTime').textContent = (S.mode === 'replay' ? replay.t : S.time).toFixed(1);
    const air = S.mode === 'running' && airT > 0.7; $('airBadge').style.display = air ? 'block' : 'none'; if (air) $('airT').textContent = airT.toFixed(1);
    $('bLaunch').style.visibility = (S.mode === 'running' && !(dummy && dummy.attached)) ? 'hidden' : 'visible';
  }
  if (S.mode === 'running' || S.mode === 'ended') {
    const T = total(); const el = $('score');
    if (T !== scoreShown) { el.textContent = T.toLocaleString('cs-CZ'); if (T - scoreShown > 80) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } scoreShown = T; }
  } else if (S.mode === 'setup') { scoreShown = 0; $('score').textContent = S.best ? S.best.toLocaleString('cs-CZ') : '0'; $('scoreLabel').textContent = S.best ? 'REKORD' : 'SKÓRE'; }
  if (S.mode !== 'setup') $('scoreLabel').textContent = 'SKÓRE';
  // audio + post fx
  if (S.mode === 'running' && car) engineSound(car.speed, car.engineOn && !car.crashed);
  bloomPass.strength += (0.5 - bloomPass.strength) * Math.min(1, dt * 3);
  const spd = S.mode === 'replay' ? cs.sp : (car && S.mode === 'running' ? car.speed : (dummy ? dummy.speed : 0));
  blurPass.uniforms.strength.value = clamp((spd - 26) / 55, 0, 1) * 0.07;
  // flash + xray visibility
  if (S.flash > 0) { $('flash').classList.add('on'); S.flash = 0; setTimeout(() => $('flash').classList.remove('on'), 60); }
  // sun follows the action
  const fp = (S.mode === 'setup' ? orbit.target : cs.look);
  sun.target.position.set(Math.round(fp.x), 0, Math.round(fp.z)); sun.position.copy(sun.target.position).add(sunOffset);
  sun.target.updateMatrixWorld();
  scene.userData.dome.position.copy(camera.position);
  // ---- draw
  composer.render(dt);
  if (S.xrayUntil && performance.now() < S.xrayUntil && S.mode !== 'setup') {
    const pel = dummy.pelvis.mesh.position;
    for (const b of dummy.list) { const xb = xray.bones[b.def.name]; xb.grp.position.copy(b.mesh.position).sub(pel); xb.grp.quaternion.copy(b.mesh.quaternion); }
    renderOverlay(xray.scene, xray.cam, $('xrayFrame'));
  } else if (S.xrayUntil) { S.xrayUntil = 0; $('xrayFrame').style.display = 'none'; }
  if (S.mode === 'ended' && heat.group) {
    heat.group.rotation.y = now / 1400;
    heatR.render(heat.scene, heat.cam);
  }
}

// ===================================================== boot
build();
orbit.target.set(0, 1.5, orbitTargetZ);
$('loading').classList.add('hide');
requestAnimationFrame(frame);
window.__game = { step(n) { for (let i = 0; i < n && S.mode === 'running'; i++) physicsStep(H); syncEntities(); }, S, get car() { return car; }, get dummy() { return dummy; }, get track() { return track; }, build, doLaunch, startLaunch, releaseLaunch, get score() { return sc; }, total, rec, replay, entities, togglePause, exitReplay, world, cycleCam };
