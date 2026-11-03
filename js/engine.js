// Core: renderer, scene, sky / clouds / environment reflections, post-processing, physics world, entity registry, shared state.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

export { THREE, CANNON };

export const GROUP = { GROUND: 1, CAR: 2, DUMMY: 4, DEBRIS: 8, STATIC: 16 };
export const ALL = 0xffff;

export const IS_TOUCH = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
export const QUAL = {
  high: { pr: 2, shadow: 4096, msaa: 4, fxaa: false, every: 1, iter: 16, chunks: 1 },
  med: { pr: 1.5, shadow: 2048, msaa: 2, fxaa: true, every: 1, iter: 14, chunks: 0.8 },
  low: { pr: 1.25, shadow: 1024, msaa: 0, fxaa: true, every: 2, iter: 10, chunks: 0.6 },
};

// ---------- shared game state ----------
export const S = {
  mode: 'setup', time: 0, pose: 'sitting', place: 'inside', steer: false, cam: 'chase', power: 0, best: 0, muted: false,
  quality: IS_TOUCH ? 'low' : 'high', autoRes: IS_TOUCH, resScale: 1, shake: 1, blurOn: true, bloomOn: true, slowmo: true, fixedPower: 0,
};

// ---------- renderer / scene ----------
export const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const basePR = () => Math.min(window.devicePixelRatio || 1, QUAL[S.quality].pr) * S.resScale;
renderer.setPixelRatio(basePR());
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.autoClear = true;
document.getElementById('game').appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xa9c8e8, 0.0042);
scene.environmentIntensity = 0.7;
export const levelGroup = new THREE.Group();   // everything rebuilt per attempt
scene.add(levelGroup);

export const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2200);
camera.position.set(0, 12, 20);

