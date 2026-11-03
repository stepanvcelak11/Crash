// Vehicle catalogue. Local frame: +x right, +y up, front of the vehicle = -z.
// parts: deformable boxes (limit < Infinity => can be torn off). mat: body | trim | wire | dark
const P = (name, size, pos, seg, limit = Infinity, mat = 'body') => ({ name, size, pos, seg, limit, mat });

export const VEHICLES = {
  sedan: {
    name: 'Auto', icon: '🚗', mass: 900, rideY: 0.66, dentScale: 1, steer: 0.42, accel: 1, speed: [14, 64], color: 0xd8362a,
    shapes: [{ h: [0.85, 0.2, 1.1], o: [0, 0.03, 0] }, { h: [0.85, 0.12, 0.5], o: [0, 0.24, -1.65] }, { h: [0.85, 0.12, 0.5], o: [0, 0.24, 1.65] }, { h: [0.72, 0.38, 0.95], o: [0, 0.66, 0.25] }],
    wheels: { pts: [[-0.95, 0, -1.4], [0.95, 0, -1.4], [-0.95, 0, 1.35], [0.95, 0, 1.35]], r: 0.38, w: 0.3, rest: 0.28, travel: 0.28, stiff: 60, damp: [3.4, 5.5], slip: 3.4, roll: 0.04 },
    parts: [
      P('tub', [1.7, 0.56, 4.2], [0, 0, 0], [5, 3, 14]),
      P('hood', [1.62, 0.1, 1.35], [0, 0.31, -1.42], [5, 1, 5], 0.9), P('trunk', [1.62, 0.1, 0.8], [0, 0.31, 1.7], [5, 1, 3], 0.9),
      P('bumperF', [1.8, 0.24, 0.3], [0, -0.1, -2.2], [6, 2, 2], 0.65, 'trim'), P('bumperR', [1.8, 0.24, 0.3], [0, -0.1, 2.2], [6, 2, 2], 0.65, 'trim'),
      P('doorL', [0.09, 0.42, 1.1], [0.88, 0.08, 0.3], [1, 3, 5], 0.7), P('doorR', [0.09, 0.42, 1.1], [-0.88, 0.08, 0.3], [1, 3, 5], 0.7),
      P('roof', [1.5, 0.08, 1.9], [0, 1.07, 0.25], [4, 1, 5]),
    ],
    glass: { size: [1.46, 0.78, 1.88], pos: [0, 0.67, 0.25] },
    lights: { head: [[-0.6, 0.12, -2.37], [0.6, 0.12, -2.37]], tail: [[-0.6, 0.14, 2.37], [0.6, 0.14, 2.37]] },
    place: { inside: { y: -0.24, z: 0.3 }, roof: { y: 1.13, z: 0.25 }, hood: { y: 0.39, z: -1.4 } },
  },
  cart: {
    name: 'Nákupní košík', icon: '🛒', mass: 190, rideY: 0.19, dentScale: 0.55, steer: 0.55, accel: 1, speed: [5, 15], color: 0xb9c2cc,
    shapes: [{ h: [0.3, 0.05, 0.5], o: [0, 0.08, 0] }, { h: [0.3, 0.3, 0.03], o: [0, 0.4, -0.48] }, { h: [0.3, 0.03, 0.03], o: [0, 0.78, 0.55] }],
    wheels: { pts: [[-0.3, 0, -0.48], [0.3, 0, -0.48], [-0.3, 0, 0.48], [0.3, 0, 0.48]], r: 0.1, w: 0.06, rest: 0.1, travel: 0.1, stiff: 70, damp: [3.2, 5.5], slip: 2.2, roll: 0.05 },
    parts: [
      P('tub', [0.62, 0.05, 1.0], [0, 0.05, 0], [4, 1, 7], Infinity, 'wire'),
      P('wallF', [0.62, 0.55, 0.04], [0, 0.35, -0.5], [4, 4, 1], 0.6, 'wire'), P('wallR', [0.62, 0.55, 0.04], [0, 0.35, 0.5], [4, 4, 1], 0.6, 'wire'),
      P('doorL', [0.04, 0.55, 1.0], [-0.31, 0.35, 0], [1, 4, 7], 0.7, 'wire'), P('doorR', [0.04, 0.55, 1.0], [0.31, 0.35, 0], [1, 4, 7], 0.7, 'wire'),
      P('handle', [0.62, 0.05, 0.05], [0, 0.78, 0.56], [4, 1, 1], 0.5, 'trim'),
    ],
    glass: null, lights: null,
    place: { inside: { y: 0.085, z: 0.05 }, roof: { y: 0.66, z: 0.0 }, hood: { y: 0.66, z: -0.3 } },
  },
  kart: {
    name: 'Motokára', icon: '🏎️', mass: 260, rideY: 0.31, dentScale: 0.7, steer: 0.5, accel: 1.1, speed: [14, 60], color: 0x2a7bd8,
    shapes: [{ h: [0.5, 0.1, 0.9], o: [0, 0, 0] }, { h: [0.4, 0.08, 0.3], o: [0, 0.05, -1.0] }, { h: [0.4, 0.25, 0.05], o: [0, 0.35, 0.7] }],
    wheels: { pts: [[-0.62, 0, -0.78], [0.62, 0, -0.78], [-0.62, 0, 0.7], [0.62, 0, 0.7]], r: 0.2, w: 0.2, rest: 0.14, travel: 0.14, stiff: 75, damp: [3.2, 5], slip: 3.8, roll: 0.04 },
    parts: [
      P('tub', [1.0, 0.14, 1.9], [0, 0, 0], [4, 1, 8]), P('nose', [0.7, 0.12, 0.55], [0, 0.03, -1.2], [3, 1, 3], 0.6),
      P('podL', [0.24, 0.22, 1.0], [0.56, 0.13, 0.1], [1, 2, 4], 0.6), P('podR', [0.24, 0.22, 1.0], [-0.56, 0.13, 0.1], [1, 2, 4], 0.6),
      P('seat', [0.8, 0.5, 0.1], [0, 0.35, 0.72], [3, 3, 1], Infinity, 'dark'),
      P('bumperF', [1.2, 0.12, 0.14], [0, -0.01, -1.55], [5, 1, 1], 0.5, 'trim'), P('bumperR', [1.2, 0.12, 0.14], [0, -0.01, 1.05], [5, 1, 1], 0.5, 'trim'),
    ],
    glass: null, lights: null,
    place: { inside: { y: 0.09, z: 0.3 }, roof: { y: 0.62, z: 0.72 }, hood: { y: 0.1, z: -1.1 } },
  },
  van: {
    name: 'Dodávka', icon: '🚐', mass: 2200, rideY: 0.8, dentScale: 1.3, steer: 0.34, accel: 0.8, speed: [10, 44], color: 0xf0f0f0,
    shapes: [{ h: [1.0, 0.35, 2.2], o: [0, 0, 0] }, { h: [0.95, 0.65, 1.7], o: [0, 0.95, 0.75] }, { h: [0.9, 0.4, 0.7], o: [0, 0.7, -1.5] }],
    wheels: { pts: [[-1.1, 0, -1.8], [1.1, 0, -1.8], [-1.1, 0, 1.6], [1.1, 0, 1.6]], r: 0.45, w: 0.35, rest: 0.35, travel: 0.3, stiff: 55, damp: [3.4, 5.5], slip: 3.2, roll: 0.03 },
    parts: [
      P('tub', [2.0, 0.7, 5.0], [0, 0, 0], [5, 3, 14]), P('cargo', [1.96, 1.3, 3.2], [0, 0.95, 0.85], [5, 5, 8]), P('cab', [1.9, 0.9, 1.5], [0, 0.8, -1.55], [5, 3, 4]),
      P('hood', [1.9, 0.12, 0.8], [0, 0.4, -2.25], [5, 1, 3], 1.0),
      P('bumperF', [2.1, 0.3, 0.3], [0, -0.2, -2.6], [6, 2, 2], 0.7, 'trim'), P('bumperR', [2.1, 0.3, 0.3], [0, -0.2, 2.6], [6, 2, 2], 0.7, 'trim'),
      P('doorL', [0.09, 0.7, 1.1], [0.98, 0.25, -1.45], [1, 3, 5], 0.8), P('doorR', [0.09, 0.7, 1.1], [-0.98, 0.25, -1.45], [1, 3, 5], 0.8),
    ],
    glass: { size: [1.8, 0.5, 1.1], pos: [0, 1.0, -1.7] },
    lights: { head: [[-0.7, 0.1, -2.77], [0.7, 0.1, -2.77]], tail: [[-0.8, 0.3, 2.77], [0.8, 0.3, 2.77]] },
    place: { inside: { y: 0.36, z: -1.4 }, roof: { y: 1.62, z: 0.6 }, hood: { y: 0.47, z: -2.25 } },
  },
  monster: {
    name: 'Monster truck', icon: '🚙', mass: 2600, rideY: 1.44, dentScale: 1.3, steer: 0.32, accel: 0.75, speed: [10, 40], color: 0x62b82a,
    shapes: [{ h: [0.95, 0.4, 2.0], o: [0, 0.5, 0] }, { h: [0.8, 0.45, 0.9], o: [0, 1.3, 0.5] }],
    wheels: { pts: [[-1.4, 0, -1.7], [1.4, 0, -1.7], [-1.4, 0, 1.5], [1.4, 0, 1.5]], r: 0.85, w: 0.6, rest: 0.6, travel: 0.5, stiff: 55, damp: [3.4, 5.5], slip: 3.2, roll: 0.03 },
    parts: [
      P('tub', [1.9, 0.8, 4.0], [0, 0.5, 0], [5, 3, 10]), P('hood', [1.8, 0.14, 1.3], [0, 0.97, -1.3], [5, 1, 4], 1.0),
      P('bumperF', [2.1, 0.32, 0.3], [0, 0.45, -2.15], [6, 2, 2], 0.75, 'trim'), P('bumperR', [2.1, 0.32, 0.3], [0, 0.45, 2.15], [6, 2, 2], 0.75, 'trim'),
      P('roof', [1.6, 0.1, 1.8], [0, 1.78, 0.5], [4, 1, 4]),
      P('doorL', [0.09, 0.6, 1.2], [0.96, 1.2, 0.5], [1, 3, 4], 0.8), P('doorR', [0.09, 0.6, 1.2], [-0.96, 1.2, 0.5], [1, 3, 4], 0.8),
    ],
    glass: { size: [1.6, 0.68, 1.8], pos: [0, 1.42, 0.5] },
    lights: { head: [[-0.7, 0.62, -2.32], [0.7, 0.62, -2.32]], tail: [] },
    place: { inside: { y: 0.92, z: 0.5 }, roof: { y: 1.84, z: 0.5 }, hood: { y: 1.04, z: -1.3 } },
  },
};
// scale a spec uniformly (used for the Mini)
function scaled(src, k, over) {
  const v = a => a.map(x => x * k), sp = JSON.parse(JSON.stringify(src));
  sp.shapes.forEach(s => { s.h = v(s.h); s.o = v(s.o); });
  const w = sp.wheels; w.pts = w.pts.map(v); w.r *= k; w.w *= k; w.rest *= k; w.travel *= k;
  sp.parts.forEach(p => { p.size = v(p.size); p.pos = v(p.pos); });
  if (sp.glass) { sp.glass.size = v(sp.glass.size); sp.glass.pos = v(sp.glass.pos); }
  if (sp.lights) { sp.lights.head = sp.lights.head.map(v); sp.lights.tail = sp.lights.tail.map(v); }
  for (const k2 in sp.place) { sp.place[k2].y *= k; sp.place[k2].z *= k; }
  sp.rideY *= k; sp.dentScale *= k;
  return Object.assign(sp, over);
}
VEHICLES.mini = scaled(VEHICLES.sedan, 0.72, { name: 'Mini', icon: '🚘', mass: 520, color: 0xf2c230, speed: [12, 52], camDist: 7 });
VEHICLES.mini.dentScale = 0.8;

