"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Nfc, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Animated phone-taps-toy demonstration. Loops, and the visitor can replay it. */
export function NfcDemo({
  t,
}: {
  t: { eyebrow: string; title: string; text: string; points: string[]; tryDemo: string; passport: string; serial: string; activated: string };
}) {
  const [phase, setPhase] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    const id = setTimeout(() => setPhase((p) => ((p + 1) % 3) as 0 | 1 | 2), phase === 2 ? 3800 : 1800);
    return () => clearTimeout(id);
  }, [phase]);

  return (
    <section className="container-x py-20" aria-labelledby="nfc-title">
      <div className="card relative grid gap-10 overflow-hidden p-6 sm:p-10 lg:grid-cols-2 lg:p-14">
        <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-peach/10 blur-3xl" />
        <div>
          <p className="eyebrow">{t.eyebrow}</p>
          <h2 id="nfc-title" className="mt-3 text-3xl font-bold sm:text-4xl">
            {t.title}
          </h2>
          <p className="mt-4 leading-relaxed text-cream/70">{t.text}</p>
          <ul className="mt-6 space-y-3">
            {t.points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-cream/85">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-peach/20 text-peach">
                  <Check className="size-3" />
                </span>
                {p}
              </li>
            ))}
          </ul>
          <Button asChild className="mt-8" variant="outline">
            <Link href="/activate">
              <Nfc /> {t.tryDemo}
            </Link>
          </Button>
        </div>

        <div className="relative flex min-h-[420px] items-end justify-center" aria-hidden>
          <div className="absolute bottom-0 h-28 w-72 rounded-[50%] bg-peach/10 blur-2xl" />
          <motion.div
            className="absolute bottom-6 left-1/2 w-40 -translate-x-[95%] sm:w-48"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 4, repeat: Infinity }}
          >
            <Image src="/assets/modu/bear.webp" alt="" width={408} height={634} className="drop-shadow-[0_30px_30px_rgba(0,0,0,0.6)]" />
          </motion.div>

          <motion.div
            className="absolute bottom-10 left-1/2 w-44 sm:w-52"
            animate={phase === 0 ? { x: 40, y: -30, rotate: 12 } : { x: -10, y: -10, rotate: -4 }}
            transition={{ type: "spring", stiffness: 80, damping: 14 }}
          >
            <div className="relative aspect-[9/18] rounded-[2rem] border-4 border-[#2c2c2c] bg-ink p-2 shadow-2xl">
              <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-white/10" />
              <AnimatePresence mode="wait">
                {phase < 2 ? (
                  <motion.div
                    key="wait"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex h-[85%] flex-col items-center justify-center gap-4"
                  >
                    <span className="relative grid size-16 place-items-center rounded-2xl border border-peach/40 text-peach">
                      {phase === 1 && (
                        <>
                          <span className="absolute inset-0 rounded-2xl border-2 border-peach animate-pulse-ring" />
                          <span className="absolute inset-0 rounded-2xl border-2 border-peach animate-pulse-ring [animation-delay:0.6s]" />
                        </>
                      )}
                      <Nfc className="size-8" />
                    </span>
                    <span className="px-3 text-center text-[0.65rem] text-cream/60">NFC</span>
                  </motion.div>
                ) : (
                  <motion.div
                    key="passport"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex h-[85%] flex-col gap-2 px-1"
                  >
                    <div className="text-[0.6rem] uppercase tracking-widest text-peach">{t.passport}</div>
                    <div className="relative h-24 overflow-hidden rounded-xl bg-gradient-to-b from-peach/30 to-transparent">
                      <Image src="/assets/modu/bear.webp" alt="" fill className="object-contain object-top" sizes="200px" />
                    </div>
                    <div className="font-display text-xs font-bold">MODU BEAR</div>
                    <div className="text-[0.6rem] text-muted">
                      {t.serial}: MB-GEN-0001
                    </div>
                    <div className="mt-auto flex items-center gap-1 rounded-lg bg-success/15 px-2 py-1.5 text-[0.6rem] font-semibold text-success">
                      <ShieldCheck className="size-3" /> {t.activated}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
