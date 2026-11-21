import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { Prisma, ModoIdentificacaoProva } from '@prisma/client';
import { getPrisma } from '../lib/prisma.ts';
import { validateHolderDocument } from '../lib/brazilDocument.ts';
import { hashPassword, verifyPassword } from '../lib/security.ts';
import { requireDatabaseAuth } from '../middleware/databaseAuth.ts';
import { evaluateTenantAccess } from '../middleware/tenantGuard.ts';
import { effectiveTenantLimits } from '../lib/tenantLimits.ts';

export const tenantExamRouter = Router();
const QUESTION_IDS = 'ABCDEFGH';
const VALID_MODES: ModoIdentificacaoProva[] = ['CPF', 'CPF_PIN', 'CPF_PIN_SELFIE'];
const startRate = new Map<string, { count: number; until: number }>();

type Alternative = { id: string; texto: string };
function tenantContext(res: Response) {
  const user = res.locals.authUser;
  if (!user || typeof user.empresaId !== 'string') return null;
  return { empresaId: user.empresaId as string, usuarioId: user.id as string,
    canWrite: user.perfil === 'ADMIN_EMPRESA' || user.perfil === 'RT', perfil: user.perfil as string };
}

function normalizedName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

function parseAlternatives(value: unknown): Alternative[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8) return null;
  const alternatives: Alternative[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const candidate = item as Record<string, unknown>;
    const id = typeof candidate.id === 'string' ? candidate.id.trim().toUpperCase() : '';
    const texto = typeof candidate.texto === 'string' ? candidate.texto.trim().slice(0, 600) : '';
    if (!QUESTION_IDS.includes(id) || ids.has(id) || texto.length < 1) return null;
    ids.add(id); alternatives.push({ id, texto });
  }
  return alternatives;
}

function parseQuestion(body: Record<string, unknown>): { enunciado: string; alternativas: Alternative[]; correta: string; peso: number } | null {
  const enunciado = typeof body.enunciado === 'string' ? body.enunciado.trim().slice(0, 2000) : '';
  const alternativas = parseAlternatives(body.alternativas);
  const correta = typeof body.correta === 'string' ? body.correta.trim().toUpperCase() : '';
  const peso = body.peso === undefined ? 1 : body.peso;
  if (enunciado.length < 10 || !alternativas || !alternativas.some((item) => item.id === correta) ||
      typeof peso !== 'number' || !Number.isInteger(peso) || peso < 1 || peso > 100) return null;
  return { enunciado, alternativas, correta, peso };
}

function tenantStatus(companyStatus: string, subscriptionStatus: string): 'TRIAL' | 'ATIVA' | 'INADIMPLENTE' | 'SUSPENSA' | 'CANCELADA' {
  if (['INADIMPLENTE', 'SUSPENSA', 'CANCELADA'].includes(companyStatus)) return companyStatus as 'INADIMPLENTE' | 'SUSPENSA' | 'CANCELADA';
  if (subscriptionStatus === 'ATRASADA') return 'INADIMPLENTE';
  if (subscriptionStatus === 'SUSPENSA') return 'SUSPENSA';
  if (subscriptionStatus === 'CANCELADA') return 'CANCELADA';
  return subscriptionStatus === 'TRIAL' ? 'TRIAL' : 'ATIVA';
}

