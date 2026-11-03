// Map catalogue. Objects: {type,x,z,yaw,s,y}. Start is used when the player hasn't drawn a route.
const O = (type, x, z, yaw = 0, s = 1, y = 0) => ({ type, x, z, yaw, s, y });

export const MAPS = {
  road: {
    name: 'Silnice', icon: '🛣️', desc: 'Klasická testovací silnice se zdmi na konci.',
    sky: [0x2b6fd6, 0x9ec8f0, 0xe8dcc0], fog: [0xa9c8e8, 0.0042], hemi: [0xcfe4ff, 0x5a6b45, 1.0], sun: [0xfff1d8, 2.6],
    ground: 'grass', road: true, decor: 'trees', lamps: true, gravity: -11, start: [0, 8], endWalls: true, sunDir: [0.5, 0.7, 0.4],
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
    sky: [0x02020a, 0x0b1235, 0x2a1245], fog: [0x0a0a22, 0.006], hemi: [0x6070b0, 0x15152a, 0.55], sun: [0x8a98ff, 0.7], stars: 1, clouds: 0, env: 0.35, sunSize: 0.5, sunDir: [-0.3, 0.5, 0.4],
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
    sky: [0x000005, 0x03030c, 0x0b0b18], fog: [0x05050c, 0.0006], hemi: [0xb0b8d0, 0x303038, 0.7], sun: [0xffffff, 3.0], stars: 1, clouds: 0, env: 0.3, sunDir: [0.6, 0.35, 0.4],
    ground: 'moon', road: false, decor: 'rocks', gravity: -3.6, start: [0, 20],
    defaults: [O('ramp', 0, -50, 0, 1.2), O('boost', 0, -120), O('wall', 0, -330, 0, 1.4)],
  },
};
const hStairs = (x, z) => Math.abs(x) > 15 ? 0 : (z > -30 ? 16 : (z < -86 ? 0 : Math.max(0, 16 - 0.4 * Math.ceil((-z - 30) / 1.4))));
const hRoof = (x, z) => (Math.abs(x) < 25 && z < 60 && z > -150) ? 70 : 0;

