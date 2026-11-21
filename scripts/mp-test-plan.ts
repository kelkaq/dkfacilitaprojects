import fs from 'node:fs';
import dotenv from 'dotenv';
import { MercadoPagoSubscriptions } from '../server/services/mercadoPagoSubscriptions.ts';

const sellerFile = '/etc/dk/csdk/mp-test-seller.env';
if (!fs.existsSync(sellerFile)) throw new Error('Falta /etc/dk/csdk/mp-test-seller.env com as credenciais da aplicação do vendedor TEST.');
const sellerEnv = dotenv.parse(fs.readFileSync(sellerFile));
const token = sellerEnv.MERCADO_PAGO_TEST_ACCESS_TOKEN;
const expectedSellerId = sellerEnv.MERCADO_PAGO_TEST_SELLER_ID?.trim();
const outputPath = process.env.CSDK_TEST_PLAN_OUTPUT;
if (!token?.startsWith('APP_USR-') || !/^\d+$/.test(expectedSellerId ?? '') || !outputPath?.startsWith('/etc/dk/csdk/')) {
  throw new Error('Credencial APP_USR do vendedor TEST, ID do vendedor e destino protegido são obrigatórios.');
}
const identityResponse = await fetch('https://api.mercadopago.com/users/me', { headers: { Authorization: `Bearer ${token}` } });
if (!identityResponse.ok) throw new Error('Não foi possível validar o vendedor TEST no Mercado Pago.');
const identity = await identityResponse.json() as { id?: string | number; nickname?: string; site_id?: string };
if (String(identity.id) !== expectedSellerId || !identity.nickname?.startsWith('TEST') || identity.site_id !== 'MLB') {
  throw new Error('A credencial não pertence ao vendedor de teste MLB configurado.');
}
const mp = new MercadoPagoSubscriptions(token);
const plan = await mp.createTrialPlan({
  reason: `CSDK HOMOLOGACAO ${new Date().toISOString().slice(0, 10)}`,
  cycleMonths: 1,
  amountCentavos: 1000,
  backUrl: 'https://dkfacilita.com/pagamento-retorno',
});
if (!plan.id || !plan.init_point || String((plan as typeof plan & { collector_id?: string | number }).collector_id) !== expectedSellerId ||
    plan.auto_recurring?.free_trial?.frequency !== 7 ||
    plan.auto_recurring.free_trial.frequency_type !== 'days' ||
    plan.auto_recurring.currency_id !== 'BRL') {
  throw new Error('Plano retornado não comprovou sete dias gratuitos em BRL.');
}
fs.writeFileSync(outputPath, JSON.stringify({ id: plan.id, status: plan.status, createdAt: new Date().toISOString() }), { mode: 0o600, flag: 'wx' });
process.stdout.write('Plano de homologação Mercado Pago TEST criado e validado; ID guardado na VPS.\n');
