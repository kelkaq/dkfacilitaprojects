import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma.ts';
import { requireDatabaseAuth } from '../middleware/databaseAuth.ts';
import { evaluateTenantAccess } from '../middleware/tenantGuard.ts';
import { effectiveTenantLimits } from '../lib/tenantLimits.ts';
import { compilePptxCertificateToPdf, inspectAndSavePptxTemplate, PPTX_SUPPORTED_TAGS,
  renderCertificateFrontAndBackHtml, type CertificateRenderPayload } from '../services/certificateEngine.ts';

export const tenantCertificateRouter = Router();
const LOGO_ROOT = path.resolve(process.cwd(), 'storage', 'tenant-logos');
const PPTX_ROOT = path.resolve(process.cwd(), 'storage', 'pptx_templates');
const SIGNATURE_TYPES = ['INSTRUTOR', 'RESPONSAVEL_TECNICO', 'EMPRESA', 'PERSONALIZADO'] as const;

function tenantContext(res: Response) {
  const user = res.locals.authUser;
  if (!user || typeof user.empresaId !== 'string') return null;
  return { empresaId: user.empresaId as string, usuarioId: user.id as string,
    canWrite: user.perfil === 'ADMIN_EMPRESA' || user.perfil === 'RT', isAdmin: user.perfil === 'ADMIN_EMPRESA' };
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
}

function validPngDataUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 500_000) return false;
  const match = value.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return false;
  const bytes = Buffer.from(match[1], 'base64');
  return bytes.length > 20 && bytes.length <= 350_000 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

function snapshotSigners(value: unknown) {
  if (!Array.isArray(value)) return [] as Array<{ tipo: string; rotulo: string; obrigatoria: boolean; forma: 'DIGITAL' | 'FISICA'; nomeSignatario: string }>;
  return value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    .slice(0, 6).map((entry) => ({
      tipo: typeof entry.tipo === 'string' ? entry.tipo : 'PERSONALIZADO',
      rotulo: typeof entry.rotulo === 'string' ? entry.rotulo.slice(0, 80) : 'Assinante',
      obrigatoria: entry.obrigatoria === true,
      forma: entry.forma === 'FISICA' ? 'FISICA' as const : 'DIGITAL' as const,
      nomeSignatario: typeof entry.nomeSignatario === 'string' ? entry.nomeSignatario.slice(0, 120) : '',
    }));
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
  if (!company || !subscription) throw new Error('ACCOUNT_BLOCKED');
  const limits = effectiveTenantLimits({ ...subscription.plano, adicionais: subscription.adicionais });
  const access = evaluateTenantAccess({ status: tenantStatus(company.status, subscription.status),
    trialExpiraEmIso: company.trialExpiraEm?.toISOString(), ...limits,
    colaboradoresAtuais: 0, usuariosAtuais: 0, obrasAtuais: 0 });
  if (!access.permitido) throw new Error('ACCOUNT_BLOCKED');
  return subscription;
}

function storedTemplateKey(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const key = (value as Record<string, unknown>).templateKey;
  return typeof key === 'string' && /^[0-9a-f-]{36}\.pptx$/i.test(key) ? key : null;
}

function tenantTemplatePath(empresaId: string, key: string): string {
  const directory = path.resolve(PPTX_ROOT, empresaId);
  const fullPath = path.resolve(directory, key);
  if (!directory.startsWith(`${PPTX_ROOT}${path.sep}`) || !fullPath.startsWith(`${directory}${path.sep}`) || !/^[0-9a-f-]{36}\.pptx$/i.test(key)) {
    throw new Error('TEMPLATE_PATH_INVALID');
  }
  return fullPath;
}

