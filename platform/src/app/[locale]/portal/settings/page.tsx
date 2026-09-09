import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';
import { getSessionUser, listSessions } from '@/modules/auth/session';
import { Card, Eyebrow, SectionTitle } from '@/components/ui';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ResendVerificationButton } from '@/components/ResendVerificationButton';
import { RevokeSessionButton } from '@/components/RevokeSessionButton';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as AppLocale);

  const session = await getSessionUser();
  if (!session) return null;

  const t = await getTranslations('portal');
  const format = await getFormatter();
  const sessions = await listSessions(session.userId);

  return (
    <div className="grid gap-6">
      <SectionTitle>{t('settings')}</SectionTitle>

      <Card>
        <Eyebrow>{t('settingsAccount')}</Eyebrow>
        <p className="mt-3 text-sm text-ink">{session.email}</p>
        <div className="mt-2 flex items-center gap-3 text-xs">
          <span className={session.emailVerified ? 'text-emerald' : 'text-state-bad'}>
            {session.emailVerified ? t('emailVerified') : t('emailNotVerified')}
          </span>
          {!session.emailVerified && <ResendVerificationButton />}
        </div>
      </Card>

      <Card>
        <Eyebrow>{t('settingsLanguage')}</Eyebrow>
        <div className="mt-3"><LanguageSwitcher signedIn /></div>
      </Card>

      <Card>
        <Eyebrow>{t('settingsSecurity')}</Eyebrow>
        <p className="mt-3 text-sm text-ink-muted">{t('twoFactor')} — {session.twoFactorEnabled ? '✓' : '—'}</p>

        <p className="mt-5 font-display text-[9.5px] font-semibold uppercase tracking-[0.24em] text-ink-faint">
          {t('activeSessions')}
        </p>
        {sessions.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">{t('sessionsEmpty')}</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {sessions.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 rounded-[10px] border border-line-faint bg-bg-panel/40 px-3.5 py-2.5">
                <div className="min-w-0 text-xs text-ink-muted">
                  <p className="truncate text-ink">{row.userAgent ?? '—'}{row.ip ? ` · ${row.ip}` : ''}</p>
                  <p className="mt-0.5">
                    {t('sessionSignedIn', { date: format.dateTime(row.createdAt, { dateStyle: 'medium', timeStyle: 'short' }) })}
                  </p>
                </div>
                {row.id === session.sessionId ? (
                  <span className="flex-none text-xs text-emerald">{t('sessionCurrent')}</span>
                ) : (
                  <RevokeSessionButton sessionId={row.id} />
                )}
              </li>
            ))}
          </ul>
        )}
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
