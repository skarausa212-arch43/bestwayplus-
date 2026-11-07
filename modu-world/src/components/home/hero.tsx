"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { ArrowRight, Nfc, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountUp, Magnetic, ScrambleText } from "@/components/fx/fx";

const ease = [0.2, 0.7, 0.2, 1] as const;

export function Hero({
  t,
}: {
  t: { eyebrow: string; title1: string; title2: string; text: string; explore: string; activate: string; stats: { value: string; label: string }[] };
}) {
  const reduce = useReducedMotion();
  // pointer parallax for the hero visual
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rx = useSpring(useTransform(py, [-1, 1], [8, -8]), { stiffness: 90, damping: 20 });
  const ry = useSpring(useTransform(px, [-1, 1], [-10, 10]), { stiffness: 90, damping: 20 });
  const chipX = useSpring(useTransform(px, [-1, 1], [-24, 24]), { stiffness: 70, damping: 18 });
  const chipY = useSpring(useTransform(py, [-1, 1], [-18, 18]), { stiffness: 70, damping: 18 });
  const chipXInv = useTransform(chipX, (v) => -v);
  const chipYInv = useTransform(chipY, (v) => -v);
  // scroll: the visual sinks and fades as you leave the hero
  const { scrollY } = useScroll();
  const sinkY = useTransform(scrollY, [0, 600], [0, 120]);
  const fade = useTransform(scrollY, [0, 500], [1, 0.3]);

  return (
    <section
      className="relative overflow-hidden"
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== "mouse") return;
        px.set((e.clientX / window.innerWidth) * 2 - 1);
        py.set((e.clientY / window.innerHeight) * 2 - 1);
      }}
    >
      {/* holographic floor */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[45%] overflow-hidden">
        <div className="absolute inset-x-[-20%] top-0 h-[200%] holo-grid" />
      </div>

      <div className="container-x grid items-center gap-10 pb-20 pt-10 lg:grid-cols-[1fr_1.15fr] lg:pb-28 lg:pt-16">
        <div className="relative z-10">
          <motion.p
            initial={{ opacity: 0, letterSpacing: "0.6em" }}
            animate={{ opacity: 1, letterSpacing: "0.2em" }}
            transition={{ duration: 1, ease }}
            className="eyebrow flex items-center gap-2"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-peach opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-peach" />
            </span>
            {t.eyebrow}
          </motion.p>
          <h1 className="mt-5 text-[2.7rem] font-extrabold leading-[0.95] sm:text-6xl xl:text-[5.2rem]">
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease }}
              className="mb-3 block text-lg font-bold tracking-[0.3em] text-cream/60 sm:text-xl"
            >
              <ScrambleText text="MODU WORLD" duration={1100} />
            </motion.span>
            {[t.title1, t.title2].map((line, li) => (
              <span key={line} className="block overflow-hidden pb-1">
                <motion.span
                  className={li === 0 ? "block text-gradient" : "block"}
                  initial={{ y: "110%", rotate: 4 }}
                  animate={{ y: "0%", rotate: 0 }}
                  transition={{ duration: 0.9, delay: 0.15 + li * 0.12, ease }}
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ delay: 0.45, duration: 0.7 }}
            className="mt-6 max-w-lg text-lg leading-relaxed text-cream/70"
          >
            {t.text}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mt-8 flex flex-col gap-3 sm:flex-row"
          >
            <Magnetic>
              <Button asChild size="lg" className="group relative w-full overflow-hidden sm:w-auto">
                <Link href="/collection">
                  <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  {t.explore} <ArrowRight className="transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </Magnetic>
            <Magnetic>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <Link href="/activate">
                  <Nfc /> {t.activate}
                </Link>
              </Button>
            </Magnetic>
          </motion.div>
          <motion.dl
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-10 grid max-w-md grid-cols-3 gap-4"
          >
            {t.stats.map((s) => (
              <div key={s.label} className="border-l border-peach/30 pl-3">
                <dt className="sr-only">{s.label}</dt>
                <dd className="font-display text-2xl font-bold text-cream">
                  <CountUp value={s.value} />
                </dd>
                <dd className="mt-1 text-xs leading-snug text-muted">{s.label}</dd>
              </div>
            ))}
          </motion.dl>
        </div>

        <motion.div style={reduce ? undefined : { y: sinkY, opacity: fade }} className="relative -mx-4 sm:mx-0">
          {/* orbit rings */}
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-0 aspect-square w-[115%] -translate-x-1/2 -translate-y-1/2">
            <div className="absolute inset-0 rounded-full border border-dashed border-peach/20 animate-orbit">
              <span className="absolute left-1/2 top-0 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-peach shadow-[0_0_16px_4px_rgb(244_181_141/0.7)]" />
            </div>
            <div className="absolute inset-[12%] rounded-full border border-gold/15 animate-orbit-rev">
              <span className="absolute bottom-0 left-1/2 size-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-gold shadow-[0_0_14px_3px_rgb(214_162_60/0.7)]" />
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9, rotateX: 18 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            transition={{ duration: 1.1, ease }}
            style={reduce ? undefined : { rotateX: rx, rotateY: ry, transformPerspective: 1200 }}
            className="relative"
          >
            <div className="relative aspect-[644/420] overflow-hidden rounded-[2rem] mask-fade-left sm:rounded-[2.5rem]">
              <Image
                src="/assets/modu/hero-trio.webp"
                alt="MODU BEAR, MODU RABBIT and MODU DRAGON"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 55vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-ink/60 via-transparent to-transparent" />
              {/* holographic scan line */}
              <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute inset-x-0 h-1/3 animate-scan bg-gradient-to-b from-transparent via-peach/20 to-transparent">
                  <div className="absolute inset-x-0 bottom-1/2 h-px bg-peach/70 shadow-[0_0_12px_rgb(244_181_141)]" />
                </div>
              </div>
              <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/10" />
            </div>
          </motion.div>

          {/* floating holo chips */}
          <motion.div style={reduce ? undefined : { x: chipX, y: chipY }} className="absolute -bottom-5 left-4 z-10 sm:left-8">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: [0, -8, 0] }} transition={{ opacity: { delay: 1 }, y: { duration: 5, repeat: Infinity, ease: "easeInOut" } }}>
              <div className="card-glow flex items-center gap-3 px-4 py-3">
                <span className="relative grid size-10 place-items-center rounded-full bg-peach/15 text-peach">
                  <span className="absolute inset-0 rounded-full border border-peach/50 animate-pulse-ring" />
                  <Nfc className="size-5" />
                </span>
                <div className="text-left">
                  <div className="font-display text-sm font-bold">
                    <ScrambleText text="MB-GEN-0001" delay={1200} />
                  </div>
                  <div className="text-xs text-muted">NFC · 1 / 500</div>
                </div>
              </div>
            </motion.div>
          </motion.div>
          <motion.div
            style={reduce ? undefined : { x: chipXInv, y: chipYInv }}
            className="absolute -top-3 right-2 z-10 hidden sm:block"
          >
            <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1, y: [0, 8, 0] }} transition={{ opacity: { delay: 1.3 }, scale: { delay: 1.3 }, y: { duration: 6, repeat: Infinity, ease: "easeInOut" } }}>
              <div className="card flex items-center gap-2 px-3 py-2 text-sm">
                <Sparkles className="size-4 text-gold" />
                <span className="font-display font-bold text-peach">+160 MP</span>
              </div>
            </motion.div>
          </motion.div>
          <motion.div className="absolute right-6 top-1/2 z-10 hidden lg:block" style={reduce ? undefined : { x: chipX }}>
            <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0, y: [0, -6, 0] }} transition={{ delay: 1.6, y: { duration: 4.5, repeat: Infinity } }}>
              <div className="card flex items-center gap-2 px-3 py-2 text-xs text-success">
                <ShieldCheck className="size-4" /> verified owner
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
