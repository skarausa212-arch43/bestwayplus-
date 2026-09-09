import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';
import { ForgotPasswordForm } from '@/components/ForgotPasswordForm';

export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as AppLocale);

  const t = await getTranslations('join');

  return (
    <main className="mx-auto w-[min(440px,100%-2.5rem)] py-24">
      <h1 className="font-display text-[clamp(1.8rem,3.6vw,2.5rem)] font-extrabold tracking-tight">
        {t('forgotPasswordTitle')}
      </h1>
      <p className="mt-3 text-ink-muted">{t('forgotPasswordHint')}</p>

      <div className="mt-10">
        <ForgotPasswordForm />
      </div>

      <p className="mt-8 text-sm">
        <Link href="/sign-in" className="text-ink-faint hover:text-ink">{t('backToSignIn')}</Link>
      </p>
    </main>
  );
}
