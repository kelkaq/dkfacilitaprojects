import { Router, type Request, type Response } from 'express';
import { getPrisma } from '../lib/prisma.ts';
import { verifyFirebaseIdToken } from '../lib/firebaseIdentity.ts';
import { signJwtToken } from '../lib/security.ts';
import { requireDatabaseAuth, requireSuperAdmin } from '../middleware/databaseAuth.ts';

export const notificationRouter = Router();

const categories = new Set(['INFORMATIVO', 'MANUTENCAO', 'NOVIDADE', 'URGENTE']);
const audiences = new Set(['TODAS', 'ATIVAS', 'TRIAL', 'PLANO_ESPECIFICO', 'PERFIL', 'EMPRESAS', 'USUARIOS']);
const repetitions = new Set(['UNICO', 'DIARIO', 'SEMANAL', 'MENSAL']);
const statuses = new Set(['RASCUNHO', 'AGENDADO', 'ATIVO', 'PAUSADO', 'ENCERRADO']);
const tenantRoles = new Set(['ADMIN_EMPRESA', 'RT', 'INSTRUTOR_TST']);
const jsonStrings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

function sameOrigin(req: Request): boolean {
  const origin = req.header('origin');
  if (!origin) return true;
  try {
    return origin === `${req.protocol}://${req.get('host')}`;
  } catch {
    return false;
  }
}

notificationRouter.post('/api/admin/session', async (req: Request, res: Response) => {
  if (!sameOrigin(req)) {
    res.status(403).json({ error: 'Origem da operação não autorizada.' });
    return;
  }
  const authorization = req.header('authorization') ?? '';
  const firebaseToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const claims = firebaseToken ? await verifyFirebaseIdToken(firebaseToken) : null;
  if (!claims?.email) {
    res.status(401).json({ error: 'Sessão de administrador inválida ou expirada.' });
    return;
  }
  try {
    const user = await getPrisma().usuario.findUnique({ where: { email: claims.email.toLowerCase() } });
    if (!user?.ativo || user.perfil !== 'SUPER_ADMIN' || user.empresaId !== null) {
      res.status(403).json({ error: 'Esta identidade não possui acesso de administrador da plataforma.' });
      return;
    }
    const token = signJwtToken({
      userId: user.id,
      email: user.email,
      perfil: user.perfil,
      empresaId: user.empresaId,
      versaoSessao: user.versaoSessao,
    }, 60 * 60);
    res.json({ token, tokenType: 'Bearer', expiresInSeconds: 3600 });
  } catch {
    res.status(503).json({ error: 'Não foi possível criar a sessão administrativa.' });
  }
});

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(value.year), month: Number(value.month), day: Number(value.day), hour: Number(value.hour),
    minute: Number(value.minute), second: Number(value.second) };
}

function zonedInstant(parts: ReturnType<typeof zonedParts>, timezone: string, millisecond: number): Date {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, millisecond);
  let instant = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = zonedParts(new Date(instant), timezone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second, millisecond);
    const correction = desired - actualAsUtc;
    if (!correction) break;
    instant += correction;
  }
  return new Date(instant);
}

