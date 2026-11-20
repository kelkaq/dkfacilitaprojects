import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { apiRouter } from '../server/routes/apiRoutes.ts';
import { getPrisma } from '../server/lib/prisma.ts';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatória.');
const db = getPrisma();
const suffix = crypto.randomBytes(6).toString('hex');
const original = {
  secret: process.env.MERCADO_PAGO_WEBHOOK_SECRET,
  testSecret: process.env.MERCADO_PAGO_TEST_WEBHOOK_SECRET,
  token: process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN,
  mode: process.env.CSDK_PAYMENT_ENVIRONMENT,
  resend: process.env.RESEND_API_KEY,
  from: process.env.EMAIL_FROM,
  appUrl: process.env.APP_URL,
};
const secret = crypto.randomBytes(32).toString('hex');
process.env.CSDK_PAYMENT_ENVIRONMENT = 'TEST';
process.env.MERCADO_PAGO_TEST_WEBHOOK_SECRET = secret;
process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN = 'TEST-placeholder';
delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;
const nativeFetch = globalThis.fetch;
const subscriptionId = `test_sub_${suffix}`;
const eventIds = [`mp:event-sub-${suffix}`, `mp:event-invoice-${suffix}`, `mp:event-cancel-${suffix}`, `mp:event-dup-${suffix}`];
const subscription = {
  id: subscriptionId, status: 'authorized', external_reference: `CSDK-${suffix}`,
  payer_email: `owner-${suffix}@example.invalid`, card_id: 'test-card',
  auto_recurring: { transaction_amount: 100, currency_id: 'BRL', free_trial: { frequency: 7, frequency_type: 'days' } },
  next_payment_date: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
};
let invoiceStatus = 'approved';
let providerSubscriptionStatus = 'authorized';
globalThis.fetch = ((url: Parameters<typeof fetch>[0]) => {
  const target = String(url);
  if (target === `https://api.mercadopago.com/preapproval/${subscriptionId}`) {
    return Promise.resolve(new Response(JSON.stringify({ ...subscription, status: providerSubscriptionStatus }), { status: 200 }));
  }
  if (target === 'https://api.mercadopago.com/authorized_payments/123456789') {
    return Promise.resolve(new Response(JSON.stringify({ id: 123456789, preapproval_id: subscriptionId,
      external_reference: subscription.external_reference, transaction_amount: '100.00', currency_id: 'BRL',
      debit_date: new Date().toISOString(), status: 'processed', payment: { id: 987654321, status: invoiceStatus } }), { status: 200 }));
  }
  return nativeFetch(url);
}) as typeof fetch;

