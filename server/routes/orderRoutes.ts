import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { CicloCobranca, TipoDocumento } from '@prisma/client';
import { getPrisma } from '../lib/prisma.ts';
import { validateHolderDocument } from '../lib/brazilDocument.ts';

export const orderRouter = Router();

const CYCLES: Record<CicloCobranca, number> = { MENSAL: 1, SEMESTRAL: 6, ANUAL: 12 };

orderRouter.post('/api/public/orders', async (req: Request, res: Response) => {
  const key = req.header('x-idempotency-key')?.trim() ?? '';
  const { tipoDocumento, documento, emailComprador, planoSlug, ciclo } = req.body ?? {};
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(key)) {
    res.status(400).json({ error: 'Chave de idempotência inválida.' });
    return;
  }
  if (tipoDocumento !== 'PF' && tipoDocumento !== 'PJ') {
    res.status(400).json({ error: 'Tipo de titular inválido.' });
    return;
  }
  if (typeof documento !== 'string' || typeof emailComprador !== 'string' ||
      typeof planoSlug !== 'string' || typeof ciclo !== 'string' || !(ciclo in CYCLES)) {
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
    const existing = await db.pedido.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
      if (existing.documento !== cleanDocument || existing.emailComprador !== email ||
          existing.ciclo !== ciclo || existing.planoId !== plano.id) {
        res.status(409).json({ error: 'Chave já usada em outro pedido.' });
        return;
      }
      res.json({ id: existing.id, status: existing.status, totalCentavos: existing.totalCentavos });
      return;
    }
    const months = CYCLES[ciclo as CicloCobranca];
    const discount = ciclo === 'SEMESTRAL' ? plano.descontoSemestral : ciclo === 'ANUAL' ? plano.descontoAnual : 0;
    const totalCentavos = Math.round(plano.precoMensalCentavos * months * (100 - discount) / 100);
    if (totalCentavos <= 0 || discount < 0 || discount > 100) {
      res.status(422).json({ error: 'Preço do plano inválido.' });
      return;
    }
    const order = await db.pedido.create({
      data: {
        planoId: plano.id,
        tipoDocumento: tipoDocumento as TipoDocumento,
        documento: cleanDocument,
        emailComprador: email,
        ciclo: ciclo as CicloCobranca,
        status: 'CARRINHO',
        precoSnapshot: { planoId: plano.id, planoSlug: plano.slug, precoMensalCentavos: plano.precoMensalCentavos, months, discount },
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
      const existing = await getPrisma().pedido.findUnique({ where: { idempotencyKey: key }, include: { plano: true } });
      if (existing && existing.documento === cleanDocument && existing.emailComprador === email &&
          existing.ciclo === ciclo && existing.plano.slug === planoSlug) {
        res.json({ id: existing.id, status: existing.status, totalCentavos: existing.totalCentavos });
        return;
      }
    } catch {
      // A indisponibilidade do banco é tratada abaixo.
    }
    res.status(503).json({ error: 'Não foi possível criar o pedido.' });
  }
});
