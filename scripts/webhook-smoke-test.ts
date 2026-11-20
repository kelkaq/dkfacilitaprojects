import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { apiRouter } from '../server/routes/apiRoutes.ts';
import { getPrisma } from '../server/lib/prisma.ts';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatória.');
const db = getPrisma();
const secret = crypto.randomBytes(32).toString('hex');
const previousSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
process.env.MERCADO_PAGO_WEBHOOK_SECRET = secret;
const eventId = crypto.randomBytes(8).toString('hex');
const dataId = crypto.randomBytes(8).toString('hex');
const requestId = crypto.randomUUID();
const ts = Math.floor(Date.now() / 1000);
const digest = crypto.createHmac('sha256', secret)
  .update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');
const app = express();
app.use(express.json());
app.use(apiRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Falha HTTP.');
const url = `http://127.0.0.1:${address.port}/webhooks/mercado-pago?data.id=${dataId}`;
const send = (signature: string) => fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-request-id': requestId, 'x-signature': signature },
  body: JSON.stringify({ id: eventId, type: 'subscription_preapproval', data: { id: dataId } }),
});
try {
  assert.equal((await send(`ts=${ts},v1=${'0'.repeat(64)}`)).status, 401);
  assert.equal((await send(`ts=${ts},v1=${digest}`)).status, 200);
  assert.equal((await send(`ts=${ts},v1=${digest}`)).status, 200);
  assert.equal(await db.pagamentoEvento.count({ where: { provedorEventoId: `mp:${eventId}` } }), 1);
  const event = await db.pagamentoEvento.findUniqueOrThrow({ where: { provedorEventoId: `mp:${eventId}` } });
  assert.equal(event.status, 'RECEBIDO');
  assert.equal(event.processadoEm, null);
  process.stdout.write('Webhook passou: assinatura inválida rejeitada e evento duplicado deduplicado.\n');
} finally {
  await db.pagamentoEvento.deleteMany({ where: { provedorEventoId: `mp:${eventId}` } });
  server.close();
  await db.$disconnect();
  if (previousSecret === undefined) delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  else process.env.MERCADO_PAGO_WEBHOOK_SECRET = previousSecret;
}
