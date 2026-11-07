import * as React from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "peach" | "gold" | "silver" | "success" | "danger" | "demo";
  className?: string;
}) {
  const tones = {
    neutral: "bg-ink/60 text-cream/80 border-white/10 backdrop-blur-sm",
    peach: "bg-peach/15 text-peach border-peach/30",
    gold: "bg-gold/15 text-gold border-gold/30",
    silver: "bg-silver/15 text-silver border-silver/30",
    success: "bg-success/15 text-success border-success/30",
    danger: "bg-danger/15 text-danger border-danger/30",
    demo: "bg-ink/85 text-gold border-gold/50 backdrop-blur-sm",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Notice({
  tone = "info",
  children,
  className,
  role,
}: {
  tone?: "info" | "success" | "error" | "warning";
  children: React.ReactNode;
  className?: string;
  role?: string;
}) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  const tones = {
    info: "border-silver/25 bg-silver/5 text-cream/85",
    success: "border-success/30 bg-success/10 text-success",
    error: "border-danger/30 bg-danger/10 text-danger",
    warning: "border-gold/40 bg-gold/10 text-gold",
  };
  return (
    <div
      role={role ?? (tone === "error" ? "alert" : "status")}
      className={cn("flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm", tones[tone], className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  text,
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  text?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={cn(align === "center" && "mx-auto text-center", "max-w-2xl", className)}>
      {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
      <h2 className="text-3xl font-bold leading-tight sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-base leading-relaxed text-cream/70 sm:text-lg">{text}</p>}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="text-peach/70">{icon}</div>}
      <p className="text-cream/70">{title}</p>
      {children}
    </div>
  );
}

export function PointsPill({ value, size = "md" }: { value: React.ReactNode; size?: "sm" | "md" | "lg" }) {
  const s = { sm: "text-sm gap-1", md: "text-base gap-1.5", lg: "text-3xl gap-2" }[size];
  const icon = { sm: 16, md: 20, lg: 36 }[size];
  return (
    <span className={cn("inline-flex items-center font-display font-bold text-peach", s)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/modu/points.svg" alt="" width={icon} height={icon} />
      {value}
      <span className="text-[0.6em] font-semibold text-peach/70">MP</span>
    </span>
  );
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card px-5 py-4">
      <div className="font-display text-2xl font-bold text-cream">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}
