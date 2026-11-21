import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { PerfilUsuario } from '@prisma/client';
import { getPrisma } from '../lib/prisma.ts';
import { hashPassword } from '../lib/security.ts';
import { requireDatabaseAuth } from '../middleware/databaseAuth.ts';
import { effectiveTenantLimits } from '../lib/tenantLimits.ts';
import { sendTransactionalEmail, transactionalEmailConfigured } from '../services/transactionalEmail.ts';

export const tenantUsersRouter = Router();
const INVITABLE_ROLES: PerfilUsuario[] = ['ADMIN_EMPRESA', 'RT', 'INSTRUTOR_TST'];

function adminTenant(res: Response): string | null {
  const user = res.locals.authUser;
  return user?.perfil === 'ADMIN_EMPRESA' && typeof user.empresaId === 'string' ? user.empresaId : null;
}

tenantUsersRouter.get('/api/tenant/users', requireDatabaseAuth, async (_req: Request, res: Response) => {
  const empresaId = adminTenant(res);
  if (!empresaId) { res.status(403).json({ error: 'Acesso de administrador da conta obrigatório.' }); return; }
  try {
    const db = getPrisma();
    const [users, invites, subscription] = await Promise.all([
      db.usuario.findMany({ where: { empresaId }, select: { id: true, nome: true, email: true, perfil: true, ativo: true }, orderBy: { createdAt: 'asc' } }),
      db.conviteUsuario.findMany({ where: { empresaId, aceitoEm: null, expiraEm: { gt: new Date() } },
        select: { id: true, email: true, perfil: true, expiraEm: true }, orderBy: { createdAt: 'desc' } }),
      db.assinatura.findFirst({
        where: { empresaId, status: { in: ['TRIAL', 'ATIVA'] } },
        orderBy: { createdAt: 'desc' },
        include: {
          plano: { select: { limiteUsuarios: true, limiteColaboradores: true, limiteObras: true } },
          adicionais: { where: { ativo: true }, include: { adicional: { select: { recursoChave: true, incrementoQtd: true } } } },
        },
      }),
    ]);
    res.json({ users, invites, limiteUsuarios: subscription ? effectiveTenantLimits({ ...subscription.plano, adicionais: subscription.adicionais }).limiteUsuarios : 0 });
  } catch { res.status(503).json({ error: 'Não foi possível consultar os usuários.' }); }
});

