// Game flow: setup (vehicle / map / obstacles / drawn route) -> launch (power meter) -> run -> results / replay.
import {
  THREE, CANNON, S, IS_TOUCH, renderer, scene, camera, composer, bloomPass, blurPass, view, world, sun, sunOffset, entities,
  clearLevel, syncEntities, applyEnv, setQuality, QUAL, shadowTick, adaptRes, updateClouds, gradePass, fxaaPass,
} from './engine.js';
import { fx, fxLog, fxState, updateParticles, clearParticles, initAudio, setMuted, engineSound, beep, setFractureFxHandler } from './fx.js';
import { Dummy, BONES, POSES, poseTransforms, lowestPoint, buildBoneMesh, heatColor } from './ragdoll.js';
import { Car } from './vehicle.js';
import { VEHICLES, VEHICLE_LIST, COLORS } from './vehicles.js';
import { MAPS, MAP_LIST } from './maps.js';
import { Track, OBSTACLES } from './track.js';
import { rec, replay } from './replay.js';

const $ = id => document.getElementById(id);
const Yaxis = new THREE.Vector3(0, 1, 0);
const H = 1 / 120;
const clamp = THREE.MathUtils.clamp;
const CAMS = [['chase', 'Chase'], ['pov', 'POV'], ['fly', 'Fly-by'], ['free', 'Free']];
const rotYpi = new THREE.Quaternion().setFromAxisAngle(Yaxis, Math.PI);

let track, car, dummy;
let sc, flipAcc, airT, quietT, pendingEject, apIdx = 0;

// ===================================================== persistent settings
Object.assign(S, { vehicle: 'sedan', color: null, map: 'road', objects: [], path: [], sel: -1, tool: null, start: { x: 0, z: 8, hx: 0, hz: -1, yaw: 0 }, sheetOpen: !IS_TOUCH, tab: 'veh' });
let layouts = {};
try {
  const j = JSON.parse(localStorage.getItem('turbocrash.v2') || '{}');
  for (const k of ['vehicle', 'color', 'map', 'pose', 'place', 'steer', 'quality', 'autoRes', 'shake', 'blurOn', 'bloomOn', 'slowmo', 'fixedPower']) if (j[k] !== undefined && j[k] !== null) S[k] = j[k];
  layouts = j.layouts || {};
  S.best = +localStorage.getItem('turbocrash.best') || 0;
} catch (e) { }
if (!VEHICLES[S.vehicle]) S.vehicle = 'sedan';
if (!MAPS[S.map]) S.map = 'road';
if (!QUAL[S.quality]) S.quality = 'low';
setQuality(S.quality);
function saveState() {
  layouts[S.map] = { objects: S.objects, path: S.path };
  try { localStorage.setItem('turbocrash.v2', JSON.stringify({ vehicle: S.vehicle, color: S.color, map: S.map, pose: S.pose, place: S.place, steer: S.steer, quality: S.quality, autoRes: S.autoRes, shake: S.shake, blurOn: S.blurOn, bloomOn: S.bloomOn, slowmo: S.slowmo, fixedPower: S.fixedPower, layouts })); } catch (e) { }
}
const hist = [];
function snap() { hist.push(JSON.stringify({ o: S.objects, p: S.path })); if (hist.length > 40) hist.shift(); }
function undo() { const s = hist.pop(); if (!s || S.mode !== 'setup') return; const j = JSON.parse(s); S.objects = j.o; S.path = j.p; S.sel = -1; saveState(); build(); }
function loadLayout() {
  const l = layouts[S.map];
  S.objects = l ? JSON.parse(JSON.stringify(l.objects)) : JSON.parse(JSON.stringify(MAPS[S.map].defaults));
  S.path = l ? l.path || [] : [];
  S.sel = -1;
}
loadLayout();

// ===================================================== build / reset
function resetScore() {
  sc = { fracture: 0, dislocation: 0, air: 0, flips: 0, eject: 0, vehicle: 0, destruction: 0, nFrac: 0, nDisl: 0, nFlip: 0 };
  flipAcc = { d: 0, dn: 0, c: 0, cn: 0 }; airT = 0; quietT = 0; pendingEject = null; apIdx = 0;
  $('feed').innerHTML = '';
}
const total = () => Math.round(sc.fracture + sc.dislocation + sc.air + sc.flips + sc.eject + sc.vehicle + sc.destruction);

