import crypto from 'node:crypto';
import type { Prisma, PrismaClient, StatusAssinatura } from '@prisma/client';
import { hashPassword } from '../lib/security.ts';
import type { MercadoPagoAuthorizedPayment, MercadoPagoSubscription } from './mercadoPagoSubscriptions.ts';
import { sendTransactionalEmail, transactionalEmailConfigured } from './transactionalEmail.ts';

function cents(amount: string | number | undefined): number | null {
  if (amount == null) return null;
  const value = Number(amount);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
}

async function sendFirstAccessEmail(email: string, token: string): Promise<void> {
  let origin = '';
  try {
    const url = new URL(process.env.APP_URL ?? '');
    if (url.protocol === 'https:') origin = url.origin;
  } catch { /* remetente indisponível */ }
  if (!transactionalEmailConfigured() || !origin) return;
  const link = new URL('/resetar-senha', origin);
  link.searchParams.set('token', token);
  await sendTransactionalEmail({ to: email, subject: 'Seu acesso ao Certifica Software - DK está pronto',
    text: `Sua conta foi criada. Defina sua senha neste link em até 30 minutos: ${link.toString()}\n\nDepois, entre em ${origin}/acesso.`,
    idempotencyKey: `first-access/${crypto.createHash('sha256').update(email).digest('hex')}/${token.slice(0, 12)}` });
}

export async function provisionAuthorizedSubscription(input: {
  db: PrismaClient;
  subscription: MercadoPagoSubscription;
}): Promise<{ email: string; resetToken: string } | null> {
  const { subscription, db } = input;
  if (subscription.status !== 'authorized' || !subscription.external_reference ||
      !subscription.id || !subscription.payer_email || !subscription.auto_recurring ||
      subscription.auto_recurring.currency_id !== 'BRL') return null;
  const resetToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
  const payerEmail = subscription.payer_email.trim().toLowerCase();
  const now = new Date();
  const result = await db.$transaction(async (tx) => {
    const order = await tx.pedido.findUnique({ where: { externalReference: subscription.external_reference },
      include: { oferta: true, plano: true } });
    if (!order || !order.oferta || order.emailComprador !== payerEmail ||
        order.totalCentavos !== cents(subscription.auto_recurring?.transaction_amount) ||
        subscription.auto_recurring?.currency_id !== 'BRL' || order.oferta.ambiente !== (process.env.CSDK_PAYMENT_ENVIRONMENT ?? '') ||
        order.oferta.totalCentavos !== order.totalCentavos) throw new Error('MP_ORDER_MISMATCH');
    if (order.status === 'TRIAL_ATIVO' || order.status === 'ASSINATURA_ATIVA') {
      if (order.mercadoPagoId !== subscription.id) throw new Error('MP_SUBSCRIPTION_MISMATCH');
      return null;
    }
    if (!['AGUARDANDO_CARTAO', 'AGUARDANDO_PAGAMENTO'].includes(order.status) ||
        (order.mercadoPagoId && order.mercadoPagoId !== subscription.id)) throw new Error('MP_ORDER_STATE');
    const trial = order.modoInicio === 'TRIAL';
    const freeTrial = subscription.auto_recurring?.free_trial;
    if (trial && (freeTrial?.frequency !== 7 || freeTrial.frequency_type !== 'days' || !subscription.card_id)) {
      throw new Error('MP_TRIAL_NOT_AUTHORIZED');
    }
    if (!trial && freeTrial && freeTrial.frequency > 0) throw new Error('MP_UNEXPECTED_TRIAL');
    if (await tx.usuario.findUnique({ where: { email: order.emailComprador } })) throw new Error('MP_EMAIL_IN_USE');
    if (await tx.empresa.findUnique({ where: { documento: order.documento } })) throw new Error('MP_DOCUMENT_IN_USE');
    if (trial && await tx.usoTrial.findUnique({ where: { documento: order.documento } })) throw new Error('MP_TRIAL_ALREADY_USED');

    const expires = trial ? (subscription.next_payment_date ? new Date(subscription.next_payment_date) :
      new Date(now.getTime() + 7 * 24 * 60 * 60_000)) : null;
    if (expires && (!Number.isFinite(expires.getTime()) || expires <= now)) throw new Error('MP_TRIAL_DATE_INVALID');
    const company = await tx.empresa.create({ data: {
      tipoDocumento: order.tipoDocumento,
      documento: order.documento,
      razaoSocial: order.razaoSocial,
      nomeFantasia: order.tipoDocumento === 'PF' ? null : order.razaoSocial,
      emailFinanceiro: order.emailComprador,
      whatsapp: order.whatsapp,
      status: trial ? 'TRIAL' : 'ATIVA',
      trialExpiraEm: expires,
    } });
    await tx.usuario.create({ data: {
      empresaId: company.id,
      nome: order.nomeAdministrador,
      email: payerEmail,
      senhaHash: hashPassword(crypto.randomBytes(32).toString('base64url')),
      perfil: 'ADMIN_EMPRESA',
    } });
    await tx.assinatura.create({ data: {
      empresaId: company.id,
      planoId: order.planoId,
      ciclo: order.ciclo,
      status: trial ? 'TRIAL' : 'ATIVA',
      valorCentavos: order.totalCentavos,
      condicoesSnapshot: order.precoSnapshot as Prisma.InputJsonValue,
      mercadoPagoId: subscription.id,
      proximaCobrancaEm: subscription.next_payment_date ? new Date(subscription.next_payment_date) : null,
    } });
    if (trial) await tx.usoTrial.create({ data: { documento: order.documento, tipoDocumento: order.tipoDocumento, empresaId: company.id } });
    await tx.pedido.update({ where: { id: order.id }, data: {
      empresaId: company.id,
      mercadoPagoId: subscription.id,
      checkoutLockUntil: null,
      status: trial ? 'TRIAL_ATIVO' : 'ASSINATURA_ATIVA',
    } });
    await tx.recuperacaoSenha.create({ data: { usuario: { connect: { email: payerEmail } },
      tokenHash, expiraEm: new Date(now.getTime() + 30 * 60_000) } });
    return { email: payerEmail, resetToken };
  });
  return result;
}

