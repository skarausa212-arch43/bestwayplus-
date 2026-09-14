/**
 * Driveway's icon language.
 *
 * One stroke family, drawn on a 24×24 grid: 1.6 units wide, round caps and
 * joins, no fills, no compound shapes. Everything is `currentColor` so an icon
 * takes the ink of whatever it sits in. This file is the only place an
 * interface glyph may come from — emoji and stray Unicode dingbats are not
 * icons, they are the host font's opinion, and they break the moment the page
 * is rendered on a machine we did not choose.
 *
 * Paths are kept deliberately plain (line, circle, rect, polyline) so that a
 * new icon can be added by hand without a drawing tool.
 */

const P = {
  /* navigation and chrome */
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4 21 21"/>',
  menu: '<path d="M3.5 7h17M3.5 12h17M3.5 17h17"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevronLeft: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  chevronRight: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  chevronDown: '<path d="M5.5 9.5 12 16l6.5-6.5"/>',
  arrowRight: '<path d="M4 12h15M13.5 6.5 19 12l-5.5 5.5"/>',
  arrowLeft: '<path d="M20 12H5M10.5 6.5 5 12l5.5 5.5"/>',
  arrowReturn: '<path d="M20 6v4.5a3.5 3.5 0 0 1-3.5 3.5H5M9.5 9.5 5 14l4.5 4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  external: '<path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',

  /* people and account */
  user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.8 20c.7-3.7 3.6-5.8 7.2-5.8s6.5 2.1 7.2 5.8"/>',
  bell: '<path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 3.4.8 5.2 1.7 6.2H4.8c.9-1 1.7-2.8 1.7-6.2Z"/><path d="M10 19.2a2.2 2.2 0 0 0 4 0"/>',
  logout: '<path d="M14.5 4.5h4A1.5 1.5 0 0 1 20 6v12a1.5 1.5 0 0 1-1.5 1.5h-4"/><path d="M4 12h10M10.5 8.5 14 12l-3.5 3.5"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h8M17 12v3.2M20 12v2.2"/>',
  phone: '<path d="M5 5.5h3.6l1.5 3.7-2.1 1.5a10.6 10.6 0 0 0 5.3 5.3l1.5-2.1 3.7 1.5V19a1 1 0 0 1-1.1 1A15.4 15.4 0 0 1 4 6.6 1 1 0 0 1 5 5.5Z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.6"/><path d="m4.5 7 7.5 5.6L19.5 7"/>',
  message: '<path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-5 3.5Z"/>',

  /* state and trust */
  check: '<path d="M5 12.8 9.6 17.4 19 6.9"/>',
  checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.2 2.7 2.7 5-5.6"/>',
  alert: '<path d="M12 4.6 21 19.4H3Z"/><path d="M12 10v4"/><path d="M12 16.6v.2"/>',
  shield: '<path d="M12 3.6 19 6v5.6c0 4-2.8 7.2-7 8.8-4.2-1.6-7-4.8-7-8.8V6Z"/><path d="m8.8 11.8 2.4 2.4 4.2-4.6"/>',
  lock: '<rect x="4.8" y="10.4" width="14.4" height="9.1" rx="1.6"/><path d="M8.4 10.4V8a3.6 3.6 0 0 1 7.2 0v2.4"/>',
  flag: '<path d="M6 20V4.6h11l-2.2 3.6L17 11.8H6"/>',
  star: '<path d="m12 4.3 2.4 5 5.4.7-4 3.7 1 5.4-4.8-2.7-4.8 2.7 1-5.4-4-3.7 5.4-.7Z"/>',
  snowflake: '<path d="M12 3.5v17M4.6 7.8l14.8 8.4M19.4 7.8 4.6 16.2"/><path d="M9.6 5.4 12 7.2l2.4-1.8M9.6 18.6 12 16.8l2.4 1.8"/>',

  /* the car itself */
  car: '<path d="M3.6 16.4v-3.1l2-4.6A2.4 2.4 0 0 1 7.8 7.2h8.4a2.4 2.4 0 0 1 2.2 1.5l2 4.6v3.1"/><path d="M3.6 13.3h16.8"/><circle cx="7.6" cy="16.6" r="1.9"/><circle cx="16.4" cy="16.6" r="1.9"/><path d="M9.5 16.6h5"/>',
  suv: '<path d="M3.4 16.4v-4l1.9-4.3A2.3 2.3 0 0 1 7.5 6.6h9a2.3 2.3 0 0 1 2.2 1.5l1.9 4.3v4"/><path d="M3.4 12.4h17.2M9.2 6.6v5.8"/><circle cx="7.4" cy="16.6" r="1.9"/><circle cx="16.6" cy="16.6" r="1.9"/>',
  truck: '<path d="M3.4 16.4V9.2h8.4v7.2"/><path d="M11.8 11.4h3.7l3.1 3.1v1.9"/><path d="M3.4 14.5h17.2"/><circle cx="7.2" cy="16.6" r="1.9"/><circle cx="16.8" cy="16.6" r="1.9"/>',
  coupe: '<path d="M3.4 16.2v-2.6l2.2-3.9A3 3 0 0 1 8.2 8.2h6.2a3 3 0 0 1 2.3 1.1l3 3.6 1 .9v2.4"/><path d="M3.4 13.6h17.3"/><circle cx="7.4" cy="16.4" r="1.9"/><circle cx="16.4" cy="16.4" r="1.9"/>',
  wagon: '<path d="M3.4 16.4v-3.6l1.8-4A2.3 2.3 0 0 1 7.3 7.4h10.1a2.3 2.3 0 0 1 2.2 1.6l1.1 3.8v3.6"/><path d="M3.4 12.8h17.3M12.4 7.4v5.4"/><circle cx="7.4" cy="16.6" r="1.9"/><circle cx="16.6" cy="16.6" r="1.9"/>',
  van: '<path d="M3.4 16.4V9.4A2 2 0 0 1 5.4 7.4h11l4.2 4.6v4.4"/><path d="M3.4 12.4h17.2M11.6 7.4v5"/><circle cx="7.4" cy="16.6" r="1.9"/><circle cx="16.6" cy="16.6" r="1.9"/>',
  convertible: '<path d="M3.4 16.2v-2.6h17.3v2.6"/><path d="M5.8 13.6 8 9.8a2.6 2.6 0 0 1 2.2-1.2h4.6l3.6 5"/><path d="M6.4 8.8c1.4-1.3 3.1-2 5.2-2s4.4.9 6.2 2.6"/><circle cx="7.4" cy="16.4" r="1.9"/><circle cx="16.4" cy="16.4" r="1.9"/>',
  steering: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="2.6"/><path d="M12 14.6V20.4M9.6 11.2 4 9.4M14.4 11.2 20 9.4"/>',

  /* mechanical */
  bolt: '<path d="M13.4 3.5 6 13.4h5l-.4 7.1L18 10.6h-5Z"/>',
  battery: '<rect x="3" y="8" width="15.4" height="8" rx="1.6"/><path d="M21 10.6v2.8"/><path d="M6.2 10.6v2.8M9.4 10.6v2.8M12.6 10.6v2.8"/>',
  fuel: '<path d="M5 20V6a1.6 1.6 0 0 1 1.6-1.6h4.8A1.6 1.6 0 0 1 13 6v14"/><path d="M3.6 20h10.8M6.6 11h4.8"/><path d="M13 9h3.4a1.6 1.6 0 0 1 1.6 1.6v5.2a1.6 1.6 0 0 0 1.6 1.6h0a1.6 1.6 0 0 0 1.6-1.6V8.2L18 5.4"/>',
  gauge: '<path d="M4 17.6a8.6 8.6 0 1 1 16 0"/><path d="m12 15.4 4.2-4.8"/><circle cx="12" cy="17.4" r="1.3"/>',
  odometer: '<rect x="3" y="8.6" width="18" height="6.8" rx="1.4"/><path d="M7.5 8.6v6.8M12 8.6v6.8M16.5 8.6v6.8"/>',
  wrench: '<path d="M15.2 3.8a5 5 0 0 0-5.9 6.4L3.8 15.7a2.2 2.2 0 0 0 3.1 3.1l5.5-5.5a5 5 0 0 0 6.4-5.9l-2.9 2.9-2.9-.8-.8-2.9Z"/>',
  plug: '<path d="M8.6 3.6v4.2M15.4 3.6v4.2"/><path d="M5.8 7.8h12.4v2.8a6.2 6.2 0 0 1-12.4 0Z"/><path d="M12 16.8V20.4"/>',
  microphone: '<rect x="9" y="3.4" width="6" height="10.4" rx="3"/><path d="M5.8 11.6a6.2 6.2 0 0 0 12.4 0"/><path d="M12 17.8v2.8"/>',
  waveform: '<path d="M3.4 12h2.2M8 7.4v9.2M12 4.6v14.8M16 8.8v6.4M20.6 12h-2"/>',
  camera: '<path d="M3.6 8.6h3.6l1.6-2.4h6.4l1.6 2.4h3.6v9.2a1.6 1.6 0 0 1-1.6 1.6H5.2a1.6 1.6 0 0 1-1.6-1.6Z"/><circle cx="12" cy="13" r="3.4"/>',

  /* money and documents */
  dollar: '<path d="M12 3.4v17.2"/><path d="M16.2 7.2c-.8-1.4-2.3-2.2-4.2-2.2-2.4 0-4 1.3-4 3.2 0 4.4 8.4 2.2 8.4 6.6 0 2-1.8 3.4-4.4 3.4-2.2 0-3.8-.9-4.6-2.5"/>',
  calculator: '<rect x="5" y="3" width="14" height="18" rx="1.8"/><path d="M8.2 7.4h7.6"/><path d="M8.6 12h.1M12 12h.1M15.4 12h.1M8.6 16h.1M12 16h.1M15.4 16h.1"/>',
  card: '<rect x="2.8" y="5.4" width="18.4" height="13.2" rx="1.8"/><path d="M2.8 10h18.4M6.4 14.6h3.4"/>',
  trendDown: '<path d="M3.6 7.4 10 13.8l3.2-3.2 7.2 7.2"/><path d="M20.4 12.8v5h-5"/>',
  chart: '<path d="M4 4v16h16"/><path d="M7.6 16.4V12M11.6 16.4V7.6M15.6 16.4v-6M19.4 16.4V5.6"/>',
  document: '<path d="M6 3.4h7.4L18.6 8.6V20.6H6Z"/><path d="M13.4 3.4v5.2h5.2"/><path d="M9 13h6.6M9 16.4h4.6"/>',
  clipboard: '<path d="M9 5H7.4A1.4 1.4 0 0 0 6 6.4v13.2A1.4 1.4 0 0 0 7.4 21h9.2a1.4 1.4 0 0 0 1.4-1.4V6.4A1.4 1.4 0 0 0 16.6 5H15"/><rect x="9" y="3" width="6" height="3.6" rx="1"/><path d="M9.4 11.6h5.2M9.4 15.2h3.6"/>',
  tag: '<path d="M11.4 3.4H20v8.6l-8.6 8.6L3 12Z"/><circle cx="16.2" cy="7.8" r="1.5"/>',

  /* time and place */
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7v5.3l3.4 2"/>',
  calendar: '<rect x="3.6" y="5.4" width="16.8" height="15" rx="1.6"/><path d="M3.6 10h16.8M8.4 3.4v4M15.6 3.4v4"/>',
  pin: '<path d="M12 21c4-4.5 6-7.7 6-10.4a6 6 0 1 0-12 0C6 13.3 8 16.5 12 21Z"/><circle cx="12" cy="10.4" r="2.4"/>',
  road: '<path d="M9 3.4 5 20.6M15 3.4l4 17.2"/><path d="M12 4.4v2.8M12 10.6v2.8M12 16.8v2.8"/>',
  truckShip: '<path d="M3 17.4V7.4h10v10"/><path d="M13 10.6h3.6l3.4 3.4v3.4"/><circle cx="7" cy="17.8" r="1.8"/><circle cx="16.8" cy="17.8" r="1.8"/>',

  /* actions */
  heart: '<path d="M12 20C7.2 15.7 3.4 12.6 3.4 8.8A4.9 4.9 0 0 1 8.2 4c1.6 0 3 .8 3.8 2 .8-1.2 2.2-2 3.8-2a4.9 4.9 0 0 1 4.8 4.8c0 3.8-3.8 6.9-8.6 11.2Z"/>',
  handshake: '<path d="M3.4 9.6 7 6.4h4.2L12 7.6l.8-1.2H17l3.6 3.2"/><path d="M20.6 9.6v5l-2.4 2.2-2.8-2.4M3.4 9.6v5l2.4 2.2 2.6-2.2"/><path d="M8.4 14.6 11 17l2-1.6 2.2 1.8"/>',
  sliders: '<path d="M4 7.4h9M17 7.4h3M4 16.6h4M12 16.6h8"/><circle cx="15" cy="7.4" r="2"/><circle cx="10" cy="16.6" r="2"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20.4 4.6v4.6h-4.6"/>',
  eye: '<path d="M2.6 12S6 6.4 12 6.4 21.4 12 21.4 12 18 17.6 12 17.6 2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  inbox: '<path d="M3.4 13.4 6 5.6h12l2.6 7.8v5a1.6 1.6 0 0 1-1.6 1.6H5a1.6 1.6 0 0 1-1.6-1.6Z"/><path d="M3.4 13.4h4.4l1.2 2.4h5.8l1.2-2.4h4.6"/>'
};

