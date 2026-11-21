import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import express from 'express';
import { apiRouter } from '../server/routes/apiRoutes.ts';
import { getPrisma } from '../server/lib/prisma.ts';

const databaseUrl = process.env.DATABASE_URL;
const token = process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN;
const planFile = process.env.CSDK_TEST_PLAN_OUTPUT;
if (!databaseUrl || !token?.startsWith('TEST-') || !planFile?.startsWith('/etc/dk/csdk/')) {
  throw new Error('Banco de homologação, credencial TEST e arquivo privado do plano são obrigatórios.');
}
const planId = (JSON.parse(fs.readFileSync(planFile, 'utf8')) as { id?: string }).id;
if (!planId || !/^[a-zA-Z0-9_-]{8,128}$/.test(planId)) throw new Error('Plano de homologação inválido.');
process.env.CSDK_PAYMENT_ENVIRONMENT = 'TEST';
process.env.CSDK_PUBLIC_COMMERCE_ENABLED = 'true';
process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN = token;
process.env.APP_URL = 'https://dkfacilita.com';

const db = getPrisma();
const offer = await db.planoOferta.findUnique({ where: { mercadoPagoPlanId: planId }, include: { plano: true } });
if (!offer || offer.ambiente !== 'TEST' || offer.trialDias !== 7 || offer.totalCentavos < 100) {
  throw new Error('Oferta de teste não está ligada ao plano TEST esperado.');
}
const oldActive = offer.ativa;
const suffix = crypto.randomBytes(6).toString('hex');
const orderId = crypto.randomUUID();
const server = express();
server.use(express.json());
server.use(apiRouter);
const listener = server.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { listener.once('listening', resolve); listener.once('error', reject); });
const address = listener.address();
if (!address || typeof address === 'string') throw new Error('Falha ao iniciar API isolada.');

try {
  const plan = await new (await import('../server/services/mercadoPagoSubscriptions.ts')).MercadoPagoSubscriptions(token).getPlan(planId);
  assert.equal(plan.status, 'active');
  assert.equal(plan.auto_recurring?.currency_id, 'BRL');
  assert.equal(plan.auto_recurring?.free_trial?.frequency, 7);
  assert.equal(plan.auto_recurring?.free_trial?.frequency_type, 'days');
  await db.planoOferta.update({ where: { id: offer.id }, data: { ativa: true } });
  await db.pedido.create({ data: {
    id: orderId,
    planoId: offer.planoId,
    ofertaId: offer.id,
    tipoDocumento: 'PF',
    documento: '52998224725',
    emailComprador: `mp-plan-${suffix}@example.invalid`,
    razaoSocial: 'Titular de teste',
    nomeAdministrador: 'Administrador de teste',
    whatsapp: '11999999999',
    ciclo: offer.ciclo,
    modoInicio: 'TRIAL',
    status: 'CARRINHO',
    precoSnapshot: { planoId: offer.planoId, ofertaId: offer.id, ambiente: 'TEST', trialDias: 7,
      totalCentavos: offer.totalCentavos },
    totalCentavos: offer.totalCentavos,
    idempotencyKey: `mp-plan-${suffix}`,
    externalReference: `CSDK-${crypto.randomUUID()}`,
    expiraEm: new Date(Date.now() + 60 * 60_000),
  } });
  const response = await fetch(`http://127.0.0.1:${address.port}/api/public/orders/${orderId}/checkout`, { method: 'POST' });
  const result = await response.json() as { checkoutUrl?: string; status?: string; error?: string };
  assert.equal(response.status, 200, result.error);
  assert.equal(result.status, 'AGUARDANDO_CARTAO');
  assert.ok(result.checkoutUrl);
  const checkoutUrl = new URL(result.checkoutUrl!);
  assert.equal(checkoutUrl.protocol, 'https:');
  assert.match(checkoutUrl.hostname, /(^|\.)mercadopago\.com(\.br|\.ar)?$/);
  process.stdout.write('Plano TEST real passou: assinatura de sete dias validada e link hospedado retornado; nenhuma cobrança foi enviada.\n');
} finally {
  await db.planoOferta.update({ where: { id: offer.id }, data: { ativa: oldActive } });
  await db.pedido.deleteMany({ where: { id: orderId } });
  listener.close();
  await db.$disconnect();
}
