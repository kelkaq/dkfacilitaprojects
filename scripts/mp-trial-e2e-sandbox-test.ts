import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import express from 'express';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer-core';
import { apiRouter } from '../server/routes/apiRoutes.ts';
import { getPrisma } from '../server/lib/prisma.ts';
import { MercadoPagoSubscriptions } from '../server/services/mercadoPagoSubscriptions.ts';

const dbUrl = process.env.DATABASE_URL ?? '';
const mpToken = process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN ?? '';
const webhookSecret = process.env.MERCADO_PAGO_TEST_WEBHOOK_SECRET ?? '';
const planFile = process.env.CSDK_TEST_PLAN_OUTPUT ?? '';
const chromiumPath = process.env.CSDK_CHROMIUM_PATH ?? '';
if (!dbUrl.includes('csdk_db') || !mpToken.startsWith('TEST-') || !webhookSecret ||
    !planFile.startsWith('/etc/dk/csdk/') || !chromiumPath.startsWith('/usr/')) {
  throw new Error('Este smoke exige somente banco csdk_db, credenciais TEST, plano privado e Chromium do staging.');
}

const legacyEnv = dotenv.parse(fs.readFileSync('/etc/dk/dk-solucoes.env'));
const publicKey = legacyEnv.MERCADO_PAGO_TEST_PUBLIC_KEY ?? '';
const payerEmail = legacyEnv.MERCADO_PAGO_TEST_BUYER_EMAIL?.trim().toLowerCase() ?? '';
if (!publicKey.startsWith('TEST-') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
  throw new Error('Credenciais TEST de tokenização/comprador ausentes.');
}

const planId = (JSON.parse(fs.readFileSync(planFile, 'utf8')) as { id?: string }).id;
if (!planId || !/^[a-zA-Z0-9_-]{8,128}$/.test(planId)) throw new Error('Plano TEST inválido.');
process.env.CSDK_PAYMENT_ENVIRONMENT = 'TEST';
process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN = mpToken;
process.env.MERCADO_PAGO_TEST_WEBHOOK_SECRET = webhookSecret;
process.env.APP_URL = 'https://dkfacilita.com';
process.env.EMAIL_PROVIDER = 'DISABLED';
delete process.env.BREVO_API_KEY;
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;

const db = getPrisma();
const suffix = crypto.randomBytes(6).toString('hex');
const documentNumber = '52998224725';
const externalReference = `CSDK-${crypto.randomUUID()}`;
const orderId = crypto.randomUUID();
const buyerEmail = payerEmail;
const provider = new MercadoPagoSubscriptions(mpToken);
let offerId: string | null = null;
let orderCreated = false;
let subscriptionId: string | null = null;
let empresaId: string | null = null;
let originalOfferActive = false;
let planDbId: string | null = null;
let originalPlanActive = false;
let originalFetch: typeof fetch | null = null;
let subscriptionResponse: { status: number; error?: string; message?: string; causes?: string[] } | null = null;
const eventIds: string[] = [];
let server: ReturnType<express.Application['listen']> | null = null;
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

function signedRequest(base: string, topic: string, resourceId: string, providerEventId: string) {
  const requestId = crypto.randomUUID();
  const ts = Math.floor(Date.now() / 1000);
  const digest = crypto.createHmac('sha256', webhookSecret)
    .update(`id:${resourceId};request-id:${requestId};ts:${ts};`).digest('hex');
  return fetch(`${base}/webhooks/mercado-pago?data.id=${encodeURIComponent(resourceId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${digest}` },
    body: JSON.stringify({ id: providerEventId, type: topic, data: { id: resourceId } }),
  });
}

