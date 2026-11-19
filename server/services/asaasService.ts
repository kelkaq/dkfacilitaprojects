import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { sanitizeDigits } from '../lib/security.ts';

const ASAAS_API_KEY = process.env.ASAAS_API_KEY || '';
const ASAAS_API_URL =
  process.env.ASAAS_API_URL ||
  (ASAAS_API_KEY.includes('hmlg') || ASAAS_API_KEY.includes('sandbox')
    ? 'https://api-sandbox.asaas.com/v3'
    : 'https://api.asaas.com/v3');
const ASAAS_WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN || '';

export async function getAsaasPaymentStatus(asaasPaymentId: string): Promise<{
  id: string;
  status: string;
  value?: number;
  billingType?: string;
  paymentDate?: string | null;
}> {
  const hasRealKey =
    Boolean(ASAAS_API_KEY) &&
    !ASAAS_API_KEY.includes('SUA_CHAVE') &&
    ASAAS_API_KEY.length > 16;

  if (!hasRealKey) {
    return { id: asaasPaymentId, status: 'PENDING', paymentDate: null };
  }

  return await asaasFetch<{
    id: string;
    status: string;
    value?: number;
    billingType?: string;
    paymentDate?: string | null;
  }>(`/payments/${encodeURIComponent(asaasPaymentId)}`);
}

export interface AsaasChargeRequest {
  empresaId: string;
  razaoSocial: string;
  cnpj: string;
  email: string;
  whatsapp: string;
  descricao: string;
  valorCentavos: number;
  metodoPagamento: 'PIX' | 'CARTAO_CREDITO';
  ciclo?: 'MENSAL' | 'SEMESTRAL' | 'ANUAL';
  tipoItem: 'PLANO' | 'ADICIONAL' | 'UPGRADE';
  itemSlug: string;
  faturaId: string;
}

export interface AsaasChargeResult {
  modoIntegracao: 'ASAAS_API_V3' | 'ASAAS_SANDBOX_PRONTO';
  asaasCustomerId: string;
  asaasPaymentId: string;
  status: 'PENDENTE' | 'PAGA';
  valorCentavos: number;
  vencimentoIso: string;
  invoiceUrl: string;
  pixQrCodePayload: string | null;
  pixQrCodeSvg: string | null;
}

async function asaasFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${ASAAS_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      access_token: ASAAS_API_KEY,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Erro Asaas (${response.status}): ${bodyText}`);
  }
  return (await response.json()) as T;
}

function buildBrCodePixPayload(params: {
  txId: string;
  merchantName: string;
  amountBRL: number;
  description: string;
}): string {
  const cleanName = params.merchantName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .slice(0, 25);
  const amount = params.amountBRL.toFixed(2);
  const tx = params.txId.replace(/[^A-Za-z0-9]/g, '').slice(0, 25);
  const base = `00020126580014BR.GOV.BCB.PIX0136dkfacilita.com/pix/${tx}52040000530398654${String(amount.length).padStart(2, '0')}${amount}5802BR59${String(cleanName.length).padStart(2, '0')}${cleanName}6009SAO PAULO62${String(tx.length + 4).padStart(2, '0')}05${String(tx.length).padStart(2, '0')}${tx}6304`;
  const crc = crypto.createHash('sha256').update(base).digest('hex').slice(0, 4).toUpperCase();
  return `${base}${crc}`;
}

export async function createAsaasCharge(input: AsaasChargeRequest): Promise<AsaasChargeResult> {
  const valorBRL = Number((input.valorCentavos / 100).toFixed(2));
  const dueDateObj = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const vencimentoIso = dueDateObj.toISOString().slice(0, 10);
  const externalReference = `${input.empresaId}:${input.faturaId}:${input.tipoItem}:${input.itemSlug}`;

  const hasRealKey =
    Boolean(ASAAS_API_KEY) &&
    !ASAAS_API_KEY.includes('SUA_CHAVE') &&
    ASAAS_API_KEY.length > 16;

  if (hasRealKey) {
    // 1. Cria ou localiza cliente no Asaas API v3
    const cpfCnpj = sanitizeDigits(input.cnpj);
    const existingCustomers = await asaasFetch<{ data: { id: string }[] }>(
      `/customers?cpfCnpj=${cpfCnpj}`
    );

    let customerId = existingCustomers.data?.[0]?.id;
    if (!customerId) {
      const createdCustomer = await asaasFetch<{ id: string }>('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: input.razaoSocial,
          cpfCnpj,
          email: input.email,
          mobilePhone: sanitizeDigits(input.whatsapp),
          externalReference: input.empresaId,
        }),
      });
      customerId = createdCustomer.id;
    }

    // 2. Cria cobrança Pix ou Assinatura Recorrente Cartão
    const billingType = input.metodoPagamento === 'PIX' ? 'PIX' : 'CREDIT_CARD';
    const payment = await asaasFetch<{ id: string; invoiceUrl?: string }>('/payments', {
      method: 'POST',
      body: JSON.stringify({
        customer: customerId,
        billingType,
        value: valorBRL,
        dueDate: vencimentoIso,
        description: input.descricao,
        externalReference,
      }),
    });

    let pixQrCodePayload: string | null = null;
    let pixQrCodeSvg: string | null = null;

    if (billingType === 'PIX') {
      const qr = await asaasFetch<{ payload: string }>(`/payments/${payment.id}/pixQrCode`);
      pixQrCodePayload = qr.payload;
      pixQrCodeSvg = await QRCode.toString(qr.payload, {
        type: 'svg',
        margin: 1,
        width: 220,
      });
    }

    return {
      modoIntegracao: 'ASAAS_API_V3',
      asaasCustomerId: customerId,
      asaasPaymentId: payment.id,
      status: 'PENDENTE',
      valorCentavos: input.valorCentavos,
      vencimentoIso,
      invoiceUrl: payment.invoiceUrl || `https://www.asaas.com/i/${payment.id}`,
      pixQrCodePayload,
      pixQrCodeSvg,
    };
  }

  // Modo de homologação técnica quando ASAAS_API_KEY ainda não foi configurada nos Secrets
  const asaasCustomerId = `cus_dk_${input.empresaId.slice(0, 12)}`;
  const asaasPaymentId = `pay_dk_${crypto.randomBytes(6).toString('hex')}`;
  const pixQrCodePayload =
    input.metodoPagamento === 'PIX'
      ? buildBrCodePixPayload({
          txId: asaasPaymentId,
          merchantName: 'DK FACILITA SOFTWARE',
          amountBRL: valorBRL,
          description: input.descricao,
        })
      : null;

  const pixQrCodeSvg = pixQrCodePayload
    ? await QRCode.toString(pixQrCodePayload, {
        type: 'svg',
        margin: 1,
        width: 220,
      })
    : null;

  return {
    modoIntegracao: 'ASAAS_SANDBOX_PRONTO',
    asaasCustomerId,
    asaasPaymentId,
    status: 'PENDENTE',
    valorCentavos: input.valorCentavos,
    vencimentoIso,
    invoiceUrl: `https://dkfacilita.com/faturas/${asaasPaymentId}`,
    pixQrCodePayload,
    pixQrCodeSvg,
  };
}

