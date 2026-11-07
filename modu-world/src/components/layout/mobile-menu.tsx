"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MobileMenu({
  links,
  labels,
  loggedIn,
  logoutAction,
}: {
  links: { href: string; label: string }[];
  labels: { menu: string; close: string; login: string; register: string; logout: string; dashboard: string };
  loggedIn: boolean;
  logoutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <Button variant="ghost" size="icon" aria-label={labels.menu} aria-expanded={open} onClick={() => setOpen(true)}>
        <Menu className="!size-5" />
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={labels.menu}
            className="fixed inset-0 z-50 flex flex-col bg-ink/97 px-6 pb-10 pt-5 backdrop-blur-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex justify-end">
              <Button variant="ghost" size="icon" aria-label={labels.close} onClick={() => setOpen(false)}>
                <X className="!size-6" />
              </Button>
            </div>
            <nav className="mt-6 flex flex-1 flex-col gap-1" aria-label="Mobile">
              {links.map((l, i) => (
                <motion.div key={l.href} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                  <Link
                    href={l.href}
                    className="block rounded-2xl px-3 py-3 font-display text-2xl font-bold text-cream hover:bg-white/5 hover:text-peach"
                  >
                    {l.label}
                  </Link>
                </motion.div>
              ))}
            </nav>
            <div className="grid gap-3">
              {loggedIn ? (
                <>
                  <Button asChild size="lg">
                    <Link href="/dashboard">{labels.dashboard}</Link>
                  </Button>
                  <form action={logoutAction}>
                    <Button variant="outline" size="lg" className="w-full" type="submit">
                      {labels.logout}
                    </Button>
                  </form>
                </>
              ) : (
                <>
                  <Button asChild size="lg">
                    <Link href="/register">{labels.register}</Link>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <Link href="/login">{labels.login}</Link>
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
