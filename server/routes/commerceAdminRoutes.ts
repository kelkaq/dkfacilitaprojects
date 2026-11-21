import { Router, type Request, type Response } from 'express';
import type { AmbientePagamento, CicloCobranca } from '@prisma/client';
import { getPrisma } from '../lib/prisma.ts';
import { requireDatabaseAuth, requireSuperAdmin } from '../middleware/databaseAuth.ts';
import { MercadoPagoSubscriptions } from '../services/mercadoPagoSubscriptions.ts';

export const commerceAdminRouter = Router();

const CYCLES: Record<CicloCobranca, number> = { MENSAL: 1, SEMESTRAL: 6, ANUAL: 12 };

function environment(): AmbientePagamento | null {
  const value = process.env.CSDK_PAYMENT_ENVIRONMENT;
  return value === 'TEST' || value === 'PRODUCTION' ? value : null;
}

function mpClient(env: AmbientePagamento): MercadoPagoSubscriptions | null {
  const token = env === 'TEST' ? process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN : process.env.MERCADO_PAGO_ACCESS_TOKEN;
  return token ? new MercadoPagoSubscriptions(token) : null;
}

function amountForPlan(plan: { precoMensalCentavos: number; descontoSemestral: number; descontoAnual: number }, cycle: CicloCobranca): number {
  const months = CYCLES[cycle];
  const discount = cycle === 'SEMESTRAL' ? plan.descontoSemestral : cycle === 'ANUAL' ? plan.descontoAnual : 0;
  if (!Number.isInteger(plan.precoMensalCentavos) || plan.precoMensalCentavos < 100 ||
      !Number.isInteger(discount) || discount < 0 || discount > 80) return 0;
  return Math.round(plan.precoMensalCentavos * months * (100 - discount) / 100);
}

function configuredOrigin(): string | null {
  try {
    const url = new URL(process.env.APP_URL ?? '');
    return url.protocol === 'https:' ? url.origin : null;
  } catch { return null; }
}

commerceAdminRouter.get('/api/admin/commerce', requireDatabaseAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const [plans, offers] = await Promise.all([
      db.plano.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] }),
      db.planoOferta.findMany({ include: { plano: true }, orderBy: [{ plano: { ordem: 'asc' } }, { ciclo: 'asc' }, { ambiente: 'asc' }, { trialDias: 'asc' }] }),
    ]);
    res.json({ environment: environment(), plans, offers: offers.map((offer) => ({
      id: offer.id, planoId: offer.planoId, planoSlug: offer.plano.slug, planoNome: offer.plano.nome,
      ciclo: offer.ciclo, ambiente: offer.ambiente, trialDias: offer.trialDias,
      totalCentavos: offer.totalCentavos, mercadoPagoPlanId: offer.mercadoPagoPlanId,
      ativa: offer.ativa, precoAtualCentavos: amountForPlan(offer.plano, offer.ciclo),
    })) });
  } catch {
    res.status(503).json({ error: 'Não foi possível consultar o catálogo de cobrança.' });
  }
});