async function tenantCanWrite(tx: Prisma.TransactionClient, empresaId: string) {
  await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${empresaId} FOR UPDATE`;
  const [company, subscription] = await Promise.all([
    tx.empresa.findUnique({ where: { id: empresaId }, select: { status: true, trialExpiraEm: true } }),
    tx.assinatura.findFirst({ where: { empresaId }, orderBy: { createdAt: 'desc' }, include: { plano: true,
      adicionais: { where: { ativo: true }, include: { adicional: { select: { recursoChave: true, incrementoQtd: true } } } } } }),
  ]);
  if (!company || !subscription) return false;
  const access = evaluateTenantAccess({ status: tenantStatus(company.status, subscription.status),
    trialExpiraEmIso: company.trialExpiraEm?.toISOString(),
    ...effectiveTenantLimits({ ...subscription.plano, adicionais: subscription.adicionais }),
    colaboradoresAtuais: 0, usuariosAtuais: 0, obrasAtuais: 0 });
  return access.permitido;
}

function shuffled<T>(items: T[]): T[] {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index--) {
    const other = crypto.randomInt(index + 1);
    [output[index], output[other]] = [output[other], output[index]];
  }
  return output;
}

function allowedDataUrl(value: unknown, kinds: Array<'png' | 'jpeg' | 'webp'>, maximumBytes: number): string | null {
  if (typeof value !== 'string' || value.length > maximumBytes * 1.5) return null;
  const match = value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || !kinds.includes(match[1] as 'png' | 'jpeg' | 'webp')) return null;
  const bytes = Buffer.from(match[2], 'base64');
  const mime = match[1];
  const valid = mime === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) :
    mime === 'jpeg' ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff :
      bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return bytes.length > 20 && bytes.length <= maximumBytes && valid ? value : null;
}

function canStartRateLimit(key: string): boolean {
  const now = Date.now();
  const prior = startRate.get(key);
  if (startRate.size > 5000) for (const [entry, value] of startRate) if (value.until <= now) startRate.delete(entry);
  if (prior && prior.until > now && prior.count >= 12) return false;
  startRate.set(key, prior && prior.until > now ? { count: prior.count + 1, until: prior.until } : { count: 1, until: now + 15 * 60_000 });
  return true;
}

tenantExamRouter.get('/api/tenant/classes', requireDatabaseAuth, async (_req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant) { res.status(403).json({ error: 'Conta de empresa obrigatória.' }); return; }
  try {
    const classes = await getPrisma().turmaAplicacao.findMany({ where: { empresaId: tenant.empresaId }, include: {
      treinamento: { select: { id: true, nrCodigo: true, nrTitulo: true, variacaoNome: true, cargaHorariaHoras: true, notaMinimaAprovacao: true } },
      contratoObra: { select: { id: true, codigo: true, nome: true } },
      instrutor: { select: { id: true, nome: true } }, rt: { select: { id: true, nome: true } },
      _count: { select: { tentativas: true, certificados: true } },
    }, orderBy: [{ dataRealizacao: 'desc' }, { createdAt: 'desc' }] });
    res.json({ turmas: classes.map(({ pinAcesso, ...item }) => ({ ...item, temPin: Boolean(pinAcesso) })) });
  } catch { res.status(503).json({ error: 'Não foi possível consultar as turmas.' }); }
});

tenantExamRouter.get('/api/tenant/operators', requireDatabaseAuth, async (_req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant) { res.status(403).json({ error: 'Conta de empresa obrigatória.' }); return; }
  try {
    const users = await getPrisma().usuario.findMany({ where: { empresaId: tenant.empresaId, ativo: true,
      perfil: { in: ['ADMIN_EMPRESA', 'RT', 'INSTRUTOR_TST'] } },
      select: { id: true, nome: true, perfil: true, registroProfissional: true, cargo: true }, orderBy: { nome: 'asc' } });
    res.json({ responsaveis: users });
  } catch { res.status(503).json({ error: 'Não foi possível consultar os responsáveis.' }); }
});

tenantExamRouter.post('/api/tenant/classes', requireDatabaseAuth, async (req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant?.canWrite) { res.status(403).json({ error: 'Permissão de administrador ou responsável técnico obrigatória.' }); return; }
  const body = req.body ?? {};
  const codigoTurma = typeof body.codigoTurma === 'string' ? body.codigoTurma.trim().slice(0, 40) : '';
  const titulo = typeof body.titulo === 'string' ? body.titulo.trim().slice(0, 180) : '';
  const dataRealizacao = typeof body.dataRealizacao === 'string' ? new Date(body.dataRealizacao) : new Date('invalid');
  const localRealizacao = typeof body.localRealizacao === 'string' ? body.localRealizacao.trim().slice(0, 240) : '';
  const treinamentoId = typeof body.treinamentoId === 'string' ? body.treinamentoId : '';
  const contratoObraId = body.contratoObraId === undefined || body.contratoObraId === null || body.contratoObraId === '' ? null : body.contratoObraId;
  const instrutorId = body.instrutorId === undefined || body.instrutorId === null || body.instrutorId === '' ? null : body.instrutorId;
  const rtId = body.rtId === undefined || body.rtId === null || body.rtId === '' ? null : body.rtId;
  const modoIdentificacao = VALID_MODES.includes(body.modoIdentificacao as ModoIdentificacaoProva) ? body.modoIdentificacao as ModoIdentificacaoProva : 'CPF';
  const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
  if (!/^[A-Za-z0-9._/-]{2,40}$/.test(codigoTurma) || titulo.length < 3 || !Number.isFinite(dataRealizacao.getTime()) ||
      !/^[0-9a-f-]{36}$/i.test(treinamentoId) || (localRealizacao.length > 240) ||
      (contratoObraId && (typeof contratoObraId !== 'string' || !/^[0-9a-f-]{36}$/i.test(contratoObraId))) ||
      (instrutorId && (typeof instrutorId !== 'string' || !/^[0-9a-f-]{36}$/i.test(instrutorId))) ||
      (rtId && (typeof rtId !== 'string' || !/^[0-9a-f-]{36}$/i.test(rtId))) ||
      (modoIdentificacao !== 'CPF' && !/^\d{4,8}$/.test(pin))) {
    res.status(400).json({ error: 'Revise código, título, data, treinamento, responsáveis, obra e modo de identificação.' }); return;
  }
  try {
    const turma = await getPrisma().$transaction(async (tx) => {
      if (!await tenantCanWrite(tx, tenant.empresaId)) throw new Error('ACCOUNT_BLOCKED');
      if (await tx.turmaAplicacao.findFirst({ where: { empresaId: tenant.empresaId, codigoTurma } })) throw new Error('CLASS_CODE_TAKEN');
      const training = await tx.treinamentoEmpresa.findFirst({ where: { id: treinamentoId, empresaId: tenant.empresaId, ativo: true } });
      if (!training) throw new Error('TRAINING_NOT_FOUND');
      if (await tx.bancoQuestao.count({ where: { empresaId: tenant.empresaId, treinamentoId, ativa: true } }) < 2) throw new Error('NO_QUESTIONS');
      if (contratoObraId && !await tx.contratoObra.findFirst({ where: { id: contratoObraId as string, empresaId: tenant.empresaId, ativo: true } })) throw new Error('WORK_NOT_FOUND');
      for (const signer of [
        { id: instrutorId, profiles: ['ADMIN_EMPRESA', 'RT', 'INSTRUTOR_TST'] },
        { id: rtId, profiles: ['ADMIN_EMPRESA', 'RT'] },
      ]) {
        if (!signer.id) continue;
        const user = await tx.usuario.findFirst({ where: { id: signer.id as string, empresaId: tenant.empresaId, ativo: true } });
        if (!user || !signer.profiles.includes(user.perfil)) throw new Error('SIGNER_NOT_FOUND');
      }
      const created = await tx.turmaAplicacao.create({ data: {
        empresaId: tenant.empresaId, treinamentoId, contratoObraId: contratoObraId as string | null,
        instrutorId: instrutorId as string | null, rtId: rtId as string | null, codigoTurma, titulo,
        dataRealizacao, localRealizacao: localRealizacao || null, tokenPublico: crypto.randomBytes(32).toString('base64url'),
        modoIdentificacao, pinAcesso: modoIdentificacao === 'CPF' ? null : hashPassword(pin),
      }, include: { treinamento: { select: { nrCodigo: true, variacaoNome: true } } } });
      await tx.auditoriaAcesso.create({ data: { usuarioId: tenant.usuarioId, empresaId: tenant.empresaId,
        acao: 'TENANT_CLASS_CREATED', detalhes: { turmaId: created.id, codigoTurma } } });
      return created;
    });
    const appOrigin = (() => { try { return new URL(process.env.APP_URL ?? '').origin; } catch { return ''; } })();
    res.status(201).json({ ...turma, pinAcesso: undefined, linkPublico: `${appOrigin}/?csdk_prova=${encodeURIComponent(turma.tokenPublico)}` });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'ACCOUNT_BLOCKED') { res.status(403).json({ error: 'Conta sem acesso operacional ativo.' }); return; }
    if (code === 'CLASS_CODE_TAKEN') { res.status(409).json({ error: 'Este código de turma já está em uso nesta empresa.' }); return; }
    if (code === 'NO_QUESTIONS') { res.status(409).json({ error: 'Adicione pelo menos duas questões ativas antes de criar a turma.' }); return; }
    if (code === 'TRAINING_NOT_FOUND' || code === 'WORK_NOT_FOUND' || code === 'SIGNER_NOT_FOUND') { res.status(404).json({ error: 'Treinamento, obra ou responsável ativo não encontrado nesta empresa.' }); return; }
    res.status(503).json({ error: 'Não foi possível criar a turma.' });
  }
});

tenantExamRouter.patch('/api/tenant/classes/:id', requireDatabaseAuth, async (req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant?.canWrite) { res.status(403).json({ error: 'Permissão de administrador ou responsável técnico obrigatória.' }); return; }
  const id = String(req.params.id ?? '');
  const status = req.body?.status;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !['ABERTA', 'ENCERRADA', 'CANCELADA'].includes(status)) { res.status(400).json({ error: 'Turma ou situação inválida.' }); return; }
  try {
    const updated = await getPrisma().$transaction(async (tx) => {
      if (!await tenantCanWrite(tx, tenant.empresaId)) throw new Error('ACCOUNT_BLOCKED');
      const current = await tx.turmaAplicacao.findFirst({ where: { id, empresaId: tenant.empresaId } });
      if (!current) throw new Error('CLASS_NOT_FOUND');
      return tx.turmaAplicacao.update({ where: { id }, data: { status } });
    });
    await getPrisma().auditoriaAcesso.create({ data: { usuarioId: tenant.usuarioId, empresaId: tenant.empresaId,
      acao: 'TENANT_CLASS_STATUS_UPDATED', detalhes: { turmaId: id, status } } });
    res.json(updated);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'ACCOUNT_BLOCKED') { res.status(403).json({ error: 'Conta sem acesso operacional ativo.' }); return; }
    if (code === 'CLASS_NOT_FOUND') { res.status(404).json({ error: 'Turma não encontrada nesta empresa.' }); return; }
    res.status(503).json({ error: 'Não foi possível atualizar a turma.' });
  }
});

tenantExamRouter.get('/api/tenant/trainings/:id/questions', requireDatabaseAuth, async (req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant) { res.status(403).json({ error: 'Conta de empresa obrigatória.' }); return; }
  const treinamentoId = String(req.params.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(treinamentoId)) { res.status(400).json({ error: 'Treinamento inválido.' }); return; }
  try {
    const training = await getPrisma().treinamentoEmpresa.findFirst({ where: { id: treinamentoId, empresaId: tenant.empresaId }, select: { id: true } });
    if (!training) { res.status(404).json({ error: 'Treinamento não encontrado nesta empresa.' }); return; }
    const questions = await getPrisma().bancoQuestao.findMany({ where: { empresaId: tenant.empresaId, treinamentoId }, orderBy: { createdAt: 'asc' } });
    res.json({ questoes: questions });
  } catch { res.status(503).json({ error: 'Não foi possível consultar as questões.' }); }
});

tenantExamRouter.post('/api/tenant/trainings/:id/questions', requireDatabaseAuth, async (req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant?.canWrite) { res.status(403).json({ error: 'Permissão de administrador ou responsável técnico obrigatória.' }); return; }
  const treinamentoId = String(req.params.id ?? '');
  const question = parseQuestion(req.body ?? {});
  if (!/^[0-9a-f-]{36}$/i.test(treinamentoId) || !question) { res.status(400).json({ error: 'Enunciado, alternativas, gabarito e peso inválidos.' }); return; }
  try {
    const created = await getPrisma().$transaction(async (tx) => {
      if (!await tenantCanWrite(tx, tenant.empresaId)) throw new Error('ACCOUNT_BLOCKED');
      if (!await tx.treinamentoEmpresa.findFirst({ where: { id: treinamentoId, empresaId: tenant.empresaId, ativo: true } })) throw new Error('TRAINING_NOT_FOUND');
      return tx.bancoQuestao.create({ data: { empresaId: tenant.empresaId, treinamentoId, ...question,
        alternativas: question.alternativas as unknown as Prisma.InputJsonValue } });
    });
    res.status(201).json(created);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'ACCOUNT_BLOCKED') { res.status(403).json({ error: 'Conta sem acesso operacional ativo.' }); return; }
    if (code === 'TRAINING_NOT_FOUND') { res.status(404).json({ error: 'Treinamento não encontrado nesta empresa.' }); return; }
    res.status(503).json({ error: 'Não foi possível salvar a questão.' });
  }
});

tenantExamRouter.patch('/api/tenant/questions/:id', requireDatabaseAuth, async (req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant?.canWrite) { res.status(403).json({ error: 'Permissão de administrador ou responsável técnico obrigatória.' }); return; }
  const id = String(req.params.id ?? '');
  const body = req.body ?? {};
  if (!/^[0-9a-f-]{36}$/i.test(id)) { res.status(400).json({ error: 'Questão inválida.' }); return; }
  const update: Prisma.BancoQuestaoUpdateInput = {};
  const parsed = parseQuestion(body);
  if (body.enunciado !== undefined || body.alternativas !== undefined || body.correta !== undefined || body.peso !== undefined) {
    if (!parsed) { res.status(400).json({ error: 'Enunciado, alternativas, gabarito e peso inválidos.' }); return; }
    update.enunciado = parsed.enunciado; update.alternativas = parsed.alternativas as unknown as Prisma.InputJsonValue;
    update.correta = parsed.correta; update.peso = parsed.peso;
  }
  if (body.ativa !== undefined) {
    if (typeof body.ativa !== 'boolean') { res.status(400).json({ error: 'Estado inválido.' }); return; }
    update.ativa = body.ativa;
  }
  if (!Object.keys(update).length) { res.status(400).json({ error: 'Nenhuma alteração informada.' }); return; }
  try {
    const updated = await getPrisma().$transaction(async (tx) => {
      if (!await tenantCanWrite(tx, tenant.empresaId)) throw new Error('ACCOUNT_BLOCKED');
      const question = await tx.bancoQuestao.findFirst({ where: { id, empresaId: tenant.empresaId } });
      if (!question) throw new Error('QUESTION_NOT_FOUND');
      return tx.bancoQuestao.update({ where: { id }, data: update });
    });
    res.json(updated);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'ACCOUNT_BLOCKED') { res.status(403).json({ error: 'Conta sem acesso operacional ativo.' }); return; }
    if (code === 'QUESTION_NOT_FOUND') { res.status(404).json({ error: 'Questão não encontrada nesta empresa.' }); return; }
    res.status(503).json({ error: 'Não foi possível atualizar a questão.' });
  }
});

tenantExamRouter.post('/api/public/exams/:token/start', async (req: Request, res: Response) => {
  const token = String(req.params.token ?? '');
  const key = crypto.createHash('sha256').update(`${req.ip}:${token}`).digest('hex');
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !canStartRateLimit(key)) { res.status(429).json({ error: 'Aguarde antes de tentar novamente.' }); return; }
  const nome = typeof req.body?.nome === 'string' ? req.body.nome.trim().slice(0, 120) : '';
  let cpf = '';
  try { cpf = validateHolderDocument('PF', typeof req.body?.cpf === 'string' ? req.body.cpf : ''); }
  catch { res.status(400).json({ error: 'CPF inválido.' }); return; }
  const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
  if (nome.length < 3) { res.status(400).json({ error: 'Informe seu nome completo.' }); return; }
  try {
    const db = getPrisma();
    const initialClass = await db.turmaAplicacao.findUnique({ where: { tokenPublico: token }, select: { id: true, modoIdentificacao: true, pinAcesso: true } });
    if (!initialClass || (initialClass.modoIdentificacao !== 'CPF' && (!initialClass.pinAcesso || !verifyPassword(pin, initialClass.pinAcesso)))) {
      res.status(404).json({ error: 'Turma, participante ou PIN não encontrado.' }); return;
    }
    const started = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM turmas_aplicacoes WHERE id = ${initialClass.id} FOR UPDATE`;
      const turma = await tx.turmaAplicacao.findUnique({ where: { id: initialClass.id }, include: {
        empresa: { select: { assinaturasCertificado: true, nomeFantasia: true, razaoSocial: true, corPrimaria: true } },
        treinamento: { select: { id: true, nrCodigo: true, nrTitulo: true, variacaoNome: true, notaMinimaAprovacao: true, cargaHorariaHoras: true } },
      } });
      if (!turma || turma.status !== 'ABERTA') throw new Error('CLASS_CLOSED');
      if (turma.modoIdentificacao !== 'CPF' && (!turma.pinAcesso || !verifyPassword(pin, turma.pinAcesso))) throw new Error('IDENTITY_INVALID');
      const collaborator = await tx.colaborador.findFirst({ where: { empresaId: turma.empresaId, cpf, ativo: true } });
      if (!collaborator || normalizedName(collaborator.nome) !== normalizedName(nome)) throw new Error('IDENTITY_INVALID');
      const existing = await tx.provaTentativa.findFirst({ where: { turmaId: turma.id, colaboradorId: collaborator.id,
        status: 'EM_ANDAMENTO', iniciadaEm: { gt: new Date(Date.now() - 2 * 60 * 60_000) } } });
      if (existing) {
        const priorSnapshot = existing.respostasJson as { assinaturaColaboradorObrigatoria?: boolean; assinaturasCertificado?: unknown[]; questoes?: Array<{
          id: string; ordem: number; enunciado: string; alternativas: Alternative[];
        }> };
        if (!Array.isArray(priorSnapshot.questoes) || !priorSnapshot.questoes.length) throw new Error('ATTEMPT_IN_PROGRESS');
        return { attempt: existing, turma, collaborator,
          employeeSignatureRequired: priorSnapshot.assinaturaColaboradorObrigatoria === true,
          questions: priorSnapshot.questoes.map((question) => ({ id: question.id, ordem: question.ordem,
            enunciado: question.enunciado, alternativas: question.alternativas })) };
      }
      const questions = await tx.bancoQuestao.findMany({ where: { empresaId: turma.empresaId, treinamentoId: turma.treinamentoId, ativa: true }, orderBy: { createdAt: 'asc' } });
      if (questions.length < 1) throw new Error('NO_QUESTIONS');
      const shuffledQuestions = shuffled(questions);
      const configuredSigners = Array.isArray(turma.empresa.assinaturasCertificado)
        ? turma.empresa.assinaturasCertificado as Array<{ tipo?: unknown; rotulo?: unknown; obrigatoria?: unknown; forma?: unknown; nomeSignatario?: unknown }>
        : [];
      const signerConfig = configuredSigners.length ? configuredSigners.map((item) => ({
        tipo: typeof item.tipo === 'string' ? item.tipo : 'PERSONALIZADO',
        rotulo: typeof item.rotulo === 'string' ? item.rotulo : 'Assinante',
        obrigatoria: item.obrigatoria === true,
        forma: item.forma === 'FISICA' ? 'FISICA' : 'DIGITAL',
        nomeSignatario: typeof item.nomeSignatario === 'string' ? item.nomeSignatario : '',
      })) : [{ tipo: 'COLABORADOR', rotulo: 'Colaborador', obrigatoria: true, forma: 'DIGITAL', nomeSignatario: '' }];
      const employeeSignatureRequired = signerConfig.some((item) => item.tipo === 'COLABORADOR' && item.obrigatoria && item.forma === 'DIGITAL');
      const snapshot = {
        versao: 1,
        assinaturaColaboradorObrigatoria: employeeSignatureRequired,
        assinaturasCertificado: signerConfig,
        questoes: shuffledQuestions.map((question, index) => ({
          id: question.id, ordem: index + 1, enunciado: question.enunciado,
          alternativas: question.alternativas, correta: question.correta, peso: question.peso,
        })),
      } as Prisma.InputJsonValue;
      const attempt = await tx.provaTentativa.create({ data: {
        empresaId: turma.empresaId, turmaId: turma.id, colaboradorId: collaborator.id,
        respostasJson: snapshot, notaPercentual: 0, status: 'EM_ANDAMENTO',
        ipOrigem: crypto.createHash('sha256').update(`${req.ip}:${process.env.JWT_SECRET ?? ''}`).digest('hex'),
        userAgent: (req.header('user-agent') ?? '').slice(0, 500),
      } });
      return { attempt, turma, collaborator, employeeSignatureRequired,
        questions: shuffledQuestions.map((question, index) => ({ id: question.id, ordem: index + 1,
          enunciado: question.enunciado, alternativas: question.alternativas })) };
    });
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({ tentativaId: started.attempt.id, participante: started.collaborator.nome,
      turma: started.turma.titulo, treinamento: `${started.turma.treinamento.nrCodigo} · ${started.turma.treinamento.variacaoNome}`,
      notaMinimaAprovacao: started.turma.treinamento.notaMinimaAprovacao,
      selfieObrigatoria: started.turma.modoIdentificacao === 'CPF_PIN_SELFIE',
      assinaturaColaboradorObrigatoria: started.employeeSignatureRequired, questoes: started.questions });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'CLASS_CLOSED') { res.status(410).json({ error: 'Esta turma não está mais aberta.' }); return; }
    if (code === 'IDENTITY_INVALID') { res.status(404).json({ error: 'Turma, participante ou PIN não encontrado.' }); return; }
    if (code === 'ATTEMPT_IN_PROGRESS') { res.status(409).json({ error: 'Não foi possível recuperar a tentativa em andamento.' }); return; }
    if (code === 'NO_QUESTIONS') { res.status(409).json({ error: 'A avaliação ainda não tem questões ativas.' }); return; }
    res.status(503).json({ error: 'Não foi possível iniciar a avaliação.' });
  }
});

