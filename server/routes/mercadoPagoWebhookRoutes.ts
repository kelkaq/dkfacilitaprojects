import { Router, type Request, type Response } from 'express';
import { getPrisma } from '../lib/prisma.ts';
import { verifyMercadoPagoWebhook } from '../lib/mercadoPagoWebhook.ts';
import { MercadoPagoSubscriptions } from '../services/mercadoPagoSubscriptions.ts';
import { deliverFirstAccessEmail, provisionAuthorizedSubscription, reconcileAuthorizedPayment, syncSubscriptionStatus } from '../services/mercadoPagoReconciliation.ts';

export const mercadoPagoWebhookRouter = Router();

mercadoPagoWebhookRouter.post('/webhooks/mercado-pago', async (req: Request, res: Response) => {
  const dataId = req.query['data.id'];
  const requestId = req.header('x-request-id');
  const signature = req.header('x-signature');
  const testEnvironment = process.env.CSDK_PAYMENT_ENVIRONMENT === 'TEST';
  const secret = testEnvironment ? process.env.MERCADO_PAGO_TEST_WEBHOOK_SECRET : process.env.MERCADO_PAGO_WEBHOOK_SECRET;
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
    const db = getPrisma();
    const event = await db.pagamentoEvento.upsert({
      where: { provedorEventoId: `mp:${eventId}` },
      create: { provedorEventoId: `mp:${eventId}`, topico: topic, recursoId: dataId },
      update: {},
    });
    const token = testEnvironment ? process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN : process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!token) throw new Error('Credencial Mercado Pago ausente.');
    const mp = new MercadoPagoSubscriptions(token);
    if (topic === 'subscription_preapproval') {
      const subscription = await mp.getSubscription(dataId);
      if (subscription.id !== dataId) throw new Error('ID de assinatura divergente.');
      const plan = subscription.preapproval_plan_id ? await mp.getPlan(subscription.preapproval_plan_id) : undefined;
      if (plan && plan.id !== subscription.preapproval_plan_id) throw new Error('ID de plano divergente.');
      const provisioned = await provisionAuthorizedSubscription({ db, subscription, plan });
      if (provisioned) await deliverFirstAccessEmail(provisioned.email, provisioned.resetToken);
      await syncSubscriptionStatus({ db, subscription });
    } else if (topic === 'subscription_authorized_payment') {
      const invoice = await mp.getAuthorizedPayment(dataId);
      if (String(invoice.id) !== dataId) throw new Error('ID de fatura divergente.');
      await reconcileAuthorizedPayment({ db, invoice });
    }
    await db.pagamentoEvento.update({ where: { id: event.id }, data: { status: 'PROCESSADO', processadoEm: new Date() } });
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Falha ao reconciliar Mercado Pago:', error instanceof Error ? error.message : 'erro desconhecido');
    try { await getPrisma().pagamentoEvento.updateMany({
      where: { provedorEventoId: `mp:${eventId}`, processadoEm: null }, data: { status: 'FALHA' },
    }); } catch { /* tentar novamente no webhook seguinte */ }
    res.status(503).json({ error: 'Falha ao registrar notificação.' });
  }
});
