import React, { useEffect, useState } from 'react';
import { ArrowLeft, FileBadge, FileText, Loader2, Printer, ShieldCheck, XCircle } from 'lucide-react';
import type { DossiePublicoDoc } from '../../types/domain.ts';
import { getPublicDossieByToken } from '../../services/operationalCrudService.ts';

interface PublicDossierViewProps {
  token: string;
  onExit?: () => void;
}

export const PublicDossierView: React.FC<PublicDossierViewProps> = ({ token, onExit }) => {
  const [dossie, setDossie] = useState<DossiePublicoDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void getPublicDossieByToken(token)
      .then((doc) => {
        if (!active) return;
        if (!doc) {
          setError('Dossiê não encontrado.');
        } else if (new Date(doc.expiraEmIso).getTime() < Date.now()) {
          setError('Este link temporário de auditoria expirou.');
        } else {
          setDossie(doc);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Erro ao consultar dossiê.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <header className="bg-white border-b border-slate-200 px-6 py-4 print:hidden">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-700" />
            <div>
              <p className="text-sm font-bold text-slate-900">Dossiê Unificado de Auditoria</p>
              <p className="text-xs text-slate-500 font-mono">Token: {token}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {dossie && (
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium hover:bg-[#1E40AF] cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir / PDF
              </button>
            )}
            {onExit && (
              <button
                type="button"
                onClick={onExit}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Voltar ao Painel
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {loading && (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#1D4ED8] mx-auto" />
            <p className="text-sm text-slate-600 mt-2">Validando link temporário do dossiê...</p>
          </div>
        )}

        {error && !loading && (
          <div className="bg-white border border-red-200 rounded-xl p-10 text-center space-y-2">
            <XCircle className="w-8 h-8 text-red-600 mx-auto" />
            <h1 className="text-base font-semibold text-slate-900">{error}</h1>
          </div>
        )}

        {dossie && !loading && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500">{dossie.empresaRazaoSocial}</p>
                <h1 className="text-xl font-bold text-slate-900 mt-0.5">
                  {dossie.colaboradorNome}
                </h1>
                <p className="text-xs text-slate-600 mt-1">
                  Função: <strong className="text-slate-900">{dossie.colaboradorFuncao}</strong> ·
                  CPF: <span className="font-mono">{dossie.colaboradorCpfMascarado}</span>
                </p>
              </div>
              <div className="text-xs text-slate-500 sm:text-right">
                <p>Link válido até</p>
                <p className="font-mono font-semibold text-slate-900">
                  {new Date(dossie.expiraEmIso).toLocaleString('pt-BR')}
                </p>
              </div>
            </div>

            {/* Certificados */}
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
                <FileBadge className="w-4 h-4 text-[#1D4ED8]" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Certificados Emitidos ({dossie.certificados.length})
                </h2>
              </div>
              {dossie.certificados.length === 0 ? (
                <p className="p-6 text-xs text-slate-500">Nenhum certificado emitido até o momento.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <th className="py-3 px-4">NR</th>
                        <th className="py-3 px-4">Treinamento</th>
                        <th className="py-3 px-4">CH</th>
                        <th className="py-3 px-4">Realização</th>
                        <th className="py-3 px-4">Validade</th>
                        <th className="py-3 px-4">QR Validação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dossie.certificados.map((c) => (
                        <tr key={c.codigoValidacaoQr}>
                          <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                            {c.nrCodigo}
                          </td>
                          <td className="py-3 px-4 text-slate-800">{c.treinamentoTitulo}</td>
                          <td className="py-3 px-4 font-mono">{c.cargaHorariaHoras}h</td>
                          <td className="py-3 px-4 font-mono">{c.dataRealizacaoIso}</td>
                          <td className="py-3 px-4 font-mono">{c.dataValidadeIso}</td>
                          <td className="py-3 px-4 font-mono text-[#1D4ED8]">
                            {c.codigoValidacaoQr}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Cartas de Anuência */}
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-700" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Cartas de Anuência ({dossie.cartasAnuencia.length})
                </h2>
              </div>
              {dossie.cartasAnuencia.length === 0 ? (
                <p className="p-6 text-xs text-slate-500">Nenhuma carta de anuência vinculada.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {dossie.cartasAnuencia.map((ca, idx) => (
                    <div key={idx} className="px-6 py-3.5 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-semibold text-slate-900">{ca.titulo}</p>
                        <p className="text-slate-500 mt-0.5">Referência: {ca.nrReferencia}</p>
                      </div>
                      <span className="font-mono text-slate-700">Validade: {ca.validadeIso}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
};
