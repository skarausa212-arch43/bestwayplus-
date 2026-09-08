'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';

/**
 * Portal navigation. The item set is role-derived on the server and passed in,
 * so a club representative never renders a link they cannot open — and, more
 * importantly, the route itself still authorises independently.
 */
export interface NavItem {
  href: string;
  labelKey: string;
  badge?: number;
}

export function Sidebar({ items }: { items: NavItem[] }) {
  const t = useTranslations('portal');
  const pathname = usePathname();

  return (
    <nav aria-label="Portal" className="lg:sticky lg:top-6">
      <ul className="flex gap-1 overflow-x-auto lg:grid lg:gap-0.5 lg:overflow-visible">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-none">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={
                  'flex items-center justify-between gap-3 whitespace-nowrap rounded-[10px] px-3.5 py-2.5 ' +
                  'font-display text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors ' +
                  (active
                    ? 'bg-emerald/12 text-emerald'
                    : 'text-ink-muted hover:bg-bg-panel hover:text-ink')
                }
              >
                <span>{t(item.labelKey)}</span>
                {item.badge ? (
                  <span className="rounded-full bg-emerald-gradient px-1.5 py-0.5 text-[9px] font-bold text-[#04150C]">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
