import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { apiRouter } from '../server/routes/apiRoutes.ts';
import { getPrisma } from '../server/lib/prisma.ts';
import { hashPassword, signJwtToken } from '../server/lib/security.ts';

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) throw new Error('Banco e JWT de teste obrigatórios.');
const db = getPrisma();
const suffix = crypto.randomBytes(6).toString('hex');
process.env.RESEND_API_KEY = 're_smoke_test';
process.env.EMAIL_FROM = 'Teste <noreply@example.invalid>';
process.env.APP_URL = 'https://example.invalid';
const nativeFetch = globalThis.fetch;
let inviteToken = '';
globalThis.fetch = ((url: Parameters<typeof fetch>[0], init?: RequestInit) => {
  if (String(url) === 'https://api.resend.com/emails') {
    const body = JSON.parse(String(init?.body)) as { text: string };
    inviteToken = new URL(body.text.match(/https:\/\/\S+/)?.[0] ?? '').searchParams.get('token') ?? '';
    return Promise.resolve(new Response(JSON.stringify({ id: 'email-test' }), { status: 200 }));
  }
  return nativeFetch(url, init);
}) as typeof fetch;
const app = express();
app.use(express.json());
app.use(apiRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Falha HTTP.');
const base = `http://127.0.0.1:${address.port}`;
let companyId: string | null = null;
let planId: string | null = null;
try {
  const plan = await db.plano.create({ data: {
    slug: `invite-${suffix}`, nome: 'Teste', subtitulo: 'Teste', descricao: 'Teste',
    precoMensalCentavos: 1000, limiteColaboradores: 1, limiteUsuarios: 2, limiteObras: 1,
  } });
  planId = plan.id;
  const company = await db.empresa.create({ data: { tipoDocumento: 'PJ', documento: `inv-${suffix}`,
    razaoSocial: 'Empresa teste', emailFinanceiro: `admin-${suffix}@example.invalid`, whatsapp: '11999999999', status: 'ATIVA' } });
  companyId = company.id;
  await db.assinatura.create({ data: { empresaId: company.id, planoId: plan.id, status: 'ATIVA', valorCentavos: 1000 } });
  const admin = await db.usuario.create({ data: { empresaId: company.id, nome: 'Admin',
    email: `admin-${suffix}@example.invalid`, senhaHash: hashPassword('Senha-de-teste-123'), perfil: 'ADMIN_EMPRESA' } });
  const jwt = signJwtToken({ userId: admin.id, email: admin.email, perfil: admin.perfil,
    empresaId: company.id, versaoSessao: admin.versaoSessao });
  const post = (route: string, body: object, auth = false) => fetch(`${base}${route}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${jwt}` } : {}) },
    body: JSON.stringify(body),
  });
  const inviteEmail = `user-${suffix}@example.invalid`;
  const invited = await post('/api/tenant/users/invitations', { email: inviteEmail, perfil: 'RT' }, true);
  assert.equal(invited.status, 201);
  assert.equal(inviteToken.length, 43);
  assert.equal((await post('/api/tenant/users/invitations', { email: `other-${suffix}@example.invalid`, perfil: 'RT' }, true)).status, 409);
  const password = 'Senha-de-convite-123';
  assert.equal((await post('/api/auth/invitations/accept', { token: inviteToken, nome: 'Responsável Técnico', password })).status, 201);
  assert.equal((await post('/api/auth/invitations/accept', { token: inviteToken, nome: 'Responsável Técnico', password })).status, 410);
  assert.equal((await post('/api/tenant/users/invitations', { email: `another-${suffix}@example.invalid`, perfil: 'RT' }, true)).status, 409);
  const list = await fetch(`${base}/api/tenant/users`, { headers: { authorization: `Bearer ${jwt}` } });
  assert.equal(list.status, 200);
  const body = await list.json() as { users: unknown[]; limiteUsuarios: number };
  assert.equal(body.users.length, 2);
  assert.equal(body.limiteUsuarios, 2);
  process.stdout.write('Convites passaram: cota com pendentes, aceite único e dois usuários da empresa.\n');
} finally {
  globalThis.fetch = nativeFetch;
  if (companyId) await db.empresa.delete({ where: { id: companyId } });
  if (planId) await db.plano.delete({ where: { id: planId } });
  server.close();
  await db.$disconnect();
}
