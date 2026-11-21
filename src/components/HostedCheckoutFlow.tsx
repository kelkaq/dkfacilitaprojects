import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, CreditCard, LoaderCircle, ShieldCheck, ShoppingCart } from 'lucide-react';
import type { CheckoutSelection } from './LandingPage.tsx';
import { fetchPublicOffers, type PublicOffer } from '../services/orderService.ts';
import { ThemeToggleButton } from './ThemeProvider.tsx';

interface HostedCheckoutFlowProps {
  initialSelection: CheckoutSelection;
  onBackToSite: () => void;
}

type HolderType = 'PF' | 'PJ';
type CheckoutStep = 1 | 2 | 3;

function money(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
}

function maskDocument(value: string, type: HolderType): string {
  const digits = value.replace(/\D/g, '').slice(0, type === 'PF' ? 11 : 14);
  if (type === 'PF') {
    if (digits.length > 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    if (digits.length > 6) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    if (digits.length > 3) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    return digits;
  }
  if (digits.length > 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  if (digits.length > 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  if (digits.length > 5) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return digits;
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function offerKey(offer: PublicOffer): string {
  return `${offer.planoSlug}:${offer.ciclo}:${offer.modoInicio}`;
}

async function responseError(response: Response): Promise<string> {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error || 'Não foi possível continuar. Tente novamente.';
}

export const HostedCheckoutFlow: React.FC<HostedCheckoutFlowProps> = ({ initialSelection, onBackToSite }) => {
  const [step, setStep] = useState<CheckoutStep>(1);
  const [offers, setOffers] = useState<PublicOffer[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [selectedKey, setSelectedKey] = useState('');
  const [acceptBaseOnly, setAcceptBaseOnly] = useState(false);
  const [offerError, setOfferError] = useState('');
  const [holderType, setHolderType] = useState<HolderType>('PJ');
  const [document, setDocument] = useState('');
  const [holderName, setHolderName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [orderId, setOrderId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const idempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    const controller = new AbortController();
    void fetchPublicOffers(controller.signal)
      .then((valid) => {
        setOffers(valid);
        const requested = `${initialSelection.planoSlug}:${initialSelection.ciclo}:${initialSelection.modoInicio}`;
        setSelectedKey(valid.some((offer) => offerKey(offer) === requested) ? requested : '');
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setOfferError(cause instanceof Error ? cause.message : 'Catálogo indisponível.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingOffers(false); });
    return () => controller.abort();
  }, [initialSelection.ciclo, initialSelection.modoInicio, initialSelection.planoSlug]);

  const selectedOffer = useMemo(() => offers.find((offer) => offerKey(offer) === selectedKey) ?? null, [offers, selectedKey]);
  const hasUnsupportedOptions = initialSelection.adicionaisSlugs.length > 0 || Boolean(initialSelection.cupomCodigo?.trim());

  const continueToDetails = () => {
    setError('');
    if (!selectedOffer) { setError('Escolha uma oferta disponível para continuar.'); return; }
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const continueToPayment = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const digits = document.replace(/\D/g, '');
    if (digits.length !== (holderType === 'PF' ? 11 : 14)) {
      setError(holderType === 'PF' ? 'Informe um CPF com 11 dígitos.' : 'Informe um CNPJ com 14 dígitos.');
      return;
    }
    if (holderName.trim().length < 3 || adminName.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Confira o nome do titular, responsável e e-mail.');
      return;
    }
    if (whatsapp.replace(/\D/g, '').length < 10) { setError('Informe um WhatsApp com DDD.'); return; }
    setStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const beginPayment = async () => {
    if (!selectedOffer) return;
    setSubmitting(true);
    setError('');
    try {
      let currentOrderId = orderId;
      if (!currentOrderId) {
        const created = await fetch('/api/public/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': idempotencyKey.current },
          body: JSON.stringify({
            tipoDocumento: holderType,
            documento: document,
            emailComprador: email.trim().toLowerCase(),
            razaoSocial: holderName.trim(),
            nomeAdministrador: adminName.trim(),
            whatsapp: whatsapp.replace(/\D/g, ''),
            planoSlug: selectedOffer.planoSlug,
            ciclo: selectedOffer.ciclo,
            modoInicio: selectedOffer.modoInicio,
          }),
        });
        if (!created.ok) throw new Error(await responseError(created));
        const payload = await created.json() as { id: string };
        currentOrderId = payload.id;
        setOrderId(payload.id);
      }

      const checkout = await fetch(`/api/public/orders/${encodeURIComponent(currentOrderId)}/checkout`, { method: 'POST' });
      if (!checkout.ok) throw new Error(await responseError(checkout));
      const payload = await checkout.json() as { checkoutUrl?: string; processing?: boolean };
      if (!payload.checkoutUrl || !/^https:\/\/(www\.)?mercadopago\.com(\.br|\.ar)?\//.test(payload.checkoutUrl)) {
        throw new Error(payload.processing
          ? 'O Mercado Pago está preparando o pagamento. Aguarde alguns segundos e tente novamente.'
          : 'Não recebemos um link de pagamento seguro. Tente novamente.');
      }
      window.sessionStorage.setItem('csdk:pending-order', currentOrderId);
      window.location.assign(payload.checkoutUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o pagamento. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const stepLabels = ['Carrinho', 'Seus dados', 'Pagamento'];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 dark:bg-[#070b14] dark:text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex items-center justify-between">
          <button type="button" onClick={onBackToSite} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-700 dark:text-slate-300 dark:hover:text-blue-300">
            <ArrowLeft className="h-4 w-4" /> Voltar ao site
          </button>
          <div className="flex items-center gap-3"><span className="text-sm font-bold tracking-tight">DK Facilita <span className="text-blue-600 dark:text-blue-400">· CSDK</span></span><ThemeToggleButton /></div>
        </header>

        <div className="mb-8 grid grid-cols-3 gap-2" aria-label="Etapas da compra">
          {stepLabels.map((label, index) => {
            const number = index + 1;
            const complete = step > number;
            const active = step === number;
            return <div key={label} className={`flex items-center gap-2 border-b-2 pb-3 text-xs font-semibold sm:text-sm ${active || complete ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300' : 'border-slate-200 text-slate-400 dark:border-white/10'}`}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${active || complete ? 'bg-blue-600 text-white dark:bg-blue-500' : 'bg-slate-200 text-slate-500 dark:bg-white/10'}`}>{complete ? <CheckCircle2 className="h-4 w-4" /> : number}</span><span>{label}</span>
            </div>;
          })}
        </div>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#101827] sm:p-7">
            {step === 1 && <>
              <div className="mb-6 flex items-start gap-3"><span className="rounded-xl bg-blue-50 p-2.5 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><ShoppingCart className="h-5 w-5" /></span><div><h1 className="text-xl font-bold">Revise seu plano</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Selecione uma oferta ativa para esta compra.</p></div></div>
          {loadingOffers ? <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Carregando planos...</div> : offers.length === 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">{offerError || 'Não há planos disponíveis para compra neste momento. Volte em breve.'}</div> : <label className="block text-sm font-semibold">Plano, período e forma de início
                <select value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-[#0b1220]">
                  <option value="">Escolha uma oferta</option>
                  {offers.map((offer) => <option key={offerKey(offer)} value={offerKey(offer)}>{offer.planoNome} · {offer.ciclo.toLowerCase()} · {offer.modoInicio === 'TRIAL' ? `${offer.trialDias} dias grátis` : 'início imediato'}</option>)}
                </select>
              </label>}
              {selectedOffer && <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm dark:border-blue-400/20 dark:bg-blue-500/5"><p className="font-bold">{selectedOffer.planoNome}</p><p className="mt-1 text-slate-600 dark:text-slate-300">Até {selectedOffer.limiteUsuarios} usuários e {selectedOffer.limiteColaboradores} colaboradores.</p><p className="mt-3 font-semibold text-blue-800 dark:text-blue-300">{selectedOffer.trialDias ? `${selectedOffer.trialDias} dias grátis; depois ${money(selectedOffer.totalCentavos)} por ciclo.` : `${money(selectedOffer.totalCentavos)} por ciclo.`}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">O cartão será informado no ambiente seguro do Mercado Pago.</p></div>}
              {hasUnsupportedOptions && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"><p className="font-semibold">O cupom ou os itens extras selecionados não serão incluídos nesta compra.</p><label className="mt-3 flex cursor-pointer items-start gap-2"><input type="checkbox" checked={acceptBaseOnly} onChange={(event) => setAcceptBaseOnly(event.target.checked)} className="mt-0.5 accent-blue-700" /><span>Continuar com o plano escolhido pelo valor exibido, sem desconto ou itens extras.</span></label></div>}
              {error && <p role="alert" className="mt-4 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
              <div className="mt-7 flex justify-end"><button type="button" disabled={!selectedOffer || loadingOffers || (hasUnsupportedOptions && !acceptBaseOnly)} onClick={continueToDetails} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">Continuar <ArrowRight className="h-4 w-4" /></button></div>
            </>}

            {step === 2 && <>
              <div className="mb-6"><h1 className="text-xl font-bold">Dados do titular</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A empresa será criada após o Mercado Pago confirmar a assinatura.</p></div>
              <form onSubmit={continueToPayment} className="space-y-4">
                <fieldset><legend className="mb-2 text-sm font-semibold">Tipo de titular</legend><div className="grid grid-cols-2 gap-2">{(['PJ', 'PF'] as const).map((type) => <button key={type} type="button" onClick={() => { setHolderType(type); setDocument(''); }} className={`rounded-xl border px-4 py-3 text-sm font-semibold ${holderType === type ? 'border-blue-600 bg-blue-50 text-blue-800 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-200' : 'border-slate-200 text-slate-600 dark:border-white/10 dark:text-slate-300'}`}>{type === 'PJ' ? 'Empresa · CNPJ' : 'Pessoa física · CPF'}</button>)}</div></fieldset>
                <label className="block text-sm font-semibold">{holderType === 'PF' ? 'Nome completo' : 'Razão social'}<input required minLength={3} maxLength={180} value={holderName} onChange={(event) => { setHolderName(event.target.value); if (holderType === 'PF') setAdminName(event.target.value); }} autoComplete="organization" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-[#0b1220]" /></label>
                <label className="block text-sm font-semibold">{holderType === 'PF' ? 'CPF' : 'CNPJ'}<input required inputMode="numeric" autoComplete="off" value={document} onChange={(event) => setDocument(maskDocument(event.target.value, holderType))} placeholder={holderType === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-[#0b1220]" /></label>
                <label className="block text-sm font-semibold">Nome do administrador da conta<input required minLength={2} maxLength={120} value={adminName} onChange={(event) => setAdminName(event.target.value)} autoComplete="name" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-[#0b1220]" /></label>
                <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">E-mail do administrador<input required type="email" maxLength={160} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-[#0b1220]" /></label><label className="block text-sm font-semibold">WhatsApp<input required inputMode="tel" value={whatsapp} onChange={(event) => setWhatsapp(maskPhone(event.target.value))} autoComplete="tel" placeholder="(11) 99999-9999" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-[#0b1220]" /></label></div>
                {error && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
                <div className="flex justify-between pt-2"><button type="button" onClick={() => setStep(1)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold dark:border-white/10">Voltar</button><button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800">Revisar pedido <ArrowRight className="h-4 w-4" /></button></div>
              </form>
            </>}

            {step === 3 && <>
              <div className="mb-6"><h1 className="text-xl font-bold">Pagamento seguro</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Confira os dados antes de abrir o Mercado Pago.</p></div>
              <div className="space-y-3 rounded-xl border border-slate-200 p-4 text-sm dark:border-white/10"><div className="flex justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">Titular</span><span className="text-right font-semibold">{holderName}</span></div><div className="flex justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">Administrador</span><span className="text-right font-semibold">{adminName}</span></div><div className="flex justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">E-mail</span><span className="break-all text-right font-semibold">{email}</span></div><div className="flex justify-between gap-4"><span className="text-slate-500 dark:text-slate-400">WhatsApp</span><span className="text-right font-semibold">{whatsapp}</span></div></div>
              <div className="mt-4 flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-white/[0.04]"><CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" /><p>O pagamento é processado com segurança pelo Mercado Pago. {selectedOffer?.trialDias ? `Para começar o teste grátis de ${selectedOffer.trialDias} dias, cadastre um cartão. Não haverá cobrança durante o período de teste. Depois, será cobrado ${money(selectedOffer.totalCentavos)} por ciclo. Se não quiser continuar, cancele no painel da sua empresa antes do fim do teste.` : 'Confira o valor e as condições do plano antes de concluir a contratação.'}</p></div>
              <p className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><ShieldCheck className="h-4 w-4 text-emerald-600" /> A conta e o acesso são liberados depois da confirmação do Mercado Pago.</p>
              {error && <p role="alert" className="mt-4 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
              <div className="mt-7 flex justify-between"><button type="button" disabled={submitting} onClick={() => setStep(2)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold disabled:opacity-50 dark:border-white/10">Voltar</button><button type="button" disabled={submitting || !selectedOffer} onClick={() => void beginPayment()} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">{submitting ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Abrindo Mercado Pago...</> : <>Continuar para pagamento <ArrowRight className="h-4 w-4" /></>}</button></div>
            </>}
          </section>

          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#101827]">
            <h2 className="font-bold">Resumo da compra</h2>
            {selectedOffer ? <><p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{selectedOffer.planoNome} · {selectedOffer.ciclo.toLowerCase()}</p><p className="mt-1 text-xl font-bold">{selectedOffer.trialDias ? 'R$ 0,00 hoje' : money(selectedOffer.totalCentavos)}</p>{selectedOffer.trialDias > 0 && <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">Depois de {selectedOffer.trialDias} dias: {money(selectedOffer.totalCentavos)} por ciclo recorrente, conforme as condições exibidas pelo Mercado Pago.</p>}<div className="mt-4 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400"><p>Cobrança recorrente pelo Mercado Pago.</p><p className="mt-2">Sem acesso até a confirmação da assinatura.</p></div></> : <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Selecione uma oferta para ver o valor cobrado.</p>}
          </aside>
        </div>
      </div>
    </main>
  );
};
