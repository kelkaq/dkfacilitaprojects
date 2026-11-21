import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { apiRouter } from '../server/routes/apiRoutes.ts';
import { getPrisma } from '../server/lib/prisma.ts';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatória.');
process.env.CSDK_PAYMENT_ENVIRONMENT = 'TEST';
const db = getPrisma();
const suffix = crypto.randomBytes(6).toString('hex');
const slug = `smoke-${suffix}`;
const oldMpToken = process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN;
const oldAppUrl = process.env.APP_URL;
const oldCommerceEnabled = process.env.CSDK_PUBLIC_COMMERCE_ENABLED;
process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN = 'TEST-placeholder';
process.env.APP_URL = 'https://example.invalid';
process.env.CSDK_PUBLIC_COMMERCE_ENABLED = 'true';
const nativeFetch = globalThis.fetch;
let providerCreates = 0;
const providerBody: { [key: string]: unknown }[] = [];
globalThis.fetch = (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const target = String(url);
  if (!target.startsWith('https://api.mercadopago.com/')) return nativeFetch(url, init);
  if (target.startsWith('https://api.mercadopago.com/preapproval/search?')) {
    return new Response(JSON.stringify({ paging: { total: 0 }, results: [] }), { status: 200 });
  }
  if (target === 'https://api.mercadopago.com/preapproval' && init?.method === 'POST') {
    providerCreates++;
    const body = JSON.parse(String(init.body)) as { external_reference: string; auto_recurring: object };
    providerBody.push(body as unknown as { [key: string]: unknown });
    return new Response(JSON.stringify({ id: 'test_subscription_123', status: 'pending',
      external_reference: body.external_reference, init_point: 'https://www.mercadopago.com/checkout/v1/redirect?pref_id=mock',
      auto_recurring: body.auto_recurring }), { status: 201 });
  }
  if (target === 'https://api.mercadopago.com/preapproval/test_subscription_123') {
    const create = providerBody[0];
    return new Response(JSON.stringify({ id: 'test_subscription_123', status: 'pending',
      external_reference: create.external_reference, init_point: 'https://www.mercadopago.com/checkout/v1/redirect?pref_id=mock',
      auto_recurring: create.auto_recurring }), { status: 200 });
  }
  return new Response('{}', { status: 404 });
}) as typeof fetch;
const app = express();
app.use(express.json());
app.use(apiRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Falha HTTP.');
const url = `http://127.0.0.1:${address.port}/api/public/orders`;

let planId: string | null = null;
try {
  process.env.CSDK_PUBLIC_COMMERCE_ENABLED = 'false';
  assert.equal((await fetch(url.replace('/orders', '/offers'))).status, 503);
  process.env.CSDK_PUBLIC_COMMERCE_ENABLED = 'true';
  const plan = await db.plano.create({ data: {
    slug, nome: 'Teste', subtitulo: 'Teste', descricao: 'Somente teste',
    precoMensalCentavos: 10000, descontoSemestral: 10, descontoAnual: 20,
    limiteColaboradores: 1, limiteUsuarios: 1, limiteObras: 1,
  } });
  planId = plan.id;
  const offer = await db.planoOferta.create({ data: {
    planoId: plan.id, ciclo: 'SEMESTRAL', ambiente: 'TEST', trialDias: 7,
    totalCentavos: 54000, mercadoPagoPlanId: `smoke-${suffix}`, ativa: true,
  } });
  const key = crypto.randomUUID();
  const body = { tipoDocumento: 'PF', documento: '529.982.247-25', emailComprador: `smoke-${suffix}@example.invalid`,
    razaoSocial: 'Pessoa de teste', nomeAdministrador: 'Administrador de teste', whatsapp: '11999999999',
    planoSlug: slug, ciclo: 'SEMESTRAL', modoInicio: 'TRIAL' };
  const post = (payload: unknown, idempotencyKey: string) => fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-idempotency-key': idempotencyKey }, body: JSON.stringify(payload),
  });
  const first = await post(body, key);
  assert.equal(first.status, 201);
  const created = await first.json() as { id: string; status: string; totalCentavos: number };
  const stored = await db.pedido.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(stored.ofertaId, offer.id);
  assert.equal(stored.modoInicio, 'TRIAL');
  assert.equal(created.totalCentavos, 54000);
  assert.equal(created.status, 'CARRINHO');
  const statusUrl = `${url}/${created.id}/status`;
  assert.equal(((await (await fetch(statusUrl)).json()) as { status: string }).status, 'CARRINHO');
  const checkoutUrl = `${url}/${created.id}/checkout`;
  const startCheckout = () => fetch(checkoutUrl, { method: 'POST' });
  process.env.CSDK_PUBLIC_COMMERCE_ENABLED = 'false';
  assert.equal((await startCheckout()).status, 503);
  process.env.CSDK_PUBLIC_COMMERCE_ENABLED = 'true';
  const start = await startCheckout();
  assert.equal(start.status, 200);
  const startBody = await start.json() as { checkoutUrl: string; status: string };
  assert.equal(startBody.status, 'AGUARDANDO_CARTAO');
  assert.ok(startBody.checkoutUrl.startsWith('https://www.mercadopago.com/'));
  const sentRecurring = providerBody[0].auto_recurring as { free_trial: { frequency: number; frequency_type: string }; transaction_amount: number };
  assert.deepEqual(sentRecurring.free_trial, { frequency: 7, frequency_type: 'days' });
  assert.equal(sentRecurring.transaction_amount, 540);
  assert.ok(String(providerBody[0].back_url).includes(`/pagamento-retorno?pedido=${created.id}`));
  assert.equal(((await (await fetch(statusUrl)).json()) as { status: string }).status, 'AGUARDANDO_CARTAO');
  const repeatedCheckout = await startCheckout();
  assert.equal(repeatedCheckout.status, 200);
  assert.equal(providerCreates, 1);
  const repeated = await post(body, key);
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json() as { id: string }).id, created.id);
  assert.equal((await post({ ...body, documento: '11.222.333/0001-81', tipoDocumento: 'PJ' }, key)).status, 409);
  assert.equal((await post({ ...body, documento: '529.982.247-24' }, crypto.randomUUID())).status, 400);
  assert.equal((await post({ ...body, modoInicio: 'IMEDIATO' }, crypto.randomUUID())).status, 409);
  const catalog = await fetch(url.replace('/orders', '/offers'));
  assert.equal(catalog.status, 200);
  const offers = (await catalog.json() as { offers: Array<{ planoSlug: string; planoNome: string; totalCentavos: number; trialDias: number; limiteUsuarios: number }> }).offers;
  const publicOffer = offers.find((item) => item.planoSlug === slug && item.totalCentavos === 54000 && item.trialDias === 7);
  assert.ok(publicOffer);
  assert.equal(publicOffer.planoNome, 'Teste');
  assert.equal(publicOffer.limiteUsuarios, 1);
  const parallelKey = crypto.randomUUID();
  const parallel = await Promise.all([post(body, parallelKey), post(body, parallelKey)]);
  assert.deepEqual(parallel.map((item) => item.status).sort(), [200, 201]);
  const parallelIds = await Promise.all(parallel.map(async (item) => (await item.json() as { id: string }).id));
  assert.equal(parallelIds[0], parallelIds[1]);
  await db.planoOferta.update({ where: { id: offer.id }, data: { totalCentavos: 53000 } });
  assert.equal((await post(body, crypto.randomUUID())).status, 409);
  await db.planoOferta.update({ where: { id: offer.id }, data: { totalCentavos: 54000 } });
  assert.equal(await db.usoTrial.count({ where: { documento: '52998224725' } }), 0);
  process.stdout.write('Pedido passou: preço, CPF, idempotência, checkout MP com trial e assinatura duplicada evitada.\n');
} finally {
  globalThis.fetch = nativeFetch;
  if (oldMpToken === undefined) delete process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN; else process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN = oldMpToken;
  if (oldAppUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = oldAppUrl;
  if (oldCommerceEnabled === undefined) delete process.env.CSDK_PUBLIC_COMMERCE_ENABLED; else process.env.CSDK_PUBLIC_COMMERCE_ENABLED = oldCommerceEnabled;
  if (planId) {
    await db.pedido.deleteMany({ where: { planoId: planId } });
    await db.planoOferta.deleteMany({ where: { planoId: planId } });
    await db.plano.delete({ where: { id: planId } });
  }
  server.close();
  await db.$disconnect();
}
