import type { AdicionalCatalogo, PlanoCatalogo } from '../data/globalCatalogSeed.ts';
import type { EffectivePlanLimits, EmpresaDoc } from '../types/domain.ts';

export interface AccessEvaluation {
  permitido: boolean;
  motivo?: string;
  codigo?: 'TRIAL_EXPIRADO' | 'INADIMPLENTE' | 'SUSPENSA' | 'CANCELADA';
  diasRestantesTrial?: number;
}

export function computeEffectivePlanLimits(
  empresa: EmpresaDoc,
  planos: PlanoCatalogo[],
  adicionais: AdicionalCatalogo[]
): EffectivePlanLimits {
  const plano =
    planos.find((p) => p.id === empresa.planoId || p.slug === empresa.planoSlug) ??
    planos[0];

  const ativos = new Set(empresa.adicionaisAtivos ?? []);
  const flags = empresa.featureFlags ?? {};

  let extraColaboradores = 0;
  let extraUsuarios = 0;

  for (const slug of empresa.adicionaisAtivos ?? []) {
    const addon = adicionais.find((a) => a.slug === slug || a.recursoChave === slug);
    if (!addon) continue;
    if (addon.recursoChave === 'colaboradores_extra') {
      extraColaboradores += addon.incrementoQtd;
    }
    if (addon.recursoChave === 'usuarios_extra') {
      extraUsuarios += addon.incrementoQtd;
    }
  }

  return {
    planoNome: plano?.nome ?? 'Trial',
    planoSlug: plano?.slug ?? 'essencial',
    limiteColaboradores: (plano?.limiteColaboradores ?? 150) + extraColaboradores,
    limiteUsuarios: (plano?.limiteUsuarios ?? 2) + extraUsuarios,
    limiteObras: plano?.limiteObras ?? 5,
    incluiCartaAnuencia: Boolean(
      plano?.incluiCartaAnuencia ||
        ativos.has('cartas-anuencia-dossie') ||
        ativos.has('carta_anuencia_dossie') ||
        flags.carta_anuencia_dossie
    ),
    incluiDossieLink: Boolean(plano?.incluiDossieLink ?? true),
    incluiAlertasWpp: Boolean(
      plano?.incluiAlertasWpp ||
        ativos.has('alertas-whatsapp') ||
        ativos.has('alertas_whatsapp') ||
        flags.alertas_whatsapp
    ),
    incluiDominioProprio: Boolean(
      plano?.incluiDominioProprio ||
        ativos.has('dominio-proprio') ||
        ativos.has('dominio_proprio') ||
        flags.dominio_proprio
    ),
    incluiModeloProprio: Boolean(
      ativos.has('modelo-proprio-certificado') ||
        ativos.has('modelo_proprio') ||
        flags.modelo_proprio ||
        empresa.modeloProprioUrl
    ),
  };
}

export function evaluateEmpresaAccess(empresa: EmpresaDoc): AccessEvaluation {
  if (empresa.status === 'INADIMPLENTE') {
    return {
      permitido: false,
      codigo: 'INADIMPLENTE',
      motivo:
        'Acesso suspenso por inadimplência. Regularize a fatura pendente para desbloqueio imediato. A validação pública de QR Codes continua funcionando normalmente.',
    };
  }

  if (empresa.status === 'SUSPENSA') {
    return {
      permitido: false,
      codigo: 'SUSPENSA',
      motivo:
        'Conta temporariamente suspensa pela administração da DK Facilita. A validação pública de QR Codes permanece ativa.',
    };
  }

  if (empresa.status === 'CANCELADA') {
    return {
      permitido: false,
      codigo: 'CANCELADA',
      motivo: 'Assinatura cancelada. Reative um plano para retomar o acesso operacional.',
    };
  }

  if (empresa.status === 'TRIAL' && empresa.trialExpiraEmIso) {
    const expMs = new Date(empresa.trialExpiraEmIso).getTime();
    const diffDays = Math.ceil((expMs - Date.now()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) {
      return {
        permitido: false,
        codigo: 'TRIAL_EXPIRADO',
        diasRestantesTrial: 0,
        motivo:
          'Seu teste grátis de 7 dias expirou. Escolha um plano para desbloquear o painel e manter sua operação.',
      };
    }
    return { permitido: true, diasRestantesTrial: diffDays };
  }

  return { permitido: true };
}

export function assertTenantOperationalAccess(empresa: EmpresaDoc): void {
  const decision = evaluateEmpresaAccess(empresa);
  if (!decision.permitido) {
    throw new Error(decision.motivo || 'Acesso bloqueado pelo controle de plano.');
  }
}

export function assertWithinLimit(params: {
  recursoLabel: string;
  atual: number;
  limite: number;
}): void {
  if (params.atual >= params.limite) {
    throw new Error(
      `Limite do plano atingido para ${params.recursoLabel} (${params.atual}/${params.limite}). Contrate um adicional ou faça upgrade em Meu Plano.`
    );
  }
}
