import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';
import { JoinForm } from '@/components/JoinForm';
import { ROLE_SLUGS, isRoleSlug } from '@/modules/auth/registration-fields';

export function generateStaticParams() {
  return ROLE_SLUGS.map((role) => ({ role }));
}

export default async function JoinRolePage({
  params,
}: {
  params: Promise<{ locale: string; role: string }>;
}) {
  const { locale, role } = await params;
  setRequestLocale(locale as AppLocale);
  if (!isRoleSlug(role)) notFound();

  const t = await getTranslations('join');
  const nav = await getTranslations('nav');

  return (
    <main className="mx-auto w-[min(760px,100%-2.5rem)] py-20">
      <p className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-emerald">
        {t(`role${role.charAt(0).toUpperCase()}${role.slice(1)}` as never)}
      </p>
      <h1 className="mt-3 font-display text-[clamp(1.8rem,3.6vw,2.75rem)] font-extrabold tracking-tight">
        {t('title')}
      </h1>
      <p className="mt-3 max-w-[60ch] text-ink-muted">{t('reassurance')}</p>

      <div className="mt-10">
        <JoinForm role={role} />
      </div>

      <p className="mt-8 text-sm text-ink-muted">
        {t('haveAccount')}{' '}
        <Link href="/sign-in" className="text-emerald hover:underline">{nav('signIn')}</Link>
      </p>
    </main>
  );
}
