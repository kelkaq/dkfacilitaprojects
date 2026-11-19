import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import type {
  AnalyticsSessionDoc,
  NotificacaoAdminDoc,
  TipoNotificacaoAdmin,
} from '../types/domain.ts';

let runtimeSessionId: string | null = null;

export function getOrCreateRuntimeSessionId(): string {
  if (!runtimeSessionId) {
    const rand = Math.random().toString(36).slice(2, 10);
    runtimeSessionId = `sess_${Date.now().toString(36)}_${rand}`;
  }
  return runtimeSessionId;
}

export async function sendAnalyticsHeartbeat(params: {
  rota: string;
  origem: 'SITE' | 'APP' | 'ADMIN' | 'PROVA_PUBLICA' | 'VALIDACAO_QR';
  empresaId?: string | null;
}): Promise<string> {
  const sessaoId = getOrCreateRuntimeSessionId();
  const payload: Record<string, unknown> = {
    sessaoId,
    rota: params.rota.slice(0, 200),
    origem: params.origem,
    ultimoPingEm: serverTimestamp(),
  };

  if (params.empresaId) {
    payload.empresaId = params.empresaId;
  }
  if (auth.currentUser?.uid) {
    payload.usuarioUid = auth.currentUser.uid;
  }

  try {
    await setDoc(doc(db, 'logs_acesso_analytics', sessaoId), payload);
    return sessaoId;
  } catch (error) {
    // Heartbeat nunca deve derrubar a UI caso o cliente esteja offline
    console.warn('Falha ao enviar heartbeat de analytics:', error);
    return sessaoId;
  }
}

export async function fetchRealtimeAnalytics(): Promise<{
  totalAcessosRegistrados: number;
  acessosHoje: number;
  acessosMes: number;
  usuariosOnlineAgora: number;
  sessoesRecentes: AnalyticsSessionDoc[];
}> {
  const path = 'logs_acesso_analytics';
  try {
    const snap = await getDocs(collection(db, path));
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);
    const onlineWindowMs = 2 * 60 * 1000; // 2 minutos

    const sessoes = snap.docs
      .map((d) => ({ ...(d.data() as AnalyticsSessionDoc), id: d.id }))
      .sort((a, b) => {
        const msA = a.ultimoPingEm?.toMillis() ?? 0;
        const msB = b.ultimoPingEm?.toMillis() ?? 0;
        return msB - msA;
      });

    let acessosHoje = 0;
    let acessosMes = 0;
    let usuariosOnlineAgora = 0;

    for (const s of sessoes) {
      const pingMs = s.ultimoPingEm?.toMillis() ?? 0;
      if (pingMs >= startOfToday.getTime()) acessosHoje += 1;
      if (pingMs >= startOfMonth.getTime()) acessosMes += 1;
      if (now - pingMs <= onlineWindowMs) usuariosOnlineAgora += 1;
    }

    return {
      totalAcessosRegistrados: sessoes.length,
      acessosHoje,
      acessosMes,
      usuariosOnlineAgora,
      sessoesRecentes: sessoes.slice(0, 30),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createAdminNotification(params: {
  tipo: TipoNotificacaoAdmin;
  titulo: string;
  mensagem: string;
  empresaId?: string | null;
  empresaNome?: string | null;
}): Promise<void> {
  const notifId = `notif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `notificacoes_admin/${notifId}`;
  try {
    await setDoc(doc(db, 'notificacoes_admin', notifId), {
      tipo: params.tipo,
      titulo: params.titulo.slice(0, 160),
      mensagem: params.mensagem.slice(0, 600),
      empresaId: params.empresaId ?? null,
      empresaNome: params.empresaNome ?? null,
      lida: false,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function listNotificacoesAdmin(): Promise<NotificacaoAdminDoc[]> {
  const path = 'notificacoes_admin';
  try {
    const snap = await getDocs(
      query(collection(db, path), orderBy('createdAt', 'desc'))
    );
    return snap.docs.map((d) => ({ ...(d.data() as NotificacaoAdminDoc), id: d.id }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function markNotificacaoLida(notificacaoId: string): Promise<void> {
  return toggleNotificacaoLida(notificacaoId, true);
}

export async function toggleNotificacaoLida(
  notificacaoId: string,
  lida: boolean
): Promise<void> {
  const path = `notificacoes_admin/${notificacaoId}`;
  try {
    await updateDoc(doc(db, 'notificacoes_admin', notificacaoId), {
      lida,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markAllNotificacoesLidas(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => toggleNotificacaoLida(id, true)));
}
