import React, { useEffect, useMemo, useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Lock,
  QrCode,
  RefreshCw,
  ShoppingCart,
  Tag,
  UserCheck,
  X,
} from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import type { GlobalCatalogSnapshot } from '../services/catalogService.ts';
import {
  calcularPrecoCicloCentavos,
  formatarMoedaBRL,
} from '../data/globalCatalogSeed.ts';
import type { CicloCobranca, CupomDoc, EmpresaDoc, FaturaDoc } from '../types/domain.ts';
import { registerNewTenantCompany } from '../services/tenantAuthService.ts';
import {
  createAddonCharge,
  createPlanCharge,
  dispatchAndApplyAsaasWebhook,
} from '../services/billingService.ts';
import {
  calcularDescontoCupomCentavos,
  incrementCupomUso,
  validateCupomByCode,
} from '../services/cmsAndCommsService.ts';
import type { CheckoutSelection } from './LandingPage.tsx';
import { ThemeToggleButton } from './ThemeProvider.tsx';
import {
  EMPTY_ADDRESS,
  formatStructuredAddressLine,
  type StructuredAddress,
} from '../lib/brazilAddress.ts';
import { ViaCepAddressFields } from './ViaCepAddressFields.tsx';

interface CheckoutFlowProps {
  catalog: GlobalCatalogSnapshot | null;
  initialSelection: CheckoutSelection;
  onBackToSite: () => void;
  onEnterPanel: (empresa: EmpresaDoc) => void;
}

type CheckoutStepNumber = 1 | 2 | 3 | 4;

