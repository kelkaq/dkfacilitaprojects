import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { AmbientePagamento, CicloCobranca, ModoInicio, TipoDocumento } from '@prisma/client';
import { getPrisma } from '../lib/prisma.ts';
import { validateHolderDocument } from '../lib/brazilDocument.ts';
import { MercadoPagoSubscriptions } from '../services/mercadoPagoSubscriptions.ts';
import { deliverFirstAccessEmail, provisionAuthorizedSubscription } from '../services/mercadoPagoReconciliation.ts';

export const orderRouter = Router();

const CYCLES: Record<CicloCobranca, number> = { MENSAL: 1, SEMESTRAL: 6, ANUAL: 12 };

function paymentEnvironment(): AmbientePagamento | null {
  const value = process.env.CSDK_PAYMENT_ENVIRONMENT;
  return value === 'TEST' || value === 'PRODUCTION' ? value : null;
}

function publicCommerceEnabled(): boolean {
  return process.env.CSDK_PUBLIC_COMMERCE_ENABLED === 'true';
}

function expectedPrice(precoMensalCentavos: number, descontoSemestral: number, descontoAnual: number, ciclo: CicloCobranca): number {
  const discount = ciclo === 'SEMESTRAL' ? descontoSemestral : ciclo === 'ANUAL' ? descontoAnual : 0;
  if (!Number.isInteger(precoMensalCentavos) || precoMensalCentavos <= 0 ||
      !Number.isInteger(discount) || discount < 0 || discount > 100) return 0;
  return Math.round(precoMensalCentavos * CYCLES[ciclo] * (100 - discount) / 100);
}

function mercadoPagoClient(ambiente: AmbientePagamento): MercadoPagoSubscriptions | null {
  const token = ambiente === 'TEST' ? process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN : process.env.MERCADO_PAGO_ACCESS_TOKEN;
  return token ? new MercadoPagoSubscriptions(token) : null;
}

function appOrigin(): string | null {
  try {
    const url = new URL(process.env.APP_URL ?? '');
    return url.protocol === 'https:' ? url.origin : null;
  } catch { return null; }
}

function isMercadoPagoCheckoutUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /(^|\.)mercadopago\.com(\.br|\.ar)?$/.test(url.hostname);
  } catch { return false; }
}

orderRouter.get('/api/public/offers', async (_req: Request, res: Response) => {
  if (!publicCommerceEnabled()) {
    res.status(503).json({ error: 'As compras estão temporariamente indisponíveis.' });
    return;
  }
  const ambiente = paymentEnvironment();
  if (!ambiente) {
    res.status(503).json({ error: 'Catálogo de pagamentos indisponível.' });
    return;
  }
  try {
    const offers = await getPrisma().planoOferta.findMany({
      where: { ambiente, ativa: true, plano: { ativo: true } },
      include: { plano: true },
      orderBy: [{ plano: { ordem: 'asc' } }, { ciclo: 'asc' }],
    });
    res.json({ offers: offers.filter((offer) =>
      (offer.trialDias === 0 || offer.trialDias === 7) &&
      offer.totalCentavos === expectedPrice(offer.plano.precoMensalCentavos, offer.plano.descontoSemestral, offer.plano.descontoAnual, offer.ciclo)
    ).map((offer) => ({
      planoSlug: offer.plano.slug,
      planoNome: offer.plano.nome,
      planoSubtitulo: offer.plano.subtitulo,
      planoDescricao: offer.plano.descricao,
      precoMensalCentavos: offer.plano.precoMensalCentavos,
      descontoSemestral: offer.plano.descontoSemestral,
      descontoAnual: offer.plano.descontoAnual,
      ciclo: offer.ciclo,
      modoInicio: offer.trialDias === 7 ? 'TRIAL' : 'IMEDIATO',
      trialDias: offer.trialDias,
      totalCentavos: offer.totalCentavos,
      limiteUsuarios: offer.plano.limiteUsuarios,
      limiteColaboradores: offer.plano.limiteColaboradores,
      limiteObras: offer.plano.limiteObras,
      incluiCartaAnuencia: offer.plano.incluiCartaAnuencia,
      incluiDossieLink: offer.plano.incluiDossieLink,
      incluiAlertasWpp: offer.plano.incluiAlertasWpp,
      incluiDominioProprio: offer.plano.incluiDominioProprio,
      destaque: offer.plano.destaque,
      ordem: offer.plano.ordem,
    })) });
  } catch {
    res.status(503).json({ error: 'Catálogo temporariamente indisponível.' });
  }
});

