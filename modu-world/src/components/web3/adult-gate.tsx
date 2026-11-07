import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import type { Dict } from "@/i18n/ru";
import { Button } from "@/components/ui/button";
import { AdultForm } from "@/app/dashboard/client";

/** Shown instead of Web3 features to anyone who is not a verified adult collector. */
export function AdultGate({ user, t, next }: { user: SessionUser | null; t: Dict; next: string }) {
  const isChild = user?.roles.includes("child");
  return (
    <div className="card mx-auto max-w-lg p-6 text-center sm:p-8">
      <ShieldAlert className="mx-auto size-10 text-silver" />
      <h2 className="mt-4 text-2xl font-bold">{t.collectors.gateTitle}</h2>
      <p className="mt-2 text-sm text-cream/70">{t.collectors.gateText}</p>
      <div className="mt-6 text-left">
        {!user ? (
          <Button asChild className="w-full">
            <Link href={`/login?next=${encodeURIComponent(next)}`}>{t.collectors.gateLogin}</Link>
          </Button>
        ) : isChild ? null : (
          <AdultForm labels={t.settings} />
        )}
      </div>
    </div>
  );
}