function build(opts = {}) {
  rec.data = null; replay.active = false;
  clearLevel(); clearParticles(); fxLog.length = 0; fxState.logging = false;
  S.time = 0; S.ejectTime = Infinity;
  resetScore();
  const map = MAPS[S.map], spec = VEHICLES[S.vehicle];
  applyEnv(map, S.map);
  track = new Track(S.map, map, S.objects, S.path, S.sel);
  track.hooks.wallBroken = () => addScore('destruction', 150, 'Zeď rozbita', false);
  track.hooks.lava = () => { S.endAt = S.time + 1.4; S.shakeK = 1; };
  track.hooks.explosion = () => { S.shakeK = 1; if (dummy && dummy.attached && car) pendingEject = { vel: car.body.velocity.clone(), up: 6 }; };
  // start position / heading (from the drawn route when there is one)
  let sx = map.start[0], sz = map.start[1], hx = 0, hz = -1;
  if (S.path.length >= 2) {
    const p0 = S.path[0]; sx = p0[0]; sz = p0[1];
    let k = 1; while (k < S.path.length - 1 && Math.hypot(S.path[k][0] - sx, S.path[k][1] - sz) < 5) k++;
    hx = S.path[k][0] - sx; hz = S.path[k][1] - sz; const l = Math.hypot(hx, hz) || 1; hx /= l; hz /= l;
  }
  const yaw = Math.atan2(-hx, -hz);
  const H0 = track.height(sx, sz);
  S.start = { x: sx, z: sz, hx, hz, yaw, h: H0 }; S.endAt = Infinity;
  car = null;
  if (S.place !== 'road') {
    car = new Car(spec, sx, sz, yaw, S.color, H0, spec.pitch || 0);
    car.slipMul = map.slipMul ?? 1;
    track.car = car; car.hist = new Array(20).fill(null);
    car.onDamage = m => addScore('vehicle', m * 160, null);
    car.onPartLost = n => addScore('vehicle', 120, n === 'wheel' ? 'Kolo odpadlo' : 'Díl odpadl', false);
    car.onEjectRequest = (r, vel) => { if (!pendingEject) pendingEject = { vel, up: 3 }; };
  }
  // ---- dummy placement (car-local, then rotated by the start yaw) ----
  const qy = new THREE.Quaternion().setFromAxisAngle(Yaxis, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), car ? (spec.pitch || 0) : 0)), rq = qy.clone().multiply(rotYpi);
  const low = lowestPoint(poseTransforms(S.pose, new THREE.Vector3(), rotYpi));
  let root;
  if (car) {
    const pl = spec.place[S.place];
    root = new THREE.Vector3(0, pl.y - low, pl.z).applyQuaternion(qy).add(new THREE.Vector3(sx, H0 + spec.rideY, sz));
  } else root = new THREE.Vector3(sx, H0 + 0.01 - low, sz);
  dummy = new Dummy(S.pose, root, rq);
  dummy.onFracture = (bone, v, p) => {
    sc.nFrac++; addScore('fracture', bone.def.pts, `${bone.def.label} – zlomenina!`, true);
    fx('fracture', p.x, p.y, p.z, 1, bone.def.name); S.flash = 1; S.shakeK = Math.max(S.shakeK || 0, 0.35); S.slowUntil = S.slowmo ? performance.now() + 900 : 0;
  };
  dummy.onDislocate = (bone, w, p) => {
    sc.nDisl++; addScore('dislocation', bone.def.pts * 0.25, `${bone.def.label} – vykloubení`, true);
    fx('fracture', p.x, p.y, p.z, 1, bone.def.name);
  };
  if (car) car.dummy = dummy;
  syncEntities(); if (car) car.syncWheels();
  track.setEditorVisible(true);
  S.mode = 'setup'; setUIMode();
  $('score').textContent = '0'; $('result').style.display = 'none'; $('xrayFrame').style.display = 'none'; S.xrayUntil = 0;
  if (opts.cam) { orbit.target.set(sx + hx * 18, H0 + 1.5, sz + hz * 18); orbit.yaw = yaw; orbit.pitch = 0.42; orbit.dist = 36; }
  camMode(); updateObjBar();
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
  while (f.children.length > 6) f.lastChild.remove();
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
  if (car && car.airborne) {
    sc.air += 40 * h; flipAcc.c += car.body.angularVelocity.length() * h;
    const n = Math.floor(flipAcc.c / (Math.PI * 2));
    if (n > flipAcc.cn) { sc.flips += 150 * (n - flipAcc.cn); sc.nFlip += n - flipAcc.cn; feed(`Salto vozidla ×${n}`, 150 * (n - flipAcc.cn)); flipAcc.cn = n; }
  }
}