tenantUsersRouter.post('/api/tenant/users/invitations', requireDatabaseAuth, async (req: Request, res: Response) => {
  const empresaId = adminTenant(res);
  if (!empresaId) { res.status(403).json({ error: 'Acesso de administrador da conta obrigatório.' }); return; }
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const perfil = req.body?.perfil as PerfilUsuario;
  if (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !INVITABLE_ROLES.includes(perfil)) {
    res.status(400).json({ error: 'E-mail ou perfil inválido.' }); return;
  }
  const appUrl = process.env.APP_URL;
  let origin: string;
  try {
    if (!appUrl) throw new Error('URL ausente');
    const url = new URL(appUrl);
    if (url.protocol !== 'https:') throw new Error('HTTPS obrigatório');
    origin = url.origin;
  } catch {
    res.status(503).json({ error: 'Envio de convites indisponível.' }); return;
  }
  if (!transactionalEmailConfigured()) {
    res.status(503).json({ error: 'Envio de convites indisponível.' }); return;
  }
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const db = getPrisma();
  try {
    const invite = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${empresaId} FOR UPDATE`;
      const company = await tx.empresa.findUnique({ where: { id: empresaId } });
      if (!company || !['TRIAL', 'ATIVA'].includes(company.status) ||
          (company.status === 'TRIAL' && (!company.trialExpiraEm || company.trialExpiraEm <= new Date()))) {
        throw new Error('ACCOUNT_BLOCKED');
      }
      const subscription = await tx.assinatura.findFirst({ where: { empresaId, status: { in: ['TRIAL', 'ATIVA'] } },
        orderBy: { createdAt: 'desc' }, include: { plano: true,
          adicionais: { where: { ativo: true }, include: { adicional: { select: { recursoChave: true, incrementoQtd: true } } } } } });
      if (!subscription) throw new Error('ACCOUNT_BLOCKED');
      const [users, pending, existingUser, existingInvite] = await Promise.all([
        tx.usuario.count({ where: { empresaId, ativo: true } }),
        tx.conviteUsuario.count({ where: { empresaId, aceitoEm: null, expiraEm: { gt: new Date() } } }),
        tx.usuario.findUnique({ where: { email } }),
        tx.conviteUsuario.findFirst({ where: { empresaId, email, aceitoEm: null, expiraEm: { gt: new Date() } } }),
      ]);
      if (existingUser || existingInvite) throw new Error('EMAIL_UNAVAILABLE');
      if (users + pending >= effectiveTenantLimits({ ...subscription.plano, adicionais: subscription.adicionais }).limiteUsuarios) throw new Error('USER_LIMIT');
      return tx.conviteUsuario.create({ data: {
        empresaId, email, perfil, tokenHash,
        criadoPorId: res.locals.authUser.id,
        expiraEm: new Date(Date.now() + 48 * 60 * 60_000),
      } });
    });
    const link = new URL('/aceitar-convite', origin);
    link.searchParams.set('token', token);
    try {
      await sendTransactionalEmail({ to: email, subject: 'Convite para o Certifica Software - DK',
        text: `Você recebeu um convite para acessar o Certifica Software - DK. Abra este link em até 48 horas: ${link.toString()}\n\nSe não esperava este convite, ignore a mensagem.`,
        idempotencyKey: `user-invite/${invite.id}` });
    } catch (error) {
      await db.conviteUsuario.delete({ where: { id: invite.id } });
      console.error('Falha no envio do convite:', error instanceof Error ? error.message : 'erro desconhecido');
      res.status(503).json({ error: 'Não foi possível enviar o convite.' }); return;
    }
    res.status(201).json({ id: invite.id, email: invite.email, perfil: invite.perfil, expiraEm: invite.expiraEm });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'USER_LIMIT') { res.status(409).json({ error: 'Limite de usuários do plano atingido.' }); return; }
    if (code === 'EMAIL_UNAVAILABLE') { res.status(409).json({ error: 'E-mail indisponível para convite.' }); return; }
    if (code === 'ACCOUNT_BLOCKED') { res.status(403).json({ error: 'Conta sem assinatura ativa para novos usuários.' }); return; }
    res.status(503).json({ error: 'Não foi possível criar o convite.' });
  }
});

tenantUsersRouter.post('/api/auth/invitations/accept', async (req: Request, res: Response) => {
  const token = req.body?.token;
  const nome = typeof req.body?.nome === 'string' ? req.body.nome.trim() : '';
  const password = req.body?.password;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token) ||
      nome.length < 2 || nome.length > 120 || typeof password !== 'string' ||
      password.length < 12 || password.length > 256) {
    res.status(400).json({ error: 'Convite ou dados de cadastro inválidos.' }); return;
  }
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const db = getPrisma();
  try {
    const found = await db.conviteUsuario.findUnique({ where: { tokenHash } });
    if (!found || found.aceitoEm || found.expiraEm <= new Date()) {
      res.status(410).json({ error: 'Convite expirado ou já utilizado.' }); return;
    }
    const senhaHash = hashPassword(password);
    const user = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${found.empresaId} FOR UPDATE`;
      const invite = await tx.conviteUsuario.findUnique({ where: { id: found.id } });
      const company = await tx.empresa.findUnique({ where: { id: found.empresaId } });
      if (!invite || invite.aceitoEm || invite.expiraEm <= new Date()) throw new Error('INVITE_EXPIRED');
      if (!company || !['TRIAL', 'ATIVA'].includes(company.status) ||
          (company.status === 'TRIAL' && (!company.trialExpiraEm || company.trialExpiraEm <= new Date()))) {
        throw new Error('ACCOUNT_BLOCKED');
      }
      const subscription = await tx.assinatura.findFirst({ where: { empresaId: invite.empresaId, status: { in: ['TRIAL', 'ATIVA'] } },
        orderBy: { createdAt: 'desc' }, include: { plano: true,
          adicionais: { where: { ativo: true }, include: { adicional: { select: { recursoChave: true, incrementoQtd: true } } } } } });
      if (!subscription || await tx.usuario.count({ where: { empresaId: invite.empresaId, ativo: true } }) >= effectiveTenantLimits({ ...subscription.plano, adicionais: subscription.adicionais }).limiteUsuarios) {
        throw new Error('USER_LIMIT');
      }
      if (await tx.usuario.findUnique({ where: { email: invite.email } })) throw new Error('EMAIL_UNAVAILABLE');
      const created = await tx.usuario.create({ data: { empresaId: invite.empresaId, email: invite.email,
        perfil: invite.perfil, nome, senhaHash } });
      await tx.conviteUsuario.update({ where: { id: invite.id }, data: { aceitoEm: new Date() } });
      return created;
    });
    res.status(201).json({ id: user.id, email: user.email, perfil: user.perfil });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'INVITE_EXPIRED') { res.status(410).json({ error: 'Convite expirado ou já utilizado.' }); return; }
    if (code === 'USER_LIMIT') { res.status(409).json({ error: 'Limite de usuários do plano atingido.' }); return; }
    if (code === 'ACCOUNT_BLOCKED') { res.status(403).json({ error: 'Conta indisponível.' }); return; }
    if (code === 'EMAIL_UNAVAILABLE') { res.status(409).json({ error: 'E-mail indisponível para convite.' }); return; }
    res.status(503).json({ error: 'Não foi possível aceitar o convite.' });
  }
});

