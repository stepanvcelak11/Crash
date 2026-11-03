// Core: renderer, scene, post-processing, physics world, entity registry, shared state.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export { THREE, CANNON };

export const GROUP = { GROUND: 1, CAR: 2, DUMMY: 4, DEBRIS: 8, STATIC: 16 };
export const ALL = 0xffff;

// ---------- shared game state ----------
export const IS_TOUCH = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
export const S = {
  mode: 'setup',            // setup | launching | running | ended | replay
  time: 0,                  // simulation time of the attempt (s)
  pose: 'sitting',
  place: 'inside',          // inside | roof | hood | road
  steer: false,
  slots: [],                // obstacle type per slot (null = empty)
  selectedObstacle: 'ramp',
  cam: 'chase',
  power: 0,
  best: 0,
  muted: false,
  quality: IS_TOUCH ? 'low' : 'high',
};

// ---------- renderer / scene ----------
export const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const DPR = { high: 2, med: 1.5, low: 1.25 };
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR[S.quality]));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.autoClear = true;
document.getElementById('game').appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xa9c8e8, 0.0042);
export const levelGroup = new THREE.Group();   // everything rebuilt per attempt
scene.add(levelGroup);

export const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1800);
camera.position.set(0, 12, 20);

// sky dome
{
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x2b6fd6) }, mid: { value: new THREE.Color(0x9ec8f0) }, bot: { value: new THREE.Color(0xe8dcc0) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec3 vvP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
      void main(){ float h = normalize(vP).y; vec3 c = mix(bot, mid, smoothstep(-0.05, 0.25, h)); c = mix(c, top, smoothstep(0.2, 0.9, h)); gl_FragColor = vec4(c,1.); }`.replace(/vvP/g, 'vP'),
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 16), mat);
  dome.renderOrder = -10;
  scene.add(dome);
  scene.userData.dome = dome; scene.userData.domeU = mat.uniforms;
}

// lights
export const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x5a6b45, 1.0);
scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xfff1d8, 2.6);
sun.position.set(60, 90, 40);
sun.castShadow = true;
const SHADOW = { high: 4096, med: 2048, low: 1024 };
sun.shadow.mapSize.set(SHADOW[S.quality], SHADOW[S.quality]);
sun.shadow.camera.left = -50; sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50; sun.shadow.camera.bottom = -50;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 260;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun); scene.add(sun.target);
export const sunOffset = new THREE.Vector3(60, 90, 40);

// ---------- post-processing ----------
const MotionBlurShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
    void main(){ vec2 d = vUv - vec2(.5); vec4 c = vec4(0.); float tot = 0.;
      for(int i=0;i<10;i++){ float t = float(i)/9.; float w = 1.-t*.55; c += texture2D(tDiffuse, vUv - d*strength*t)*w; tot += w; }
      gl_FragColor = c/tot; }`,
};
export let composer, bloomPass, blurPass;
function buildComposer(w, h) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: S.quality === 'high' ? 4 : (IS_TOUCH ? 0 : 2) });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.65, 0.92);
  composer.addPass(bloomPass);
  blurPass = new ShaderPass(MotionBlurShader);
  composer.addPass(blurPass);
  composer.addPass(new OutputPass());
}
export const view = { w: 1, h: 1 };
export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  view.w = w; view.h = h;
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (!composer) buildComposer(w, h);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

// ---------- physics ----------
export const world = new CANNON.World();
world.gravity.set(0, -11, 0);
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.solver.iterations = 16;
world.solver.tolerance = 0.001;
world.defaultContactMaterial.friction = 0.4;
world.defaultContactMaterial.restitution = 0.05;

export const M = {
  ground: new CANNON.Material('ground'),
  dummy: new CANNON.Material('dummy'),
  car: new CANNON.Material('car'),
  debris: new CANNON.Material('debris'),
  slick: new CANNON.Material('slick'),
};
function cm(a, b, friction, restitution) {
  world.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction, restitution, contactEquationStiffness: 1e7, contactEquationRelaxation: 3 }));
}
cm(M.dummy, M.ground, 0.7, 0.12);
cm(M.dummy, M.dummy, 0.3, 0.02);
cm(M.dummy, M.car, 0.5, 0.1);
cm(M.dummy, M.debris, 0.5, 0.15);
cm(M.car, M.ground, 0.35, 0.1);
cm(M.car, M.debris, 0.4, 0.1);
cm(M.debris, M.ground, 0.6, 0.2);
cm(M.debris, M.debris, 0.5, 0.05);
cm(M.car, M.car, 0.3, 0.1);

// ---------- entities (physics body + mesh pairs, recorded for replay) ----------
export const entities = [];
export function addEntity(body, mesh, opts = {}) {
  const e = { body, mesh, id: entities.length, kind: opts.kind || '', inWorld: false };
  entities.push(e);
  if (mesh) { levelGroup.add(mesh); }
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
// copy body transforms to meshes
export function syncEntities() {
  for (const e of entities) {
    if (e.mesh && e.body && e.inWorld !== false && !e.frozen) {
      const b = e.body;
      e.mesh.position.set(b.position.x, b.position.y, b.position.z);
      e.mesh.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    }
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
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export { buildComposer };

// ---------- environment / quality ----------
export function applyEnv(map) {
  const u = scene.userData.domeU;
  u.top.value.setHex(map.sky[0]); u.mid.value.setHex(map.sky[1]); u.bot.value.setHex(map.sky[2]);
  scene.fog.color.setHex(map.fog[0]); scene.fog.density = map.fog[1];
  hemi.color.setHex(map.hemi[0]); hemi.groundColor.setHex(map.hemi[1]); hemi.intensity = map.hemi[2];
  sun.color.setHex(map.sun[0]); sun.intensity = map.sun[1];
  world.gravity.set(0, map.gravity, 0);
}
export function setQuality(q) {
  S.quality = q;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR[q]));
  sun.shadow.mapSize.set(SHADOW[q], SHADOW[q]);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  resize();
}