// ===================================================== autopilot (follows the drawn route)
function autopilot() {
  const path = S.path; if (path.length < 2 || !car) return null;
  const p = car.body.position, d = i => Math.hypot(path[i][0] - p.x, path[i][1] - p.z);
  while (apIdx < path.length - 1 && d(apIdx + 1) < d(apIdx)) apIdx++;
  const look = 5 + car.speed * 0.35;
  let acc = 0, i = apIdx, tx = path[i][0], tz = path[i][1];
  while (i < path.length - 1 && acc < look) { const a = path[i], b = path[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); acc += l; i++; tx = b[0]; tz = b[1]; }
  if (acc < look && path.length > 1) { // beyond the end: keep going straight on
    const a = path[path.length - 2], b = path[path.length - 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    tx += (b[0] - a[0]) / l * (look - acc); tz += (b[1] - a[1]) / l * (look - acc);
  }
  const f = car.forward; let vx = tx - p.x, vz = tz - p.z; const l = Math.hypot(vx, vz) || 1; vx /= l; vz /= l;
  const fl = Math.hypot(f.x, f.z) || 1, fx2 = f.x / fl, fz2 = f.z / fl;
  const sinT = fz2 * vx - fx2 * vz, cosT = fx2 * vx + fz2 * vz;
  return Math.atan2(sinT, cosT);   // + = target on the left
}

// ===================================================== launch / run
let meterT = 0, baseTarget = 0;
function startLaunch() {
  if (S.mode !== 'setup') return;
  initAudio();
  if (S.fixedPower > 0) { closeSheet(); beep(440); return doLaunch(S.fixedPower / 100); }
  S.mode = 'launching'; meterT = 0; S.power = 0;
  $('meter').style.display = 'block'; $('bLaunch').classList.add('held'); closeSheet();
  beep(440);
}
function releaseLaunch() {
  if (S.mode !== 'launching') return;
  $('meter').style.display = 'none'; $('bLaunch').classList.remove('held');
  doLaunch(Math.max(0.08, S.power));
}
function doLaunch(p) {
  S.mode = 'running'; S.time = 0; if (S.cam === 'free') S.cam = 'chase'; camMode();
  fxLog.length = 0; fxState.logging = true;
  cs.init = false; cs.pos.copy(camera.position); cs.head.set(S.start.hx, 0, S.start.hz); cs.look.copy(orbit.target); cs.sp = 0; cs.flyPos = null;
  track.setEditorVisible(false);
  if (car) {
    const sp = car.spec;
    baseTarget = sp.speed[0] + p * (sp.speed[1] - sp.speed[0]);
    car.target = baseTarget; car.engineOn = true; car.power = p; car.launchT = 0;
    const f = car.forward, v0 = baseTarget * (sp.fly && sp.fly.type === 'rocket' ? 0.15 : 0.6);
    car.body.velocity.set(f.x * v0, f.y * v0, f.z * v0);
    dummy.attachTo(car.body);
    for (const b of dummy.list) b.body.velocity.copy(car.body.velocity);
  } else {
    const sp = 12 + p * 38, { hx, hz } = S.start;
    dummy.launch(new CANNON.Vec3(hx * sp * 0.94, sp * 0.34, hz * sp * 0.94));
    S.ejectTime = 0;
  }
  rec.start(75);
  setUIMode(); beep(880, 0.12);
}
function doEject(user) {
  if (!dummy || !dummy.attached || !car) return;
  const v = pendingEject ? pendingEject.vel : car.body.velocity;
  const f = car.forward, sp = v.length();
  dummy.eject(new CANNON.Vec3(v.x + f.x * 1.5, v.y, v.z + f.z * 1.5), pendingEject ? pendingEject.up : (user ? 6 : 3));
  S.ejectTime = S.time;
  addScore('eject', 100 + sp * 14, 'Figurína vyhozena!', false);
  S.shakeK = Math.max(S.shakeK || 0, 0.2);
  pendingEject = null; setUIMode();
}

let smokeT = 0, scrapeT = 0;
function physicsStep(h) {
  track.step(h, { car, dummy });
  if (car) {
    const th = autopilot();
    let st = 0;
    if (th !== null) { st = clamp(th * 1.8, -1, 1); const L = 5 + car.speed * 0.35, kap = 2 * Math.abs(Math.sin(th)) / L; car.target = Math.max(7, Math.min(baseTarget, Math.sqrt(9 / Math.max(kap, 1e-3)))); }
    if (S.steer) st = clamp(st + steerAxis, -1, 1);
    car.steerInput = st;
    car.step(h);
  }
  world.step(h);
  S.time += h;
  if (car) car.syncWheels();
  if (dummy) dummy.postStep();
  if (car) {
    const hv = car.hist, i = car.histI = ((car.histI || 0) + 1) % 20, cv = car.body.velocity;
    const old = hv[i]; hv[i] = [cv.x, cv.y, cv.z];
    if (old && dummy && dummy.attached && !pendingEject && S.time > 0.6) {
      const dv = Math.hypot(cv.x - old[0], cv.y - old[1], cv.z - old[2]);
      if (dv > 11) pendingEject = { vel: new CANNON.Vec3(old[0], old[1], old[2]), up: 2 };
    }
  }
  if (pendingEject && dummy && dummy.attached) doEject(false); else pendingEject = null;
  if (dummy && dummy.ejected && !dummy.freeCar && S.time > dummy.freeAt) { dummy.freeCar = true; dummy.setCollideWithCar(true); }
  scoringStep(h);
  rec.tick(h);
  smokeT += h; scrapeT += h;
  if (smokeT > 0.07) {
    smokeT = 0;
    if (car && car.burning && car.speed > 1) { const p = car.body.position, f = car.forward; fx('smoke', p.x + f.x * 1.4, p.y + 0.7, p.z + f.z * 1.4); }
    if (car && car.slick && car.speed > 5) { const p = car.body.position; fx('tire', p.x + (Math.random() - .5) * 1.5, 0.2, p.z + (Math.random() - .5) * 3); }
  }
  if (scrapeT > 0.05) {
    scrapeT = 0;
    if (car && car.speed > 6 && car.body.position.y < car.spec.rideY - 0.1 && !car.grounded) { const p = car.body.position; fx('scrape', p.x, 0.1, p.z); }
    if (dummy && !dummy.attached && dummy.pelvis.body.position.y < 0.4 && dummy.speed > 7) { const p = dummy.pelvis.body.position; fx('scrape', p.x, 0.1, p.z); }
  }
  const quiet = (!dummy || dummy.speed < 0.9) && (!car || car.speed < 1.0 || (dummy && !dummy.attached));
  if (S.time > 3 && quiet) quietT += h; else quietT = 0;
  const fell = dummy && dummy.pelvis.body.position.y < (MAPS[S.map].killY ?? -95) + S.start.h * 0;
  if ((quietT > 1.4 || S.time > 60 || fell || S.time > S.endAt || rec.frames >= rec.max - 2) && S.mode === 'running') endRun();
}

function endRun() {
  S.mode = 'ended'; fxState.logging = false; rec.capture();
  if (car) { car.engineOn = false; engineSound(0, false); }
  S.cam = 'free'; camMode(); orbit.dist = 12; orbit.yaw = 0.6; orbit.pitch = 0.3;
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
  const T = total(); let newBest = false;
  if (T > S.best) { S.best = T; newBest = true; try { localStorage.setItem('turbocrash.best', String(T)); } catch (e) { } }
  const row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
  $('breakdown').innerHTML =
    row(`Zlomeniny (${sc.nFrac})`, Math.round(sc.fracture)) + row(`Vykloubení (${sc.nDisl})`, Math.round(sc.dislocation)) +
    row('Čas ve vzduchu', Math.round(sc.air)) + row(`Salta / rotace (${sc.nFlip})`, Math.round(sc.flips)) +
    row('Bonus za vyhození', Math.round(sc.eject)) + row('Poškození vozidla', Math.round(sc.vehicle)) + row('Destrukce', Math.round(sc.destruction)) +
    `<tr class="total"><td>CELKEM</td><td>${T}</td></tr>` + row(newBest ? '🏆 NOVÝ REKORD' : 'Rekord', S.best);
  const fr = dummy.list.filter(b => b.fractured).map(b => b.def.label), di = dummy.list.filter(b => b.dislocated && !b.fractured).map(b => b.def.label);
  $('fracList').innerHTML = (fr.length ? '🦴 Zlomeno: ' + fr.join(', ') : 'Žádná zlomenina.') + (di.length ? `<br><span style="color:#ffd38a">Vykloubeno: ${di.join(', ')}</span>` : '');
  if (heat.group) heat.scene.remove(heat.group);
  const g = new THREE.Group(), tr = poseTransforms('tpose', new THREE.Vector3(), new THREE.Quaternion());
  for (const b of dummy.list) {
    const m = buildBoneMesh(b.def, heatColor(b.dmg, b.fractured).getHex()); m.material.roughness = 0.6;
    if (b.fractured) { m.material.emissive = heatColor(1, true); m.material.emissiveIntensity = 0.5; }
    const t = tr[b.def.name]; m.position.copy(t.center); m.quaternion.copy(t.q); g.add(m);
  }
  heat.group = g; heat.scene.add(g);
  $('result').style.display = 'block'; setUIMode();
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
const cs = { pos: new THREE.Vector3(0, 8, 20), look: new THREE.Vector3(), head: new THREE.Vector3(0, 0, -1), prev: new THREE.Vector3(), vel: new THREE.Vector3(), flyPos: null, flySide: 1, init: false, sp: 0 };
function camMode() { $('camName').textContent = (CAMS.find(c => c[0] === S.cam) || CAMS[0])[1]; }
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
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion();
function updateCamera(dt) {
  const k = r => 1 - Math.exp(-dt * r);
  if (S.mode === 'setup' || S.mode === 'launching') { placeOrbit(); return; }
  const sj = subject(), pos = sj.mesh.position;
  if (!cs.init) { cs.prev.copy(pos); cs.look.copy(pos); cs.init = true; }
  cs.vel.copy(pos).sub(cs.prev).divideScalar(Math.max(dt, 1e-3)); cs.prev.copy(pos);
  if (S.mode === 'replay' && replay.seeking) cs.vel.set(0, 0, 0);
  const speed = cs.vel.length(); cs.sp += (speed - cs.sp) * k(6);
  if (cs.sp > 3) { _a.set(cs.vel.x, 0, cs.vel.z).normalize(); cs.head.lerp(_a, k(2)).normalize(); }
  let fov = 62 + clamp(cs.sp / 60, 0, 1) * 16;
  const headMesh = dummy.head.mesh; headMesh.visible = true;
  if (S.cam === 'chase') {
    const sp = car && car.spec, dist = sj.useDummy ? 6.5 : (sp.camDist || 7 + 3 * sp.dentScale), h = sj.useDummy ? 2.4 : (sp.camH || 2.4 + 1.4 * sp.dentScale);
    _b.copy(pos).addScaledVector(cs.head, -dist); _b.y = pos.y + h;
    cs.pos.lerp(_b, k(5)); cs.pos.y = Math.max(cs.pos.y, 0.7);
    _a.copy(pos); _a.y += 0.9; cs.look.lerp(_a, k(9));
    camera.position.copy(cs.pos); camera.lookAt(cs.look);
  } else if (S.cam === 'pov') {
    headMesh.visible = false;
    _a.set(0, 0.05, 0.16).applyQuaternion(headMesh.quaternion).add(headMesh.position);
    camera.position.lerp(_a, 0.9);
    _q.copy(headMesh.quaternion).multiply(rotYpi); camera.quaternion.slerp(_q, k(14)); fov = 80;
    cs.look.copy(headMesh.position);
  } else if (S.cam === 'fly') {
    if (!cs.flyPos || cs.flyPos.distanceTo(pos) > 70 || cs.head.dot(_a.copy(pos).sub(cs.flyPos)) > 22) {
      cs.flySide *= -1;
      cs.flyPos = new THREE.Vector3().copy(pos).addScaledVector(cs.head, 38).add(_b.set(-cs.head.z * 13 * cs.flySide, 0, cs.head.x * 13 * cs.flySide));
      cs.flyPos.y = 2.4 + Math.random() * 2;
    }
    camera.position.copy(cs.flyPos);
    cs.look.lerp(_a.copy(pos).setY(pos.y + 0.8), k(10)); camera.lookAt(cs.look);
    fov = clamp(Math.atan(6 / Math.max(cs.flyPos.distanceTo(pos), 6)) * 2 * 57.3, 20, 70);
  } else {
    orbit.target.lerp(_a.copy(pos).setY(pos.y + 0.8), k(4)); cs.look.copy(orbit.target); placeOrbit();
  }
  if (camera.fov !== fov) { camera.fov += (fov - camera.fov) * k(5); camera.updateProjectionMatrix(); }
  if (S.shakeK > 0.01 && S.shake) {
    const s = S.shakeK * 0.35; camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; camera.position.z += (Math.random() - 0.5) * s;
    S.shakeK *= Math.exp(-dt * 5);
  }
}
function placeOrbit() {
  const cp = Math.cos(orbit.pitch);
  camera.position.set(orbit.target.x + Math.sin(orbit.yaw) * cp * orbit.dist, Math.max(0.6, orbit.target.y + Math.sin(orbit.pitch) * orbit.dist), orbit.target.z + Math.cos(orbit.yaw) * cp * orbit.dist);
  camera.lookAt(orbit.target);
  if (camera.fov !== 62) { camera.fov = 62; camera.updateProjectionMatrix(); }
}
function panTarget(right, fwd) {
  const fx2 = -Math.sin(orbit.yaw), fz2 = -Math.cos(orbit.yaw);
  orbit.target.x = clamp(orbit.target.x + right * -fz2 + fwd * fx2, -450, 450);
  orbit.target.z = clamp(orbit.target.z + right * fx2 + fwd * fz2, -880, 390);
}

// ===================================================== input
let steerAxis = 0, steerTouch = 0;
const keys = {};
addEventListener('keydown', e => {
  if (e.repeat) return;
  const k = e.key.toLowerCase(); keys[k] = true;
  if (k === ' ') { e.preventDefault(); if (S.mode === 'setup') startLaunch(); else if (S.mode === 'running') doEject(true); }
  if (k === 'r') { if (S.mode !== 'launching') build(); }
  if (k === 'c') cycleCam();
  if (k >= '1' && k <= '4' && S.mode !== 'setup') cycleCam(CAMS[+k - 1][0]);
  if (k === 'm') toggleMute();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(); }
  if (k === 'h' || k === '?') toggleHelp();
  if (k === 'p') togglePause();
  if (k === 'escape') { if (S.mode === 'replay') exitReplay(); else { S.tool = null; refreshTools(); } }
  if ((k === 'delete' || k === 'backspace') && S.mode === 'setup' && S.sel >= 0) objAction('del');
  updateSteer();
});
addEventListener('keyup', e => { const k = e.key.toLowerCase(); keys[k] = false; if (k === ' ') releaseLaunch(); updateSteer(); });
let padSteer = 0;
function updateSteer() { steerAxis = clamp(((keys['a'] || keys['arrowleft']) ? 1 : 0) - ((keys['d'] || keys['arrowright']) ? 1 : 0) + steerTouch + padSteer, -1, 1); }

const cv = renderer.domElement;
cv.addEventListener('contextmenu', e => e.preventDefault());
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3();
const ptrs = new Map(); let gest = null, pinch = null;
function setRay(e) { ndc.set(e.clientX / view.w * 2 - 1, -(e.clientY / view.h) * 2 + 1); ray.setFromCamera(ndc, camera); }
function groundHit(e, extra = 0) {
  setRay(e); let y = 0, h = null;
  for (let i = 0; i < 4; i++) { groundPlane.constant = -(y + extra); if (!ray.ray.intersectPlane(groundPlane, _hit)) return null; h = _hit.clone(); y = track.height(h.x, h.z); }
  return h;
}
function pickObject(e) { setRay(e); const h = ray.intersectObjects(track.pickers, false)[0]; return h ? h.object.userData.idx : -1; }

cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; gest = { type: 'pinch' }; return;
  }
  if (ptrs.size > 2) return;
  const setup = S.mode === 'setup';
  if (setup && S.tool === 'path' && e.button !== 2) {
    snap(); const g = groundHit(e); if (g) { S.path = [[g.x, g.z]]; track.setPath(S.path); } gest = { type: 'path' }; return;
  }
  if (setup && e.button !== 2 && !e.shiftKey) {
    const idx = pickObject(e);
    if (idx >= 0) {
      const o = S.objects[idx], g = groundHit(e, o.y);
      selectObj(idx, false); snap();
      gest = { type: 'obj', idx, ox: g ? o.x - g.x : 0, oz: g ? o.z - g.z : 0, moved: 0, x: e.clientX, y: e.clientY }; return;
    }
  }
  gest = { type: e.button === 2 || e.shiftKey ? 'pan' : 'cam', moved: 0, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
});
cv.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId);
  if (!p) { if (S.mode === 'setup' && e.pointerType === 'mouse') cv.style.cursor = (S.tool === 'path' ? 'crosshair' : (pickObject(e) >= 0 ? 'move' : (S.tool ? 'copy' : 'grab'))); return; }
  p.x = e.clientX; p.y = e.clientY;
  if (!gest) return;
  if (gest.type === 'pinch' && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (S.mode === 'setup' || S.cam === 'free') {
      orbit.dist = clamp(orbit.dist * pinch.d / Math.max(d, 1), 4, 160);
      const k = orbit.dist * 0.0016; panTarget(-(mx - pinch.mx) * k, (my - pinch.my) * k);
    }
    pinch.d = d; pinch.mx = mx; pinch.my = my; return;
  }
  if (gest.type === 'path') {
    const g = groundHit(e); if (!g) return;
    const l = S.path[S.path.length - 1];
    if (Math.hypot(g.x - l[0], g.z - l[1]) >= 1.6 && S.path.length < 500) { S.path.push([g.x, g.z]); track.setPath(S.path); }
  } else if (gest.type === 'obj') {
    const o = S.objects[gest.idx], g = groundHit(e, o.y); if (!g) return;
    gest.moved += Math.abs(e.clientX - gest.x) + Math.abs(e.clientY - gest.y); gest.x = e.clientX; gest.y = e.clientY;
    if (gest.moved > 5) { o.x = g.x + gest.ox; o.z = g.z + gest.oz; track.moveSelRing(o.x, o.z); track.pickers[gest.idx].position.set(o.x, o.y + track.height(o.x, o.z) + 1.5, o.z); gest.dirty = true; }
  } else if (gest.type === 'pan') {
    const dx = e.clientX - gest.x, dy = e.clientY - gest.y; gest.x = e.clientX; gest.y = e.clientY; const k = orbit.dist * 0.0016;
    if (S.mode === 'setup' || S.cam === 'free') panTarget(-dx * k, dy * k);
  } else if (gest.type === 'cam') {
    const dx = e.clientX - gest.x, dy = e.clientY - gest.y; gest.moved += Math.abs(dx) + Math.abs(dy); gest.x = e.clientX; gest.y = e.clientY;
    if (S.mode === 'setup' || S.cam === 'free') { orbit.yaw -= dx * 0.006; orbit.pitch = clamp(orbit.pitch + dy * 0.005, 0.03, 1.5); }
  }
});
function endPointer(e) {
  ptrs.delete(e.pointerId);
  if (!gest) return;
  const g = gest;
  if (ptrs.size === 0) gest = null; else if (g.type === 'pinch') { gest = null; pinch = null; return; }
  if (g.type === 'path') {
    if (S.path.length < 4) S.path = []; else S.path = smoothPath(S.path);
    saveState(); build();
  } else if (g.type === 'obj') {
    if (g.dirty) { saveState(); build(); } else hist.pop();
  } else if (g.type === 'cam' && g.moved < 7 && S.mode === 'setup') {
    if (S.tool && OBSTACLES[S.tool]) {
      const hit = groundHit(e);
      if (hit) { snap(); S.objects.push({ type: S.tool, x: hit.x, z: hit.z, yaw: S.start.yaw, s: 1, y: 0 }); S.sel = S.objects.length - 1; saveState(); build(); }
    } else if (S.sel >= 0) { S.sel = -1; track.setSelected(-1); updateObjBar(); }
  }
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('wheel', e => { e.preventDefault(); orbit.dist = clamp(orbit.dist * (1 + Math.sign(e.deltaY) * 0.1), 4, 160); }, { passive: false });

function smoothPath(p) {
  let a = p;
  for (let it = 0; it < 2; it++) {
    const b = [a[0]];
    for (let i = 0; i < a.length - 1; i++) b.push([a[i][0] * 0.75 + a[i + 1][0] * 0.25, a[i][1] * 0.75 + a[i + 1][1] * 0.25], [a[i][0] * 0.25 + a[i + 1][0] * 0.75, a[i][1] * 0.25 + a[i + 1][1] * 0.75]);
    b.push(a[a.length - 1]); a = b;
  }
  const out = [a[0]];
  for (const q of a) { const l = out[out.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) >= 1.5) out.push(q); }
  return out;
}