async function logoDataUrl(empresaId: string, logoUrl: string | null): Promise<string | undefined> {
  const match = logoUrl?.match(/^tenant-logo:([0-9a-f-]{36}\.(?:png|jpg|webp))$/i);
  if (!match) return undefined;
  const directory = path.resolve(LOGO_ROOT, empresaId);
  if (!directory.startsWith(`${LOGO_ROOT}${path.sep}`)) return undefined;
  const file = path.resolve(directory, match[1]);
  if (!file.startsWith(`${directory}${path.sep}`)) return undefined;
  try {
    const bytes = await fs.readFile(file);
    if (bytes.length > 1_572_864) return undefined;
    const mime = match[1].endsWith('.png') ? 'image/png' : match[1].endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    return `data:${mime};base64,${bytes.toString('base64')}`;
  } catch { return undefined; }
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function signerMatchesType(type: string, signerType: string): boolean {
  return type === signerType || (type === 'RESPONSAVEL_TECNICO' && signerType === 'RT');
}

tenantCertificateRouter.get('/api/tenant/certificate-template', requireDatabaseAuth, async (_req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant) { res.status(403).json({ error: 'Conta de empresa obrigatória.' }); return; }
  try {
    const [company, subscription] = await Promise.all([
      getPrisma().empresa.findUnique({ where: { id: tenant.empresaId }, select: { modeloProprioUrl: true, modeloProprioConfig: true } }),
      getPrisma().assinatura.findFirst({ where: { empresaId: tenant.empresaId }, orderBy: { createdAt: 'desc' }, include: {
        adicionais: { where: { ativo: true }, include: { adicional: { select: { recursoChave: true } } } },
      } }),
    ]);
    if (!company) { res.status(404).json({ error: 'Conta não encontrada.' }); return; }
    const config = company.modeloProprioConfig && typeof company.modeloProprioConfig === 'object' && !Array.isArray(company.modeloProprioConfig)
      ? company.modeloProprioConfig as Record<string, unknown> : {};
    const contratado = Boolean(subscription?.adicionais.some((item) => item.adicional.recursoChave === 'modelo_proprio'));
    const ativo = contratado && company.modeloProprioUrl === `pptx-tenant:${String(config.templateKey ?? '')}` && Boolean(storedTemplateKey(config));
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ contratado, ativo, modelo: ativo ? {
      fileName: config.fileName, slideCount: config.slideCount, detectedTags: config.detectedTags,
      sizeBytes: config.sizeBytes, version: config.version, uploadedAt: config.uploadedAt,
    } : null, supportedTags: PPTX_SUPPORTED_TAGS });
  } catch { res.status(503).json({ error: 'Não foi possível consultar o modelo de certificado.' }); }
});

tenantCertificateRouter.post('/api/tenant/certificate-template', requireDatabaseAuth, async (req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant?.isAdmin) { res.status(403).json({ error: 'Somente o administrador da empresa pode alterar o modelo.' }); return; }
  const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.trim().slice(0, 120) : '';
  const base64Content = typeof req.body?.base64Content === 'string' ? req.body.base64Content : '';
  if (!/^[^\\/:*?"<>|]+\.pptx$/i.test(fileName) || base64Content.length < 100 || base64Content.length > 21 * 1024 * 1024) {
    res.status(400).json({ error: 'Envie um arquivo PowerPoint .pptx válido com até 15 MB.' }); return;
  }
  let temporaryPath = '';
  let destinationPath = '';
  let committed = false;
  try {
    const version = crypto.randomUUID();
    const stagingId = `${tenant.empresaId}_${version}`;
    const inspected = await inspectAndSavePptxTemplate({ empresaId: stagingId, fileName, base64Content });
    temporaryPath = path.resolve(process.cwd(), inspected.storageRelativePath);
    const foundTags = new Set(inspected.detectedTags);
    const missingRequiredTags = ['{{NOME_COLABORADOR}}', '{{QRCODE}}'].filter((tag) => !foundTags.has(tag));
    if (!foundTags.has('{{NORMA_NR}}') && !foundTags.has('{{TITULO_TREINAMENTO}}')) missingRequiredTags.push('{{NORMA_NR}} ou {{TITULO_TREINAMENTO}}');
    if (missingRequiredTags.length) throw new Error(`TEMPLATE_TAGS_REQUIRED:${missingRequiredTags.join(', ')}`);
    const templateKey = `${version}.pptx`;
    destinationPath = tenantTemplatePath(tenant.empresaId, templateKey);
    await fs.mkdir(path.dirname(destinationPath), { recursive: true, mode: 0o750 });
    await fs.rename(temporaryPath, destinationPath);
    const metadata = await getPrisma().$transaction(async (tx) => {
      const subscription = await lockAndCheckAccess(tx, tenant.empresaId);
      if (!subscription.adicionais.some((item) => item.adicional.recursoChave === 'modelo_proprio')) throw new Error('MODEL_ADDON_REQUIRED');
      const company = await tx.empresa.findUnique({ where: { id: tenant.empresaId }, select: { modeloProprioConfig: true } });
      if (!company) throw new Error('TENANT_NOT_FOUND');
      const prior = company.modeloProprioConfig && typeof company.modeloProprioConfig === 'object' && !Array.isArray(company.modeloProprioConfig)
        ? company.modeloProprioConfig as Record<string, unknown> : {};
      const config = { templateKey, fileName, slideCount: inspected.slideCount, detectedTags: inspected.detectedTags,
        supportedTags: inspected.supportedTags, sizeBytes: inspected.sizeBytes, version: Number(prior.version ?? 0) + 1,
        sha256: crypto.createHash('sha256').update(await fs.readFile(destinationPath)).digest('hex'),
        uploadedAt: new Date().toISOString() };
      await tx.empresa.update({ where: { id: tenant.empresaId }, data: {
        modeloProprioUrl: `pptx-tenant:${templateKey}`, modeloProprioConfig: config as unknown as Prisma.InputJsonValue,
      } });
      await tx.auditoriaAcesso.create({ data: { usuarioId: tenant.usuarioId, empresaId: tenant.empresaId,
        acao: 'TENANT_PPTX_TEMPLATE_UPLOADED', detalhes: { fileName, slideCount: inspected.slideCount, version: config.version } } });
      return config;
    });
    committed = true;
    res.status(201).json({ ok: true, contratado: true, ativo: true, modelo: {
      fileName: metadata.fileName, slideCount: metadata.slideCount, detectedTags: metadata.detectedTags,
      sizeBytes: metadata.sizeBytes, version: metadata.version, uploadedAt: metadata.uploadedAt,
    }, supportedTags: PPTX_SUPPORTED_TAGS });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code.startsWith('TEMPLATE_TAGS_REQUIRED:')) { res.status(400).json({ error: `O PowerPoint precisa conter os marcadores obrigatórios: ${code.slice('TEMPLATE_TAGS_REQUIRED:'.length)}.` }); return; }
    if (code === 'ACCOUNT_BLOCKED') { res.status(403).json({ error: 'Conta sem acesso operacional ativo.' }); return; }
    if (code === 'MODEL_ADDON_REQUIRED') { res.status(403).json({ error: 'Este recurso exige o adicional Modelo Próprio de Certificado.' }); return; }
    if (code === 'TENANT_NOT_FOUND') { res.status(404).json({ error: 'Conta não encontrada.' }); return; }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Não foi possível validar o PowerPoint.' });
  } finally {
    if (temporaryPath) { try { await fs.unlink(temporaryPath); } catch { /* the file was moved or was not created */ } }
    if (!committed && destinationPath) { try { await fs.unlink(destinationPath); } catch { /* incomplete upload cleanup is best effort */ } }
  }
});