function occurrenceKey(start: Date, repetition: string, now: Date, timezone: string): string | null {
  if (now < start) return null;
  if (repetition === 'UNICO') return `${start.getTime()}:0`;
  const startLocal = zonedParts(start, timezone);
  const nowLocal = zonedParts(now, timezone);
  let index: number;
  const nextLocal = { ...startLocal };
  if (repetition === 'DIARIO' || repetition === 'SEMANAL') {
    const startDay = Date.UTC(startLocal.year, startLocal.month - 1, startLocal.day);
    const nowDay = Date.UTC(nowLocal.year, nowLocal.month - 1, nowLocal.day);
    const daysPerOccurrence = repetition === 'DIARIO' ? 1 : 7;
    index = Math.floor((nowDay - startDay) / (daysPerOccurrence * 86_400_000));
    const shifted = new Date(startDay + index * daysPerOccurrence * 86_400_000);
    nextLocal.year = shifted.getUTCFullYear(); nextLocal.month = shifted.getUTCMonth() + 1; nextLocal.day = shifted.getUTCDate();
  } else if (repetition === 'MENSAL') {
    index = Math.max(0, (nowLocal.year - startLocal.year) * 12 + nowLocal.month - startLocal.month);
    const targetMonth = new Date(Date.UTC(startLocal.year, startLocal.month - 1 + index, 1));
    nextLocal.year = targetMonth.getUTCFullYear(); nextLocal.month = targetMonth.getUTCMonth() + 1;
    nextLocal.day = Math.min(startLocal.day, new Date(Date.UTC(nextLocal.year, nextLocal.month, 0)).getUTCDate());
  } else return null;
  let occurrence = zonedInstant(nextLocal, timezone, start.getUTCMilliseconds());
  if (occurrence > now) {
    index -= 1;
    if (index < 0) return null;
    if (repetition === 'DIARIO' || repetition === 'SEMANAL') {
      const daysPerOccurrence = repetition === 'DIARIO' ? 1 : 7;
      const shifted = new Date(Date.UTC(startLocal.year, startLocal.month - 1, startLocal.day) + index * daysPerOccurrence * 86_400_000);
      nextLocal.year = shifted.getUTCFullYear(); nextLocal.month = shifted.getUTCMonth() + 1; nextLocal.day = shifted.getUTCDate();
    } else {
      const targetMonth = new Date(Date.UTC(startLocal.year, startLocal.month - 1 + index, 1));
      nextLocal.year = targetMonth.getUTCFullYear(); nextLocal.month = targetMonth.getUTCMonth() + 1;
      nextLocal.day = Math.min(startLocal.day, new Date(Date.UTC(nextLocal.year, nextLocal.month, 0)).getUTCDate());
    }
    occurrence = zonedInstant(nextLocal, timezone, start.getUTCMilliseconds());
  }
  return `${start.getTime()}:${index}`;
}

function recipientMatches(notice: {
  publicoAlvo: string;
  planoAlvoSlug: string | null;
  perfilAlvo: string | null;
  empresaIds: unknown;
  usuarioIds: unknown;
}, user: {
  id: string;
  empresaId: string | null;
  perfil: string;
  empresa: { status: string; assinaturas: { plano: { slug: string } }[] } | null;
}): boolean {
  if (!user.empresaId || user.perfil === 'SUPER_ADMIN' || !user.empresa || user.empresa.status === 'CANCELADA') return false;
  switch (notice.publicoAlvo) {
    case 'TODAS': return user.empresa.status !== 'CANCELADA';
    case 'ATIVAS': return user.empresa.status === 'ATIVA';
    case 'TRIAL': return user.empresa.status === 'TRIAL';
    case 'PLANO_ESPECIFICO': return user.empresa.assinaturas[0]?.plano.slug === notice.planoAlvoSlug;
    case 'PERFIL': return user.perfil === notice.perfilAlvo;
    case 'EMPRESAS': return jsonStrings(notice.empresaIds).includes(user.empresaId);
    case 'USUARIOS': return jsonStrings(notice.usuarioIds).includes(user.id);
    default: return false;
  }
}

