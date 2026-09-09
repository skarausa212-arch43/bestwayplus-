import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';
import { VerifyEmailClient } from '@/components/VerifyEmailClient';

export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as AppLocale);

  const { token } = await searchParams;
  const t = await getTranslations('join');

  return (
    <main className="mx-auto w-[min(440px,100%-2.5rem)] py-24">
      <h1 className="font-display text-[clamp(1.8rem,3.6vw,2.5rem)] font-extrabold tracking-tight">
        {t('verifyEmailTitle')}
      </h1>

      <div className="mt-10">
        <VerifyEmailClient token={token ?? null} />
      </div>

      <p className="mt-8 text-sm">
        <Link href="/sign-in" className="text-ink-faint hover:text-ink">{t('backToSignIn')}</Link>
      </p>
    </main>
  );
}
