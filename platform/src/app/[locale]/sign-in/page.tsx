import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';
import { SignInForm } from '@/components/SignInForm';

export default async function SignInPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as AppLocale);

  const t = await getTranslations('join');
  const nav = await getTranslations('nav');

  return (
    <main className="mx-auto w-[min(440px,100%-2.5rem)] py-24">
      <h1 className="font-display text-[clamp(1.8rem,3.6vw,2.5rem)] font-extrabold tracking-tight">
        {t('signInTitle')}
      </h1>
      <p className="mt-3 text-ink-muted">{t('signInHint')}</p>

      <div className="mt-10">
        <SignInForm />
      </div>

      <p className="mt-8 text-sm text-ink-muted">
        {t('noAccount')}{' '}
        <Link href="/join" className="text-emerald hover:underline">{t('createOne')}</Link>
      </p>
      <p className="mt-2 text-sm">
        <Link href="/" className="text-ink-faint hover:text-ink">{nav('home')}</Link>
      </p>
    </main>
  );
}
