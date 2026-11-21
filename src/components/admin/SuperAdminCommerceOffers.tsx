import React, { useCallback, useEffect, useState } from 'react';
import { Check, CircleOff, LoaderCircle, Plus, RefreshCw } from 'lucide-react';
import { platformAdminFetch } from '../../services/platformNotificationService.ts';
import type { PlanoCatalogo } from '../../data/globalCatalogSeed.ts';

type Cycle = 'MENSAL' | 'SEMESTRAL' | 'ANUAL';
interface CommercePlan {
  id: string; slug: string; nome: string; subtitulo: string; descricao: string;
  precoMensalCentavos: number; descontoSemestral: number; descontoAnual: number;
  limiteUsuarios: number; limiteColaboradores: number; ativo: boolean;
}
interface CommerceOffer {
  id: string; planoId: string; planoSlug: string; planoNome: string; ciclo: Cycle;
  ambiente: 'TEST' | 'PRODUCTION'; trialDias: number; totalCentavos: number;
  mercadoPagoPlanId: string; ativa: boolean; precoAtualCentavos: number;
}
interface CommerceState { environment: 'TEST' | 'PRODUCTION' | null; plans: CommercePlan[]; offers: CommerceOffer[] }

const CYCLES: { value: Cycle; label: string }[] = [
  { value: 'MENSAL', label: 'Mensal' }, { value: 'SEMESTRAL', label: 'Semestral' }, { value: 'ANUAL', label: 'Anual' },
];
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-900 dark:text-white';

export const SuperAdminCommerceOffers: React.FC<{ catalogPlans: PlanoCatalogo[] }> = ({ catalogPlans }) => {
  const [data, setData] = useState<CommerceState>({ environment: null, plans: [], offers: [] });
  const [selectedPlan, setSelectedPlan] = useState('');
  const [cycle, setCycle] = useState<Cycle>('MENSAL');
  const [trialDays, setTrialDays] = useState<0 | 7>(7);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await platformAdminFetch<CommerceState>('/api/admin/commerce');
      setData(next);
      setSelectedPlan((current) => current || next.plans.find((plan) => plan.ativo)?.id || '');
      setMessage('');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar as ofertas.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const createOffer = async () => {
    if (!data.environment || !selectedPlan) return;
    setBusy(true); setMessage('');
    try {
      await platformAdminFetch('/api/admin/commerce/offers', { method: 'POST', body: JSON.stringify({
        planoId: selectedPlan, ciclo: cycle, trialDias: trialDays, ambiente: data.environment,
      }) });
      setMessage('Oferta preparada no Mercado Pago e mantida inativa. Confira o valor e ative quando estiver pronta para venda.');
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível preparar a oferta.'); }
    finally { setBusy(false); }
  };

  const setOfferActive = async (offer: CommerceOffer, ativa: boolean) => {
    setBusy(true); setMessage('');
    try {
      await platformAdminFetch(`/api/admin/commerce/offers/${encodeURIComponent(offer.id)}`, {
        method: 'PATCH', body: JSON.stringify({ ativa }),
      });
      setMessage(ativa ? 'Oferta ativada para novas compras.' : 'Oferta desativada para novas compras.');
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar a oferta.'); }
    finally { setBusy(false); }
  };

  const planMap = new Map(data.plans.map((plan) => [plan.id, plan]));
  const localBySlug = new Map(catalogPlans.map((plan) => [plan.slug, plan]));
  const visiblePlans = data.plans.filter((plan) => plan.ativo);

  return <section className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-bold text-slate-900 dark:text-white">Planos disponíveis para compra</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">Prepare os valores recorrentes e o período de teste. Cada oferta é conferida com o plano cadastrado no Mercado Pago antes de poder ser ativada.</p></div>
      <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 dark:border-white/10 dark:text-slate-200"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar</button>
    </div>

    <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03] md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
      <label className="text-sm font-medium">Plano<select className={inputClass} value={selectedPlan} onChange={(event) => setSelectedPlan(event.target.value)}>
        <option value="">Selecione um plano</option>{visiblePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.nome} — {money(plan.precoMensalCentavos)}/mês</option>)}
      </select></label>
      <label className="text-sm font-medium">Período de cobrança<select className={inputClass} value={cycle} onChange={(event) => setCycle(event.target.value as Cycle)}>{CYCLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="text-sm font-medium">Início da assinatura<select className={inputClass} value={trialDays} onChange={(event) => setTrialDays(Number(event.target.value) as 0 | 7)}><option value={7}>7 dias para testar</option><option value={0}>Cobrança imediata</option></select></label>
      <button type="button" onClick={() => void createOffer()} disabled={busy || loading || !selectedPlan || !data.environment} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" /> Preparar oferta</button>
      <p className="text-xs text-slate-500 md:col-span-4">Ambiente conectado: <strong>{data.environment === 'PRODUCTION' ? 'Produção' : data.environment === 'TEST' ? 'Testes' : 'indisponível'}</strong>. Uma oferta nova começa desativada e não inicia cobranças por si só.</p>
    </div>

    {message && <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-100">{message}</p>}

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
      <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10"><h3 className="font-semibold text-slate-900 dark:text-white">Ofertas configuradas</h3><p className="mt-1 text-xs text-slate-500">As ofertas de teste e de produção são separadas.</p></div>
      {loading ? <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Carregando planos...</div> : data.offers.length === 0 ? <p className="p-6 text-sm text-slate-500">Ainda não há ofertas preparadas.</p> : <div className="divide-y divide-slate-100 dark:divide-white/10">
        {data.offers.map((offer) => {
          const plan = planMap.get(offer.planoId);
          const stale = !plan?.ativo || offer.totalCentavos !== offer.precoAtualCentavos;
          const syncedCopy = localBySlug.get(offer.planoSlug);
          return <div key={offer.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900 dark:text-white">{offer.planoNome}</p><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${offer.ativa ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>{offer.ativa ? 'Ativa' : 'Inativa'}</span><span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-400/10 dark:text-blue-200">{offer.ambiente === 'TEST' ? 'Teste' : 'Produção'}</span></div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{CYCLES.find((item) => item.value === offer.ciclo)?.label} · {offer.trialDias ? `${offer.trialDias} dias de teste` : 'sem teste'} · {money(offer.totalCentavos)} por período</p>
              {stale && <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">O preço ou a disponibilidade deste plano mudou. Prepare uma nova oferta para voltar a vendê-lo.</p>}
              {!syncedCopy && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Este plano não está no catálogo exibido no site.</p>}
            </div>
            <button type="button" disabled={busy || (!offer.ativa && (stale || !syncedCopy))} onClick={() => void setOfferActive(offer, !offer.ativa)} className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${offer.ativa ? 'border border-slate-200 text-slate-700 dark:border-white/10 dark:text-slate-200' : 'bg-emerald-700 text-white'}`}>
              {offer.ativa ? <><CircleOff className="h-4 w-4" /> Desativar</> : <><Check className="h-4 w-4" /> Ativar para venda</>}
            </button>
          </div>;
        })}
      </div>}
    </div>
  </section>;
};
