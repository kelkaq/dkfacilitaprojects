import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma.ts';
import { requireDatabaseAuth } from '../middleware/databaseAuth.ts';

export const tenantSettingsRouter = Router();
const LOGO_ROOT = path.resolve(process.cwd(), 'storage', 'tenant-logos');
const SIGNER_TYPES = ['COLABORADOR', 'RESPONSAVEL_TECNICO', 'INSTRUTOR', 'EMPRESA', 'PERSONALIZADO'] as const;

type SignerType = typeof SIGNER_TYPES[number];
interface SignerConfig { tipo: SignerType; rotulo: string; obrigatoria: boolean; forma: 'DIGITAL' | 'FISICA'; nomeSignatario: string }

function currentTenant(res: Response): { empresaId: string; usuarioId: string; isAdmin: boolean } | null {
  const user = res.locals.authUser;
  return user && typeof user.empresaId === 'string'
    ? { empresaId: user.empresaId, usuarioId: user.id, isAdmin: user.perfil === 'ADMIN_EMPRESA' }
    : null;
}

function tenantLogoDirectory(empresaId: string): string {
  const resolved = path.resolve(LOGO_ROOT, empresaId);
  if (!resolved.startsWith(`${LOGO_ROOT}${path.sep}`)) throw new Error('TENANT_PATH_INVALID');
  return resolved;
}

function parseSigners(value: unknown): SignerConfig[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) return null;
  const signers: SignerConfig[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const signer = item as Record<string, unknown>;
    const tipo = signer.tipo;
    const rotulo = typeof signer.rotulo === 'string' ? signer.rotulo.trim().slice(0, 80) : '';
    const forma = signer.forma === undefined ? 'DIGITAL' : signer.forma;
    const nomeSignatario = typeof signer.nomeSignatario === 'string' ? signer.nomeSignatario.trim().slice(0, 120) : '';
    if (typeof tipo !== 'string' || !SIGNER_TYPES.includes(tipo as SignerType) || rotulo.length < 2 ||
        typeof signer.obrigatoria !== 'boolean' || !['DIGITAL', 'FISICA'].includes(forma as string)) return null;
    signers.push({ tipo: tipo as SignerType, rotulo, obrigatoria: signer.obrigatoria,
      forma: forma as 'DIGITAL' | 'FISICA', nomeSignatario });
  }
  return signers;
}

tenantSettingsRouter.get('/api/tenant/settings', requireDatabaseAuth, async (_req: Request, res: Response) => {
  const tenant = currentTenant(res);
  if (!tenant) { res.status(403).json({ error: 'Conta de empresa obrigatória.' }); return; }
  try {
    const db = getPrisma();
    const [company, templates] = await Promise.all([
      db.empresa.findUnique({ where: { id: tenant.empresaId }, select: {
        tipoDocumento: true, documento: true, razaoSocial: true, nomeFantasia: true,
        emailFinanceiro: true, whatsapp: true, endereco: true, cidade: true, uf: true,
        logoUrl: true, corPrimaria: true, corSecundaria: true, prefixoCertificado: true,
        modeloCertificadoId: true, assinaturasCertificado: true, onboardingConcluido: true,
      } }),
      db.modeloCertificadoGlobal.findMany({ where: { ativo: true, categoria: 'GRATUITO' }, select: { id: true, slug: true, nome: true, descricao: true, categoria: true, previewCssToken: true }, orderBy: { ordem: 'asc' } }),
    ]);
    if (!company) { res.status(404).json({ error: 'Conta não encontrada.' }); return; }
    res.setHeader('Cache-Control', 'no-store');
    const { logoUrl, ...settings } = company;
    res.json({ ...settings, temLogo: Boolean(logoUrl?.startsWith('tenant-logo:')), templates, editavel: tenant.isAdmin });
  } catch { res.status(503).json({ error: 'Não foi possível carregar a configuração da empresa.' }); }
});

