"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, Nfc, Gift, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/** Bottom navigation for phones — the primary way people reach the app after scanning a tag. */
export function TabBar({ labels }: { labels: { home: string; collection: string; scan: string; rewards: string; profile: string } }) {
  const path = usePathname();
  if (path.startsWith("/admin")) return null;
  const items = [
    { href: "/", label: labels.home, icon: Home },
    { href: "/collection", label: labels.collection, icon: LayoutGrid },
    { href: "/activate", label: labels.scan, icon: Nfc, primary: true },
    { href: "/rewards", label: labels.rewards, icon: Gift },
    { href: "/dashboard", label: labels.profile, icon: UserRound },
  ];
  return (
    <nav
      aria-label="Tab bar"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {items.map(({ href, label, icon: Icon, primary }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("flex flex-col items-center gap-1 py-2 text-[0.65rem] font-medium", active ? "text-peach" : "text-cream/60")}
              >
                {primary ? (
                  <span className="-mt-6 grid size-12 place-items-center rounded-full bg-gradient-to-b from-[#ffc9a6] to-peach-deep text-ink shadow-[0_8px_24px_-6px_rgb(244_181_141/0.8)]">
                    <Icon className="size-6" aria-hidden />
                  </span>
                ) : (
                  <Icon className="size-5" aria-hidden />
                )}
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
