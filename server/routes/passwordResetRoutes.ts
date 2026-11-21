import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { getPrisma } from '../lib/prisma.ts';
import { hashPassword } from '../lib/security.ts';
import { sendTransactionalEmail, transactionalEmailConfigured } from '../services/transactionalEmail.ts';

export const passwordResetRouter = Router();
const recentRequests = new Map<string, number>();

function resetConfig(): { appUrl: string } | null {
  const appUrl = process.env.APP_URL;
  if (!transactionalEmailConfigured() || !appUrl) return null;
  try {
    const url = new URL(appUrl);
    if (url.protocol !== 'https:') return null;
    return { appUrl: url.origin };
  } catch {
    return null;
  }
}

passwordResetRouter.post('/api/auth/password-reset/request', async (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Informe um e-mail válido.' });
    return;
  }
  const config = resetConfig();
  if (!config) {
    res.status(503).json({ error: 'Recuperação temporariamente indisponível.' });
    return;
  }
  const now = Date.now();
  for (const [key, time] of recentRequests) if (now - time > 5 * 60_000) recentRequests.delete(key);
  const emailKey = crypto.createHash('sha256').update(email).digest('hex');
  if (now - (recentRequests.get(emailKey) ?? 0) < 2 * 60_000) {
    res.status(202).json({ message: 'Se houver uma conta, enviaremos um link para redefinir a senha.' });
    return;
  }
  recentRequests.set(emailKey, now);
  try {
    const db = getPrisma();
    const user = await db.usuario.findUnique({ where: { email } });
    if (user?.ativo) {
      const token = crypto.randomBytes(32).toString('base64url');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const record = await db.recuperacaoSenha.create({ data: {
        usuarioId: user.id,
        tokenHash,
        expiraEm: new Date(now + 30 * 60_000),
      } });
      const link = new URL('/resetar-senha', config.appUrl);
      link.searchParams.set('token', token);
      try {
        await sendTransactionalEmail({ to: user.email, subject: 'Redefinir senha do Certifica Software - DK',
          text: `Use este link para redefinir sua senha em até 30 minutos: ${link.toString()}\n\nSe você não solicitou, ignore esta mensagem.`,
          idempotencyKey: `password-reset/${record.id}` });
      } catch (error) {
        await db.recuperacaoSenha.delete({ where: { id: record.id } });
        console.error('Falha no envio da recuperação:', error instanceof Error ? error.message : 'erro desconhecido');
      }
    }
    res.status(202).json({ message: 'Se houver uma conta, enviaremos um link para redefinir a senha.' });
  } catch {
    res.status(503).json({ error: 'Recuperação temporariamente indisponível.' });
  }
});

passwordResetRouter.post('/api/auth/password-reset/confirm', async (req: Request, res: Response) => {
  const token = req.body?.token;
  const password = req.body?.password;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token) ||
      typeof password !== 'string' || password.length < 12 || password.length > 256) {
    res.status(400).json({ error: 'Link ou nova senha inválidos. Use pelo menos 12 caracteres.' });
    return;
  }
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  try {
    const db = getPrisma();
    const record = await db.recuperacaoSenha.findUnique({ where: { tokenHash } });
    if (!record || record.usadoEm || record.expiraEm <= new Date()) {
      res.status(410).json({ error: 'Link expirado ou já utilizado.' });
      return;
    }
    const passwordHash = hashPassword(password);
    const usedAt = new Date();
    const changed = await db.$transaction(async (tx) => {
      const claimed = await tx.recuperacaoSenha.updateMany({
        where: { id: record.id, usadoEm: null, expiraEm: { gt: usedAt } },
        data: { usadoEm: usedAt },
      });
      if (claimed.count !== 1) return false;
      await tx.usuario.update({ where: { id: record.usuarioId }, data: {
        senhaHash: passwordHash,
        versaoSessao: { increment: 1 },
      } });
      await tx.recuperacaoSenha.updateMany({
        where: { usuarioId: record.usuarioId, usadoEm: null },
        data: { usadoEm: usedAt },
      });
      return true;
    });
    if (!changed) {
      res.status(410).json({ error: 'Link expirado ou já utilizado.' });
      return;
    }
    res.status(204).end();
  } catch {
    res.status(503).json({ error: 'Não foi possível redefinir a senha.' });
  }
});
