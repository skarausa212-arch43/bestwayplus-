import { prisma } from '@/lib/db';
import { authorize, type Actor } from '@/modules/rbac/authorize';
import { recordActivity } from '@/modules/activity/service';
import { hasActiveConsent } from '@/modules/consent/service';
import {
  SECTION_FIELDS, SHARE_SECTIONS, normaliseSections, projectProfile,
  type ShareSections,
} from '@/modules/share/sections';
import { renderPresentation, type PresentationData } from './template';
import type { AppLocale } from '@/i18n/routing';

/**
 * Builds the player presentation.
 *
 * It reuses the share allow-list on purpose: there is one definition of what
 * may leave the building, and a deck is just another way of leaving. Salary,
 * representation terms and the internal assessment are unreachable here for
 * exactly the same reason they are unreachable from a share link.
 */
export async function buildPresentation(
  actor: Actor,
  playerUserId: string,
  options: { sections: Partial<ShareSections>; locale: AppLocale; includeSummary?: boolean },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ html: string; sections: ShareSections }> {
  const owner = await prisma.user.findUnique({
    where: { id: playerUserId },
    select: { id: true, responsibleManagerId: true },
  });
  if (!owner) throw new Error('Unknown player');

  // A deck is an outbound artefact, so it is gated on the same consent as a
  // share link rather than on mere staff access.
  authorize(actor, 'shareLink:create', {
    ownerUserId: owner.id,
    responsibleManagerId: owner.responsibleManagerId,
  });

  if (!(await hasActiveConsent(owner.id, 'PROFILE_SHARING'))) {
    const error = new Error('Player has not consented to profile sharing') as Error & {
      code: string; messageKey: string;
    };
    error.code = 'CONSENT_MISSING';
    error.messageKey = 'admin.shareConsentMissing';
    throw error;
  }

  const sections = normaliseSections(options.sections);

  const profile = await prisma.playerProfile.findUnique({
    where: { userId: playerUserId },
    select: {
      firstName: true, lastName: true, dateOfBirth: true, nationality: true,
      secondNationality: true, countryOfResidence: true,
      primaryPosition: true, secondaryPosition: true, preferredFoot: true,
      heightCm: true, weightKg: true, currentClub: true, league: true, contractUntil: true,
      nationalTeamExperience: true, professionalExperience: true,
      careerSummary: true, careerGoals: true, availability: true,
      preferredCountries: true, preferredLeagues: true,
      transfermarktUrl: true, youtubeUrl: true, highlightsUrl: true, instagramUrl: true,
    },
  });
  if (!profile) throw new Error('Player has no profile');

  const visible = projectProfile(profile as Record<string, unknown>, sections);

  const stringify = (raw: unknown): string | null => {
    if (raw === null || raw === undefined || raw === '') return null;
    if (raw instanceof Date) return raw.toISOString().slice(0, 10);
    if (Array.isArray(raw)) return raw.length ? raw.join(', ') : null;
    return String(raw);
  };

  const data: PresentationData = {
    name: [stringify(visible.firstName), stringify(visible.lastName)].filter(Boolean).join(' ') || '—',
    headline: [stringify(visible.primaryPosition), stringify(visible.currentClub)].filter(Boolean).join(' · '),
    locale: options.locale,
    generatedOn: new Date().toISOString().slice(0, 10),
    sections: SHARE_SECTIONS.filter((section) => sections[section]).map((section) => ({
      title: section,
      rows: SECTION_FIELDS[section]
        .map((field) => [field, stringify(visible[field])] as const)
        .filter((row): row is [string, string] => row[1] !== null),
    })),
    summary: options.includeSummary ? stringify(visible.careerSummary) : null,
    regulatoryNote:
      'Bestway Plus Sp. z o.o. is not a FIFA Football Agent. Regulated football agent services are ' +
      'performed by appropriately licensed FIFA Football Agents.',
  };

  await recordActivity({
    actorUserId: actor.userId, subjectUserId: playerUserId,
    action: 'presentation.generated', entityType: 'playerProfile',
    metadata: { sections: SHARE_SECTIONS.filter((s) => sections[s]) }, ctx,
  });

  // The worker turns this into a PDF with headless Chromium; the HTML is the
  // single source of the layout.
  return { html: renderPresentation(data), sections };
}
