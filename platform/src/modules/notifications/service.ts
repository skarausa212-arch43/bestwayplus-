import { prisma } from '@/lib/db';
import { authorize, type Actor } from '@/modules/rbac/authorize';
import { renderEmail, type TemplateKey } from '@/modules/email/templates';
import { sendEmail } from '@/modules/email/send';
import { fromPrismaLocale, type AppLocale } from '@/i18n/routing';
import enEmails from '@/messages/en/emails.json';
import plEmails from '@/messages/pl/emails.json';
import ruEmails from '@/messages/ru/emails.json';

const EMAIL_CATALOGS: Record<AppLocale, Record<string, string>> = {
  en: enEmails,
  pl: plEmails,
  ru: ruEmails,
};

/**
 * Only the notification types with a pre-built, translated template actually
 * go out as email — the other notify() call sites (verification decisions,
 * task assignment, new messages, stage changes) stay in-app-only, same as
 * before. Inventing subject lines and copy for those here, unreviewed,
 * would be worse than leaving them as they are.
 */
const EMAIL_TEMPLATE_BY_TYPE: Partial<Record<string, TemplateKey>> = {
  'document.requested': 'documentRequested',
  'document.approved': 'documentApproved',
  'opportunity.participantAdded': 'opportunityAssigned',
};

export interface NotifyInput {
  userId: string;
  type: string;
  /** i18n key under the `notifications` namespace. */
  titleKey: string;
  bodyKey?: string;
  payload?: Record<string, unknown>;
  entityType?: string;
  entityId?: string;
  /** Transactional mail is not suppressible; security mail ignores preferences. */
  email?: boolean;
}

/**
 * One emitter. Writes the in-app row now and queues the localised email — the
 * recipient's own `users.locale` decides the language, never the language of
 * the staff member who triggered it.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const recipient = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, locale: true, status: true },
  });
  if (!recipient || recipient.status === 'DELETED') return;

  await prisma.notification.create({
    data: {
      userId: recipient.id,
      type: input.type,
      titleKey: input.titleKey,
      bodyKey: input.bodyKey ?? null,
      payload: (input.payload ?? undefined) as never,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    },
  });

  const templateKey = EMAIL_TEMPLATE_BY_TYPE[input.type];
  if (!templateKey) return;

  const locale = fromPrismaLocale(recipient.locale);
  const rendered = renderEmail(templateKey, locale, EMAIL_CATALOGS[locale], {
    // No display name is stored centrally on User (only on role-specific
    // profiles) — the recipient's own email reads better than a blank
    // "Hello ," and isn't a fabricated value.
    name: recipient.email,
    appUrl: process.env.APP_URL ?? 'https://bestwayfootball.pl',
  });

  await sendEmail({ to: recipient.email, subject: rendered.subject, text: rendered.text, html: rendered.html });
}

export async function listOwn(actor: Actor, { take = 30 }: { take?: number } = {}) {
  authorize(actor, 'activity:readOwn', { ownerUserId: actor.userId });

  return prisma.notification.findMany({
    where: { userId: actor.userId },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true, type: true, titleKey: true, bodyKey: true, payload: true,
      entityType: true, entityId: true, readAt: true, createdAt: true,
    },
  });
}

export async function unreadCount(actor: Actor): Promise<number> {
  return prisma.notification.count({ where: { userId: actor.userId, readAt: null } });
}

export async function markAllRead(actor: Actor): Promise<void> {
  authorize(actor, 'activity:readOwn', { ownerUserId: actor.userId });
  await prisma.notification.updateMany({
    where: { userId: actor.userId, readAt: null },
    data: { readAt: new Date() },
  });
}