// ===================================================== object editing
function selectObj(i, rebuildRing = true) { S.sel = i; track.setSelected(i); updateObjBar(); }
function updateObjBar() {
  const o = S.objects[S.sel], bar = $('objBar');
  bar.style.display = (S.mode === 'setup' && o) ? 'flex' : 'none';
  if (o) $('objName').textContent = `${OBSTACLES[o.type].icon} ${OBSTACLES[o.type].label} • ${Math.round(THREE.MathUtils.radToDeg(o.yaw)) % 360}° • ×${o.s.toFixed(2)} • ↕${o.y.toFixed(1)}m`;
}
function objAction(a) {
  if (a === 'undo') return undo();
  const o = S.objects[S.sel]; if (!o) return;
  snap();
  if (a === 'rl') o.yaw += Math.PI / 12; if (a === 'rr') o.yaw -= Math.PI / 12;
  if (a === 'sm') o.s = Math.max(0.4, o.s / 1.18); if (a === 'sp') o.s = Math.min(3, o.s * 1.18);
  if (a === 'up') o.y = Math.min(15, o.y + 0.5); if (a === 'dn') o.y = Math.max(0, o.y - 0.5);
  if (a === 'dup') { S.objects.push({ ...o, x: o.x + 6 * Math.cos(o.yaw), z: o.z - 6 * Math.sin(o.yaw) }); S.sel = S.objects.length - 1; }
  if (a === 'del') { S.objects.splice(S.sel, 1); S.sel = -1; }
  saveState(); build();
}
document.querySelectorAll('#objBar [data-a]').forEach(b => b.addEventListener('click', () => objAction(b.dataset.a)));