commerceAdminRouter.post('/api/admin/commerce/plans', requireDatabaseAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
  const subtitulo = typeof body.subtitulo === 'string' ? body.subtitulo.trim() : '';
  const descricao = typeof body.descricao === 'string' ? body.descricao.trim() : '';
  const price = Number(body.precoMensalCentavos);
  const descontoSemestral = Number(body.descontoSemestral);
  const descontoAnual = Number(body.descontoAnual);
  const limiteColaboradores = Number(body.limiteColaboradores);
  const limiteUsuarios = Number(body.limiteUsuarios);
  const limiteObras = Number(body.limiteObras);
  if (!/^[a-z0-9-]{2,64}$/.test(slug) || nome.length < 2 || nome.length > 120 ||
      subtitulo.length > 200 || descricao.length > 1000 || !Number.isInteger(price) || price < 100 ||
      !Number.isInteger(descontoSemestral) || descontoSemestral < 0 || descontoSemestral > 80 ||
      !Number.isInteger(descontoAnual) || descontoAnual < 0 || descontoAnual > 80 ||
      !Number.isInteger(limiteColaboradores) || limiteColaboradores < 1 || limiteColaboradores > 1_000_000 ||
      !Number.isInteger(limiteUsuarios) || limiteUsuarios < 1 || limiteUsuarios > 100 ||
      !Number.isInteger(limiteObras) || limiteObras < 1 || limiteObras > 100_000) {
    res.status(400).json({ error: 'Revise nome, identificador, preço, descontos e limites do plano.' });
    return;
  }
  try {
    const plan = await getPrisma().plano.upsert({
      where: { slug },
      create: {
        slug, nome, subtitulo, descricao, precoMensalCentavos: price, descontoSemestral, descontoAnual,
        limiteColaboradores, limiteUsuarios, limiteObras,
        incluiCartaAnuencia: body.incluiCartaAnuencia === true,
        incluiDossieLink: body.incluiDossieLink !== false,
        incluiAlertasWpp: body.incluiAlertasWpp === true,
        incluiDominioProprio: body.incluiDominioProprio === true,
        destaque: body.destaque === true, ativo: body.ativo !== false,
        ordem: Number.isInteger(body.ordem) ? Number(body.ordem) : 0,
      },
      update: {
        nome, subtitulo, descricao, precoMensalCentavos: price, descontoSemestral, descontoAnual,
        limiteColaboradores, limiteUsuarios, limiteObras,
        incluiCartaAnuencia: body.incluiCartaAnuencia === true,
        incluiDossieLink: body.incluiDossieLink !== false,
        incluiAlertasWpp: body.incluiAlertasWpp === true,
        incluiDominioProprio: body.incluiDominioProprio === true,
        destaque: body.destaque === true, ativo: body.ativo !== false,
        ordem: Number.isInteger(body.ordem) ? Number(body.ordem) : 0,
      },
    });
    res.json({ id: plan.id, slug: plan.slug, nome: plan.nome });
  } catch {
    res.status(503).json({ error: 'Não foi possível salvar o plano no catálogo de cobrança.' });
  }
});

commerceAdminRouter.delete('/api/admin/commerce/plans/:slug', requireDatabaseAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const slug = String(req.params.slug ?? '').trim().toLowerCase();
  if (!/^[a-z0-9-]{2,64}$/.test(slug)) { res.status(400).json({ error: 'Identificador de plano inválido.' }); return; }
  try {
    const plan = await getPrisma().plano.update({ where: { slug }, data: { ativo: false } });
    res.json({ slug: plan.slug, ativo: false });
  } catch {
    res.status(404).json({ error: 'Plano não encontrado no catálogo de cobrança.' });
  }
});

