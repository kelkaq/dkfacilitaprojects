import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  Copy,
  Eye,
  FileBadge,
  Info,
  PenLine,
  Plus,
  QrCode,
  RefreshCw,
  Search,
} from 'lucide-react';
import type {
  AssinaturaDigitalDoc,
  CertificadoDoc,
  ColaboradorDoc,
  EmpresaDoc,
  TreinamentoEmpresaDoc,
  TurmaDoc,
} from '../../types/domain.ts';
import { issueCertificadoImutavel } from '../../services/operationalCrudService.ts';

interface CertificadosVencimentosModuleProps {
  mode: 'certificados' | 'vencimentos';
  empresa: EmpresaDoc;
  certificados: CertificadoDoc[];
  turmas: TurmaDoc[];
  treinamentos: TreinamentoEmpresaDoc[];
  colaboradores: ColaboradorDoc[];
  assinaturas: AssinaturaDigitalDoc[];
  onRefresh: () => Promise<void>;
  onOpenCertificate: (cert: CertificadoDoc, hideCollaboratorSig?: boolean) => void;
  onOpenCertificateDetails: (cert: CertificadoDoc) => void;
  onScheduleRecycling: (cert: CertificadoDoc) => void;
}

type ExpiryBucket = 'ALL' | 'EXPIRED' | '1D' | '7D' | '15D' | '30D' | '60D';

function diffDaysFromToday(isoDate: string): number {
  const target = new Date(`${isoDate.slice(0, 10)}T23:59:59`).getTime();
  return Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24));
}

