import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { getSessionUser } from '@/modules/auth/session';
import { getForParticipant } from '@/modules/opportunities/service';
import { Card, Eyebrow, SectionTitle } from '@/components/ui';
import { StagePill } from '@/components/portal/StatusPill';
import { OpportunityResponse } from '@/components/portal/OpportunityResponse';

export const dynamic = 'force-dynamic';

const STAGES = [
  'NEW', 'PROFILE_UNDER_REVIEW', 'SUBMITTED', 'CLUB_REVIEWING', 'NEGOTIATION', 'CLOSED',
] as const;

export default async function OpportunityDetail({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale as AppLocale);

  const session = await getSessionUser();
  if (!session) return null;

  // Scoped by participant: an opportunity the caller is not on returns
  // nothing, so its existence is never confirmed.
  const entry = await getForParticipant(session, id);
  if (!entry) notFound();

  const t = await getTranslations('opportunities');
  const ts = await getTranslations('statuses');
  const format = await getFormatter();
  const o = entry.opportunity;

  const currentIndex = STAGES.indexOf(entry.stage as (typeof STAGES)[number]);
  const facts: Array<[string, string]> = [
    [t('position'), o.position ?? '—'],
    [t('ageRange'), o.ageMin || o.ageMax ? `${o.ageMin ?? '—'}–${o.ageMax ?? '—'}` : '—'],
    [t('transferType'), o.transferType ? t(`type${o.transferType}`) : '—'],
    [t('contractLength'), o.contractLengthMonths ? t('months', { count: o.contractLengthMonths }) : '—'],
    [t('deadline'), o.deadline ? format.dateTime(o.deadline, { dateStyle: 'medium' }) : '—'],
    [
      t('salary'),
      o.salaryMin || o.salaryMax
        ? `${o.salaryMin ?? ''}–${o.salaryMax ?? ''} ${o.salaryCurrency ?? ''}`.trim()
        : t('notDisclosed'),
    ],
  ];

  return (
    <div className="grid gap-6">
      <div>
        <SectionTitle>{o.name}</SectionTitle>
        <p className="mt-2 text-sm text-ink-muted">
          {[o.clubName, o.country, o.league].filter(Boolean).join(' · ')}
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Eyebrow>{t('progress')}</Eyebrow>
          <StagePill stage={entry.stage} />
        </div>
        <ol className="mt-4 flex flex-wrap gap-2">
          {STAGES.map((stage, index) => (
            <li
              key={stage}
              className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                index <= currentIndex && currentIndex >= 0
                  ? 'border-emerald/40 bg-emerald/10 text-emerald'
                  : 'border-line-faint text-ink-faint'
              }`}
            >
              {ts(`stage${stage}`)}
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <dl className="grid gap-4 sm:grid-cols-3">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="font-display text-[9.5px] font-semibold uppercase tracking-[0.22em] text-ink-faint">
                {label}
              </dt>
              <dd className="mt-1.5 text-sm text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {o.description && (
        <Card>
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">{o.description}</p>
        </Card>
      )}

      <OpportunityResponse opportunityId={o.id} stage={entry.stage} />
    </div>
  );
}
