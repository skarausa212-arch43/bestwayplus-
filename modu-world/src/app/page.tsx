import Image from "next/image";
import Link from "next/link";
import { ArrowRight, GraduationCap, TrendingUp, ShieldCheck, Trash2, Gem, History, Wallet, Award, Plus } from "lucide-react";
import { getDict } from "@/i18n";
import { listCharacters } from "@/server/catalog";
import { listRewards } from "@/server/rewards";
import { Hero } from "@/components/home/hero";
import { NfcDemo } from "@/components/home/nfc-demo";
import { HowItWorks } from "@/components/home/how-it-works";
import { Reveal } from "@/components/home/reveal";
import { Marquee, TiltCard, Parallax, CountUp } from "@/components/fx/fx";
import { CharacterCard } from "@/components/character-card";
import { Button } from "@/components/ui/button";
import { Badge, PointsPill, SectionHeading } from "@/components/ui/misc";
import { tl } from "@/i18n/format";

export default async function HomePage() {
  const { t, locale } = await getDict();
  const [characters, rewards] = await Promise.all([listCharacters(), listRewards(null)]);
  const h = t.home;

  return (
    <>
      <Hero
        t={{ eyebrow: h.heroEyebrow, title1: h.heroTitle1, title2: h.heroTitle2, text: h.heroText, explore: h.explore, activate: h.activate, stats: h.stats }}
      />

      <Marquee items={["Your toy", "Your world", "NFC inside", "MODU School", "Made in Belarus", "Collectors 18+", "Genesis series"]} className="border-y border-white/5" />

      {/* Characters */}
      <section className="container-x py-16" aria-labelledby="chars">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <SectionHeading eyebrow={t.collection.eyebrow} title={<span id="chars">{t.collection.title}</span>} text={t.collection.text} />
          <Button asChild variant="outline">
            <Link href="/collection">
              {t.collection.allCharacters} <ArrowRight />
            </Link>
          </Button>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((c, i) => (
            <Reveal key={c.id} delay={i * 0.08}>
              <CharacterCard c={c} t={t} locale={locale} />
            </Reveal>
          ))}
        </div>
      </section>

      <NfcDemo
        t={{
          eyebrow: h.nfcEyebrow,
          title: h.nfcTitle,
          text: h.nfcText,
          points: h.nfcPoints,
          tryDemo: h.nfcTry,
          passport: t.toy.passport,
          serial: t.toy.serial,
          activated: t.toy.status.activated,
        }}
      />

      <HowItWorks t={{ eyebrow: h.howEyebrow, title: h.howTitle, steps: h.steps }} />

      {/* MODU School */}
      <section className="container-x py-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <SectionHeading eyebrow={h.schoolEyebrow} title={h.schoolTitle} text={h.schoolText} />
            <Button asChild className="mt-8">
              <Link href="/school">
                <GraduationCap /> {h.schoolCta}
              </Link>
            </Button>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="card p-6 sm:p-8">
              <div className="mb-5 flex items-center justify-between">
                <span className="font-display font-bold">MODU School</span>
                <Badge tone="peach">{t.school.status.approved}</Badge>
              </div>
              {[
                { icon: TrendingUp, title: t.school.kinds.improvement + " · " + (locale === "en" ? "Maths 5 → 7" : "Математика 5 → 7"), pts: 160 },
                { icon: Award, title: t.school.kinds.grade + " · 9", pts: 60 },
                { icon: GraduationCap, title: t.school.kinds.task, pts: 50 },
              ].map((r) => (
                <div key={r.title} className="flex items-center gap-4 border-t border-line py-4">
                  <span className="grid size-10 place-items-center rounded-xl bg-success/15 text-success">
                    <r.icon className="size-5" />
                  </span>
                  <span className="flex-1 text-sm">{r.title}</span>
                  <span className="font-display text-sm font-bold text-peach">+{r.pts} MP</span>
                </div>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-cream/60">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-peach" /> {t.school.rules[1].title}
                </span>
                <span className="flex items-center gap-2">
                  <Trash2 className="size-4 text-peach" /> {t.school.rules[2].title}
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Rewards */}
      <section className="container-x py-16">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <SectionHeading eyebrow={h.rewardsEyebrow} title={h.rewardsTitle} text={h.rewardsText} />
          <Button asChild variant="outline">
            <Link href="/rewards">
              {h.rewardsCta} <ArrowRight />
            </Link>
          </Button>
        </div>
        <div className="mt-10 flex snap-x gap-4 overflow-x-auto pb-4 [scrollbar-width:none] sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
          {rewards.slice(0, 4).map((r, i) => (
            <Reveal key={r.id} delay={i * 0.08} className="min-w-[240px] snap-start">
            <TiltCard className="h-full rounded-[var(--radius-card)]">
            <div className="card h-full p-5">
              <div className="flex items-center justify-between">
                <Badge tone={r.partner_is_concept ? "demo" : "neutral"}>
                  {r.partner_is_concept ? t.common.concept : t.rewards.categories[r.category as keyof typeof t.rewards.categories]}
                </Badge>
              </div>
              <h3 className="mt-6 font-display text-lg font-bold leading-snug">{tl(r.title, locale)}</h3>
              {r.partner_name && <p className="mt-1 text-xs text-muted">{r.partner_name}</p>}
              <div className="mt-6">
                <PointsPill value={<CountUp value={r.cost_points} />} />
              </div>
            </div>
            </TiltCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Collectors */}
      <section className="container-x py-16">
        <div className="relative overflow-hidden rounded-[var(--radius-card)] p-8 border-flow sm:p-12">
          <Parallax offset={40} className="absolute -right-10 top-0 hidden h-full w-[340px] md:block">
            <div className="relative h-full w-full [mask-image:linear-gradient(to_right,transparent,black_35%)]">
              <Image src="/assets/modu/dragon.webp" alt="" fill sizes="340px" className="object-cover object-top opacity-90" />
            </div>
          </Parallax>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_50%,rgb(170_176_184/0.2),transparent_50%)]" />
          <div className="relative max-w-xl">
            <Badge tone="silver">18+</Badge>
            <SectionHeading className="mt-4" eyebrow={h.collectorsEyebrow} title={h.collectorsTitle} text={h.collectorsText} />
            <div className="mt-6 flex flex-wrap gap-4 text-sm text-cream/70">
              <span className="flex items-center gap-2">
                <Gem className="size-4 text-silver" /> Collector Edition
              </span>
              <span className="flex items-center gap-2">
                <History className="size-4 text-silver" /> {t.collectors.history}
              </span>
              <span className="flex items-center gap-2">
                <Wallet className="size-4 text-silver" /> Testnet
              </span>
            </div>
            <Button asChild variant="light" className="mt-8">
              <Link href="/collectors">{h.collectorsCta}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Made in Belarus */}
      <section className="container-x py-16">
        <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-line">
          <Image src="/assets/modu/castle.webp" alt="" fill sizes="100vw" className="object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-ink/30" />
          <div className="relative grid gap-8 p-8 sm:p-12 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase tracking-widest">
                <span className="flex h-3.5 w-5 flex-col overflow-hidden rounded-sm">
                  <span className="flex-[2] bg-by-red" />
                  <span className="flex-1 bg-by-green" />
                </span>
                Made in Belarus
              </span>
              <h2 className="mt-5 text-3xl font-bold sm:text-4xl">{h.belarusTitle}</h2>
              <p className="mt-4 max-w-lg text-cream/75">{h.belarusText}</p>
              <Button asChild className="mt-8">
                <Link href="/belarus">{h.belarusCta}</Link>
              </Button>
            </div>
          </div>
          <div className="ornament relative h-6 opacity-90 animate-[ornament_14s_linear_infinite]" aria-hidden />
        </div>
      </section>

      {/* FAQ */}
      <section className="container-x py-16" aria-labelledby="faq">
        <SectionHeading title={<span id="faq">{h.faqTitle}</span>} />
        <div className="mt-8 grid gap-3 lg:grid-cols-2">
          {h.faq.map((f) => (
            <details key={f.q} className="group card px-6 py-5 open:border-peach/30">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                {f.q}
                <Plus className="size-5 shrink-0 text-peach transition group-open:rotate-45" aria-hidden />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-cream/70">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container-x pb-8 pt-8">
        <div className="card-glow relative overflow-hidden px-6 py-12 text-center sm:px-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgb(244_181_141/0.25),transparent_60%)]" />
          <div className="relative">
            <h2 className="text-3xl font-bold sm:text-4xl">{h.ctaTitle}</h2>
            <p className="mx-auto mt-3 max-w-md text-cream/70">{h.ctaText}</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/register">{t.nav.register}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/activate">{h.activate}</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
