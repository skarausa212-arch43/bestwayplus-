"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Nfc, Box, GraduationCap, Coins, Gift, Ticket, Users, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  ["/admin", "overview", LayoutDashboard],
  ["/admin/batches", "batches", Nfc],
  ["/admin/toys", "toys", Box],
  ["/admin/school", "school", GraduationCap],
  ["/admin/points", "points", Coins],
  ["/admin/rewards", "rewards", Gift],
  ["/admin/coupons", "coupons", Ticket],
  ["/admin/users", "users", Users],
  ["/admin/audit", "audit", ScrollText],
] as const;

export function AdminNav({ labels }: { labels: Record<(typeof ITEMS)[number][1], string> }) {
  const path = usePathname();
  return (
    <nav aria-label="Admin" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:px-0">
      {ITEMS.map(([href, key, Icon]) => {
        const active = href === "/admin" ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition",
              active ? "bg-peach/15 font-semibold text-peach" : "text-cream/70 hover:bg-white/5 hover:text-cream",
            )}
          >
            <Icon className="size-4" /> {labels[key]}
          </Link>
        );
      })}
    </nav>
  );
}
