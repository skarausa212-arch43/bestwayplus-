/**
 * What a share link may expose, expressed as data so it can be tested without
 * a database — the same pattern as the opportunity projection.
 *
 * Nothing is included by default. A section that is not explicitly enabled is
 * not merely hidden in the template; the fields are never read.
 */
export const SHARE_SECTIONS = ['identity', 'football', 'career', 'links'] as const;
export type ShareSection = (typeof SHARE_SECTIONS)[number];
export type ShareSections = Record<ShareSection, boolean>;

export const SECTION_FIELDS: Record<ShareSection, readonly string[]> = {
  identity: ['firstName', 'lastName', 'dateOfBirth', 'nationality', 'secondNationality', 'countryOfResidence'],
  football: ['primaryPosition', 'secondaryPosition', 'preferredFoot', 'heightCm', 'weightKg',
             'currentClub', 'league', 'contractUntil', 'nationalTeamExperience', 'professionalExperience'],
  career: ['careerSummary', 'careerGoals', 'availability', 'preferredCountries', 'preferredLeagues'],
  links: ['transfermarktUrl', 'youtubeUrl', 'highlightsUrl', 'instagramUrl'],
};

/**
 * Fields that must never appear in a shared view under any section, because
 * they are either the player's private business or ours.
 */
export const NEVER_SHARED = [
  'salaryMin', 'salaryMax', 'salaryCurrency',
  'agentName', 'agentAgency', 'agentContact', 'representationUntil',
  'completionPercent', 'userId', 'city',
  'internalRating', 'potential', 'marketability', 'reliability', 'comments',
] as const;

export function normaliseSections(input: unknown): ShareSections {
  const source = (input ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    SHARE_SECTIONS.map((section) => [section, source[section] === true]),
  ) as ShareSections;
}

/** Builds the field allow-list for the sections actually enabled on a link. */
export function allowedFields(sections: ShareSections): string[] {
  const fields = SHARE_SECTIONS
    .filter((section) => sections[section])
    .flatMap((section) => SECTION_FIELDS[section]);
  // Belt and braces: strip anything on the never-shared list even if a future
  // edit adds it to a section by mistake.
  const banned = new Set<string>(NEVER_SHARED);
  return fields.filter((field) => !banned.has(field));
}

/** Projects a profile down to the allow-list. Unknown keys are dropped. */
export function projectProfile<T extends Record<string, unknown>>(
  profile: T,
  sections: ShareSections,
): Partial<T> {
  const allowed = new Set(allowedFields(sections));
  return Object.fromEntries(
    Object.entries(profile).filter(([key]) => allowed.has(key)),
  ) as Partial<T>;
}