commerceAdminRouter.post('/api/admin/commerce/offers', requireDatabaseAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const env = environment();
  const { planoId, ciclo, trialDias } = req.body ?? {};
  if (!env || !mpClient(env) || !configuredOrigin()) {
    res.status(503).json({ error: 'Configuração do Mercado Pago indisponível para este ambiente.' }); return;
  }
  if (req.body?.ambiente !== env || typeof planoId !== 'string' ||
      !['MENSAL', 'SEMESTRAL', 'ANUAL'].includes(ciclo) || (trialDias !== 0 && trialDias !== 7)) {
    res.status(400).json({ error: 'Ambiente, plano, ciclo ou período de teste inválido.' }); return;
  }
  try {
    const db = getPrisma();
    const plan = await db.plano.findUnique({ where: { id: planoId } });
    if (!plan?.ativo) { res.status(404).json({ error: 'O plano está inativo ou não existe.' }); return; }
    const cycle = ciclo as CicloCobranca;
    const amount = amountForPlan(plan, cycle);
    if (amount < 100) { res.status(422).json({ error: 'O valor calculado para o plano é inválido.' }); return; }
    const client = mpClient(env)!;
    const providerPlan = await client.createPlan({
      reason: `Certifica Software - DK · ${plan.nome} · ${cycle}`,
      cycleMonths: CYCLES[cycle] as 1 | 6 | 12,
      amountCentavos: amount,
      trialDays: trialDias,
      backUrl: `${configuredOrigin()}/pagamento-retorno`,
    });
    const recurring = providerPlan.auto_recurring;
    if (!providerPlan.id || providerPlan.status !== 'active' || !providerPlan.init_point ||
        recurring?.currency_id !== 'BRL' || recurring.frequency !== CYCLES[cycle] ||
        recurring.frequency_type !== 'months' || Math.round((recurring.transaction_amount ?? 0) * 100) !== amount ||
        (trialDias === 7 && (recurring.free_trial?.frequency !== 7 || recurring.free_trial.frequency_type !== 'days')) ||
        (trialDias === 0 && recurring.free_trial?.frequency)) {
      res.status(502).json({ error: 'O Mercado Pago retornou um plano diferente do preço solicitado.' }); return;
    }
    const offer = await db.planoOferta.create({ data: {
      planoId: plan.id, ciclo: cycle, ambiente: env, trialDias,
      totalCentavos: amount, mercadoPagoPlanId: providerPlan.id, ativa: false,
    } });
    res.status(201).json({ id: offer.id, totalCentavos: offer.totalCentavos, ativa: false });
  } catch (error) {
    console.error('Falha ao preparar oferta do catálogo:', error instanceof Error ? error.message : 'erro desconhecido');
    res.status(503).json({ error: 'Não foi possível criar o plano hospedado no Mercado Pago.' });
  }
});

commerceAdminRouter.patch('/api/admin/commerce/offers/:id', requireDatabaseAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const id = String(req.params.id ?? '');
  const active = req.body?.ativa;
  if (!/^[0-9a-f-]{36}$/i.test(id) || typeof active !== 'boolean') {
    res.status(400).json({ error: 'Oferta ou estado inválido.' }); return;
  }
  try {
    const db = getPrisma();
    const offer = await db.planoOferta.findUnique({ where: { id }, include: { plano: true } });
    if (!offer) { res.status(404).json({ error: 'Oferta não encontrada.' }); return; }
    if (active) {
      const env = environment();
      const client = env && env === offer.ambiente ? mpClient(env) : null;
      if (!offer.plano.ativo || !client) { res.status(409).json({ error: 'O plano está inativo ou o ambiente não corresponde a este serviço.' }); return; }
      const expected = amountForPlan(offer.plano, offer.ciclo);
      const providerPlan = await client.getPlan(offer.mercadoPagoPlanId);
      const recurring = providerPlan.auto_recurring;
      const trial = recurring?.free_trial;
      if (providerPlan.status !== 'active' || !recurring || recurring.currency_id !== 'BRL' ||
          recurring.frequency !== CYCLES[offer.ciclo] || recurring.frequency_type !== 'months' ||
          Math.round((recurring.transaction_amount ?? 0) * 100) !== expected || expected !== offer.totalCentavos ||
          (offer.trialDias === 7 && (trial?.frequency !== 7 || trial.frequency_type !== 'days')) ||
          (offer.trialDias === 0 && Boolean(trial?.frequency))) {
        res.status(409).json({ error: 'O preço do plano mudou. Crie novamente a oferta antes de ativá-la.' }); return;
      }
    }
    const updated = await db.$transaction(async (tx) => {
      if (active) await tx.planoOferta.updateMany({ where: { id: { not: id }, planoId: offer.planoId,
        ciclo: offer.ciclo, ambiente: offer.ambiente, trialDias: offer.trialDias, ativa: true }, data: { ativa: false } });
      return tx.planoOferta.update({ where: { id }, data: { ativa: active } });
    });
    res.json({ id: updated.id, ativa: updated.ativa });
  } catch (error) {
    console.error('Falha ao atualizar oferta do catálogo:', error instanceof Error ? error.message : 'erro desconhecido');
    res.status(503).json({ error: 'Não foi possível atualizar a oferta.' });
  }
});
