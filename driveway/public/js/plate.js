/**
 * Driveway's vehicle plates.
 *
 * Every car on the site is drawn, not photographed, until a real photograph
 * exists. The drawings are side elevations in the manner of a factory shop
 * manual: one outline weight, flat paint, no gradients on the vehicle itself.
 * The same geometry serves the hero at 800px and a listing card at 300px, so
 * the site has one vehicle language rather than a hero illustration and a
 * separate placeholder.
 *
 * Paint colours are metals, never the interface blue — blue is reserved for
 * actions and computed figures, and a blue car would compete with both.
 */

const W = 800;
const H = 460;

/* Shared chassis geometry: wheels, arches, the line the car stands on. */
const REAR_X = 228;
const FRONT_X = 566;
const WHEEL_Y = 340;
const TIRE_R = 57;
const SILL_Y = 350;

/* Front bumper at 694, rear bumper at 102. Each body supplies the upper
   outline from the rear bottom corner over the roof to the front bottom
   corner; the lower half with its two wheel arches is shared. */
const LOWER =
  `L694 ${SILL_Y} L622 ${SILL_Y} A57 57 0 0 0 510 ${SILL_Y}` +
  ` L284 ${SILL_Y} A57 57 0 0 0 172 ${SILL_Y} L106 ${SILL_Y} Z`;

const BODIES = {
  Sedan: {
    upper: 'M106 350 L102 296 C102 282 111 273 128 270 L208 254 C232 249 249 238 266 220'
      + ' L320 166 C334 152 350 146 368 146 L474 146 C492 146 506 152 516 166'
      + ' L566 236 C576 249 588 255 602 257 L664 266 C684 269 694 283 694 302',
    glass: [
      'M340 170 C350 160 360 156 372 156 L410 156 L406 242 L274 252 C266 253 264 248 270 242 Z',
      'M422 156 L470 156 C484 156 494 160 502 170 L548 234 L418 242 Z'
    ],
    beltY: 250, doorX: 414, handleY: 268
  },
  Coupe: {
    upper: 'M106 350 L102 300 C102 284 112 274 130 271 L206 252 C232 245 250 232 266 212'
      + ' L336 162 C352 150 368 145 386 145 L470 148 C488 149 502 156 512 170'
      + ' L566 240 C576 252 588 258 602 260 L664 268 C684 271 694 285 694 304',
    glass: [
      'M350 178 C360 168 372 163 386 163 L466 166 C480 167 490 172 498 182 L540 236'
        + ' L288 248 C280 249 278 244 284 238 Z'
    ],
    beltY: 248, doorX: 372, handleY: 268
  },
  SUV: {
    upper: 'M106 350 L102 290 C102 272 110 262 128 258 L150 254 L160 150 C163 128 178 116 200 114'
      + ' L470 108 C492 107 508 114 520 130 L568 200 C578 213 590 220 604 222'
      + ' L664 232 C684 236 694 250 694 272',
    glass: [
      'M188 138 L336 132 L332 220 L178 228 Z',
      'M356 130 L468 126 C480 126 488 130 495 140 L540 202 L352 214 Z'
    ],
    beltY: 226, doorX: 346, handleY: 246
  },
  Truck: {
    upper: 'M106 350 L102 258 L106 246 L370 240 L372 150 C374 130 388 120 408 118'
      + ' L520 114 C540 113 552 120 562 134 L604 196 C612 208 622 214 634 216'
      + ' L668 222 C686 226 694 240 694 262',
    glass: [
      'M396 142 L462 139 L460 216 L392 220 Z',
      'M482 138 L520 136 C532 136 540 140 546 150 L578 196 L478 202 Z'
    ],
    extra: '<path d="M112 252 L366 246" />',
    beltY: 222, doorX: 472, handleY: 242
  },
  Hatchback: {
    upper: 'M106 350 L102 288 C102 272 110 262 128 258 L146 254 L158 176 C162 156 176 146 196 144'
      + ' L466 140 C486 139 500 146 510 160 L560 226 C570 239 582 246 596 248'
      + ' L662 258 C682 261 694 275 694 296',
    glass: [
      'M184 168 L330 162 L326 242 L172 250 Z',
      'M350 160 L462 156 C474 156 482 160 489 170 L534 226 L346 236 Z'
    ],
    beltY: 246, doorX: 340, handleY: 266
  },
  Wagon: {
    upper: 'M106 350 L102 292 C102 276 110 266 128 262 L142 258 L150 162 C153 144 168 134 188 133'
      + ' L470 128 C490 127 504 134 514 148 L562 214 C572 227 584 234 598 236'
      + ' L662 246 C682 250 694 264 694 286',
    glass: [
      'M178 156 L334 150 L330 234 L168 242 Z',
      'M354 148 L466 144 C478 144 486 148 493 158 L538 214 L350 224 Z'
    ],
    beltY: 240, doorX: 344, handleY: 260
  },
  Van: {
    upper: 'M106 350 L102 272 C102 250 112 238 132 235 L142 233 L146 130 C149 110 164 100 186 99'
      + ' L468 94 C492 93 508 102 520 120 L572 196 C582 210 594 217 608 219'
      + ' L666 228 C686 232 694 246 694 268',
    glass: [
      'M174 124 L330 118 L326 212 L166 220 Z',
      'M350 116 L466 112 C478 112 488 118 495 130 L542 198 L346 206 Z'
    ],
    beltY: 220, doorX: 342, handleY: 240
  },
  Convertible: {
    upper: 'M106 350 L102 300 C102 284 112 274 130 271 L200 254 C216 250 226 242 230 230'
      + ' L246 220 L472 210 C488 210 500 216 510 228 L566 240 C576 252 588 258 602 260'
      + ' L664 268 C684 271 694 285 694 304',
    glass: [],
    extra: '<path d="M540 214 L488 152" stroke-width="7" stroke-linecap="round"/>'
      + '<path d="M246 224 L470 214" />',
    beltY: 246, doorX: 372, handleY: 264
  }
};

