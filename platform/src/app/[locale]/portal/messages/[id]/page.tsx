import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { getSessionUser } from '@/modules/auth/session';
import { getConversation } from '@/modules/messaging/service';
import { Card, SectionTitle } from '@/components/ui';
import { MessageComposer } from '@/components/portal/MessageComposer';

export const dynamic = 'force-dynamic';

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale as AppLocale);

  const session = await getSessionUser();
  if (!session) return null;

  const conversation = await getConversation(session, id);
  if (!conversation) notFound();

  const t = await getTranslations('messages');
  const format = await getFormatter();

  return (
    <div className="grid gap-6">
      <SectionTitle>{conversation.subject ?? t('team')}</SectionTitle>

      <ul className="grid gap-3">
        {conversation.messages.map((message) => {
          const mine = message.senderUserId === session.userId;
          return (
            <li key={message.id} className={mine ? 'justify-self-end' : 'justify-self-start'}>
              <Card className={`max-w-[62ch] ${mine ? 'border-emerald/30 bg-emerald/[0.06]' : ''}`}>
                <p className="font-display text-[9.5px] font-bold uppercase tracking-[0.18em] text-ink-faint">
                  {mine ? t('you') : t('team')} · {format.dateTime(message.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
                </p>
                <p className="mt-2 whitespace-pre-line text-sm text-ink">{message.body}</p>
                {message.attachments.length > 0 && (
                  <ul className="mt-3 grid gap-1 text-xs text-ink-muted">
                    {message.attachments.map((attachment) => (
                      <li key={attachment.document.id}>{attachment.document.name}</li>
                    ))}
                  </ul>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      <MessageComposer conversationId={conversation.id} />
    </div>
  );
}
