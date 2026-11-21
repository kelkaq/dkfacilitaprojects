import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { apiRouter } from '../server/routes/apiRoutes.ts';
import { getPrisma } from '../server/lib/prisma.ts';
import { hashPassword, signJwtToken } from '../server/lib/security.ts';

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('Banco isolado e JWT de teste obrigatórios.');
}
const oldEnvironment = process.env.CSDK_PAYMENT_ENVIRONMENT;
const oldToken = process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN;
process.env.CSDK_PAYMENT_ENVIRONMENT = 'TEST';
process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN = 'TEST-placeholder';
const nativeFetch = globalThis.fetch;
const db = getPrisma();
const suffix = crypto.randomBytes(6).toString('hex');
const subscriptionId = `cancel_sub_${suffix}`;
globalThis.fetch = ((url: Parameters<typeof fetch>[0], init?: RequestInit) => {
  if (String(url) === `https://api.mercadopago.com/preapproval/${subscriptionId}` && init?.method === 'PUT') {
    assert.deepEqual(JSON.parse(String(init.body)), { status: 'cancelled' });
    return Promise.resolve(new Response(JSON.stringify({ id: subscriptionId, status: 'cancelled' }), { status: 200 }));
  }
  return nativeFetch(url, init);
}) as typeof fetch;

const app = express();
app.use(express.json());
app.use(apiRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Falha ao iniciar API isolada.');
const base = `http://127.0.0.1:${address.port}`;
let companyId: string | null = null;
let planId: string | null = null;

try {
  const plan = await db.plano.create({ data: { slug: `cancel-${suffix}`, nome: 'Teste cancelamento', subtitulo: 'Smoke',
    descricao: 'Teste isolado', precoMensalCentavos: 1000, limiteColaboradores: 1, limiteUsuarios: 1, limiteObras: 1 } });
  planId = plan.id;
  const company = await db.empresa.create({ data: { tipoDocumento: 'PF', documento: `99999${suffix}`,
    razaoSocial: `Teste cancelamento ${suffix}`, emailFinanceiro: `admin-${suffix}@example.invalid`,
    whatsapp: '11999999999', status: 'TRIAL', trialExpiraEm: new Date(Date.now() + 5 * 24 * 60 * 60_000) } });
  companyId = company.id;
  const admin = await db.usuario.create({ data: { empresaId: company.id, nome: 'Admin teste',
    email: company.emailFinanceiro, senhaHash: hashPassword(crypto.randomBytes(16).toString('hex')), perfil: 'ADMIN_EMPRESA' } });
  const member = await db.usuario.create({ data: { empresaId: company.id, nome: 'RT teste',
    email: `rt-${suffix}@example.invalid`, senhaHash: hashPassword(crypto.randomBytes(16).toString('hex')), perfil: 'RT' } });
  await db.assinatura.create({ data: { empresaId: company.id, planoId: plan.id, ciclo: 'MENSAL', status: 'TRIAL',
    valorCentavos: 1000, mercadoPagoId: subscriptionId, proximaCobrancaEm: company.trialExpiraEm } });
  const headers = (userId: string, email: string, perfil: 'ADMIN_EMPRESA' | 'RT') => ({
    authorization: `Bearer ${signJwtToken({ userId, email, perfil, empresaId: company.id, versaoSessao: 0 })}`,
  });
  const forbidden = await fetch(`${base}/api/tenant/access/cancel-trial`, { method: 'POST', headers: headers(member.id, member.email, 'RT') });
  assert.equal(forbidden.status, 403);
  const response = await fetch(`${base}/api/tenant/access/cancel-trial`, { method: 'POST', headers: headers(admin.id, admin.email, 'ADMIN_EMPRESA') });
  assert.equal(response.status, 200);
  assert.equal((await db.assinatura.findUniqueOrThrow({ where: { mercadoPagoId: subscriptionId } })).status, 'CANCELADA');
  assert.equal((await db.empresa.findUniqueOrThrow({ where: { id: company.id } })).status, 'CANCELADA');
  assert.equal((await fetch(`${base}/api/tenant/access/cancel-trial`, { method: 'POST', headers: headers(admin.id, admin.email, 'ADMIN_EMPRESA') })).status, 409);
  process.stdout.write('Cancelamento do trial passou: apenas o administrador cancela; Mercado Pago confirmado e acesso encerrado sem nova cobrança.\n');
} finally {
  globalThis.fetch = nativeFetch;
  if (companyId) await db.empresa.delete({ where: { id: companyId } });
  if (planId) await db.plano.delete({ where: { id: planId } });
  server.close();
  await db.$disconnect();
  if (oldEnvironment === undefined) delete process.env.CSDK_PAYMENT_ENVIRONMENT; else process.env.CSDK_PAYMENT_ENVIRONMENT = oldEnvironment;
  if (oldToken === undefined) delete process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN; else process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN = oldToken;
}
