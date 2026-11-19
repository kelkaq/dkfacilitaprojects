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
      setError('Catálogo de planos indisponível. Sincronize o catálogo global primeiro.');
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
      // 1. Valida e gera hash scrypt real da senha no backend Express
      const hashRes = await fetch('/api/auth/hash-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: senha }),
      });
      if (!hashRes.ok) {
        const body = await hashRes.json().catch(() => ({}));
        throw new Error(body.error || 'Falha ao validar senha no servidor.');
      }

      // 2. Garante sessão autenticada verificada para gravar tenant no banco em nuvem
      let currentUser = auth.currentUser;
      if (!currentUser) {
        const cred = await signInWithPopup(auth, googleAuthProvider);
        currentUser = cred.user;
      }

      // 3. Cria empresa_id, usuário Admin, clona catálogo inicial de NRs e notifica Super Admin
      const empresa = await registerNewTenantCompany({
        cnpj,
        razaoSocial,
        emailFinanceiro: email || currentUser.email || '',
        whatsapp,
        cidade,
        uf,
        plano: selectedPlano,
        ciclo,
        modoInicio: 'TRIAL', // inicia em TRIAL e promove para ATIVA ao confirmar pagamento
        nrsIniciais: catalog.nrs,
      });

      // 4. Emite token JWT HS256 multiempresa real no backend
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

      // 5. Contratação Imediata: gera cobrança real Asaas (Pix QR Code ou Cartão)
      const faturaPlano = await createPlanCharge({
        empresa,
        plano: selectedPlano,
        ciclo,
        metodoPagamento,
        isUpgrade: false,
      });

      // Gera também cobranças de adicionais selecionados, se houver
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

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      {/* Cabeçalho simples de checkout */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-[1120px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBackToSite}
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar para dkfacilita.com
          </button>
          <span className="text-sm font-bold tracking-tight text-slate-900">
            DK Facilita · Checkout Certifica Software - DK
          </span>
          <span className="text-xs text-slate-500 hidden sm:inline">Ambiente criptografado</span>
        </div>
      </header>

      <main className="max-w-[1120px] mx-auto px-6 py-10">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-900">
            {error}
          </div>
        )}

        {/* ETAPA 1: FORMULÁRIO DE CADASTRO + RESUMO DO PLANO */}
        {step === 'FORM' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <form
              onSubmit={handleSubmitCadastro}
              className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6"
            >
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Crie a conta da sua empresa
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Preencha os dados empresariais e defina sua senha de acesso. O ambiente isolado
                  da sua empresa é provisionado automaticamente.
                </p>
              </div>

              {/* Modo de Início */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  Como deseja começar?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setModoInicio('TRIAL')}
                    className={`p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      modoInicio === 'TRIAL'
                        ? 'border-[#1D4ED8] bg-blue-50/40'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      Teste Grátis por 7 Dias
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Liberação imediata sem cobrança hoje.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoInicio('IMEDIATO')}
                    className={`p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      modoInicio === 'IMEDIATO'
                        ? 'border-[#1D4ED8] bg-blue-50/40'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900">Contratação Imediata</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Ativação via Pix QR Code ou Cartão (Asaas).
                    </p>
                  </button>
                </div>
              </div>

              {/* Campos da Empresa */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Razão Social
                  </label>
                  <input
                    required
                    value={razaoSocial}
                    onChange={(e) => setRazaoSocial(e.target.value)}
                    placeholder="Razão Social conforme cartão CNPJ"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">CNPJ</label>
                  <input
                    required
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    placeholder="00.000.000/0001-00"
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    WhatsApp Comercial
                  </label>
                  <input
                    required
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="(21) 99999-0000"
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    E-mail Corporativo (Administrador)
                  </label>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contato@suaempresa.com.br"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Cidade</label>
                  <input
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    placeholder="Rio de Janeiro"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">UF</label>
                  <input
                    value={uf}
                    maxLength={2}
                    onChange={(e) => setUf(e.target.value.toUpperCase())}
                    placeholder="RJ"
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>

                {/* Criação da Própria Senha */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Crie sua Senha
                  </label>
                  <input
                    required
                    type="password"
                    minLength={8}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Confirmar Senha
                  </label>
                  <input
                    required
                    type="password"
                    minLength={8}
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    placeholder="Repita a senha"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              {/* Forma de pagamento se contratação imediata */}
              {modoInicio === 'IMEDIATO' && (
                <div className="pt-4 border-t border-slate-100 space-y-2.5">
                  <label className="block text-xs font-medium text-slate-700">
                    Método de Pagamento (Asaas)
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setMetodoPagamento('PIX')}
                      className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-xs font-medium cursor-pointer ${
                        metodoPagamento === 'PIX'
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 text-slate-700'
                      }`}
                    >
                      <QrCode className="w-4 h-4" />
                      Pix QR Code (na hora)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetodoPagamento('CARTAO_CREDITO')}
                      className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-xs font-medium cursor-pointer ${
                        metodoPagamento === 'CARTAO_CREDITO'
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 text-slate-700'
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
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#1D4ED8] text-white text-sm font-medium hover:bg-[#1E40AF] transition-colors cursor-pointer disabled:opacity-50"
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
            <aside className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Resumo da Contratação</h2>
                <p className="text-xs text-slate-500 mt-0.5">Certifica Software - DK</p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Plano</label>
                  <select
                    value={planoSlug}
                    onChange={(e) => setPlanoSlug(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {(catalog?.planos ?? []).map((p) => (
                      <option key={p.id} value={p.slug}>
                        {p.nome} — {formatarMoedaBRL(p.precoMensalCentavos)}/mês
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-500 mb-1">Ciclo</label>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
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
                        className={`py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                          ciclo === opt.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
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
                <div className="pt-4 border-t border-slate-100 space-y-2">
                  <p className="text-xs font-medium text-slate-700">Adicionais incluídos</p>
                  <div className="space-y-1.5">
                    {catalog.adicionais.map((addon) => {
                      const active = selectedAddons.includes(addon.slug);
                      return (
                        <label
                          key={addon.id}
                          className="flex items-center justify-between gap-2 text-xs py-1 cursor-pointer"
                        >
                          <span className="flex items-center gap-2 text-slate-700">
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() => toggleAddon(addon.slug)}
                              className="rounded border-slate-300"
                            />
                            {addon.nome}
                          </span>
                          <span className="font-mono tabular-nums text-slate-900">
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
                <div className="pt-4 border-t border-slate-200 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>
                      Plano {selectedPlano.nome} ({ciclo.toLowerCase()})
                    </span>
                    <span className="font-mono tabular-nums text-slate-900">
                      {formatarMoedaBRL(pricing.totalPeriodoCentavos)}
                    </span>
                  </div>
                  {pricing.addonsTotal > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Serviços adicionais ({addonsList.length})</span>
                      <span className="font-mono tabular-nums text-slate-900">
                        {formatarMoedaBRL(pricing.addonsTotal)}
                      </span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-slate-100 flex justify-between items-baseline text-sm font-bold text-slate-900">
                    <span>{modoInicio === 'TRIAL' ? 'Total hoje (Trial 7 dias)' : 'Total a pagar'}</span>
                    <span className="font-mono tabular-nums text-base">
                      {modoInicio === 'TRIAL'
                        ? 'R$ 0,00'
                        : formatarMoedaBRL(pricing.totalAgoraCentavos)}
                    </span>
                  </div>
                  {modoInicio === 'TRIAL' && (
                    <p className="text-[11px] text-slate-500">
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
          <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div>
              <p className="text-xs font-medium text-[#1D4ED8]">
                Aguardando confirmação · {createdFatura.asaasPaymentId}
              </p>
              <h1 className="mt-1 text-xl font-bold text-slate-900">
                Conclua o pagamento para liberar sua conta
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                {createdFatura.descricao} · Valor:{' '}
                <strong className="font-mono text-slate-900">
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
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>Pix Copia e Cola</span>
                      <button
                        type="button"
                        onClick={() => void handleCopyPix()}
                        className="inline-flex items-center gap-1 text-[#1D4ED8] font-medium cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {copiedPix ? 'Copiado' : 'Copiar código'}
                      </button>
                    </div>
                    <textarea
                      readOnly
                      rows={3}
                      value={createdFatura.pixQrCodePayload}
                      className="w-full p-2.5 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                disabled={checkingPayment}
                onClick={() => void handleCheckRealAsaasPayment()}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingPayment ? 'animate-spin' : ''}`} />
                Verificar Compensação no Asaas
              </button>
              <button
                type="button"
                disabled={checkingPayment}
                onClick={() => void handleConfirmWebhookImmediate()}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                Confirmar via Webhook Asaas
              </button>
            </div>
          </div>
        )}

        {/* ETAPA 3: CONFIRMAÇÃO DE BOAS-VINDAS + ACESSO IMEDIATO */}
        {step === 'CONFIRMED' && createdEmpresa && (
          <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-xl p-8 space-y-6">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-medium text-emerald-700">
                  {createdEmpresa.status === 'ATIVA'
                    ? 'Pagamento confirmado e conta ativa'
                    : 'Teste grátis de 7 dias liberado'}
                </p>
                <h1 className="mt-1 text-xl font-bold text-slate-900">
                  Bem-vindo ao Certifica Software - DK
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  O ambiente exclusivo da empresa <strong>{createdEmpresa.razaoSocial}</strong> foi
                  criado com catálogo inicial de NRs e notificação enviada à administração.
                </p>
              </div>
            </div>

            <dl className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">ID da Empresa (Tenant)</dt>
                <dd className="font-mono font-semibold text-slate-900">{createdEmpresa.id}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">CNPJ</dt>
                <dd className="font-mono text-slate-900">{createdEmpresa.cnpj}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Plano</dt>
                <dd className="font-medium text-slate-900">
                  {selectedPlano?.nome} ({ciclo})
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Status</dt>
                <dd className="font-semibold text-emerald-700">{createdEmpresa.status}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Sessão Autenticada</dt>
                <dd className="text-slate-900">
                  {sessionTokenIssued ? 'Ativa (JWT + Administrador)' : 'Ativa'}
                </dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={() => onEnterPanel(createdEmpresa)}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#1D4ED8] text-white text-sm font-medium hover:bg-[#1E40AF] transition-colors cursor-pointer"
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