// ===================================================== UI wiring
function setUIMode() {
  const m = S.mode;
  document.body.dataset.mode = m;
  $('setup').style.display = m === 'setup' ? 'block' : 'none';
  $('launch').style.display = (m === 'setup' || m === 'launching' || m === 'running') ? 'block' : 'none';
  $('bPause').style.display = (m === 'running' || m === 'ended') ? 'inline-block' : 'none';
  $('bCam').style.display = m === 'setup' ? 'none' : 'inline-block';
  $('bRetryQ').style.display = (m === 'running' || m === 'ended') ? 'inline-block' : 'none';
  $('touchCtl').style.display = (IS_TOUCH && m === 'running' && S.steer && car) ? 'flex' : 'none';
  const bl = $('bLaunch');
  if (m === 'running') {
    bl.className = 'eject'; bl.style.visibility = (dummy && dummy.attached) ? 'visible' : 'hidden';
    bl.innerHTML = 'DISMOUNT! <small>(MEZERNÍK)</small>';
    $('hint').textContent = IS_TOUCH ? '' : (S.steer && car ? 'A / D = řízení • MEZERNÍK = vyhodit figurínu • C = kamera • P = pauza/replay' : 'MEZERNÍK = vyhodit figurínu • C = kamera • P = pauza/replay • R = restart');
  } else if (m === 'setup') {
    bl.className = ''; bl.style.visibility = 'visible';
    bl.innerHTML = IS_TOUCH ? 'PODRŽ = NABÍJEJ • PUSŤ = ODPAL' : 'PODRŽ = NABÍJEJ &nbsp;•&nbsp; PUSŤ = ODPAL <small>(MEZERNÍK)</small>';
    $('hint').textContent = S.tool === 'path' ? 'Táhni prstem / myší po zemi – nakresli trasu (začátek = start vozidla)' : (S.tool ? 'Klepni na zem pro umístění překážky' : 'Klepni na překážku pro úpravu • tah = kamera • dva prsty = zoom + posun');
  } else $('hint').textContent = m === 'ended' ? (IS_TOUCH ? '' : 'R = znovu • tahem myši otáčíš kamerou') : '';
  $('replayBar').style.display = m === 'replay' ? 'flex' : 'none';
  $('gauges').style.display = m === 'setup' ? 'none' : 'flex';
  if (m !== 'ended') $('result').style.display = 'none';
  updateObjBar(); refreshSheetH();
}

