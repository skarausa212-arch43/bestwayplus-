import type { ReactNode } from 'react';

export function Card({
  children, className = '', as: Tag = 'div',
}: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'li' }) {
  return (
    <Tag className={`rounded-xl border border-line-faint bg-bg-raised p-5 sm:p-6 ${className}`}>
      {children}
    </Tag>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="block font-display text-[10px] font-bold uppercase tracking-[0.24em] text-emerald">
      {children}
    </span>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-display text-[clamp(1.35rem,2.4vw,2rem)] font-extrabold tracking-tight">
      {children}
    </h2>
  );
}

/** Semantic state colour is separate from the brand accent, deliberately. */
const TONE = {
  neutral: 'border-line-faint text-ink-muted',
  positive: 'border-emerald/40 text-emerald bg-emerald/10',
  warning: 'border-state-warn/40 text-state-warn bg-state-warn/10',
  danger: 'border-state-bad/40 text-state-bad bg-state-bad/10',
  info: 'border-state-info/40 text-state-info bg-state-info/10',
} as const;

export type Tone = keyof typeof TONE;

export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-1 font-display text-[9.5px] font-bold uppercase tracking-[0.14em] ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line-faint p-8 text-center text-sm text-ink-muted">
      {children}
    </p>
  );
}
