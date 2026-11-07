import Link from "next/link";
import { UserRound, Shield, Store } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getDict, LOCALES } from "@/i18n";
import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "./locale-switcher";
import { MobileMenu } from "./mobile-menu";
import { NavLinks } from "./nav-links";
import { logoutAction } from "@/app/actions";

export async function Header() {
  const [{ t, locale }, user] = await Promise.all([getDict(), getSessionUser()]);
  const links = [
    { href: "/collection", label: t.nav.collection },
    { href: "/school", label: t.nav.school },
    { href: "/rewards", label: t.nav.rewards },
    { href: "/collectors", label: t.nav.collectors },
    { href: "/coin", label: t.nav.coin },
    { href: "/belarus", label: t.nav.belarus },
  ];
  const extra = [
    ...(user?.roles.includes("admin") ? [{ href: "/admin", label: t.nav.admin }] : []),
    ...(user?.roles.includes("partner") ? [{ href: "/partner", label: t.nav.partner }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink/75 backdrop-blur-xl">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-peach focus:px-4 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <div className="container-x flex h-16 items-center gap-6">
        <Logo />
        <nav aria-label="Main" className="hidden flex-1 lg:block">
          <NavLinks links={links} />
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LocaleSwitcher current={locale} locales={LOCALES} label={t.nav.language} />
          {user?.roles.includes("admin") && (
            <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
              <Link href="/admin">
                <Shield /> {t.nav.admin}
              </Link>
            </Button>
          )}
          {user?.roles.includes("partner") && (
            <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
              <Link href="/partner">
                <Store /> {t.nav.partner}
              </Link>
            </Button>
          )}
          {user ? (
            <>
              <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                <Link href="/dashboard">
                  <UserRound /> {t.nav.dashboard}
                </Link>
              </Button>
              <form action={logoutAction} className="hidden lg:block">
                <Button variant="ghost" size="sm" type="submit">
                  {t.nav.logout}
                </Button>
              </form>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/login">{t.nav.login}</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/activate">{t.nav.activate}</Link>
              </Button>
            </>
          )}
          <MobileMenu
            links={[...links, ...extra]}
            labels={{ menu: t.nav.menu, close: t.common.close, login: t.nav.login, register: t.nav.register, logout: t.nav.logout, dashboard: t.nav.dashboard }}
            loggedIn={!!user}
            logoutAction={logoutAction}
          />
        </div>
      </div>
    </header>
  );
}
