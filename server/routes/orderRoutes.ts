import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { AmbientePagamento, CicloCobranca, ModoInicio, TipoDocumento } from '@prisma/client';
import { getPrisma } from '../lib/prisma.ts';
import { validateHolderDocument } from '../lib/brazilDocument.ts';

export const orderRouter = Router();

const CYCLES: Record<CicloCobranca, number> = { MENSAL: 1, SEMESTRAL: 6, ANUAL: 12 };

function paymentEnvironment(): AmbientePagamento | null {
  const value = process.env.CSDK_PAYMENT_ENVIRONMENT;
  return value === 'TEST' || value === 'PRODUCTION' ? value : null;
}

function expectedPrice(precoMensalCentavos: number, descontoSemestral: number, descontoAnual: number, ciclo: CicloCobranca): number {
  const discount = ciclo === 'SEMESTRAL' ? descontoSemestral : ciclo === 'ANUAL' ? descontoAnual : 0;
  if (!Number.isInteger(precoMensalCentavos) || precoMensalCentavos <= 0 ||
      !Number.isInteger(discount) || discount < 0 || discount > 100) return 0;
  return Math.round(precoMensalCentavos * CYCLES[ciclo] * (100 - discount) / 100);
}

orderRouter.get('/api/public/offers', async (_req: Request, res: Response) => {
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
      ciclo: offer.ciclo,
      modoInicio: offer.trialDias === 7 ? 'TRIAL' : 'IMEDIATO',
      trialDias: offer.trialDias,
      totalCentavos: offer.totalCentavos,
      limiteUsuarios: offer.plano.limiteUsuarios,
      limiteColaboradores: offer.plano.limiteColaboradores,
    })) });
  } catch {
    res.status(503).json({ error: 'Catálogo temporariamente indisponível.' });
  }
});

orderRouter.post('/api/public/orders', async (req: Request, res: Response) => {
  const key = req.header('x-idempotency-key')?.trim() ?? '';
  const { tipoDocumento, documento, emailComprador, planoSlug, ciclo, modoInicio } = req.body ?? {};
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
          existing.oferta?.ambiente !== ambiente) {
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
    const offers = await db.planoOferta.findMany({
      where: { planoId: plano.id, ciclo: ciclo as CicloCobranca, ambiente, trialDias: modoInicio === 'TRIAL' ? 7 : 0, ativa: true },
      take: 2,
    });
    if (offers.length !== 1 || offers[0].totalCentavos !== totalCentavos) {
      res.status(409).json({ error: 'Esta modalidade ainda não está disponível para compra.' });
      return;
    }
    const order = await db.pedido.create({
      data: {
        planoId: plano.id,
        ofertaId: offers[0].id,
        tipoDocumento: tipoDocumento as TipoDocumento,
        documento: cleanDocument,
        emailComprador: email,
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