Object.assign(MAPS, {
  stairs: {
    name: 'Schody', icon: '🪜', desc: 'Klasika: 16 m vysoká plošina a dlouhé schodiště dolů.',
    sky: [0x3a78c8, 0xa8c6e0, 0xe6dcc8], fog: [0xb4c8dc, 0.0034], hemi: [0xdfe9ff, 0x66707a, 1.0], sun: [0xfff3df, 2.6], sunDir: [0.5, 0.6, 0.3],
    ground: 'concrete', road: false, decor: 'city', cityMin: 40, cityGlow: 0.5, gravity: -11, start: [0, 30], feature: 'stairs', h: hStairs, defaults: [O('boost', 0, 12)],
  },
  rooftop: {
    name: 'Mrakodrap', icon: '🏙️', desc: 'Start na střeše 70 m nad ulicí. Rozjeď se a skoč.',
    sky: [0x1d4f9c, 0x8fb4de, 0xf0d9b8], fog: [0xa9bfd6, 0.0026], hemi: [0xdbe6ff, 0x4a5058, 1.0], sun: [0xffe9c8, 2.7], sunDir: [0.4, 0.45, 0.5],
    ground: 'concrete', road: true, decor: 'city', cityMin: 40, cityGlow: 0.7, gravity: -11, start: [0, 48], feature: 'rooftop', h: hRoof, defaults: [O('ramp', 0, -70, 0, 1.2)],
  },
  bridge: {
    name: 'Most', icon: '🌉', desc: 'Ocelový most přes řeku. Spadni z něj do vody.',
    sky: [0x3b86d8, 0xb4d4ee, 0xf2e6d0], fog: [0xc0d6e8, 0.0036], hemi: [0xe4efff, 0x5a7050, 1.0], sun: [0xfff1d8, 2.5], sunDir: [0.6, 0.5, 0.2],
    ground: 'grass', road: true, decor: 'trees', lamps: false, gravity: -11, start: [0, 8], feature: 'bridge', pit: { z0: -90, z1: -250, depth: 14 }, waterY: -6, pitColor: 0x3a5a40, rock: 0x7a7468,
    defaults: [O('boost', 0, -40), O('mine', 0, -160)],
  },
  skate: {
    name: 'Skatepark', icon: '🛹', desc: 'Betonový park s rampami a zábradlím.',
    sky: [0x2f6fd0, 0x9ec8f0, 0xf4e8d4], fog: [0xb8d0e4, 0.0042], hemi: [0xdfe9f5, 0x666a70, 1.0], sun: [0xfff4e0, 2.6],
    ground: 'skate', road: false, decor: 'none', walls: 60, gravity: -11, start: [0, 50], feature: 'skate',
    defaults: [O('ramp', 0, 25, 0, 1.2), O('ramp', -25, -5, 1.2), O('ramp', 25, -15, -1.2), O('bounce', 0, -30), O('ramp', 0, -48, 0, 1.4)],
  },
  canyon: {
    name: 'Kaňon', icon: '🏞️', desc: 'Rudé skály, západ slunce a 90 m hluboká trhlina.',
    sky: [0x2a3f86, 0xe89a62, 0xffd9a0], fog: [0xe8b080, 0.0034], hemi: [0xffd9b0, 0x7a4a30, 1.0], sun: [0xffa860, 2.8], sunDir: [-0.5, 0.22, 0.6], sunSize: 2, clouds: 0.5, cloudCol: 0xffc9a0,
    ground: 'canyon', road: true, decor: 'mesas', lamps: false, gravity: -11, start: [0, 8], pit: { z0: -180, z1: -290, depth: 90 }, rock: 0x8a4a2a, pitColor: 0x5a2e1a,
    defaults: [O('boost', 0, -60), O('ramp', 0, -130, 0, 1.5)],
  },
  construction: {
    name: 'Stavba', icon: '🏗️', desc: 'Prašná stavba, kontejnery a jeřáb.',
    sky: [0x4a86c8, 0xc4d4de, 0xe6dcc2], fog: [0xcfc8b8, 0.005], hemi: [0xf0e8d8, 0x6a5a40, 1.0], sun: [0xfff0d0, 2.4],
    ground: 'dirt', road: false, decor: 'rocks', rockCol: 0x8a7a60, gravity: -11, start: [0, 30], feature: 'construction',
    defaults: [O('ramp', 0, -30, 0, 1.2), O('wall', 0, -100, 0, 1.1), O('barrel', 3, -140), O('barrel', -3, -142), O('boost', 0, -180)],
  },
  beach: {
    name: 'Pláž', icon: '🏖️', desc: 'Písek, palmy a dřevěné molo nad mořem.',
    sky: [0x1f7ad8, 0x8fd0f2, 0xfff0d0], fog: [0xbfe4f4, 0.0028], hemi: [0xffffff, 0xc8b078, 1.0], sun: [0xfff6dc, 3.0], sunDir: [0.3, 0.38, 0.7], sunSize: 1.6,
    ground: 'sand', road: false, decor: 'palms', gravity: -11, start: [0, 30], feature: 'beach', pit: { z0: -300, z1: -900, depth: 8 }, waterY: -0.8, pitColor: 0x1d6aa8, rock: 0xc9b07a, pier: { z0: -300, z1: -440 },
    defaults: [O('ramp', 0, -120, 0, 1.2), O('boost', 0, -220)],
  },
  candy: {
    name: 'Cukrová země', icon: '🍭', desc: 'Pružná zem, všechno se odráží!',
    sky: [0xff8ac8, 0xffd0ec, 0xfff4cc], fog: [0xffd6ec, 0.004], hemi: [0xfff0fa, 0xc890c0, 1.1], sun: [0xfff0f8, 2.2], cloudCol: 0xffe0f4,
    ground: 'candy', road: false, decor: 'candy', gravity: -11, start: [0, 20], bounce: 0.82, dummyFriction: 0.4,
    defaults: [O('bounce', 0, -40, 0, 1.4), O('ramp', 0, -90), O('bounce', 6, -150), O('bounce', -6, -190)],
  },
  lava: {
    name: 'Láva', icon: '🌋', desc: 'Sopky a řeka lávy. Nespadni!',
    sky: [0x1a0606, 0x4a1608, 0x8a2a0c], fog: [0x3a1208, 0.0042], hemi: [0xff9a60, 0x2a1008, 0.8], sun: [0xff8a50, 1.8], sunDir: [-0.3, 0.3, 0.5], env: 0.3, clouds: 0.5, cloudCol: 0x5a2a1c, stars: 0.3,
    ground: 'basalt', road: false, decor: 'volcano', gravity: -11, start: [0, 20], pit: { z0: -150, z1: -250, depth: 10 }, lavaPit: true, rock: 0x2a2220, killY: -8,
    defaults: [O('boost', 0, -60), O('ramp', 0, -100, 0, 1.5)],
  },
  bowling: {
    name: 'Bowling', icon: '🎳', desc: 'Obří dráha a obří kuželky na konci.',
    sky: [0x14082e, 0x3a1466, 0x6a2a8a], fog: [0x2a1048, 0.0048], hemi: [0xd8b8ff, 0x403050, 0.9], sun: [0xe0c8ff, 1.5], stars: 0.6, env: 0.4,
    ground: 'wood', road: false, decor: 'none', gravity: -11, start: [0, 10], feature: 'bowling',
    defaults: [O('boost', 0, -50), O('ramp', 0, -130, 0, 1.1)],
  },
});

export const MAP_LIST = Object.entries(MAPS);
