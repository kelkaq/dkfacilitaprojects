import { auth } from '../lib/firebase.ts';

export interface PlatformNotice {
  id: string;
  titulo: string;
  mensagem: string;
  tipo: 'INFORMATIVO' | 'MANUTENCAO' | 'NOVIDADE' | 'URGENTE';
  exibirPopup: boolean;
  exigirConfirmacao: boolean;
  link: string | null;
  publicoAlvo: 'TODAS' | 'ATIVAS' | 'TRIAL' | 'PLANO_ESPECIFICO' | 'PERFIL' | 'EMPRESAS' | 'USUARIOS';
  planoAlvoSlug?: string | null;
  perfilAlvo?: string | null;
  empresaIds: string[];
  usuarioIds: string[];
  agendadoInicioIso: string;
  agendadoFimIso: string;
  fusoHorario: string;
  repeticao: 'UNICO' | 'DIARIO' | 'SEMANAL' | 'MENSAL';
  status: 'RASCUNHO' | 'AGENDADO' | 'ATIVO' | 'PAUSADO' | 'ENCERRADO';
  entregas: number;
  lidas: number;
  createdAt: string;
  updatedAt: string;
}

export interface NoticeTargets {
  empresas: { id: string; nome: string; status: string }[];
  usuarios: { id: string; nome: string; email: string; perfil: string; empresaId: string | null; empresa: string }[];
}

let cachedAdminToken = '';
let tokenExpiresAt = 0;
let cachedAdminUid = '';

export function clearPlatformAdminToken(): void {
  cachedAdminToken = '';
  tokenExpiresAt = 0;
  cachedAdminUid = '';
}

async function getAdminToken(): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) throw new Error('Entre com a conta autorizada do painel do dono.');
  if (cachedAdminUid && cachedAdminUid !== currentUser.uid) {
    clearPlatformAdminToken();
  }
  if (cachedAdminToken && tokenExpiresAt > Date.now() + 30_000) return cachedAdminToken;
  const firebaseToken = await currentUser.getIdToken();
  const response = await fetch('/api/admin/session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${firebaseToken}`, Accept: 'application/json' },
    credentials: 'same-origin',
  });
  const body = await response.json().catch(() => null) as { token?: string; expiresInSeconds?: number; error?: string } | null;
  if (!response.ok || !body?.token) throw new Error(body?.error || 'O banco não reconheceu sua conta como administradora.');
  cachedAdminToken = body.token;
  cachedAdminUid = currentUser.uid;
  tokenExpiresAt = Date.now() + (body.expiresInSeconds ?? 3600) * 1000;
  return cachedAdminToken;
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAdminToken();
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null) as { error?: string } | T | null;
  if (!response.ok) {
    if (response.status === 401) clearPlatformAdminToken();
    throw new Error(body && typeof body === 'object' && 'error' in body ? String(body.error) : 'Não foi possível concluir a operação.');
  }
  return body as T;
}

export async function listPlatformNotices(): Promise<PlatformNotice[]> {
  const result = await adminFetch<{ comunicados: PlatformNotice[] }>('/api/admin/platform-notices');
  return result.comunicados;
}

export async function listNoticeTargets(): Promise<NoticeTargets> {
  return adminFetch<NoticeTargets>('/api/admin/notification-targets');
}

export async function savePlatformNotice(input: Omit<PlatformNotice, 'id' | 'entregas' | 'lidas' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<void> {
  await adminFetch('/api/admin/platform-notices', { method: 'POST', body: JSON.stringify(input) });
}

export async function deletePlatformNotice(id: string): Promise<void> {
  await adminFetch(`/api/admin/platform-notices/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
