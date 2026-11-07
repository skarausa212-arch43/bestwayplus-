"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Nfc, Sparkles, GraduationCap, Gift } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = [Nfc, Sparkles, GraduationCap, Gift];

export function HowItWorks({ t }: { t: { eyebrow: string; title: string; steps: { title: string; text: string }[] } }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setActive((a) => (a + 1) % t.steps.length), 4200);
    return () => clearInterval(id);
  }, [paused, t.steps.length]);
  const Icon = ICONS[active];

  return (
    <section className="container-x py-20" aria-labelledby="how-title">
      <p className="eyebrow">{t.eyebrow}</p>
      <h2 id="how-title" className="mt-3 max-w-2xl text-3xl font-bold sm:text-4xl">
        {t.title}
      </h2>
      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.1fr]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div role="tablist" aria-label={t.title} className="grid gap-3">
          {t.steps.map((s, i) => {
            const StepIcon = ICONS[i];
            const on = i === active;
            return (
              <button
                key={s.title}
                role="tab"
                id={`how-tab-${i}`}
                aria-selected={on}
                aria-controls="how-panel"
                onClick={() => {
                  setActive(i);
                  setPaused(true);
                }}
                className={cn(
                  "group relative flex items-start gap-4 overflow-hidden rounded-3xl border p-5 text-left transition",
                  on ? "border-peach/50 bg-peach/10" : "border-line bg-ink-2/50 hover:border-cream/20",
                )}
              >
                <span
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-2xl font-display text-sm font-bold transition",
                    on ? "bg-peach text-ink" : "bg-white/5 text-peach",
                  )}
                >
                  <StepIcon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block text-xs font-semibold text-muted">0{i + 1}</span>
                  <span className="block font-display text-lg font-bold">{s.title}</span>
                  <span className="mt-1 block text-sm text-cream/65">{s.text}</span>
                </span>
                {on && !paused && (
                  <motion.span
                    className="absolute bottom-0 left-0 h-0.5 bg-peach"
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 4.2, ease: "linear" }}
                  />
                )}
              </button>
            );
          })}
        </div>
        <div
          id="how-panel"
          role="tabpanel"
          aria-labelledby={`how-tab-${active}`}
          className="card relative flex min-h-[320px] items-center justify-center overflow-hidden p-8"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgb(244_181_141/0.18),transparent_60%)]" />
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
              className="relative flex flex-col items-center text-center"
            >
              <span className="relative grid size-28 place-items-center rounded-[2rem] bg-gradient-to-b from-[#ffc9a6] to-peach-deep text-ink shadow-[0_20px_60px_-15px_rgb(244_181_141/0.8)]">
                <Icon className="size-12" aria-hidden />
              </span>
              <span className="mt-8 font-display text-5xl font-extrabold text-white/10">0{active + 1}</span>
              <h3 className="-mt-6 font-display text-2xl font-bold">{t.steps[active].title}</h3>
              <p className="mt-3 max-w-sm text-cream/70">{t.steps[active].text}</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
