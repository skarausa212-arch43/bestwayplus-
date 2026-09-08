/**
 * The Bestway Football monogram. A skewed geometric B with chamfered bowls,
 * filled with the brand gradient and split by a diagonal facet clipped to the
 * glyph — the folded look from the style sheet, as vector rather than raster.
 */
const B_PATH =
  'M12 6 H64 L82 24 V38 L68 52 L86 68 V92 L68 110 H12 Z' +
  'M30 20 H56 L66 30 L56 40 H30 Z' +
  'M30 64 H60 L72 76 L60 88 H30 Z';

const FACET_PATH = 'M0 82 L104 16 L104 -6 L0 -6 Z';

export function LogoMark({ className = 'h-9 w-auto', id = 'mark' }: { className?: string; id?: string }) {
  return (
    <svg viewBox="0 0 104 116" className={className} aria-hidden="true" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8AF0B4" />
          <stop offset="0.46" stopColor="#38E887" />
          <stop offset="1" stopColor="#0C7B45" />
        </linearGradient>
        <linearGradient id={`${id}-facet`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B6FAD2" />
          <stop offset="1" stopColor="#4BD68C" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <path d={B_PATH} fillRule="evenodd" />
        </clipPath>
      </defs>
      <g transform="skewX(-7) translate(7 0)">
        <path d={B_PATH} fill={`url(#${id}-body)`} fillRule="evenodd" />
        <g clipPath={`url(#${id}-clip)`}>
          <path d={FACET_PATH} fill={`url(#${id}-facet)`} opacity="0.9" />
        </g>
      </g>
    </svg>
  );
}

export function Wordmark({ stacked = false }: { stacked?: boolean }) {
  return (
    <span className={stacked ? 'grid justify-items-center gap-1' : 'grid gap-0.5 leading-none'}>
      <b className="font-display text-[19px] font-extrabold uppercase tracking-[0.13em] text-ink">
        Bestway
      </b>
      <i className="font-display text-[10px] font-semibold uppercase not-italic tracking-[0.42em] text-emerald">
        Football
      </i>
    </span>
  );
}
