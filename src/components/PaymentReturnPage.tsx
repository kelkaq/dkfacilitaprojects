import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, LoaderCircle, RefreshCw, XCircle } from 'lucide-react';
import { ThemeToggleButton } from './ThemeProvider.tsx';

type OrderStatus = 'CARRINHO' | 'AGUARDANDO_DADOS' | 'AGUARDANDO_CARTAO' | 'AGUARDANDO_PAGAMENTO' |
  'TRIAL_ATIVO' | 'ASSINATURA_ATIVA' | 'PAGAMENTO_RECUSADO' | 'CANCELADO' | 'EXPIRADO';

const SUCCESS = new Set<OrderStatus>(['TRIAL_ATIVO', 'ASSINATURA_ATIVA']);
const FAILURE = new Set<OrderStatus>(['PAGAMENTO_RECUSADO', 'CANCELADO', 'EXPIRADO']);

export const PaymentReturnPage: React.FC = () => {
  const orderId = new URLSearchParams(window.location.search).get('pedido') ?? '';
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refreshStatus = useCallback(async (signal?: AbortSignal): Promise<OrderStatus | null> => {
    if (!orderId) { setError(''); setLoading(false); return null; }
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) { setError('O link de retorno não contém um pedido válido.'); setLoading(false); return null; }
    setError('');
    try {
      const response = await fetch(`/api/public/orders/${encodeURIComponent(orderId)}/status`, { signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || 'Não foi possível consultar a confirmação do pagamento.');
      }
      const body = await response.json() as { status: OrderStatus };
      setStatus(body.status);
      return body.status;
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Consulta indisponível.');
      return null;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      if (!orderId) { setLoading(false); return; }
      for (let attempt = 0; attempt < 5 && !cancelled; attempt += 1) {
        const currentStatus = await refreshStatus(controller.signal);
        if (controller.signal.aborted || !currentStatus || SUCCESS.has(currentStatus) || FAILURE.has(currentStatus)) break;
        if (attempt < 4) await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [refreshStatus]);

  const succeeded = status ? SUCCESS.has(status) : false;
  const failed = status ? FAILURE.has(status) : false;

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10 text-slate-900 dark:bg-[#070b14] dark:text-white">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-[#101827] sm:p-9">
        <header className="mb-8 flex items-center justify-between"><a href="/" className="text-sm font-bold">DK Facilita <span className="text-blue-600 dark:text-blue-400">· CSDK</span></a><ThemeToggleButton /></header>
        <div className={`mb-5 grid h-14 w-14 place-items-center rounded-full ${succeeded ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : failed ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' : 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'}`}>
          {loading ? <LoaderCircle className="h-7 w-7 animate-spin" /> : succeeded ? <CheckCircle2 className="h-7 w-7" /> : failed ? <XCircle className="h-7 w-7" /> : <RefreshCw className="h-7 w-7" />}
        </div>
        <h1 className="text-2xl font-bold">{loading ? 'Conferindo pagamento' : succeeded ? 'Assinatura confirmada' : failed ? 'Pagamento não concluído' : 'Aguardando confirmação'}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          {error ? error : succeeded
            ? 'O Mercado Pago confirmou a assinatura. O link seguro de primeiro acesso será enviado ao e-mail informado para você definir a senha.'
            : failed
              ? 'Não recebemos uma confirmação de pagamento para este pedido. Você pode voltar ao site e tentar novamente.'
          : !orderId
            ? 'O Mercado Pago está confirmando sua assinatura. Quando a confirmação chegar, enviaremos ao e-mail informado um link seguro para criar sua senha. O acesso só será liberado depois da confirmação.'
            : 'O Mercado Pago ainda está confirmando o pagamento. Esta página atualiza o status automaticamente; o acesso só será liberado depois da confirmação.'}
        </p>
        {status && !succeeded && !failed && <button type="button" onClick={() => { setLoading(true); void refreshStatus(); }} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold dark:border-white/10"><RefreshCw className="h-4 w-4" /> Consultar novamente</button>}
        <div className="mt-8 flex flex-wrap gap-3"><a href="/acesso" className="rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800">Ir para o acesso</a><a href="/" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold dark:border-white/10">Voltar ao site</a></div>
      </section>
    </main>
  );
};
