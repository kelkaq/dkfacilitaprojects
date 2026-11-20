import React, { useState } from 'react';
import { ArrowLeft, LogIn, ShieldCheck } from 'lucide-react';
import { ThemeToggleButton } from './ThemeProvider.tsx';

interface LoginViewProps {
  onLoginGoogle: () => Promise<void>;
  onBackToSite: () => void;
  onGoTrialCheckout: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginGoogle,
  onBackToSite,
  onGoTrialCheckout,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      await onLoginGoogle();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível autenticar sua conta.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen dk-ambient-canvas flex flex-col">
      <header className="bg-white/80 dark:bg-[#060913]/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/10 px-6 py-4">
        <div className="max-w-[1120px] mx-auto flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBackToSite}
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar para dkfacilita.com
          </button>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-slate-900 dark:text-white">DK Facilita</span>
            <ThemeToggleButton compact />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md dk-glass-card rounded-2xl p-8 space-y-6">
          <div>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#1D4ED8] to-[#3B82F6] text-white flex items-center justify-center shadow-lg shadow-blue-600/25">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">
              Entrar no Certifica Software - DK
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Acesse o painel exclusivo da sua empresa com isolamento multiempresa e autenticação
              segura.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl px-3.5 py-2.5 text-xs text-red-900 dark:text-red-200">
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={() => void handleGoogleClick()}
            className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-gradient-to-r from-[#1D4ED8] to-[#2563EB] text-white text-sm font-semibold hover:from-[#1E40AF] hover:to-[#1D4ED8] transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-blue-600/25"
          >
            <LogIn className="w-4 h-4" />
            {loading ? 'Autenticando...' : 'Continuar com Conta Google'}
          </button>

          <div className="pt-4 border-t border-slate-200/80 dark:border-white/10 text-center space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ainda não tem conta da sua empresa?
            </p>
            <button
              type="button"
              onClick={onGoTrialCheckout}
              className="text-xs font-semibold text-[#1D4ED8] dark:text-blue-400 hover:underline cursor-pointer"
            >
              Criar conta com Teste Grátis de 7 Dias
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