tenantSettingsRouter.patch('/api/tenant/settings', requireDatabaseAuth, async (req: Request, res: Response) => {
  const tenant = currentTenant(res);
  if (!tenant?.isAdmin) { res.status(403).json({ error: 'Somente o administrador da empresa pode editar esta configuração.' }); return; }
  const body = req.body ?? {};
  const nomeFantasia = typeof body.nomeFantasia === 'string' ? body.nomeFantasia.trim() : '';
  const emailFinanceiro = typeof body.emailFinanceiro === 'string' ? body.emailFinanceiro.trim().toLowerCase() : '';
  const whatsapp = typeof body.whatsapp === 'string' ? body.whatsapp.replace(/\D/g, '') : '';
  const endereco = typeof body.endereco === 'string' ? body.endereco.trim().slice(0, 240) : '';
  const cidade = typeof body.cidade === 'string' ? body.cidade.trim().slice(0, 120) : '';
  const uf = typeof body.uf === 'string' ? body.uf.trim().toUpperCase() : '';
  const corPrimaria = typeof body.corPrimaria === 'string' ? body.corPrimaria.toUpperCase() : '';
  const corSecundaria = typeof body.corSecundaria === 'string' ? body.corSecundaria.toUpperCase() : '';
  const prefixoCertificado = typeof body.prefixoCertificado === 'string' ? body.prefixoCertificado.trim().toUpperCase() : '';
  const modeloCertificadoId = body.modeloCertificadoId === null ? null : typeof body.modeloCertificadoId === 'string' ? body.modeloCertificadoId : '';
  const signers = parseSigners(body.assinaturasCertificado);
  if (nomeFantasia.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailFinanceiro) || emailFinanceiro.length > 160 ||
      whatsapp.length < 10 || whatsapp.length > 15 || !/^#[0-9A-F]{6}$/.test(corPrimaria) || !/^#[0-9A-F]{6}$/.test(corSecundaria) ||
      !/^[A-Z0-9]{2,12}$/.test(prefixoCertificado) || (uf && !/^[A-Z]{2}$/.test(uf)) || !signers ||
      (modeloCertificadoId !== null && !/^[0-9a-f-]{36}$/i.test(modeloCertificadoId))) {
    res.status(400).json({ error: 'Revise nome, e-mail, WhatsApp, cores, prefixo, modelo e assinaturas.' }); return;
  }
  try {
    const db = getPrisma();
    if (modeloCertificadoId) {
      const template = await db.modeloCertificadoGlobal.findFirst({ where: { id: modeloCertificadoId, ativo: true, categoria: 'GRATUITO' } });
      if (!template) { res.status(400).json({ error: 'Modelo de certificado indisponível.' }); return; }
    }
    const updated = await db.$transaction(async (tx) => {
      const company = await tx.empresa.update({ where: { id: tenant.empresaId }, data: {
        nomeFantasia: nomeFantasia || null, emailFinanceiro, whatsapp,
        endereco: endereco || null, cidade: cidade || null, uf: uf || null,
        corPrimaria, corSecundaria, prefixoCertificado, modeloCertificadoId,
        assinaturasCertificado: signers as unknown as Prisma.InputJsonValue,
        onboardingConcluido: true,
      }, select: { nomeFantasia: true, emailFinanceiro: true, whatsapp: true, corPrimaria: true,
        corSecundaria: true, prefixoCertificado: true, modeloCertificadoId: true, assinaturasCertificado: true,
        onboardingConcluido: true } });
      await tx.auditoriaAcesso.create({ data: { usuarioId: tenant.usuarioId, empresaId: tenant.empresaId,
        acao: 'TENANT_CERTIFICATE_SETTINGS_UPDATED', detalhes: { modeloCertificadoId, quantidadeAssinaturas: signers.length } } });
      return company;
    });
    res.json(updated);
  } catch { res.status(503).json({ error: 'Não foi possível salvar a configuração.' }); }
});

