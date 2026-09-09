import { getFormatter, getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/modules/auth/session';
import { listConversations } from '@/modules/messaging/service';
import { Card, SectionTitle, Pill } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * A client's own inbox always has exactly one thread (see portal/messages),
 * so it redirects straight in. Staff can be on several — one per assigned
 * client — so this stays a list. There is no "every conversation in the
 * system" view: listConversations only returns threads this staff member is
 * actually a participant of (see the module's own comment on why).
 */
export default async function AdminMessages() {
  const session = await getSessionUser();
  if (!session) return null;

  const t = await getTranslations('admin');
  const tm = await getTranslations('messages');
  const format = await getFormatter();
  const conversations = await listConversations(session);

  return (
    <div className="grid gap-6">
      <SectionTitle>{t('messages')}</SectionTitle>

      {conversations.length === 0 ? (
        <Card><p className="text-sm text-ink-muted">{tm('empty')}</p></Card>
      ) : (
        <ul className="grid gap-2">
          {conversations.map((conversation) => {
            const other = conversation.participants.find((p) => p.userId !== session.userId);
            const last = conversation.messages[0];
            return (
              <Card as="li" key={conversation.id}>
                <a href={`/admin/messages/${conversation.id}`} className="block">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="font-display text-sm font-bold text-ink">
                      {conversation.subject ?? other?.user.email ?? tm('team')}
                    </span>
                    <span className="flex items-center gap-3 text-xs text-ink-faint">
                      {format.relativeTime(conversation.lastMessageAt)}
                      {conversation.unread && <Pill tone="positive">{tm('unread')}</Pill>}
                    </span>
                  </div>
                  {last && <p className="mt-2 line-clamp-1 text-xs text-ink-muted">{last.body}</p>}
                </a>
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}
