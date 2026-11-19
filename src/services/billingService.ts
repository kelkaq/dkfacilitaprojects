import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import {
  calcularPrecoCicloCentavos,
  type AdicionalCatalogo,
  type PlanoCatalogo,
} from '../data/globalCatalogSeed.ts';
import type { CicloCobranca, EmpresaDoc, FaturaDoc } from '../types/domain.ts';
import { createAdminNotification } from './analyticsService.ts';

export async function listFaturasEmpresa(empresaId: string): Promise<FaturaDoc[]> {
  const path = `empresas/${empresaId}/faturas`;
  try {
    const snap = await getDocs(
      query(collection(db, 'empresas', empresaId, 'faturas'), where('empresaId', '==', empresaId))
    );
    return snap.docs
      .map((d) => ({ ...(d.data() as FaturaDoc), id: d.id }))
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createPlanCharge(params: {
  empresa: EmpresaDoc;
  plano: PlanoCatalogo;
  ciclo: CicloCobranca;
  metodoPagamento: 'PIX' | 'CARTAO_CREDITO';
  isUpgrade?: boolean;
}): Promise<FaturaDoc> {
  const faturaId = `fat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const preco = calcularPrecoCicloCentavos(
    params.plano.precoMensalCentavos,
    params.ciclo,
    params.plano.descontoSemestral,
    params.plano.descontoAnual
  );

  const tipoItem = params.isUpgrade ? 'UPGRADE' : 'PLANO';
  const descricao = `${params.isUpgrade ? 'Upgrade' : 'Assinatura'} Certifica Software - DK · Plano ${params.plano.nome} (${params.ciclo})`;

  const response = await fetch('/api/billing/asaas/charge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      empresaId: params.empresa.id,
      razaoSocial: params.empresa.razaoSocial,
      cnpj: params.empresa.cnpj,
      email: params.empresa.emailFinanceiro,
      whatsapp: params.empresa.whatsapp,
      descricao,
      valorCentavos: preco.totalPeriodoCentavos,
      metodoPagamento: params.metodoPagamento,
      ciclo: params.ciclo,
      tipoItem,
      itemSlug: params.plano.slug,
      faturaId,
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error || 'Falha ao gerar cobrança no gateway Asaas.');
  }

  const charge = await response.json();
  const path = `empresas/${params.empresa.id}/faturas/${faturaId}`;
  const now = serverTimestamp();

  const faturaPayload = {
    empresaId: params.empresa.id,
    descricao,
    valorCentavos: preco.totalPeriodoCentavos,
    status: 'PENDENTE' as const,
    metodoPagamento: params.metodoPagamento,
    tipoItem: tipoItem as 'PLANO' | 'UPGRADE',
    itemSlug: params.plano.slug,
    ciclo: params.ciclo,
    asaasPaymentId: charge.asaasPaymentId,
    pixQrCodePayload: charge.pixQrCodePayload ?? null,
    pixQrCodeSvg: charge.pixQrCodeSvg ?? null,
    invoiceUrl: charge.invoiceUrl ?? null,
    modoIntegracao: charge.modoIntegracao ?? 'ASAAS_API_V3',
    vencimentoIso: charge.vencimentoIso,
    pagoEmIso: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'empresas', params.empresa.id, 'faturas', faturaId), faturaPayload);
    if (charge.asaasCustomerId && !params.empresa.asaasCustomerId) {
      await updateDoc(doc(db, 'empresas', params.empresa.id), {
        asaasCustomerId: charge.asaasCustomerId,
        updatedAt: serverTimestamp(),
      });
    }
    return { ...faturaPayload, id: faturaId, createdAt: null };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function createAddonCharge(params: {
  empresa: EmpresaDoc;
  adicional: AdicionalCatalogo;
  metodoPagamento: 'PIX' | 'CARTAO_CREDITO';
}): Promise<FaturaDoc> {
  const faturaId = `fat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const descricao = `Adicional DK Facilita · ${params.adicional.nome}`;

  const response = await fetch('/api/billing/asaas/charge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      empresaId: params.empresa.id,
      razaoSocial: params.empresa.razaoSocial,
      cnpj: params.empresa.cnpj,
      email: params.empresa.emailFinanceiro,
      whatsapp: params.empresa.whatsapp,
      descricao,
      valorCentavos: params.adicional.precoMensalCentavos,
      metodoPagamento: params.metodoPagamento,
      tipoItem: 'ADICIONAL',
      itemSlug: params.adicional.slug,
      faturaId,
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error || 'Falha ao gerar cobrança de adicional no Asaas.');
  }

  const charge = await response.json();
  const path = `empresas/${params.empresa.id}/faturas/${faturaId}`;
  const now = serverTimestamp();

  const faturaPayload = {
    empresaId: params.empresa.id,
    descricao,
    valorCentavos: params.adicional.precoMensalCentavos,
    status: 'PENDENTE' as const,
    metodoPagamento: params.metodoPagamento,
    tipoItem: 'ADICIONAL' as const,
    itemSlug: params.adicional.slug,
    ciclo: null,
    asaasPaymentId: charge.asaasPaymentId,
    pixQrCodePayload: charge.pixQrCodePayload ?? null,
    pixQrCodeSvg: charge.pixQrCodeSvg ?? null,
    invoiceUrl: charge.invoiceUrl ?? null,
    modoIntegracao: charge.modoIntegracao ?? 'ASAAS_API_V3',
    vencimentoIso: charge.vencimentoIso,
    pagoEmIso: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'empresas', params.empresa.id, 'faturas', faturaId), faturaPayload);
    return { ...faturaPayload, id: faturaId, createdAt: null };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function dispatchAndApplyAsaasWebhook(params: {
  empresa: EmpresaDoc;
  fatura: FaturaDoc;
  event: 'PAYMENT_CONFIRMED' | 'PAYMENT_OVERDUE';
  planosCatalogo: PlanoCatalogo[];
}): Promise<{ acao: string; statusEmpresa: string }> {
  const externalReference = `${params.empresa.id}:${params.fatura.id}:${params.fatura.tipoItem}:${params.fatura.itemSlug || ''}`;

  const response = await fetch('/api/billing/asaas/verify-and-process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: params.event,
      payment: {
        id: params.fatura.asaasPaymentId || `pay_${params.fatura.id}`,
        customer: params.empresa.asaasCustomerId || undefined,
        value: params.fatura.valorCentavos / 100,
        externalReference,
        paymentDate: new Date().toISOString().slice(0, 10),
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Webhook Asaas rejeitado pelo servidor.');
  }

  const webhookResult = await response.json();
  const directive = webhookResult.directive;

  if (directive.acao === 'ATIVAR_E_LIBERAR') {
    const nowIso = new Date().toISOString();
    await updateDoc(doc(db, 'empresas', params.empresa.id, 'faturas', params.fatura.id), {
      status: 'PAGA',
      pagoEmIso: nowIso,
      updatedAt: serverTimestamp(),
    });

    const empresaPatch: Record<string, unknown> = {
      status: 'ATIVA',
      updatedAt: serverTimestamp(),
    };

    if (params.fatura.tipoItem === 'ADICIONAL' && params.fatura.itemSlug) {
      const currentAddons = new Set(params.empresa.adicionaisAtivos ?? []);
      currentAddons.add(params.fatura.itemSlug);
      empresaPatch.adicionaisAtivos = Array.from(currentAddons);
    } else if (params.fatura.itemSlug) {
      const targetPlano = params.planosCatalogo.find((p) => p.slug === params.fatura.itemSlug);
      if (targetPlano) {
        const ciclo = params.fatura.ciclo || 'MENSAL';
        const preco = calcularPrecoCicloCentavos(
          targetPlano.precoMensalCentavos,
          ciclo,
          targetPlano.descontoSemestral,
          targetPlano.descontoAnual
        );
        empresaPatch.planoId = targetPlano.id;
        empresaPatch.planoSlug = targetPlano.slug;
        empresaPatch.ciclo = ciclo;
        empresaPatch.valorMensalCentavos = preco.mensalEquivalenteCentavos;
      }
    }

    await updateDoc(doc(db, 'empresas', params.empresa.id), empresaPatch);

    await createAdminNotification({
      tipo: directive.tipoNotificacao || 'NOVA_VENDA',
      titulo: `Pagamento confirmado: ${params.empresa.razaoSocial}`,
      mensagem: `${params.fatura.descricao} liberado automaticamente via Webhook Asaas.`,
      empresaId: params.empresa.id,
      empresaNome: params.empresa.razaoSocial,
    });

    return { acao: directive.acao, statusEmpresa: 'ATIVA' };
  }

  if (directive.acao === 'BLOQUEAR_INADIMPLENCIA') {
    await updateDoc(doc(db, 'empresas', params.empresa.id, 'faturas', params.fatura.id), {
      status: 'VENCIDA',
      updatedAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'empresas', params.empresa.id), {
      status: 'INADIMPLENTE',
      updatedAt: serverTimestamp(),
    });

    await createAdminNotification({
      tipo: 'PAGAMENTO_ATRASADO',
      titulo: `Inadimplência detectada: ${params.empresa.razaoSocial}`,
      mensagem: `Fatura "${params.fatura.descricao}" vencida. Painel bloqueado automaticamente (QR Codes permanecem válidos).`,
      empresaId: params.empresa.id,
      empresaNome: params.empresa.razaoSocial,
    });

    return { acao: directive.acao, statusEmpresa: 'INADIMPLENTE' };
  }

  return { acao: 'IGNORAR', statusEmpresa: params.empresa.status };
}
