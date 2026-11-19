import React, { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  Clock,
  DollarSign,
  Eye,
  Package,
  TrendingUp,
} from 'lucide-react';
import type { GlobalCatalogSnapshot } from '../../services/catalogService.ts';
import { formatarMoedaBRL } from '../../data/globalCatalogSeed.ts';
import type { AnalyticsSessionDoc, EmpresaDoc } from '../../types/domain.ts';

interface SuperAdminDashboardProps {
  empresas: EmpresaDoc[];
  catalog: GlobalCatalogSnapshot | null;
  analytics: {
    totalAcessosRegistrados: number;
    acessosHoje: number;
    acessosMes: number;
    usuariosOnlineAgora: number;
    sessoesRecentes: AnalyticsSessionDoc[];
  };
  onGoCompanies: () => void;
}

const MONTH_LABELS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  empresas,
  catalog,
  analytics,
  onGoCompanies,
}) => {
  const stats = useMemo(() => {
    const ativas = empresas.filter((e) => e.status === 'ATIVA');
    const trials = empresas.filter((e) => e.status === 'TRIAL');
    const bloqueadas = empresas.filter(
      (e) => e.status === 'INADIMPLENTE' || e.status === 'SUSPENSA'
    );

    const mrrCentavos = ativas.reduce((acc, e) => {
      const base = e.valorMensalCentavos ?? 0;
      const addonsTotal = (e.adicionaisAtivos ?? []).reduce((sum, slug) => {
        const addon = catalog?.adicionais.find((a) => a.slug === slug);
        if (!addon || addon.tipoCobranca !== 'RECORRENTE') return sum;
        return sum + addon.precoMensalCentavos;
      }, 0);
      return acc + base + addonsTotal;
    }, 0);

    return {
      mrrCentavos,
      ativasCount: ativas.length,
      trialsCount: trials.length,
      bloqueadasCount: bloqueadas.length,
    };
  }, [empresas, catalog]);

  // Série histórica dos últimos 6 meses (receita acumulada e novas empresas)
  const monthlySeries = useMemo(() => {
    const now = new Date();
    const buckets: {
      key: string;
      label: string;
      empresasNovas: number;
      mrrAcumuladoCentavos: number;
    }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();
      const startOfMonth = d.getTime();

      let novas = 0;
      let mrr = 0;

      for (const emp of empresas) {
        const createdMs = emp.createdAt?.toMillis() ?? now.getTime();
        if (createdMs >= startOfMonth && createdMs <= endOfMonth) {
          novas += 1;
        }
        if (createdMs <= endOfMonth && emp.status === 'ATIVA') {
          mrr += emp.valorMensalCentavos ?? 0;
        }
      }

      buckets.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: `${MONTH_LABELS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
        empresasNovas: novas,
        mrrAcumuladoCentavos: mrr,
      });
    }

    return buckets;
  }, [empresas]);

  const maxMrrBucket = useMemo(
    () => Math.max(10000, ...monthlySeries.map((b) => b.mrrAcumuladoCentavos)),
    [monthlySeries]
  );

  // Resumo de Serviços Adicionais contratados
  const addonsSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const emp of empresas) {
      for (const slug of emp.adicionaisAtivos ?? []) {
        counts.set(slug, (counts.get(slug) ?? 0) + 1);
      }
    }
    return (catalog?.adicionais ?? []).map((addon) => ({
      addon,
      qtdEmpresas: counts.get(addon.slug) ?? 0,
      receitaCentavos: (counts.get(addon.slug) ?? 0) * addon.precoMensalCentavos,
    }));
  }, [empresas, catalog]);

  const onlineSessions = useMemo(() => {
    const now = Date.now();
    return analytics.sessoesRecentes.filter(
      (s) => now - (s.ultimoPingEm?.toMillis() ?? 0) <= 2 * 60 * 1000
    );
  }, [analytics.sessoesRecentes]);

  return (
    <div className="space-y-6">
      {/* KPIs Principais (6 cartões reais) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Faturamento Mensal (MRR)</span>
            <DollarSign className="w-4 h-4 text-emerald-700" />
          </div>
          <p className="mt-3 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatarMoedaBRL(stats.mrrCentavos)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Receita recorrente de {stats.ativasCount} conta(s) ativa(s) + adicionais
          </p>
        </div>

        <button
          type="button"
          onClick={onGoCompanies}
          className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Empresas Ativas & Trial</span>
            <Building2 className="w-4 h-4 text-[#1D4ED8]" />
          </div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {stats.ativasCount}
            </span>
            <span className="text-xs font-medium text-emerald-700">ativas</span>
            <span className="text-slate-300">·</span>
            <span className="text-lg font-bold font-mono tabular-nums text-[#1D4ED8]">
              {stats.trialsCount}
            </span>
            <span className="text-xs font-medium text-slate-500">em trial</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Total de {empresas.length} empresa(s) cadastrada(s) no ecossistema
          </p>
        </button>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Pendentes / Suspensas</span>
            <AlertTriangle
              className={`w-4 h-4 ${
                stats.bloqueadasCount > 0 ? 'text-red-600' : 'text-slate-400'
              }`}
            />
          </div>
          <p
            className={`mt-3 text-2xl font-bold font-mono tabular-nums ${
              stats.bloqueadasCount > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {stats.bloqueadasCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Contas bloqueadas aguardando regularização Asaas
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Acessos Hoje</span>
            <Eye className="w-4 h-4 text-slate-500" />
          </div>
          <p className="mt-3 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {analytics.acessosHoje}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Sessões únicas registradas desde 00:00
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Acessos no Mês</span>
            <Clock className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {analytics.acessosMes}
            </span>
            <span className="text-xs font-mono text-slate-400">
              ({analytics.totalAcessosRegistrados} total)
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Site institucional, painel cliente e provas públicas
          </p>
        </div>

        <div className="bg-slate-900 text-white border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Usuários Online / Visualizando Agora</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="mt-3 text-2xl font-bold font-mono tabular-nums text-white">
            {analytics.usuariosOnlineAgora}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Heartbeat real nos últimos 2 minutos
          </p>
        </div>
      </div>

      {/* Gráfico de Crescimento MRR/Empresas + Resumo de Adicionais */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-[#1D4ED8]" />
                Evolução de Receita (MRR) e Novas Empresas
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Últimos 6 meses calculados em tempo real a partir da base de clientes.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-6 gap-3 items-end h-52 pt-4">
            {monthlySeries.map((b) => {
              const heightPct = Math.max(
                8,
                Math.round((b.mrrAcumuladoCentavos / maxMrrBucket) * 100)
              );
              return (
                <div key={b.key} className="flex flex-col items-center justify-end h-full gap-2">
                  <div className="text-[10px] font-mono text-slate-500 text-center leading-tight">
                    <span className="font-semibold text-slate-900 block">
                      {formatarMoedaBRL(b.mrrAcumuladoCentavos)}
                    </span>
                    <span>+{b.empresasNovas} emp.</span>
                  </div>
                  <div className="w-full max-w-[44px] flex-1 flex items-end">
                    <div
                      className="w-full rounded-t-lg bg-[#1D4ED8] transition-all duration-300"
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">{b.label}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Resumo de Serviços Adicionais Contratados */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-slate-700" />
              <h2 className="text-sm font-semibold text-slate-900">
                Serviços Adicionais Contratados
              </h2>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {addonsSummary.map(({ addon, qtdEmpresas, receitaCentavos }) => (
              <div
                key={addon.id}
                className="px-5 py-3 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{addon.nome}</p>
                  <p className="text-[11px] text-slate-500 font-mono">
                    {formatarMoedaBRL(addon.precoMensalCentavos)}
                    {addon.tipoCobranca === 'RECORRENTE' ? '/mês' : ' único'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono font-semibold text-slate-900">
                    {qtdEmpresas} {qtdEmpresas === 1 ? 'empresa' : 'empresas'}
                  </p>
                  <p className="font-mono text-[11px] text-emerald-700">
                    {formatarMoedaBRL(receitaCentavos)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Sessões Online / Acessos Recentes (Heartbeat Real) */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Monitoramento de Sessões e Acessos em Tempo Real
            </h2>
            <p className="text-xs text-slate-500">
              {onlineSessions.length} sessão(ões) ativa(s) nos últimos 2 minutos · exibindo os 15
              acessos mais recentes.
            </p>
          </div>
        </div>

        {analytics.sessoesRecentes.length === 0 ? (
          <p className="p-6 text-xs text-slate-500 text-center">
            Nenhuma sessão registrada ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 px-5">Status</th>
                  <th className="py-2.5 px-4">Origem</th>
                  <th className="py-2.5 px-4">Rota Visualizada</th>
                  <th className="py-2.5 px-4">Empresa Vinculada</th>
                  <th className="py-2.5 px-5 text-right">Último Heartbeat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analytics.sessoesRecentes.slice(0, 15).map((s) => {
                  const pingMs = s.ultimoPingEm?.toMillis() ?? 0;
                  const online = Date.now() - pingMs <= 2 * 60 * 1000;
                  const emp = s.empresaId
                    ? empresas.find((e) => e.id === s.empresaId)
                    : null;
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-5 font-semibold">
                        <span className={online ? 'text-emerald-700' : 'text-slate-400'}>
                          {online ? 'Online agora' : 'Recente'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-700">{s.origem}</td>
                      <td className="py-2.5 px-4 font-mono text-[#1D4ED8]">{s.rota}</td>
                      <td className="py-2.5 px-4 text-slate-600">
                        {emp ? emp.razaoSocial : 'Visitante / Público'}
                      </td>
                      <td className="py-2.5 px-5 text-right font-mono text-slate-500">
                        {pingMs ? new Date(pingMs).toLocaleTimeString('pt-BR') : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