tenantCertificateRouter.delete('/api/tenant/certificate-template', requireDatabaseAuth, async (_req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant?.isAdmin) { res.status(403).json({ error: 'Somente o administrador da empresa pode alterar o modelo.' }); return; }
  try {
    await getPrisma().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${tenant.empresaId} FOR UPDATE`;
      await tx.empresa.update({ where: { id: tenant.empresaId }, data: { modeloProprioUrl: null, modeloProprioConfig: Prisma.DbNull } });
      await tx.auditoriaAcesso.create({ data: { usuarioId: tenant.usuarioId, empresaId: tenant.empresaId,
        acao: 'TENANT_PPTX_TEMPLATE_DISABLED' } });
    });
    res.status(204).end();
  } catch { res.status(503).json({ error: 'Não foi possível retornar ao modelo padrão.' }); }
});

tenantCertificateRouter.get('/api/tenant/signatures', requireDatabaseAuth, async (_req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant?.canWrite) { res.status(403).json({ error: 'Permissão de administrador ou responsável técnico obrigatória.' }); return; }
  try {
    const signatures = await getPrisma().assinaturaDigital.findMany({ where: { empresaId: tenant.empresaId },
      select: { id: true, usuarioId: true, tipo: true, nomeSignatario: true, registro: true, imagemDataUrl: true, ativa: true,
        usuario: { select: { nome: true, perfil: true } } }, orderBy: [{ ativa: 'desc' }, { nomeSignatario: 'asc' }] });
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ assinaturas: signatures });
  } catch { res.status(503).json({ error: 'Não foi possível consultar as assinaturas digitais.' }); }
});

tenantCertificateRouter.post('/api/tenant/signatures', requireDatabaseAuth, async (req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant?.isAdmin) { res.status(403).json({ error: 'Somente o administrador da empresa pode cadastrar assinaturas digitais.' }); return; }
  const tipo = req.body?.tipo;
  const nomeSignatario = typeof req.body?.nomeSignatario === 'string' ? req.body.nomeSignatario.trim().slice(0, 120) : '';
  const registro = typeof req.body?.registro === 'string' ? req.body.registro.trim().slice(0, 80) || null : null;
  const usuarioId = req.body?.usuarioId === '' || req.body?.usuarioId === null || req.body?.usuarioId === undefined ? null : req.body.usuarioId;
  const imagemDataUrl = req.body?.imagemDataUrl;
  if (!SIGNATURE_TYPES.includes(tipo) || nomeSignatario.length < 2 || (usuarioId !== null && !isUuid(usuarioId)) || !validPngDataUrl(imagemDataUrl)) {
    res.status(400).json({ error: 'Informe o papel, nome, imagem PNG válida e responsável da mesma empresa quando aplicável.' }); return;
  }
  try {
    const created = await getPrisma().$transaction(async (tx) => {
      await lockAndCheckAccess(tx, tenant.empresaId);
      if (usuarioId) {
        const user = await tx.usuario.findFirst({ where: { id: usuarioId, empresaId: tenant.empresaId, ativo: true } });
        const permitted = tipo === 'INSTRUTOR' ? ['ADMIN_EMPRESA', 'RT', 'INSTRUTOR_TST'].includes(user?.perfil ?? '') : ['ADMIN_EMPRESA', 'RT'].includes(user?.perfil ?? '');
        if (!user || !permitted) throw new Error('SIGNER_NOT_FOUND');
      }
      const item = await tx.assinaturaDigital.create({ data: { empresaId: tenant.empresaId, usuarioId, tipo, nomeSignatario,
        registro, imagemDataUrl, ativa: true }, select: { id: true, usuarioId: true, tipo: true, nomeSignatario: true, registro: true, ativa: true } });
      await tx.auditoriaAcesso.create({ data: { usuarioId: tenant.usuarioId, empresaId: tenant.empresaId,
        acao: 'TENANT_DIGITAL_SIGNATURE_CREATED', detalhes: { assinaturaId: item.id, tipo } } });
      return item;
    });
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof Error && error.message === 'SIGNER_NOT_FOUND') { res.status(404).json({ error: 'Responsável ativo não encontrado nesta empresa.' }); return; }
    if (error instanceof Error && error.message === 'ACCOUNT_BLOCKED') { res.status(403).json({ error: 'Conta sem acesso operacional ativo.' }); return; }
    res.status(503).json({ error: 'Não foi possível cadastrar a assinatura digital.' });
  }
});

tenantCertificateRouter.patch('/api/tenant/signatures/:id', requireDatabaseAuth, async (req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant?.isAdmin) { res.status(403).json({ error: 'Somente o administrador da empresa pode alterar assinaturas digitais.' }); return; }
  const id = String(req.params.id ?? '');
  if (!isUuid(id) || typeof req.body?.ativa !== 'boolean') { res.status(400).json({ error: 'Assinatura ou estado inválido.' }); return; }
  try {
    const updated = await getPrisma().$transaction(async (tx) => {
      await lockAndCheckAccess(tx, tenant.empresaId);
      const current = await tx.assinaturaDigital.findFirst({ where: { id, empresaId: tenant.empresaId } });
      if (!current) throw new Error('SIGNATURE_NOT_FOUND');
      const item = await tx.assinaturaDigital.update({ where: { id }, data: { ativa: req.body.ativa },
        select: { id: true, tipo: true, nomeSignatario: true, ativa: true } });
      await tx.auditoriaAcesso.create({ data: { usuarioId: tenant.usuarioId, empresaId: tenant.empresaId,
        acao: 'TENANT_DIGITAL_SIGNATURE_STATUS_UPDATED', detalhes: { assinaturaId: id, ativa: item.ativa } } });
      return item;
    });
    res.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === 'SIGNATURE_NOT_FOUND') { res.status(404).json({ error: 'Assinatura não encontrada nesta empresa.' }); return; }
    if (error instanceof Error && error.message === 'ACCOUNT_BLOCKED') { res.status(403).json({ error: 'Conta sem acesso operacional ativo.' }); return; }
    res.status(503).json({ error: 'Não foi possível alterar a assinatura.' });
  }
});

tenantCertificateRouter.get('/api/tenant/classes/:id/attempts', requireDatabaseAuth, async (req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant?.canWrite) { res.status(403).json({ error: 'Permissão de administrador ou responsável técnico obrigatória.' }); return; }
  const turmaId = String(req.params.id ?? '');
  if (!isUuid(turmaId)) { res.status(400).json({ error: 'Turma inválida.' }); return; }
  try {
    const classItem = await getPrisma().turmaAplicacao.findFirst({ where: { id: turmaId, empresaId: tenant.empresaId }, select: { id: true } });
    if (!classItem) { res.status(404).json({ error: 'Turma não encontrada nesta empresa.' }); return; }
    const attempts = await getPrisma().provaTentativa.findMany({ where: { turmaId, empresaId: tenant.empresaId, status: 'APROVADO' },
      select: { id: true, notaPercentual: true, concluidaEm: true, colaborador: { select: { id: true, nome: true, cpf: true } },
      }, orderBy: { concluidaEm: 'desc' }, take: 100 });
    const issued = await getPrisma().certificado.findMany({ where: { empresaId: tenant.empresaId, turmaId }, select: { id: true, colaboradorId: true, numeroCertificado: true } });
    const issuedByCollaborator = new Map(issued.map((item) => [item.colaboradorId, { id: item.id, numeroCertificado: item.numeroCertificado }]));
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ tentativas: attempts.map((item) => ({ id: item.id, notaPercentual: item.notaPercentual, concluidaEm: item.concluidaEm,
      colaborador: { id: item.colaborador.id, nome: item.colaborador.nome, cpfFinal: item.colaborador.cpf.slice(-4) },
      certificado: issuedByCollaborator.get(item.colaborador.id) ?? null })) });
  } catch { res.status(503).json({ error: 'Não foi possível consultar as tentativas aprovadas.' }); }
});

tenantCertificateRouter.get('/api/tenant/certificates', requireDatabaseAuth, async (_req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant) { res.status(403).json({ error: 'Conta de empresa obrigatória.' }); return; }
  try {
    const certificates = await getPrisma().certificado.findMany({ where: { empresaId: tenant.empresaId },
      select: { id: true, numeroCertificado: true, codigoValidacaoQr: true, nrCodigo: true, treinamentoTitulo: true,
        dataRealizacao: true, dataValidade: true, status: true, emitidoEm: true, turma: { select: { codigoTurma: true, titulo: true } },
        colaborador: { select: { nome: true, cpf: true } } }, orderBy: { emitidoEm: 'desc' }, take: 200 });
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ certificados: certificates.map((item) => ({ ...item,
      colaborador: { nome: item.colaborador.nome, cpfFinal: item.colaborador.cpf.slice(-4) } })) });
  } catch { res.status(503).json({ error: 'Não foi possível consultar os certificados.' }); }
});

tenantCertificateRouter.post('/api/tenant/certificates/issue', requireDatabaseAuth, async (req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant?.canWrite) { res.status(403).json({ error: 'Permissão de administrador ou responsável técnico obrigatória.' }); return; }
  const tentativaId = req.body?.tentativaId;
  if (!isUuid(tentativaId)) { res.status(400).json({ error: 'Tentativa de prova inválida.' }); return; }
  try {
    const result = await getPrisma().$transaction(async (tx) => {
      const subscription = await lockAndCheckAccess(tx, tenant.empresaId);
      const attempt = await tx.provaTentativa.findFirst({ where: { id: tentativaId, empresaId: tenant.empresaId }, include: {
        turma: { include: { treinamento: { include: { conteudoLinhas: { orderBy: { ordem: 'asc' } } } }, instrutor: true, rt: true } },
        colaborador: true,
      } });
      if (!attempt) throw new Error('ATTEMPT_NOT_FOUND');
      if (attempt.status !== 'APROVADO' || !attempt.concluidaEm) throw new Error('ATTEMPT_NOT_APPROVED');
      const existing = await tx.certificado.findFirst({ where: { empresaId: tenant.empresaId, turmaId: attempt.turmaId, colaboradorId: attempt.colaboradorId } });
      if (existing) return { certificate: existing, created: false };
      if (attempt.turma.status === 'CANCELADA') throw new Error('CLASS_CANCELLED');
      const company = await tx.empresa.findUnique({ where: { id: tenant.empresaId } });
      if (!company) throw new Error('TENANT_NOT_FOUND');
      const modelConfig = company.modeloProprioConfig && typeof company.modeloProprioConfig === 'object' && !Array.isArray(company.modeloProprioConfig)
        ? company.modeloProprioConfig as Record<string, unknown> : {};
      const templateKey = storedTemplateKey(modelConfig);
      const templateActive = Boolean(templateKey && company.modeloProprioUrl === `pptx-tenant:${templateKey}`);
      if (templateActive && !subscription.adicionais.some((item) => item.adicional.recursoChave === 'modelo_proprio')) throw new Error('MODEL_ADDON_REQUIRED');
      let modelSnapshot: CertificateRenderPayload['snapshotEmpresa']['modeloProprio'] = null;
      if (templateActive && templateKey) {
        const templatePath = tenantTemplatePath(company.id, templateKey);
        const bytes = await fs.readFile(templatePath);
        const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
        if (checksum !== modelConfig.sha256) throw new Error('TEMPLATE_INTEGRITY_FAILED');
        modelSnapshot = { templateKey, fileName: String(modelConfig.fileName ?? 'modelo.pptx').slice(0, 120),
          version: Number(modelConfig.version ?? 1), sha256: checksum,
          detectedTags: Array.isArray(modelConfig.detectedTags) ? modelConfig.detectedTags.filter((tag): tag is string => typeof tag === 'string').slice(0, 40) : [] };
        const modelTags = new Set(modelSnapshot.detectedTags ?? []);
        for (const [index, signer] of snapshotSigners((attempt.respostasJson as { assinaturasCertificado?: unknown[] }).assinaturasCertificado).entries()) {
          if (!signer.obrigatoria) continue;
          const indexToken = `{{ASSINATURA_${index + 1}}}`;
          const legacyToken = signer.tipo === 'COLABORADOR' ? '{{ASSINATURA_ALUNO}}' : signer.tipo === 'INSTRUTOR' ? '{{ASSINATURA_INSTRUTOR}}' :
            signer.tipo === 'RESPONSAVEL_TECNICO' ? '{{ASSINATURA_RT}}' : '';
          if (!modelTags.has(indexToken) && (!legacyToken || !modelTags.has(legacyToken))) throw new Error(`TEMPLATE_SIGNER_TAG_REQUIRED:${signer.rotulo}`);
        }
      } else if (company.modeloProprioUrl?.startsWith('pptx-tenant:')) {
        throw new Error('TEMPLATE_CONFIG_INVALID');
      }
      const training = attempt.turma.treinamento;
      const proofSnapshot = attempt.respostasJson as { assinaturasCertificado?: unknown[] };
      const signersConfig = snapshotSigners(proofSnapshot.assinaturasCertificado);
      if (!signersConfig.length) signersConfig.push({ tipo: 'COLABORADOR', rotulo: 'Colaborador', obrigatoria: true, forma: 'DIGITAL', nomeSignatario: '' });
      const digitalSignatures = await tx.assinaturaDigital.findMany({ where: { empresaId: tenant.empresaId, ativa: true },
        include: { usuario: { select: { id: true, nome: true, registroProfissional: true, perfil: true, ativo: true } } } });
      const renderedSigners: NonNullable<CertificateRenderPayload['snapshotEmpresa']['assinaturasCertificado']> = [];
      for (const configured of signersConfig) {
        let name = configured.nomeSignatario;
        let registro: string | null = null;
        let signatureUrl: string | null = null;
        if (configured.tipo === 'COLABORADOR') {
          name = attempt.colaborador.nome;
          registro = `CPF ${attempt.colaborador.cpf}`;
          signatureUrl = configured.forma === 'DIGITAL' ? attempt.assinaturaDataUrl : null;
        } else {
          const assigned = configured.tipo === 'INSTRUTOR' ? attempt.turma.instrutor :
            configured.tipo === 'RESPONSAVEL_TECNICO' ? attempt.turma.rt : null;
          const stored = digitalSignatures.find((item) => signerMatchesType(configured.tipo, item.tipo) &&
            (assigned ? item.usuarioId === assigned.id : (configured.nomeSignatario ? item.nomeSignatario.toLocaleLowerCase('pt-BR') === configured.nomeSignatario.toLocaleLowerCase('pt-BR') : item.usuarioId === null)));
          if (assigned) { name = assigned.nome; registro = assigned.registroProfissional; }
          if (stored && (!assigned || stored.usuarioId === assigned.id)) {
            if (!assigned || name === configured.nomeSignatario || configured.tipo === 'EMPRESA' || configured.tipo === 'PERSONALIZADO') name = stored.nomeSignatario;
            registro = stored.registro || registro;
            signatureUrl = configured.forma === 'DIGITAL' ? stored.imagemDataUrl : null;
          }
        }
        if (configured.obrigatoria && configured.forma === 'DIGITAL' && !signatureUrl) {
          throw new Error(`SIGNATURE_REQUIRED:${configured.rotulo}`);
        }
        renderedSigners.push({ tipo: configured.tipo, rotulo: configured.rotulo, nome: name || configured.rotulo,
          registro, forma: configured.forma, assinaturaDataUrl: signatureUrl });
      }
      const logo = await logoDataUrl(company.id, company.logoUrl);
      const sequence = await tx.certificado.count({ where: { empresaId: company.id } }) + 1;
      const year = attempt.turma.dataRealizacao.getUTCFullYear();
      const number = `${company.prefixoCertificado}-${year}-${String(sequence).padStart(6, '0')}`;
      const code = crypto.randomBytes(32).toString('base64url');
      const instructor = attempt.turma.instrutor;
      const rt = attempt.turma.rt;
      const certificate = await tx.certificado.create({ data: {
        empresaId: company.id, turmaId: attempt.turmaId, colaboradorId: attempt.colaboradorId,
        numeroCertificado: number, codigoValidacaoQr: code, nrCodigo: training.nrCodigo,
        treinamentoTitulo: training.variacaoNome, cargaHorariaHoras: training.cargaHorariaHoras,
        dataRealizacao: attempt.turma.dataRealizacao,
        dataValidade: addMonths(attempt.turma.dataRealizacao, training.validadeMeses),
        snapshotConteudoLinhas: training.conteudoLinhas.map((line) => ({ ordem: line.ordem, descricao: line.descricao, cargaHorariaMin: line.cargaHorariaMin })) as unknown as Prisma.InputJsonValue,
        snapshotEmpresa: { razaoSocial: company.nomeFantasia || company.razaoSocial, cnpj: company.documento,
          tipoPessoa: company.tipoDocumento, exibirDocumento: true, telefoneRodape: company.whatsapp,
          emailRodape: company.emailFinanceiro, endereco: company.endereco, cidade: company.cidade, uf: company.uf,
          logoUrl: logo, corPrimaria: company.corPrimaria, corSecundaria: company.corSecundaria,
          instrutorNome: instructor?.nome, instrutorRegistro: instructor?.registroProfissional,
          rtNome: rt?.nome, rtRegistro: rt?.registroProfissional, assinaturasCertificado: renderedSigners,
          modeloProprio: modelSnapshot } as unknown as Prisma.InputJsonValue,
        snapshotColaborador: { nome: attempt.colaborador.nome, cpf: attempt.colaborador.cpf,
          funcao: attempt.colaborador.funcao, assinaturaDataUrl: attempt.assinaturaDataUrl } as unknown as Prisma.InputJsonValue,
      } });
      await tx.auditoriaAcesso.create({ data: { usuarioId: tenant.usuarioId, empresaId: tenant.empresaId,
        acao: 'TENANT_CERTIFICATE_ISSUED', detalhes: { certificadoId: certificate.id, tentativaId, numeroCertificado: number } } });
      return { certificate, created: true };
    }, { isolationLevel: 'Serializable' });
    res.status(result.created ? 201 : 200).json({ id: result.certificate.id, numeroCertificado: result.certificate.numeroCertificado,
      codigoValidacaoQr: result.certificate.codigoValidacaoQr, criado: result.created });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'ATTEMPT_NOT_FOUND') { res.status(404).json({ error: 'Tentativa não encontrada nesta empresa.' }); return; }
    if (code === 'ATTEMPT_NOT_APPROVED') { res.status(409).json({ error: 'Só é possível emitir certificado para prova aprovada.' }); return; }
    if (code === 'CLASS_CANCELLED') { res.status(409).json({ error: 'Turma cancelada não permite emissão.' }); return; }
    if (code === 'ACCOUNT_BLOCKED') { res.status(403).json({ error: 'Conta sem acesso operacional ativo.' }); return; }
    if (code === 'MODEL_ADDON_REQUIRED') { res.status(403).json({ error: 'O adicional Modelo Próprio não está ativo nesta conta.' }); return; }
    if (code.startsWith('TEMPLATE_SIGNER_TAG_REQUIRED:')) { res.status(409).json({ error: `O modelo ativo não contém marcador para a assinatura obrigatória “${code.slice('TEMPLATE_SIGNER_TAG_REQUIRED:'.length)}”. Envie uma nova versão com a tag da assinatura.` }); return; }
    if (code === 'TEMPLATE_INTEGRITY_FAILED' || code === 'TEMPLATE_CONFIG_INVALID') { res.status(409).json({ error: 'O modelo PowerPoint desta empresa está inválido ou foi alterado. Revise o modelo antes de emitir.' }); return; }
    if (code === 'ENOENT') { res.status(409).json({ error: 'O arquivo da versão de modelo não está disponível. Envie novamente o PowerPoint.' }); return; }
    if (code.startsWith('SIGNATURE_REQUIRED:')) { res.status(409).json({ error: `Cadastre a assinatura digital obrigatória: ${code.slice('SIGNATURE_REQUIRED:'.length)}` }); return; }
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') { res.status(409).json({ error: 'Este certificado já foi emitido. Atualize a lista.' }); return; }
    res.status(503).json({ error: 'Não foi possível emitir o certificado.' });
  }
});

tenantCertificateRouter.get('/api/tenant/certificates/:id/print', requireDatabaseAuth, async (req: Request, res: Response) => {
  const tenant = tenantContext(res);
  if (!tenant) { res.status(403).json({ error: 'Conta de empresa obrigatória.' }); return; }
  const id = String(req.params.id ?? '');
  if (!isUuid(id)) { res.status(400).json({ error: 'Certificado inválido.' }); return; }
  try {
    const cert = await getPrisma().certificado.findFirst({ where: { id, empresaId: tenant.empresaId } });
    if (!cert) { res.status(404).json({ error: 'Certificado não encontrado nesta empresa.' }); return; }
    const company = cert.snapshotEmpresa as CertificateRenderPayload['snapshotEmpresa'];
    const collaborator = cert.snapshotColaborador as CertificateRenderPayload['snapshotColaborador'];
    const lines = cert.snapshotConteudoLinhas as CertificateRenderPayload['snapshotConteudoLinhas'];
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const base = new URL(appUrl).origin;
    const payload: CertificateRenderPayload = { numeroCertificado: cert.numeroCertificado,
      codigoValidacaoQr: cert.codigoValidacaoQr, nrCodigo: cert.nrCodigo, treinamentoTitulo: cert.treinamentoTitulo,
      cargaHorariaHoras: cert.cargaHorariaHoras, dataRealizacaoIso: cert.dataRealizacao.toISOString(),
      dataValidadeIso: cert.dataValidade.toISOString(), validationBaseUrl: base, validationQueryParam: 'csdk_cert',
      snapshotEmpresa: company, snapshotColaborador: collaborator, snapshotConteudoLinhas: lines };
    if (company.modeloProprio) {
      const model = company.modeloProprio;
      const templatePath = tenantTemplatePath(tenant.empresaId, model.templateKey);
      const templateBytes = await fs.readFile(templatePath);
      const checksum = crypto.createHash('sha256').update(templateBytes).digest('hex');
      if (checksum !== model.sha256) { res.status(409).json({ error: 'O arquivo do modelo deste certificado não corresponde à versão emitida.' }); return; }
      const compiled = await compilePptxCertificateToPdf({ empresaId: tenant.empresaId, templateKey: model.templateKey, payload });
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-CSDK-Document-Mode', compiled.mode);
      if (compiled.mode === 'LIBREOFFICE_PDF' && compiled.pdfBase64) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${cert.numeroCertificado.replace(/[^A-Za-z0-9_-]/g, '_')}.pdf"`);
        res.send(Buffer.from(compiled.pdfBase64, 'base64'));
        return;
      }
      if (compiled.pptxBase64) {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.setHeader('Content-Disposition', `attachment; filename="${cert.numeroCertificado.replace(/[^A-Za-z0-9_-]/g, '_')}.pptx"`);
        res.send(Buffer.from(compiled.pptxBase64, 'base64'));
        return;
      }
      res.status(503).json({ error: compiled.message });
      return;
    }
    const rendered = await renderCertificateFrontAndBackHtml(payload);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    res.send(rendered.html);
  } catch { res.status(503).json({ error: 'Não foi possível montar a impressão do certificado.' }); }
});

