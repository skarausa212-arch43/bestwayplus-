import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/modules/auth/session';
import { getForStaff } from '@/modules/opportunities/service';
import { Card, Eyebrow, SectionTitle, Pill } from '@/components/ui';
import { AddCandidateForm } from '@/components/admin/AddCandidateForm';
import { ParticipantStageControl } from '@/components/admin/ParticipantStageControl';

export const dynamic = 'force-dynamic';

const TONE: Record<string, 'neutral' | 'positive' | 'warning' | 'danger' | 'info'> = {
  DRAFT: 'neutral', OPEN: 'positive', ON_HOLD: 'warning', CLOSED: 'danger',
};

export default async function AdminOpportunityDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return null;

  const { id } = await params;
  const admin = await getTranslations('admin');
  const t = await getTranslations('opportunities');
  const ts = await getTranslations('statuses');
  const format = await getFormatter();

  const opportunity = await getForStaff(session, id);
  if (!opportunity) notFound();

  const FIELD_ROWS: Array<[string, string]> = [
    [t('position'), opportunity.position ?? '—'],
    [t('ageRange'), [opportunity.ageMin, opportunity.ageMax].filter((v) => v != null).join('–') || '—'],
    [t('salary'), [opportunity.salaryMin, opportunity.salaryMax].filter((v) => v != null).join('–') + (opportunity.salaryCurrency ? ` ${opportunity.salaryCurrency}` : '') || t('notDisclosed')],
    [t('transferType'), opportunity.transferType ? t(`type${opportunity.transferType}` as never) : '—'],
    [t('contractLength'), opportunity.contractLengthMonths ? t('months', { count: opportunity.contractLengthMonths }) : '—'],
    [t('deadline'), opportunity.deadline ? format.dateTime(opportunity.deadline, { dateStyle: 'medium' }) : '—'],
    [t('visibility'), t(`vis${opportunity.visibility}` as never)],
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <SectionTitle>{opportunity.name}</SectionTitle>
          <p className="mt-1.5 text-sm text-ink-muted">
            {[opportunity.clubName, opportunity.country, opportunity.league].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            {opportunity.createdBy.email} · {format.dateTime(opportunity.createdAt, { dateStyle: 'medium' })}
          </p>
        </div>
        <Pill tone={TONE[opportunity.status] ?? 'neutral'}>{ts(`opp${opportunity.status}` as never)}</Pill>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4">
          <Card>
            <dl className="grid gap-4 sm:grid-cols-3">
              {FIELD_ROWS.map(([label, value]) => (
                <div key={label}>
                  <dt className="font-display text-[9.5px] font-semibold uppercase tracking-[0.2em] text-ink-faint">{label}</dt>
                  <dd className="mt-1.5 text-sm text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            {opportunity.description && (
              <p className="mt-6 whitespace-pre-line border-t border-line-faint pt-5 text-sm leading-relaxed text-ink-muted">
                {opportunity.description}
              </p>
            )}
            {opportunity.internalNotes && (
              <div className="mt-6 border-t border-line-faint pt-5">
                <Eyebrow>{admin('internalOnly')}</Eyebrow>
                <p className="mt-2 whitespace-pre-line text-sm text-ink-muted">{opportunity.internalNotes}</p>
              </div>
            )}
          </Card>

          <Card>
            <Eyebrow>{t('participants')}</Eyebrow>
            {opportunity.participants.length === 0 ? (
              <p className="mt-4 text-sm text-ink-muted">{t('noCandidates')}</p>
            ) : (
              <ul className="mt-4 grid gap-2">
                {opportunity.participants.map((participant) => (
                  <li key={participant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line-faint px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-ink">{participant.user.email}</p>
                      <p className="text-xs text-ink-faint">{participant.user.role}</p>
                    </div>
                    <ParticipantStageControl participantId={participant.id} current={participant.stage} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card>
          <Eyebrow>{t('addCandidate')}</Eyebrow>
          <div className="mt-4"><AddCandidateForm opportunityId={id} /></div>
        </Card>
      </div>
    </div>
  );
}
