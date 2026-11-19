import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarClock,
  FileBadge,
  GraduationCap,
  Users,
} from 'lucide-react';
import type {
  CertificadoDoc,
  ColaboradorDoc,
  EffectivePlanLimits,
  EmpresaDoc,
  ObraDoc,
  TurmaDoc,
} from '../../types/domain.ts';

interface ExecutiveDashboardProps {
  empresa: EmpresaDoc;
  limits: EffectivePlanLimits;
  obras: ObraDoc[];
  colaboradores: ColaboradorDoc[];
  turmas: TurmaDoc[];
  certificados: CertificadoDoc[];
  onNavigate: (tab: 'nrs' | 'turmas' | 'colaboradores' | 'certificados' | 'vencimentos' | 'plano') => void;
  onScheduleRecycling: (cert: CertificadoDoc) => void;
  onOpenCertificate: (cert: CertificadoDoc) => void;
}

function diffDaysFromToday(isoDate: string): number {
  const target = new Date(`${isoDate.slice(0, 10)}T23:59:59`).getTime();
  return Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24));
}

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({
  empresa,
  limits,
  obras,
  colaboradores,
  turmas,
  certificados,
  onNavigate,
  onScheduleRecycling,
  onOpenCertificate,
}) => {
  const activeColaboradores = useMemo(
    () => colaboradores.filter((c) => c.ativo),
    [colaboradores]
  );

  const turmasEmAndamento = useMemo(
    () => turmas.filter((t) => t.status === 'ABERTA' || t.status === 'RASCUNHO'),
    [turmas]
  );

  const certificadosEmitidos = useMemo(
    () => certificados.filter((c) => c.status === 'EMITIDO'),
    [certificados]
  );

  const vencendoEm30Dias = useMemo(() => {
    return certificadosEmitidos
      .map((c) => ({ cert: c, diasRestantes: diffDaysFromToday(c.dataValidadeIso) }))
      .filter((item) => item.diasRestantes <= 30)
      .sort((a, b) => a.diasRestantes - b.diasRestantes);
  }, [certificadosEmitidos]);

  const horasPorObra = useMemo(() => {
    const map = new Map<string, { label: string; horas: number; certificados: number }>();

    for (const obra of obras) {
      map.set(obra.id, {
        label: `${obra.codigo} — ${obra.nome}`,
        horas: 0,
        certificados: 0,
      });
    }

    for (const cert of certificadosEmitidos) {
      const key = cert.contratoObraId || '__SEM_OBRA__';
      const existing = map.get(key);
      if (existing) {
        existing.horas += cert.cargaHorariaHoras;
        existing.certificados += 1;
      } else {
        map.set(key, {
          label: cert.contratoObraNome || 'Sem contrato / Geral',
          horas: cert.cargaHorariaHoras,
          certificados: 1,
        });
      }
    }

    return Array.from(map.values())
      .filter((item) => item.horas > 0 || obras.length <= 6)
      .sort((a, b) => b.horas - a.horas)
      .slice(0, 8);
  }, [obras, certificadosEmitidos]);

  const maxHoras = useMemo(
    () => Math.max(1, ...horasPorObra.map((item) => item.horas)),
    [horasPorObra]
  );

  const totalHorasConcluidas = useMemo(
    () => certificadosEmitidos.reduce((acc, c) => acc + c.cargaHorariaHoras, 0),
    [certificadosEmitidos]
  );

  return (
    <div className="space-y-6">
      {/* KPIs Executivos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('colaboradores')}
          className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Colaboradores Ativos</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {activeColaboradores.length}
            </span>
            <span className="text-xs font-mono text-slate-400">
              / {limits.limiteColaboradores}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {obras.length} {obras.length === 1 ? 'contrato/obra ativo' : 'contratos/obras ativos'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('certificados')}
          className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Certificados Emitidos</span>
            <FileBadge className="w-4 h-4 text-[#1D4ED8]" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {certificadosEmitidos.length}
            </span>
            <span className="text-xs font-mono text-slate-400">
              {totalHorasConcluidas}h totais
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Todos com snapshot imutável e QR ativo
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('vencimentos')}
          className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">A Vencer (30 dias / Vencidos)</span>
            <CalendarClock
              className={`w-4 h-4 ${
                vencendoEm30Dias.length > 0 ? 'text-amber-600' : 'text-slate-400'
              }`}
            />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono tabular-nums ${
                vencendoEm30Dias.length > 0 ? 'text-amber-700' : 'text-slate-900'
              }`}
            >
              {vencendoEm30Dias.length}
            </span>
            <span className="text-xs text-slate-400">reciclagens</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Clique para abrir a Central de Vencimentos
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('turmas')}
          className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Turmas em Andamento</span>
            <GraduationCap className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {turmasEmAndamento.length}
            </span>
            <span className="text-xs font-mono text-slate-400">
              de {turmas.length} turmas
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Links e QR Codes públicos prontos
          </p>
        </button>
      </div>

      {/* Gráfico + Lista Rápida de Próximos Vencimentos */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Gráfico de Horas por Contrato / Obra */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Horas de Treinamento Concluídas por Contrato / Obra
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Consolidação real dos certificados emitidos na conta {empresa.razaoSocial}.
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                {totalHorasConcluidas}h
              </span>
              <p className="text-[11px] text-slate-400">acumuladas</p>
            </div>
          </div>

          {horasPorObra.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center space-y-3">
              <Building2 className="w-6 h-6 text-slate-400 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900">
                  Nenhuma hora registrada por contrato ainda
                </p>
                <p className="text-xs text-slate-500">
                  Cadastre seus contratos/obras, aplique turmas e emita certificados para acompanhar
                  a carga horária consolidada aqui.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onNavigate('colaboradores')}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cadastrar Obra e Colaborador
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('turmas')}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 cursor-pointer"
                >
                  Abrir Nova Turma
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {horasPorObra.map((item) => {
                const pct = Math.max(4, Math.round((item.horas / maxHoras) * 100));
                return (
                  <div key={item.label} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-slate-800 truncate">{item.label}</span>
                      <span className="font-mono tabular-nums text-slate-600 shrink-0">
                        <strong className="text-slate-900">{item.horas}h</strong> ·{' '}
                        {item.certificados}{' '}
                        {item.certificados === 1 ? 'certificado' : 'certificados'}
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${item.horas === 0 ? 0 : pct}%`,
                          backgroundColor: empresa.corPrimaria || '#1D4ED8',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Lista Rápida de Próximos Vencimentos */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Próximos Vencimentos</h2>
              <p className="text-xs text-slate-500">Vencidos e a vencer em até 30 dias</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('vencimentos')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] hover:underline cursor-pointer"
            >
              Ver central
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {vencendoEm30Dias.length === 0 ? (
            <div className="p-8 text-center space-y-1.5">
              <p className="text-sm font-medium text-slate-800">
                Nenhum vencimento crítico nos próximos 30 dias
              </p>
              <p className="text-xs text-slate-500">
                Todos os certificados emitidos estão dentro do prazo de validade.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {vencendoEm30Dias.slice(0, 6).map(({ cert, diasRestantes }) => {
                const vencido = diasRestantes < 0;
                return (
                  <div
                    key={cert.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {cert.snapshotColaborador.nome}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        <span className="font-mono font-semibold text-slate-700">
                          {cert.nrCodigo}
                        </span>{' '}
                        · Validade {cert.dataValidadeIso}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[11px] font-mono font-semibold ${
                          vencido
                            ? 'text-red-700'
                            : diasRestantes <= 7
                              ? 'text-amber-700'
                              : 'text-slate-600'
                        }`}
                      >
                        {vencido ? `Vencido há ${Math.abs(diasRestantes)}d` : `${diasRestantes}d`}
                      </span>
                      <button
                        type="button"
                        onClick={() => onScheduleRecycling(cert)}
                        className="px-2.5 py-1 rounded-md border border-slate-200 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                      >
                        Reciclar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Últimos Certificados Emitidos */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Últimos Certificados Emitidos
            </h2>
            <p className="text-xs text-slate-500">
              Acesso rápido ao PDF Frente e Verso com QR Code de validação
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('certificados')}
            className="text-xs font-medium text-[#1D4ED8] hover:underline cursor-pointer"
          >
            Ver todos ({certificadosEmitidos.length})
          </button>
        </div>

        {certificadosEmitidos.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Nenhum certificado emitido nesta empresa ainda. Abra uma turma e emita o primeiro
            certificado com 1 clique.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 px-5">Número</th>
                  <th className="py-2.5 px-4">Colaborador</th>
                  <th className="py-2.5 px-4">NR / Treinamento</th>
                  <th className="py-2.5 px-4">Validade</th>
                  <th className="py-2.5 px-5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {certificadosEmitidos.slice(0, 5).map((cert) => (
                  <tr key={cert.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-5 font-mono font-semibold text-slate-900">
                      {cert.numeroCertificado}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">
                      {cert.snapshotColaborador.nome}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <span className="font-mono font-semibold text-slate-800">
                        {cert.nrCodigo}
                      </span>{' '}
                      · {cert.cargaHorariaHoras}h
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {cert.dataValidadeIso}
                    </td>
                    <td className="py-3 px-5 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenCertificate(cert)}
                        className="text-xs font-medium text-[#1D4ED8] hover:underline cursor-pointer"
                      >
                        Abrir Frente e Verso
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {vencendoEm30Dias.some((i) => i.diasRestantes < 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4 text-xs text-amber-950">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Existem certificados vencidos que podem bloquear integração em portaria. Use a
              Central de Vencimentos para agendar a reciclagem imediatamente.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('vencimentos')}
            className="font-semibold text-amber-900 underline whitespace-nowrap cursor-pointer"
          >
            Resolver agora
          </button>
        </div>
      )}
    </div>
  );
};
