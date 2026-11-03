// Inline SVG icon set (line style, currentColor). Replaces emoji so the UI looks the same on every device.
const wrap = (vb, body, cls = '') => `<svg class="svg ${cls}" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const W = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
const F = d => `<path class="f" d="${d}"/>`;

const V = {   // vehicles, viewBox 0 0 48 32
  sedan: F('M4 21v-4l5-1.5 6-6h13l7 6 8 1.5v4z') + '<path d="M15 10.5l-3 5.5h24l-6-5.5z"/>' + W(13, 22, 3.6) + W(36, 22, 3.6),
  cart: F('M7 8h30l-4 11H12z') + '<path d="M2 5h5l5 14h20M14 11h20M16 15h16"/>' + W(15, 25, 2.5) + W(31, 25, 2.5),
  kart: F('M5 20h38v-3l-8-2-6-5h-6l-4 5-8 1z') + W(11, 23, 4) + W(37, 23, 4) + W(23, 13, 2.4),
  van: F('M3 22V9h26v5h9l7 6v2z') + '<path d="M29 14v8M33 14h5l4 4"/>' + W(12, 23, 3.6) + W(36, 23, 3.6),
  monster: F('M8 15v-4l5-1 5-5h10l5 5 7 1v4z') + W(12, 23, 6) + W(37, 23, 6),
  mini: F('M8 22v-4l4-1 5-6h10l5 6 5 1v4z') + W(16, 23, 3.2) + W(34, 23, 3.2),
  bike: W(11, 22, 7) + W(37, 22, 7) + '<path d="M11 22l7-11h12l7 11M18 11l6 11H11M28 7h5M17 8h5"/>',
  motorbike: W(10, 23, 6) + W(38, 23, 6) + F('M14 18h14l4-6h6l-6 11H20z') + '<path d="M30 12l-2-4h5"/>',
  plane: F('M4 17c8-5 24-7 38-4 3 1 3 4 0 5-12 2-26 3-38-1z') + '<path d="M20 15l-6-9h5l9 8M22 19l-4 8h4l8-7M6 17l-3-6h4l4 5"/>',
  rocket: F('M5 16l8-5h18c6 0 11 3 13 5-2 2-7 5-13 5H13z') + '<path d="M13 11l-6-5v9M13 21l-6 5v-9"/>' + W(31, 16, 2.4),
  sled: F('M8 18h30v-4l-8-2H16z') + '<path d="M4 24h36c4 0 5-4 2-6M10 18v6M32 18v6"/>',
  tractor: F('M12 10h14v6h12l-2 8H12z') + W(13, 22, 7) + W(37, 24, 4) + '<path d="M26 10v6"/>',
  bus: F('M3 7h42v16H3z') + '<path d="M3 15h42M12 7v8M21 7v8M30 7v8M39 7v8"/>' + W(12, 25, 3) + W(36, 25, 3),
  tank: '<rect x="4" y="19" width="40" height="9" rx="4.5"/>' + F('M11 19v-4h24v4z') + F('M17 15v-4h12v4z') + '<path d="M29 12h15"/>',
  chair: F('M15 3h16v13H15z') + '<path d="M12 18h22M24 18v6M14 29l10-5 10 5"/>' + W(14, 29.5, 1.6) + W(34, 29.5, 1.6),
};
const O = {   // obstacles, viewBox 0 0 24 24
  ramp: F('M3 19h18L3 8z'),
  boost: '<path d="M5 5l7 7-7 7M12 5l7 7-7 7"/>',
  bounce: '<path d="M3 19h18M6 19c0-9 12-9 12 0M12 3v6M9 6l3-3 3 3"/>',
  mine: F('M12 7a5 5 0 110 10 5 5 0 010-10z') + '<path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  oil: F('M12 3c4 5 6 8 6 11a6 6 0 01-12 0c0-3 2-6 6-11z'),
  wall: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 10h18M3 15h18M9 5v5M15 10v5M9 15v4"/>',
  piston: F('M6 14h12v6H6z') + '<path d="M12 14V4M8 4h8"/>',
  block: F('M5 5h14v14H5z'),
  barrel: F('M7 4h10l1 3v10l-1 3H7l-1-3V7z') + '<path d="M6 9h12M6 15h12"/>',
  path: '<path d="M4 20l1-5L16 4l4 4L9 19zM14 6l4 4"/>',
};
const U = {   // UI, viewBox 0 0 24 24
  veh: V.sedan, // overridden below with own viewBox
  fig: '<circle cx="12" cy="5" r="2.5"/><path d="M12 8v7M7 11l5-3 5 3M12 15l-4 6M12 15l4 6"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/>',
  obs: O.wall,
  route: '<path d="M4 20c0-6 6-4 8-8s-2-6 3-8M4 20l1-3M17 4l3 3"/><circle cx="4" cy="20" r="1.6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  retry: '<path d="M4 12a8 8 0 108-8H8M8 1L5 4l3 3"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path class="f" d="M7 4l13 8-13 8z"/>',
  left: '<path d="M15 4l-8 8 8 8"/>',
  right: '<path d="M9 4l8 8-8 8"/>',
  rotl: '<path d="M4 11a8 8 0 118 8M4 5v6h6"/>',
  rotr: '<path d="M20 11a8 8 0 10-8 8M20 5v6h-6"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
  undo: '<path d="M9 5L4 10l5 5M4 10h10a6 6 0 010 12h-3"/>',
  del: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 115 0c0 2-2.5 2-2.5 4M12 17v.5"/>',
  top: '<path d="M12 3v18M5 10l7-7 7 7"/>',
  behind: '<path d="M3 17h18M6 17V9l6-4 6 4v8"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chev: '<path d="M6 15l6-6 6 6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
};
const P = {   // dummy poses, viewBox 0 0 24 24
  sitting: '<circle cx="8" cy="5" r="2"/><path d="M8 8v6h8v6M8 14l-3 6M8 10l6 2"/>',
  standing: '<circle cx="12" cy="4" r="2"/><path d="M12 7v8M7 10h10M12 15l-3 6M12 15l3 6"/>',
  superman: '<circle cx="19" cy="9" r="2"/><path d="M17 10L8 13M17 10l5-2M8 13l-5 3M8 13l-4-1"/>',
  bent: '<circle cx="15" cy="6" r="2"/><path d="M14 8l-4 6M10 14l-4 7M10 14l5 6M13 10l5 3"/>',
  salto: '<circle cx="9" cy="7" r="2"/><path d="M9 9l4 5M13 14l-5 4M13 14l6-2M9 9l-4 1"/>',
  armsup: '<circle cx="12" cy="6" r="2"/><path d="M12 8v8M12 11L7 4M12 11l5-7M12 16l-3 5M12 16l3 5"/>',
};

export const icon = (name, cls = '') => {
  if (V[name]) return wrap('0 0 48 32', V[name], 'wide ' + cls);
  if (O[name]) return wrap('0 0 24 24', O[name], cls);
  if (P[name]) return wrap('0 0 24 24', P[name], cls);
  if (name === 'veh') return wrap('0 0 48 32', V.sedan, 'wide ' + cls);
  if (U[name]) return wrap('0 0 24 24', U[name], cls);
  return '';
};

// map thumbnail from the map's own palette (sky gradient, horizon, ground colour, optional road)
const hex = n => '#' + (n >>> 0).toString(16).padStart(6, '0');
export function mapThumb(m, id) {
  const [a, b, c] = m.sky, fog = hex(m.fog[0]);
  const gcol = { grass: '#4b8a3a', sand: '#d9b777', snow: '#e8f1fa', neon: '#1b1b3a', concrete: '#8a8f98', rock: '#8a7a68', moon: '#9a9a9f', lava: '#3a1208', candy: '#ffb3d9' }[m.ground] || hex(m.hemi[1]);
  const g = 'g' + id;
  return `<svg class="svg thumb" viewBox="0 0 64 40" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hex(a)}"/><stop offset=".6" stop-color="${hex(b)}"/><stop offset="1" stop-color="${hex(c)}"/></linearGradient></defs>`
    + `<rect width="64" height="40" fill="url(#${g})"/>${m.stars ? '<g fill="#fff"><circle cx="8" cy="6" r=".8"/><circle cx="22" cy="10" r=".6"/><circle cx="40" cy="5" r=".8"/><circle cx="55" cy="12" r=".6"/></g>' : ''}`
    + `<path d="M0 24l10-6 8 4 12-8 10 7 8-5 16 8v16H0z" fill="${fog}" opacity=".7"/>`
    + `<path d="M0 26h64v14H0z" fill="${gcol}"/>`
    + (m.road !== false && (m.road || id === 'road') ? `<path d="M26 26h12l10 14H16z" fill="#2a2d36"/><path d="M32 27v13" stroke="#ffc02a" stroke-width="1" stroke-dasharray="3 2"/>` : '')
    + `</svg>`;
}
