import React, { useState } from 'react';
import { ArrowLeft, LogIn, ShieldCheck } from 'lucide-react';

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
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-[1120px] mx-auto flex items-center justify-between">
          <button
            type="button"
            onClick={onBackToSite}
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar para dkfacilita.com
          </button>
          <span className="text-sm font-bold text-slate-900">DK Facilita</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 space-y-6">
          <div>
            <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h1 className="mt-4 text-xl font-bold text-slate-900">
              Entrar no Certifica Software - DK
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Acesse o painel da sua empresa ou o Painel Super Admin com isolamento multiempresa.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 text-xs text-red-900">
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={() => void handleGoogleClick()}
            className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-3 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" />
            {loading ? 'Autenticando...' : 'Continuar com Conta Google'}
          </button>

          <div className="pt-4 border-t border-slate-100 text-center space-y-2">
            <p className="text-xs text-slate-500">Ainda não tem conta da sua empresa?</p>
            <button
              type="button"
              onClick={onGoTrialCheckout}
              className="text-xs font-semibold text-[#1D4ED8] hover:underline cursor-pointer"
            >
              Criar conta com Teste Grátis de 7 Dias
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
