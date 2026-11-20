import { Router, type Request, type Response } from 'express';
import { getPrisma } from '../lib/prisma.ts';
import { verifyMercadoPagoWebhook } from '../lib/mercadoPagoWebhook.ts';

export const mercadoPagoWebhookRouter = Router();

mercadoPagoWebhookRouter.post('/webhooks/mercado-pago', async (req: Request, res: Response) => {
  const dataId = req.query['data.id'];
  const requestId = req.header('x-request-id');
  const signature = req.header('x-signature');
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (typeof dataId !== 'string' || !requestId || !signature || !secret ||
      !verifyMercadoPagoWebhook({ dataId, requestId, signature, secret })) {
    res.status(401).json({ error: 'Notificação não autorizada.' });
    return;
  }
  const eventId = req.body?.id;
  const topic = req.body?.type;
  if ((typeof eventId !== 'string' && typeof eventId !== 'number') ||
      typeof topic !== 'string' || !/^[a-z_]{2,80}$/.test(topic) ||
      String(req.body?.data?.id ?? '') !== dataId) {
    res.status(400).json({ error: 'Notificação inválida.' });
    return;
  }
  try {
    await getPrisma().pagamentoEvento.upsert({
      where: { provedorEventoId: `mp:${eventId}` },
      create: { provedorEventoId: `mp:${eventId}`, topico: topic, recursoId: dataId },
      update: {},
    });
    res.status(200).json({ received: true });
  } catch {
    res.status(503).json({ error: 'Falha ao registrar notificação.' });
  }
});