export const CertificadosVencimentosModule: React.FC<CertificadosVencimentosModuleProps> = ({
  mode,
  empresa,
  certificados,
  turmas,
  treinamentos,
  colaboradores,
  assinaturas,
  onRefresh,
  onOpenCertificate,
  onOpenCertificateDetails,
  onScheduleRecycling,
}) => {
  const [search, setSearch] = useState('');
  const [bucket, setBucket] = useState<ExpiryBucket>('ALL');
  const [copiedQr, setCopiedQr] = useState<string | null>(null);

  const [showQuickEmit, setShowQuickEmit] = useState(false);
  const [emitTurmaId, setEmitTurmaId] = useState(turmas[0]?.id ?? '');
  const [emitColabId, setEmitColabId] = useState(colaboradores[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const enriched = useMemo(() => {
    return certificados
      .filter((c) => c.status === 'EMITIDO')
      .map((cert) => ({
        cert,
        diasRestantes: diffDaysFromToday(cert.dataValidadeIso),
      }))
      .sort((a, b) => a.diasRestantes - b.diasRestantes);
  }, [certificados]);

  const bucketCounts = useMemo(() => {
    return {
      ALL: enriched.length,
      EXPIRED: enriched.filter((i) => i.diasRestantes < 0).length,
      '1D': enriched.filter((i) => i.diasRestantes >= 0 && i.diasRestantes <= 1).length,
      '7D': enriched.filter((i) => i.diasRestantes >= 0 && i.diasRestantes <= 7).length,
      '15D': enriched.filter((i) => i.diasRestantes >= 0 && i.diasRestantes <= 15).length,
      '30D': enriched.filter((i) => i.diasRestantes >= 0 && i.diasRestantes <= 30).length,
      '60D': enriched.filter((i) => i.diasRestantes >= 0 && i.diasRestantes <= 60).length,
    };
  }, [enriched]);

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter(({ cert, diasRestantes }) => {
      if (mode === 'vencimentos') {
        if (bucket === 'EXPIRED' && diasRestantes >= 0) return false;
        if (bucket === '1D' && (diasRestantes < 0 || diasRestantes > 1)) return false;
        if (bucket === '7D' && (diasRestantes < 0 || diasRestantes > 7)) return false;
        if (bucket === '15D' && (diasRestantes < 0 || diasRestantes > 15)) return false;
        if (bucket === '30D' && (diasRestantes < 0 || diasRestantes > 30)) return false;
        if (bucket === '60D' && (diasRestantes < 0 || diasRestantes > 60)) return false;
      }
      if (!q) return true;
      return (
        cert.snapshotColaborador.nome.toLowerCase().includes(q) ||
        cert.nrCodigo.toLowerCase().includes(q) ||
        cert.numeroCertificado.toLowerCase().includes(q) ||
        cert.codigoValidacaoQr.toLowerCase().includes(q) ||
        (cert.contratoObraNome || '').toLowerCase().includes(q)
      );
    });
  }, [enriched, mode, bucket, search]);

  const handleQuickEmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const turma = turmas.find((t) => t.id === emitTurmaId) ?? turmas[0];
    const colab = colaboradores.find((c) => c.id === emitColabId) ?? colaboradores[0];
    const treino = turma ? treinamentos.find((tr) => tr.id === turma.treinamentoId) : null;

    if (!turma || !colab || !treino) {
      setFeedback({
        type: 'err',
        text: 'Certifique-se de ter ao menos uma Turma e um Colaborador cadastrados.',
      });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const sigInstrutor = assinaturas.find((a) => a.tipo === 'INSTRUTOR' && a.ativa);
      const sigRt = assinaturas.find((a) => a.tipo === 'RT' && a.ativa);

      const cert = await issueCertificadoImutavel({
        empresa,
        turma,
        treinamento: treino,
        colaborador: colab,
        instrutorAssinaturaUrl: sigInstrutor?.imagemDataUrl || null,
        rtAssinaturaUrl: sigRt?.imagemDataUrl || null,
      });
      await onRefresh();
      setShowQuickEmit(false);
      setFeedback({
        type: 'ok',
        text: `Certificado ${cert.numeroCertificado} emitido com sucesso.`,
      });
      onOpenCertificate(cert, false);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao emitir certificado.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {mode === 'certificados'
              ? 'Certificados Emitidos (Frente e Verso Vetorial + QR Code)'
              : 'Central de Vencimentos e Reciclagens'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {mode === 'certificados'
              ? 'Identidade visual dinâmica da empresa, snapshot imutável, carta de anuência vinculada e pacote de auditoria.'
              : 'Filtre treinamentos por janela de vencimento (60, 30, 15, 7, 1 dia e vencidos) e agende a reciclagem em 1 clique.'}
          </p>
        </div>

        {mode === 'certificados' && (
          <button
            type="button"
            onClick={() => setShowQuickEmit((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-medium transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Emitir Certificado
          </button>
        )}
      </div>

      {feedback && (
        <div
          className={`rounded-xl px-4 py-3 text-xs border flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-900 dark:text-red-200'
          }`}
        >
          {feedback.type === 'ok' && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {showQuickEmit && mode === 'certificados' && (
        <form onSubmit={handleQuickEmit} className="dk-glass-card rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Emissão Direta de Certificado com Snapshot Imutável
            </h3>
            <button
              type="button"
              onClick={() => setShowQuickEmit(false)}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Cancelar
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                Turma
              </label>
              <select
                required
                value={emitTurmaId}
                onChange={(e) => setEmitTurmaId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100"
              >
                {turmas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.codigoTurma} — {t.titulo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                Colaborador
              </label>
              <select
                required
                value={emitColabId}
                onChange={(e) => setEmitColabId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100"
              >
                {colaboradores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} ({c.cpf})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-[#1D4ED8] cursor-pointer disabled:opacity-50"
            >
              {busy ? 'Emitindo...' : 'Emitir e Abrir PDF'}
            </button>
          </div>
        </form>
      )}

      {/* Filtros da Central de Vencimentos */}
      {mode === 'vencimentos' && (
        <div className="flex flex-wrap items-center gap-1.5 dk-glass-card rounded-xl p-2">
          {(
            [
              { id: 'ALL', label: 'Todos' },
              { id: 'EXPIRED', label: 'Vencidos' },
              { id: '1D', label: '1 dia' },
              { id: '7D', label: '7 dias' },
              { id: '15D', label: '15 dias' },
              { id: '30D', label: '30 dias' },
              { id: '60D', label: '60 dias' },
            ] as const
          ).map((f) => {
            const active = bucket === f.id;
            const count = bucketCounts[f.id];
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setBucket(f.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#2563EB] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'
                }`}
              >
                <span>{f.label}</span>
                <span
                  className={`font-mono text-[11px] ${
                    active
                      ? 'text-blue-100'
                      : f.id === 'EXPIRED' && count > 0
                        ? 'text-red-600 dark:text-red-400 font-bold'
                        : 'text-slate-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Tabela Principal */}
      <div className="dk-glass-card rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por colaborador, NR, número ou QR..."
              className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
            {filteredList.length} registro(s)
          </span>
        </div>

        {filteredList.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            {mode === 'vencimentos' ? (
              <CalendarClock className="w-6 h-6 text-slate-400 mx-auto" />
            ) : (
              <FileBadge className="w-6 h-6 text-slate-400 mx-auto" />
            )}
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {mode === 'vencimentos'
                ? 'Nenhum certificado encontrado nesta janela de vencimento'
                : 'Nenhum certificado emitido ainda'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Número / QR</th>
                  <th className="py-3 px-4">Colaborador</th>
                  <th className="py-3 px-4">NR / Treinamento</th>
                  <th className="py-3 px-4">Obra</th>
                  <th className="py-3 px-4">Validade</th>
                  <th className="py-3 px-4">Prazo</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredList.map(({ cert, diasRestantes }) => {
                  const vencido = diasRestantes < 0;
                  const vencendo = !vencido && diasRestantes <= 30;
                  return (
                    <tr
                      key={cert.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-white/[0.03] transition-colors"
                    >
                      <td className="py-3 px-4">
                        <p className="font-mono font-semibold text-slate-900 dark:text-white">
                          {cert.numeroCertificado}
                        </p>
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard?.writeText(cert.codigoValidacaoQr);
                            setCopiedQr(cert.codigoValidacaoQr);
                            window.setTimeout(() => setCopiedQr(null), 1600);
                          }}
                          className="inline-flex items-center gap-1 font-mono text-[11px] text-[#2563EB] dark:text-blue-400 hover:underline mt-0.5 cursor-pointer"
                        >
                          <QrCode className="w-3 h-3" />
                          {copiedQr === cert.codigoValidacaoQr
                            ? 'Copiado!'
                            : cert.codigoValidacaoQr}
                          <Copy className="w-2.5 h-2.5 opacity-60" />
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {cert.snapshotColaborador.nome}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {cert.snapshotColaborador.funcao}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          <span className="font-mono font-bold mr-1 text-[#2563EB] dark:text-blue-400">
                            {cert.nrCodigo}
                          </span>
                          ({cert.cargaHorariaHoras}h)
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 max-w-[210px]">
                          {cert.treinamentoTitulo}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {cert.contratoObraNome || 'Geral'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                        {cert.dataValidadeIso}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold">
                        <span
                          className={`inline-flex items-center gap-1.5 ${
                            vencido
                              ? 'text-red-600 dark:text-red-400'
                              : vencendo
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {vencendo && (
                            <span className="dk-live-dot bg-amber-500 shadow-[0_0_8px_#F59E0B]" />
                          )}
                          {vencido
                            ? `Vencido (${Math.abs(diasRestantes)}d)`
                            : `${diasRestantes} dias`}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenCertificateDetails(cert)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[0.04] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 cursor-pointer"
                          >
                            <Info className="w-3.5 h-3.5 text-[#3B82F6]" />
                            Detalhes
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenCertificate(cert, false)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-medium cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Visualizar
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenCertificate(cert, true)}
                            title="Imprimir sem assinatura do colaborador (Assinatura física)"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-500/20 cursor-pointer"
                          >
                            <PenLine className="w-3.5 h-3.5" />
                            Assinatura física
                          </button>
                          {mode === 'vencimentos' && (
                            <button
                              type="button"
                              onClick={() => onScheduleRecycling(cert)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 cursor-pointer"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Reciclar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
