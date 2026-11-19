import { Router, type Request, type Response } from 'express';
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
  renderCertificateFrontAndBackHtml,
  type CertificateRenderPayload,
} from '../services/certificateEngine.ts';
import {
  generateSecureCode,
  hashPassword,
  signJwtToken,
  verifyPassword,
} from '../lib/security.ts';
import { evaluateTenantAccess, type TenantPlanState } from '../middleware/tenantGuard.ts';

export const apiRouter = Router();

// ----------------------------------------------------------------------------
// 1. HEALTH CHECK & RUNTIME CAPABILITIES
// ----------------------------------------------------------------------------
apiRouter.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: 'DK Facilita — Certifica Software - DK API',
    timestamp: new Date().toISOString(),
    asaasConfigured: Boolean(
      process.env.ASAAS_API_KEY &&
        !process.env.ASAAS_API_KEY.includes('SUA_CHAVE') &&
        process.env.ASAAS_API_KEY.length > 16
    ),
  });
});

// ----------------------------------------------------------------------------
// 2. AUTENTICAÇÃO CRIPTOGRÁFICA (HASH SCRYPT + JWT MULTIEMPRESA)
// ----------------------------------------------------------------------------
apiRouter.post('/api/auth/session-token', (req: Request, res: Response) => {
  const { userId, email, perfil, empresaId } = req.body ?? {};
  if (!userId || !email || !perfil) {
    res.status(400).json({ error: 'userId, email e perfil são obrigatórios.' });
    return;
  }

  const token = signJwtToken({
    userId: String(userId),
    email: String(email),
    perfil,
    empresaId: empresaId ? String(empresaId) : null,
  });

  res.json({ token, tokenType: 'Bearer', expiresInSeconds: 60 * 60 * 24 * 7 });
});

apiRouter.post('/api/auth/hash-password', (req: Request, res: Response) => {
  const { password } = req.body ?? {};
  if (typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: 'A senha deve possuir no mínimo 6 caracteres.' });
    return;
  }
  const passwordHash = hashPassword(password);
  const verified = verifyPassword(password, passwordHash);
  res.json({ passwordHash, verified });
});

// ----------------------------------------------------------------------------
// 3. VERIFICAÇÃO DE PLANO, TRIAL E INADIMPLÊNCIA
// ----------------------------------------------------------------------------
apiRouter.post('/api/tenant/evaluate-access', (req: Request, res: Response) => {
  const state = req.body as TenantPlanState;
  if (!state || !state.status) {
    res.status(400).json({ error: 'Estado da empresa inválido.' });
    return;
  }
  const decision = evaluateTenantAccess(state);
  res.json(decision);
});

// ----------------------------------------------------------------------------
// 4. COBRANÇA ASAAS (PIX QR CODE & CARTÃO RECORRENTE)
// ----------------------------------------------------------------------------
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
// 6. MOTOR DE CERTIFICADOS (FRENTE + VERSO 1 OU 2 COLUNAS + QR CODE)
// ----------------------------------------------------------------------------
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

// ----------------------------------------------------------------------------
// 7. GERADOR DE QR CODE SVG REAL (PROVA PÚBLICA / VALIDAÇÃO / DOSSIÊ)
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
