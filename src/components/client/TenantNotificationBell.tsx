import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Check, ExternalLink, X } from 'lucide-react';

type TenantNotice = {
  id: string;
  comunicadoId: string;
  titulo: string;
  mensagem: string;
  categoria: 'INFORMATIVO' | 'MANUTENCAO' | 'NOVIDADE' | 'URGENTE';
  exibirPopup: boolean;
  exigirConfirmacao: boolean;
  link: string | null;
  createdAt: string;
  lida: boolean;
  dispensada: boolean;
  confirmada: boolean;
  podeConfirmar: boolean;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init,
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  const body = response.status === 204 ? null : await response.json().catch(() => null) as { error?: string } | T | null;
  if (!response.ok) throw new Error(body && typeof body === 'object' && 'error' in body ? String(body.error) : 'Não foi possível carregar os avisos.');
  return body as T;
}

export const TenantNotificationBell: React.FC = () => {
  const [items, setItems] = useState<TenantNotice[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [popupId, setPopupId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await request<{ avisos: TenantNotice[]; naoLidas: number }>('/api/tenant/notifications');
      setItems(result.avisos);
      setUnread(result.naoLidas);
      setPopupId((current) => current || result.avisos.find((item) => item.exibirPopup && !item.lida && !item.dispensada)?.id || null);
    } catch {
      // O sino não deve impedir o uso do painel quando não há avisos ou a rede oscila.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const currentPopup = useMemo(() => items.find((item) => item.id === popupId) ?? null, [items, popupId]);

  const act = async (item: TenantNotice, action: 'read' | 'dismiss' | 'confirm') => {
    setBusyId(item.id);
    try {
      await request(`/api/tenant/notifications/${encodeURIComponent(item.id)}`, { method: 'PATCH', body: JSON.stringify({ action }) });
      setPopupId((current) => current === item.id ? null : current);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const tone = (category: TenantNotice['categoria']) => category === 'URGENTE'
    ? 'border-red-200 bg-red-50 dark:border-red-400/20 dark:bg-red-950/30'
    : category === 'MANUTENCAO'
      ? 'border-amber-200 bg-amber-50 dark:border-amber-400/20 dark:bg-amber-950/25'
      : 'border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900';

  return <>
    <div className="relative">
      <button type="button" aria-label={`Notificações, ${unread} não lidas`} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10">
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && <div className="absolute right-0 top-12 z-40 w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-950">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-white/10"><div><p className="text-sm font-bold">Avisos da plataforma</p><p className="text-xs text-slate-500">{unread} não lido(s)</p></div><button type="button" aria-label="Fechar notificações" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button></div>
        <div className="max-h-[65vh] space-y-2 overflow-y-auto p-3">
          {items.length === 0 && <p className="p-5 text-center text-sm text-slate-500">Você está em dia. Não há avisos.</p>}
          {items.map((item) => <article key={item.id} className={`rounded-xl border p-3 ${tone(item.categoria)} ${item.lida || item.dispensada ? 'opacity-70' : ''}`}>
            <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-bold">{item.titulo}</p><p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-slate-300">{item.mensagem}</p></div>{!item.lida && !item.dispensada && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}</div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-slate-500">{new Date(item.createdAt).toLocaleString('pt-BR')}{item.confirmada ? ' · Confirmado' : ''}</span><div className="flex flex-wrap items-center gap-1">
              {item.link && <a href={item.link} target={item.link.startsWith('https://') ? '_blank' : undefined} rel={item.link.startsWith('https://') ? 'noreferrer' : undefined} onClick={() => { if (!item.lida) void act(item, 'read'); }} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300">Abrir <ExternalLink className="h-3 w-3" /></a>}
              {!item.lida && !item.dispensada && <button type="button" disabled={busyId === item.id} onClick={() => void act(item, 'read')} className="rounded-lg px-2 py-1 text-[11px] font-semibold hover:bg-slate-100 dark:hover:bg-white/10">Marcar lido</button>}
              {item.podeConfirmar && <button type="button" disabled={busyId === item.id} onClick={() => void act(item, 'confirm')} className="inline-flex items-center gap-1 rounded-lg bg-violet-700 px-2 py-1 text-[11px] font-semibold text-white"><Check className="h-3 w-3" />Confirmar</button>}
              {!item.lida && !item.dispensada && <button type="button" disabled={busyId === item.id} onClick={() => void act(item, 'dismiss')} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">Dispensar</button>}
            </div></div>
          </article>)}
        </div>
      </div>}
    </div>
    {currentPopup && <div role="dialog" aria-modal="true" aria-labelledby="platform-notice-title" className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/60 p-4">
      <section className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl ${tone(currentPopup.categoria)}`}>
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">Aviso da plataforma</p><h2 id="platform-notice-title" className="mt-1 text-xl font-bold">{currentPopup.titulo}</h2></div>{!currentPopup.exigirConfirmacao && <button type="button" aria-label="Fechar aviso" onClick={() => void act(currentPopup, 'dismiss')} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>}</div>
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-200">{currentPopup.mensagem}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">{currentPopup.link && <a href={currentPopup.link} target={currentPopup.link.startsWith('https://') ? '_blank' : undefined} rel={currentPopup.link.startsWith('https://') ? 'noreferrer' : undefined} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-white/15">Abrir link</a>}{currentPopup.podeConfirmar ? <button type="button" disabled={busyId === currentPopup.id} onClick={() => void act(currentPopup, 'confirm')} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Li e confirmo</button> : <button type="button" disabled={busyId === currentPopup.id} onClick={() => void act(currentPopup, 'read')} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Entendi</button>}</div>
      </section>
    </div>}
  </>;
};
