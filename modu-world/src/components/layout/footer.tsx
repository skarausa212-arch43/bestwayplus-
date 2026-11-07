import Link from "next/link";
import { getDict } from "@/i18n";
import { Logo } from "./logo";

export async function Footer() {
  const { t } = await getDict();
  const cols = [
    {
      title: t.footer.product,
      links: [
        ["/collection", t.nav.collection],
        ["/activate", t.nav.activate],
        ["/school", t.nav.school],
        ["/rewards", t.nav.rewards],
      ],
    },
    {
      title: t.footer.company,
      links: [
        ["/belarus", t.nav.belarus],
        ["/collectors", t.nav.collectors],
        ["/coin", t.nav.coin],
      ],
    },
    {
      title: t.footer.docs,
      links: [
        ["/legal/privacy", t.footer.privacy],
        ["/legal/terms", t.footer.terms],
        ["/legal/parents", t.footer.parents],
        ["/legal/web3", t.footer.web3],
      ],
    },
  ];
  return (
    <footer className="mt-24 border-t border-white/5 bg-ink-2/60 pb-28 pt-14 lg:pb-14">
      <div className="container-x grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo className="items-start" />
          <p className="mt-4 max-w-xs text-sm text-cream/60">{t.footer.tagline}</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h3 className="mb-3 font-sans text-xs font-semibold uppercase tracking-widest text-muted">{c.title}</h3>
            <ul className="space-y-2">
              {c.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-cream/75 hover:text-peach">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="container-x mt-12 flex flex-col gap-2 border-t border-white/5 pt-6 text-xs text-muted sm:flex-row sm:justify-between">
        <span>{t.footer.rights}</span>
        <span>{t.footer.demoNote}</span>
      </div>
    </footer>
  );
}
