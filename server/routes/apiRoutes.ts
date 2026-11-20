import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import {
  createAsaasCharge,
  getAsaasPaymentStatus,
  parseAsaasWebhookAction,
  verifyAsaasWebhookSignature,
  type AsaasChargeRequest,
  type AsaasWebhookEventPayload,
} from '../services/asaasService.ts';
import {
  compilePptxCertificateToPdf,
  inspectAndSavePptxTemplate,
  PPTX_SUPPORTED_TAGS,
  renderCartaAnuenciaHtml,
  renderCertificateFrontAndBackHtml,
  renderComprovanteAvaliacaoHtml,
  renderDossieAplicacaoHtml,
  renderListaPresencaHtml,
  renderPacoteAuditoriaHtml,
  type CartaAnuenciaRenderPayload,
  type CertificateRenderPayload,
  type ComprovanteAvaliacaoPayload,
  type DossieAplicacaoPayload,
  type ListaPresencaPayload,
} from '../services/certificateEngine.ts';
import {
  generateSecureCode,
  signJwtToken,
  verifyPassword,
} from '../lib/security.ts';
import { getPrisma } from '../lib/prisma.ts';
import { requireDatabaseAuth, requireSuperAdmin, requireTenantScope } from '../middleware/databaseAuth.ts';
import { orderRouter } from './orderRoutes.ts';
import { mercadoPagoWebhookRouter } from './mercadoPagoWebhookRoutes.ts';
import { passwordResetRouter } from './passwordResetRoutes.ts';
import { tenantUsersRouter } from './tenantUsersRoutes.ts';
import { tenantAccessRouter } from './tenantAccessRoutes.ts';

export const apiRouter = Router();
const loginAttempts = new Map<string, { count: number; until: number }>();
apiRouter.use(orderRouter);
apiRouter.use(mercadoPagoWebhookRouter);
apiRouter.use(passwordResetRouter);
apiRouter.use(tenantUsersRouter);
apiRouter.use(tenantAccessRouter);

// ----------------------------------------------------------------------------
// 1. HEALTH CHECK & RUNTIME CAPABILITIES
// ----------------------------------------------------------------------------
apiRouter.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: 'DK Facilita — Certifica Software - DK API',
    timestamp: new Date().toISOString(),
    paymentProvider: 'MERCADO_PAGO_PENDING',
  });
});

// ----------------------------------------------------------------------------
// 2. AUTENTICAÇÃO CRIPTOGRÁFICA (HASH SCRYPT + JWT MULTIEMPRESA)
// ----------------------------------------------------------------------------
apiRouter.post('/api/auth/login', async (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body?.password;
  if (!email || email.length > 160 || typeof password !== 'string' || password.length > 256) {
    res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    return;
  }
  const attemptKey = crypto.createHash('sha256').update(`${req.ip}:${email}`).digest('hex');
  const now = Date.now();
  const previous = loginAttempts.get(attemptKey);
  if (previous && previous.until > now && previous.count >= 10) {
    res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' });
    return;
  }
  try {
    const user = await getPrisma().usuario.findUnique({ where: { email } });
    if (!user || !user.ativo || !verifyPassword(password, user.senhaHash)) {
      if (loginAttempts.size >= 10000) {
        for (const [key, value] of loginAttempts) if (value.until <= now) loginAttempts.delete(key);
        if (loginAttempts.size >= 10000) loginAttempts.delete(loginAttempts.keys().next().value!);
      }
      loginAttempts.set(attemptKey, { count: previous && previous.until > now ? previous.count + 1 : 1, until: now + 15 * 60_000 });
      res.status(401).json({ error: 'Credenciais inválidas.' });
      return;
    }
    loginAttempts.delete(attemptKey);
    const token = signJwtToken({
      userId: user.id,
      email: user.email,
      perfil: user.perfil,
      empresaId: user.empresaId,
      versaoSessao: user.versaoSessao,
    });
    res.json({ token, tokenType: 'Bearer', expiresInSeconds: 604800 });
  } catch {
    res.status(503).json({ error: 'Login indisponível.' });
  }
});

apiRouter.get('/api/auth/me', requireDatabaseAuth, (_req: Request, res: Response) => {
  const user = res.locals.authUser;
  res.json({ id: user.id, nome: user.nome, email: user.email, perfil: user.perfil, empresaId: user.empresaId });
});

apiRouter.post('/api/auth/logout-all', requireDatabaseAuth, async (_req: Request, res: Response) => {
  const user = res.locals.authUser;
  await getPrisma().usuario.update({ where: { id: user.id }, data: { versaoSessao: { increment: 1 } } });
  res.status(204).end();
});
apiRouter.post('/api/auth/session-token', (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Emissão de sessão desativada até a autenticação ser verificada no servidor.' });
});