tenantCertificateRouter.get('/api/public/certificates/:code', async (req: Request, res: Response) => {
  const code = String(req.params.code ?? '');
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) { res.status(404).json({ error: 'Certificado não encontrado.' }); return; }
  try {
    const cert = await getPrisma().certificado.findUnique({ where: { codigoValidacaoQr: code }, select: {
      numeroCertificado: true, nrCodigo: true, treinamentoTitulo: true, cargaHorariaHoras: true,
      dataRealizacao: true, dataValidade: true, status: true, emitidoEm: true,
      snapshotEmpresa: true, snapshotColaborador: true,
    } });
    if (!cert) { res.status(404).json({ error: 'Certificado não encontrado.' }); return; }
    const company = cert.snapshotEmpresa as { razaoSocial?: string };
    const person = cert.snapshotColaborador as { nome?: string };
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({ numeroCertificado: cert.numeroCertificado, codigoNorma: cert.nrCodigo, treinamento: cert.treinamentoTitulo,
      cargaHorariaHoras: cert.cargaHorariaHoras, dataRealizacao: cert.dataRealizacao, dataValidade: cert.dataValidade,
      status: cert.status, emitidoEm: cert.emitidoEm, empresa: company.razaoSocial ?? 'Empresa',
      participante: person.nome ?? 'Participante' });
  } catch { res.status(503).json({ error: 'Não foi possível consultar o certificado.' }); }
});