const app = express();
app.use(express.json());
app.use(apiRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Falha HTTP.');
const base = `http://127.0.0.1:${address.port}`;
let planId: string | null = null;
let offerId: string | null = null;
let orderId: string | null = null;
let companyId: string | null = null;

function signedRequest(topic: string, dataId: string, eventId: string) {
  const requestId = crypto.randomUUID();
  const ts = Math.floor(Date.now() / 1000);
  const digest = crypto.createHmac('sha256', secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');
  return fetch(`${base}/webhooks/mercado-pago?data.id=${encodeURIComponent(dataId)}`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${digest}` },
    body: JSON.stringify({ id: eventId, type: topic, data: { id: dataId } }),
  });
}

try {
  const plan = await db.plano.create({ data: { slug: `mp-hook-${suffix}`, nome: 'Teste MP', subtitulo: 'Teste', descricao: 'Teste',
    precoMensalCentavos: 10000, limiteColaboradores: 5, limiteUsuarios: 2, limiteObras: 1 } });
  planId = plan.id;
  const offer = await db.planoOferta.create({ data: { planoId: plan.id, ciclo: 'MENSAL', ambiente: 'TEST', trialDias: 7,
    totalCentavos: 10000, mercadoPagoPlanId: `mp-hook-${suffix}`, ativa: true } });
  offerId = offer.id;
  const order = await db.pedido.create({ data: { planoId: plan.id, ofertaId: offer.id, tipoDocumento: 'PF',
    documento: '52998224725', emailComprador: subscription.payer_email, razaoSocial: 'Titular de teste',
    nomeAdministrador: 'Administrador de teste', whatsapp: '11999999999', ciclo: 'MENSAL', modoInicio: 'TRIAL',
    status: 'AGUARDANDO_CARTAO', precoSnapshot: { planoId: plan.id, ambiente: 'TEST', trialDias: 7, totalCentavos: 10000 },
    totalCentavos: 10000, idempotencyKey: `hook-${suffix}`, externalReference: subscription.external_reference,
    mercadoPagoId: subscriptionId, expiraEm: new Date(Date.now() + 60 * 60_000) } });
  orderId = order.id;

  const invalid = await fetch(`${base}/webhooks/mercado-pago?data.id=${subscriptionId}`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': crypto.randomUUID(), 'x-signature': 'ts=1,v1=' + '0'.repeat(64) },
    body: JSON.stringify({ id: `bad-${suffix}`, type: 'subscription_preapproval', data: { id: subscriptionId } }),
  });
  assert.equal(invalid.status, 401);
  assert.equal((await signedRequest('subscription_preapproval', subscriptionId, `event-sub-${suffix}`)).status, 200);
  const activatedOrder = await db.pedido.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(activatedOrder.status, 'TRIAL_ATIVO');
  companyId = activatedOrder.empresaId;
  assert.ok(companyId);
  assert.equal(await db.usuario.count({ where: { empresaId: companyId } }), 1);
  assert.equal(await db.usoTrial.count({ where: { documento: '52998224725' } }), 1);
  assert.equal(await db.recuperacaoSenha.count({ where: { usuario: { empresaId: companyId } } }), 1);
  const activationEvent = await db.pagamentoEvento.findUniqueOrThrow({ where: { provedorEventoId: `mp:event-sub-${suffix}` } });
  assert.equal(activationEvent.status, 'PROCESSADO');
  assert.ok(activationEvent.processadoEm);

  assert.equal((await signedRequest('subscription_authorized_payment', '123456789', `event-invoice-${suffix}`)).status, 200);
  let activeCompany = await db.empresa.findUniqueOrThrow({ where: { id: companyId } });
  assert.equal(activeCompany.status, 'ATIVA');
  const invoice = await db.fatura.findUniqueOrThrow({ where: { mercadoPagoAuthorizedPaymentId: '123456789' } });
  assert.equal(invoice.status, 'PAGA');

  providerSubscriptionStatus = 'cancelled';
  assert.equal((await signedRequest('subscription_preapproval', subscriptionId, `event-cancel-${suffix}`)).status, 200);
  activeCompany = await db.empresa.findUniqueOrThrow({ where: { id: companyId } });
  assert.equal(activeCompany.status, 'CANCELADA');

  assert.equal((await signedRequest('subscription_preapproval', subscriptionId, `event-dup-${suffix}`)).status, 200);
  process.stdout.write('Webhook passou: assinatura verificada cria trial e usuário, fatura aprovada ativa, cancelamento bloqueia e evento repetido é idempotente.\n');
} finally {
  globalThis.fetch = nativeFetch;
  if (orderId) await db.pedido.deleteMany({ where: { id: orderId } });
  await db.pagamentoEvento.deleteMany({ where: { provedorEventoId: { in: eventIds } } });
  if (companyId) await db.usoTrial.deleteMany({ where: { documento: '52998224725' } });
  if (companyId) await db.empresa.delete({ where: { id: companyId } });
  if (offerId) await db.planoOferta.delete({ where: { id: offerId } });
  if (planId) await db.plano.delete({ where: { id: planId } });
  server.close();
  await db.$disconnect();
  if (original.secret === undefined) delete process.env.MERCADO_PAGO_WEBHOOK_SECRET; else process.env.MERCADO_PAGO_WEBHOOK_SECRET = original.secret;
  if (original.testSecret === undefined) delete process.env.MERCADO_PAGO_TEST_WEBHOOK_SECRET; else process.env.MERCADO_PAGO_TEST_WEBHOOK_SECRET = original.testSecret;
  if (original.token === undefined) delete process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN; else process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN = original.token;
  if (original.mode === undefined) delete process.env.CSDK_PAYMENT_ENVIRONMENT; else process.env.CSDK_PAYMENT_ENVIRONMENT = original.mode;
  if (original.resend === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = original.resend;
  if (original.from === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = original.from;
  if (original.appUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = original.appUrl;
}