notificationRouter.get('/api/tenant/notifications', requireDatabaseAuth, async (_req: Request, res: Response) => {
  const authUser = res.locals.authUser;
  if (!authUser.empresaId || authUser.perfil === 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Área de notificações disponível para usuários de empresas.' });
    return;
  }
  try {
    const db = getPrisma();
    const now = new Date();
    const [user, notices] = await Promise.all([
      db.usuario.findUnique({
        where: { id: authUser.id },
        select: { id: true, empresaId: true, perfil: true, empresa: { select: {
          status: true,
          assinaturas: { orderBy: { createdAt: 'desc' }, take: 1, select: { plano: { select: { slug: true } } } },
        } } },
      }),
      db.comunicadoPlataforma.findMany({
        where: { status: { in: ['ATIVO', 'AGENDADO'] }, inicioEm: { lte: now }, OR: [{ fimEm: null }, { fimEm: { gte: now } }] },
        orderBy: [{ inicioEm: 'desc' }, { createdAt: 'desc' }],
        take: 500,
      }),
    ]);
    if (!user?.empresaId || !user.empresa) {
      res.status(403).json({ error: 'Empresa indisponível para esta sessão.' });
      return;
    }
    const applicable = notices.flatMap((notice) => {
      let key: string | null = null;
      try { key = occurrenceKey(notice.inicioEm, notice.repeticao, now, notice.fusoHorario); } catch { key = null; }
      return key && recipientMatches(notice, user) ? [{ comunicadoId: notice.id, ocorrenciaKey: key }] : [];
    });
    if (applicable.length) {
      await db.entregaComunicado.createMany({
        data: applicable.map((item) => ({ ...item, usuarioId: user.id, empresaId: user.empresaId! })),
        skipDuplicates: true,
      });
    }
    const deliveries = await db.entregaComunicado.findMany({
      where: { usuarioId: user.id, empresaId: user.empresaId },
      include: { comunicado: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const unseenIds = deliveries.filter((item) => !item.exibidaEm).map((item) => item.id);
    if (unseenIds.length) {
      await db.entregaComunicado.updateMany({ where: { id: { in: unseenIds }, usuarioId: user.id }, data: { exibidaEm: now } });
    }
    const avisos = deliveries.map((item) => ({
      id: item.id,
      comunicadoId: item.comunicadoId,
      titulo: item.comunicado.titulo,
      mensagem: item.comunicado.mensagem,
      categoria: item.comunicado.categoria,
      exibirPopup: item.comunicado.exibirPopup,
      exigirConfirmacao: item.comunicado.exigirConfirmacao,
      link: item.comunicado.link,
      fusoHorario: item.comunicado.fusoHorario,
      createdAt: item.createdAt.toISOString(),
      lida: Boolean(item.lidaEm),
      dispensada: Boolean(item.dispensadaEm),
      confirmada: Boolean(item.confirmadaEm),
      podeConfirmar: item.comunicado.exigirConfirmacao && !item.confirmadaEm,
    }));
    res.json({ avisos, naoLidas: avisos.filter((item) => !item.lida && !item.dispensada).length });
  } catch {
    res.status(503).json({ error: 'Não foi possível carregar os avisos.' });
  }
});

notificationRouter.patch('/api/tenant/notifications/:id', requireDatabaseAuth, async (req: Request, res: Response) => {
  const user = res.locals.authUser;
  if (!user.empresaId || user.perfil === 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Operação disponível para usuários de empresas.' });
    return;
  }
  const action = req.body?.action;
  if (!['read', 'dismiss', 'confirm'].includes(action)) {
    res.status(400).json({ error: 'Ação de notificação inválida.' });
    return;
  }
  try {
    const db = getPrisma();
    const delivery = await db.entregaComunicado.findFirst({
      where: { id: req.params.id, usuarioId: user.id, empresaId: user.empresaId },
      include: { comunicado: { select: { exigirConfirmacao: true } } },
    });
    if (!delivery) {
      res.status(404).json({ error: 'Aviso não encontrado para esta conta.' });
      return;
    }
    if (action === 'confirm' && !delivery.comunicado.exigirConfirmacao) {
      res.status(409).json({ error: 'Este aviso não solicita confirmação.' });
      return;
    }
    const now = new Date();
    await db.entregaComunicado.update({ where: { id: delivery.id }, data:
      action === 'dismiss' ? { dispensadaEm: delivery.dispensadaEm ?? now } :
        action === 'confirm' ? { lidaEm: delivery.lidaEm ?? now, confirmadaEm: delivery.confirmadaEm ?? now } :
          { lidaEm: delivery.lidaEm ?? now },
    });
    res.status(204).end();
  } catch {
    res.status(503).json({ error: 'Não foi possível atualizar o aviso.' });
  }
});

notificationRouter.get('/api/admin/notification-targets', requireDatabaseAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const [empresas, usuarios] = await Promise.all([
      db.empresa.findMany({ where: { status: { not: 'CANCELADA' } }, select: { id: true, razaoSocial: true, nomeFantasia: true, status: true }, orderBy: { razaoSocial: 'asc' }, take: 2000 }),
      db.usuario.findMany({ where: { ativo: true, empresaId: { not: null }, perfil: { not: 'SUPER_ADMIN' } }, select: { id: true, nome: true, email: true, perfil: true, empresaId: true, empresa: { select: { razaoSocial: true, nomeFantasia: true } } }, orderBy: [{ empresaId: 'asc' }, { nome: 'asc' }], take: 5000 }),
    ]);
    res.json({
      empresas: empresas.map((item) => ({ id: item.id, nome: item.nomeFantasia || item.razaoSocial, status: item.status })),
      usuarios: usuarios.map((item) => ({ id: item.id, nome: item.nome, email: item.email, perfil: item.perfil, empresaId: item.empresaId, empresa: item.empresa?.nomeFantasia || item.empresa?.razaoSocial || '' })),
    });
  } catch {
    res.status(503).json({ error: 'Não foi possível carregar os destinatários.' });
  }
});

notificationRouter.get('/api/admin/platform-notices', requireDatabaseAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const notices = await db.comunicadoPlataforma.findMany({ include: { _count: { select: { entregas: true } } }, orderBy: { updatedAt: 'desc' }, take: 100 });
    const totals = notices.length ? await db.entregaComunicado.groupBy({ by: ['comunicadoId'], where: { comunicadoId: { in: notices.map((item) => item.id) }, lidaEm: { not: null } }, _count: { _all: true } }) : [];
    const readCounts = new Map(totals.map((item) => [item.comunicadoId, item._count._all]));
    res.json({ comunicados: notices.map((item) => ({
      id: item.id, titulo: item.titulo, mensagem: item.mensagem, tipo: item.categoria, exibirPopup: item.exibirPopup,
      exigirConfirmacao: item.exigirConfirmacao, link: item.link, publicoAlvo: item.publicoAlvo,
      planoAlvoSlug: item.planoAlvoSlug, perfilAlvo: item.perfilAlvo, empresaIds: jsonStrings(item.empresaIds),
      usuarioIds: jsonStrings(item.usuarioIds), agendadoInicioIso: item.inicioEm.toISOString(),
      agendadoFimIso: item.fimEm?.toISOString() ?? '', fusoHorario: item.fusoHorario, repeticao: item.repeticao,
      status: item.status, entregas: item._count.entregas, lidas: readCounts.get(item.id) ?? 0,
      createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
    })) });
  } catch {
    res.status(503).json({ error: 'Não foi possível carregar os comunicados.' });
  }
});

