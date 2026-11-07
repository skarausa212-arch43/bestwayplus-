import Link from "next/link";
import { cn } from "@/lib/utils";

export function Crown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 20" className={className} aria-hidden>
      <path d="M2 6l8 6 10-11 10 11 8-6-3 12H5z" fill="currentColor" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <Link href="/" className={cn("group inline-flex flex-col items-center leading-none", className)} aria-label="MODU WORLD">
      <Crown className="mb-0.5 h-2.5 w-6 text-peach transition group-hover:-translate-y-0.5" />
      <span className="font-display text-xl font-extrabold tracking-tight text-cream">MODU</span>
      {!compact && <span className="font-display text-[0.55rem] font-bold tracking-[0.45em] text-peach">WORLD</span>}
    </Link>
  );
}
