import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';
import { getSessionUser } from '@/modules/auth/session';
import { Card, Eyebrow, SectionTitle } from '@/components/ui';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as AppLocale);

  const session = await getSessionUser();
  if (!session) return null;

  const t = await getTranslations('portal');

  return (
    <div className="grid gap-6">
      <SectionTitle>{t('settings')}</SectionTitle>

      <Card>
        <Eyebrow>{t('settingsAccount')}</Eyebrow>
        <p className="mt-3 text-sm text-ink">{session.email}</p>
      </Card>

      <Card>
        <Eyebrow>{t('settingsLanguage')}</Eyebrow>
        <div className="mt-3"><LanguageSwitcher signedIn /></div>
      </Card>

      <Card>
        <Eyebrow>{t('settingsSecurity')}</Eyebrow>
        <ul className="mt-3 grid gap-2 text-sm text-ink-muted">
          <li>{t('twoFactor')} — {session.twoFactorEnabled ? '✓' : '—'}</li>
          <li>{t('activeSessions')}</li>
        </ul>
      </Card>

      <Card>
        <Eyebrow>{t('settingsPrivacy')}</Eyebrow>
        <Link href="/portal/settings/privacy" className="mt-3 inline-block text-sm text-emerald hover:underline">
          {t('settingsPrivacy')}
        </Link>
      </Card>
    </div>
  );
}