export function verifyAsaasWebhookSignature(receivedToken: string | undefined): boolean {
  if (!ASAAS_WEBHOOK_TOKEN || ASAAS_WEBHOOK_TOKEN.includes('TOKEN_SECRETO')) {
    return true;
  }
  if (!receivedToken) return false;
  const a = Buffer.from(receivedToken);
  const b = Buffer.from(ASAAS_WEBHOOK_TOKEN);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export interface AsaasWebhookEventPayload {
  event:
    | 'PAYMENT_CONFIRMED'
    | 'PAYMENT_RECEIVED'
    | 'PAYMENT_OVERDUE'
    | 'PAYMENT_REFUNDED'
    | 'SUBSCRIPTION_DELETED'
    | string;
  payment?: {
    id: string;
    customer?: string;
    value?: number;
    status?: string;
    externalReference?: string;
    paymentDate?: string;
  };
}

export function parseAsaasWebhookAction(payload: AsaasWebhookEventPayload) {
  const ref = payload.payment?.externalReference || '';
  const [empresaId, faturaId, tipoItem, itemSlug] = ref.split(':');

  switch (payload.event) {
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED':
      return {
        acao: 'ATIVAR_E_LIBERAR' as const,
        novoStatusFatura: 'PAGA' as const,
        novoStatusEmpresa: 'ATIVA' as const,
        tipoNotificacao:
          tipoItem === 'ADICIONAL'
            ? ('ADICIONAL_CONTRATADO' as const)
            : tipoItem === 'UPGRADE'
              ? ('UPGRADE' as const)
              : ('NOVA_VENDA' as const),
        empresaId: empresaId || null,
        faturaId: faturaId || null,
        tipoItem: tipoItem || 'PLANO',
        itemSlug: itemSlug || null,
        asaasPaymentId: payload.payment?.id || null,
      };
    case 'PAYMENT_OVERDUE':
      return {
        acao: 'BLOQUEAR_INADIMPLENCIA' as const,
        novoStatusFatura: 'VENCIDA' as const,
        novoStatusEmpresa: 'INADIMPLENTE' as const,
        tipoNotificacao: 'PAGAMENTO_ATRASADO' as const,
        empresaId: empresaId || null,
        faturaId: faturaId || null,
        tipoItem: tipoItem || 'PLANO',
        itemSlug: itemSlug || null,
        asaasPaymentId: payload.payment?.id || null,
      };
    default:
      return {
        acao: 'IGNORAR' as const,
        novoStatusFatura: null,
        novoStatusEmpresa: null,
        tipoNotificacao: null,
        empresaId: empresaId || null,
        faturaId: faturaId || null,
        tipoItem: tipoItem || null,
        itemSlug: itemSlug || null,
        asaasPaymentId: payload.payment?.id || null,
      };
  }
}