/* Metals only. Indexed deterministically so a listing always draws the same. */
const PAINT = ['#c9ced9', '#8e97a9', '#2f3d58', '#e2ddd0', '#6f7b8d', '#aeb6c3', '#4a566e'];

const bodyFor = (name) => BODIES[name] || BODIES.Sedan;
const paintFor = (seed) => PAINT[Math.abs(Number(seed) || 0) % PAINT.length];

/** A wheel: tire, rim face, hub, five spokes. */
function wheel(cx) {
  const spokes = [0, 72, 144, 216, 288].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return `M${cx} ${WHEEL_Y} L${(cx + Math.cos(a) * 30).toFixed(1)} ${(WHEEL_Y + Math.sin(a) * 30).toFixed(1)}`;
  }).join(' ');
  return `<circle cx="${cx}" cy="${WHEEL_Y}" r="${TIRE_R}" fill="#141c2e"/>
    <circle cx="${cx}" cy="${WHEEL_Y}" r="${TIRE_R - 12}" fill="none" stroke="#39435c" stroke-width="2"/>
    <circle cx="${cx}" cy="${WHEEL_Y}" r="34" fill="#dfe3ea"/>
    <path d="${spokes}" stroke="#9aa3b5" stroke-width="5" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${WHEEL_Y}" r="8" fill="#5d6b85"/>`;
}

/**
 * The vehicle itself, drawn into the 800×460 plate frame.
 * @param {{body?:string, paint?:string, seed?:number, electric?:boolean, draw?:boolean}} o
 */
export function vehicle(o = {}) {
  const b = bodyFor(o.body);
  const paint = o.paint || paintFor(o.seed);
  const outline = b.upper + ' ' + LOWER;
  const drawn = o.draw ? ' class="stroke" style="--len:2600"' : '';

  const glass = b.glass
    .map((g) => `<path d="${g}" fill="#cfdcf3" stroke="#0f1b33" stroke-width="3"/>`)
    .join('');

  const port = o.electric
    ? `<circle cx="170" cy="292" r="13" fill="none" stroke="#0f1b33" stroke-width="3"/>
       <path d="M173 285 L165 293 h6 l-2 8 8-9h-6z" fill="#1a4cff" stroke="none"/>`
    : `<path d="M118 336 h26" stroke="#5d6b85" stroke-width="5" stroke-linecap="round"/>`;

  return `<g stroke="#0f1b33" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" fill="none">
    <ellipse cx="400" cy="404" rx="290" ry="15" fill="rgba(15,27,51,.13)" stroke="none"/>
    <path d="${outline}" fill="${paint}"${drawn}/>
    ${glass}
    <path d="M${b.doorX} ${b.beltY - 4} L${b.doorX - 6} ${SILL_Y - 8}" stroke-width="2.5"/>
    <path d="M${b.doorX - 52} ${b.handleY} h26" stroke-width="5" stroke-linecap="round"/>
    <path d="M${b.doorX + 34} ${b.handleY} h26" stroke-width="5" stroke-linecap="round"/>
    <path d="M120 ${SILL_Y - 4} L676 ${SILL_Y - 4}" stroke-width="2.5" stroke="rgba(15,27,51,.45)"/>
    ${b.extra || ''}
    <path d="M652 296 q26 2 30 14 q-14 6 -32 4 z" fill="#f3f5fa"/>
    <path d="M108 302 q22 -2 26 8 q-12 6 -26 4 z" fill="#e06a5c"/>
    ${port}
    ${wheel(REAR_X)}
    ${wheel(FRONT_X)}
  </g>`;
}