tenantExamRouter.post('/api/public/exams/:token/finish', async (req: Request, res: Response) => {
  const token = String(req.params.token ?? '');
  const tentativaId = typeof req.body?.tentativaId === 'string' ? req.body.tentativaId : '';
  const answers = req.body?.respostas;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !/^[0-9a-f-]{36}$/i.test(tentativaId) || !answers || typeof answers !== 'object' || Array.isArray(answers)) {
    res.status(400).json({ error: 'Tentativa ou respostas inválidas.' }); return;
  }
  try {
    const db = getPrisma();
    const initial = await db.provaTentativa.findFirst({ where: { id: tentativaId, turma: { tokenPublico: token } }, include: {
      turma: { include: { treinamento: { select: { notaMinimaAprovacao: true } } } },
    } });
    if (!initial || initial.status !== 'EM_ANDAMENTO') { res.status(404).json({ error: 'Tentativa não encontrada ou já concluída.' }); return; }
    if (initial.iniciadaEm.getTime() < Date.now() - 2 * 60 * 60_000) { res.status(410).json({ error: 'O tempo da avaliação expirou. Solicite um novo link.' }); return; }
    const snapshot = initial.respostasJson as { assinaturaColaboradorObrigatoria?: boolean; assinaturasCertificado?: unknown[]; questoes?: Array<{
      id: string; ordem: number; enunciado: string; alternativas: Alternative[]; correta: string; peso: number;
    }> };
    if (!Array.isArray(snapshot.questoes) || snapshot.questoes.length < 1) { res.status(409).json({ error: 'A avaliação não tem questões válidas.' }); return; }
    const questionIds = snapshot.questoes.map((item) => item.id);
    const supplied = answers as Record<string, unknown>;
    if (Object.keys(supplied).length !== questionIds.length || questionIds.some((id) => typeof supplied[id] !== 'string')) {
      res.status(400).json({ error: 'Responda todas as questões antes de finalizar.' }); return;
    }
    const respostas = snapshot.questoes.map((question) => {
      const marcada = String(supplied[question.id]).toUpperCase();
      if (!question.alternativas.some((option) => option.id === marcada)) throw new Error('ANSWER_INVALID');
      const marcadaTexto = question.alternativas.find((option) => option.id === marcada)?.texto ?? '';
      const corretaTexto = question.alternativas.find((option) => option.id === question.correta)?.texto ?? '';
      return { questaoId: question.id, ordem: question.ordem, enunciado: question.enunciado,
        alternativas: question.alternativas, respostaMarcada: marcada, respostaMarcadaTexto: marcadaTexto,
        gabarito: question.correta, gabaritoTexto: corretaTexto, correta: marcada === question.correta, peso: question.peso };
    });
    const totalPeso = snapshot.questoes.reduce((sum, question) => sum + question.peso, 0);
    const acertosPeso = respostas.filter((answer) => answer.correta).reduce((sum, answer) => sum + answer.peso, 0);
    const notaPercentual = totalPeso ? Math.round(acertosPeso * 100 / totalPeso) : 0;
    const assinatura = snapshot.assinaturaColaboradorObrigatoria
      ? allowedDataUrl(req.body?.assinaturaDataUrl, ['png'], 350_000) : null;
    if (snapshot.assinaturaColaboradorObrigatoria && !assinatura) { res.status(400).json({ error: 'Assine antes de enviar a avaliação.' }); return; }
    const selfie = req.body?.selfieDataUrl === undefined || req.body?.selfieDataUrl === null
      ? null : allowedDataUrl(req.body.selfieDataUrl, ['png', 'jpeg', 'webp'], 1_572_864);
    if (req.body?.selfieDataUrl && !selfie) { res.status(400).json({ error: 'A imagem da selfie é inválida ou excede 1,5 MB.' }); return; }
    if (initial.turma.modoIdentificacao === 'CPF_PIN_SELFIE' && !selfie) { res.status(400).json({ error: 'Envie a selfie obrigatória desta avaliação.' }); return; }
    const status = notaPercentual >= initial.turma.treinamento.notaMinimaAprovacao ? 'APROVADO' : 'REPROVADO';
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM provas_tentativas WHERE id = ${tentativaId} FOR UPDATE`;
      const current = await tx.provaTentativa.findUnique({ where: { id: tentativaId } });
      if (!current || current.status !== 'EM_ANDAMENTO') throw new Error('ATTEMPT_FINISHED');
      return tx.provaTentativa.update({ where: { id: tentativaId }, data: {
        respostasJson: { assinaturaColaboradorObrigatoria: snapshot.assinaturaColaboradorObrigatoria ?? false,
          assinaturasCertificado: snapshot.assinaturasCertificado ?? [], questoes: respostas } as unknown as Prisma.InputJsonValue,
        notaPercentual, status, assinaturaDataUrl: assinatura, selfieDataUrl: selfie, concluidaEm: new Date(),
      } });
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ tentativaId: result.id, status: result.status, notaPercentual: result.notaPercentual,
      notaMinimaAprovacao: initial.turma.treinamento.notaMinimaAprovacao,
      acertos: respostas.filter((answer) => answer.correta).length, totalQuestoes: respostas.length,
      concluidaEm: result.concluidaEm });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'ANSWER_INVALID') { res.status(400).json({ error: 'Uma das respostas não pertence à questão.' }); return; }
    if (code === 'ATTEMPT_FINISHED') { res.status(409).json({ error: 'Esta avaliação já foi enviada.' }); return; }
    res.status(503).json({ error: 'Não foi possível finalizar a avaliação.' });
  }
});
