import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { apiRouter } from '../server/routes/apiRoutes.ts';
import { getPrisma } from '../server/lib/prisma.ts';
import { hashPassword, signJwtToken } from '../server/lib/security.ts';

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('Banco e JWT de teste obrigatórios.');
}
const db = getPrisma();
const suffix = crypto.randomBytes(6).toString('hex');
const emailA = `owner-a-${suffix}@example.invalid`;
const emailB = `owner-b-${suffix}@example.invalid`;
const memberBEmail = `member-b-${suffix}@example.invalid`;
const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(apiRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Falha HTTP.');
const base = `http://127.0.0.1:${address.port}`;
let planId: string | null = null;
const companyIds: string[] = [];
const userIds: string[] = [];
let logoDirectory: string | null = null;
let logoPath: string | null = null;

function bearer(userId: string, email: string, perfil: 'ADMIN_EMPRESA' | 'RT', empresaId: string) {
  const token = signJwtToken({ userId, email, perfil, empresaId, versaoSessao: 0 });
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

try {
  const plan = await db.plano.create({ data: { slug: `settings-${suffix}`, nome: 'Teste de identidade', subtitulo: 'Teste',
    descricao: 'Teste isolado', precoMensalCentavos: 10000, limiteColaboradores: 5, limiteUsuarios: 3, limiteObras: 2 } });
  planId = plan.id;
  const companyA = await db.empresa.create({ data: { tipoDocumento: 'PF', documento: '52998224725', razaoSocial: 'Pessoa A',
    emailFinanceiro: emailA, whatsapp: '11999999999', status: 'TRIAL', trialExpiraEm: new Date(Date.now() + 86400000) } });
  companyIds.push(companyA.id);
  const companyB = await db.empresa.create({ data: { tipoDocumento: 'PJ', documento: '11222333000181', razaoSocial: 'Empresa B',
    emailFinanceiro: emailB, whatsapp: '21999999999', status: 'TRIAL', trialExpiraEm: new Date(Date.now() + 86400000) } });
  companyIds.push(companyB.id);
  const ownerA = await db.usuario.create({ data: { empresaId: companyA.id, nome: 'Administradora A', email: emailA,
    senhaHash: hashPassword(crypto.randomBytes(24).toString('hex')), perfil: 'ADMIN_EMPRESA' } });
  userIds.push(ownerA.id);
  const ownerB = await db.usuario.create({ data: { empresaId: companyB.id, nome: 'Administradora B', email: emailB,
    senhaHash: hashPassword(crypto.randomBytes(24).toString('hex')), perfil: 'ADMIN_EMPRESA' } });
  userIds.push(ownerB.id);
  const memberB = await db.usuario.create({ data: { empresaId: companyB.id, nome: 'Membro B', email: memberBEmail,
    senhaHash: hashPassword(crypto.randomBytes(24).toString('hex')), perfil: 'RT' } });
  userIds.push(memberB.id);

  const settingsA = await fetch(`${base}/api/tenant/settings`, { headers: bearer(ownerA.id, emailA, 'ADMIN_EMPRESA', companyA.id) });
  assert.equal(settingsA.status, 200);
  const initialA = await settingsA.json() as { corPrimaria: string; temLogo: boolean; editavel: boolean; templates: Array<{ id: string }> };
  assert.equal(initialA.temLogo, false);
  assert.equal(initialA.editavel, true);
  assert.ok(initialA.templates.length > 0);

  const primaryTemplate = await db.modeloCertificadoGlobal.findFirstOrThrow({ where: { ativo: true, categoria: 'GRATUITO' }, orderBy: { ordem: 'asc' } });
  const saveA = await fetch(`${base}/api/tenant/settings`, { method: 'PATCH', headers: bearer(ownerA.id, emailA, 'ADMIN_EMPRESA', companyA.id), body: JSON.stringify({
    nomeFantasia: 'Pessoa A Personalizada', emailFinanceiro: emailA, whatsapp: '11988887777', endereco: 'Rua A, 10',
    cidade: 'São Paulo', uf: 'SP', corPrimaria: '#123ABC', corSecundaria: '#ABC123', prefixoCertificado: 'PFA',
    modeloCertificadoId: primaryTemplate.id,
    assinaturasCertificado: [
      { tipo: 'COLABORADOR', rotulo: 'Colaborador', obrigatoria: true },
      { tipo: 'RESPONSAVEL_TECNICO', rotulo: 'Responsável técnico', obrigatoria: true },
    ],
  }) });
  assert.equal(saveA.status, 200);

  const logos = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1]);
  const badLogo = await fetch(`${base}/api/tenant/settings/logo`, { method: 'POST', headers: bearer(ownerB.id, emailB, 'ADMIN_EMPRESA', companyB.id),
    body: JSON.stringify({ dataUrl: `data:image/png;base64,${Buffer.from('not-a-png-image').toString('base64')}` }) });
  assert.equal(badLogo.status, 400);
  const upload = await fetch(`${base}/api/tenant/settings/logo`, { method: 'POST', headers: bearer(ownerA.id, emailA, 'ADMIN_EMPRESA', companyA.id),
    body: JSON.stringify({ dataUrl: `data:image/png;base64,${logos.toString('base64')}` }) });
  assert.equal(upload.status, 200);
  const uploadedCompany = await db.empresa.findUniqueOrThrow({ where: { id: companyA.id }, select: { logoUrl: true } });
  const uploadedMatch = uploadedCompany.logoUrl?.match(/^tenant-logo:([0-9a-f-]{36}\.(?:png|jpg|webp))$/i);
  if (uploadedMatch) {
    const storageRoot = path.resolve(process.cwd(), 'storage', 'tenant-logos');
    logoDirectory = path.resolve(storageRoot, companyA.id);
    if (!logoDirectory.startsWith(`${storageRoot}${path.sep}`)) throw new Error('Logo path escaped tenant storage.');
    logoPath = path.resolve(logoDirectory, uploadedMatch[1]);
    if (!logoPath.startsWith(`${logoDirectory}${path.sep}`)) throw new Error('Logo path escaped tenant directory.');
  }

  const verifyA = await fetch(`${base}/api/tenant/settings`, { headers: bearer(ownerA.id, emailA, 'ADMIN_EMPRESA', companyA.id) });
  const savedA = await verifyA.json() as { nomeFantasia: string; corPrimaria: string; corSecundaria: string; prefixoCertificado: string;
    modeloCertificadoId: string; onboardingConcluido: boolean; temLogo: boolean; assinaturasCertificado: Array<{ tipo: string }> };
  assert.equal(savedA.nomeFantasia, 'Pessoa A Personalizada');
  assert.equal(savedA.corPrimaria, '#123ABC');
  assert.equal(savedA.corSecundaria, '#ABC123');
  assert.equal(savedA.prefixoCertificado, 'PFA');
  assert.equal(savedA.modeloCertificadoId, primaryTemplate.id);
  assert.equal(savedA.onboardingConcluido, true);
  assert.equal(savedA.temLogo, true);
  assert.deepEqual(savedA.assinaturasCertificado.map((signer) => signer.tipo), ['COLABORADOR', 'RESPONSAVEL_TECNICO']);

  const imageA = await fetch(`${base}/api/tenant/settings/logo`, { headers: bearer(ownerA.id, emailA, 'ADMIN_EMPRESA', companyA.id) });
  assert.equal(imageA.status, 200);
  assert.deepEqual(Buffer.from(await imageA.arrayBuffer()), logos);
  const settingsB = await fetch(`${base}/api/tenant/settings`, { headers: bearer(ownerB.id, emailB, 'ADMIN_EMPRESA', companyB.id) });
  const beforeB = await settingsB.json() as { corPrimaria: string; temLogo: boolean; editavel: boolean };
  assert.equal(beforeB.corPrimaria, '#0F172A');
  assert.equal(beforeB.temLogo, false);
  assert.equal(beforeB.editavel, true);
  assert.equal((await fetch(`${base}/api/tenant/settings/logo`, { headers: bearer(ownerB.id, emailB, 'ADMIN_EMPRESA', companyB.id) })).status, 404);
  const crossTenantAttempt = await fetch(`${base}/api/tenant/settings`, { method: 'PATCH', headers: bearer(ownerB.id, emailB, 'ADMIN_EMPRESA', companyB.id),
    body: JSON.stringify({ empresaId: companyA.id, nomeFantasia: 'Empresa B', emailFinanceiro: emailB, whatsapp: '21988887777',
      endereco: '', cidade: '', uf: '', corPrimaria: '#EEDDCC', corSecundaria: '#CCBBAA', prefixoCertificado: 'EMPB',
      modeloCertificadoId: primaryTemplate.id, assinaturasCertificado: [{ tipo: 'EMPRESA', rotulo: 'Empresa', obrigatoria: true }] }) });
  assert.equal(crossTenantAttempt.status, 200);
  const afterCrossAttemptA = await db.empresa.findUniqueOrThrow({ where: { id: companyA.id }, select: { corPrimaria: true, logoUrl: true } });
  const afterCrossAttemptB = await db.empresa.findUniqueOrThrow({ where: { id: companyB.id }, select: { corPrimaria: true, logoUrl: true } });
  assert.equal(afterCrossAttemptA.corPrimaria, '#123ABC');
  assert.equal(afterCrossAttemptA.logoUrl?.startsWith('tenant-logo:'), true);
  assert.equal(afterCrossAttemptB.corPrimaria, '#EEDDCC');
  assert.equal(afterCrossAttemptB.logoUrl, null);

  const memberSettings = await fetch(`${base}/api/tenant/settings`, { headers: bearer(memberB.id, memberBEmail, 'RT', companyB.id) });
  assert.equal(((await memberSettings.json()) as { editavel: boolean }).editavel, false);
  const deniedEdit = await fetch(`${base}/api/tenant/settings`, { method: 'PATCH', headers: bearer(memberB.id, memberBEmail, 'RT', companyB.id),
    body: JSON.stringify({ corPrimaria: '#000000' }) });
  assert.equal(deniedEdit.status, 403);

  process.stdout.write('Configuração do tenant passou: preferências e logo isolados por empresa, assinaturas próprias, template ativo e edição restrita ao administrador.\n');
} finally {
  if (logoPath && fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
  if (logoDirectory && fs.existsSync(logoDirectory)) fs.rmdirSync(logoDirectory);
  await db.auditoriaAcesso.deleteMany({ where: { usuarioId: { in: userIds } } });
  for (const id of companyIds) await db.empresa.deleteMany({ where: { id } });
  if (planId) await db.plano.deleteMany({ where: { id: planId } });
  server.close();
  await db.$disconnect();
}