tenantSettingsRouter.get('/api/tenant/settings/logo', requireDatabaseAuth, async (_req: Request, res: Response) => {
  const tenant = currentTenant(res);
  if (!tenant) { res.status(403).json({ error: 'Conta de empresa obrigatória.' }); return; }
  try {
    const company = await getPrisma().empresa.findUnique({ where: { id: tenant.empresaId }, select: { logoUrl: true } });
    const match = company?.logoUrl?.match(/^tenant-logo:([0-9a-f-]{36}\.(?:png|jpg|webp))$/i);
    if (!match) { res.status(404).end(); return; }
    const fullPath = path.resolve(tenantLogoDirectory(tenant.empresaId), match[1]);
    if (!fullPath.startsWith(`${tenantLogoDirectory(tenant.empresaId)}${path.sep}`) || !fs.existsSync(fullPath)) { res.status(404).end(); return; }
    const contentType = match[1].endsWith('.png') ? 'image/png' : match[1].endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    fs.createReadStream(fullPath).pipe(res);
  } catch { res.status(503).end(); }
});

tenantSettingsRouter.post('/api/tenant/settings/logo', requireDatabaseAuth, async (req: Request, res: Response) => {
  const tenant = currentTenant(res);
  if (!tenant?.isAdmin) { res.status(403).json({ error: 'Somente o administrador da empresa pode alterar o logo.' }); return; }
  const dataUrl = req.body?.dataUrl;
  if (typeof dataUrl !== 'string' || dataUrl.length > 2_500_000) { res.status(400).json({ error: 'Envie um logo PNG, JPG ou WebP de até 1,5 MB.' }); return; }
  const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) { res.status(400).json({ error: 'Formato de imagem inválido. Use PNG, JPG ou WebP.' }); return; }
  const bytes = Buffer.from(match[2], 'base64');
  const mime = match[1];
  const validBytes = mime === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) :
    mime === 'jpeg' ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff :
      bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (bytes.length < 16 || bytes.length > 1_572_864 || !validBytes) {
    res.status(400).json({ error: 'O logo deve ser uma imagem válida de até 1,5 MB.' }); return;
  }
  const extension = mime === 'jpeg' ? 'jpg' : mime;
  const filename = `${crypto.randomUUID()}.${extension}`;
  let fullPath = '';
  let committed = false;
  try {
    const db = getPrisma();
    const directory = tenantLogoDirectory(tenant.empresaId);
    fs.mkdirSync(directory, { recursive: true, mode: 0o750 });
    fullPath = path.resolve(directory, filename);
    if (!fullPath.startsWith(`${directory}${path.sep}`)) throw new Error('TENANT_PATH_INVALID');
    fs.writeFileSync(fullPath, bytes, { flag: 'wx', mode: 0o640 });
    const previousLogoUrl = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${tenant.empresaId} FOR UPDATE`;
      const company = await tx.empresa.findUnique({ where: { id: tenant.empresaId }, select: { logoUrl: true } });
      if (!company) throw new Error('TENANT_NOT_FOUND');
      await tx.empresa.update({ where: { id: tenant.empresaId }, data: { logoUrl: `tenant-logo:${filename}` } });
      await tx.auditoriaAcesso.create({ data: { usuarioId: tenant.usuarioId, empresaId: tenant.empresaId, acao: 'TENANT_LOGO_UPDATED' } });
      return company.logoUrl;
    });
    committed = true;
    const oldMatch = previousLogoUrl?.match(/^tenant-logo:([0-9a-f-]{36}\.(?:png|jpg|webp))$/i);
    if (oldMatch) {
      const oldPath = path.resolve(directory, oldMatch[1]);
      if (oldPath.startsWith(`${directory}${path.sep}`) && oldPath !== fullPath && fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch { /* old logo cleanup is best effort */ }
      }
    }
    res.json({ temLogo: true });
  } catch {
    if (!committed && fullPath && fs.existsSync(fullPath)) { try { fs.unlinkSync(fullPath); } catch { /* orphan cleanup is best effort */ } }
    res.status(503).json({ error: 'Não foi possível salvar o logo.' });
  }
});
