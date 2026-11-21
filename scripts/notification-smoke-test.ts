import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { apiRouter } from '../server/routes/apiRoutes.ts';
import { getPrisma } from '../server/lib/prisma.ts';
import { hashPassword, signJwtToken } from '../server/lib/security.ts';

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('Banco isolado de teste e JWT de teste são obrigatórios.');
}
const db = getPrisma();
const suffix = crypto.randomBytes(6).toString('hex');
const app = express();
app.use(express.json());
app.use(apiRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Falha ao iniciar servidor de teste.');
const base = `http://127.0.0.1:${address.port}`;
const companyIds: string[] = [];
const userIds: string[] = [];
const noticeIds: string[] = [];
let planId: string | null = null;

function headersFor(user: { id: string; email: string; perfil: 'SUPER_ADMIN' | 'ADMIN_EMPRESA' | 'RT'; empresaId: string | null }) {
  const token = signJwtToken({ userId: user.id, email: user.email, perfil: user.perfil, empresaId: user.empresaId, versaoSessao: 0 });
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

async function createNotice(headers: Record<string, string>, input: Record<string, unknown>): Promise<string> {
  const response = await fetch(`${base}/api/admin/platform-notices`, { method: 'POST', headers, body: JSON.stringify(input) });
  assert.equal(response.status, 201, (await response.clone().text()).slice(0, 400));
  const body = await response.json() as { id: string };
  noticeIds.push(body.id);
  return body.id;
}

async function tenantInbox(headers: Record<string, string>) {
  const response = await fetch(`${base}/api/tenant/notifications`, { headers });
  assert.equal(response.status, 200);
  return response.json() as Promise<{ avisos: Array<{ id: string; comunicadoId: string; titulo: string; lida: boolean; confirmada: boolean; podeConfirmar: boolean }>; naoLidas: number }>;
}

try {
  const plan = await db.plano.create({ data: { slug: `notice-test-${suffix}`, nome: 'Avisos smoke test', subtitulo: 'Teste',
    descricao: 'Plano descartável do teste', precoMensalCentavos: 10000, limiteColaboradores: 5, limiteUsuarios: 4, limiteObras: 2 } });
  planId = plan.id;
  const companyA = await db.empresa.create({ data: { tipoDocumento: 'PJ', documento: `91${suffix.slice(0, 12)}`, razaoSocial: `Avisos Empresa A ${suffix}`,
    emailFinanceiro: `aviso-a-${suffix}@example.invalid`, whatsapp: '11999999999', status: 'TRIAL', trialExpiraEm: new Date(Date.now() + 86_400_000) } });
  companyIds.push(companyA.id);
  const companyB = await db.empresa.create({ data: { tipoDocumento: 'PF', documento: `82${suffix.slice(0, 9)}`, razaoSocial: `Avisos Empresa B ${suffix}`,
    emailFinanceiro: `aviso-b-${suffix}@example.invalid`, whatsapp: '21999999999', status: 'ATIVA' } });
  companyIds.push(companyB.id);
  const owner = await db.usuario.create({ data: { nome: 'Owner Smoke', email: `owner-${suffix}@example.invalid`, senhaHash: hashPassword(crypto.randomBytes(32).toString('hex')), perfil: 'SUPER_ADMIN' } });
  userIds.push(owner.id);
  const adminA = await db.usuario.create({ data: { empresaId: companyA.id, nome: 'Admin A', email: `admin-a-${suffix}@example.invalid`, senhaHash: hashPassword(crypto.randomBytes(32).toString('hex')), perfil: 'ADMIN_EMPRESA' } });
  userIds.push(adminA.id);
  const rtA = await db.usuario.create({ data: { empresaId: companyA.id, nome: 'RT A', email: `rt-a-${suffix}@example.invalid`, senhaHash: hashPassword(crypto.randomBytes(32).toString('hex')), perfil: 'RT' } });
  userIds.push(rtA.id);
  const adminB = await db.usuario.create({ data: { empresaId: companyB.id, nome: 'Admin B', email: `admin-b-${suffix}@example.invalid`, senhaHash: hashPassword(crypto.randomBytes(32).toString('hex')), perfil: 'ADMIN_EMPRESA' } });
  userIds.push(adminB.id);
  await db.assinatura.create({ data: { empresaId: companyA.id, planoId: plan.id, ciclo: 'MENSAL', status: 'TRIAL', valorCentavos: 10000 } });
  await db.assinatura.create({ data: { empresaId: companyB.id, planoId: plan.id, ciclo: 'MENSAL', status: 'ATIVA', valorCentavos: 10000 } });

  const ownerHeaders = headersFor({ id: owner.id, email: owner.email, perfil: 'SUPER_ADMIN', empresaId: null });
  const adminAHeaders = headersFor({ id: adminA.id, email: adminA.email, perfil: 'ADMIN_EMPRESA', empresaId: companyA.id });
  const rtAHeaders = headersFor({ id: rtA.id, email: rtA.email, perfil: 'RT', empresaId: companyA.id });
  const adminBHeaders = headersFor({ id: adminB.id, email: adminB.email, perfil: 'ADMIN_EMPRESA', empresaId: companyB.id });

  assert.equal((await fetch(`${base}/api/admin/platform-notices`, { headers: adminAHeaders })).status, 403, 'Usuário de empresa não pode administrar avisos globais.');
  assert.equal((await fetch(`${base}/api/admin/session`, { method: 'POST', headers: { authorization: 'Bearer invalid-token' } })).status, 401);
  assert.equal((await fetch(`${base}/api/tenant/notifications`, { headers: ownerHeaders })).status, 403);
  const targets = await fetch(`${base}/api/admin/notification-targets`, { headers: ownerHeaders });
  assert.equal(targets.status, 200);

  const now = new Date();
  const baseNotice = { titulo: `Aviso global ${suffix}`, mensagem: 'Comunicado para os dois tenants.', tipo: 'INFORMATIVO',
    exibirPopup: true, exigirConfirmacao: false, link: '/ajuda', publicoAlvo: 'TODAS', empresaIds: [], usuarioIds: [],
    agendadoInicioIso: new Date(now.getTime() - 60_000).toISOString(), agendadoFimIso: '', fusoHorario: 'America/Sao_Paulo', repeticao: 'UNICO', status: 'ATIVO' };
  const globalId = await createNotice(ownerHeaders, baseNotice);
  const inboxA = await tenantInbox(adminAHeaders);
  const inboxB = await tenantInbox(adminBHeaders);
  const deliveryA = inboxA.avisos.find((item) => item.comunicadoId === globalId);
  const deliveryB = inboxB.avisos.find((item) => item.comunicadoId === globalId);
  assert.ok(deliveryA && deliveryB, 'Aviso global aparece nos dois tenants.');
  assert.equal(deliveryA.lida, false);
  assert.equal(deliveryB.lida, false);
  assert.equal((await fetch(`${base}/api/tenant/notifications/${deliveryA.id}`, { method: 'PATCH', headers: adminBHeaders, body: JSON.stringify({ action: 'read' }) })).status, 404,
    'Um tenant não altera a entrega de outro tenant.');
  assert.equal((await fetch(`${base}/api/tenant/notifications/${deliveryA.id}`, { method: 'PATCH', headers: adminAHeaders, body: JSON.stringify({ action: 'read' }) })).status, 204);
  assert.equal((await tenantInbox(adminAHeaders)).avisos.find((item) => item.comunicadoId === globalId)?.lida, true);
  assert.equal((await tenantInbox(adminBHeaders)).avisos.find((item) => item.comunicadoId === globalId)?.lida, false,
    'Estado de leitura é independente por usuário.');
  assert.equal((await fetch(`${base}/api/admin/platform-notices/${globalId}`, { method: 'DELETE', headers: ownerHeaders })).status, 409,
    'Entrega registrada permanece no histórico.');

  const companyNotice = await createNotice(ownerHeaders, { ...baseNotice, titulo: `Aviso empresa ${suffix}`, publicoAlvo: 'EMPRESAS', empresaIds: [companyA.id] });
  assert.ok((await tenantInbox(adminAHeaders)).avisos.some((item) => item.comunicadoId === companyNotice));
  assert.ok(!(await tenantInbox(adminBHeaders)).avisos.some((item) => item.comunicadoId === companyNotice));

  const roleNotice = await createNotice(ownerHeaders, { ...baseNotice, titulo: `Aviso RT ${suffix}`, publicoAlvo: 'PERFIL', perfilAlvo: 'RT' });
  assert.ok((await tenantInbox(rtAHeaders)).avisos.some((item) => item.comunicadoId === roleNotice));
  assert.ok(!(await tenantInbox(adminAHeaders)).avisos.some((item) => item.comunicadoId === roleNotice));

  const confirmationId = await createNotice(ownerHeaders, { ...baseNotice, titulo: `Confirmação ${suffix}`, exigirConfirmacao: true });
  const confirmation = (await tenantInbox(adminBHeaders)).avisos.find((item) => item.comunicadoId === confirmationId);
  assert.ok(confirmation?.podeConfirmar);
  assert.equal((await fetch(`${base}/api/tenant/notifications/${confirmation.id}`, { method: 'PATCH', headers: adminBHeaders, body: JSON.stringify({ action: 'confirm' }) })).status, 204);
  assert.equal((await tenantInbox(adminBHeaders)).avisos.find((item) => item.comunicadoId === confirmationId)?.confirmada, true);

  const futureId = await createNotice(ownerHeaders, { ...baseNotice, titulo: `Agendado ${suffix}`, status: 'AGENDADO',
    agendadoInicioIso: new Date(Date.now() + 60_000).toISOString() });
  assert.ok(!(await tenantInbox(adminBHeaders)).avisos.some((item) => item.comunicadoId === futureId), 'Aviso agendado não aparece antes do horário.');
  await db.comunicadoPlataforma.update({ where: { id: futureId }, data: { inicioEm: new Date(Date.now() - 1000) } });
  assert.ok((await tenantInbox(adminBHeaders)).avisos.some((item) => item.comunicadoId === futureId), 'Aviso aparece quando o horário chega.');

  const repeatId = await createNotice(ownerHeaders, { ...baseNotice, titulo: `Repetição ${suffix}`, repeticao: 'DIARIO',
    agendadoInicioIso: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() });
  await tenantInbox(adminAHeaders);
  await tenantInbox(adminAHeaders);
  assert.equal(await db.entregaComunicado.count({ where: { comunicadoId: repeatId, usuarioId: adminA.id } }), 1,
    'Recarregar duas vezes não duplica a ocorrência.');
  await db.comunicadoPlataforma.update({ where: { id: repeatId }, data: { inicioEm: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } });
  await tenantInbox(adminAHeaders);
  assert.equal(await db.entregaComunicado.count({ where: { comunicadoId: repeatId, usuarioId: adminA.id } }), 2,
    'A repetição diária cria uma nova entrega na ocorrência seguinte.');

  const adminList = await fetch(`${base}/api/admin/platform-notices`, { headers: ownerHeaders });
  assert.equal(adminList.status, 200);
  const listed = await adminList.json() as { comunicados: Array<{ id: string; entregas: number; lidas: number }> };
  assert.ok(listed.comunicados.some((item) => item.id === globalId && item.entregas >= 2 && item.lidas >= 1));

  console.log('PASS: escopo por tenant/perfil/usuário, agenda, recorrência, confirmação, histórico e permissões de comunicados.');
} finally {
  if (noticeIds.length) await db.comunicadoPlataforma.deleteMany({ where: { id: { in: noticeIds } } }).catch(() => {});
  if (userIds.length) await db.usuario.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  if (companyIds.length) await db.empresa.deleteMany({ where: { id: { in: companyIds } } }).catch(() => {});
  if (planId) await db.plano.delete({ where: { id: planId } }).catch(() => {});
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
}
