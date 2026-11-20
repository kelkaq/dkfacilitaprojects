import React, { useMemo, useState } from 'react';
import { Bell, Check, CheckCheck, Circle } from 'lucide-react';
import type { NotificacaoAdminDoc, TipoNotificacaoAdmin } from '../../types/domain.ts';
import {
  markAllNotificacoesLidas,
  toggleNotificacaoLida,
} from '../../services/analyticsService.ts';

interface SuperAdminNotificationsProps {
  notificacoes: NotificacaoAdminDoc[];
  onRefresh: () => Promise<void>;
}

const TIPO_LABELS: Record<TipoNotificacaoAdmin, string> = {
  NOVO_TRIAL: 'Novo Trial',
  NOVA_VENDA: 'Nova Venda',
  UPGRADE: 'Upgrade de Plano',
  ADICIONAL_CONTRATADO: 'Adicional Contratado',
  PAGAMENTO_ATRASADO: 'Pagamento Atrasado',
  TRIAL_EXPIRANDO: 'Trial Expirando',
};

export const SuperAdminNotifications: React.FC<SuperAdminNotificationsProps> = ({
  notificacoes,
  onRefresh,
}) => {
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [tipoFilter, setTipoFilter] = useState<TipoNotificacaoAdmin | 'ALL'>('ALL');
  const [busy, setBusy] = useState(false);

  const unreadIds = useMemo(
    () => notificacoes.filter((n) => !n.lida).map((n) => n.id),
    [notificacoes]
  );

  const filtered = useMemo(() => {
    return notificacoes.filter((n) => {
      if (onlyUnread && n.lida) return false;
      if (tipoFilter !== 'ALL' && n.tipo !== tipoFilter) return false;
      return true;
    });
  }, [notificacoes, onlyUnread, tipoFilter]);

  const handleToggle = async (notif: NotificacaoAdminDoc) => {
    setBusy(true);
    try {
      await toggleNotificacaoLida(notif.id, !notif.lida);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const handleMarkAll = async () => {
    if (!unreadIds.length) return;
    setBusy(true);
    try {
      await markAllNotificacoesLidas(unreadIds);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Central de Notificações do Dono
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Alertas automáticos de novos trials, vendas confirmadas, upgrades, adicionais e
            inadimplência.
          </p>
        </div>

        <button
          type="button"
          disabled={busy || unreadIds.length === 0}
          onClick={() => void handleMarkAll()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 cursor-pointer disabled:opacity-50"
        >
          <CheckCheck className="w-3.5 h-3.5" />
          Marcar todas como lidas ({unreadIds.length})
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3 dk-glass-card rounded-xl p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTipoFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
              tipoFilter === 'ALL'
                ? 'bg-[#1D4ED8] text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            Todos os Eventos
          </button>
          {(Object.keys(TIPO_LABELS) as TipoNotificacaoAdmin[]).map((tipo) => (
            <button
              key={tipo}
              type="button"
              onClick={() => setTipoFilter(tipo)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                tipoFilter === tipo
                  ? 'bg-[#1D4ED8] text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              {TIPO_LABELS[tipo]}
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pr-2">
          <input
            type="checkbox"
            checked={onlyUnread}
            onChange={(e) => setOnlyUnread(e.target.checked)}
            className="rounded border-slate-300 dark:border-white/20"
          />
          Somente não lidas
        </label>
      </div>

      {/* Feed */}
      <div className="dk-glass-card rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Bell className="w-6 h-6 text-slate-400 mx-auto" />
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              Nenhuma notificação nesta visualização
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {filtered.map((notif) => (
              <div
                key={notif.id}
                className={`px-5 py-4 flex items-start justify-between gap-4 transition-colors ${
                  notif.lida
                    ? 'bg-transparent'
                    : 'bg-blue-50/50 dark:bg-blue-500/10'
                }`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span
                      className={`font-mono font-semibold ${
                        notif.tipo === 'PAGAMENTO_ATRASADO'
                          ? 'text-red-700 dark:text-red-400'
                          : notif.tipo === 'NOVA_VENDA' || notif.tipo === 'UPGRADE'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-[#1D4ED8] dark:text-blue-400'
                      }`}
                    >
                      {TIPO_LABELS[notif.tipo]}
                    </span>
                    {notif.empresaNome && (
                      <>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {notif.empresaNome}
                        </span>
                      </>
                    )}
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span className="font-mono text-slate-400">
                      {notif.createdAt
                        ? notif.createdAt.toDate().toLocaleString('pt-BR')
                        : 'Agora'}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {notif.titulo}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {notif.mensagem}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleToggle(notif)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {notif.lida ? (
                    <>
                      <Circle className="w-3 h-3 text-slate-400" />
                      Marcar não lida
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                      Marcar lida
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
