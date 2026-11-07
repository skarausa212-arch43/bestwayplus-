import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/i18n";
import { getProfile } from "@/server/users";
import { Badge } from "@/components/ui/misc";
import { ProfileForm, AdultForm, DeleteAccountForm } from "../client";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser("/dashboard/settings");
  const { t } = await getDict();
  const profile = await getProfile(user.id);
  const s = t.settings;
  return (
    <div className="container-x max-w-3xl pb-10 pt-8">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-cream/60 hover:text-peach">
        <ArrowLeft className="size-4" /> {t.dashboard.title}
      </Link>
      <h1 className="mt-4 text-4xl font-extrabold">{s.title}</h1>
      <p className="mt-2 text-sm text-muted">{user.email}</p>

      <section className="card mt-8 p-6">
        <ProfileForm
          defaults={{ displayName: profile.display_name, locale: profile.locale, publicCollection: profile.public_collection }}
          labels={{ ...s, save: t.common.save }}
        />
      </section>

      <section className="card mt-6 p-6">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          {s.adultTitle} <Badge tone="silver">18+</Badge>
        </h2>
        {user.adult ? (
          <p className="mt-3 flex items-center gap-2 text-success">
            <ShieldCheck className="size-5" /> {s.adultDone}
          </p>
        ) : (
          <>
            <p className="mb-4 mt-2 text-sm text-cream/70">{s.adultText}</p>
            <AdultForm labels={s} />
          </>
        )}
      </section>

      <section className="card mt-6 p-6">
        <h2 className="text-xl font-bold">{s.privacy}</h2>
        <p className="mt-2 text-sm text-cream/70">{s.privacyText}</p>
        <div className="mt-6 rounded-2xl border border-danger/30 p-5">
          <h3 className="font-sans font-semibold text-danger">{s.deleteTitle}</h3>
          <p className="mb-4 mt-1 text-sm text-cream/70">{s.deleteText}</p>
          <DeleteAccountForm labels={s} />
        </div>
      </section>
    </div>
  );
}
