import type { NextFunction, Request, Response } from 'express';
import { getPrisma } from '../lib/prisma.ts';
import { verifyJwtToken } from '../lib/security.ts';

export async function requireDatabaseAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sessão ausente.' });
    return;
  }
  const token = verifyJwtToken(header.slice(7));
  if (!token) {
    res.status(401).json({ error: 'Sessão inválida.' });
    return;
  }
  try {
    const user = await getPrisma().usuario.findUnique({ where: { id: token.userId } });
    if (
      !user || !user.ativo || user.email !== token.email ||
      user.perfil !== token.perfil || user.empresaId !== token.empresaId ||
      user.versaoSessao !== token.versaoSessao
    ) {
      res.status(401).json({ error: 'Sessão revogada ou usuário inativo.' });
      return;
    }
    res.locals.authUser = user;
    next();
  } catch {
    res.status(503).json({ error: 'Não foi possível verificar a sessão.' });
  }
}

export function requireSuperAdmin(_req: Request, res: Response, next: NextFunction): void {
  if (res.locals.authUser?.perfil !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Permissão insuficiente.' });
    return;
  }
  next();
}

export function requireTenantScope(req: Request, res: Response, next: NextFunction): void {
  const user = res.locals.authUser;
  const empresaId = req.body?.empresaId;
  if (typeof empresaId !== 'string' || !empresaId) {
    res.status(400).json({ error: 'empresaId obrigatório.' });
    return;
  }
  if (user?.perfil !== 'SUPER_ADMIN' && user?.empresaId !== empresaId) {
    res.status(403).json({ error: 'Acesso a outra empresa negado.' });
    return;
  }
  next();
}
