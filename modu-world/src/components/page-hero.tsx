import { cn } from "@/lib/utils";

export function PageHero({ eyebrow, title, text, children, className }: { eyebrow?: string; title: string; text?: string; children?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("container-x pb-8 pt-10 sm:pt-16", className)}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-5xl">{title}</h1>
      {text && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-cream/70">{text}</p>}
      {children}
    </section>
  );
}
