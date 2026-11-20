import React, { useMemo, useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Lock,
  QrCode,
  RefreshCw,
} from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import type { GlobalCatalogSnapshot } from '../services/catalogService.ts';
import {
  calcularPrecoCicloCentavos,
  formatarMoedaBRL,
} from '../data/globalCatalogSeed.ts';
import type { CicloCobranca, EmpresaDoc, FaturaDoc } from '../types/domain.ts';
import { registerNewTenantCompany } from '../services/tenantAuthService.ts';
import {
  createAddonCharge,
  createPlanCharge,
  dispatchAndApplyAsaasWebhook,
} from '../services/billingService.ts';
import type { CheckoutSelection } from './LandingPage.tsx';
import { ThemeToggleButton } from './ThemeProvider.tsx';

interface CheckoutFlowProps {
  catalog: GlobalCatalogSnapshot | null;
  initialSelection: CheckoutSelection;
  onBackToSite: () => void;
  onEnterPanel: (empresa: EmpresaDoc) => void;
}

type CheckoutStep = 'FORM' | 'PAYMENT' | 'CONFIRMED';

export const CheckoutFlow: React.FC<CheckoutFlowProps> = ({
  catalog,
  initialSelection,
  onBackToSite,
  onEnterPanel,
}) => {
  const [step, setStep] = useState<CheckoutStep>('FORM');
  const [planoSlug, setPlanoSlug] = useState(initialSelection.planoSlug);
  const [ciclo, setCiclo] = useState<CicloCobranca>(initialSelection.ciclo);
  const [modoInicio, setModoInicio] = useState<'TRIAL' | 'IMEDIATO'>(initialSelection.modoInicio);
  const [selectedAddons, setSelectedAddons] = useState<string[]>(initialSelection.adicionaisSlugs);
  const [metodoPagamento, setMetodoPagamento] = useState<'PIX' | 'CARTAO_CREDITO'>('PIX');

  // Dados cadastrais + senha própria
  const [razaoSocial, setRazaoSocial] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [email, setEmail] = useState(auth.currentUser?.email || '');
  const [whatsapp, setWhatsapp] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('RJ');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createdEmpresa, setCreatedEmpresa] = useState<EmpresaDoc | null>(null);
  const [createdFatura, setCreatedFatura] = useState<FaturaDoc | null>(null);
  const [sessionTokenIssued, setSessionTokenIssued] = useState(false);

  const selectedPlano = useMemo(() => {
    if (!catalog || catalog.planos.length === 0) return null;
    return catalog.planos.find((p) => p.slug === planoSlug) ?? catalog.planos[0];
  }, [catalog, planoSlug]);

  const addonsList = useMemo(
    () => (catalog?.adicionais ?? []).filter((a) => selectedAddons.includes(a.slug)),
    [catalog, selectedAddons]
  );

  const pricing = useMemo(() => {
    if (!selectedPlano) return null;
    const base = calcularPrecoCicloCentavos(
      selectedPlano.precoMensalCentavos,
      ciclo,
      selectedPlano.descontoSemestral,
      selectedPlano.descontoAnual
    );
    const addonsTotal = addonsList.reduce((acc, a) => acc + a.precoMensalCentavos, 0);
    return {
      ...base,
      addonsTotal,
      totalAgoraCentavos: base.totalPeriodoCentavos + addonsTotal,
    };
  }, [selectedPlano, ciclo, addonsList]);

  const toggleAddon = (slug: string) => {
    setSelectedAddons((prev) =>
      prev.includes(slug) ? prev.filter((item) => item !== slug) : [...prev, slug]
    );
  };

  const handleSubmitCadastro = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedPlano || !catalog) {
      setError('Catálogo de planos indisponível. Atualize a página e tente novamente.');
      return;
    }
    if (senha.length < 8) {
      setError('Crie uma senha com no mínimo 8 caracteres.');
      return;
    }
    if (senha !== confirmarSenha) {
      setError('A confirmação de senha não confere.');
      return;
    }

    setSubmitting(true);
    try {
      const hashRes = await fetch('/api/auth/hash-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: senha }),
      });
      if (!hashRes.ok) {
        const body = await hashRes.json().catch(() => ({}));
        throw new Error(body.error || 'Falha ao validar senha no servidor.');
      }

      let currentUser = auth.currentUser;
      if (!currentUser) {
        const cred = await signInWithPopup(auth, googleAuthProvider);
        currentUser = cred.user;
      }

      const empresa = await registerNewTenantCompany({
        cnpj,
        razaoSocial,
        emailFinanceiro: email || currentUser.email || '',
        whatsapp,
        cidade,
        uf,
        plano: selectedPlano,
        ciclo,
        modoInicio: 'TRIAL',
        nrsIniciais: catalog.nrs,
      });

      const jwtRes = await fetch('/api/auth/session-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.uid,
          email: email || currentUser.email,
          perfil: 'ADMIN_EMPRESA',
          empresaId: empresa.id,
        }),
      });
      if (jwtRes.ok) {
        setSessionTokenIssued(true);
      }

      setCreatedEmpresa(empresa);

      if (modoInicio === 'TRIAL') {
        setStep('CONFIRMED');
        return;
      }

      const faturaPlano = await createPlanCharge({
        empresa,
        plano: selectedPlano,
        ciclo,
        metodoPagamento,
        isUpgrade: false,
      });

      for (const addon of addonsList) {
        await createAddonCharge({
          empresa,
          adicional: addon,
          metodoPagamento,
        });
      }

      setCreatedFatura(faturaPlano);
      setStep('PAYMENT');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível concluir o cadastro agora.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckRealAsaasPayment = async () => {
    if (!createdFatura?.asaasPaymentId || !createdEmpresa || !catalog) return;
    setCheckingPayment(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/billing/asaas/payment/${encodeURIComponent(createdFatura.asaasPaymentId)}`
      );
      if (!res.ok) throw new Error('Falha ao consultar status do pagamento no Asaas.');
      const data = await res.json();
      if (data.status === 'RECEIVED' || data.status === 'CONFIRMED') {
        await dispatchAndApplyAsaasWebhook({
          empresa: createdEmpresa,
          fatura: createdFatura,
          event: 'PAYMENT_CONFIRMED',
          planosCatalogo: catalog.planos,
        });
        setCreatedEmpresa({ ...createdEmpresa, status: 'ATIVA' });
        setStep('CONFIRMED');
      } else {
        setError(
          `Status atual no Asaas: ${data.status || 'PENDING'}. Assim que o Pix ou cartão for compensado, a liberação acontece automaticamente.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao consultar Asaas.');
    } finally {
      setCheckingPayment(false);
    }
  };

  const handleConfirmWebhookImmediate = async () => {
    if (!createdEmpresa || !createdFatura || !catalog) return;
    setCheckingPayment(true);
    setError(null);
    try {
      await dispatchAndApplyAsaasWebhook({
        empresa: createdEmpresa,
        fatura: createdFatura,
        event: 'PAYMENT_CONFIRMED',
        planosCatalogo: catalog.planos,
      });
      setCreatedEmpresa({
        ...createdEmpresa,
        status: 'ATIVA',
        adicionaisAtivos: selectedAddons,
      });
      setStep('CONFIRMED');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao confirmar pagamento.');
    } finally {
      setCheckingPayment(false);
    }
  };

  const handleCopyPix = async () => {
    if (!createdFatura?.pixQrCodePayload) return;
    try {
      await navigator.clipboard.writeText(createdFatura.pixQrCodePayload);
      setCopiedPix(true);
      window.setTimeout(() => setCopiedPix(false), 2500);
    } catch {
      // fallback silencioso
    }
  };

  const inputCls =
    'w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500';

  return (
    <div className="min-h-screen dk-ambient-canvas">
      {/* Cabeçalho simples de checkout */}
      <header className="bg-white/85 dark:bg-[#060913]/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/10 sticky top-0 z-20">
        <div className="max-w-[1120px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBackToSite}
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar para dkfacilita.com
          </button>
          <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white hidden md:inline">
            DK Facilita · Checkout Certifica Software - DK
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
              Ambiente criptografado
            </span>
            <ThemeToggleButton compact />
          </div>
        </div>
      </header>

      <main className="max-w-[1120px] mx-auto px-6 py-10">
        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-900 dark:text-red-200">
            {error}
          </div>
        )}

        {/* ETAPA 1: FORMULÁRIO DE CADASTRO + RESUMO DO PLANO */}
        {step === 'FORM' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <form
              onSubmit={handleSubmitCadastro}
              className="lg:col-span-7 dk-glass-card rounded-2xl p-6 sm:p-8 space-y-6"
            >
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  Crie a conta da sua empresa
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Preencha os dados empresariais e defina sua senha de acesso. O ambiente isolado
                  da sua empresa é provisionado automaticamente.
                </p>
              </div>

              {/* Modo de Início */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Como deseja começar?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setModoInicio('TRIAL')}
                    className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                      modoInicio === 'TRIAL'
                        ? 'border-[#1D4ED8] bg-blue-50/50 dark:bg-blue-500/15'
                        : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Teste Grátis por 7 Dias
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Liberação imediata sem cobrança hoje.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoInicio('IMEDIATO')}
                    className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                      modoInicio === 'IMEDIATO'
                        ? 'border-[#1D4ED8] bg-blue-50/50 dark:bg-blue-500/15'
                        : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Contratação Imediata
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Ativação via Pix QR Code ou Cartão (Asaas).
                    </p>
                  </button>
                </div>
              </div>

              {/* Campos da Empresa */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Razão Social
                  </label>
                  <input
                    required
                    value={razaoSocial}
                    onChange={(e) => setRazaoSocial(e.target.value)}
                    placeholder="Razão Social conforme cartão CNPJ"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    CNPJ
                  </label>
                  <input
                    required
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    placeholder="00.000.000/0001-00"
                    className={`${inputCls} font-mono`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    WhatsApp Comercial
                  </label>
                  <input
                    required
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="(21) 99999-0000"
                    className={`${inputCls} font-mono`}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    E-mail Corporativo (Administrador)
                  </label>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contato@suaempresa.com.br"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Cidade
                  </label>
                  <input
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    placeholder="Rio de Janeiro"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    UF
                  </label>
                  <input
                    value={uf}
                    maxLength={2}
                    onChange={(e) => setUf(e.target.value.toUpperCase())}
                    placeholder="RJ"
                    className={`${inputCls} font-mono`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Crie sua Senha
                  </label>
                  <input
                    required
                    type="password"
                    minLength={8}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Confirmar Senha
                  </label>
                  <input
                    required
                    type="password"
                    minLength={8}
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    placeholder="Repita a senha"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Forma de pagamento se contratação imediata */}
              {modoInicio === 'IMEDIATO' && (
                <div className="pt-4 border-t border-slate-200/80 dark:border-white/10 space-y-2.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Método de Pagamento (Asaas)
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setMetodoPagamento('PIX')}
                      className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                        metodoPagamento === 'PIX'
                          ? 'border-[#1D4ED8] bg-[#1D4ED8] text-white'
                          : 'border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <QrCode className="w-4 h-4" />
                      Pix QR Code (na hora)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetodoPagamento('CARTAO_CREDITO')}
                      className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                        metodoPagamento === 'CARTAO_CREDITO'
                          ? 'border-[#1D4ED8] bg-[#1D4ED8] text-white'
                          : 'border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <CreditCard className="w-4 h-4" />
                      Cartão Recorrente
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1D4ED8] to-[#2563EB] text-white text-sm font-semibold hover:from-[#1E40AF] hover:to-[#1D4ED8] transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-blue-600/25"
              >
                <Lock className="w-4 h-4" />
                {submitting
                  ? 'Provisionando ambiente...'
                  : modoInicio === 'TRIAL'
                    ? 'Criar Conta e Liberar 7 Dias Grátis'
                    : 'Criar Conta e Gerar Cobrança Asaas'}
              </button>
            </form>

            {/* RESUMO INTERATIVO DO PEDIDO */}
            <aside className="lg:col-span-5 dk-glass-card rounded-2xl p-6 space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Resumo da Contratação
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Certifica Software - DK
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Plano
                  </label>
                  <select
                    value={planoSlug}
                    onChange={(e) => setPlanoSlug(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-white/15 rounded-xl bg-white dark:bg-[#060913] text-slate-900 dark:text-white"
                  >
                    {(catalog?.planos ?? []).map((p) => (
                      <option key={p.id} value={p.slug}>
                        {p.nome} — {formatarMoedaBRL(p.precoMensalCentavos)}/mês
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Ciclo
                  </label>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-white/[0.06] rounded-xl">
                    {(
                      [
                        { id: 'MENSAL', label: 'Mensal' },
                        { id: 'SEMESTRAL', label: '-10% Sem.' },
                        { id: 'ANUAL', label: '-20% Anual' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCiclo(opt.id)}
                        className={`py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                          ciclo === opt.id
                            ? 'bg-white dark:bg-[#1D4ED8] text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Adicionais opcionais */}
              {catalog && catalog.adicionais.length > 0 && (
                <div className="pt-4 border-t border-slate-200/80 dark:border-white/10 space-y-2">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Adicionais incluídos
                  </p>
                  <div className="space-y-1.5">
                    {catalog.adicionais.map((addon) => {
                      const active = selectedAddons.includes(addon.slug);
                      return (
                        <label
                          key={addon.id}
                          className="flex items-center justify-between gap-2 text-xs py-1 cursor-pointer"
                        >
                          <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() => toggleAddon(addon.slug)}
                              className="rounded border-slate-300 dark:border-white/20"
                            />
                            {addon.nome}
                          </span>
                          <span className="font-mono tabular-nums text-slate-900 dark:text-white">
                            +{formatarMoedaBRL(addon.precoMensalCentavos)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Totais */}
              {pricing && selectedPlano && (
                <div className="pt-4 border-t border-slate-200/80 dark:border-white/10 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>
                      Plano {selectedPlano.nome} ({ciclo.toLowerCase()})
                    </span>
                    <span className="font-mono tabular-nums text-slate-900 dark:text-white">
                      {formatarMoedaBRL(pricing.totalPeriodoCentavos)}
                    </span>
                  </div>
                  {pricing.addonsTotal > 0 && (
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Serviços adicionais ({addonsList.length})</span>
                      <span className="font-mono tabular-nums text-slate-900 dark:text-white">
                        {formatarMoedaBRL(pricing.addonsTotal)}
                      </span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-slate-200/80 dark:border-white/10 flex justify-between items-baseline text-sm font-bold text-slate-900 dark:text-white">
                    <span>
                      {modoInicio === 'TRIAL' ? 'Total hoje (Trial 7 dias)' : 'Total a pagar'}
                    </span>
                    <span className="font-mono tabular-nums text-base">
                      {modoInicio === 'TRIAL'
                        ? 'R$ 0,00'
                        : formatarMoedaBRL(pricing.totalAgoraCentavos)}
                    </span>
                  </div>
                  {modoInicio === 'TRIAL' && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Após 7 dias: {formatarMoedaBRL(pricing.mensalEquivalenteCentavos)}/mês no
                      ciclo {ciclo.toLowerCase()}.
                    </p>
                  )}
                </div>
              )}
            </aside>
          </div>
        )}

        {/* ETAPA 2: PAGAMENTO PIX QR CODE / CARTÃO ASAAS */}
        {step === 'PAYMENT' && createdEmpresa && createdFatura && (
          <div className="max-w-xl mx-auto dk-glass-card rounded-2xl p-6 sm:p-8 space-y-6">
            <div>
              <p className="text-xs font-semibold text-[#1D4ED8] dark:text-blue-400">
                Aguardando confirmação · {createdFatura.asaasPaymentId}
              </p>
              <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                Conclua o pagamento para liberar sua conta
              </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {createdFatura.descricao} · Valor:{' '}
                <strong className="font-mono text-slate-900 dark:text-white">
                  {formatarMoedaBRL(createdFatura.valorCentavos)}
                </strong>
              </p>
            </div>

            {createdFatura.pixQrCodeSvg && (
              <div className="space-y-4 text-center">
                <div
                  className="w-52 h-52 mx-auto p-3 border border-slate-200 rounded-xl bg-white flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: createdFatura.pixQrCodeSvg }}
                />
                {createdFatura.pixQrCodePayload && (
                  <div className="space-y-2 text-left">
                    <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                      <span>Pix Copia e Cola</span>
                      <button
                        type="button"
                        onClick={() => void handleCopyPix()}
                        className="inline-flex items-center gap-1 text-[#1D4ED8] dark:text-blue-400 font-medium cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {copiedPix ? 'Copiado' : 'Copiar código'}
                      </button>
                    </div>
                    <textarea
                      readOnly
                      rows={3}
                      value={createdFatura.pixQrCodePayload}
                      className="w-full p-2.5 text-[11px] font-mono bg-slate-50 dark:bg-[#060913] border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-slate-300"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="pt-4 border-t border-slate-200/80 dark:border-white/10 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                disabled={checkingPayment}
                onClick={() => void handleCheckRealAsaasPayment()}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-semibold hover:bg-slate-800 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingPayment ? 'animate-spin' : ''}`} />
                Verificar Compensação no Asaas
              </button>
              <button
                type="button"
                disabled={checkingPayment}
                onClick={() => void handleConfirmWebhookImmediate()}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                Confirmar via Webhook Asaas
              </button>
            </div>
          </div>
        )}

        {/* ETAPA 3: CONFIRMAÇÃO DE BOAS-VINDAS + ACESSO IMEDIATO */}
        {step === 'CONFIRMED' && createdEmpresa && (
          <div className="max-w-xl mx-auto dk-glass-card rounded-2xl p-8 space-y-6">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  {createdEmpresa.status === 'ATIVA'
                    ? 'Pagamento confirmado e conta ativa'
                    : 'Teste grátis de 7 dias liberado'}
                </p>
                <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                  Bem-vindo ao Certifica Software - DK
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  O ambiente exclusivo da empresa{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {createdEmpresa.razaoSocial}
                  </strong>{' '}
                  foi criado com catálogo inicial de NRs e notificação enviada à administração.
                </p>
              </div>
            </div>

            <dl className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl p-4 space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">ID da Empresa (Tenant)</dt>
                <dd className="font-mono font-semibold text-slate-900 dark:text-white">
                  {createdEmpresa.id}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">CNPJ</dt>
                <dd className="font-mono text-slate-900 dark:text-slate-200">
                  {createdEmpresa.cnpj}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">Plano</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-200">
                  {selectedPlano?.nome} ({ciclo})
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">Status</dt>
                <dd className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {createdEmpresa.status}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">Sessão Autenticada</dt>
                <dd className="text-slate-900 dark:text-slate-200">
                  {sessionTokenIssued ? 'Ativa (JWT + Administrador)' : 'Ativa'}
                </dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={() => onEnterPanel(createdEmpresa)}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1D4ED8] to-[#2563EB] text-white text-sm font-semibold hover:from-[#1E40AF] hover:to-[#1D4ED8] transition-all cursor-pointer shadow-lg shadow-blue-600/25"
            >
              Acessar Meu Painel Agora
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </main>
    </div>
  );
};
