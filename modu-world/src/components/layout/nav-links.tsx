"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <ul className="flex items-center gap-1">
      {links.map((l) => {
        const active = path === l.href || path.startsWith(l.href + "/");
        return (
          <li key={l.href} className="relative">
            <Link
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative block rounded-full px-3 py-2 text-sm font-medium transition-colors",
                active ? "text-peach" : "text-cream/70 hover:text-cream",
              )}
            >
              {l.label}
              {active && (
                <motion.span layoutId="nav-underline" className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-peach" />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