notificationRouter.post('/api/admin/platform-notices', requireDatabaseAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const title = typeof body.titulo === 'string' ? body.titulo.trim() : '';
  const message = typeof body.mensagem === 'string' ? body.mensagem.trim() : '';
  const category = String(body.tipo ?? 'INFORMATIVO');
  const audience = String(body.publicoAlvo ?? 'TODAS');
  const repetition = String(body.repeticao ?? 'UNICO');
  const status = String(body.status ?? 'RASCUNHO');
  const start = new Date(body.agendadoInicioIso);
  const end = body.agendadoFimIso ? new Date(body.agendadoFimIso) : null;
  const profile = body.perfilAlvo ? String(body.perfilAlvo) : null;
  const companyIds = Array.isArray(body.empresaIds) ? body.empresaIds.filter((x: unknown): x is string => typeof x === 'string').slice(0, 2000) : [];
  const userIds = Array.isArray(body.usuarioIds) ? body.usuarioIds.filter((x: unknown): x is string => typeof x === 'string').slice(0, 5000) : [];
  const link = typeof body.link === 'string' ? body.link.trim() : '';
  const timezone = typeof body.fusoHorario === 'string' ? body.fusoHorario.trim() : 'America/Sao_Paulo';
  if (!title || title.length > 160 || !message || message.length > 4000 || !categories.has(category) || !audiences.has(audience) || !repetitions.has(repetition) || !statuses.has(status) || Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime()))) {
    res.status(400).json({ error: 'Confira título, mensagem, público, agenda e status do comunicado.' });
    return;
  }
  if (end && end < start) {
    res.status(400).json({ error: 'O fim da janela deve ser posterior ao início.' });
    return;
  }
  try { new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }); } catch {
    res.status(400).json({ error: 'Selecione um fuso horário válido.' });
    return;
  }
  if (audience === 'PLANO_ESPECIFICO' && (typeof body.planoAlvoSlug !== 'string' || !body.planoAlvoSlug.trim())) {
    res.status(400).json({ error: 'Selecione o plano que receberá o comunicado.' });
    return;
  }
  if (audience === 'PERFIL' && (!profile || !tenantRoles.has(profile))) {
    res.status(400).json({ error: 'Selecione um perfil de usuário de empresa.' });
    return;
  }
  if (audience === 'EMPRESAS' && companyIds.length === 0) {
    res.status(400).json({ error: 'Selecione ao menos uma empresa.' });
    return;
  }
  if (audience === 'USUARIOS' && userIds.length === 0) {
    res.status(400).json({ error: 'Selecione ao menos um usuário.' });
    return;
  }
  if (link && !(link.startsWith('/') && !link.startsWith('//')) && !/^https:\/\//i.test(link)) {
    res.status(400).json({ error: 'O link precisa ser relativo ao sistema ou usar HTTPS.' });
    return;
  }
  try {
    const db = getPrisma();
    const existing = typeof body.id === 'string' ? await db.comunicadoPlataforma.findUnique({ where: { id: body.id }, include: { _count: { select: { entregas: true } } } }) : null;
    if (body.id && !existing) {
      res.status(404).json({ error: 'Comunicado não encontrado.' });
      return;
    }
    if (existing?._count.entregas) {
      const unchanged = existing.titulo === title && existing.mensagem === message && existing.categoria === category &&
        existing.exibirPopup === Boolean(body.exibirPopup) && existing.exigirConfirmacao === Boolean(body.exigirConfirmacao) &&
        existing.link === (link || null) && existing.publicoAlvo === audience && existing.planoAlvoSlug === (body.planoAlvoSlug || null) &&
        existing.perfilAlvo === profile && JSON.stringify(jsonStrings(existing.empresaIds)) === JSON.stringify(companyIds) &&
        JSON.stringify(jsonStrings(existing.usuarioIds)) === JSON.stringify(userIds) && existing.inicioEm.getTime() === start.getTime() &&
        (existing.fimEm?.getTime() ?? null) === (end?.getTime() ?? null) && existing.repeticao === repetition;
      if (!unchanged) {
        res.status(409).json({ error: 'Este comunicado já tem entregas e seu conteúdo fica congelado. Crie outro aviso para uma nova mensagem.' });
        return;
      }
    }
    const data = {
      titulo: title, mensagem: message, categoria: category as 'INFORMATIVO' | 'MANUTENCAO' | 'NOVIDADE' | 'URGENTE',
      exibirPopup: Boolean(body.exibirPopup), exigirConfirmacao: Boolean(body.exigirConfirmacao), link: link || null,
      publicoAlvo: audience as 'TODAS' | 'ATIVAS' | 'TRIAL' | 'PLANO_ESPECIFICO' | 'PERFIL' | 'EMPRESAS' | 'USUARIOS',
      planoAlvoSlug: audience === 'PLANO_ESPECIFICO' ? String(body.planoAlvoSlug).trim().slice(0, 64) : null,
      perfilAlvo: audience === 'PERFIL' ? profile as 'ADMIN_EMPRESA' | 'RT' | 'INSTRUTOR_TST' : null,
      empresaIds: companyIds, usuarioIds: userIds, inicioEm: start, fimEm: end,
      fusoHorario: timezone.slice(0, 80), repeticao: repetition as 'UNICO' | 'DIARIO' | 'SEMANAL' | 'MENSAL',
      status: status as 'RASCUNHO' | 'AGENDADO' | 'ATIVO' | 'PAUSADO' | 'ENCERRADO',
    };
    const saved = existing
      ? await db.comunicadoPlataforma.update({ where: { id: existing.id }, data })
      : await db.comunicadoPlataforma.create({ data: { ...data, createdById: res.locals.authUser.id } });
    res.status(existing ? 200 : 201).json({ id: saved.id });
  } catch {
    res.status(503).json({ error: 'Não foi possível salvar o comunicado.' });
  }
});

notificationRouter.delete('/api/admin/platform-notices/:id', requireDatabaseAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const notice = await db.comunicadoPlataforma.findUnique({ where: { id: req.params.id }, include: { _count: { select: { entregas: true } } } });
    if (!notice) {
      res.status(404).json({ error: 'Comunicado não encontrado.' });
      return;
    }
    if (notice._count.entregas) {
      res.status(409).json({ error: 'Este comunicado já foi entregue e não pode ser apagado. Altere o status para Encerrado.' });
      return;
    }
    await db.comunicadoPlataforma.delete({ where: { id: notice.id } });
    res.status(204).end();
  } catch {
    res.status(503).json({ error: 'Não foi possível excluir o comunicado.' });
  }
});
