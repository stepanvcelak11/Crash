// Map catalogue. Objects: {type,x,z,yaw,s,y}. Start is used when the player hasn't drawn a route.
const O = (type, x, z, yaw = 0, s = 1, y = 0) => ({ type, x, z, yaw, s, y });

export const MAPS = {
  road: {
    name: 'Silnice', icon: '🛣️', desc: 'Klasická testovací silnice se zdmi na konci.',
    sky: [0x2b6fd6, 0x9ec8f0, 0xe8dcc0], fog: [0xa9c8e8, 0.0042], hemi: [0xcfe4ff, 0x5a6b45, 1.0], sun: [0xfff1d8, 2.6],
    ground: 'grass', road: true, decor: 'trees', lamps: true, gravity: -11, start: [0, 8], endWalls: true,
    defaults: [O('ramp', 0, -50), O('boost', 0, -125), O('mine', 0, -200), O('wall', 0, -275)],
  },
  desert: {
    name: 'Poušť', icon: '🏜️', desc: 'Nekonečná pláň, písek a kaktusy. Kresli si vlastní cestu.',
    sky: [0x3a86d8, 0xf4cf96, 0xf8e2b8], fog: [0xecd0a2, 0.0032], hemi: [0xfff0d0, 0x9a7a4a, 1.0], sun: [0xffe2b0, 2.8],
    ground: 'sand', road: false, decor: 'cacti', gravity: -11, start: [0, 20],
    defaults: [O('ramp', 0, -40, 0, 1.3), O('block', 14, -90, 0.4, 1), O('boost', -6, -130, 0.2), O('wall', 0, -190, 0, 1.2)],
  },
  ice: {
    name: 'Led', icon: '🧊', desc: 'Kluzký povrch – auto i figurína klouže.',
    sky: [0x7fa6d0, 0xcfe3f5, 0xf2f8ff], fog: [0xdfeaf5, 0.005], hemi: [0xe6f1ff, 0x8aa0b8, 1.1], sun: [0xffffff, 2.2],
    ground: 'snow', road: false, decor: 'pines', gravity: -11, start: [0, 20], dummyFriction: 0.1, slipMul: 0.3,
    defaults: [O('ramp', 0, -60), O('block', 6, -120, 0, 1.3), O('wall', 0, -220, 0, 1.2)],
  },
  night: {
    name: 'Noc ve městě', icon: '🌃', desc: 'Neonové město, bloom a světla.',
    sky: [0x02020a, 0x0b1235, 0x2a1245], fog: [0x0a0a22, 0.006], hemi: [0x6070b0, 0x15152a, 0.55], sun: [0x8a98ff, 0.7],
    ground: 'neon', road: true, decor: 'city', lamps: true, gravity: -11, start: [0, 8], endWalls: true,
    defaults: [O('ramp', 0, -50), O('mine', 0, -110), O('boost', 0, -160), O('wall', 0, -250)],
  },
  arena: {
    name: 'Aréna', icon: '🏟️', desc: 'Uzavřená betonová aréna 140×140 m.',
    sky: [0x3a5f8a, 0x8fb0d0, 0xc9d4dc], fog: [0xb8c6d4, 0.004], hemi: [0xdfe9f5, 0x666a70, 1.0], sun: [0xfff6e6, 2.4],
    ground: 'concrete', road: false, decor: 'none', walls: 70, gravity: -11, start: [0, 56],
    defaults: [O('ramp', 0, 20, 0, 1.2), O('ramp', -40, -20, 1.2), O('ramp', 40, -30, -1.2), O('block', 0, -50, 0, 1.6), O('mine', 0, -10)],
  },
  cliff: {
    name: 'Propast', icon: '🕳️', desc: 'Silnice končí útesem. Přeskoč propast, nebo spadni 70 m.',
    sky: [0x2b6fd6, 0x9ec8f0, 0xe8dcc0], fog: [0xa9c8e8, 0.0038], hemi: [0xcfe4ff, 0x5a6b45, 1.0], sun: [0xfff1d8, 2.6],
    ground: 'grass', road: true, decor: 'trees', lamps: false, gravity: -11, start: [0, 8], pit: { z0: -250, z1: -340, depth: 70 },
    defaults: [O('boost', 0, -80), O('ramp', 0, -190, 0, 1.2)],
  },
  moon: {
    name: 'Měsíc', icon: '🌑', desc: 'Šestinová gravitace – obrovské skoky.',
    sky: [0x000005, 0x03030c, 0x0b0b18], fog: [0x05050c, 0.0006], hemi: [0xb0b8d0, 0x303038, 0.7], sun: [0xffffff, 3.0],
    ground: 'moon', road: false, decor: 'rocks', gravity: -3.6, start: [0, 20],
    defaults: [O('ramp', 0, -50, 0, 1.2), O('boost', 0, -120), O('wall', 0, -330, 0, 1.4)],
  },
};
export const MAP_LIST = Object.entries(MAPS);
