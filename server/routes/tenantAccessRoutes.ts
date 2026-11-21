import { Router, type Request, type Response } from 'express';
import { getPrisma } from '../lib/prisma.ts';
import { requireDatabaseAuth } from '../middleware/databaseAuth.ts';
import { evaluateTenantAccess } from '../middleware/tenantGuard.ts';
import { effectiveTenantLimits } from '../lib/tenantLimits.ts';
import { MercadoPagoSubscriptions } from '../services/mercadoPagoSubscriptions.ts';
import { syncSubscriptionStatus } from '../services/mercadoPagoReconciliation.ts';

export const tenantAccessRouter = Router();

tenantAccessRouter.post('/api/tenant/access/cancel-trial', requireDatabaseAuth, async (_req: Request, res: Response) => {
  const user = res.locals.authUser;
  if (user?.perfil !== 'ADMIN_EMPRESA' || !user.empresaId) {
    res.status(403).json({ error: 'Somente o administrador da empresa pode cancelar o período de teste.' });
    return;
  }
  const environment = process.env.CSDK_PAYMENT_ENVIRONMENT;
  const token = environment === 'TEST' ? process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN :
    environment === 'PRODUCTION' ? process.env.MERCADO_PAGO_ACCESS_TOKEN : undefined;
  if (!token) { res.status(503).json({ error: 'Cancelamento temporariamente indisponível.' }); return; }
  try {
    const db = getPrisma();
    const subscription = await db.assinatura.findFirst({
      where: { empresaId: user.empresaId, status: 'TRIAL' }, orderBy: { createdAt: 'desc' },
    });
    if (!subscription?.mercadoPagoId) {
      res.status(409).json({ error: 'Não há um período de teste ativo para cancelar.' });
      return;
    }
    const cancelled = await new MercadoPagoSubscriptions(token).cancelSubscription(subscription.mercadoPagoId);
    if (cancelled.status !== 'cancelled' && cancelled.status !== 'canceled') {
      res.status(502).json({ error: 'O Mercado Pago não confirmou o cancelamento.' });
      return;
    }
    await syncSubscriptionStatus({ db, subscription: cancelled });
    res.json({ status: 'CANCELADA', mensagem: 'Período de teste cancelado. Não haverá cobrança após o teste.' });
  } catch (error) {
    console.error('Falha ao cancelar período de teste:', error instanceof Error ? error.message : 'erro desconhecido');
    res.status(503).json({ error: 'Não foi possível cancelar agora. Tente novamente ou contate o suporte.' });
  }
});

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