export const ICON_NAMES = Object.keys(P);

/**
 * @param {string} name  a key of the table above
 * @param {{size?:number, stroke?:number, cls?:string, label?:string}} [opt]
 *   `label` turns the icon into an image with an accessible name; without it
 *   the icon is decorative and hidden from assistive technology.
 */
export function icon(name, opt = {}) {
  const d = P[name];
  if (!d) return '';
  const size = opt.size || 20;
  const stroke = opt.stroke || 1.6;
  const a11y = opt.label
    ? ` role="img" aria-label="${opt.label.replace(/"/g, '&quot;')}"`
    : ' aria-hidden="true"';
  return `<svg class="ico${opt.cls ? ' ' + opt.cls : ''}" width="${size}" height="${size}" viewBox="0 0 24 24"`
    + ` fill="none" stroke="currentColor" stroke-width="${stroke}"`
    + ` stroke-linecap="round" stroke-linejoin="round"${a11y}>${d}</svg>`;
}

/** A filled variant, for the one place a state must read as solid: favourites. */
export function iconFilled(name, opt = {}) {
  return icon(name, opt).replace('fill="none"', 'fill="currentColor"');
}

/** Body-style to icon, so the browse chips and cards agree on one drawing. */
export const BODY_ICON = {
  Sedan: 'car',
  SUV: 'suv',
  Truck: 'truck',
  Coupe: 'coupe',
  Convertible: 'convertible',
  Wagon: 'wagon',
  Hatchback: 'wagon',
  Minivan: 'van',
  Van: 'van',
  Electric: 'bolt'
};