orderRouter.post('/api/public/orders', async (req: Request, res: Response) => {
  if (!publicCommerceEnabled()) {
    res.status(503).json({ error: 'As compras estão temporariamente indisponíveis.' });
    return;
  }
  const key = req.header('x-idempotency-key')?.trim() ?? '';
  const { tipoDocumento, documento, emailComprador, planoSlug, ciclo, modoInicio,
    razaoSocial, nomeAdministrador, whatsapp } = req.body ?? {};
  const ambiente = paymentEnvironment();
  if (!ambiente) {
    res.status(503).json({ error: 'Pagamento temporariamente indisponível.' });
    return;
  }
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(key)) {
    res.status(400).json({ error: 'Chave de idempotência inválida.' });
    return;
  }
  if (tipoDocumento !== 'PF' && tipoDocumento !== 'PJ') {
    res.status(400).json({ error: 'Tipo de titular inválido.' });
    return;
  }
  if (typeof documento !== 'string' || typeof emailComprador !== 'string' ||
      typeof razaoSocial !== 'string' || typeof nomeAdministrador !== 'string' || typeof whatsapp !== 'string' ||
      typeof planoSlug !== 'string' || typeof ciclo !== 'string' || !(ciclo in CYCLES) ||
      (modoInicio !== 'TRIAL' && modoInicio !== 'IMEDIATO')) {
    res.status(400).json({ error: 'Dados do pedido incompletos.' });
    return;
  }
  const email = emailComprador.trim().toLowerCase();
  if (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'E-mail inválido.' });
    return;
  }
  const holderName = razaoSocial.trim().slice(0, 180);
  const adminName = nomeAdministrador.trim().slice(0, 120);
  const phone = whatsapp.replace(/\D/g, '').slice(0, 15);
  if (holderName.length < 3 || adminName.length < 2 || phone.length < 10) {
    res.status(400).json({ error: 'Informe nome do titular, responsável e WhatsApp válidos.' });
    return;
  }
  let cleanDocument: string;
  try {
    cleanDocument = validateHolderDocument(tipoDocumento, documento);
  } catch {
    res.status(400).json({ error: 'Documento inválido.' });
    return;
  }
  try {
    const db = getPrisma();
    const plano = await db.plano.findUnique({ where: { slug: planoSlug } });
    if (!plano?.ativo) {
      res.status(404).json({ error: 'Plano indisponível.' });
      return;
    }
    const existing = await db.pedido.findUnique({ where: { idempotencyKey: key }, include: { oferta: true } });
    if (existing) {
      if (existing.documento !== cleanDocument || existing.emailComprador !== email ||
          existing.ciclo !== ciclo || existing.planoId !== plano.id || existing.modoInicio !== modoInicio ||
          existing.oferta?.ambiente !== ambiente || existing.razaoSocial !== holderName ||
          existing.nomeAdministrador !== adminName || existing.whatsapp !== phone) {
        res.status(409).json({ error: 'Chave já usada em outro pedido.' });
        return;
      }
      res.json({ id: existing.id, status: existing.status, totalCentavos: existing.totalCentavos });
      return;
    }
    const totalCentavos = expectedPrice(plano.precoMensalCentavos, plano.descontoSemestral, plano.descontoAnual, ciclo as CicloCobranca);
    if (totalCentavos <= 0) {
      res.status(422).json({ error: 'Preço do plano inválido.' });
      return;
    }
    if (modoInicio === 'TRIAL' && (await db.usoTrial.findUnique({ where: { documento: cleanDocument } }) ||
        await db.empresa.findUnique({ where: { documento: cleanDocument } }))) {
      res.status(409).json({ error: 'O período de teste já foi utilizado por este titular.' });
      return;
    }
    if (await db.usuario.findUnique({ where: { email } })) {
      res.status(409).json({ error: 'Este e-mail já possui acesso. Entre na sua conta para contratar ou altere o e-mail do administrador.' });
      return;
    }
    const offers = await db.planoOferta.findMany({
      where: { planoId: plano.id, ciclo: ciclo as CicloCobranca, ambiente, trialDias: modoInicio === 'TRIAL' ? 7 : 0, ativa: true },
      take: 2,
    });
    if (offers.length !== 1 || offers[0].totalCentavos !== totalCentavos) {
      res.status(409).json({ error: 'Esta modalidade ainda não está disponível para compra.' });
      return;
    }
    const existingOpenOrder = await db.pedido.findFirst({
      where: { ofertaId: offers[0].id, documento: cleanDocument, emailComprador: email,
        status: { in: ['CARRINHO', 'AGUARDANDO_CARTAO', 'AGUARDANDO_PAGAMENTO'] },
        expiraEm: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (existingOpenOrder) {
      res.json({ id: existingOpenOrder.id, status: existingOpenOrder.status,
        totalCentavos: existingOpenOrder.totalCentavos });
      return;
    }
    const order = await db.pedido.create({
      data: {
        planoId: plano.id,
        ofertaId: offers[0].id,
        tipoDocumento: tipoDocumento as TipoDocumento,
        documento: cleanDocument,
        emailComprador: email,
        razaoSocial: holderName,
        nomeAdministrador: adminName,
        whatsapp: phone,
        ciclo: ciclo as CicloCobranca,
        modoInicio: modoInicio as ModoInicio,
        status: 'CARRINHO',
        precoSnapshot: { planoId: plano.id, planoSlug: plano.slug, ofertaId: offers[0].id, ambiente, trialDias: offers[0].trialDias, totalCentavos },
        totalCentavos,
        idempotencyKey: key,
        externalReference: `CSDK-${crypto.randomUUID()}`,
        expiraEm: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    res.status(201).json({ id: order.id, status: order.status, totalCentavos });
  } catch {
    // Duas requisições simultâneas podem disputar a mesma chave única.
    try {
      const existing = await getPrisma().pedido.findUnique({ where: { idempotencyKey: key }, include: { plano: true, oferta: true } });
      if (existing && existing.documento === cleanDocument && existing.emailComprador === email &&
          existing.ciclo === ciclo && existing.modoInicio === modoInicio && existing.plano.slug === planoSlug &&
          existing.oferta?.ambiente === ambiente) {
        res.json({ id: existing.id, status: existing.status, totalCentavos: existing.totalCentavos });
        return;
      }
    } catch {
      // A indisponibilidade do banco é tratada abaixo.
    }
    res.status(503).json({ error: 'Não foi possível criar o pedido.' });
  }
});

orderRouter.post('/api/public/orders/:id/checkout', async (req: Request, res: Response) => {
  if (!publicCommerceEnabled()) {
    res.status(503).json({ error: 'As compras estão temporariamente indisponíveis.' });
    return;
  }
  const id = String(req.params.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) { res.status(400).json({ error: 'Pedido inválido.' }); return; }
  const ambiente = paymentEnvironment();
  const client = ambiente ? mercadoPagoClient(ambiente) : null;
  const origin = appOrigin();
  if (!ambiente || !client || !origin) {
    res.status(503).json({ error: 'Checkout temporariamente indisponível.' }); return;
  }
  const db = getPrisma();
  try {
    let order = await db.pedido.findUnique({ where: { id }, include: { oferta: true, plano: true } });
    if (!order || order.expiraEm && order.expiraEm <= new Date()) {
      res.status(404).json({ error: 'Pedido não encontrado ou expirado.' }); return;
    }
    if (order.status === 'TRIAL_ATIVO' || order.status === 'ASSINATURA_ATIVA') {
      res.status(409).json({ error: 'Esta compra já foi concluída.' }); return;
    }
    if (!order.oferta || order.oferta.ambiente !== ambiente || !order.oferta.ativa ||
        order.oferta.totalCentavos !== order.totalCentavos ||
        order.oferta.trialDias !== (order.modoInicio === 'TRIAL' ? 7 : 0)) {
      res.status(409).json({ error: 'A oferta desse pedido mudou; revise o carrinho antes de pagar.' }); return;
    }
    if (order.mercadoPagoId) {
      const existing = await client.getSubscription(order.mercadoPagoId);
      if (isMercadoPagoCheckoutUrl(existing.init_point)) {
        res.json({ id: order.id, status: order.status, checkoutUrl: existing.init_point }); return;
      }
      res.status(202).json({ id: order.id, status: order.status, processing: true }); return;
    }

    const now = new Date();
    const claimed = await db.pedido.updateMany({
      where: { id, mercadoPagoId: null, status: { in: ['CARRINHO', 'AGUARDANDO_CARTAO'] },
        OR: [{ checkoutLockUntil: null }, { checkoutLockUntil: { lt: now } }] },
      data: { status: 'AGUARDANDO_CARTAO', checkoutLockUntil: new Date(now.getTime() + 45_000) },
    });
    if (claimed.count !== 1) {
      order = await db.pedido.findUnique({ where: { id }, include: { oferta: true, plano: true } });
      if (order?.mercadoPagoId) {
        const existing = await client.getSubscription(order.mercadoPagoId);
        if (isMercadoPagoCheckoutUrl(existing.init_point)) {
          res.json({ id, status: order.status, checkoutUrl: existing.init_point }); return;
        }
      }
      res.status(202).json({ id, status: order?.status ?? 'AGUARDANDO_CARTAO', processing: true }); return;
    }

    if (order.modoInicio === 'TRIAL') {
      const plan = await client.getPlan(order.oferta.mercadoPagoPlanId);
      const recurring = plan.auto_recurring;
      if (plan.status !== 'active' || !recurring || recurring.frequency !== CYCLES[order.ciclo] ||
          recurring.frequency_type !== 'months' || recurring.currency_id !== 'BRL' ||
          Math.round((recurring.transaction_amount ?? 0) * 100) !== order.totalCentavos ||
          recurring.free_trial?.frequency !== 7 || recurring.free_trial.frequency_type !== 'days') {
        res.status(409).json({ error: 'O plano de teste no Mercado Pago não corresponde ao carrinho. Avise o suporte.' }); return;
      }
      const checkoutUrl = ambiente === 'TEST' ? plan.sandbox_init_point ?? plan.init_point : plan.init_point;
      if (!isMercadoPagoCheckoutUrl(checkoutUrl)) {
        res.status(502).json({ error: 'O Mercado Pago não retornou um link válido para o plano de teste.' }); return;
      }
      await db.pedido.update({ where: { id }, data: { checkoutLockUntil: null, status: 'AGUARDANDO_CARTAO' } });
      res.status(200).json({ id, status: 'AGUARDANDO_CARTAO', checkoutUrl });
      return;
    }

    // Recupera por referência única caso uma resposta de rede anterior tenha se perdido.
    const recovered = await client.findByOrder({ payerEmail: order.emailComprador, externalReference: order.externalReference });
    if (recovered.length > 1) {
      res.status(409).json({ error: 'Encontramos mais de uma tentativa no provedor; o suporte precisa revisar este pedido.' }); return;
    }
    const subscription = recovered[0] ?? await client.createHostedSubscription({
      reason: `Certifica Software - DK · ${order.plano.nome}`,
      payerEmail: order.emailComprador,
      externalReference: order.externalReference,
      cycleMonths: CYCLES[order.ciclo] as 1 | 6 | 12,
      amountCentavos: order.totalCentavos,
      trialDays: 0,
      backUrl: `${origin}/pagamento-retorno?pedido=${encodeURIComponent(order.id)}`,
    });
    if (!subscription.id || subscription.external_reference !== order.externalReference ||
        (subscription.auto_recurring?.transaction_amount != null &&
          Math.round(subscription.auto_recurring.transaction_amount * 100) !== order.totalCentavos)) {
      res.status(502).json({ error: 'O provedor retornou dados diferentes do pedido; a conta não foi ativada.' }); return;
    }
    const updated = await db.pedido.updateMany({ where: { id, mercadoPagoId: null }, data: {
      mercadoPagoId: subscription.id,
      checkoutLockUntil: null,
      status: 'AGUARDANDO_CARTAO',
    } });
    if (updated.count !== 1) {
      const current = await db.pedido.findUnique({ where: { id } });
      if (current?.mercadoPagoId !== subscription.id) {
        res.status(409).json({ error: 'Pedido já vinculado a outra assinatura.' }); return;
      }
    }
    if (isMercadoPagoCheckoutUrl(subscription.init_point)) {
      res.status(200).json({ id, status: 'AGUARDANDO_CARTAO', checkoutUrl: subscription.init_point }); return;
    }
    res.status(202).json({ id, status: 'AGUARDANDO_CARTAO', processing: true });
  } catch (error) {
    console.error('Falha ao preparar checkout Mercado Pago:', error instanceof Error ? error.message : 'erro desconhecido');
    res.status(503).json({ error: 'Não foi possível abrir o pagamento agora. Tente novamente em instantes.' });
  }
});

orderRouter.get('/api/public/orders/:id/status', async (req: Request, res: Response) => {
  const id = String(req.params.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) { res.status(400).json({ error: 'Pedido inválido.' }); return; }
  try {
    const db = getPrisma();
    let order = await db.pedido.findUnique({ where: { id }, include: { oferta: true } });
    if (!order) { res.status(404).json({ error: 'Pedido não encontrado.' }); return; }
    const ambiente = paymentEnvironment();
    const client = ambiente ? mercadoPagoClient(ambiente) : null;
    if (order.modoInicio === 'TRIAL' && order.status === 'AGUARDANDO_CARTAO' && order.oferta && client &&
        (!order.expiraEm || order.expiraEm > new Date()) &&
        order.oferta.ambiente === ambiente && order.oferta.ativa && order.oferta.mercadoPagoPlanId) {
      const subscriptions = await client.findByPayerAndPlan({
        payerEmail: order.emailComprador,
        planId: order.oferta.mercadoPagoPlanId,
      });
      const authorized = subscriptions.filter((subscription) => subscription.status === 'authorized' && subscription.id);
      const matchingAuthorized = [];
      for (const candidate of authorized) {
        const full = await client.getSubscription(candidate.id);
        if (full.payer_email?.trim().toLowerCase() === order.emailComprador &&
            full.preapproval_plan_id === order.oferta.mercadoPagoPlanId) matchingAuthorized.push(full);
      }
      if (matchingAuthorized.length > 1) throw new Error('MP_TRIAL_SUBSCRIPTION_AMBIGUOUS');
      if (matchingAuthorized.length === 1) {
        const subscription = matchingAuthorized[0];
        const plan = subscription.preapproval_plan_id ? await client.getPlan(subscription.preapproval_plan_id) : undefined;
        const provisioned = await provisionAuthorizedSubscription({ db, subscription, plan });
        if (provisioned) await deliverFirstAccessEmail(provisioned.email, provisioned.resetToken);
        order = await db.pedido.findUnique({ where: { id }, include: { oferta: true } }) ?? order;
      }
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ id: order.id, status: order.status, modoInicio: order.modoInicio });
  } catch {
    res.status(503).json({ error: 'Não foi possível consultar este pagamento agora.' });
  }
});
