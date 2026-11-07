import Image from "next/image";
import { BookOpen, Printer, Palette, Nfc, Globe2, Mail } from "lucide-react";
import { getDict } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/home/reveal";

export const metadata = { title: "Made in Belarus" };

const ICONS = [BookOpen, Printer, Palette, Nfc, Globe2];

export default async function BelarusPage() {
  const { t } = await getDict();
  const b = t.belarus;
  return (
    <>
      <section className="relative overflow-hidden">
        <Image src="/assets/modu/castle.webp" alt="" fill priority sizes="100vw" className="object-cover opacity-35" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/40 via-ink/80 to-ink" />
        <div className="container-x relative pb-16 pt-16 sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase tracking-widest">
            <span className="flex h-3.5 w-5 flex-col overflow-hidden rounded-sm">
              <span className="flex-[2] bg-by-red" />
              <span className="flex-1 bg-by-green" />
            </span>
            {b.eyebrow}
          </span>
          <h1 className="mt-6 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-6xl">{b.title}</h1>
          <p className="mt-5 max-w-2xl text-lg text-cream/75">{b.intro}</p>
        </div>
        <div className="ornament relative h-6" aria-hidden />
      </section>

      <section className="container-x mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {b.sections.map((s, i) => {
          const Icon = ICONS[i];
          return (
            <Reveal key={s.title} delay={i * 0.05}>
              <div className="card h-full p-6">
                <span className="grid size-11 place-items-center rounded-2xl bg-by-red/15 text-[#ff6b7f]">
                  <Icon className="size-5" />
                </span>
                <h2 className="mt-5 font-display text-xl font-bold">{s.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-cream/70">{s.text}</p>
              </div>
            </Reveal>
          );
        })}
        <Reveal delay={0.25}>
          <div className="card relative h-full min-h-[260px] overflow-hidden">
            <Image src="/assets/modu/bear.webp" alt="" fill sizes="33vw" className="object-contain object-bottom p-4" />
            <div className="absolute inset-x-0 bottom-0 h-5 ornament" aria-hidden />
            <p className="absolute left-4 top-4 max-w-[60%] text-xs text-cream/70">{b.standNote}</p>
          </div>
        </Reveal>
      </section>

      <section id="partners" className="container-x mt-16 scroll-mt-24">
        <div className="card-glow grid gap-8 p-8 sm:p-12 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="text-3xl font-bold">{b.partnersTitle}</h2>
            <p className="mt-4 text-cream/75">{b.partnersText}</p>
          </div>
          <div className="flex items-center lg:justify-end">
            <Button asChild size="lg">
              <a href="mailto:partners@modu.world?subject=MODU%20WORLD%20partnership">
                <Mail /> {b.contact}
              </a>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
