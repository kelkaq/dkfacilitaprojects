import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { apiRouter } from '../server/routes/apiRoutes.ts';
import { getPrisma } from '../server/lib/prisma.ts';
import { hashPassword, signJwtToken } from '../server/lib/security.ts';

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('Banco e JWT de teste obrigatórios.');
}
const db = getPrisma();
const suffix = crypto.randomBytes(6).toString('hex');
const emailA = `ops-a-${suffix}@example.invalid`;
const emailB = `ops-b-${suffix}@example.invalid`;
const memberEmail = `ops-member-${suffix}@example.invalid`;
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(apiRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Falha HTTP.');
const base = `http://127.0.0.1:${address.port}`;
const companyIds: string[] = [];
const userIds: string[] = [];
let planId: string | null = null;
let addonId: string | null = null;

function bearer(userId: string, email: string, perfil: 'ADMIN_EMPRESA' | 'RT' | 'INSTRUTOR_TST', empresaId: string) {
  return { authorization: `Bearer ${signJwtToken({ userId, email, perfil, empresaId, versaoSessao: 0 })}`, 'content-type': 'application/json' };
}

function makeCpf(seed: number): string {
  const digits = String(seed).padStart(9, '0').slice(-9).split('').map(Number);
  const digit = (values: number[], weights: number[]) => {
    const remainder = values.reduce((sum, value, index) => sum + value * weights[index], 0) % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  digits.push(digit(digits, [10, 9, 8, 7, 6, 5, 4, 3, 2]));
  digits.push(digit(digits, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]));
  return digits.join('');
}

try {
  const plan = await db.plano.create({ data: { slug: `ops-${suffix}`, nome: 'Operações smoke', subtitulo: 'Teste',
    descricao: 'Plano de smoke test', precoMensalCentavos: 10000, limiteColaboradores: 1, limiteUsuarios: 3, limiteObras: 1 } });
  planId = plan.id;
  const companyA = await db.empresa.create({ data: { tipoDocumento: 'PJ', documento: '11222333000181', razaoSocial: 'Empresa Operacional A',
    emailFinanceiro: emailA, whatsapp: '11999999999', status: 'TRIAL', trialExpiraEm: new Date(Date.now() + 86400000) } });
  companyIds.push(companyA.id);
  const companyB = await db.empresa.create({ data: { tipoDocumento: 'PF', documento: '52998224725', razaoSocial: 'Titular Operacional B',
    emailFinanceiro: emailB, whatsapp: '21999999999', status: 'TRIAL', trialExpiraEm: new Date(Date.now() + 86400000) } });
  companyIds.push(companyB.id);
  const ownerA = await db.usuario.create({ data: { empresaId: companyA.id, nome: 'Admin A', email: emailA,
    senhaHash: hashPassword(crypto.randomBytes(24).toString('hex')), perfil: 'ADMIN_EMPRESA' } });
  userIds.push(ownerA.id);
  const ownerB = await db.usuario.create({ data: { empresaId: companyB.id, nome: 'Admin B', email: emailB,
    senhaHash: hashPassword(crypto.randomBytes(24).toString('hex')), perfil: 'ADMIN_EMPRESA' } });
  userIds.push(ownerB.id);
  const memberB = await db.usuario.create({ data: { empresaId: companyB.id, nome: 'Instrutor B', email: memberEmail,
    senhaHash: hashPassword(crypto.randomBytes(24).toString('hex')), perfil: 'INSTRUTOR_TST' } });
  userIds.push(memberB.id);
  const subscriptionA = await db.assinatura.create({ data: { empresaId: companyA.id, planoId: plan.id, ciclo: 'MENSAL',
    status: 'TRIAL', valorCentavos: 10000 } });
  await db.assinatura.create({ data: { empresaId: companyB.id, planoId: plan.id, ciclo: 'MENSAL', status: 'TRIAL', valorCentavos: 10000 } });
  const addon = await db.adicional.create({ data: { slug: `ops-addon-${suffix}`, nome: 'Vaga adicional de colaborador',
    descricao: 'Somente para o smoke test', precoMensalCentavos: 1000, recursoChave: 'colaboradores_extra', incrementoQtd: 1 } });
  addonId = addon.id;
  await db.assinaturaAdicional.create({ data: { assinaturaId: subscriptionA.id, adicionalId: addon.id, quantidade: 1, valorCentavos: 1000 } });

  const headersA = bearer(ownerA.id, emailA, 'ADMIN_EMPRESA', companyA.id);
  const headersB = bearer(ownerB.id, emailB, 'ADMIN_EMPRESA', companyB.id);
  const workspace = await fetch(`${base}/api/tenant/workspace`, { headers: headersA });
  assert.equal(workspace.status, 200);
  const workspaceSummary = await workspace.json() as { permitido: boolean; limites: { limiteColaboradores: number } };
  assert.equal(workspaceSummary.permitido, true);
  assert.equal(workspaceSummary.limites.limiteColaboradores, 2);

  const catalog = await fetch(`${base}/api/tenant/training-catalog`, { headers: headersA });
  assert.equal(catalog.status, 200);
  const catalogBody = await catalog.json() as { nrs: Array<{ variacoes: Array<{ slug: string; linhas: unknown[] }> }> };
  const firstVariation = catalogBody.nrs.find((nr) => nr.variacoes.length)?.variacoes[0];
  assert.ok(firstVariation && firstVariation.linhas.length > 0);
  const addTraining = () => fetch(`${base}/api/tenant/trainings`, { method: 'POST', headers: headersA,
    body: JSON.stringify({ variacaoSlug: firstVariation!.slug }) });
  const training = await addTraining();
  assert.equal(training.status, 201);
  const trainingBody = await training.json() as { empresaId: string; conteudoLinhas: Array<{ descricao: string }> };
  assert.equal(trainingBody.empresaId, companyA.id);
  assert.equal(trainingBody.conteudoLinhas.length, firstVariation!.linhas.length);
  assert.equal((await addTraining()).status, 409);
  const trainingsB = await fetch(`${base}/api/tenant/trainings`, { headers: headersB });
  assert.deepEqual(((await trainingsB.json()) as { treinamentos: unknown[] }).treinamentos, []);

  const createWork = (headers: HeadersInit, code: string, name: string) => fetch(`${base}/api/tenant/obras`, {
    method: 'POST', headers, body: JSON.stringify({ codigo: code, nome: name, clienteFinal: 'Cliente teste', localizacao: 'São Paulo - SP' }),
  });
  const workResponse = await createWork(headersA, 'OBRA-A', 'Obra A');
  assert.equal(workResponse.status, 201);
  const work = await workResponse.json() as { id: string; empresaId: string };
  assert.equal(work.empresaId, companyA.id);
  assert.equal((await createWork(headersA, 'OBRA-A', 'Código repetido')).status, 409);
  assert.equal((await createWork(headersA, 'OBRA-A2', 'Limite excedido')).status, 409);
  assert.equal((await fetch(`${base}/api/tenant/obras/${work.id}`, { method: 'PATCH', headers: headersB, body: JSON.stringify({ nome: 'Invasão' }) })).status, 404);
  assert.deepEqual(((await (await fetch(`${base}/api/tenant/obras`, { headers: headersB })).json()) as { obras: unknown[] }).obras, []);

  const newCollaborator = (cpf: string, empresaId?: string) => fetch(`${base}/api/tenant/colaboradores`, {
    method: 'POST', headers: headersA, body: JSON.stringify({ nome: 'Colaborador A', cpf, funcao: 'Operador', contratoObraId: work.id, empresaId }),
  });
  const collaboratorResponse = await newCollaborator(makeCpf(123456789), companyB.id);
  assert.equal(collaboratorResponse.status, 201);
  const collaborator = await collaboratorResponse.json() as { id: string; empresaId: string };
  assert.equal(collaborator.empresaId, companyA.id);
  assert.equal((await newCollaborator(makeCpf(123456789))).status, 409);
  const secondCollaborator = await newCollaborator(makeCpf(123456788));
  assert.equal(secondCollaborator.status, 201);
  assert.equal((await newCollaborator(makeCpf(123456787))).status, 409);
  assert.equal((await fetch(`${base}/api/tenant/colaboradores/${collaborator.id}`, { method: 'PATCH', headers: headersB,
    body: JSON.stringify({ nome: 'Alteração cruzada' }) })).status, 404);
  assert.equal((await fetch(`${base}/api/tenant/colaboradores`, { headers: bearer(memberB.id, memberEmail, 'INSTRUTOR_TST', companyB.id) })).status, 200);

  assert.equal((await fetch(`${base}/api/tenant/colaboradores/${collaborator.id}`, { method: 'PATCH', headers: headersA,
    body: JSON.stringify({ ativo: false }) })).status, 200);
  const replacement = await newCollaborator(makeCpf(123456787));
  assert.equal(replacement.status, 201);
  assert.equal((await fetch(`${base}/api/tenant/colaboradores/${collaborator.id}`, { method: 'PATCH', headers: headersA,
    body: JSON.stringify({ ativo: true }) })).status, 409);

  assert.equal((await fetch(`${base}/api/tenant/workspace`, { headers: bearer(memberB.id, memberEmail, 'INSTRUTOR_TST', companyB.id) })).status, 200);
  process.stdout.write('Operações do tenant passaram: catálogo e treinamento próprio, colaboradores e obras com limites, vínculo estrito por empresa e permissões de gravação.\n');
} finally {
  await db.auditoriaAcesso.deleteMany({ where: { usuarioId: { in: userIds } } });
  for (const empresaId of companyIds) await db.empresa.deleteMany({ where: { id: empresaId } });
  if (addonId) await db.adicional.deleteMany({ where: { id: addonId } });
  if (planId) await db.plano.deleteMany({ where: { id: planId } });
  server.close();
  await db.$disconnect();
}
