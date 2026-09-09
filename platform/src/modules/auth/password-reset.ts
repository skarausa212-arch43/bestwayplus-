import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/crypto';
import { issueAuthToken, consumeAuthToken } from '@/modules/auth/tokens';
import { revokeAllSessions } from '@/modules/auth/session';
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

/**
 * Always resolves, whether or not the email belongs to an account — the
 * caller must show the same "check your inbox" message either way, or the
 * endpoint becomes an account-existence oracle.
 */
export async function requestPasswordReset(
  email: string,
  ctx: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, locale: true, status: true },
  });
  if (!user || user.status === 'SUSPENDED' || user.status === 'DELETED') return;

  const token = await issueAuthToken(user.id, 'PASSWORD_RESET');
  const locale = fromPrismaLocale(user.locale);
  const rendered = renderEmail('passwordReset', locale, EMAIL_CATALOGS[locale], {
    name: user.email,
    appUrl: process.env.APP_URL ?? 'https://bestwayfootball.pl',
    path: `/reset-password?token=${token}`,
  });
  await sendEmail({ to: user.email, subject: rendered.subject, text: rendered.text, html: rendered.html });
  await recordActivity({ subjectUserId: user.id, action: 'PASSWORD_RESET_REQUESTED', ctx });
}

export type ResetPasswordResult = 'ok' | 'invalidToken';

export async function resetPassword(
  token: string,
  newPassword: string,
  ctx: { ip?: string | null; userAgent?: string | null },
): Promise<ResetPasswordResult> {
  const consumed = await consumeAuthToken(token, 'PASSWORD_RESET');
  if (!consumed) return 'invalidToken';

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: consumed.userId }, data: { passwordHash } });
  await revokeAllSessions(consumed.userId);
  await recordActivity({ subjectUserId: consumed.userId, action: 'PASSWORD_RESET_COMPLETED', ctx });

  return 'ok';
}