/**
 * The hero plate: American road, ridge line, and the vehicle standing on it.
 * The whole scene is original vector art. To ship a photograph instead, put
 * `<img class="hero-photo" …>` inside `.hero-photo-slot`; the stylesheet hides
 * this drawing the moment one is present.
 */
export function heroPlate(variant = 'used') {
  const electric = variant === 'electric';
  const body = { used: 'Sedan', new: 'SUV', verified: 'Truck', electric: 'Hatchback' }[variant] || 'Sedan';

  return `<svg class="hero-draw" viewBox="0 0 ${W} ${H + 90}" role="img"
    aria-label="Technical drawing of a car on an open American road, with the figures Driveway computes called out beside it"
    preserveAspectRatio="xMidYMax slice">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#dbe6ff"/><stop offset="1" stop-color="#f4f2ec"/>
      </linearGradient>
      <linearGradient id="road" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ddd7c6"/><stop offset="1" stop-color="#cbc4b0"/>
      </linearGradient>
    </defs>

    <rect width="${W}" height="${H + 90}" fill="url(#sky)"/>

    <!-- Ridge line: the far range, then the near one. -->
    <path class="fade" style="--d:.15s"
      d="M0 300 L78 232 L126 264 L206 190 L268 250 L338 206 L410 264 L486 214 L560 256 L636 216 L716 268 L800 236 L800 330 L0 330 Z"
      fill="#cfd9ec"/>
    <path class="fade" style="--d:.3s"
      d="M0 322 L92 272 L150 300 L232 254 L306 302 L392 268 L470 310 L556 272 L642 312 L724 282 L800 316 L800 348 L0 348 Z"
      fill="#b9c5de"/>

    <!-- Ground and the road running to the horizon. -->
    <rect y="340" width="${W}" height="${H + 90 - 340}" fill="#e9e4d6"/>
    <path d="M-60 550 L300 340 L512 340 L868 550 Z" fill="url(#road)"/>
    <path d="M300 340 L-60 550 M512 340 L868 550" stroke="#b3a993" stroke-width="3" fill="none"/>
    <path d="M404 346 v12 M402 374 v18 M399 410 v24"
      stroke="#f2eee2" stroke-width="6" stroke-linecap="round" fill="none"/>
    <path d="M0 340 H${W}" stroke="#a9b3c8" stroke-width="1.5" fill="none"/>

    <!-- The vehicle, standing on the road surface. -->
    <g transform="translate(24 84) scale(.93)">${vehicle({ body, paint: '#2f3d58', electric, draw: true })}</g>

    <!-- Dimension rule: the plate states its own scale. -->
    <g class="fade" style="--d:1s" stroke="#0f1b33" stroke-width="1.6" fill="none" opacity=".55">
      <path d="M112 504 H688 M112 496 v16 M688 496 v16"/>
    </g>
    <text class="fade" style="--d:1s" x="400" y="530" text-anchor="middle"
      font-family="Archivo, sans-serif" font-size="17" font-weight="700"
      letter-spacing="1.6" fill="#0f1b33" opacity=".62">FIG. 1 — WHAT YOU ARE ACTUALLY BUYING</text>
  </svg>`;
}

/**
 * Card-scale plate for a listing with no photograph yet. Same drawing, no
 * scene: a ruled ground line and the vehicle in its own body style.
 */
export function cardPlate(listing) {
  return `<svg class="card-draw" viewBox="40 60 720 380" preserveAspectRatio="xMidYMid meet"
    role="img" aria-label="Drawing of a ${listing.body || 'Sedan'} — this listing has no photographs yet">
    <rect x="40" y="60" width="720" height="380" fill="none"/>
    <path d="M60 400 H740" stroke="#c9c2b2" stroke-width="2" fill="none"/>
    <g transform="translate(0 18)">${vehicle({
      body: listing.body,
      seed: listing.id,
      electric: listing.fuel === 'Electric'
    })}</g>
  </svg>`;
}