export async function syncSubscriptionStatus(input: {
  db: PrismaClient;
  subscription: MercadoPagoSubscription;
}): Promise<void> {
  const { db, subscription } = input;
  const assinatura = await db.assinatura.findUnique({ where: { mercadoPagoId: subscription.id }, include: { empresa: true } });
  if (!assinatura) return;
  const status: StatusAssinatura | null = subscription.status === 'cancelled' || subscription.status === 'canceled' ? 'CANCELADA' :
    subscription.status === 'paused' ? 'SUSPENSA' : subscription.status === 'authorized' ? null : null;
  if (!status) {
    if (subscription.next_payment_date) await db.assinatura.update({ where: { id: assinatura.id },
      data: { proximaCobrancaEm: new Date(subscription.next_payment_date) } });
    return;
  }
  await db.$transaction([
    db.assinatura.update({ where: { id: assinatura.id }, data: {
      status, canceladaEm: status === 'CANCELADA' ? new Date() : null,
      proximaCobrancaEm: subscription.next_payment_date ? new Date(subscription.next_payment_date) : null,
    } }),
    db.empresa.update({ where: { id: assinatura.empresaId }, data: { status: status === 'CANCELADA' ? 'CANCELADA' : 'SUSPENSA' } }),
  ]);
}

export async function reconcileAuthorizedPayment(input: {
  db: PrismaClient;
  invoice: MercadoPagoAuthorizedPayment;
}): Promise<void> {
  const { db, invoice } = input;
  if (!invoice.preapproval_id || !/^\d{1,32}$/.test(String(invoice.id)) || invoice.currency_id !== 'BRL') {
    throw new Error('MP_INVOICE_INVALID');
  }
  const assinatura = await db.assinatura.findUnique({ where: { mercadoPagoId: invoice.preapproval_id } });
  if (!assinatura || cents(invoice.transaction_amount) !== assinatura.valorCentavos) throw new Error('MP_INVOICE_MISMATCH');
  const paymentStatus = invoice.payment?.status;
  const status = paymentStatus === 'approved' ? 'PAGA' :
    paymentStatus === 'pending' || invoice.status === 'scheduled' ? 'PENDENTE' : 'VENCIDA';
  const now = new Date();
  const due = invoice.debit_date ? new Date(invoice.debit_date) : now;
  await db.$transaction(async (tx) => {
    await tx.fatura.upsert({
      where: { mercadoPagoAuthorizedPaymentId: String(invoice.id) },
      create: { empresaId: assinatura.empresaId, assinaturaId: assinatura.id,
        descricao: `Assinatura Mercado Pago ${assinatura.ciclo}`, valorCentavos: assinatura.valorCentavos,
        status, metodoPagamento: 'CARTAO_CREDITO', mercadoPagoAuthorizedPaymentId: String(invoice.id),
        vencimentoEm: Number.isFinite(due.getTime()) ? due : now, pagoEm: status === 'PAGA' ? now : null },
      update: { status, pagoEm: status === 'PAGA' ? now : null },
    });
    const paid = status === 'PAGA';
    await tx.assinatura.update({ where: { id: assinatura.id }, data: {
      status: paid ? 'ATIVA' : 'ATRASADA',
      proximaCobrancaEm: invoice.debit_date ? new Date(invoice.debit_date) : assinatura.proximaCobrancaEm,
    } });
    await tx.empresa.update({ where: { id: assinatura.empresaId }, data: { status: paid ? 'ATIVA' : 'INADIMPLENTE' } });
  });
}

export async function deliverFirstAccessEmail(email: string, token: string): Promise<void> {
  try { await sendFirstAccessEmail(email, token); }
  catch (error) { console.error('Conta criada; e-mail de primeiro acesso falhou:', error instanceof Error ? error.message : 'erro desconhecido'); }
}
