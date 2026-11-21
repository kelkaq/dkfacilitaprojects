import { Router, type Request, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma.ts';
import { validateHolderDocument } from '../lib/brazilDocument.ts';
import { requireDatabaseAuth } from '../middleware/databaseAuth.ts';
import { evaluateTenantAccess } from '../middleware/tenantGuard.ts';
import { effectiveTenantLimits } from '../lib/tenantLimits.ts';

export const tenantOperationsRouter = Router();

function tenantContext(res: Response): { empresaId: string; usuarioId: string; canWrite: boolean } | null {
  const user = res.locals.authUser;
  if (!user || typeof user.empresaId !== 'string') return null;
  return { empresaId: user.empresaId, usuarioId: user.id, canWrite: user.perfil === 'ADMIN_EMPRESA' || user.perfil === 'RT' };
}

function cleanOptionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  return value.trim().slice(0, max) || null;
}

function tenantStatus(companyStatus: string, subscriptionStatus: string): 'TRIAL' | 'ATIVA' | 'INADIMPLENTE' | 'SUSPENSA' | 'CANCELADA' {
  if (['INADIMPLENTE', 'SUSPENSA', 'CANCELADA'].includes(companyStatus)) return companyStatus as 'INADIMPLENTE' | 'SUSPENSA' | 'CANCELADA';
  if (subscriptionStatus === 'ATRASADA') return 'INADIMPLENTE';
  if (subscriptionStatus === 'SUSPENSA') return 'SUSPENSA';
  if (subscriptionStatus === 'CANCELADA') return 'CANCELADA';
  return subscriptionStatus === 'TRIAL' ? 'TRIAL' : 'ATIVA';
}