function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function maskCnpj(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function maskCardNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function maskCardExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export const CheckoutFlow: React.FC<CheckoutFlowProps> = ({
  catalog,
  initialSelection,
  onBackToSite,
  onEnterPanel,
}) => {
  const [step, setStep] = useState<CheckoutStepNumber>(1);

  // Etapa 01 — Carrinho & Cupom
  const [planoSlug, setPlanoSlug] = useState(initialSelection.planoSlug);
  const [ciclo, setCiclo] = useState<CicloCobranca>(initialSelection.ciclo);
  const [modoInicio, setModoInicio] = useState<'TRIAL' | 'IMEDIATO'>(initialSelection.modoInicio);
  const [selectedAddons, setSelectedAddons] = useState<string[]>(initialSelection.adicionaisSlugs);
  const [cupomInput, setCupomInput] = useState(initialSelection.cupomCodigo || '');
  const [appliedCupom, setAppliedCupom] = useState<CupomDoc | null>(null);
  const [cupomMsg, setCupomMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [validatingCupom, setValidatingCupom] = useState(false);

  // Etapa 02 — Dados do Titular e Administrador (PF ou PJ — UF vazia padrão!)
  const [tipoPessoa, setTipoPessoa] = useState<'PJ' | 'PF'>('PJ');
  const [razaoSocial, setRazaoSocial] = useState('');
  const [documento, setDocumento] = useState('');
  const [nomeAdministrador, setNomeAdministrador] = useState(auth.currentUser?.displayName || '');
  const [email, setEmail] = useState(auth.currentUser?.email || '');
  const [whatsapp, setWhatsapp] = useState('');
  const [addr, setAddr] = useState<StructuredAddress>({ ...EMPTY_ADDRESS });
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');

  // Etapa 03 — Pagamento (Cartão de Crédito para Trial/Assinatura ou Pix para compra imediata)
  const [metodoPagamento, setMetodoPagamento] = useState<'CARTAO_CREDITO' | 'PIX'>(
    initialSelection.modoInicio === 'TRIAL' ? 'CARTAO_CREDITO' : 'PIX'
  );
  const [cardHolder, setCardHolder] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');

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

  // Validação automática se veio cupom da Landing Page / CMS
  useEffect(() => {
    const initialCode = (initialSelection.cupomCodigo || '').trim();
    if (!initialCode || !selectedPlano) return;
    let active = true;
    void validateCupomByCode({
      codigo: initialCode,
      planoSlug: selectedPlano.slug,
      ciclo,
    }).then((res) => {
      if (!active) return;
      if (res.ok) {
        setAppliedCupom(res.cupom);
        setCupomMsg({ type: 'ok', text: `Cupom ${res.cupom.codigo} aplicado automaticamente.` });
      } else {
        setCupomMsg({ type: 'err', text: res.error });
      }
    });
    return () => {
      active = false;
    };
  }, [initialSelection.cupomCodigo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Revalida se mudar plano ou ciclo com cupom ativo
  useEffect(() => {
    if (!appliedCupom || !selectedPlano) return;
    if (
      (appliedCupom.planosAplicaveis.length > 0 &&
        !appliedCupom.planosAplicaveis.includes(selectedPlano.slug)) ||
      (appliedCupom.ciclosAplicaveis.length > 0 && !appliedCupom.ciclosAplicaveis.includes(ciclo))
    ) {
      setAppliedCupom(null);
      setCupomMsg({
        type: 'err',
        text: 'Cupom removido pois não se aplica ao novo plano ou ciclo selecionado.',
      });
    }
  }, [appliedCupom, selectedPlano, ciclo]);

  useEffect(() => {
    if (modoInicio === 'TRIAL') {
      setMetodoPagamento('CARTAO_CREDITO');
    }
  }, [modoInicio]);

  const pricing = useMemo(() => {
    if (!selectedPlano) return null;
    const hasPromo =
      typeof selectedPlano.precoPromocionalCentavos === 'number' &&
      selectedPlano.precoPromocionalCentavos > 0 &&
      selectedPlano.precoPromocionalCentavos < selectedPlano.precoMensalCentavos;
    const baseMensal = hasPromo
      ? selectedPlano.precoPromocionalCentavos!
      : selectedPlano.precoMensalCentavos;

    const base = calcularPrecoCicloCentavos(
      baseMensal,
      ciclo,
      selectedPlano.descontoSemestral,
      selectedPlano.descontoAnual
    );
    const addonsTotal = addonsList.reduce((acc, a) => acc + a.precoMensalCentavos, 0);
    const subtotalCentavos = base.totalPeriodoCentavos + addonsTotal;
    const descontoCupomCentavos = calcularDescontoCupomCentavos(subtotalCentavos, appliedCupom);
    const totalComDescontoCentavos = Math.max(0, subtotalCentavos - descontoCupomCentavos);

    return {
      ...base,
      hasPromo,
      addonsTotal,
      subtotalCentavos,
      descontoCupomCentavos,
      totalComDescontoCentavos,
    };
  }, [selectedPlano, ciclo, addonsList, appliedCupom]);

  const toggleAddon = (slug: string) => {
    setSelectedAddons((prev) =>
      prev.includes(slug) ? prev.filter((item) => item !== slug) : [...prev, slug]
    );
  };

  const handleApplyCupom = async () => {
    if (!selectedPlano) return;
    if (!cupomInput.trim()) {
      setAppliedCupom(null);
      setCupomMsg(null);
      return;
    }
    setValidatingCupom(true);
    setCupomMsg(null);
    try {
      const res = await validateCupomByCode({
        codigo: cupomInput,
        planoSlug: selectedPlano.slug,
        ciclo,
      });
      if (res.ok) {
        setAppliedCupom(res.cupom);
        setCupomInput(res.cupom.codigo);
        setCupomMsg({
          type: 'ok',
          text:
            res.cupom.tipoDesconto === 'PERCENTUAL'
              ? `Cupom ${res.cupom.codigo} aplicado (${res.cupom.valorDesconto}% OFF).`
              : `Cupom ${res.cupom.codigo} aplicado (${formatarMoedaBRL(res.cupom.valorDesconto)} OFF).`,
        });
      } else {
        setAppliedCupom(null);
        setCupomMsg({ type: 'err', text: res.error });
      }
    } finally {
      setValidatingCupom(false);
    }
  };

  const handleAdvanceFromStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanDoc = documento.replace(/\D/g, '');
    if (tipoPessoa === 'PF' && cleanDoc.length !== 11) {
      setError('Informe um CPF válido com 11 dígitos.');
      return;
    }
    if (tipoPessoa === 'PJ' && cleanDoc.length !== 14) {
      setError('Informe um CNPJ válido com 14 dígitos.');
      return;
    }
    if (razaoSocial.trim().length < 3) {
      setError(
        tipoPessoa === 'PF'
          ? 'Informe seu nome completo.'
          : 'Informe a Razão Social da empresa.'
      );
      return;
    }
    if (!email.includes('@')) {
      setError('Informe um e-mail válido.');
      return;
    }
    if (whatsapp.replace(/\D/g, '').length < 10) {
      setError('Informe um número de WhatsApp com DDD.');
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
    setStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFinalizeCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedPlano || !catalog || !pricing) {
      setError('Catálogo de planos indisponível. Atualize a página e tente novamente.');
      return;
    }

    if (metodoPagamento === 'CARTAO_CREDITO') {
      const cleanCard = cardNumber.replace(/\D/g, '');
      if (cardHolder.trim().length < 3) {
        setError('Informe o nome impresso no cartão.');
        return;
      }
      if (cleanCard.length < 13) {
        setError('Informe um número de cartão válido.');
        return;
      }
      if (!/^\d{2}\/\d{2}$/.test(cardExpiry)) {
        setError('Informe a validade do cartão no formato MM/AA.');
        return;
      }
      if (cardCvv.replace(/\D/g, '').length < 3) {
        setError('Informe o código de segurança (CVV) do cartão.');
        return;
      }
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
        tipoPessoa,
        cnpj: documento,
        razaoSocial,
        nomeAdministrador: tipoPessoa === 'PF' ? razaoSocial : nomeAdministrador || razaoSocial,
        emailFinanceiro: email || currentUser.email || '',
        whatsapp,
        cep: addr.cep,
        logradouro: addr.logradouro,
        numero: addr.numero,
        complemento: addr.complemento,
        bairro: addr.bairro,
        endereco: formatStructuredAddressLine(addr),
        cidade: addr.cidade,
        uf: addr.uf,
        plano: selectedPlano,
        ciclo,
        modoInicio: 'TRIAL',
        nrsIniciais: catalog.nrs,
        adicionaisIniciais: selectedAddons,
        cupomAplicado: appliedCupom?.codigo || null,
        descontoCupomCentavos: pricing.descontoCupomCentavos || null,
        valorMensalOverrideCentavos: pricing.mensalEquivalenteCentavos,
      });

      if (appliedCupom) {
        await incrementCupomUso(appliedCupom.id);
      }

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
        setStep(4);
        return;
      }

      const faturaPlano = await createPlanCharge({
        empresa,
        plano: selectedPlano,
        ciclo,
        metodoPagamento,
        isUpgrade: false,
        valorTotalOverrideCentavos: pricing.totalComDescontoCentavos,
        cupomCodigo: appliedCupom?.codigo || null,
      });

      for (const addon of addonsList) {
        await createAddonCharge({
          empresa,
          adicional: addon,
          metodoPagamento,
        });
      }

      setCreatedFatura(faturaPlano);

      if (metodoPagamento === 'CARTAO_CREDITO') {
        await dispatchAndApplyAsaasWebhook({
          empresa,
          fatura: faturaPlano,
          event: 'PAYMENT_CONFIRMED',
          planosCatalogo: catalog.planos,
        });
        setCreatedEmpresa({ ...empresa, status: 'ATIVA', adicionaisAtivos: selectedAddons });
        setStep(4);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível concluir o checkout agora.'
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
        setStep(4);
      } else {
        setError(
          `Status atual no Asaas: ${data.status || 'PENDING'}. Assim que o Pix for compensado, a liberação acontece automaticamente.`
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
      setStep(4);
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
      // silencioso
    }
  };

  const inputCls =
    'w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500';

  const stepsMeta = [
    { num: 1 as const, code: '01', label: 'Carrinho' },
    { num: 2 as const, code: '02', label: 'Titular & Admin' },
    { num: 3 as const, code: '03', label: 'Pagamento' },
    { num: 4 as const, code: '04', label: 'Confirmação' },
  ];

  const orderSummaryAside = (
    <aside className="lg:col-span-5 dk-glass-card rounded-2xl p-6 space-y-5 sticky top-24">
      <div>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-blue-500" />
          Resumo do Pedido
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Certifica Software - DK · DK Facilita
        </p>
      </div>

      {pricing && selectedPlano && (
        <div className="space-y-2.5 text-xs pt-3 border-t border-slate-200/80 dark:border-white/10">
          <div className="flex justify-between gap-2">
            <span className="text-slate-600 dark:text-slate-400">
              Plano <strong className="text-slate-900 dark:text-white">{selectedPlano.nome}</strong>{' '}
              ({ciclo.toLowerCase()})
            </span>
            <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
              {formatarMoedaBRL(pricing.totalPeriodoCentavos)}
            </span>
          </div>

          {addonsList.map((addon) => (
            <div key={addon.id} className="flex justify-between gap-2 text-slate-600 dark:text-slate-400">
              <span>+ {addon.nome}</span>
              <span className="font-mono tabular-nums text-slate-900 dark:text-white">
                {formatarMoedaBRL(addon.precoMensalCentavos)}
              </span>
            </div>
          ))}

          {appliedCupom && pricing.descontoCupomCentavos > 0 && (
            <div className="flex justify-between gap-2 text-emerald-600 dark:text-emerald-400 font-semibold">
              <span className="inline-flex items-center gap-1">
                <Tag className="w-3.5 h-3.5" />
                Cupom {appliedCupom.codigo}
              </span>
              <span className="font-mono tabular-nums">
                -{formatarMoedaBRL(pricing.descontoCupomCentavos)}
              </span>
            </div>
          )}

          <div className="pt-3 border-t border-slate-200/80 dark:border-white/10 flex justify-between items-baseline">
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              {modoInicio === 'TRIAL' ? 'Total hoje (Trial 7 dias)' : 'Total a pagar'}
            </span>
            <span className="text-lg font-bold font-mono tabular-nums text-[#2563EB] dark:text-blue-400">
              {modoInicio === 'TRIAL'
                ? 'R$ 0,00'
                : formatarMoedaBRL(pricing.totalComDescontoCentavos)}
            </span>
          </div>

          {modoInicio === 'TRIAL' && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Após 7 dias grátis: {formatarMoedaBRL(pricing.totalComDescontoCentavos)} no ciclo{' '}
              {ciclo.toLowerCase()}. Cancele quando quiser.
            </p>
          )}
        </div>
      )}

      <div className="pt-3 border-t border-slate-200/80 dark:border-white/10 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
        <p>• Ambiente multiempresa isolado com provisionamento imediato</p>
        <p>• NRs com conteúdo programático linha por linha já pré-carregadas</p>
        <p>• Pagamento processado com criptografia via Asaas</p>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen dk-ambient-canvas">
      {/* Cabeçalho Checkout */}
      <header className="bg-white/85 dark:bg-[#060913]/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/10 sticky top-0 z-20">
        <div className="max-w-[1140px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
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
              Checkout Seguro
            </span>
            <ThemeToggleButton compact />
          </div>
        </div>
      </header>

      <main className="max-w-[1140px] mx-auto px-6 py-8 space-y-7">
        {/* STEPPER 4 ETAPAS */}
        <nav aria-label="Etapas do checkout" className="dk-glass-card rounded-2xl p-4">
          <ol className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stepsMeta.map((s) => {
              const isCurrent = step === s.num;
              const isDone = step > s.num;
              return (
                <li
                  key={s.num}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors ${
                    isCurrent
                      ? 'border-blue-500/70 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : isDone
                        ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
                        : 'border-transparent text-slate-400 dark:text-slate-500'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                      isCurrent
                        ? 'bg-blue-600 text-white'
                        : isDone
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {isDone ? <Check className="w-3.5 h-3.5" /> : s.code}
                  </span>
                  <span className="text-xs font-semibold truncate">{s.label}</span>
                </li>
              );
            })}
          </ol>
        </nav>

        {error && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-900 dark:text-red-200">
            {error}
          </div>
        )}

        {/* ETAPA 01: CARRINHO (PLANO + CICLO + ADICIONAIS + CUPOM) */}
        {step === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-7 dk-glass-card rounded-2xl p-6 sm:p-8 space-y-6">
              <div>
                <p className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">
                  ETAPA 01 DE 04
                </p>
                <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                  Configure seu Carrinho
                </h1>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Escolha o plano, periodicidade, adicionais opcionais e aplique seu cupom de
                  desconto.
                </p>
              </div>

              {/* Plano */}
              <div className="space-y-2.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Plano Selecionado
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(catalog?.planos ?? []).map((p) => {
                    const active = p.slug === selectedPlano?.slug;
                    const hasPromo =
                      typeof p.precoPromocionalCentavos === 'number' &&
                      p.precoPromocionalCentavos > 0 &&
                      p.precoPromocionalCentavos < p.precoMensalCentavos;
                    const priceToShow = hasPromo
                      ? p.precoPromocionalCentavos!
                      : p.precoMensalCentavos;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPlanoSlug(p.slug)}
                        className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                          active
                            ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30'
                            : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {p.nome}
                          </span>
                          {p.seloPromocional && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-[9px] font-bold text-slate-950">
                              {p.seloPromocional}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                          Até {p.limiteColaboradores} colaboradores · {p.limiteUsuarios} usuários
                        </p>
                        <div className="mt-2 flex items-baseline gap-2">
                          {hasPromo && (
                            <span className="text-[11px] font-mono line-through text-slate-400">
                              {formatarMoedaBRL(p.precoMensalCentavos)}
                            </span>
                          )}
                          <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">
                            {formatarMoedaBRL(priceToShow)}/mês
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ciclo */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Ciclo de Cobrança
                </label>
                <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-100 dark:bg-white/[0.05] rounded-xl border border-slate-200 dark:border-white/10">
                  {(
                    [
                      { id: 'MENSAL', label: 'Mensal' },
                      { id: 'SEMESTRAL', label: 'Semestral (-10%)' },
                      { id: 'ANUAL', label: 'Anual (-20%)' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setCiclo(opt.id)}
                      className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                        ciclo === opt.id
                          ? 'bg-white dark:bg-[#2563EB] text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Adicionais */}
              {catalog && catalog.adicionais.length > 0 && (
                <div className="space-y-2.5 pt-3 border-t border-slate-200/80 dark:border-white/10">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Serviços Adicionais (Opcionais)
                  </label>
                  <div className="space-y-2">
                    {catalog.adicionais.map((addon) => {
                      const active = selectedAddons.includes(addon.slug);
                      return (
                        <label
                          key={addon.id}
                          className={`flex items-center justify-between gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                            active
                              ? 'border-blue-500/60 bg-blue-500/10'
                              : 'border-slate-200 dark:border-white/10'
                          }`}
                        >
                          <span className="flex items-center gap-2.5 text-slate-800 dark:text-slate-200">
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() => toggleAddon(addon.slug)}
                              className="rounded border-slate-300 dark:border-white/20"
                            />
                            <span>
                              <strong className="block">{addon.nome}</strong>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                {addon.tipoCobranca === 'UNICO' ? 'Taxa única' : 'Recorrente mensal'}
                              </span>
                            </span>
                          </span>
                          <span className="font-mono font-semibold text-slate-900 dark:text-white shrink-0">
                            +{formatarMoedaBRL(addon.precoMensalCentavos)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Campo Cupom de Desconto */}
              <div className="space-y-2 pt-3 border-t border-slate-200/80 dark:border-white/10">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Cupom de Desconto
                </label>
                <div className="flex gap-2">
                  <input
                    value={cupomInput}
                    onChange={(e) => setCupomInput(e.target.value.toUpperCase())}
                    placeholder="Digite seu código (ex.: BLACKDK30)"
                    className={`${inputCls} font-mono uppercase`}
                  />
                  {appliedCupom ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAppliedCupom(null);
                        setCupomInput('');
                        setCupomMsg(null);
                      }}
                      className="px-4 py-2.5 rounded-xl border border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-400 text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      Remover
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={validatingCupom}
                      onClick={() => void handleApplyCupom()}
                      className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-semibold whitespace-nowrap cursor-pointer disabled:opacity-50"
                    >
                      {validatingCupom ? 'Validando...' : 'Aplicar'}
                    </button>
                  )}
                </div>
                {cupomMsg && (
                  <p
                    className={`text-xs font-medium ${
                      cupomMsg.type === 'ok'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {cupomMsg.text}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep(2);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1D4ED8] to-[#3B82F6] text-white text-sm font-semibold hover:from-[#1E40AF] hover:to-[#2563EB] shadow-lg shadow-blue-600/25 cursor-pointer"
              >
                Continuar para Dados do Titular
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {orderSummaryAside}
          </div>
        )}

        {/* ETAPA 02: DADOS DO TITULAR E ADMINISTRADOR (PF OU PJ) */}
        {step === 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <form
              onSubmit={handleAdvanceFromStep2}
              className="lg:col-span-7 dk-glass-card rounded-2xl p-6 sm:p-8 space-y-6"
            >
              <div>
                <p className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">
                  ETAPA 02 DE 04
                </p>
                <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                  Dados do Titular / Faturamento DK Facilita
                </h1>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Estes dados pertencem à sua assinatura na DK Facilita. Dentro do painel, em
                  Configurações &amp; Certificados, você poderá personalizar livremente o nome,
                  logo e exibição de CPF/CNPJ nos certificados.
                </p>
              </div>

              {/* Alternador PF vs PJ */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setTipoPessoa('PJ');
                    setDocumento('');
                  }}
                  className={`p-3.5 rounded-xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                    tipoPessoa === 'PJ'
                      ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/25'
                      : 'border-slate-200 dark:border-white/10'
                  }`}
                >
                  <Building2 className="w-5 h-5 text-blue-500 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      Pessoa Jurídica
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Empresa com CNPJ
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTipoPessoa('PF');
                    setDocumento('');
                  }}
                  className={`p-3.5 rounded-xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                    tipoPessoa === 'PF'
                      ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/25'
                      : 'border-slate-200 dark:border-white/10'
                  }`}
                >
                  <UserCheck className="w-5 h-5 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      Autônomo / Pessoa Física
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Profissional com CPF
                    </p>
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {tipoPessoa === 'PF' ? 'Nome Completo *' : 'Razão Social *'}
                  </label>
                  <input
                    required
                    value={razaoSocial}
                    onChange={(e) => setRazaoSocial(e.target.value)}
                    placeholder={
                      tipoPessoa === 'PF'
                        ? 'Seu nome completo (ex.: Carlos Eduardo Silva)'
                        : 'Razão Social conforme cartão CNPJ'
                    }
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {tipoPessoa === 'PF' ? 'CPF *' : 'CNPJ *'}
                  </label>
                  <input
                    required
                    value={documento}
                    onChange={(e) =>
                      setDocumento(
                        tipoPessoa === 'PF' ? maskCpf(e.target.value) : maskCnpj(e.target.value)
                      )
                    }
                    placeholder={tipoPessoa === 'PF' ? '000.000.000-00' : '00.000.000/0001-00'}
                    className={`${inputCls} font-mono`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    WhatsApp *
                  </label>
                  <input
                    required
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(maskPhone(e.target.value))}
                    placeholder="(00) 99999-0000"
                    className={`${inputCls} font-mono`}
                  />
                </div>

                {tipoPessoa === 'PJ' && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Nome do Administrador da Conta *
                    </label>
                    <input
                      required
                      value={nomeAdministrador}
                      onChange={(e) => setNomeAdministrador(e.target.value)}
                      placeholder="Nome do responsável que administrará o painel"
                      className={inputCls}
                    />
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    E-mail de Acesso e Financeiro *
                  </label>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seuemail@dominio.com.br"
                    className={inputCls}
                  />
                </div>

                <div className="sm:col-span-2 pt-2 border-t border-slate-200/80 dark:border-white/10">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                    Endereço do Titular (preenchimento automático pelo CEP)
                  </p>
                  <ViaCepAddressFields value={addr} onChange={setAddr} />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Crie sua Senha *
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
                    Confirmar Senha *
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

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-3 rounded-xl border border-slate-200 dark:border-white/15 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1D4ED8] to-[#3B82F6] text-white text-sm font-semibold hover:from-[#1E40AF] hover:to-[#2563EB] shadow-lg shadow-blue-600/25 cursor-pointer"
                >
                  Ir para Pagamento
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>

            {orderSummaryAside}
          </div>
        )}

        {/* ETAPA 03: PAGAMENTO (CARTÃO PARA TRIAL/ASSINATURA OU PIX PARA COMPRA IMEDIATA) */}
        {step === 3 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-7 dk-glass-card rounded-2xl p-6 sm:p-8 space-y-6">
              {createdFatura && createdEmpresa && metodoPagamento === 'PIX' ? (
                /* Tela Pix QR Code Gerado via Asaas */
                <div className="space-y-6">
                  <div>
                    <p className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">
                      AGUARDANDO PIX · {createdFatura.asaasPaymentId}
                    </p>
                    <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                      Escaneie o QR Code Pix para ativar sua conta
                    </h1>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
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
                              className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              {copiedPix ? 'Copiado!' : 'Copiar código'}
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
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-semibold cursor-pointer disabled:opacity-50"
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
              ) : (
                <form onSubmit={handleFinalizeCheckout} className="space-y-6">
                  <div>
                    <p className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">
                      ETAPA 03 DE 04
                    </p>
                    <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                      Modalidade e Pagamento
                    </h1>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Escolha iniciar com 7 dias grátis no Cartão de Crédito ou contratação imediata
                      no Cartão ou Pix.
                    </p>
                  </div>

                  {/* Modalidade: Trial vs Compra Imediata */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setModoInicio('TRIAL')}
                      className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                        modoInicio === 'TRIAL'
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-slate-200 dark:border-white/10'
                      }`}
                    >
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        Teste Grátis por 7 Dias
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        R$ 0,00 hoje · Cartão de Crédito cadastrado para renovação após 7 dias.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setModoInicio('IMEDIATO')}
                      className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                        modoInicio === 'IMEDIATO'
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-slate-200 dark:border-white/10'
                      }`}
                    >
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        Contratação Imediata
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Ativação imediata via Pix QR Code ou Cartão de Crédito.
                      </p>
                    </button>
                  </div>

                  {/* Método de pagamento (Cartão ou Pix — SEM 2 cartões) */}
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Forma de Pagamento
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setMetodoPagamento('CARTAO_CREDITO')}
                        className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                          metodoPagamento === 'CARTAO_CREDITO'
                            ? 'border-blue-500 bg-blue-600 text-white'
                            : 'border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <CreditCard className="w-4 h-4" />
                        Cartão de Crédito
                      </button>
                      <button
                        type="button"
                        disabled={modoInicio === 'TRIAL'}
                        onClick={() => setMetodoPagamento('PIX')}
                        className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl border text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          metodoPagamento === 'PIX'
                            ? 'border-blue-500 bg-blue-600 text-white'
                            : 'border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <QrCode className="w-4 h-4" />
                        Pix {modoInicio === 'TRIAL' ? '(só imediato)' : '(na hora)'}
                      </button>
                    </div>
                  </div>

                  {metodoPagamento === 'CARTAO_CREDITO' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Nome Impresso no Cartão *
                        </label>
                        <input
                          required
                          value={cardHolder}
                          onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                          placeholder="COMO ESTÁ NO CARTÃO"
                          className={`${inputCls} uppercase`}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Número do Cartão *
                        </label>
                        <input
                          required
                          inputMode="numeric"
                          value={cardNumber}
                          onChange={(e) => setCardNumber(maskCardNumber(e.target.value))}
                          placeholder="0000 0000 0000 0000"
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Validade (MM/AA) *
                        </label>
                        <input
                          required
                          inputMode="numeric"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(maskCardExpiry(e.target.value))}
                          placeholder="MM/AA"
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          CVV *
                        </label>
                        <input
                          required
                          inputMode="numeric"
                          maxLength={4}
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          placeholder="123"
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-4 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        Pagamento instantâneo via Pix QR Code (Asaas)
                      </p>
                      <p>
                        Ao confirmar abaixo, sua conta será provisionada e o QR Code Pix aparecerá
                        imediatamente na tela para pagamento em segundos.
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="px-4 py-3 rounded-xl border border-slate-200 dark:border-white/15 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      Voltar
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1D4ED8] to-[#3B82F6] text-white text-sm font-semibold hover:from-[#1E40AF] hover:to-[#2563EB] shadow-lg shadow-blue-600/25 cursor-pointer disabled:opacity-50"
                    >
                      <Lock className="w-4 h-4" />
                      {submitting
                        ? 'Processando e provisionando...'
                        : modoInicio === 'TRIAL'
                          ? 'Finalizar e Liberar 7 Dias Grátis'
                          : metodoPagamento === 'PIX'
                            ? 'Gerar QR Code Pix Agora'
                            : 'Confirmar Assinatura no Cartão'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {orderSummaryAside}
          </div>
        )}

        {/* ETAPA 04: CONFIRMAÇÃO E PRIMEIRO ACESSO */}
        {step === 4 && createdEmpresa && (
          <div className="max-w-xl mx-auto dk-glass-card rounded-2xl p-8 space-y-6">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  ETAPA 04 DE 04 ·{' '}
                  {createdEmpresa.status === 'ATIVA'
                    ? 'CONTA ATIVA'
                    : 'TRIAL 7 DIAS LIBERADO'}
                </p>
                <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                  Bem-vindo ao Certifica Software - DK
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  O ambiente exclusivo de{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {createdEmpresa.razaoSocial}
                  </strong>{' '}
                  foi criado com catálogo inicial de NRs e notificação enviada à equipe DK Facilita.
                </p>
              </div>
            </div>

            <dl className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl p-4 space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">ID da Conta (Tenant)</dt>
                <dd className="font-mono font-semibold text-slate-900 dark:text-white">
                  {createdEmpresa.id}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">
                  {createdEmpresa.tipoPessoa === 'PF' ? 'CPF do Titular' : 'CNPJ'}
                </dt>
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
              {createdEmpresa.cupomAplicado && (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500 dark:text-slate-400">Cupom Aplicado</dt>
                  <dd className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {createdEmpresa.cupomAplicado}
                  </dd>
                </div>
              )}
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
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1D4ED8] to-[#3B82F6] text-white text-sm font-semibold hover:from-[#1E40AF] hover:to-[#2563EB] transition-all cursor-pointer shadow-lg shadow-blue-600/25"
            >
              Iniciar Primeiro Acesso no Painel
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </main>
    </div>
  );
};