apiRouter.post('/api/auth/hash-password', (_req: Request, res: Response) => {
  res.status(410).json({ error: 'A senha será criada no primeiro acesso seguro.' });
});

// ----------------------------------------------------------------------------
// 3. VERIFICAÇÃO DE PLANO, TRIAL E INADIMPLÊNCIA
// ----------------------------------------------------------------------------
// A avaliação baseada em estado fornecido pelo navegador não pode autorizar acesso.
// Ela era apenas um cálculo consultivo; a decisão real depende do vínculo no banco.
apiRouter.post('/api/tenant/evaluate-access', (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Consulte o estado do plano autenticado no servidor.' });
});

// ----------------------------------------------------------------------------
// 4. COBRANÇA ASAAS (PIX QR CODE & CARTÃO RECORRENTE)
// ----------------------------------------------------------------------------
// Rotas antigas permanecem no código apenas durante a migração. Não podem cobrar.
apiRouter.use('/api/billing/asaas', (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Integração financeira legada desativada.' });
});
apiRouter.use('/webhooks/asaas', (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Webhook financeiro legado desativado.' });
});

apiRouter.post('/api/billing/asaas/charge', async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<AsaasChargeRequest>;
    if (
      !body.empresaId ||
      !body.razaoSocial ||
      !body.cnpj ||
      !body.email ||
      !body.descricao ||
      typeof body.valorCentavos !== 'number' ||
      !body.metodoPagamento ||
      !body.tipoItem ||
      !body.itemSlug ||
      !body.faturaId
    ) {
      res.status(400).json({ error: 'Parâmetros obrigatórios de cobrança ausentes.' });
      return;
    }

    const result = await createAsaasCharge({
      empresaId: body.empresaId,
      razaoSocial: body.razaoSocial,
      cnpj: body.cnpj,
      email: body.email,
      whatsapp: body.whatsapp || '',
      descricao: body.descricao,
      valorCentavos: body.valorCentavos,
      metodoPagamento: body.metodoPagamento,
      ciclo: body.ciclo,
      tipoItem: body.tipoItem,
      itemSlug: body.itemSlug,
      faturaId: body.faturaId,
    });

    res.json(result);
  } catch (error) {
    console.error('Erro ao criar cobrança Asaas:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Falha ao gerar cobrança Asaas.',
    });
  }
});

// ----------------------------------------------------------------------------
// 5. WEBHOOK ASAAS (/webhooks/asaas)
// ----------------------------------------------------------------------------
apiRouter.post('/webhooks/asaas', (req: Request, res: Response) => {
  const tokenHeader = req.headers['asaas-access-token'];
  const tokenValue = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;

  if (!verifyAsaasWebhookSignature(tokenValue)) {
    res.status(401).json({ error: 'Assinatura de webhook Asaas inválida.' });
    return;
  }

  const payload = req.body as AsaasWebhookEventPayload;
  if (!payload || !payload.event) {
    res.status(400).json({ error: 'Payload de webhook Asaas inválido.' });
    return;
  }

  const directive = parseAsaasWebhookAction(payload);
  res.json({
    received: true,
    processedAt: new Date().toISOString(),
    event: payload.event,
    directive,
  });
});

apiRouter.get('/api/billing/asaas/payment/:paymentId', async (req: Request, res: Response) => {
  try {
    const paymentId = String(req.params.paymentId || '').trim();
    if (!paymentId) {
      res.status(400).json({ error: 'paymentId obrigatório.' });
      return;
    }
    const status = await getAsaasPaymentStatus(paymentId);
    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Falha ao consultar pagamento no Asaas.',
    });
  }
});

apiRouter.post('/api/billing/asaas/verify-and-process', (req: Request, res: Response) => {
  const payload = req.body as AsaasWebhookEventPayload;
  if (!payload || !payload.event) {
    res.status(400).json({ error: 'Evento de processamento financeiro inválido.' });
    return;
  }

  const directive = parseAsaasWebhookAction(payload);
  res.json({
    received: true,
    processedAt: new Date().toISOString(),
    event: payload.event,
    directive,
  });
});

// ----------------------------------------------------------------------------
// 6. MOTOR VETORIAL DE DOCUMENTOS (CERTIFICADO, EVD, PROVA, CAN, LISTAS, PACOTE)
// ----------------------------------------------------------------------------
// Nenhum documento oficial deve nascer de campos arbitrários enviados pelo cliente.
// As rotas abaixo permanecem bloqueadas até lerem registros persistidos e autorizados.
apiRouter.post([
  '/api/certificates/render',
  '/api/documents/render-comprovante',
  '/api/documents/render-dossie-aplicacao',
  '/api/documents/render-carta-anuencia',
  '/api/documents/render-lista-presenca',
  '/api/documents/render-pacote-auditoria',
], (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Emissão indisponível até a validação dos registros no servidor.' });
});

