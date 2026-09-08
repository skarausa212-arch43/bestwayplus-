import { redirect } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';
import { getSessionUser } from '@/modules/auth/session';
import { listConversations, ensureStaffConversation } from '@/modules/messaging/service';
import { Card, SectionTitle, Pill } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function MessagesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as AppLocale);

  const session = await getSessionUser();
  if (!session) return null;

  const t = await getTranslations('messages');
  const format = await getFormatter();
  const conversations = await listConversations(session);

  // A client has exactly one thread with the team, so land them in it rather
  // than showing a list of one.
  if (conversations.length === 0) {
    const created = await ensureStaffConversation(session);
    redirect(`/${locale}/portal/messages/${created.id}`);
  }

  return (
    <div className="grid gap-6">
      <SectionTitle>{t('title')}</SectionTitle>
      <ul className="grid gap-2">
        {conversations.map((conversation) => (
          <Card as="li" key={conversation.id}>
            <Link href={`/portal/messages/${conversation.id}`} className="block">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-display text-sm font-bold text-ink">
                  {conversation.subject ?? t('team')}
                </span>
                <span className="flex items-center gap-3 text-xs text-ink-faint">
                  {format.relativeTime(conversation.lastMessageAt)}
                  {conversation.unread && <Pill tone="positive">{t('unread')}</Pill>}
                </span>
              </div>
              {conversation.messages[0] && (
                <p className="mt-2 line-clamp-1 text-xs text-ink-muted">{conversation.messages[0].body}</p>
              )}
            </Link>
          </Card>
        ))}
      </ul>
    </div>
  );
}
