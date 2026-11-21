type TransactionalEmail = { to: string; subject: string; text: string; idempotencyKey?: string };

function provider(): 'BREVO' | 'RESEND' | null {
  const configured = process.env.EMAIL_PROVIDER?.trim().toUpperCase();
  if (configured === 'BREVO' && process.env.BREVO_API_KEY && process.env.EMAIL_FROM) return 'BREVO';
  if (configured === 'RESEND' && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return 'RESEND';
  // Smoke tests and older deployments set only the Resend key.
  if (!configured && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return 'RESEND';
  return null;
}

export function transactionalEmailConfigured(): boolean {
  return Boolean(provider());
}

function sender(from: string): { email: string; name?: string } {
  const match = from.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  if (match) return { email: match[2].trim(), ...(match[1] ? { name: match[1].trim() } : {}) };
  return { email: from.trim() };
}

export async function sendTransactionalEmail(message: TransactionalEmail): Promise<void> {
  const selected = provider();
  const from = process.env.EMAIL_FROM;
  if (!selected || !from) throw new Error('EMAIL_PROVIDER_NOT_CONFIGURED');
  const controller = AbortSignal.timeout(12_000);
  const response = selected === 'BREVO'
    ? await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', signal: controller,
      headers: { 'api-key': process.env.BREVO_API_KEY!, 'Content-Type': 'application/json', accept: 'application/json',
        ...(message.idempotencyKey ? { 'Idempotency-Key': message.idempotencyKey } : {}) },
      body: JSON.stringify({ sender: sender(from), to: [{ email: message.to }], replyTo: { email: sender(from).email },
        subject: message.subject, textContent: message.text }),
    })
    : await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: controller,
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json',
        ...(message.idempotencyKey ? { 'Idempotency-Key': message.idempotencyKey } : {}) },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
    });
  if (!response.ok) throw new Error(`${selected} HTTP ${response.status}`);
}
