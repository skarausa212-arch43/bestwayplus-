import nodemailer, { type Transporter } from 'nodemailer';

let transporter: Transporter | null = null;

/**
 * The relay is Postfix on this same box, bound to 127.0.0.1:25 only — see
 * deploy/lumi24-setup-mail.sh. No SMTP credentials to hold or leak: nothing
 * outside this machine can reach that port at all, so an unauthenticated
 * local connection is the whole trust boundary, not a shortcut around one.
 *
 * Postfix's own queue is the retry mechanism (it holds and retries a
 * message against the recipient's real mail server for days on transient
 * failure) — there is deliberately no BullMQ job wrapping this call. That
 * would just be a second, redundant queue in front of one Postfix already
 * provides, on a box with 545MB of headroom to spare for it.
 */
function getTransporter(): Transporter {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || '127.0.0.1',
    port: Number(process.env.SMTP_PORT) || 25,
    secure: false,
  });
  return transporter;
}

export async function sendEmail(input: { to: string; subject: string; text: string; html: string }): Promise<void> {
  try {
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || 'Bestway Football <no-reply@bestwayfootball.pl>',
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  } catch (error) {
    // A mail relay hiccup must never fail the action that triggered the
    // email — a document approval or a task assignment still has to
    // succeed even when the message itself doesn't go out.
    console.error('[email] send failed', error);
  }
}
