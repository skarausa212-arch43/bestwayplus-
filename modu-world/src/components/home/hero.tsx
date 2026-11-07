"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Nfc } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero({
  t,
}: {
  t: { eyebrow: string; title1: string; title2: string; text: string; explore: string; activate: string; stats: { value: string; label: string }[] };
}) {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-40 top-10 h-[520px] w-[520px] rounded-full bg-peach/20 blur-[140px]" />
        <div className="absolute -left-20 bottom-0 h-[300px] w-[300px] rounded-full bg-gold/10 blur-[120px]" />
      </div>
      <div className="container-x grid items-center gap-10 pb-16 pt-10 lg:grid-cols-[1fr_1.15fr] lg:pb-24 lg:pt-16">
        <div className="relative z-10">
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="eyebrow">
            {t.eyebrow}
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.6 }}
            className="mt-5 text-[2.7rem] font-extrabold leading-[0.95] sm:text-6xl xl:text-[5.2rem]"
          >
            <span className="mb-3 block text-lg font-bold tracking-[0.3em] text-cream/60 sm:text-xl">MODU WORLD</span>
            <span className="block text-gradient">{t.title1}</span>
            <span className="block">{t.title2}</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-6 max-w-lg text-lg leading-relaxed text-cream/70"
          >
            {t.text}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mt-8 flex flex-col gap-3 sm:flex-row"
          >
            <Button asChild size="lg">
              <Link href="/collection">
                {t.explore} <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/activate">
                <Nfc /> {t.activate}
              </Link>
            </Button>
          </motion.div>
          <motion.dl
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-10 grid max-w-md grid-cols-3 gap-4"
          >
            {t.stats.map((s) => (
              <div key={s.label}>
                <dt className="sr-only">{s.label}</dt>
                <dd className="font-display text-2xl font-bold text-cream">{s.value}</dd>
                <dd className="mt-1 text-xs leading-snug text-muted">{s.label}</dd>
              </div>
            ))}
          </motion.dl>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }}
          className="relative -mx-4 sm:mx-0"
        >
          <div className="relative aspect-[644/420] overflow-hidden rounded-[2rem] sm:rounded-[2.5rem] mask-fade-left">
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
          </div>
          <motion.div
            className="absolute -bottom-5 left-4 sm:left-8"
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="card-glow flex items-center gap-3 px-4 py-3">
              <span className="relative grid size-10 place-items-center rounded-full bg-peach/15 text-peach">
                <span className="absolute inset-0 rounded-full border border-peach/50 animate-pulse-ring" />
                <Nfc className="size-5" />
              </span>
              <div className="text-left">
                <div className="font-display text-sm font-bold">MB-GEN-0001</div>
                <div className="text-xs text-muted">NFC · 1 / 500</div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
