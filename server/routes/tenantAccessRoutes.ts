import { Router, type Request, type Response } from 'express';
import { getPrisma } from '../lib/prisma.ts';
import { requireDatabaseAuth } from '../middleware/databaseAuth.ts';
import { evaluateTenantAccess } from '../middleware/tenantGuard.ts';
import { effectiveTenantLimits } from '../lib/tenantLimits.ts';

export const tenantAccessRouter = Router();

tenantAccessRouter.get('/api/tenant/access', requireDatabaseAuth, async (_req: Request, res: Response) => {
  const empresaId = res.locals.authUser?.empresaId;
  if (!empresaId) {
    res.status(403).json({ error: 'Selecione uma empresa para consultar o acesso.' });
    return;
  }
  try {
    const db = getPrisma();
    const [empresa, assinatura, usuariosAtuais, colaboradoresAtuais, obrasAtuais] = await Promise.all([
      db.empresa.findUnique({ where: { id: empresaId }, select: { id: true, status: true, trialExpiraEm: true } }),
      db.assinatura.findFirst({ where: { empresaId }, orderBy: { createdAt: 'desc' }, include: { plano: true,
        adicionais: { where: { ativo: true }, include: { adicional: { select: { recursoChave: true, incrementoQtd: true } } } } } }),
      db.usuario.count({ where: { empresaId, ativo: true } }),
      db.colaborador.count({ where: { empresaId, ativo: true } }),
      db.contratoObra.count({ where: { empresaId, ativo: true } }),
    ]);
    if (!empresa || !assinatura) {
      res.json({ permitido: false, codigo: 'SEM_ASSINATURA', motivo: 'Conta sem assinatura válida.' });
      return;
    }
    const status = ['INADIMPLENTE', 'SUSPENSA', 'CANCELADA'].includes(empresa.status) ? empresa.status :
      assinatura.status === 'ATRASADA' ? 'INADIMPLENTE' :
      assinatura.status === 'SUSPENSA' ? 'SUSPENSA' :
      assinatura.status === 'CANCELADA' ? 'CANCELADA' :
      assinatura.status === 'TRIAL' ? 'TRIAL' : 'ATIVA';
    const limits = {
      ...effectiveTenantLimits({ ...assinatura.plano, adicionais: assinatura.adicionais }),
      usuariosAtuais, colaboradoresAtuais, obrasAtuais,
    };
    const decision = status === 'TRIAL' && !empresa.trialExpiraEm
      ? { permitido: false, codigo: 'TRIAL_EXPIRADO', motivo: 'Período de teste indisponível.' }
      : evaluateTenantAccess({ status, trialExpiraEmIso: empresa.trialExpiraEm?.toISOString(), ...limits });
    res.json({ ...decision,
      status, limites: limits, plano: { slug: assinatura.plano.slug, nome: assinatura.plano.nome },
      proximaCobrancaEm: assinatura.proximaCobrancaEm });
  } catch {
    res.status(503).json({ error: 'Não foi possível verificar o acesso.' });
  }
});
