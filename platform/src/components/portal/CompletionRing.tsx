/**
 * Completion ring. Drawn from one scale — the stroke-dashoffset is derived
 * from the same percentage the label prints, so the picture and the number
 * cannot disagree.
 */
export function CompletionRing({ percent, size = 92 }: { percent: number; size?: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
         aria-label={`${clamped}%`} className="flex-none">
      <defs>
        <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8AF0B4" />
          <stop offset="1" stopColor="#19C76B" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
              stroke="rgba(56,232,135,.14)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke="url(#ring)" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
            className="font-display" fontSize={size * 0.26} fontWeight={800} fill="#F5F7F6">
        {clamped}%
      </text>
    </svg>
  );
}
