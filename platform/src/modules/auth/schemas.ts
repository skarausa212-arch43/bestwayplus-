import { z } from 'zod';
import { locales } from '@/i18n/routing';

/**
 * One schema per role, shared by the client form and the route handler.
 *
 * Messages are i18n keys, never English sentences — the server sends the key
 * and the client renders it in the reader's language.
 */

const email = z.string().trim().toLowerCase().email('validation.email').max(254);
const password = z.string().min(12, 'validation.passwordShort').max(200);
const phone = z.string().trim().min(6, 'validation.phone').max(32).optional().or(z.literal(''));
const shortText = z.string().trim().max(120);
const longText = z.string().trim().max(4000);
const url = z.string().trim().url('validation.url').max(500).optional().or(z.literal(''));

const MIN_AGE_YEARS = 16;

const dateOfBirth = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.dateInvalid')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now();
  }, 'validation.dobFuture')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    const cutoff = new Date();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - MIN_AGE_YEARS);
    return date.getTime() <= cutoff.getTime();
  }, 'validation.dobTooYoung');

/** Required consents are literal true — an unticked box must fail validation. */
export const consentBlock = z.object({
  terms: z.literal(true, { errorMap: () => ({ message: 'validation.consentRequired' }) }),
  privacy: z.literal(true, { errorMap: () => ({ message: 'validation.consentRequired' }) }),
  profileSharing: z.boolean().default(false),
  marketing: z.boolean().default(false),
});

export const accountBlock = z.object({
  email,
  password,
  phone,
  locale: z.enum(locales),
});

export const playerRegistration = accountBlock.extend({
  role: z.literal('PLAYER'),
  firstName: shortText.min(1, 'validation.required'),
  lastName: shortText.min(1, 'validation.required'),
  dateOfBirth,
  nationality: shortText.min(1, 'validation.required'),
  secondNationality: shortText.optional(),
  countryOfResidence: shortText.optional(),
  city: shortText.optional(),
  currentClub: shortText.optional(),
  primaryPosition: shortText.optional(),
  secondaryPosition: shortText.optional(),
  preferredFoot: z.enum(['LEFT', 'RIGHT', 'BOTH']).optional(),
  heightCm: z.number().int().min(120, 'validation.numberRange').max(230).optional(),
  weightKg: z.number().int().min(40, 'validation.numberRange').max(150).optional(),
  contractUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.dateInvalid').optional(),
  league: shortText.optional(),
  transfermarktUrl: url,
  youtubeUrl: url,
  highlightsUrl: url,
  instagramUrl: url,
  careerSummary: longText.optional(),
  careerGoals: longText.optional(),
  hasAgent: z.boolean().default(false),
  agentName: shortText.optional(),
  agentAgency: shortText.optional(),
  agentContact: shortText.optional(),
  consents: consentBlock,
});

export const agentRegistration = accountBlock.extend({
  role: z.literal('AGENT'),
  firstName: shortText.min(1, 'validation.required'),
  lastName: shortText.min(1, 'validation.required'),
  nationality: shortText.optional(),
  country: shortText.min(1, 'validation.required'),
  // Submitting a licence number sets PENDING. Only staff move it to VERIFIED —
  // the platform must never display a self-asserted licence as confirmed.
  fifaLicenceNumber: shortText.optional(),
  agencyName: shortText.optional(),
  website: url,
  markets: z.array(shortText).max(40).default([]),
  countries: z.array(shortText).max(40).default([]),
  leagues: z.array(shortText).max(40).default([]),
  languages: z.array(shortText).max(20).default([]),
  specialisations: z.array(shortText).max(20).default([]),
  bio: longText.optional(),
  consents: consentBlock,
});

export const scoutRegistration = accountBlock.extend({
  role: z.literal('SCOUT'),
  firstName: shortText.min(1, 'validation.required'),
  lastName: shortText.min(1, 'validation.required'),
  country: shortText.min(1, 'validation.required'),
  markets: z.array(shortText).max(40).default([]),
  leagues: z.array(shortText).max(40).default([]),
  languages: z.array(shortText).max(20).default([]),
  experienceYears: z.number().int().min(0).max(70).optional(),
  bio: longText.optional(),
  consents: consentBlock,
});

export const clubRegistration = accountBlock.extend({
  role: z.literal('CLUB'),
  clubName: shortText.min(1, 'validation.required'),
  country: shortText.min(1, 'validation.required'),
  league: shortText.optional(),
  roleTitle: shortText.optional(),
  firstName: shortText.min(1, 'validation.required'),
  lastName: shortText.min(1, 'validation.required'),
  businessEmail: email,
  website: url,
  consents: consentBlock,
});

export const investorRegistration = accountBlock.extend({
  role: z.literal('INVESTOR'),
  entityType: z.enum(['INDIVIDUAL', 'COMPANY']),
  displayName: shortText.min(1, 'validation.required'),
  company: shortText.optional(),
  country: shortText.min(1, 'validation.required'),
  businessArea: shortText.optional(),
  investmentInterests: longText.optional(),
  footballInterests: longText.optional(),
  investmentRange: shortText.optional(),
  professionalBackground: longText.optional(),
  consents: consentBlock,
});

export const registration = z.discriminatedUnion('role', [
  playerRegistration, agentRegistration, scoutRegistration, clubRegistration, investorRegistration,
]);

export type Registration = z.infer<typeof registration>;

export const signIn = z.object({
  email,
  password: z.string().min(1, 'validation.required'),
  totp: z.string().regex(/^\d{6}$/).optional(),
});

export const forgotPassword = z.object({ email });

export const resetPassword = z.object({
  token: z.string().min(20, 'validation.required'),
  password,
});

export const verifyEmailToken = z.object({
  token: z.string().min(20, 'validation.required'),
});

export const uploadIntent = z.object({
  ownerUserId: z.string().uuid().optional(),
  type: z.enum([
    'PASSPORT_ID', 'PLAYER_CV', 'CLUB_CONTRACT', 'REPRESENTATION_AGREEMENT', 'MEDICAL',
    'STATISTICS', 'TRANSFER_DOCUMENT', 'VISA', 'RESIDENCE_PERMIT', 'INSURANCE',
    'BANK_DETAILS', 'FINANCIAL', 'FIFA_LICENCE', 'COMPANY_DOCUMENT', 'PLAYER_MANDATE',
    'PHOTO', 'OTHER',
  ]),
  name: z.string().trim().min(1).max(180),
  mimeType: z.string().min(3).max(120),
  sizeBytes: z.number().int().positive(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  userComment: z.string().trim().max(1000).optional(),
});
