import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/crypto';
import { registration } from '@/modules/auth/schemas';
import { recordConsent } from '@/modules/consent/service';
import { createSession, requestContext } from '@/modules/auth/session';
import { recordActivity } from '@/modules/activity/service';
import { sendVerificationEmail } from '@/modules/auth/email-verification';
import { toPrismaLocale, type AppLocale } from '@/i18n/routing';
import { rateLimit, LIMITS } from '@/lib/rate-limit';
import type { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * One row per role in the account+profile table, so the handler stays a
 * straight switch rather than a pile of role-specific branches further down.
 * Each entry knows only how to build its own profile create() input from the
 * validated body — everything role-agnostic (user, consents, session) is
 * handled once, below.
 */
function buildProfileCreate(data: Extract<import('@/modules/auth/schemas').Registration, { role: string }>) {
  switch (data.role) {
    case 'PLAYER':
      return {
        playerProfile: {
          create: {
            firstName: data.firstName,
            lastName: data.lastName,
            dateOfBirth: new Date(`${data.dateOfBirth}T00:00:00Z`),
            nationality: data.nationality,
            secondNationality: data.secondNationality || null,
            countryOfResidence: data.countryOfResidence || null,
            city: data.city || null,
            currentClub: data.currentClub || null,
            primaryPosition: data.primaryPosition || null,
            secondaryPosition: data.secondaryPosition || null,
            preferredFoot: data.preferredFoot ?? null,
            heightCm: data.heightCm ?? null,
            weightKg: data.weightKg ?? null,
            contractUntil: data.contractUntil ? new Date(`${data.contractUntil}T00:00:00Z`) : null,
            league: data.league || null,
            transfermarktUrl: data.transfermarktUrl || null,
            youtubeUrl: data.youtubeUrl || null,
            highlightsUrl: data.highlightsUrl || null,
            instagramUrl: data.instagramUrl || null,
            careerSummary: data.careerSummary || null,
            careerGoals: data.careerGoals || null,
            hasAgent: data.hasAgent,
            agentName: data.agentName || null,
            agentAgency: data.agentAgency || null,
            agentContact: data.agentContact || null,
          },
        },
      };
    case 'AGENT':
      // fifaLicenceNumber is self-entered: it never sets verificationStatus.
      // Only an administrator moves an agent to VERIFIED — see the schema
      // default (NOT_SUBMITTED) and modules/admin/verification.
      return {
        agentProfile: {
          create: {
            firstName: data.firstName,
            lastName: data.lastName,
            nationality: data.nationality || null,
            country: data.country,
            fifaLicenceNumber: data.fifaLicenceNumber || null,
            agencyName: data.agencyName || null,
            website: data.website || null,
            markets: data.markets,
            countries: data.countries,
            leagues: data.leagues,
            languages: data.languages,
            specialisations: data.specialisations,
            bio: data.bio || null,
          },
        },
      };
    case 'SCOUT':
      return {
        scoutProfile: {
          create: {
            firstName: data.firstName,
            lastName: data.lastName,
            country: data.country,
            markets: data.markets,
            leagues: data.leagues,
            languages: data.languages,
            experienceYears: data.experienceYears ?? null,
            bio: data.bio || null,
          },
        },
      };
    case 'CLUB':
      return {
        clubProfile: {
          create: {
            clubName: data.clubName,
            country: data.country,
            league: data.league || null,
            roleTitle: data.roleTitle || null,
            firstName: data.firstName,
            lastName: data.lastName,
            businessEmail: data.businessEmail,
            website: data.website || null,
          },
        },
      };
    case 'INVESTOR':
      return {
        investorProfile: {
          create: {
            entityType: data.entityType,
            displayName: data.displayName,
            company: data.company || null,
            country: data.country,
            businessArea: data.businessArea || null,
            investmentInterests: data.investmentInterests || null,
            footballInterests: data.footballInterests || null,
            investmentRange: data.investmentRange || null,
            professionalBackground: data.professionalBackground || null,
          },
        },
      };
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: 'validation.required' }, { status: 400 });
  }

  const parsed = registration.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_form';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return NextResponse.json({ ok: false, fieldErrors }, { status: 422 });
  }

  const data = parsed.data;
  const ctx = await requestContext();

  const limit = await rateLimit(`register:${ctx.ip ?? 'unknown'}`, LIMITS.register);
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: 'validation.tooManyAttempts' }, { status: 429 });
  }

  // Password strength is checked by schema length only; uniqueness needs the
  // database and can't live in a synchronous zod refinement.
  const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existing) {
    return NextResponse.json(
      { ok: false, fieldErrors: { email: 'validation.emailTaken' } },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(data.password);
  const profileCreate = buildProfileCreate(data);

  let userId: string;
  try {
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        phone: data.phone || null,
        locale: toPrismaLocale(data.locale),
        role: data.role as Role,
        ...profileCreate,
      },
      select: { id: true },
    });
    userId = user.id;
  } catch (error) {
    // A race on the uniqueness check above — two requests for the same email
    // landing between the read and the write — surfaces here as P2002.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { ok: false, fieldErrors: { email: 'validation.emailTaken' } },
        { status: 409 },
      );
    }
    throw error;
  }

  // Required and optional consent are recorded as separate rows with their
  // own granted value — never merged into one "agreed" flag, so withdrawing
  // marketing later never touches the terms/privacy grant.
  await recordConsent({ userId, type: 'TERMS', granted: true, locale: data.locale, ctx });
  await recordConsent({ userId, type: 'PRIVACY', granted: true, locale: data.locale, ctx });
  await recordConsent({
    userId, type: 'PROFILE_SHARING', granted: data.consents.profileSharing, locale: data.locale, ctx,
  });
  await recordConsent({
    userId, type: 'MARKETING', granted: data.consents.marketing, locale: data.locale, ctx,
  });

  await recordActivity({
    actorUserId: userId,
    subjectUserId: userId,
    action: 'ACCOUNT_REGISTERED',
    metadata: { role: data.role },
    ctx,
  });

  await createSession(userId, { ip: ctx.ip ?? undefined, userAgent: ctx.userAgent ?? undefined });
  await sendVerificationEmail(userId);

  return NextResponse.json({ ok: true });
}
