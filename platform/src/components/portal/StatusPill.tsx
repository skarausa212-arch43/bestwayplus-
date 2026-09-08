import { useTranslations } from 'next-intl';
import { Pill, type Tone } from '@/components/ui';

const DOC_TONE: Record<string, Tone> = {
  UPLOADED: 'neutral',
  UNDER_REVIEW: 'info',
  APPROVED: 'positive',
  ACTION_REQUIRED: 'warning',
  REJECTED: 'danger',
  EXPIRED: 'danger',
};

const STAGE_TONE: Record<string, Tone> = {
  NEW: 'info',
  PROFILE_UNDER_REVIEW: 'info',
  SUBMITTED: 'neutral',
  CLUB_REVIEWING: 'neutral',
  INFO_REQUESTED: 'warning',
  NEGOTIATION: 'positive',
  CLOSED: 'neutral',
  SUCCESSFUL: 'positive',
};

export function DocumentStatusPill({ status }: { status: string }) {
  const t = useTranslations('statuses');
  return <Pill tone={DOC_TONE[status] ?? 'neutral'}>{t(`doc${status}`)}</Pill>;
}

export function StagePill({ stage }: { stage: string }) {
  const t = useTranslations('statuses');
  return <Pill tone={STAGE_TONE[stage] ?? 'neutral'}>{t(`stage${stage}`)}</Pill>;
}
