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
const emailA = `exam-a-${suffix}@example.invalid`;
const emailB = `exam-b-${suffix}@example.invalid`;
const app = express();
app.use(express.json({ limit: '4mb' }));
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
const pngSignature = `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1]).toString('base64')}`;

function bearer(userId: string, email: string, empresaId: string) {
  return { authorization: `Bearer ${signJwtToken({ userId, email, perfil: 'ADMIN_EMPRESA', empresaId, versaoSessao: 0 })}`, 'content-type': 'application/json' };
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
  const plan = await db.plano.create({ data: { slug: `exam-${suffix}`, nome: 'Provas smoke', subtitulo: 'Teste',
    descricao: 'Plano de smoke test', precoMensalCentavos: 10000, limiteColaboradores: 5, limiteUsuarios: 3, limiteObras: 2 } });
  planId = plan.id;
  const signerConfig = [{ tipo: 'COLABORADOR', rotulo: 'Participante', obrigatoria: true }];
  const companyA = await db.empresa.create({ data: { tipoDocumento: 'PJ', documento: '11222333000181', razaoSocial: 'Empresa Prova A',
    emailFinanceiro: emailA, whatsapp: '11999999999', status: 'TRIAL', trialExpiraEm: new Date(Date.now() + 86400000),
    assinaturasCertificado: signerConfig } });
  companyIds.push(companyA.id);
  const companyB = await db.empresa.create({ data: { tipoDocumento: 'PF', documento: '52998224725', razaoSocial: 'Titular Prova B',
    emailFinanceiro: emailB, whatsapp: '21999999999', status: 'TRIAL', trialExpiraEm: new Date(Date.now() + 86400000) } });
  companyIds.push(companyB.id);
  const ownerA = await db.usuario.create({ data: { empresaId: companyA.id, nome: 'Admin Prova A', email: emailA,
    senhaHash: hashPassword(crypto.randomBytes(24).toString('hex')), perfil: 'ADMIN_EMPRESA' } });
  userIds.push(ownerA.id);
  const ownerB = await db.usuario.create({ data: { empresaId: companyB.id, nome: 'Admin Prova B', email: emailB,
    senhaHash: hashPassword(crypto.randomBytes(24).toString('hex')), perfil: 'ADMIN_EMPRESA' } });
  userIds.push(ownerB.id);
  const subscriptionA = await db.assinatura.create({ data: { empresaId: companyA.id, planoId: plan.id, ciclo: 'MENSAL', status: 'TRIAL', valorCentavos: 10000 } });
  await db.assinatura.create({ data: { empresaId: companyB.id, planoId: plan.id, ciclo: 'MENSAL', status: 'TRIAL', valorCentavos: 10000 } });
  const addon = await db.adicional.create({ data: { slug: `exam-addon-${suffix}`, nome: 'Questão de teste', descricao: 'Somente para o teste',
    precoMensalCentavos: 0, recursoChave: 'alertas_whatsapp', incrementoQtd: 1 } });
  addonId = addon.id;
  await db.assinaturaAdicional.create({ data: { assinaturaId: subscriptionA.id, adicionalId: addon.id, quantidade: 1, valorCentavos: 0 } });

  const headersA = bearer(ownerA.id, emailA, companyA.id);
  const headersB = bearer(ownerB.id, emailB, companyB.id);
  const catalog = await (await fetch(`${base}/api/tenant/training-catalog`, { headers: headersA })).json() as { nrs: Array<{ variacoes: Array<{ slug: string }> }> };
  const variation = catalog.nrs.find((nr) => nr.variacoes.length)?.variacoes[0];
  assert.ok(variation);
  const createdTraining = await fetch(`${base}/api/tenant/trainings`, { method: 'POST', headers: headersA,
    body: JSON.stringify({ variacaoSlug: variation.slug }) });
  assert.equal(createdTraining.status, 201);
  const training = await createdTraining.json() as { id: string; empresaId: string };
  assert.equal(training.empresaId, companyA.id);
  assert.equal((await fetch(`${base}/api/tenant/trainings/${training.id}/questions`, { method: 'POST', headers: headersB,
    body: JSON.stringify({ enunciado: 'Questão de outro tenant?', alternativas: [{ id: 'A', texto: 'Sim' }, { id: 'B', texto: 'Não' }], correta: 'A' }) })).status, 404);

  const addQuestion = (enunciado: string, correta: string) => fetch(`${base}/api/tenant/trainings/${training.id}/questions`, {
    method: 'POST', headers: headersA, body: JSON.stringify({ enunciado, alternativas: [{ id: 'A', texto: 'Opção correta' }, { id: 'B', texto: 'Opção incorreta' }], correta }),
  });
  assert.equal((await addQuestion('Questão um para validar o treinamento?', 'A')).status, 201);
  assert.equal((await addQuestion('Questão dois para validar o treinamento?', 'B')).status, 201);

  const employeeCpf = makeCpf(987654321);
  const collaboratorResponse = await fetch(`${base}/api/tenant/colaboradores`, { method: 'POST', headers: headersA,
    body: JSON.stringify({ nome: 'Participante da Prova', cpf: employeeCpf, funcao: 'Operador' }) });
  assert.equal(collaboratorResponse.status, 201);
  const classResponse = await fetch(`${base}/api/tenant/classes`, { method: 'POST', headers: headersA, body: JSON.stringify({
    codigoTurma: 'PROVA-001', titulo: 'Prova de homologação', treinamentoId: training.id,
    dataRealizacao: new Date().toISOString().slice(0, 10), modoIdentificacao: 'CPF_PIN', pin: '54321',
  }) });
  assert.equal(classResponse.status, 201);
  const turma = await classResponse.json() as { id: string; tokenPublico: string; pinAcesso?: string; linkPublico: string };
  assert.equal(turma.tokenPublico.length, 43);
  assert.equal(turma.pinAcesso, undefined);
  assert.ok(turma.linkPublico.includes('csdk_prova='));
  const storedClass = await db.turmaAplicacao.findUniqueOrThrow({ where: { id: turma.id } });
  assert.notEqual(storedClass.pinAcesso, '54321');
  assert.equal((await fetch(`${base}/api/tenant/classes`, { headers: headersB })).status, 200);
  assert.deepEqual(((await (await fetch(`${base}/api/tenant/classes`, { headers: headersB })).json()) as { turmas: unknown[] }).turmas, []);
  const storedQuestions = await db.bancoQuestao.findMany({ where: { empresaId: companyA.id, treinamentoId: training.id, ativa: true } });

  const start = (name: string, pin: string) => fetch(`${base}/api/public/exams/${turma.tokenPublico}/start`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nome: name, cpf: employeeCpf, pin }),
  });
  assert.equal((await start('Nome incorreto', '54321')).status, 404);
  assert.equal((await start('Participante da Prova', '00000')).status, 404);
  const started = await start('Participante da Prova', '54321');
  assert.equal(started.status, 201);
  const exam = await started.json() as { tentativaId: string; assinaturaColaboradorObrigatoria: boolean; questoes: Array<{ id: string; alternativas: Array<{ id: string }> }> };
  assert.equal(exam.assinaturaColaboradorObrigatoria, true);
  assert.equal(exam.questoes.length, 2);
  const resumed = await start('Participante da Prova', '54321');
  assert.equal(resumed.status, 201);
  assert.equal(((await resumed.json()) as { tentativaId: string }).tentativaId, exam.tentativaId);
  const answers = Object.fromEntries(exam.questoes.map((question) => [question.id, storedQuestions.find((item) => item.id === question.id)?.correta]));
  assert.ok(Object.values(answers).every((answer) => typeof answer === 'string'));
  const finish = (payload: unknown) => fetch(`${base}/api/public/exams/${turma.tokenPublico}/finish`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  assert.equal((await finish({ tentativaId: exam.tentativaId, respostas: answers })).status, 400);
  const completed = await finish({ tentativaId: exam.tentativaId, respostas: answers, assinaturaDataUrl: pngSignature });
  assert.equal(completed.status, 200);
  const result = await completed.json() as { status: string; notaPercentual: number; acertos: number; totalQuestoes: number };
  assert.equal(result.status, 'APROVADO');
  assert.equal(result.notaPercentual, 100);
  assert.equal(result.acertos, 2);
  assert.equal(result.totalQuestoes, 2);
  assert.equal((await finish({ tentativaId: exam.tentativaId, respostas: answers, assinaturaDataUrl: pngSignature })).status, 404);

  assert.equal((await fetch(`${base}/api/tenant/classes/${turma.id}`, { method: 'PATCH', headers: headersB, body: JSON.stringify({ status: 'ENCERRADA' }) })).status, 404);
  assert.equal((await fetch(`${base}/api/tenant/classes/${turma.id}`, { method: 'PATCH', headers: headersA, body: JSON.stringify({ status: 'ENCERRADA' }) })).status, 200);
  assert.equal((await start('Participante da Prova', '54321')).status, 410);
  process.stdout.write('Provas do tenant passaram: questões privadas, aula vinculada ao tenant, PIN protegido, identidade do participante, correção no servidor, assinatura obrigatória e encerramento.\n');
} finally {
  await db.auditoriaAcesso.deleteMany({ where: { usuarioId: { in: userIds } } });
  for (const empresaId of companyIds) await db.empresa.deleteMany({ where: { id: empresaId } });
  if (addonId) await db.adicional.deleteMany({ where: { id: addonId } });
  if (planId) await db.plano.deleteMany({ where: { id: planId } });
  server.close();
  await db.$disconnect();
}