apiRouter.post('/api/certificates/render', async (req: Request, res: Response) => {
  try {
    const payload = req.body as CertificateRenderPayload;
    if (
      !payload?.numeroCertificado ||
      !payload?.codigoValidacaoQr ||
      !payload?.snapshotEmpresa?.razaoSocial ||
      !payload?.snapshotColaborador?.nome
    ) {
      res.status(400).json({ error: 'Snapshot de certificado incompleto para renderização.' });
      return;
    }

    const baseUrl =
      payload.validationBaseUrl ||
      process.env.APP_URL ||
      `${req.protocol}://${req.get('host')}`;

    const rendered = await renderCertificateFrontAndBackHtml({
      ...payload,
      validationBaseUrl: baseUrl,
    });

    res.json(rendered);
  } catch (error) {
    console.error('Erro ao renderizar certificado:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Falha no motor de certificados.',
    });
  }
});

apiRouter.post('/api/documents/render-comprovante', async (req: Request, res: Response) => {
  try {
    const payload = req.body as ComprovanteAvaliacaoPayload;
    if (!payload?.codigoEvidencia || !payload?.participante?.nome) {
      res.status(400).json({ error: 'Dados incompletos para o Comprovante de Avaliação.' });
      return;
    }
    const baseUrl =
      payload.validationBaseUrl ||
      process.env.APP_URL ||
      `${req.protocol}://${req.get('host')}`;
    const result = await renderComprovanteAvaliacaoHtml({
      ...payload,
      validationBaseUrl: baseUrl,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao gerar comprovante de avaliação.',
    });
  }
});

apiRouter.post('/api/documents/render-dossie-aplicacao', async (req: Request, res: Response) => {
  try {
    const payload = req.body as DossieAplicacaoPayload;
    if (!payload?.codigoDossie || !payload?.turma?.codigoTurma) {
      res.status(400).json({ error: 'Dados incompletos para o Dossiê da Aplicação.' });
      return;
    }
    const baseUrl =
      payload.validationBaseUrl ||
      process.env.APP_URL ||
      `${req.protocol}://${req.get('host')}`;
    const result = await renderDossieAplicacaoHtml({
      ...payload,
      validationBaseUrl: baseUrl,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao gerar dossiê da aplicação.',
    });
  }
});

apiRouter.post('/api/documents/render-carta-anuencia', async (req: Request, res: Response) => {
  try {
    const payload = req.body as CartaAnuenciaRenderPayload;
    if (!payload?.codigoCarta || !payload?.colaborador?.nome) {
      res.status(400).json({ error: 'Dados incompletos para a Carta de Anuência.' });
      return;
    }
    const baseUrl =
      payload.validationBaseUrl ||
      process.env.APP_URL ||
      `${req.protocol}://${req.get('host')}`;
    const result = await renderCartaAnuenciaHtml({
      ...payload,
      validationBaseUrl: baseUrl,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao gerar Carta de Anuência.',
    });
  }
});

apiRouter.post('/api/documents/render-lista-presenca', (req: Request, res: Response) => {
  try {
    const payload = req.body as ListaPresencaPayload;
    if (!payload?.turma?.codigoTurma) {
      res.status(400).json({ error: 'Dados incompletos para a lista da aplicação.' });
      return;
    }
    const result = renderListaPresencaHtml(payload);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao gerar lista da aplicação.',
    });
  }
});

apiRouter.post('/api/documents/render-pacote-auditoria', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      certificado: CertificateRenderPayload;
      comprovante?: ComprovanteAvaliacaoPayload | null;
      cartaAnuencia?: CartaAnuenciaRenderPayload | null;
    };
    if (!body?.certificado) {
      res.status(400).json({ error: 'Dados do certificado são obrigatórios.' });
      return;
    }
    const baseUrl =
      body.certificado.validationBaseUrl ||
      process.env.APP_URL ||
      `${req.protocol}://${req.get('host')}`;
    const result = await renderPacoteAuditoriaHtml({
      certificado: { ...body.certificado, validationBaseUrl: baseUrl },
      comprovante: body.comprovante
        ? { ...body.comprovante, validationBaseUrl: baseUrl }
        : null,
      cartaAnuencia: body.cartaAnuencia
        ? { ...body.cartaAnuencia, validationBaseUrl: baseUrl }
        : null,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao gerar Pacote de Auditoria.',
    });
  }
});

// ----------------------------------------------------------------------------
// 7. MODELO PRÓPRIO VIA POWERPOINT (.PPTX) POR empresa_id
// ----------------------------------------------------------------------------
apiRouter.get('/api/certificates/pptx-template/tags', (_req: Request, res: Response) => {
  res.json({ tags: PPTX_SUPPORTED_TAGS });
});

