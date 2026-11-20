import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { apiRouter } from '../server/routes/apiRoutes.ts';
import { getPrisma } from '../server/lib/prisma.ts';
import { hashPassword } from '../server/lib/security.ts';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatória.');
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET de teste obrigatório.');
process.env.APP_URL = 'https://example.invalid';
process.env.CSDK_COOKIE_AUTH = '1';

const db = getPrisma();
const suffix = crypto.randomBytes(6).toString('hex');
const email = `smoke-${suffix}@example.invalid`;
const password = `Teste-${crypto.randomBytes(12).toString('hex')}`;
const app = express();
app.use(express.json());
app.use(apiRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Falha ao iniciar teste HTTP.');
const base = `http://127.0.0.1:${address.port}`;

let companyId: string | null = null;
try {
  const company = await db.empresa.create({
    data: {
      tipoDocumento: 'PJ',
      documento: `999999${suffix}`,
      razaoSocial: `Teste CSDK ${suffix}`,
      emailFinanceiro: email,
      whatsapp: '11999999999',
    },
  });
  companyId = company.id;
  const user = await db.usuario.create({
    data: { empresaId: company.id, nome: 'Teste Auth', email, senhaHash: hashPassword(password), perfil: 'ADMIN_EMPRESA' },
  });

  const forged = await fetch(`${base}/api/auth/session-token`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: user.id, email, perfil: 'SUPER_ADMIN' }),
  });
  assert.equal(forged.status, 410);
  assert.equal((await fetch(`${base}/api/billing/asaas/charge`, { method: 'POST' })).status, 410);
  assert.equal((await fetch(`${base}/api/auth/hash-password`, { method: 'POST' })).status, 410);
  assert.equal((await fetch(`${base}/api/tenant/evaluate-access`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'ATIVA' }),
  })).status, 410);
  for (const route of ['/api/certificates/render', '/api/documents/render-comprovante',
    '/api/documents/render-dossie-aplicacao', '/api/documents/render-carta-anuencia',
    '/api/documents/render-lista-presenca', '/api/documents/render-pacote-auditoria']) {
    assert.equal((await fetch(`${base}${route}`, { method: 'POST' })).status, 410);
  }

  const badLogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'errada' }),
  });
  assert.equal(badLogin.status, 401);
  const unknownEmail = `unknown-${suffix}@example.invalid`;
  for (let i = 0; i < 10; i++) {
    assert.equal((await fetch(`${base}/api/auth/login`, { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: unknownEmail, password: 'senha-errada' }),
    })).status, 401);
  }
  assert.equal((await fetch(`${base}/api/auth/login`, { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: unknownEmail, password: 'senha-errada' }),
  })).status, 429);

  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200);
  const { token } = await login.json() as { token: string };
  const cookieLogin = await fetch(`${base}/api/auth/login`, { method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://example.invalid' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(cookieLogin.status, 200);
  const cookie = cookieLogin.headers.get('set-cookie')?.split(';')[0] ?? '';
  assert.ok(cookie.startsWith('csdk_session='));
  assert.equal((await fetch(`${base}/api/auth/me`, { headers: { cookie } })).status, 200);
  assert.equal((await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { cookie } })).status, 403);
  const cookieLogout = await fetch(`${base}/api/auth/logout`, { method: 'POST',
    headers: { cookie, origin: 'https://example.invalid' },
  });
  assert.equal(cookieLogout.status, 204);
  assert.match(cookieLogout.headers.get('set-cookie') ?? '', /csdk_session=;/);
  const me = () => fetch(`${base}/api/auth/me`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal((await me()).status, 200);
  const noSubscription = await fetch(`${base}/api/tenant/access`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(noSubscription.status, 200);
  assert.equal((await noSubscription.json() as { permitido: boolean }).permitido, false);

  const mediaAsTenant = await fetch(`${base}/api/cms/upload-media`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ dataUrl: 'data:image/png;base64,AA==', fileName: 'test.png' }),
  });
  assert.equal(mediaAsTenant.status, 403);
  const otherTenantUpload = await fetch(`${base}/api/certificates/pptx-template/upload`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ empresaId: crypto.randomUUID(), fileName: 'test.pptx', base64Content: 'AA==' }),
  });
  assert.equal(otherTenantUpload.status, 403);

  await db.usuario.update({ where: { id: user.id }, data: { ativo: false } });
  assert.equal((await me()).status, 401);
  await db.usuario.update({ where: { id: user.id }, data: { ativo: true } });

  const logout = await fetch(`${base}/api/auth/logout-all`, {
    method: 'POST', headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(logout.status, 204);
  assert.equal((await me()).status, 401);
  assert.equal((await fetch(`${base}/api/auth/password-reset/request`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'invalido' }),
  })).status, 400);
  const resetToken = crypto.randomBytes(32).toString('base64url');
  await db.recuperacaoSenha.create({ data: {
    usuarioId: user.id,
    tokenHash: crypto.createHash('sha256').update(resetToken).digest('hex'),
    expiraEm: new Date(Date.now() + 30 * 60_000),
  } });
  const newPassword = `NovaSenha-${crypto.randomBytes(12).toString('hex')}`;
  const confirmReset = () => fetch(`${base}/api/auth/password-reset/confirm`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: resetToken, password: newPassword }),
  });
  assert.equal((await confirmReset()).status, 204);
  assert.equal((await confirmReset()).status, 410);
  assert.equal((await fetch(`${base}/api/auth/login`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
  })).status, 401);
  assert.equal((await fetch(`${base}/api/auth/login`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: newPassword }),
  })).status, 200);
  process.stdout.write('Auth smoke test passou: rotas legadas fechadas, login, escopo, revogação e redefinição de senha.\n');
} finally {
  if (companyId) await db.empresa.delete({ where: { id: companyId } });
  server.close();
  await db.$disconnect();
}