VEHICLES.bike = {
  name: 'Kolo', icon: '🚲', mass: 200, rideY: 0.43, dentScale: 0.5, steer: 0.7, accel: 1, speed: [5, 30], color: 0xd8362a, upright: 55, camDist: 5,
  shapes: [{ h: [0.05, 0.1, 0.5], o: [0, 0.38, 0] }],
  wheels: { pts: [[-0.22, 0, -0.55], [0.22, 0, -0.55], [-0.22, 0, 0.55], [0.22, 0, 0.55]], center: true, r: 0.34, w: 0.05, rest: 0.1, travel: 0.1, stiff: 50, damp: [3, 5], slip: 2.6, roll: 0.0 },
  parts: [
    P('tub', [0.07, 0.07, 1.1], [0, 0.35, 0], [1, 1, 6]), P('seat', [0.14, 0.05, 0.28], [0, 0.55, 0.2], [1, 1, 2], Infinity, 'dark'),
    P('handle', [0.52, 0.04, 0.04], [0, 0.78, -0.48], [4, 1, 1], 0.4, 'trim'), P('fork', [0.05, 0.5, 0.05], [0, 0.52, -0.52], [1, 3, 1], 0.5, 'trim'),
    P('rear', [0.05, 0.4, 0.05], [0, 0.4, 0.5], [1, 3, 1], Infinity, 'trim'),
  ],
  glass: null, lights: null, place: { inside: { y: 0.55, z: 0.2 }, roof: { y: 0.8, z: -0.45 }, hood: { y: 0.7, z: -0.55 } },
};
VEHICLES.motorbike = {
  name: 'Motorka', icon: '🏍️', mass: 220, rideY: 0.4, dentScale: 0.65, steer: 0.7, accel: 1.1, speed: [10, 62], color: 0x2a7bd8, upright: 26, camDist: 6,
  shapes: [{ h: [0.18, 0.18, 0.8], o: [0, 0.3, 0] }],
  wheels: { pts: [[-0.2, 0, -0.85], [0.2, 0, -0.85], [-0.2, 0, 0.8], [0.2, 0, 0.8]], center: true, r: 0.32, w: 0.13, rest: 0.1, travel: 0.1, stiff: 60, damp: [3.2, 5.5], slip: 3.2, roll: 0.0 },
  parts: [
    P('tub', [0.3, 0.3, 1.2], [0, 0.32, 0], [2, 2, 6]), P('tank', [0.32, 0.22, 0.5], [0, 0.58, -0.25], [2, 2, 3], 0.7),
    P('seat', [0.28, 0.1, 0.55], [0, 0.55, 0.38], [2, 1, 3], Infinity, 'dark'), P('handle', [0.7, 0.05, 0.05], [0, 0.88, -0.68], [5, 1, 1], 0.45, 'trim'),
    P('fork', [0.07, 0.6, 0.07], [0, 0.55, -0.74], [1, 3, 1], 0.55, 'trim'), P('exhaust', [0.08, 0.08, 0.7], [0.2, 0.25, 0.5], [1, 1, 3], 0.4, 'trim'),
  ],
  glass: null, lights: { head: [[0, 0.78, -0.86]], tail: [[0, 0.5, 0.95]] },
  place: { inside: { y: 0.6, z: 0.4 }, roof: { y: 0.92, z: -0.65 }, hood: { y: 0.72, z: -0.25 } },
};
VEHICLES.plane = {
  name: 'Letadlo', icon: '✈️', mass: 900, rideY: 0.46, dentScale: 1.2, steer: 0.35, accel: 1.1, speed: [22, 70], color: 0xf0f0f0, camDist: 14,
  fly: { type: 'plane', takeoff: 24 },
  shapes: [{ h: [0.5, 0.45, 2.9], o: [0, 0.5, 0] }, { h: [2.6, 0.06, 0.65], o: [0, 0.78, -0.25] }],
  wheels: { pts: [[-0.3, 0, -1.7], [0.3, 0, -1.7], [-1.0, 0, 0.5], [1.0, 0, 0.5]], r: 0.26, w: 0.14, rest: 0.2, travel: 0.2, stiff: 55, damp: [3.2, 5], slip: 3, roll: 0.03 },
  parts: [
    P('tub', [1.0, 0.95, 5.6], [0, 0.5, 0], [4, 3, 12]), P('nose', [0.85, 0.75, 0.7], [0, 0.45, -3.15], [3, 3, 2], 0.8, 'trim'),
    P('wingL', [4.2, 0.12, 1.3], [2.6, 0.8, -0.25], [8, 1, 3], 0.9), P('wingR', [4.2, 0.12, 1.3], [-2.6, 0.8, -0.25], [8, 1, 3], 0.9),
    P('fin', [0.1, 1.2, 1.0], [0, 1.45, 2.6], [1, 3, 3], 0.7), P('stab', [2.6, 0.1, 0.8], [0, 0.95, 2.7], [6, 1, 2], 0.7),
    P('prop', [0.1, 1.7, 0.16], [0, 0.45, -3.55], [1, 4, 1], 0.5, 'dark'),
  ],
  glass: { size: [0.95, 0.5, 1.4], pos: [0, 1.0, -0.7] }, lights: { head: [[-0.9, 0.75, -0.9]], tail: [] },
  place: { inside: { y: 0.55, z: -0.6 }, roof: { y: 1.0, z: 0.9 }, hood: { y: 0.82, z: -3.0 } },
};
VEHICLES.rocket = {
  name: 'Raketa', icon: '🚀', mass: 700, rideY: 2.5, dentScale: 1, steer: 0.3, accel: 1, speed: [30, 90], color: 0xe8e8ee, camDist: 12, camH: 4,
  fly: { type: 'rocket', thrust: 2.3, burn: 3.6 }, pitch: 0.62,
  shapes: [{ h: [0.5, 0.5, 2.4], o: [0, 0, 0] }],
  wheels: { pts: [[-0.5, -0.3, -1.2], [0.5, -0.3, -1.2], [-0.5, -0.3, 1.8], [0.5, -0.3, 1.8]], r: 0.12, w: 0.1, rest: 0.1, travel: 0.1, stiff: 40, damp: [3, 5], slip: 2, roll: 0.02 },
  parts: [
    P('tub', [1.0, 1.0, 4.6], [0, 0, 0], [4, 4, 10]), P('nose', [0.8, 0.8, 1.4], [0, 0, -3.0], [3, 3, 3], 0.7, 'trim'),
    P('finL', [1.1, 0.1, 1.0], [0.95, 0, 1.8], [3, 1, 3], 0.6, 'trim'), P('finR', [1.1, 0.1, 1.0], [-0.95, 0, 1.8], [3, 1, 3], 0.6, 'trim'), P('finT', [0.1, 1.1, 1.0], [0, 0.95, 1.8], [1, 3, 3], 0.6, 'trim'),
    P('nozzle', [0.6, 0.6, 0.5], [0, 0, 2.6], [2, 2, 2], 1.0, 'dark'),
  ],
  glass: null, lights: null, place: { inside: { y: 0.5, z: 0.4 }, roof: { y: 0.5, z: -0.8 }, hood: { y: 0.5, z: -2.0 } },
};
VEHICLES.sled = {
  name: 'Sáňky', icon: '🛷', mass: 160, rideY: 0.22, dentScale: 0.6, steer: 0.55, accel: 1.4, speed: [10, 50], color: 0x2a7bd8, camDist: 6,
  shapes: [{ h: [0.45, 0.1, 1.0], o: [0, 0.1, 0] }, { h: [0.4, 0.1, 0.3], o: [0, 0.2, -1.2] }],
  wheels: { pts: [[-0.42, 0, -0.9], [0.42, 0, -0.9], [-0.42, 0, 0.8], [0.42, 0, 0.8]], r: 0.12, w: 0.1, rest: 0.1, travel: 0.1, stiff: 60, damp: [3, 5], slip: 0.55, roll: 0.05 },
  parts: [
    P('tub', [0.95, 0.12, 2.2], [0, 0.1, 0], [4, 1, 8]), P('nose', [0.8, 0.28, 0.6], [0, 0.24, -1.3], [3, 2, 2], 0.6),
    P('railL', [0.07, 0.1, 2.6], [0.45, -0.04, -0.05], [1, 1, 6], 0.9, 'dark'), P('railR', [0.07, 0.1, 2.6], [-0.45, -0.04, -0.05], [1, 1, 6], 0.9, 'dark'),
    P('back', [0.8, 0.5, 0.08], [0, 0.4, 0.9], [3, 3, 1], Infinity, 'dark'),
  ],
  glass: null, lights: null, place: { inside: { y: 0.16, z: 0.2 }, roof: { y: 0.64, z: 0.9 }, hood: { y: 0.34, z: -1.3 } },
};
VEHICLES.tractor = {
  name: 'Traktor', icon: '🚜', mass: 1800, rideY: 1.0, dentScale: 1.1, steer: 0.4, accel: 0.9, speed: [8, 34], color: 0xd9531e, camDist: 11,
  shapes: [{ h: [0.55, 0.25, 1.5], o: [0, 0, 0] }, { h: [0.45, 0.35, 0.75], o: [0, 0.55, -1.0] }, { h: [0.6, 0.45, 0.6], o: [0, 1.4, 0.8] }],
  wheels: { pts: [[-0.95, 0, -1.4], [0.95, 0, -1.4], [-1.1, 0, 1.0], [1.1, 0, 1.0]], rs: [0.45, 0.45, 0.78, 0.78], r: 0.6, w: 0.42, rest: 0.25, travel: 0.25, stiff: 55, damp: [3.4, 5.5], slip: 3.2, roll: 0.03 },
  parts: [
    P('tub', [1.1, 0.5, 3.4], [0, 0, 0], [3, 2, 8]), P('hood', [0.95, 0.75, 1.6], [0, 0.55, -1.0], [3, 3, 4], 1.0),
    P('roof', [1.3, 0.08, 1.3], [0, 1.95, 0.8], [3, 1, 3]), P('pipe', [0.12, 0.9, 0.12], [0.4, 1.2, -1.3], [1, 3, 1], 0.4, 'trim'),
    P('bumperF', [1.3, 0.25, 0.25], [0, -0.1, -1.95], [4, 1, 1], 0.6, 'trim'), P('seatP', [0.6, 0.5, 0.1], [0, 1.3, 1.25], [2, 2, 1], Infinity, 'dark'),
  ],
  glass: { size: [1.2, 0.9, 1.2], pos: [0, 1.45, 0.8] }, lights: { head: [[-0.4, 0.4, -1.82], [0.4, 0.4, -1.82]], tail: [] },
  place: { inside: { y: 0.3, z: 0.8 }, roof: { y: 2.0, z: 0.8 }, hood: { y: 0.95, z: -1.0 } },
};
VEHICLES.bus = {
  name: 'Autobus', icon: '🚌', mass: 5000, rideY: 0.9, dentScale: 1.5, steer: 0.3, accel: 0.6, speed: [8, 34], color: 0xf0b21c, camDist: 16, camH: 5,
  shapes: [{ h: [1.2, 0.4, 5.0], o: [0, 0, 0] }, { h: [1.15, 0.9, 4.8], o: [0, 1.3, 0] }],
  wheels: { pts: [[-1.2, 0, -3.3], [1.2, 0, -3.3], [-1.2, 0, 3.0], [1.2, 0, 3.0]], r: 0.5, w: 0.35, rest: 0.4, travel: 0.35, stiff: 50, damp: [3.4, 5.5], slip: 3.2, roll: 0.03 },
  parts: [
    P('tub', [2.4, 0.8, 10], [0, 0, 0], [4, 2, 16]), P('body', [2.4, 1.8, 9.6], [0, 1.3, 0], [4, 5, 16]),
    P('bumperF', [2.5, 0.3, 0.3], [0, -0.2, -5.15], [5, 1, 1], 0.7, 'trim'), P('bumperR', [2.5, 0.3, 0.3], [0, -0.2, 5.15], [5, 1, 1], 0.7, 'trim'),
    P('doorL', [0.09, 1.5, 1.2], [1.22, 0.9, -3.6], [1, 4, 3], 0.9), P('doorR', [0.09, 1.5, 1.2], [-1.22, 0.9, -3.6], [1, 4, 3], 0.9),
  ],
  glass: { size: [2.42, 0.7, 9.0], pos: [0, 1.75, 0] }, lights: { head: [[-0.9, 0.1, -5.05], [0.9, 0.1, -5.05]], tail: [[-0.9, 0.2, 5.05], [0.9, 0.2, 5.05]] },
  place: { inside: { y: 0.4, z: -3.8 }, roof: { y: 2.22, z: 0 }, hood: { y: 0.4, z: -5.0 } },
};
VEHICLES.tank = {
  name: 'Tank', icon: '🪖', mass: 9000, rideY: 0.85, dentScale: 0.45, steer: 0.28, accel: 0.55, speed: [6, 24], color: 0x5f7a3a, camDist: 15, camH: 5,
  shapes: [{ h: [1.4, 0.45, 3.0], o: [0, 0.3, 0] }, { h: [0.9, 0.35, 1.1], o: [0, 1.1, 0.4] }],
  wheels: { pts: [[-1.55, 0, -2.4], [1.55, 0, -2.4], [-1.55, 0, 2.2], [1.55, 0, 2.2]], r: 0.5, w: 0.8, rest: 0.35, travel: 0.3, stiff: 50, damp: [3.4, 5.5], slip: 3.2, roll: 0.02 },
  parts: [
    P('tub', [2.8, 0.9, 6.0], [0, 0.3, 0], [4, 2, 10]), P('turret', [1.8, 0.7, 2.2], [0, 1.1, 0.4], [3, 2, 4], Infinity),
    P('barrel', [0.26, 0.26, 3.3], [0, 1.15, -2.2], [1, 1, 5], 0.7, 'dark'),
    P('trackL', [0.8, 0.95, 6.2], [1.6, 0.0, 0], [2, 3, 10], 1.6, 'dark'), P('trackR', [0.8, 0.95, 6.2], [-1.6, 0.0, 0], [2, 3, 10], 1.6, 'dark'),
  ],
  glass: null, lights: null, place: { inside: { y: 1.46, z: 0.4 }, roof: { y: 1.46, z: 0.4 }, hood: { y: 0.77, z: -2.0 } },
};
VEHICLES.chair = {
  name: 'Židle', icon: '💺', mass: 140, rideY: 0.14, dentScale: 0.45, steer: 0.65, accel: 1.2, speed: [5, 18], color: 0x3a3f4a, camDist: 4.5, camH: 1.8,
  shapes: [{ h: [0.28, 0.06, 0.28], o: [0, 0.18, 0] }],
  wheels: { pts: [[-0.28, 0, -0.28], [0.28, 0, -0.28], [-0.28, 0, 0.28], [0.28, 0, 0.28]], r: 0.06, w: 0.04, rest: 0.08, travel: 0.08, stiff: 70, damp: [3.2, 5.5], slip: 2.2, roll: 0.04 },
  parts: [
    P('tub', [0.56, 0.1, 0.56], [0, 0.18, 0], [3, 1, 3], Infinity, 'dark'), P('back', [0.5, 0.62, 0.08], [0, 0.55, 0.27], [3, 3, 1], 0.5, 'dark'),
    P('stem', [0.08, 0.2, 0.08], [0, 0.04, 0], [1, 2, 1], Infinity, 'trim'), P('armL', [0.06, 0.05, 0.4], [0.3, 0.38, 0.05], [1, 1, 2], 0.4, 'trim'), P('armR', [0.06, 0.05, 0.4], [-0.3, 0.38, 0.05], [1, 1, 2], 0.4, 'trim'),
  ],
  glass: null, lights: null, place: { inside: { y: 0.24, z: 0 }, roof: { y: 0.86, z: 0.27 }, hood: { y: 0.24, z: -0.25 } },
};

export const VEHICLE_LIST = Object.entries(VEHICLES);
export const COLORS = [0xd8362a, 0x2a7bd8, 0xf2c230, 0x62b82a, 0xf0f0f0, 0x8a3fd8, 0x222226, 0xff7a1a];
