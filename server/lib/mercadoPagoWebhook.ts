import crypto from 'node:crypto';

export function verifyMercadoPagoWebhook(input: {
  dataId: string;
  requestId: string;
  signature: string;
  secret: string;
  nowMs?: number;
}): boolean {
  const entries = Object.fromEntries(input.signature.split(',').map((part) => part.trim().split('=', 2)));
  const timestamp = Number(entries.ts);
  if (!Number.isInteger(timestamp) || Math.abs((input.nowMs ?? Date.now()) - timestamp * 1000) > 5 * 60 * 1000) return false;
  if (!/^[a-f0-9]{64}$/i.test(entries.v1 ?? '')) return false;
  const expected = crypto.createHmac('sha256', input.secret)
    .update(`id:${input.dataId.toLowerCase()};request-id:${input.requestId};ts:${entries.ts};`)
    .digest();
  return crypto.timingSafeEqual(expected, Buffer.from(entries.v1, 'hex'));
}
