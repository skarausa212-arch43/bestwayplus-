import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/modules/auth/session';
import { getConversation } from '@/modules/messaging/service';
import { Card, SectionTitle } from '@/components/ui';
import { MessageComposer } from '@/components/portal/MessageComposer';

export const dynamic = 'force-dynamic';

export default async function AdminConversation({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return null;

  const { id } = await params;
  const conversation = await getConversation(session, id);
  if (!conversation) notFound();

  const tm = await getTranslations('messages');
  const format = await getFormatter();
  const other = conversation.participants.find((p) => p.userId !== session.userId);

  return (
    <div className="grid gap-6">
      <SectionTitle>{conversation.subject ?? other?.user.email ?? tm('team')}</SectionTitle>

      <ul className="grid gap-3">
        {conversation.messages.map((message) => {
          const mine = message.senderUserId === session.userId;
          return (
            <li key={message.id} className={mine ? 'justify-self-end' : 'justify-self-start'}>
              <Card className={`max-w-[62ch] ${mine ? 'border-emerald/30 bg-emerald/[0.06]' : ''}`}>
                <p className="font-display text-[9.5px] font-bold uppercase tracking-[0.18em] text-ink-faint">
                  {mine ? tm('you') : message.sender.email} · {format.dateTime(message.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
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
