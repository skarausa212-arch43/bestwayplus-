export type FieldType = 'text' | 'email' | 'password' | 'date' | 'number' | 'textarea' | 'select' | 'checkbox' | 'list';

export interface RegField {
  name: string;
  labelKey: string; // key into the `forms` namespace
  type: FieldType;
  required?: boolean;
  options?: Array<{ value: string; labelKey: string }>;
}

export interface RegSection {
  id: string;
  titleKey: string; // key into the `forms` namespace
  fields: RegField[];
}

export const ROLE_SLUGS = ['player', 'agent', 'scout', 'club', 'investor'] as const;
export type RoleSlug = (typeof ROLE_SLUGS)[number];

export const SLUG_TO_ROLE: Record<RoleSlug, 'PLAYER' | 'AGENT' | 'SCOUT' | 'CLUB' | 'INVESTOR'> = {
  player: 'PLAYER', agent: 'AGENT', scout: 'SCOUT', club: 'CLUB', investor: 'INVESTOR',
};

/**
 * Fields shared by every role. Rendered first, under its own "Account"
 * section — locale is not asked here, it's taken from the page the person
 * is already on.
 */
export const ACCOUNT_FIELDS: RegField[] = [
  { name: 'email', labelKey: 'email', type: 'email', required: true },
  { name: 'password', labelKey: 'password', type: 'password', required: true },
  { name: 'phone', labelKey: 'phone', type: 'text' },
];

const FOOT_OPTIONS = [
  { value: 'LEFT', labelKey: 'footLeft' },
  { value: 'RIGHT', labelKey: 'footRight' },
  { value: 'BOTH', labelKey: 'footBoth' },
];

/**
 * One entry per role. Sections mirror the ones already used in the portal's
 * own profile form (sectionPersonal, sectionFootball, ...), so a player
 * filling this in once sees the same grouping again when editing later.
 */
