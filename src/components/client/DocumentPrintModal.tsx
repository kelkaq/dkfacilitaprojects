import React, { useRef, useState } from 'react';
import { Check, Copy, Loader2, Printer, X } from 'lucide-react';

export interface VectorDocumentRequest {
  title: string;
  subtitle?: string;
  code?: string;
  html: string;
}

interface DocumentPrintModalProps {
  document: VectorDocumentRequest | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
}

export const DocumentPrintModal: React.FC<DocumentPrintModalProps> = ({
  document,
  loading = false,
  error = null,
  onClose,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [copied, setCopied] = useState(false);

  if (!document && !loading && !error) return null;

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.focus();
      win.print();
    }
  };

  const handleCopy = async () => {
    if (!document?.code) return;
    await navigator.clipboard?.writeText(document.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#0B1120] rounded-2xl border border-slate-200 dark:border-white/15 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white truncate">
              {document?.title || 'Preparando documento vetorial...'}
            </h3>
            {document?.subtitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {document.subtitle} · Fundo branco vetorial para impressão A4
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {document?.code && (
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/15 text-xs font-mono font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copiado' : document.code}</span>
              </button>
            )}

            <button
              type="button"
              disabled={loading || !document?.html}
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir / Salvar PDF
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar documento"
              className="p-2 rounded-lg border border-slate-200 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Área do Papel: SEMPRE fundo branco/neutro claro para fidelidade de impressão */}
        <div className="flex-1 bg-slate-200 overflow-hidden relative min-h-[560px] dk-paper-surface">
          {loading && (
            <div className="absolute inset-0 bg-white flex flex-col items-center justify-center gap-2 text-slate-700">
              <Loader2 className="w-6 h-6 animate-spin text-[#1D4ED8]" />
              <span className="text-sm font-medium">
                Gerando documento vetorial de alta nitidez...
              </span>
            </div>
          )}

          {error && !loading && (
            <div className="p-8 bg-white text-center text-sm text-red-700">{error}</div>
          )}

          {document?.html && !loading && (
            <iframe
              ref={iframeRef}
              title={document.title}
              srcDoc={document.html}
              className="w-full h-full min-h-[560px] border-0 bg-slate-200"
            />
          )}
        </div>
      </div>
    </div>
  );
};
