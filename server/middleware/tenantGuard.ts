import type { NextFunction, Request, Response } from 'express';
import { verifyJwtToken, type AuthTokenPayload } from '../lib/security.ts';

export interface TenantAuthenticatedRequest extends Request {
  auth?: AuthTokenPayload;
}

export interface TenantPlanState {
  status: 'TRIAL' | 'ATIVA' | 'INADIMPLENTE' | 'SUSPENSA' | 'CANCELADA';
  trialExpiraEmIso?: string | null;
  limiteColaboradores: number;
  limiteUsuarios: number;
  limiteObras: number;
  colaboradoresAtuais: number;
  usuariosAtuais: number;
  obrasAtuais: number;
}

export function requireApiAuth(
  req: TenantAuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticação ausente.' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  const payload = verifyJwtToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    return;
  }

  req.auth = payload;
  next();
}

export function enforceTenantScope(
  req: TenantAuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.auth) {
    res.status(401).json({ error: 'Não autenticado.' });
    return;
  }

  if (req.auth.perfil === 'SUPER_ADMIN') {
    next();
    return;
  }

  const requestedEmpresaId =
    req.params.empresaId ||
    (typeof req.body?.empresaId === 'string' ? req.body.empresaId : null) ||
    (typeof req.query.empresaId === 'string' ? req.query.empresaId : null);

  if (!req.auth.empresaId || (requestedEmpresaId && requestedEmpresaId !== req.auth.empresaId)) {
    res.status(403).json({
      error: 'Acesso negado: isolamento estrito multiempresa violado.',
      code: 'TENANT_ISOLATION_VIOLATION',
    });
    return;
  }

  next();
}

export function evaluateTenantAccess(state: TenantPlanState): {
  permitido: boolean;
  motivo?: string;
  codigo?: 'TRIAL_EXPIRADO' | 'INADIMPLENTE' | 'SUSPENSA' | 'CANCELADA';
  diasRestantesTrial?: number;
} {
  if (state.status === 'INADIMPLENTE') {
    return {
      permitido: false,
      codigo: 'INADIMPLENTE',
      motivo:
        'Acesso administrativo bloqueado por fatura em atraso. A validação pública de QR Codes permanece ativa.',
    };
  }
  if (state.status === 'SUSPENSA') {
    return {
      permitido: false,
      codigo: 'SUSPENSA',
      motivo: 'Conta suspensa pelo administrador da plataforma.',
    };
  }
  if (state.status === 'CANCELADA') {
    return {
      permitido: false,
      codigo: 'CANCELADA',
      motivo: 'Assinatura cancelada. Reative seu plano para retomar a operação.',
    };
  }
  if (state.status === 'TRIAL' && state.trialExpiraEmIso) {
    const expMs = new Date(state.trialExpiraEmIso).getTime();
    const diffDays = Math.ceil((expMs - Date.now()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) {
      return {
        permitido: false,
        codigo: 'TRIAL_EXPIRADO',
        diasRestantesTrial: 0,
        motivo:
          'Seu período de teste grátis de 7 dias expirou. Ative um plano para desbloquear o painel.',
      };
    }
    return { permitido: true, diasRestantesTrial: diffDays };
  }
  return { permitido: true };
}
