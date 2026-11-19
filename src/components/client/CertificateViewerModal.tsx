import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Loader2, Printer, QrCode, X } from 'lucide-react';
import type { CertificadoDoc } from '../../types/domain.ts';
import { renderCertificadoFrenteVerso } from '../../services/operationalCrudService.ts';

interface CertificateViewerModalProps {
  certificado: CertificadoDoc | null;
  onClose: () => void;
}

export const CertificateViewerModal: React.FC<CertificateViewerModalProps> = ({
  certificado,
  onClose,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState<{
    html: string;
    colunasVerso: 1 | 2;
    validationUrl: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (!certificado) {
      setRendered(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void renderCertificadoFrenteVerso(certificado)
      .then((res) => {
        if (!cancelled) {
          setRendered({
            html: res.html,
            colunasVerso: res.colunasVerso,
            validationUrl: res.validationUrl,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Não foi possível renderizar o certificado.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [certificado]);

  if (!certificado) return null;

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.focus();
      win.print();
    }
  };

  const handleCopyQr = async () => {
    await navigator.clipboard?.writeText(certificado.codigoValidacaoQr);
    setCopiedCode(true);
    window.setTimeout(() => setCopiedCode(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Cabeçalho do Modal */}
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono font-semibold text-slate-900">
                {certificado.numeroCertificado}
              </span>
              <span>·</span>
              <span>{certificado.nrCodigo}</span>
              {rendered && (
                <>
                  <span>·</span>
                  <span>
                    Verso automático em{' '}
                    <strong className="text-slate-800">
                      {rendered.colunasVerso}{' '}
                      {rendered.colunasVerso === 1 ? 'coluna' : 'colunas'}
                    </strong>{' '}
                    ({certificado.snapshotConteudoLinhas.length} linhas congeladas)
                  </span>
                </>
              )}
            </div>
            <h3 className="text-base font-semibold text-slate-900 truncate mt-0.5">
              {certificado.snapshotColaborador.nome} — {certificado.treinamentoTitulo}
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleCopyQr()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              {copiedCode ? (
                <Check className="w-3.5 h-3.5 text-emerald-700" />
              ) : (
                <QrCode className="w-3.5 h-3.5" />
              )}
              <span className="font-mono">{certificado.codigoValidacaoQr}</span>
              <Copy className="w-3 h-3 text-slate-400" />
            </button>

            <button
              type="button"
              disabled={!rendered}
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium hover:bg-[#1E40AF] cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir / Salvar PDF
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar visualização"
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Corpo com Frente e Verso A4 */}
        <div className="flex-1 bg-slate-100 overflow-hidden relative min-h-[540px]">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-600">
              <Loader2 className="w-6 h-6 animate-spin text-[#1D4ED8]" />
              <span className="text-sm font-medium">
                Montando Frente e Verso A4 com QR Code real...
              </span>
            </div>
          )}

          {error && (
            <div className="p-8 text-center text-sm text-red-700">{error}</div>
          )}

          {rendered && !loading && (
            <iframe
              ref={iframeRef}
              title={`Certificado ${certificado.numeroCertificado}`}
              srcDoc={rendered.html}
              className="w-full h-full min-h-[560px] border-0 bg-slate-100"
            />
          )}
        </div>
      </div>
    </div>
  );
};