try {
  const offer = await db.planoOferta.findUnique({ where: { mercadoPagoPlanId: planId }, include: { plano: true } });
  if (!offer || offer.ambiente !== 'TEST' || offer.trialDias !== 7 || offer.totalCentavos < 100) {
    throw new Error('Oferta TEST de sete dias não corresponde ao plano privado esperado.');
  }
  offerId = offer.id;
  originalOfferActive = offer.ativa;
  planDbId = offer.planoId;
  originalPlanActive = offer.plano.ativo;
  if (await db.usuario.findUnique({ where: { email: buyerEmail } }) ||
      await db.empresa.findUnique({ where: { documento: documentNumber } }) ||
      await db.usoTrial.findUnique({ where: { documento: documentNumber } })) {
    throw new Error('A limpeza preventiva detectou dados de teste existentes; nenhum dado foi alterado.');
  }

  const plan = await provider.getPlan(planId);
  assert.equal(plan.status, 'active');
  assert.equal(plan.auto_recurring?.currency_id, 'BRL');
  assert.equal(plan.auto_recurring?.free_trial?.frequency, 7);
  assert.equal(plan.auto_recurring?.free_trial?.frequency_type, 'days');

  if (!originalPlanActive) await db.plano.update({ where: { id: offer.planoId }, data: { ativo: true } });
  await db.planoOferta.update({ where: { id: offer.id }, data: { ativa: true } });
  await db.pedido.create({ data: {
    id: orderId, planoId: offer.planoId, ofertaId: offer.id, tipoDocumento: 'PF', documento: documentNumber,
    emailComprador: buyerEmail, razaoSocial: `Comprador TEST ${suffix}`, nomeAdministrador: `Administrador TEST ${suffix}`,
    whatsapp: '11999999999', ciclo: offer.ciclo, modoInicio: 'TRIAL', status: 'AGUARDANDO_CARTAO',
    precoSnapshot: { planoId: offer.planoId, ofertaId: offer.id, ambiente: 'TEST', trialDias: 7, totalCentavos: offer.totalCentavos },
    totalCentavos: offer.totalCentavos, idempotencyKey: `mp-e2e-${suffix}`, externalReference,
    expiraEm: new Date(Date.now() + 60 * 60_000),
  } });
  orderCreated = true;

  const app = express();
  app.use(express.json());
  app.use(apiRouter);
  app.get('/token-test', (_req, res) => res.type('html').send(`<!doctype html><html><head><style>
    #form-checkout{display:flex;flex-direction:column;gap:8px;max-width:600px}
    #form-checkout .secure-field{height:24px;display:inline-block;width:280px;border:1px solid #777;border-radius:4px;padding:2px}
    </style></head><body>
    <form id="form-checkout">
      <div id="form-checkout__cardNumber" class="secure-field"></div><div id="form-checkout__expirationDate" class="secure-field"></div><div id="form-checkout__securityCode" class="secure-field"></div>
      <input id="form-checkout__cardholderName"><select id="form-checkout__issuer"></select><select id="form-checkout__installments"></select>
      <select id="form-checkout__identificationType"><option value="CPF">CPF</option></select>
      <input id="form-checkout__identificationNumber"><input id="form-checkout__cardholderEmail" type="email"><button id="submit" type="submit">Continuar</button>
    </form><script src="https://sdk.mercadopago.com/js/v2"></script><script>
      const mp=new MercadoPago(${JSON.stringify(publicKey)},{locale:'pt-BR'});
      window.mpReady=false;window.mpToken=null;window.mpError=null;
      const cardForm=mp.cardForm({amount:${JSON.stringify((offer.totalCentavos / 100).toFixed(2))},iframe:true,form:{id:'form-checkout',cardNumber:{id:'form-checkout__cardNumber'},expirationDate:{id:'form-checkout__expirationDate'},securityCode:{id:'form-checkout__securityCode'},cardholderName:{id:'form-checkout__cardholderName'},issuer:{id:'form-checkout__issuer'},installments:{id:'form-checkout__installments'},identificationType:{id:'form-checkout__identificationType'},identificationNumber:{id:'form-checkout__identificationNumber'},cardholderEmail:{id:'form-checkout__cardholderEmail'}},callbacks:{onFormMounted:error=>{window.mpReady=!error;if(error)window.mpError='mount';},onSubmit:event=>{event.preventDefault();const data=cardForm.getCardFormData();window.mpSubmit={token:Boolean(data.token),paymentMethodId:Boolean(data.paymentMethodId),issuerId:Boolean(data.issuerId)};window.mpToken=data.token;},onError:error=>{window.mpError=JSON.stringify(Array.isArray(error)?error.map(item=>({keys:Object.keys(item??{}),type:item?.type,code:item?.code,message:item?.message,field:item?.field})):({keys:Object.keys(error??{}),type:error?.type,code:error?.code,message:error?.message})).slice(0,1500);}}});
    </script></body></html>`));
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server!.once('listening', resolve); server!.once('error', reject); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Não foi possível iniciar o endpoint local de tokenização.');
  browser = await puppeteer.launch({ executablePath: chromiumPath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  let tokenResponse: { status: number; error?: string; message?: string; causes?: string[] } | null = null;
  page.on('response', async (response) => {
    try {
      if (new URL(response.url()).pathname.includes('card_tokens')) {
        const body = await response.json() as { error?: unknown; message?: unknown; cause?: Array<{ code?: unknown }> };
        tokenResponse = { status: response.status(),
          error: typeof body.error === 'string' ? body.error : undefined,
          message: typeof body.message === 'string' ? body.message.slice(0, 100) : undefined,
          causes: Array.isArray(body.cause) ? body.cause.map((cause) => String(cause.code ?? '')).slice(0, 5) : undefined };
      }
    } catch { /* não registrar conteúdo de cartão nem token */ }
  });
  await page.goto(`http://127.0.0.1:${address.port}/token-test`, { waitUntil: 'networkidle2', timeout: 45_000 });
  await page.waitForFunction(() => (window as unknown as { mpReady?: boolean }).mpReady === true, { timeout: 30_000 });

  await page.waitForFunction(() => document.querySelector('#form-checkout__cardNumber iframe') !== null, { timeout: 20_000 });
  async function enterSecureField(frameName: string, inputName: string, value: string) {
    const secureFrame = page.frames().find((frame) => frame.name() === frameName);
    if (!secureFrame) throw new Error('Campo seguro do cartão indisponível.');
    const input = await secureFrame.waitForSelector(`input[name="${inputName}"]`, { timeout: 10_000 });
    if (!input) throw new Error('Campo seguro do cartão ausente.');
    await input.type(value, { delay: 15 });
    return await input.evaluate((element) => element.value.length);
  }
  const fieldLengths = {
    cardNumber: await enterSecureField('cardNumber', 'cardNumber', '4235647728025682'),
    expirationDate: await enterSecureField('expirationDate', 'expirationDate', '11/30'),
    securityCode: await enterSecureField('securityCode', 'securityCode', '123'),
  };
  await page.type('#form-checkout__cardholderName', 'APRO');
  await page.select('#form-checkout__identificationType', 'CPF');
  await page.type('#form-checkout__identificationNumber', '12345678909');
  await page.type('#form-checkout__cardholderEmail', buyerEmail);
  await page.waitForFunction(() => {
    const issuer = document.querySelector<HTMLSelectElement>('#form-checkout__issuer');
    const installments = document.querySelector<HTMLSelectElement>('#form-checkout__installments');
    return Boolean(issuer?.value && installments?.value);
  }, { timeout: 30_000 });
  await page.click('#submit');
  await page.waitForFunction(() => Boolean((window as unknown as { mpToken?: string }).mpToken) ||
    Boolean((window as unknown as { mpError?: string }).mpError), { timeout: 30_000 });
  const tokenResult = await page.evaluate(() => ({
    token: (window as unknown as { mpToken?: string }).mpToken,
    error: (window as unknown as { mpError?: string }).mpError,
    submitted: (window as unknown as { mpSubmit?: { token: boolean; paymentMethodId: boolean; issuerId: boolean } }).mpSubmit,
  }));
  const frameInfo = await Promise.all(page.frames().map(async (frame) => {
    try { return { name: frame.name(), fields: await frame.$$eval('input', (inputs) => inputs.map((input) => ({ name: input.name, id: input.id,
      type: input.type, maxLength: input.maxLength, length: input.value.length, placeholder: input.placeholder }))) }; }
    catch { return { name: frame.name(), fields: [] }; }
  }));
  if (!tokenResult.token) throw new Error(`Tokenização TEST recusada (${tokenResult.error ?? 'sem token'}; campos:${JSON.stringify(fieldLengths)}; formulário:${JSON.stringify(tokenResult.submitted ?? {})}; frames:${JSON.stringify(frameInfo).slice(0,8000)}; provedor:${JSON.stringify(tokenResponse ?? {})}).`);

  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const response = await originalFetch!(input, init);
    if (String(input).endsWith('/preapproval') && init?.method === 'POST') {
      try {
        const body = await response.clone().json() as { error?: unknown; message?: unknown; cause?: Array<{ code?: unknown }> };
        subscriptionResponse = { status: response.status,
          error: typeof body.error === 'string' ? body.error : undefined,
          message: typeof body.message === 'string' ? body.message.slice(0, 120) : undefined,
          causes: Array.isArray(body.cause) ? body.cause.map((cause) => String(cause.code ?? '')).slice(0, 5) : undefined };
      } catch { subscriptionResponse = { status: response.status }; }
    }
    return response;
  }) as typeof fetch;
  let subscription;
  try {
    const instrumentedProvider = new MercadoPagoSubscriptions(mpToken, globalThis.fetch);
    subscription = await instrumentedProvider.createSubscription({
      planId, payerEmail: buyerEmail, cardTokenId: tokenResult.token,
      externalReference, backUrl: 'https://dkfacilita.com/pagamento-retorno',
      reason: `Certifica Software - DK · ${offer.plano.nome}`,
      cycleMonths: offer.ciclo === 'MENSAL' ? 1 : offer.ciclo === 'SEMESTRAL' ? 6 : 12,
      amountCentavos: offer.totalCentavos,
    });
  } catch {
    throw new Error(`Mercado Pago recusou a assinatura TEST: ${JSON.stringify(subscriptionResponse ?? {})}; tokenização:${JSON.stringify(tokenResponse ?? {})}.`);
  } finally {
    globalThis.fetch = originalFetch;
    originalFetch = null;
  }
  subscriptionId = subscription.id;
  assert.equal(subscription.status, 'authorized');
  assert.equal(subscription.preapproval_plan_id, planId);
  assert.ok(subscription.card_id);
  assert.equal(subscription.payer_email?.trim().toLowerCase(), buyerEmail);

  const eventSuffix = crypto.randomUUID();
  eventIds.push(`mp:${eventSuffix}`);
  const base = `http://127.0.0.1:${address.port}`;
  const activated = await signedRequest(base, 'subscription_preapproval', subscriptionId, eventSuffix);
  assert.equal(activated.status, 200);
  const activatedOrder = await db.pedido.findUniqueOrThrow({ where: { id: orderId } });
  assert.equal(activatedOrder.status, 'TRIAL_ATIVO');
  assert.equal(activatedOrder.mercadoPagoId, subscriptionId);
  empresaId = activatedOrder.empresaId;
  assert.ok(empresaId);
  assert.equal(await db.usuario.count({ where: { empresaId } }), 1);
  assert.equal(await db.usoTrial.count({ where: { documento: documentNumber } }), 1);
  assert.equal(await db.recuperacaoSenha.count({ where: { usuario: { empresaId } } }), 1);
  const duplicate = await signedRequest(base, 'subscription_preapproval', subscriptionId, eventSuffix);
  assert.equal(duplicate.status, 200);
  assert.equal(await db.empresa.count({ where: { id: empresaId } }), 1);

  const canceled = await provider.cancelSubscription(subscriptionId);
  assert.ok(['cancelled', 'canceled'].includes(canceled.status));
  const cancelEvent = crypto.randomUUID();
  eventIds.push(`mp:${cancelEvent}`);
  await db.pagamentoEvento.create({ data: { provedorEventoId: `mp:${cancelEvent}`, topico: 'subscription_preapproval', recursoId: subscriptionId } });
  const cancelResponse = await signedRequest(base, 'subscription_preapproval', subscriptionId, cancelEvent);
  assert.equal(cancelResponse.status, 200);
  assert.equal((await db.empresa.findUniqueOrThrow({ where: { id: empresaId } })).status, 'CANCELADA');
  process.stdout.write('Mercado Pago TEST passou: cartão tokenizado, trial autorizado, conta provisionada uma vez, cancelamento confirmado; e-mails externos desativados e dados locais removidos.\n');
} finally {
  if (originalFetch) globalThis.fetch = originalFetch;
  if (browser) await browser.close().catch(() => undefined);
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  if (subscriptionId) await provider.cancelSubscription(subscriptionId).catch(() => undefined);
  if (orderCreated && !empresaId) empresaId = (await db.pedido.findUnique({ where: { id: orderId }, select: { empresaId: true } }))?.empresaId ?? null;
  if (eventIds.length) await db.pagamentoEvento.deleteMany({ where: { provedorEventoId: { in: eventIds } } });
  if (empresaId) {
    await db.fatura.deleteMany({ where: { assinatura: { empresaId } } });
    await db.recuperacaoSenha.deleteMany({ where: { usuario: { empresaId } } });
    await db.assinatura.deleteMany({ where: { empresaId } });
    await db.usuario.deleteMany({ where: { empresaId } });
    await db.usoTrial.deleteMany({ where: { empresaId } });
    await db.empresa.deleteMany({ where: { id: empresaId } });
  }
  if (orderCreated) await db.pedido.deleteMany({ where: { id: orderId } });
  if (offerId) await db.planoOferta.update({ where: { id: offerId }, data: { ativa: originalOfferActive } });
  if (planDbId) await db.plano.update({ where: { id: planDbId }, data: { ativo: originalPlanActive } });
  await db.$disconnect();
}