export const ROLE_SECTIONS: Record<RoleSlug, RegSection[]> = {
  player: [
    {
      id: 'personal', titleKey: 'sectionPersonal',
      fields: [
        { name: 'firstName', labelKey: 'firstName', type: 'text', required: true },
        { name: 'lastName', labelKey: 'lastName', type: 'text', required: true },
        { name: 'dateOfBirth', labelKey: 'dateOfBirth', type: 'date', required: true },
        { name: 'nationality', labelKey: 'nationality', type: 'text', required: true },
        { name: 'secondNationality', labelKey: 'secondNationality', type: 'text' },
        { name: 'countryOfResidence', labelKey: 'countryOfResidence', type: 'text' },
        { name: 'city', labelKey: 'city', type: 'text' },
      ],
    },
    {
      id: 'football', titleKey: 'sectionFootball',
      fields: [
        { name: 'currentClub', labelKey: 'currentClub', type: 'text' },
        { name: 'primaryPosition', labelKey: 'primaryPosition', type: 'text' },
        { name: 'secondaryPosition', labelKey: 'secondaryPosition', type: 'text' },
        { name: 'preferredFoot', labelKey: 'preferredFoot', type: 'select', options: FOOT_OPTIONS },
        { name: 'heightCm', labelKey: 'height', type: 'number' },
        { name: 'weightKg', labelKey: 'weight', type: 'number' },
        { name: 'league', labelKey: 'league', type: 'text' },
        { name: 'contractUntil', labelKey: 'contractUntil', type: 'date' },
      ],
    },
    {
      id: 'career', titleKey: 'sectionCareer',
      fields: [
        { name: 'careerSummary', labelKey: 'careerSummary', type: 'textarea' },
        { name: 'careerGoals', labelKey: 'careerGoals', type: 'textarea' },
      ],
    },
    {
      id: 'links', titleKey: 'sectionLinks',
      fields: [
        { name: 'transfermarktUrl', labelKey: 'transfermarktUrl', type: 'text' },
        { name: 'youtubeUrl', labelKey: 'youtubeUrl', type: 'text' },
        { name: 'highlightsUrl', labelKey: 'highlightsUrl', type: 'text' },
        { name: 'instagramUrl', labelKey: 'instagramUrl', type: 'text' },
      ],
    },
    {
      id: 'representation', titleKey: 'sectionRepresentation',
      fields: [
        { name: 'hasAgent', labelKey: 'hasAgent', type: 'checkbox' },
        { name: 'agentName', labelKey: 'agentName', type: 'text' },
        { name: 'agentAgency', labelKey: 'agentAgency', type: 'text' },
        { name: 'agentContact', labelKey: 'agentContact', type: 'text' },
      ],
    },
  ],
  agent: [
    {
      id: 'personal', titleKey: 'sectionPersonal',
      fields: [
        { name: 'firstName', labelKey: 'firstName', type: 'text', required: true },
        { name: 'lastName', labelKey: 'lastName', type: 'text', required: true },
        { name: 'nationality', labelKey: 'nationality', type: 'text' },
        { name: 'country', labelKey: 'country', type: 'text', required: true },
      ],
    },
    {
      id: 'agency', titleKey: 'sectionCareer',
      fields: [
        { name: 'fifaLicenceNumber', labelKey: 'fifaLicence', type: 'text' },
        { name: 'agencyName', labelKey: 'agencyName', type: 'text' },
        { name: 'website', labelKey: 'website', type: 'text' },
        { name: 'markets', labelKey: 'markets', type: 'list' },
        { name: 'countries', labelKey: 'countries', type: 'list' },
        { name: 'leagues', labelKey: 'preferredLeagues', type: 'list' },
        { name: 'languages', labelKey: 'languages', type: 'list' },
        { name: 'specialisations', labelKey: 'specialisations', type: 'list' },
        { name: 'bio', labelKey: 'bio', type: 'textarea' },
      ],
    },
  ],
  scout: [
    {
      id: 'personal', titleKey: 'sectionPersonal',
      fields: [
        { name: 'firstName', labelKey: 'firstName', type: 'text', required: true },
        { name: 'lastName', labelKey: 'lastName', type: 'text', required: true },
        { name: 'country', labelKey: 'country', type: 'text', required: true },
      ],
    },
    {
      id: 'scouting', titleKey: 'sectionCareer',
      fields: [
        { name: 'markets', labelKey: 'markets', type: 'list' },
        { name: 'leagues', labelKey: 'preferredLeagues', type: 'list' },
        { name: 'languages', labelKey: 'languages', type: 'list' },
        { name: 'experienceYears', labelKey: 'experienceYears', type: 'number' },
        { name: 'bio', labelKey: 'bio', type: 'textarea' },
      ],
    },
  ],
  club: [
    {
      id: 'club', titleKey: 'sectionPersonal',
      fields: [
        { name: 'clubName', labelKey: 'clubName', type: 'text', required: true },
        { name: 'country', labelKey: 'country', type: 'text', required: true },
        { name: 'league', labelKey: 'league', type: 'text' },
        { name: 'roleTitle', labelKey: 'roleTitle', type: 'text' },
      ],
    },
    {
      id: 'contact', titleKey: 'sectionCareer',
      fields: [
        { name: 'firstName', labelKey: 'firstName', type: 'text', required: true },
        { name: 'lastName', labelKey: 'lastName', type: 'text', required: true },
        { name: 'businessEmail', labelKey: 'businessEmail', type: 'email', required: true },
        { name: 'website', labelKey: 'website', type: 'text' },
      ],
    },
  ],
  investor: [
    {
      id: 'entity', titleKey: 'sectionPersonal',
      fields: [
        {
          name: 'entityType', labelKey: 'entityType', type: 'select', required: true,
          options: [
            { value: 'INDIVIDUAL', labelKey: 'individual' },
            { value: 'COMPANY', labelKey: 'company' },
          ],
        },
        { name: 'displayName', labelKey: 'displayName', type: 'text', required: true },
        { name: 'company', labelKey: 'company', type: 'text' },
        { name: 'country', labelKey: 'country', type: 'text', required: true },
      ],
    },
    {
      id: 'interests', titleKey: 'sectionCareer',
      fields: [
        { name: 'businessArea', labelKey: 'businessArea', type: 'text' },
        { name: 'investmentRange', labelKey: 'investmentRange', type: 'text' },
        { name: 'investmentInterests', labelKey: 'investmentInterests', type: 'textarea' },
        { name: 'footballInterests', labelKey: 'footballInterests', type: 'textarea' },
        { name: 'professionalBackground', labelKey: 'professionalBackground', type: 'textarea' },
      ],
    },
  ],
};

/** Fields whose value the form must submit as a string[], not a string. */
export const LIST_FIELDS = new Set(
  Object.values(ROLE_SECTIONS)
    .flat()
    .flatMap((section) => section.fields)
    .filter((field) => field.type === 'list')
    .map((field) => field.name),
);

export function isRoleSlug(value: string): value is RoleSlug {
  return (ROLE_SLUGS as readonly string[]).includes(value);
}