async function lockAndCheckAccess(tx: Prisma.TransactionClient, empresaId: string) {
  await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${empresaId} FOR UPDATE`;
  const [company, subscription] = await Promise.all([
    tx.empresa.findUnique({ where: { id: empresaId }, select: { status: true, trialExpiraEm: true } }),
    tx.assinatura.findFirst({ where: { empresaId }, orderBy: { createdAt: 'desc' }, include: { plano: true,
      adicionais: { where: { ativo: true }, include: { adicional: { select: { recursoChave: true, incrementoQtd: true } } } } } }),
  ]);
  if (!company || !subscription) return { allowed: false as const, reason: 'Conta sem assinatura válida.', code: 'SEM_ASSINATURA' };
  const limits = effectiveTenantLimits({ ...subscription.plano, adicionais: subscription.adicionais });
  const decision = evaluateTenantAccess({
    status: tenantStatus(company.status, subscription.status),
    trialExpiraEmIso: company.trialExpiraEm?.toISOString(),
    ...limits,
    colaboradoresAtuais: 0,
    usuariosAtuais: 0,
    obrasAtuais: 0,
  });
  return decision.permitido
    ? { allowed: true as const, subscription, limits }
    : { allowed: false as const, reason: decision.motivo ?? 'A conta não pode realizar esta operação.', code: decision.codigo ?? 'CONTA_BLOQUEADA' };
}

function blocked(res: Response, result: { allowed: false; reason: string; code: string }): void {
  res.status(403).json({ error: result.reason, code: result.code });
}

function isUniqueError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

tenantOperationsRouter.get('/api/tenant/workspace', requireDatabaseAuth, async (_req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant) { res.status(403).json({ error: 'Conta de empresa obrigatória.' }); return; }
  try {
    const db = getPrisma();
    const [company, subscription, collaborators, works, trainings, classes, certificates] = await Promise.all([
      db.empresa.findUnique({ where: { id: tenant.empresaId }, select: { razaoSocial: true, nomeFantasia: true, status: true, trialExpiraEm: true } }),
      db.assinatura.findFirst({ where: { empresaId: tenant.empresaId }, orderBy: { createdAt: 'desc' }, include: { plano: { select: { nome: true, limiteColaboradores: true, limiteObras: true, limiteUsuarios: true } },
        adicionais: { where: { ativo: true }, include: { adicional: { select: { recursoChave: true, incrementoQtd: true } } } } } }),
      db.colaborador.count({ where: { empresaId: tenant.empresaId, ativo: true } }),
      db.contratoObra.count({ where: { empresaId: tenant.empresaId, ativo: true } }),
      db.treinamentoEmpresa.count({ where: { empresaId: tenant.empresaId, ativo: true } }),
      db.turmaAplicacao.count({ where: { empresaId: tenant.empresaId } }),
      db.certificado.count({ where: { empresaId: tenant.empresaId, status: 'EMITIDO' } }),
    ]);
    if (!company) { res.status(404).json({ error: 'Conta não encontrada.' }); return; }
    const status = subscription ? tenantStatus(company.status, subscription.status) : company.status;
    const limits = subscription ? effectiveTenantLimits({ ...subscription.plano, adicionais: subscription.adicionais }) : null;
    const access = subscription ? evaluateTenantAccess({
      status: status as 'TRIAL' | 'ATIVA' | 'INADIMPLENTE' | 'SUSPENSA' | 'CANCELADA',
      trialExpiraEmIso: company.trialExpiraEm?.toISOString(),
      ...limits!,
      colaboradoresAtuais: collaborators,
      usuariosAtuais: 0,
      obrasAtuais: works,
    }) : { permitido: false, motivo: 'Conta sem assinatura válida.' };
    res.setHeader('Cache-Control', 'no-store');
    res.json({ empresa: company.nomeFantasia || company.razaoSocial, status, permitido: access.permitido,
      motivo: access.motivo ?? null, plano: subscription?.plano.nome ?? null,
      trialExpiraEm: company.trialExpiraEm, limites: subscription ? {
        colaboradoresAtuais: collaborators, limiteColaboradores: limits!.limiteColaboradores,
        obrasAtuais: works, limiteObras: limits!.limiteObras,
        limiteUsuarios: limits!.limiteUsuarios,
      } : null,
      totais: { colaboradores: collaborators, obras: works, treinamentos: trainings, turmas: classes, certificados: certificates } });
  } catch { res.status(503).json({ error: 'Não foi possível carregar o painel da empresa.' }); }
});

tenantOperationsRouter.get('/api/tenant/colaboradores', requireDatabaseAuth, async (_req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant) { res.status(403).json({ error: 'Conta de empresa obrigatória.' }); return; }
  try {
    const colaboradores = await getPrisma().colaborador.findMany({ where: { empresaId: tenant.empresaId },
      select: { id: true, contratoObraId: true, nome: true, cpf: true, rg: true, funcao: true, matricula: true,
        email: true, telefone: true, ativo: true, createdAt: true, contratoObra: { select: { codigo: true, nome: true } } },
      orderBy: [{ ativo: 'desc' }, { nome: 'asc' }] });
    res.json({ colaboradores });
  } catch { res.status(503).json({ error: 'Não foi possível consultar os colaboradores.' }); }
});

tenantOperationsRouter.post('/api/tenant/colaboradores', requireDatabaseAuth, async (req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant?.canWrite) { res.status(403).json({ error: 'Permissão de administrador ou responsável técnico obrigatória.' }); return; }
  const body = req.body ?? {};
  const nome = typeof body.nome === 'string' ? body.nome.trim().slice(0, 120) : '';
  const funcao = typeof body.funcao === 'string' ? body.funcao.trim().slice(0, 120) : '';
  let cpf = '';
  try { cpf = validateHolderDocument('PF', typeof body.cpf === 'string' ? body.cpf : ''); }
  catch { res.status(400).json({ error: 'CPF do colaborador inválido.' }); return; }
  const matricula = cleanOptionalText(body.matricula, 80);
  const rg = cleanOptionalText(body.rg, 40);
  const email = cleanOptionalText(body.email, 160);
  const telefone = typeof body.telefone === 'string' ? body.telefone.replace(/\D/g, '').slice(0, 15) : null;
  const contratoObraId = body.contratoObraId === null || body.contratoObraId === '' ? null : body.contratoObraId;
  if (nome.length < 2 || funcao.length < 2 || matricula === undefined || rg === undefined || email === undefined ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || (telefone && (telefone.length < 10 || telefone.length > 15)) ||
      (contratoObraId && (typeof contratoObraId !== 'string' || !/^[0-9a-f-]{36}$/i.test(contratoObraId)))) {
    res.status(400).json({ error: 'Revise nome, CPF, função, matrícula, e-mail, telefone e obra.' }); return;
  }
  try {
    const created = await getPrisma().$transaction(async (tx) => {
      const access = await lockAndCheckAccess(tx, tenant.empresaId);
      if (!access.allowed) throw new Error(`ACCESS:${access.code}:${access.reason}`);
      if (await tx.colaborador.findFirst({ where: { empresaId: tenant.empresaId, cpf } })) throw new Error('CPF_TAKEN');
      const count = await tx.colaborador.count({ where: { empresaId: tenant.empresaId, ativo: true } });
      if (count >= access.limits.limiteColaboradores) throw new Error('COLLABORATOR_LIMIT');
      if (contratoObraId && !await tx.contratoObra.findFirst({ where: { id: contratoObraId, empresaId: tenant.empresaId, ativo: true } })) {
        throw new Error('WORK_NOT_FOUND');
      }
      const colaborador = await tx.colaborador.create({ data: { empresaId: tenant.empresaId, nome, cpf, funcao,
        ...(matricula !== undefined ? { matricula } : {}), ...(rg !== undefined ? { rg } : {}), ...(email !== undefined ? { email } : {}),
        telefone, contratoObraId } });
      await tx.auditoriaAcesso.create({ data: { usuarioId: tenant.usuarioId, empresaId: tenant.empresaId,
        acao: 'TENANT_COLLABORATOR_CREATED', detalhes: { colaboradorId: colaborador.id } } });
      return colaborador;
    });
    res.status(201).json(created);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code.startsWith('ACCESS:')) { const [, accessCode, reason] = code.split(':'); res.status(403).json({ error: reason, code: accessCode }); return; }
    if (code === 'COLLABORATOR_LIMIT') { res.status(409).json({ error: 'Limite de colaboradores do plano atingido.' }); return; }
    if (code === 'CPF_TAKEN') { res.status(409).json({ error: 'Este CPF já está cadastrado nesta empresa.' }); return; }
    if (code === 'WORK_NOT_FOUND') { res.status(404).json({ error: 'Obra ativa não encontrada nesta empresa.' }); return; }
    if (isUniqueError(error)) { res.status(409).json({ error: 'Este CPF já está cadastrado nesta empresa.' }); return; }
    res.status(503).json({ error: 'Não foi possível cadastrar o colaborador.' });
  }
});

tenantOperationsRouter.patch('/api/tenant/colaboradores/:id', requireDatabaseAuth, async (req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant?.canWrite) { res.status(403).json({ error: 'Permissão de administrador ou responsável técnico obrigatória.' }); return; }
  const id = String(req.params.id ?? '');
  const body = req.body ?? {};
  if (!/^[0-9a-f-]{36}$/i.test(id)) { res.status(400).json({ error: 'Colaborador inválido.' }); return; }
  const data: Prisma.ColaboradorUpdateInput = {};
  if (body.ativo !== undefined) {
    if (typeof body.ativo !== 'boolean') { res.status(400).json({ error: 'Estado inválido.' }); return; }
    data.ativo = body.ativo;
  }
  for (const field of ['nome', 'funcao'] as const) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== 'string' || body[field].trim().length < 2) { res.status(400).json({ error: 'Nome e função devem ter ao menos dois caracteres.' }); return; }
      data[field] = body[field].trim().slice(0, 120);
    }
  }
  if (body.cpf !== undefined) {
    try { data.cpf = validateHolderDocument('PF', typeof body.cpf === 'string' ? body.cpf : ''); }
    catch { res.status(400).json({ error: 'CPF do colaborador inválido.' }); return; }
  }
  for (const field of ['matricula', 'rg', 'email'] as const) {
    if (body[field] !== undefined) {
      const value = cleanOptionalText(body[field], field === 'matricula' ? 80 : field === 'rg' ? 40 : 160);
      if (value === undefined || (field === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) { res.status(400).json({ error: 'Dados do colaborador inválidos.' }); return; }
      data[field] = value;
    }
  }
  if (body.telefone !== undefined) {
    if (body.telefone !== null && typeof body.telefone !== 'string') { res.status(400).json({ error: 'Telefone inválido.' }); return; }
    const value = typeof body.telefone === 'string' ? body.telefone.replace(/\D/g, '').slice(0, 15) : '';
    if (value && value.length < 10) { res.status(400).json({ error: 'Telefone inválido.' }); return; }
    data.telefone = value || null;
  }
  if (body.contratoObraId !== undefined) {
    if (body.contratoObraId !== null && body.contratoObraId !== '' && (typeof body.contratoObraId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.contratoObraId))) { res.status(400).json({ error: 'Obra inválida.' }); return; }
    data.contratoObra = body.contratoObraId ? { connect: { id: body.contratoObraId } } : { disconnect: true };
  }
  if (!Object.keys(data).length) { res.status(400).json({ error: 'Nenhuma alteração informada.' }); return; }
  try {
    const updated = await getPrisma().$transaction(async (tx) => {
      const access = await lockAndCheckAccess(tx, tenant.empresaId);
      if (!access.allowed) throw new Error(`ACCESS:${access.code}:${access.reason}`);
      const current = await tx.colaborador.findFirst({ where: { id, empresaId: tenant.empresaId } });
      if (!current) throw new Error('COLLABORATOR_NOT_FOUND');
      if (data.ativo === true && !current.ativo) {
        const count = await tx.colaborador.count({ where: { empresaId: tenant.empresaId, ativo: true } });
        if (count >= access.limits.limiteColaboradores) throw new Error('COLLABORATOR_LIMIT');
      }
      if (body.contratoObraId) {
        const work = await tx.contratoObra.findFirst({ where: { id: body.contratoObraId, empresaId: tenant.empresaId, ativo: true } });
        if (!work) throw new Error('WORK_NOT_FOUND');
      }
      const result = await tx.colaborador.update({ where: { id }, data });
      await tx.auditoriaAcesso.create({ data: { usuarioId: tenant.usuarioId, empresaId: tenant.empresaId,
        acao: 'TENANT_COLLABORATOR_UPDATED', detalhes: { colaboradorId: id, fields: Object.keys(data) } } });
      return result;
    });
    res.json(updated);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code.startsWith('ACCESS:')) { const [, accessCode, reason] = code.split(':'); res.status(403).json({ error: reason, code: accessCode }); return; }
    if (code === 'COLLABORATOR_LIMIT') { res.status(409).json({ error: 'Limite de colaboradores do plano atingido.' }); return; }
    if (code === 'COLLABORATOR_NOT_FOUND' || code === 'WORK_NOT_FOUND') { res.status(404).json({ error: 'Colaborador ou obra ativa não encontrada nesta empresa.' }); return; }
    if (isUniqueError(error)) { res.status(409).json({ error: 'CPF ou matrícula já pertence a outro colaborador desta empresa.' }); return; }
    res.status(503).json({ error: 'Não foi possível atualizar o colaborador.' });
  }
});

tenantOperationsRouter.get('/api/tenant/obras', requireDatabaseAuth, async (_req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant) { res.status(403).json({ error: 'Conta de empresa obrigatória.' }); return; }
  try {
    const obras = await getPrisma().contratoObra.findMany({ where: { empresaId: tenant.empresaId },
      select: { id: true, codigo: true, nome: true, clienteFinal: true, localizacao: true, ativo: true, createdAt: true,
        _count: { select: { colaboradores: true, turmas: true } } }, orderBy: [{ ativo: 'desc' }, { nome: 'asc' }] });
    res.json({ obras });
  } catch { res.status(503).json({ error: 'Não foi possível consultar as obras.' }); }
});

tenantOperationsRouter.post('/api/tenant/obras', requireDatabaseAuth, async (req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant?.canWrite) { res.status(403).json({ error: 'Permissão de administrador ou responsável técnico obrigatória.' }); return; }
  const codigo = typeof req.body?.codigo === 'string' ? req.body.codigo.trim().slice(0, 40) : '';
  const nome = typeof req.body?.nome === 'string' ? req.body.nome.trim().slice(0, 160) : '';
  const clienteFinal = cleanOptionalText(req.body?.clienteFinal, 180);
  const localizacao = cleanOptionalText(req.body?.localizacao, 240);
  if (!/^[A-Za-z0-9._/-]{2,40}$/.test(codigo) || nome.length < 2 || clienteFinal === undefined || localizacao === undefined) {
    res.status(400).json({ error: 'Informe código e nome válidos para a obra.' }); return;
  }
  try {
    const obra = await getPrisma().$transaction(async (tx) => {
      const access = await lockAndCheckAccess(tx, tenant.empresaId);
      if (!access.allowed) throw new Error(`ACCESS:${access.code}:${access.reason}`);
      if (await tx.contratoObra.findFirst({ where: { empresaId: tenant.empresaId, codigo } })) throw new Error('WORK_CODE_TAKEN');
      const count = await tx.contratoObra.count({ where: { empresaId: tenant.empresaId, ativo: true } });
      if (count >= access.limits.limiteObras) throw new Error('WORK_LIMIT');
      const created = await tx.contratoObra.create({ data: { empresaId: tenant.empresaId, codigo, nome, clienteFinal, localizacao } });
      await tx.auditoriaAcesso.create({ data: { usuarioId: tenant.usuarioId, empresaId: tenant.empresaId,
        acao: 'TENANT_WORK_CREATED', detalhes: { obraId: created.id } } });
      return created;
    });
    res.status(201).json(obra);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code.startsWith('ACCESS:')) { const [, accessCode, reason] = code.split(':'); res.status(403).json({ error: reason, code: accessCode }); return; }
    if (code === 'WORK_LIMIT') { res.status(409).json({ error: 'Limite de obras do plano atingido.' }); return; }
    if (code === 'WORK_CODE_TAKEN') { res.status(409).json({ error: 'Este código já está em uso nesta empresa.' }); return; }
    if (isUniqueError(error)) { res.status(409).json({ error: 'Este código já está em uso nesta empresa.' }); return; }
    res.status(503).json({ error: 'Não foi possível cadastrar a obra.' });
  }
});

tenantOperationsRouter.patch('/api/tenant/obras/:id', requireDatabaseAuth, async (req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant?.canWrite) { res.status(403).json({ error: 'Permissão de administrador ou responsável técnico obrigatória.' }); return; }
  const id = String(req.params.id ?? '');
  const body = req.body ?? {};
  if (!/^[0-9a-f-]{36}$/i.test(id)) { res.status(400).json({ error: 'Obra inválida.' }); return; }
  const data: Prisma.ContratoObraUpdateInput = {};
  for (const field of ['codigo', 'nome'] as const) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== 'string' || body[field].trim().length < 2) { res.status(400).json({ error: 'Código ou nome inválido.' }); return; }
      const value = body[field].trim();
      if (field === 'codigo' && !/^[A-Za-z0-9._/-]{2,40}$/.test(value)) { res.status(400).json({ error: 'Código inválido.' }); return; }
      data[field] = value.slice(0, field === 'codigo' ? 40 : 160);
    }
  }
  for (const field of ['clienteFinal', 'localizacao'] as const) {
    if (body[field] !== undefined) {
      const value = cleanOptionalText(body[field], field === 'clienteFinal' ? 180 : 240);
      if (value === undefined) { res.status(400).json({ error: 'Dados da obra inválidos.' }); return; }
      data[field] = value;
    }
  }
  if (body.ativo !== undefined) {
    if (typeof body.ativo !== 'boolean') { res.status(400).json({ error: 'Estado inválido.' }); return; }
    data.ativo = body.ativo;
  }
  if (!Object.keys(data).length) { res.status(400).json({ error: 'Nenhuma alteração informada.' }); return; }
  try {
    const result = await getPrisma().$transaction(async (tx) => {
      const access = await lockAndCheckAccess(tx, tenant.empresaId);
      if (!access.allowed) throw new Error(`ACCESS:${access.code}:${access.reason}`);
      const current = await tx.contratoObra.findFirst({ where: { id, empresaId: tenant.empresaId } });
      if (!current) throw new Error('WORK_NOT_FOUND');
      if (data.ativo === true && !current.ativo) {
        const count = await tx.contratoObra.count({ where: { empresaId: tenant.empresaId, ativo: true } });
        if (count >= access.limits.limiteObras) throw new Error('WORK_LIMIT');
      }
      const updated = await tx.contratoObra.update({ where: { id }, data });
      await tx.auditoriaAcesso.create({ data: { usuarioId: tenant.usuarioId, empresaId: tenant.empresaId,
        acao: 'TENANT_WORK_UPDATED', detalhes: { obraId: id, fields: Object.keys(data) } } });
      return updated;
    });
    res.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code.startsWith('ACCESS:')) { const [, accessCode, reason] = code.split(':'); res.status(403).json({ error: reason, code: accessCode }); return; }
    if (code === 'WORK_LIMIT') { res.status(409).json({ error: 'Limite de obras do plano atingido.' }); return; }
    if (code === 'WORK_NOT_FOUND') { res.status(404).json({ error: 'Obra não encontrada nesta empresa.' }); return; }
    if (isUniqueError(error)) { res.status(409).json({ error: 'Este código já está em uso nesta empresa.' }); return; }
    res.status(503).json({ error: 'Não foi possível atualizar a obra.' });
  }
});

tenantOperationsRouter.get('/api/tenant/training-catalog', requireDatabaseAuth, async (_req: Request, res: Response) => {
  if (!tenantContext(res)) { res.status(403).json({ error: 'Conta de empresa obrigatória.' }); return; }
  try {
    const catalog = await getPrisma().nrGlobal.findMany({ where: { ativa: true }, select: {
      id: true, codigo: true, titulo: true, descricao: true, baseLegal: true,
      variacoes: { orderBy: { ordem: 'asc' }, select: { id: true, slug: true, nome: true, modalidade: true,
        cargaHorariaHoras: true, validadeMeses: true, notaMinimaAprovacao: true,
        linhas: { orderBy: { ordem: 'asc' }, select: { id: true, ordem: true, descricao: true, cargaHorariaMin: true } } } },
    }, orderBy: { ordem: 'asc' } });
    res.json({ nrs: catalog });
  } catch { res.status(503).json({ error: 'Catálogo de treinamentos indisponível.' }); }
});

tenantOperationsRouter.get('/api/tenant/trainings', requireDatabaseAuth, async (_req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant) { res.status(403).json({ error: 'Conta de empresa obrigatória.' }); return; }
  try {
    const trainings = await getPrisma().treinamentoEmpresa.findMany({ where: { empresaId: tenant.empresaId }, include: {
      conteudoLinhas: { orderBy: { ordem: 'asc' }, select: { id: true, ordem: true, descricao: true, cargaHorariaMin: true } },
      _count: { select: { questoes: true, turmas: true } },
    }, orderBy: [{ ativo: 'desc' }, { nrCodigo: 'asc' }, { variacaoNome: 'asc' }] });
    res.json({ treinamentos: trainings });
  } catch { res.status(503).json({ error: 'Não foi possível consultar os treinamentos da empresa.' }); }
});

tenantOperationsRouter.post('/api/tenant/trainings', requireDatabaseAuth, async (req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant?.canWrite) { res.status(403).json({ error: 'Permissão de administrador ou responsável técnico obrigatória.' }); return; }
  const variacaoSlug = typeof req.body?.variacaoSlug === 'string' ? req.body.variacaoSlug.trim() : '';
  if (!/^[a-z0-9][a-z0-9-]{1,120}$/.test(variacaoSlug)) { res.status(400).json({ error: 'Variação de treinamento inválida.' }); return; }
  try {
    const db = getPrisma();
    const variacao = await db.nrGlobalVariacao.findFirst({ where: { slug: variacaoSlug, nrGlobal: { ativa: true } }, include: {
      nrGlobal: true, linhas: { orderBy: { ordem: 'asc' } },
    } });
    if (!variacao || !variacao.linhas.length) { res.status(404).json({ error: 'Conteúdo global indisponível.' }); return; }
    const created = await db.$transaction(async (tx) => {
      const access = await lockAndCheckAccess(tx, tenant.empresaId);
      if (!access.allowed) throw new Error(`ACCESS:${access.code}:${access.reason}`);
      const existing = await tx.treinamentoEmpresa.findFirst({ where: { empresaId: tenant.empresaId,
        nrCodigo: variacao.nrGlobal.codigo, variacaoNome: variacao.nome, modalidade: variacao.modalidade, ativo: true } });
      if (existing) throw new Error('TRAINING_EXISTS');
      const training = await tx.treinamentoEmpresa.create({ data: {
        empresaId: tenant.empresaId, nrCodigo: variacao.nrGlobal.codigo, nrTitulo: variacao.nrGlobal.titulo,
        variacaoNome: variacao.nome, modalidade: variacao.modalidade, cargaHorariaHoras: variacao.cargaHorariaHoras,
        validadeMeses: variacao.validadeMeses, notaMinimaAprovacao: variacao.notaMinimaAprovacao,
        baseLegal: variacao.nrGlobal.baseLegal,
        conteudoLinhas: { create: variacao.linhas.map((line) => ({ ordem: line.ordem, descricao: line.descricao, cargaHorariaMin: line.cargaHorariaMin })) },
      }, include: { conteudoLinhas: { orderBy: { ordem: 'asc' } } } });
      await tx.auditoriaAcesso.create({ data: { usuarioId: tenant.usuarioId, empresaId: tenant.empresaId,
        acao: 'TENANT_TRAINING_CREATED_FROM_CATALOG', detalhes: { treinamentoId: training.id, variacaoSlug } } });
      return training;
    });
    res.status(201).json(created);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code.startsWith('ACCESS:')) { const [, accessCode, reason] = code.split(':'); res.status(403).json({ error: reason, code: accessCode }); return; }
    if (code === 'TRAINING_EXISTS') { res.status(409).json({ error: 'Este treinamento já foi incluído nesta empresa.' }); return; }
    res.status(503).json({ error: 'Não foi possível adicionar o treinamento.' });
  }
});
