import assert from 'node:assert/strict';
import { MercadoPagoSubscriptions } from '../server/services/mercadoPagoSubscriptions.ts';

const requests: { url: string; init: RequestInit }[] = [];
const http = (async (url: string | URL | Request, init?: RequestInit) => {
  requests.push({ url: String(url), init: init ?? {} });
  return new Response(JSON.stringify({ id: 'test_subscription_123', status: 'authorized', card_id: 'card_123' }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
}) as typeof fetch;
const mp = new MercadoPagoSubscriptions('TEST-placeholder', http);
await mp.createTrialPlan({ reason: 'CSDK teste', cycleMonths: 1, amountCentavos: 14900, backUrl: 'https://dkfacilita.com/checkout' });
assert.equal(requests[0].url, 'https://api.mercadopago.com/preapproval_plan');
const planBody = JSON.parse(String(requests[0].init.body));
assert.deepEqual(planBody.auto_recurring.free_trial, { frequency: 7, frequency_type: 'days' });
assert.equal(planBody.auto_recurring.transaction_amount, 149);
await mp.createSubscription({ planId: 'plan_123', payerEmail: 'teste@example.invalid', cardTokenId: 'card_token_123', externalReference: 'CSDK-123', backUrl: 'https://dkfacilita.com/checkout' });
assert.equal(requests[1].url, 'https://api.mercadopago.com/preapproval');
const subscriptionBody = JSON.parse(String(requests[1].init.body));
assert.equal(subscriptionBody.card_token_id, 'card_token_123');
assert.equal(subscriptionBody.status, 'authorized');
assert.equal(subscriptionBody.external_reference, 'CSDK-123');
assert.equal(JSON.stringify(requests).includes('1234567890123456'), false);
process.stdout.write('Contrato Mercado Pago passou: plano trial e assinatura com token de cartão.\n');
