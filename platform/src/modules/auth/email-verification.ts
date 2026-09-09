import { prisma } from '@/lib/db';
import { issueAuthToken, consumeAuthToken } from '@/modules/auth/tokens';
import { recordActivity } from '@/modules/activity/service';
import { renderEmail } from '@/modules/email/templates';
import { sendEmail } from '@/modules/email/send';
import { fromPrismaLocale, type AppLocale } from '@/i18n/routing';
import enEmails from '@/messages/en/emails.json';
import plEmails from '@/messages/pl/emails.json';
import ruEmails from '@/messages/ru/emails.json';

const EMAIL_CATALOGS: Record<AppLocale, Record<string, string>> = {
  en: enEmails, pl: plEmails, ru: ruEmails,
};

/** Fires on registration, and again from Settings if the user asks to resend. */
export async function sendVerificationEmail(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, locale: true, emailVerifiedAt: true, status: true },
  });
  if (!user || user.emailVerifiedAt || user.status === 'DELETED') return;

  const token = await issueAuthToken(user.id, 'EMAIL_VERIFICATION');
  const locale = fromPrismaLocale(user.locale);
  const rendered = renderEmail('verifyEmail', locale, EMAIL_CATALOGS[locale], {
    name: user.email,
    appUrl: process.env.APP_URL ?? 'https://bestwayfootball.pl',
    path: `/verify-email?token=${token}`,
  });
  await sendEmail({ to: user.email, subject: rendered.subject, text: rendered.text, html: rendered.html });
}

export type VerifyEmailResult = 'ok' | 'invalidToken';

export async function verifyEmail(
  token: string,
  ctx: { ip?: string | null; userAgent?: string | null },
): Promise<VerifyEmailResult> {
  const consumed = await consumeAuthToken(token, 'EMAIL_VERIFICATION');
  if (!consumed) return 'invalidToken';

  const user = await prisma.user.findUnique({ where: { id: consumed.userId }, select: { status: true } });
  await prisma.user.update({
    where: { id: consumed.userId },
    data: {
      emailVerifiedAt: new Date(),
      // Only advances the freshly-registered state — never demotes an
      // account a staff member has since suspended or deleted.
      status: user?.status === 'PENDING_EMAIL' ? 'ACTIVE' : undefined,
    },
  });
  await recordActivity({ subjectUserId: consumed.userId, action: 'EMAIL_VERIFIED', ctx });

  return 'ok';
}
