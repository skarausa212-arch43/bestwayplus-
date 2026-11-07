import { cn } from "@/lib/utils";
import { SplitWords } from "@/components/fx/fx";
import { Reveal } from "@/components/home/reveal";

export function PageHero({ eyebrow, title, text, children, className }: { eyebrow?: string; title: string; text?: string; children?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("container-x relative pb-8 pt-10 sm:pt-16", className)}>
      <div aria-hidden className="pointer-events-none absolute -top-10 left-0 h-40 w-72 rounded-full bg-peach/10 blur-3xl" />
      {eyebrow && (
        <Reveal>
          <p className="eyebrow flex items-center gap-2">
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-peach" />
            {eyebrow}
          </p>
        </Reveal>
      )}
      <h1 className="mt-3 max-w-3xl text-[1.9rem] font-extrabold leading-[1.08] [overflow-wrap:anywhere] [hyphens:auto] sm:text-5xl">
        <SplitWords text={title} delay={0.05} />
      </h1>
      {text && (
        <Reveal delay={0.25}>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-cream/70">{text}</p>
        </Reveal>
      )}
      {children && <Reveal delay={0.35}>{children}</Reveal>}
    </section>
  );
}