apiRouter.post('/api/certificates/pptx-template/upload', requireDatabaseAuth, requireTenantScope, async (req: Request, res: Response) => {
  try {
    const { empresaId, fileName, base64Content } = req.body ?? {};
    if (!empresaId || !fileName || !base64Content) {
      res.status(400).json({ error: 'empresaId, fileName e base64Content são obrigatórios.' });
      return;
    }
    const result = await inspectAndSavePptxTemplate({
      empresaId: String(empresaId),
      fileName: String(fileName),
      base64Content: String(base64Content),
    });
    res.json({
      ok: true,
      ...result,
      templateReferenceUrl: `pptx://${result.empresaId}/${encodeURIComponent(result.fileName)}`,
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Falha ao processar arquivo .pptx.',
    });
  }
});

apiRouter.post('/api/certificates/pptx-template/render', requireDatabaseAuth, requireTenantScope, async (req: Request, res: Response) => {
  try {
    const { empresaId, payload } = req.body ?? {};
    if (!empresaId || !payload) {
      res.status(400).json({ error: 'empresaId e payload do certificado são obrigatórios.' });
      return;
    }
    const result = await compilePptxCertificateToPdf({
      empresaId: String(empresaId),
      payload: payload as CertificateRenderPayload,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Falha ao compilar modelo .pptx.',
    });
  }
});

// ----------------------------------------------------------------------------
// 8. GERADOR DE QR CODE SVG REAL (PROVA PÚBLICA / VALIDAÇÃO / DOSSIÊ)
// ----------------------------------------------------------------------------
apiRouter.get('/api/qrcode', async (req: Request, res: Response) => {
  const text = typeof req.query.text === 'string' ? req.query.text.trim() : '';
  if (!text || text.length > 1000) {
    res.status(400).json({ error: 'Parâmetro "text" obrigatório (máx. 1000 caracteres).' });
    return;
  }

  try {
    const svg = await QRCode.toString(text, {
      type: 'svg',
      margin: 1,
      width: 240,
    });
    res.json({ svg, text });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao gerar QR Code.',
    });
  }
});

apiRouter.get('/api/utils/secure-code', (req: Request, res: Response) => {
  const prefix =
    typeof req.query.prefix === 'string' && /^[A-Z0-9]{2,12}$/.test(req.query.prefix)
      ? req.query.prefix
      : 'DK';
  res.json({ code: generateSecureCode(prefix, 6) });
});

// ----------------------------------------------------------------------------
// 9. UPLOAD E ENTREGA DE BANNERS / FLYERS DO CMS (SUPER ADMIN)
// ----------------------------------------------------------------------------
const CMS_MEDIA_DIR = path.resolve(process.cwd(), 'storage', 'cms_media');

const ALLOWED_IMAGE_MIMES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
};

apiRouter.post('/api/cms/upload-media', requireDatabaseAuth, requireSuperAdmin, (req: Request, res: Response) => {
  try {
    const { dataUrl, fileName } = req.body ?? {};
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      res.status(400).json({ error: 'Envie uma imagem válida (PNG, JPG ou WebP).' });
      return;
    }

    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      res.status(400).json({ error: 'Formato de imagem inválido.' });
      return;
    }

    const mime = match[1].toLowerCase();
    const ext = ALLOWED_IMAGE_MIMES[mime];
    if (!ext) {
      res.status(400).json({ error: 'Formato não suportado. Utilize PNG, JPG ou WebP.' });
      return;
    }

    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 3 * 1024 * 1024) {
      res.status(400).json({ error: 'A imagem deve ter no máximo 3 MB.' });
      return;
    }

    fs.mkdirSync(CMS_MEDIA_DIR, { recursive: true });
    const safeStem = String(fileName || 'banner')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 32) || 'banner';
    const storedName = `${safeStem}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const fullPath = path.join(CMS_MEDIA_DIR, storedName);
    fs.writeFileSync(fullPath, buffer);

    res.json({
      ok: true,
      url: `/api/cms/media/${storedName}`,
      fileName: storedName,
      sizeBytes: buffer.length,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Falha ao salvar imagem de campanha.',
    });
  }
});

apiRouter.get('/api/cms/media/:filename', (req: Request, res: Response) => {
  const raw = String(req.params.filename || '');
  const safe = path.basename(raw);
  if (!safe || safe !== raw || !/^[a-zA-Z0-9_-]+\.(png|jpg|webp)$/.test(safe)) {
    res.status(400).json({ error: 'Nome de arquivo inválido.' });
    return;
  }
  const fullPath = path.join(CMS_MEDIA_DIR, safe);
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'Mídia não encontrada.' });
    return;
  }
  const ext = path.extname(safe).toLowerCase();
  const contentType =
    ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(fullPath).pipe(res);
});
