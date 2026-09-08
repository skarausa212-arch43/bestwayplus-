import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { getSessionUser } from '@/modules/auth/session';
import { getOwnPlayerProfile } from '@/modules/players/service';
import { SectionTitle } from '@/components/ui';
import { ProfileForm, type FieldSpec } from '@/components/portal/ProfileForm';

export const dynamic = 'force-dynamic';

const SECTIONS = [
  { id: 'personal', titleKey: 'sectionPersonal' },
  { id: 'football', titleKey: 'sectionFootball' },
  { id: 'links', titleKey: 'sectionLinks' },
  { id: 'career', titleKey: 'sectionCareer' },
  { id: 'representation', titleKey: 'sectionRepresentation' },
];

const FOOT_OPTIONS = [
  { value: 'LEFT', labelKey: 'footLeft' },
  { value: 'RIGHT', labelKey: 'footRight' },
  { value: 'BOTH', labelKey: 'footBoth' },
];

const FIELDS: FieldSpec[] = [
  { name: 'firstName', labelKey: 'firstName', section: 'personal' },
  { name: 'lastName', labelKey: 'lastName', section: 'personal' },
  { name: 'dateOfBirth', labelKey: 'dateOfBirth', type: 'date', section: 'personal' },
  { name: 'nationality', labelKey: 'nationality', section: 'personal' },
  { name: 'secondNationality', labelKey: 'secondNationality', section: 'personal' },
  { name: 'countryOfResidence', labelKey: 'countryOfResidence', section: 'personal' },
  { name: 'city', labelKey: 'city', section: 'personal' },

  { name: 'currentClub', labelKey: 'currentClub', section: 'football' },
  { name: 'league', labelKey: 'league', section: 'football' },
  { name: 'primaryPosition', labelKey: 'primaryPosition', section: 'football' },
  { name: 'secondaryPosition', labelKey: 'secondaryPosition', section: 'football' },
  { name: 'preferredFoot', labelKey: 'preferredFoot', type: 'select', options: FOOT_OPTIONS, section: 'football' },
  { name: 'heightCm', labelKey: 'height', type: 'number', section: 'football' },
  { name: 'weightKg', labelKey: 'weight', type: 'number', section: 'football' },
  { name: 'contractUntil', labelKey: 'contractUntil', type: 'date', section: 'football' },
  { name: 'nationalTeamExperience', labelKey: 'nationalTeam', section: 'football' },
  { name: 'professionalExperience', labelKey: 'proExperience', section: 'football' },

  { name: 'transfermarktUrl', labelKey: 'website', section: 'links' },
  { name: 'youtubeUrl', labelKey: 'website', section: 'links' },
  { name: 'highlightsUrl', labelKey: 'website', section: 'links' },
  { name: 'instagramUrl', labelKey: 'website', section: 'links' },

  { name: 'careerSummary', labelKey: 'careerSummary', type: 'textarea', section: 'career' },
  { name: 'careerGoals', labelKey: 'careerGoals', type: 'textarea', section: 'career' },
  { name: 'availability', labelKey: 'availability', section: 'career' },

  { name: 'hasAgent', labelKey: 'hasAgent', type: 'checkbox', section: 'representation' },
  { name: 'agentName', labelKey: 'agentName', section: 'representation' },
  { name: 'agentAgency', labelKey: 'agentAgency', section: 'representation' },
  { name: 'agentContact', labelKey: 'agentContact', section: 'representation' },
  { name: 'representationUntil', labelKey: 'representationUntil', type: 'date', section: 'representation' },
];

/** Dates reach the form as ISO day strings so <input type="date"> accepts them. */
function toDay(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

const DATE_FIELDS = new Set(['dateOfBirth', 'contractUntil', 'representationUntil']);

/**
 * Builds the draft from the field list rather than spreading the profile, so
 * the form only ever receives the scalars it renders — array columns such as
 * preferredCountries have their own editor and do not belong here.
 */
function toDraft(
  profile: Record<string, unknown> | null,
): Record<string, string | number | boolean | null> {
  const draft: Record<string, string | number | boolean | null> = {};
  for (const field of FIELDS) {
    const raw = profile?.[field.name];
    if (DATE_FIELDS.has(field.name)) {
      draft[field.name] = toDay(raw as Date | null | undefined);
    } else if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      draft[field.name] = raw;
    } else {
      draft[field.name] = null;
    }
  }
  return draft;
}

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as AppLocale);

  const session = await getSessionUser();
  if (!session) return null;

  const t = await getTranslations('portal');
  const profile = await getOwnPlayerProfile(session);

  const initial = toDraft(profile as Record<string, unknown> | null);

  return (
    <div className="grid gap-6">
      <SectionTitle>{t('myProfile')}</SectionTitle>
      <ProfileForm initial={initial} fields={FIELDS} sections={SECTIONS} />
    </div>
  );
}