tenantUsersRouter.delete('/api/tenant/users/invitations/:id', requireDatabaseAuth, async (req: Request, res: Response) => {
  const empresaId = adminTenant(res);
  if (!empresaId) { res.status(403).json({ error: 'Acesso de administrador da conta obrigatório.' }); return; }
  const id = String(req.params.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) { res.status(400).json({ error: 'Convite inválido.' }); return; }
  try {
    const result = await getPrisma().conviteUsuario.deleteMany({ where: { id, empresaId, aceitoEm: null } });
    if (result.count === 0) { res.status(404).json({ error: 'Convite pendente não encontrado.' }); return; }
    res.status(204).end();
  } catch { res.status(503).json({ error: 'Não foi possível revogar o convite.' }); }
});

tenantUsersRouter.patch('/api/tenant/users/:id', requireDatabaseAuth, async (req: Request, res: Response) => {
  const empresaId = adminTenant(res);
  if (!empresaId) { res.status(403).json({ error: 'Acesso de administrador da conta obrigatório.' }); return; }
  const id = String(req.params.id ?? '');
  const ativo = req.body?.ativo;
  if (!/^[0-9a-f-]{36}$/i.test(id) || typeof ativo !== 'boolean') {
    res.status(400).json({ error: 'Usuário ou estado inválido.' }); return;
  }
  if (id === res.locals.authUser.id) {
    res.status(409).json({ error: 'Você não pode desativar sua própria conta.' }); return;
  }
  try {
    const user = await getPrisma().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${empresaId} FOR UPDATE`;
      const target = await tx.usuario.findFirst({ where: { id, empresaId } });
      if (!target) throw new Error('USER_NOT_FOUND');
      if (target.ativo === ativo) return target;
      if (!ativo && target.perfil === 'ADMIN_EMPRESA' &&
          await tx.usuario.count({ where: { empresaId, perfil: 'ADMIN_EMPRESA', ativo: true } }) <= 1) {
        throw new Error('LAST_ADMIN');
      }
      if (ativo) {
        const company = await tx.empresa.findUnique({ where: { id: empresaId } });
        const subscription = await tx.assinatura.findFirst({ where: { empresaId, status: { in: ['TRIAL', 'ATIVA'] } },
          orderBy: { createdAt: 'desc' }, include: { plano: true,
            adicionais: { where: { ativo: true }, include: { adicional: { select: { recursoChave: true, incrementoQtd: true } } } } } });
        if (!company || !['TRIAL', 'ATIVA'].includes(company.status) || !subscription ||
            (company.status === 'TRIAL' && (!company.trialExpiraEm || company.trialExpiraEm <= new Date()))) {
          throw new Error('ACCOUNT_BLOCKED');
        }
        if (await tx.usuario.count({ where: { empresaId, ativo: true } }) >= effectiveTenantLimits({ ...subscription.plano, adicionais: subscription.adicionais }).limiteUsuarios) {
          throw new Error('USER_LIMIT');
        }
      }
      return tx.usuario.update({ where: { id }, data: { ativo, versaoSessao: { increment: 1 } } });
    });
    res.json({ id: user.id, ativo: user.ativo, perfil: user.perfil });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'USER_NOT_FOUND') { res.status(404).json({ error: 'Usuário não encontrado.' }); return; }
    if (code === 'LAST_ADMIN') { res.status(409).json({ error: 'A conta precisa manter um administrador ativo.' }); return; }
    if (code === 'USER_LIMIT') { res.status(409).json({ error: 'Limite de usuários do plano atingido.' }); return; }
    if (code === 'ACCOUNT_BLOCKED') { res.status(403).json({ error: 'Conta sem assinatura ativa.' }); return; }
    res.status(503).json({ error: 'Não foi possível atualizar o usuário.' });
  }
});
