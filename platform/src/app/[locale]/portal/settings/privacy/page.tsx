import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/modules/auth/session';
import { Card, Eyebrow, SectionTitle } from '@/components/ui';
import { ConsentToggle } from '@/components/portal/ConsentToggle';

export const dynamic = 'force-dynamic';

/** Optional consents only — the required ones cannot be withdrawn while the
 *  account exists, which is what the deletion request is for. */
const OPTIONAL = ['PROFILE_SHARING', 'MARKETING'] as const;

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as AppLocale);

  const session = await getSessionUser();
  if (!session) return null;

  const t = await getTranslations('consent');
  const tp = await getTranslations('portal');
  const format = await getFormatter();

  const [history, shareLinks] = await Promise.all([
    prisma.consent.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, type: true, granted: true, policyVersion: true, createdAt: true, revokedAt: true },
    }),
    prisma.shareLink.count({
      where: { playerProfile: { userId: session.userId }, revokedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);

  const active = new Set(
    history.filter((row) => row.granted && !row.revokedAt).map((row) => row.type),
  );

  const LABEL: Record<string, string> = {
    PROFILE_SHARING: t('sharingLabel'),
    MARKETING: t('marketingLabel'),
  };
  const HINT: Record<string, string> = {
    PROFILE_SHARING: t('sharingHint'),
    MARKETING: t('marketingHint'),
  };

  return (
    <div className="grid gap-6">
      <SectionTitle>{tp('settingsPrivacy')}</SectionTitle>

      {OPTIONAL.map((type) => (
        <Card key={type}>
          <p className="max-w-[74ch] text-sm text-ink">{LABEL[type]}</p>
          <p className="mt-2 max-w-[74ch] text-xs text-ink-faint">{HINT[type]}</p>
          <div className="mt-4">
            <ConsentToggle type={type} granted={active.has(type)} />
          </div>
        </Card>
      ))}

      <Card>
        <Eyebrow>{tp('activeShareLinks')}</Eyebrow>
        <p className="mt-3 font-display text-3xl font-extrabold">{shareLinks}</p>
      </Card>

      <Card>
        <Eyebrow>{t('history')}</Eyebrow>
        <ul className="mt-3 grid gap-2 text-xs text-ink-muted">
          {history.map((row) => (
            <li key={row.id} className="flex flex-wrap justify-between gap-3 border-b border-line-faint pb-2">
              <span>{row.type} · v{row.policyVersion}</span>
              <span>
                {row.granted
                  ? t('granted', { date: format.dateTime(row.createdAt, { dateStyle: 'medium' }) })
                  : t('withdrawn', { date: format.dateTime(row.createdAt, { dateStyle: 'medium' }) })}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="border-l-2 border-l-state-warn">
        <Eyebrow>{tp('deleteAccount')}</Eyebrow>
        <p className="mt-3 max-w-[70ch] text-sm text-ink-muted">
          {tp('exportData')} · {tp('deleteAccount')}
        </p>
      </Card>
    </div>
  );
}
