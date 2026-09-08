import type { DocumentType } from '@prisma/client';

/**
 * Profile completion.
 *
 * A pure function over a plain snapshot, deliberately kept away from Prisma so
 * it can be unit tested and reused by the API, the dashboard and the admin
 * table without three implementations drifting apart.
 *
 * The weights encode what actually makes a profile usable to a sporting
 * director, not how many database columns are populated — a passport and a
 * highlight reel are worth more than a second nationality.
 */

export interface CompletionSnapshot {
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: Date | string | null;
  nationality?: string | null;
  countryOfResidence?: string | null;
  city?: string | null;

  primaryPosition?: string | null;
  preferredFoot?: string | null;
  heightCm?: number | null;
  currentClub?: string | null;
  contractUntil?: Date | string | null;
  league?: string | null;

  careerSummary?: string | null;
  preferredCountries?: readonly string[] | null;
  availability?: string | null;

  highlightsUrl?: string | null;
  youtubeUrl?: string | null;
  transfermarktUrl?: string | null;

  /** Types of documents the player has that are not rejected or deleted. */
  documentTypes?: readonly DocumentType[] | null;
}

export type ChecklistKey =
  | 'personal' | 'football' | 'preferences'
  | 'passport' | 'cv' | 'contract' | 'highlights' | 'photo';

export interface ChecklistItem {
  key: ChecklistKey;
  /** i18n key under the `portal` namespace. */
  labelKey: string;
  weight: number;
  done: boolean;
  /** Portal route that completes this item. */
  href: string;
}

const WEIGHTS: Record<ChecklistKey, number> = {
  personal: 15,
  football: 20,
  preferences: 10,
  passport: 15,
  cv: 10,
  contract: 15,
  highlights: 10,
  photo: 5,
};

const LABELS: Record<ChecklistKey, string> = {
  personal: 'checkPersonal',
  football: 'checkFootball',
  preferences: 'checkPreferences',
  passport: 'checkPassport',
  cv: 'checkCv',
  contract: 'checkContract',
  highlights: 'checkHighlights',
  photo: 'checkPhoto',
};

const HREFS: Record<ChecklistKey, string> = {
  personal: '/portal/profile#personal',
  football: '/portal/profile#football',
  preferences: '/portal/profile#career',
  passport: '/portal/documents?type=PASSPORT_ID',
  cv: '/portal/documents?type=PLAYER_CV',
  contract: '/portal/documents?type=CLUB_CONTRACT',
  highlights: '/portal/profile#links',
  photo: '/portal/documents?type=PHOTO',
};

const filled = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

/** Every field in the group must be present; partial groups do not count. */
const allFilled = (...values: unknown[]): boolean => values.every(filled);

export function evaluateChecklist(snapshot: CompletionSnapshot): ChecklistItem[] {
  const documents = new Set(snapshot.documentTypes ?? []);

  const done: Record<ChecklistKey, boolean> = {
    personal: allFilled(
      snapshot.firstName, snapshot.lastName, snapshot.dateOfBirth,
      snapshot.nationality, snapshot.countryOfResidence, snapshot.city,
    ),
    football: allFilled(
      snapshot.primaryPosition, snapshot.preferredFoot, snapshot.heightCm,
      snapshot.currentClub, snapshot.league,
    ),
    preferences: allFilled(
      snapshot.careerSummary, snapshot.preferredCountries, snapshot.availability,
    ),
    passport: documents.has('PASSPORT_ID'),
    cv: documents.has('PLAYER_CV'),
    contract: documents.has('CLUB_CONTRACT'),
    // Any one credible video link satisfies this.
    highlights: filled(snapshot.highlightsUrl) || filled(snapshot.youtubeUrl) || filled(snapshot.transfermarktUrl),
    photo: documents.has('PHOTO'),
  };

  return (Object.keys(WEIGHTS) as ChecklistKey[]).map((key) => ({
    key,
    labelKey: LABELS[key],
    weight: WEIGHTS[key],
    done: done[key],
    href: HREFS[key],
  }));
}

export function completionPercent(snapshot: CompletionSnapshot): number {
  const items = evaluateChecklist(snapshot);
  const earned = items.reduce((sum, item) => sum + (item.done ? item.weight : 0), 0);
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  return Math.round((earned / total) * 100);
}

/** The single item to put in front of the user next: heaviest unfinished. */
export function nextStep(snapshot: CompletionSnapshot): ChecklistItem | null {
  const outstanding = evaluateChecklist(snapshot).filter((item) => !item.done);
  if (outstanding.length === 0) return null;
  return outstanding.reduce((best, item) => (item.weight > best.weight ? item : best));
}