// ---- tabs / sheet
function refreshSheetH() { document.documentElement.style.setProperty('--sheetH', S.mode === 'setup' ? $('setup').offsetHeight + 'px' : '0px'); }
function openTab(t) {
  if (S.tab === t && S.sheetOpen) S.sheetOpen = false; else { S.tab = t; S.sheetOpen = true; }
  applyTabs();
}
function closeSheet() { if (IS_TOUCH) { S.sheetOpen = false; applyTabs(); } }
function applyTabs() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab && S.sheetOpen));
  document.querySelectorAll('.tabc').forEach(d => d.style.display = (d.dataset.tab === S.tab && S.sheetOpen) ? 'block' : 'none');
  $('setup').classList.toggle('open', S.sheetOpen);
  refreshSheetH();
}
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => openTab(b.dataset.tab)));

function mkBtns(host, items, cur, cb, fmt) {
  host.innerHTML = '';
  items.forEach(([k, label]) => {
    const b = document.createElement('button'); b.innerHTML = fmt ? fmt(k, label) : label; b.dataset.k = k;
    if (k === cur()) b.classList.add('on');
    b.onclick = () => { cb(k); [...host.children].forEach(c => c.classList.toggle('on', c.dataset.k === cur())); };
    host.appendChild(b);
  });
}
mkBtns($('vehBtns'), VEHICLE_LIST.map(([k, v]) => [k, v.name]), () => S.vehicle, k => { S.vehicle = k; S.color = null; saveState(); build(); }, (k, l) => `<div class="ic">${VEHICLES[k].icon}</div>${l}`);
{
  const host = $('colBtns'); host.innerHTML = '';
  COLORS.forEach(c => { const b = document.createElement('button'); b.className = 'sw'; b.style.background = '#' + c.toString(16).padStart(6, '0'); b.onclick = () => { S.color = c; saveState(); build(); }; host.appendChild(b); });
}
mkBtns($('poseBtns'), Object.entries(POSES).filter(([k]) => k !== 'tpose').map(([k, v]) => [k, v.label]), () => S.pose, k => { S.pose = k; saveState(); build(); });
mkBtns($('placeBtns'), [['inside', 'Uvnitř'], ['roof', 'Na střeše'], ['hood', 'Na kapotě'], ['road', 'Bez vozidla']], () => S.place, k => { S.place = k; saveState(); build(); });
mkBtns($('mapBtns'), MAP_LIST.map(([k, v]) => [k, v.name]), () => S.map, k => { saveState(); S.map = k; loadLayout(); saveState(); build({ cam: true }); $('mapDesc').textContent = MAPS[k].desc; }, (k, l) => `<div class="ic">${MAPS[k].icon}</div>${l}`);
$('mapDesc').textContent = MAPS[S.map].desc;
{
  const tools = $('obsBtns'); tools.innerHTML = '';
  const mk = (k, label, icon) => { const b = document.createElement('button'); b.dataset.k = k; b.innerHTML = `<div class="ic">${icon}</div>${label}`; b.onclick = () => { S.tool = S.tool === k ? null : k; refreshTools(); setUIMode(); }; tools.appendChild(b); };
  for (const [k, v] of Object.entries(OBSTACLES)) mk(k, v.label, v.icon);
}
function refreshTools() {
  document.querySelectorAll('#obsBtns button').forEach(b => b.classList.toggle('on', b.dataset.k === S.tool));
  $('bDraw').classList.toggle('on', S.tool === 'path'); setUIMode();
}
$('bDraw').onclick = () => { S.tool = S.tool === 'path' ? null : 'path'; if (S.tool === 'path') { S.sel = -1; } refreshTools(); if (S.tool === 'path') topView(); };
$('bClearPath').onclick = () => { snap(); S.path = []; saveState(); build(); };
$('bClearObjs').onclick = () => { snap(); S.objects = []; S.sel = -1; saveState(); build(); };
$('bResetMap').onclick = () => { snap(); delete layouts[S.map]; loadLayout(); saveState(); build({ cam: true }); };
function topView() { orbit.pitch = 1.45; orbit.dist = Math.max(orbit.dist, 45); }
$('bTop').onclick = topView;
$('bUndoT').onclick = undo;
$('bBehind').onclick = () => { orbit.pitch = 0.42; orbit.dist = 30; orbit.yaw = S.start.yaw; orbit.target.set(S.start.x + S.start.hx * 18, 1.5, S.start.z + S.start.hz * 18); };
$('chkSteer').checked = !!S.steer;
$('chkSteer').onchange = e => { S.steer = e.target.checked; saveState(); setUIMode(); };
$('bFull').onclick = () => { const d = document.documentElement; if (document.fullscreenElement) document.exitFullscreen(); else if (d.requestFullscreen) d.requestFullscreen().catch(() => { }); };
$('bCam').onclick = () => cycleCam();
function toggleMute() { setMuted(!S.muted); $('bMute').textContent = S.muted ? '🔇' : '🔊'; }
$('bMute').onclick = toggleMute;
$('bPause').onclick = () => togglePause();
$('bRetry').onclick = () => build();
$('bSetup').onclick = () => build();
$('bReplay').onclick = () => togglePause();
const lb = $('bLaunch');
lb.addEventListener('pointerdown', e => { e.preventDefault(); lb.setPointerCapture && lb.setPointerCapture(e.pointerId); if (S.mode === 'setup') startLaunch(); else if (S.mode === 'running') doEject(true); });
lb.addEventListener('pointerup', () => releaseLaunch());
lb.addEventListener('pointercancel', () => releaseLaunch());
addEventListener('pointerup', () => releaseLaunch());
for (const [id, v] of [['tcL', 1], ['tcR', -1]]) {
  const b = $(id);
  b.addEventListener('pointerdown', e => { e.preventDefault(); steerTouch = v; updateSteer(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => { steerTouch = 0; updateSteer(); });
}

// ---- settings tab
function refreshSettings() {
  document.querySelectorAll('#qualBtns button').forEach(b => b.classList.toggle('on', b.dataset.q === S.quality));
  $('chkAuto').checked = S.autoRes; $('chkBloom').checked = S.bloomOn; $('chkBlur').checked = S.blurOn; $('chkShake').checked = !!S.shake; $('chkSlow').checked = S.slowmo;
  $('powRange').value = S.fixedPower; $('powVal').textContent = S.fixedPower ? S.fixedPower + ' %' : 'měřič';
  bloomPass.enabled = S.bloomOn; blurPass.enabled = S.blurOn;
}
document.querySelectorAll('#qualBtns button').forEach(b => b.onclick = () => { setQuality(b.dataset.q); saveState(); refreshSettings(); });
for (const [id, key] of [['chkAuto', 'autoRes'], ['chkBloom', 'bloomOn'], ['chkBlur', 'blurOn'], ['chkShake', 'shake'], ['chkSlow', 'slowmo']])
  $(id).onchange = e => { S[key] = key === 'shake' ? (e.target.checked ? 1 : 0) : e.target.checked; if (key === 'autoRes' && !S.autoRes) { S.resScale = 1; setQuality(S.quality); } saveState(); refreshSettings(); };
$('powRange').oninput = e => { S.fixedPower = +e.target.value; saveState(); refreshSettings(); };
function toggleHelp() { const d = $('help'); d.style.display = d.style.display === 'block' ? 'none' : 'block'; }
$('bHelp').onclick = toggleHelp; $('bHelpClose').onclick = toggleHelp;
$('bRetryQ').onclick = () => { if (S.mode !== 'launching') build(); };

// ---- replay UI
let replayReturn = 'ended';
function togglePause() {
  if (S.mode === 'replay') return exitReplay();
  if (S.mode !== 'running' && S.mode !== 'ended') return;
  replayReturn = S.mode;
  if (S.mode === 'running') rec.capture();
  S.mode = 'replay'; replay.begin(car, true); replay.playing = false; replay.t = rec.duration;
  track.setEditorVisible(false);
  if (S.cam === 'free') cycleCam('chase');
  cs.init = false; $('rPlay').textContent = '▶'; setUIMode(); $('result').style.display = 'none';
}
function exitReplay() {
  replay.end(); S.mode = replayReturn;
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

// ===================================================== main loop
function renderOverlay(scn, cam, el) {
  const r = el.getBoundingClientRect(); if (r.width < 2) return;
  const x = r.left, y = view.h - r.bottom;
  renderer.autoClear = false; renderer.setScissorTest(true);
  renderer.setViewport(x, y, r.width, r.height); renderer.setScissor(x, y, r.width, r.height);
  renderer.setClearColor(0x060a12, 1); renderer.clear(true, true, false);
  cam.aspect = r.width / r.height; cam.updateProjectionMatrix();
  renderer.render(scn, cam);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, view.w, view.h); renderer.autoClear = true;
}

let padDown = false, padPrev = {};
function pollPad(dt) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : []; const gp = [...pads].find(p => p && p.connected);
  if (!gp) { if (padSteer) { padSteer = 0; updateSteer(); } return; }
  const dz = v => Math.abs(v) > 0.18 ? v : 0, b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
  padSteer = -dz(gp.axes[0] || 0); updateSteer();
  const edge = (i, f) => { const n = b(i); if (n && !padPrev[i]) f(true); if (!n && padPrev[i]) f(false); padPrev[i] = n; };
  edge(0, down => { if (down) { if (S.mode === 'setup') startLaunch(); else if (S.mode === 'running') doEject(true); } else releaseLaunch(); });
  edge(3, d => { if (d && S.mode !== 'launching') build(); }); edge(5, d => { if (d && S.mode !== 'setup') cycleCam(); }); edge(9, d => { if (d) togglePause(); });
  if (S.mode === 'setup' || S.cam === 'free') {
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    if (S.mode === 'setup') panTarget(lx * orbit.dist * dt, -ly * orbit.dist * dt);
    orbit.yaw -= rx * 2 * dt; orbit.pitch = clamp(orbit.pitch + ry * 1.5 * dt, 0.03, 1.5);
    orbit.dist = clamp(orbit.dist * (1 + ((gp.buttons[7] ? gp.buttons[7].value : 0) - (gp.buttons[6] ? gp.buttons[6].value : 0)) * dt), 4, 160);
  }
}
let last = performance.now(), acc = 0, hudT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  let simDt = dt;
  pollPad(dt); adaptRes(dt, now); shadowTick(); updateClouds(dt, camera.position);
  if (S.mode === 'launching') {
    meterT += dt; const ph = (meterT / 1.05) % 2; S.power = ph < 1 ? ph : 2 - ph;
    $('meterFill').style.width = (S.power * 100) + '%'; $('needle').style.left = `calc(${S.power * 100}% - 2px)`; $('meterVal').textContent = Math.round(S.power * 100);
  }
  if (S.mode === 'setup') {
    const sp = orbit.dist * 0.9 * dt;
    const r = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0), f = (keys['w'] || keys['arrowup'] ? 1 : 0) - (keys['s'] || keys['arrowdown'] ? 1 : 0);
    if (r || f) panTarget(r * sp, f * sp);
  }
  if (S.mode === 'running') {
    const ts = (S.slowUntil && performance.now() < S.slowUntil) ? 0.3 : 1;
    acc += dt * ts; let n = 0;
    while (acc >= H && n < 6) { physicsStep(H); acc -= H; n++; if (S.mode !== 'running') break; }
    if (n >= 6) acc = 0;
    syncEntities();
  } else if (S.mode === 'replay') {
    replay.step(dt, emitReplayFx);
    simDt = dt * (replay.playing ? replay.speed : 0);
    const sc2 = $('rScrub'); if (document.activeElement !== sc2) sc2.value = rec.duration ? replay.t / rec.duration * 1000 : 0;
    $('rTime').textContent = `${replay.t.toFixed(1)} / ${rec.duration.toFixed(1)} s`;
    if (!replay.playing) $('rPlay').textContent = '▶';
  }
  track && track.update(now / 1000);
  updateParticles(simDt);
  updateCamera(dt);
  hudT += dt;
  if (hudT > 0.05 && S.mode !== 'setup') {
    hudT = 0;
    const sj = subject();
    const v = S.mode === 'replay' ? cs.sp : (sj.useDummy ? dummy.pelvis.body.velocity.length() : car.body.velocity.length());
    $('gSpeed').textContent = Math.round(v * 3.6);
    $('gDist').textContent = Math.round(Math.hypot(sj.mesh.position.x - S.start.x, sj.mesh.position.z - S.start.z));
    $('gTime').textContent = (S.mode === 'replay' ? replay.t : S.time).toFixed(1);
    $('gBones').textContent = dummy.list.filter(b => b.fractured).length;
    const air = S.mode === 'running' && airT > 0.7; $('airBadge').style.display = air ? 'block' : 'none'; if (air) $('airT').textContent = airT.toFixed(1);
    $('bLaunch').style.visibility = (S.mode === 'running' && !(dummy && dummy.attached)) ? 'hidden' : 'visible';
  }
  if (S.mode === 'running' || S.mode === 'ended') {
    const T = total(), el = $('score');
    if (T !== scoreShown) { el.textContent = T.toLocaleString('cs-CZ'); if (T - scoreShown > 80) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } scoreShown = T; }
  } else if (S.mode === 'setup') { scoreShown = 0; $('score').textContent = S.best ? S.best.toLocaleString('cs-CZ') : '0'; $('scoreLabel').textContent = S.best ? 'REKORD' : 'SKÓRE'; }
  if (S.mode !== 'setup') $('scoreLabel').textContent = 'SKÓRE';
  if (S.mode === 'running' && car) engineSound(car.speed, car.engineOn && !car.crashed);
  bloomPass.strength += (0.5 - bloomPass.strength) * Math.min(1, dt * 3);
  const spd = S.mode === 'replay' ? cs.sp : (car && S.mode === 'running' ? car.speed : (dummy ? dummy.speed : 0));
  const spK = clamp((spd - 26) / 55, 0, 1);
  blurPass.uniforms.strength.value = (S.quality === 'low' ? 0.5 : 1) * spK * 0.07;
  gradePass.uniforms.edge.value += (spK * 0.28 - gradePass.uniforms.edge.value) * Math.min(1, dt * 3);
  $('speedlines').style.opacity = String(clamp((spd - 34) / 60, 0, 0.55));
  if (S.flash > 0) { $('flash').classList.add('on'); S.flash = 0; setTimeout(() => $('flash').classList.remove('on'), 60); }
  const fp = (S.mode === 'setup' || S.mode === 'launching' ? orbit.target : cs.look);
  sun.target.position.set(Math.round(fp.x), 0, Math.round(fp.z)); sun.position.copy(sun.target.position).add(sunOffset);
  sun.target.updateMatrixWorld();
  scene.userData.dome.position.copy(camera.position);
  composer.render(dt);
  if (S.xrayUntil && performance.now() < S.xrayUntil && S.mode !== 'setup') {
    const pel = dummy.pelvis.mesh.position;
    for (const b of dummy.list) { const xb = xray.bones[b.def.name]; xb.grp.position.copy(b.mesh.position).sub(pel); xb.grp.quaternion.copy(b.mesh.quaternion); }
    renderOverlay(xray.scene, xray.cam, $('xrayFrame'));
  } else if (S.xrayUntil) { S.xrayUntil = 0; $('xrayFrame').style.display = 'none'; }
  if (S.mode === 'ended' && heat.group) { heat.group.rotation.y = now / 1400; heatR.render(heat.scene, heat.cam); }
}

// ===================================================== boot
addEventListener('resize', () => setTimeout(refreshSheetH, 50));
refreshSettings();
build({ cam: true });
applyTabs();
$('loading').classList.add('hide');
requestAnimationFrame(frame);
window.__game = { undo, snap, step(n) { for (let i = 0; i < n && S.mode === 'running'; i++) physicsStep(H); syncEntities(); }, S, get car() { return car; }, get dummy() { return dummy; }, get track() { return track; }, build, doLaunch, startLaunch, releaseLaunch, get score() { return sc; }, total, rec, replay, entities, togglePause, exitReplay, world, cycleCam, saveState };
window.__eng = { orbit, S, composer, bloomPass, blurPass, renderer, scene, camera };
import('./vehicles.js').then(m => { window.__veh = m.VEHICLES; });
