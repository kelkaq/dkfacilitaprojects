import fs from 'node:fs';
import { MercadoPagoSubscriptions } from '../server/services/mercadoPagoSubscriptions.ts';

const token = process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN;
const outputPath = process.env.CSDK_TEST_PLAN_OUTPUT;
if (!token?.startsWith('TEST-') || !outputPath?.startsWith('/etc/dk/csdk/')) {
  throw new Error('Credencial TEST e destino protegido são obrigatórios.');
}
const mp = new MercadoPagoSubscriptions(token);
const plan = await mp.createTrialPlan({
  reason: `CSDK HOMOLOGACAO ${new Date().toISOString().slice(0, 10)}`,
  cycleMonths: 1,
  amountCentavos: 1000,
  backUrl: 'https://dkfacilita.com/checkout',
});
if (!plan.id || plan.auto_recurring?.free_trial?.frequency !== 7 ||
    plan.auto_recurring.free_trial.frequency_type !== 'days' ||
    plan.auto_recurring.currency_id !== 'BRL') {
  throw new Error('Plano retornado não comprovou sete dias gratuitos em BRL.');
}
fs.writeFileSync(outputPath, JSON.stringify({ id: plan.id, status: plan.status, createdAt: new Date().toISOString() }), { mode: 0o600, flag: 'wx' });
process.stdout.write('Plano de homologação Mercado Pago TEST criado e validado; ID guardado na VPS.\n');