// ----- sky dome: gradient + sun disc/glow + stars -----
const domeMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: {
    top: { value: new THREE.Color(0x2b6fd6) }, mid: { value: new THREE.Color(0x9ec8f0) }, bot: { value: new THREE.Color(0xe8dcc0) },
    sunDir: { value: new THREE.Vector3(0.5, 0.7, 0.4).normalize() }, sunCol: { value: new THREE.Color(0xfff1d8) }, sunSize: { value: 1 }, stars: { value: 0 },
  },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunSize; uniform float stars;
    float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    void main(){
      vec3 d = normalize(vP); float h = d.y;
      vec3 c = mix(bot, mid, smoothstep(-0.05, 0.22, h)); c = mix(c, top, smoothstep(0.18, 0.9, h));
      float s = max(dot(d, normalize(sunDir)), 0.);
      c += sunCol * (pow(s, 8.) * 0.18 + pow(s, 64.) * 0.35 * sunSize);
      c += sunCol * smoothstep(0.9993 - 0.0006*sunSize, 0.9998, s) * 6. * sunSize;
      if (stars > 0.) { vec3 g = floor(d*260.); float r = hash(g); float st = step(0.9965, r) * smoothstep(0.0, 0.3, h); c += vec3(st) * stars * (0.5 + 0.5*hash(g+3.)); }
      gl_FragColor = vec4(c, 1.);
    }`,
});
const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 20), domeMat);
dome.renderOrder = -10; dome.frustumCulled = false;
scene.add(dome);
scene.userData.dome = dome; scene.userData.domeU = domeMat.uniforms;

// ----- clouds (soft sprites that drift) -----
const clouds = new THREE.Group(); scene.add(clouds);
{
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  for (let i = 0; i < 14; i++) { const x = 30 + Math.random() * 68, y = 44 + Math.random() * 40, r = 18 + Math.random() * 22; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  for (let i = 0; i < 34; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
    const a = Math.random() * Math.PI * 2, d = 300 + Math.random() * 900;
    sp.position.set(Math.cos(a) * d, 140 + Math.random() * 120, Math.sin(a) * d); const k = 140 + Math.random() * 200; sp.scale.set(k, k * 0.42, 1);
    clouds.add(sp);
  }
}
export function updateClouds(dt, camPos) {
  if (!clouds.visible) return;
  clouds.position.set(camPos.x, 0, camPos.z);
  for (const s of clouds.children) { s.position.x += dt * 3; if (s.position.x > 1100) s.position.x = -1100; }
}

// lights
export const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x5a6b45, 1.0);
scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xfff1d8, 2.6);
sun.position.set(60, 90, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(QUAL[S.quality].shadow, QUAL[S.quality].shadow);
sun.shadow.camera.left = -55; sun.shadow.camera.right = 55;
sun.shadow.camera.top = 55; sun.shadow.camera.bottom = -55;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 300;
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04; sun.shadow.radius = 2.5;
scene.add(sun); scene.add(sun.target);
export const sunOffset = new THREE.Vector3(60, 90, 40);

// ---------- post-processing ----------
const MotionBlurShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
    void main(){ vec2 d = vUv - vec2(.5); vec4 c = vec4(0.); float tot = 0.;
      for(int i=0;i<8;i++){ float t = float(i)/7.; float w = 1.-t*.55; c += texture2D(tDiffuse, vUv - d*strength*t)*w; tot += w; }
      gl_FragColor = c/tot; }`,
};
// final grade: vignette + gentle contrast/saturation + speed-edge darkening
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vig: { value: 0.32 }, sat: { value: 1.12 }, con: { value: 1.06 }, edge: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vig; uniform float sat; uniform float con; uniform float edge; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(.299,.587,.114));
      c.rgb = mix(vec3(l), c.rgb, sat); c.rgb = (c.rgb - .5)*con + .5;
      vec2 q = vUv - .5; float v = smoothstep(.85, .25, length(q*vec2(1.1,1.)) ); c.rgb *= mix(1., v, vig + edge);
      gl_FragColor = vec4(c.rgb, c.a); }`,
};
export let composer, bloomPass, blurPass, fxaaPass, gradePass;
function buildComposer(w, h) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: QUAL[S.quality].msaa });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.65, 0.92);
  composer.addPass(bloomPass);
  blurPass = new ShaderPass(MotionBlurShader); composer.addPass(blurPass);
  composer.addPass(new OutputPass());
  fxaaPass = new ShaderPass(FXAAShader); fxaaPass.enabled = QUAL[S.quality].fxaa; composer.addPass(fxaaPass);
  gradePass = new ShaderPass(GradeShader); composer.addPass(gradePass);
}
export const view = { w: 1, h: 1 };
export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  view.w = w; view.h = h;
  renderer.setPixelRatio(basePR());
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (!composer) buildComposer(w, h);
  const pr = renderer.getPixelRatio();
  composer.setPixelRatio(pr); composer.setSize(w, h);
  fxaaPass.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
}
window.addEventListener('resize', resize);
resize();

// ---------- physics ----------
export const world = new CANNON.World();
world.gravity.set(0, -11, 0);
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.solver.iterations = QUAL[S.quality].iter;
world.solver.tolerance = 0.001;
world.defaultContactMaterial.friction = 0.4;
world.defaultContactMaterial.restitution = 0.05;

export const M = {
  ground: new CANNON.Material('ground'), dummy: new CANNON.Material('dummy'), car: new CANNON.Material('car'),
  debris: new CANNON.Material('debris'), slick: new CANNON.Material('slick'),
};
const CMS = {};
function cm(k, a, b, friction, restitution) {
  CMS[k] = new CANNON.ContactMaterial(a, b, { friction, restitution, contactEquationStiffness: 1e7, contactEquationRelaxation: 3 });
  world.addContactMaterial(CMS[k]);
}
cm('dg', M.dummy, M.ground, 0.7, 0.12); cm('dd', M.dummy, M.dummy, 0.3, 0.02); cm('dc', M.dummy, M.car, 0.5, 0.1);
cm('db', M.dummy, M.debris, 0.5, 0.15); cm('cg', M.car, M.ground, 0.35, 0.1); cm('cb', M.car, M.debris, 0.4, 0.1);
cm('bg', M.debris, M.ground, 0.6, 0.2); cm('bb', M.debris, M.debris, 0.5, 0.05); cm('cc', M.car, M.car, 0.3, 0.1);
export function setSurface(dummyFriction, bounce) {
  CMS.dg.friction = dummyFriction; CMS.dg.restitution = bounce ?? 0.12;
  CMS.cg.restitution = bounce ? bounce * 0.6 : 0.1; CMS.bg.restitution = bounce ?? 0.2;
}

// ---------- entities (physics body + mesh pairs, recorded for replay) ----------
export const entities = [];
export function addEntity(body, mesh, opts = {}) {
  const e = { body, mesh, id: entities.length, kind: opts.kind || '', inWorld: false, static: !!opts.static };
  entities.push(e);
  if (mesh) levelGroup.add(mesh);
  if (body && body.updateAABB) body.updateAABB();   // raycast vehicle needs up-to-date AABBs on static bodies
  if (body && !opts.dormant && !opts.noWorld) { world.addBody(body); e.inWorld = true; }
  if (body) body.entity = e;
  return e;
}
export function activateEntity(e, show = true) {
  if (!e.inWorld && e.body && e.body.addEventListener && !e.noWorld) { e.body.updateAABB(); world.addBody(e.body); e.inWorld = true; }
  if (e.mesh) e.mesh.visible = show;
}
export function deactivateEntity(e) {
  if (e.inWorld) { world.removeBody(e.body); e.inWorld = false; }
  if (e.mesh) e.mesh.visible = false;
}
export const disposers = [];
export function clearLevel() {
  for (const d of disposers) d();
  disposers.length = 0;
  for (const b of [...world.bodies]) world.removeBody(b);
  for (const c of [...world.constraints]) world.removeConstraint(c);
  world.contacts.length = 0;
  world.collisionMatrix.reset && world.collisionMatrix.reset();
  world.collisionMatrixPrevious.reset && world.collisionMatrixPrevious.reset();
  levelGroup.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
  levelGroup.clear();
  entities.length = 0;
}
// copy dynamic body transforms to meshes (static entities are placed once at creation)
export function syncEntities() {
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e.static || !e.mesh || !e.inWorld || e.frozen) continue;
    const b = e.body;
    if (b.sleepState === 2) continue;       // sleeping bodies don't move
    e.mesh.position.set(b.position.x, b.position.y, b.position.z);
    e.mesh.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
  }
}

// ---------- helpers ----------
const sharedGeo = {};
export function boxGeo(w, h, d, sx = 1, sy = 1, sz = 1) {
  const k = [w, h, d, sx, sy, sz].join('|');
  if (!sharedGeo[k]) { sharedGeo[k] = new THREE.BoxGeometry(w, h, d, sx, sy, sz); sharedGeo[k].userData.shared = true; }
  return sharedGeo[k];
}
export function mat(color, o = {}) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.7, metalness: 0.05, flatShading: true }, o));
}
export function paint(color, o = {}) {   // glossy car paint (clear-coat on better quality levels)
  if (S.quality === 'low') return mat(color, Object.assign({ roughness: 0.35, metalness: 0.45 }, o));
  return new THREE.MeshPhysicalMaterial(Object.assign({ color, roughness: 0.32, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.12, flatShading: true }, o));
}
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export { buildComposer };

// ---------- environment ----------
const pmrem = new THREE.PMREMGenerator(renderer);
const envCache = {};
export function applyEnv(map, id) {
  const u = domeMat.uniforms;
  u.top.value.setHex(map.sky[0]); u.mid.value.setHex(map.sky[1]); u.bot.value.setHex(map.sky[2]);
  const sd = map.sunDir || [0.5, 0.7, 0.4];
  u.sunDir.value.set(...sd).normalize(); u.sunCol.value.setHex(map.sun[0]); u.sunSize.value = map.sunSize ?? 1; u.stars.value = map.stars || 0;
  sunOffset.set(sd[0], sd[1], sd[2]).normalize().multiplyScalar(110);
  scene.fog.color.setHex(map.fog[0]); scene.fog.density = map.fog[1];
  hemi.color.setHex(map.hemi[0]); hemi.groundColor.setHex(map.hemi[1]); hemi.intensity = map.hemi[2];
  sun.color.setHex(map.sun[0]); sun.intensity = map.sun[1];
  clouds.visible = (map.clouds ?? 1) > 0; for (const s of clouds.children) s.material.color.setHex(map.cloudCol ?? 0xffffff), s.material.opacity = 0.85 * (map.clouds ?? 1);
  world.gravity.set(0, map.gravity, 0);
  // reflections for glossy paint
  if (!envCache[id]) {
    const tmp = new THREE.Scene(); const d2 = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), domeMat); tmp.add(d2);
    envCache[id] = pmrem.fromScene(tmp, 0, 0.1, 1000).texture;
  }
  scene.environment = envCache[id]; scene.environmentIntensity = map.env ?? 0.7;
}
export function setQuality(q) {
  S.quality = q;
  const Q = QUAL[q];
  sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  world.solver.iterations = Q.iter;
  composer.renderTarget1.samples = Q.msaa; composer.renderTarget2.samples = Q.msaa;
  composer.renderTarget1.dispose(); composer.renderTarget2.dispose();
  fxaaPass.enabled = Q.fxaa;
  renderer.shadowMap.autoUpdate = Q.every === 1;
  resize();
}
let shadowN = 0;
export function shadowTick() { const q = QUAL[S.quality]; if (q.every > 1) { renderer.shadowMap.autoUpdate = false; if (++shadowN % q.every === 0) renderer.shadowMap.needsUpdate = true; } }
// adaptive resolution: nudges the render scale so the game stays smooth on weak phones
let emaDt = 1 / 60, lastAdj = 0;
export function adaptRes(dt, now) {
  emaDt += (dt - emaDt) * 0.05;
  if (!S.autoRes || now - lastAdj < 1500) return;
  if (emaDt > 1 / 36 && S.resScale > 0.55) { S.resScale = Math.max(0.55, S.resScale - 0.1); lastAdj = now; resize(); }
  else if (emaDt < 1 / 58 && S.resScale < 1) { S.resScale = Math.min(1, S.resScale + 0.05); lastAdj = now; resize(); }
}
