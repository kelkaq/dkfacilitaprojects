import assert from 'node:assert/strict';
import { sendTransactionalEmail, transactionalEmailConfigured } from '../server/services/transactionalEmail.ts';

const names = ['EMAIL_PROVIDER', 'EMAIL_FROM', 'BREVO_API_KEY', 'RESEND_API_KEY'] as const;
const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
const nativeFetch = globalThis.fetch;
const calls: Array<{ url: string; init: RequestInit }> = [];
try {
  process.env.EMAIL_PROVIDER = 'BREVO';
  process.env.EMAIL_FROM = 'DK Facilita <contato@example.invalid>';
  process.env.BREVO_API_KEY = 'test-brevo-key';
  delete process.env.RESEND_API_KEY;
  globalThis.fetch = (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ messageId: 'synthetic-email' }), { status: 201 });
  }) as typeof fetch;
  assert.equal(transactionalEmailConfigured(), true);
  await sendTransactionalEmail({ to: 'person@example.invalid', subject: 'Smoke test', text: 'Synthetic test body', idempotencyKey: 'smoke/1' });
  assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(new Headers(calls[0].init.headers).get('api-key'), 'test-brevo-key');
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body.sender, { email: 'contato@example.invalid', name: 'DK Facilita' });
  assert.deepEqual(body.to, [{ email: 'person@example.invalid' }]);
  assert.equal(body.textContent, 'Synthetic test body');
  console.log('PASS: Brevo adapter maps sender, recipient, body and idempotency without sending a real email.');
} finally {
  globalThis.fetch = nativeFetch;
  for (const name of names) if (original[name] === undefined) delete process.env[name]; else process.env[name] = original[name];
}
