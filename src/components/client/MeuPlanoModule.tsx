import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  QrCode,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import type { GlobalCatalogSnapshot } from '../../services/catalogService.ts';
import {
  calcularPrecoCicloCentavos,
  formatarMoedaBRL,
  type AdicionalCatalogo,
  type PlanoCatalogo,
} from '../../data/globalCatalogSeed.ts';
import type {
  CicloCobranca,
  EffectivePlanLimits,
  EmpresaDoc,
  FaturaDoc,
} from '../../types/domain.ts';
import {
  createAddonCharge,
  createPlanCharge,
  dispatchAndApplyAsaasWebhook,
} from '../../services/billingService.ts';

interface MeuPlanoModuleProps {
  empresa: EmpresaDoc;
  limits: EffectivePlanLimits;
  catalog: GlobalCatalogSnapshot | null;
  faturas: FaturaDoc[];
  usoColaboradores: number;
  usoUsuarios: number;
  usoObras: number;
  onRefresh: () => Promise<void>;
}

export const MeuPlanoModule: React.FC<MeuPlanoModuleProps> = ({
  empresa,
  limits,
  catalog,
  faturas,
  usoColaboradores,
  usoUsuarios,
  usoObras,
  onRefresh,
}) => {
  const [ciclo, setCiclo] = useState<CicloCobranca>(empresa.ciclo || 'ANUAL');
  const [metodo, setMetodo] = useState<'PIX' | 'CARTAO_CREDITO'>('PIX');
  const [activeFatura, setActiveFatura] = useState<FaturaDoc | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const pctColab = Math.min(
    100,
    Math.round((usoColaboradores / Math.max(1, limits.limiteColaboradores)) * 100)
  );
  const pctUsers = Math.min(
    100,
    Math.round((usoUsuarios / Math.max(1, limits.limiteUsuarios)) * 100)
  );
  const pctObras = Math.min(
    100,
    Math.round((usoObras / Math.max(1, limits.limiteObras)) * 100)
  );

  const handleContractPlan = async (plano: PlanoCatalogo) => {
    setBusyId(`plan:${plano.slug}`);
    setFeedback(null);
    try {
      const fatura = await createPlanCharge({
        empresa,
        plano,
        ciclo,
        metodoPagamento: metodo,
        isUpgrade: empresa.status === 'ATIVA',
      });
      setActiveFatura(fatura);
      await onRefresh();
      setFeedback({
        type: 'ok',
        text: `Cobrança gerada no Asaas (${formatarMoedaBRL(fatura.valorCentavos)}). Efetue o pagamento ou confirme abaixo para liberação imediata.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao gerar cobrança do plano.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleContractAddon = async (adicional: AdicionalCatalogo) => {
    setBusyId(`addon:${adicional.slug}`);
    setFeedback(null);
    try {
      const fatura = await createAddonCharge({
        empresa,
        adicional,
        metodoPagamento: metodo,
      });
      setActiveFatura(fatura);
      await onRefresh();
      setFeedback({
        type: 'ok',
        text: `Cobrança do adicional "${adicional.nome}" criada. Assim que confirmada, o recurso é ativado automaticamente.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao contratar serviço adicional.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleCheckAsaasStatus = async (fatura: FaturaDoc) => {
    if (!fatura.asaasPaymentId) return;
    setBusyId(`check:${fatura.id}`);
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/billing/asaas/payment/${encodeURIComponent(fatura.asaasPaymentId)}`
      );
      const data = await res.json();
      if (data.paid) {
        await dispatchAndApplyAsaasWebhook({
          empresa,
          fatura,
          event: 'PAYMENT_CONFIRMED',
          planosCatalogo: catalog?.planos ?? [],
        });
        await onRefresh();
        setActiveFatura(null);
        setFeedback({
          type: 'ok',
          text: 'Pagamento confirmado no Asaas! Plano/adicional liberado na hora.',
        });
      } else {
        setFeedback({
          type: 'ok',
          text: `Status atual no Asaas: ${data.status || 'AGUARDANDO PAGAMENTO'}.`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao consultar status no Asaas.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmWebhook = async (fatura: FaturaDoc) => {
    setBusyId(`confirm:${fatura.id}`);
    setFeedback(null);
    try {
      await dispatchAndApplyAsaasWebhook({
        empresa,
        fatura,
        event: 'PAYMENT_CONFIRMED',
        planosCatalogo: catalog?.planos ?? [],
      });
      await onRefresh();
      setActiveFatura(null);
      setFeedback({
        type: 'ok',
        text: `Fatura "${fatura.descricao}" confirmada e recurso liberado automaticamente!`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Falha ao processar confirmação.',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`rounded-xl px-4 py-3 text-xs border flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-900 dark:text-red-200'
          }`}
        >
          {feedback.type === 'ok' && <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Resumo do Plano Atual + Barras de Consumo Real */}
      <section className="bg-white dark:bg-[#0B1120]/90 border border-slate-200 dark:border-white/10 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-mono text-slate-400">ASSINATURA ATUAL</p>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
              Plano {limits.planoNome}{' '}
              <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                ({empresa.ciclo || 'TRIAL'})
              </span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              Status da conta:{' '}
              <strong
                className={
                  empresa.status === 'ATIVA'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : empresa.status === 'TRIAL'
                      ? 'text-[#1D4ED8] dark:text-blue-400'
                      : 'text-red-700 dark:text-red-400'
                }
              >
                {empresa.status}
              </strong>
              {empresa.valorMensalCentavos
                ? ` · Equivalente a ${formatarMoedaBRL(empresa.valorMensalCentavos)}/mês`
                : ''}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">Forma preferencial:</span>
            <div className="inline-flex p-0.5 bg-slate-100 dark:bg-white/[0.06] rounded-lg">
              {(
                [
                  { id: 'PIX', label: 'Pix QR Code' },
                  { id: 'CARTAO_CREDITO', label: 'Cartão' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMetodo(m.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                    metodo === m.id ? 'bg-white dark:bg-[#0B1120]/90 text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Barras de Consumo Real */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {[
            {
              label: 'Colaboradores Ativos',
              usado: usoColaboradores,
              limite: limits.limiteColaboradores,
              pct: pctColab,
            },
            {
              label: 'Usuários / Perfis',
              usado: usoUsuarios,
              limite: limits.limiteUsuarios,
              pct: pctUsers,
            },
            {
              label: 'Contratos / Obras',
              usado: usoObras,
              limite: limits.limiteObras,
              pct: pctObras,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl p-4 space-y-2"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-200">{item.label}</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                  {item.usado} / {item.limite}
                </span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    item.pct >= 90 ? 'bg-red-600' : item.pct >= 70 ? 'bg-amber-50 dark:bg-amber-500/100' : 'bg-[#1D4ED8]'
                  }`}
                  style={{ width: `${item.pct}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.pct}% da franquia utilizada</p>
            </div>
          ))}
        </div>

        {/* Recursos Ativos */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 border-t border-slate-100 text-xs text-slate-600 dark:text-slate-300">
          <span>
            Cartas de Anuência:{' '}
            <strong className={limits.incluiCartaAnuencia ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'}>
              {limits.incluiCartaAnuencia ? 'Liberado' : 'Adicional'}
            </strong>
          </span>
          <span>
            Modelo Próprio:{' '}
            <strong className={limits.incluiModeloProprio ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'}>
              {limits.incluiModeloProprio ? 'Ativo' : 'Disponível na loja'}
            </strong>
          </span>
          <span>
            Alertas WhatsApp:{' '}
            <strong className={limits.incluiAlertasWpp ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'}>
              {limits.incluiAlertasWpp ? 'Ativo' : 'Adicional'}
            </strong>
          </span>
          <span>
            Domínio Próprio:{' '}
            <strong className={limits.incluiDominioProprio ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'}>
              {limits.incluiDominioProprio ? 'Liberado' : 'Adicional'}
            </strong>
          </span>
        </div>
      </section>

      {/* Painel de Pagamento Pix / Asaas Ativo */}
      {activeFatura && (
        <section className="bg-slate-900 text-white rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-mono text-blue-300">COBRANÇA ASAAS GERADA</p>
              <h3 className="text-base font-bold mt-0.5">{activeFatura.descricao}</h3>
              <p className="text-sm font-mono text-slate-300 mt-1">
                Valor: <strong className="text-white">{formatarMoedaBRL(activeFatura.valorCentavos)}</strong>{' '}
                · Vencimento {activeFatura.vencimentoIso}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveFatura(null)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              Ocultar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
            {activeFatura.pixQrCodeSvg && (
              <div
                className="md:col-span-3 w-40 h-40 bg-white dark:bg-[#0B1120]/90 p-2.5 rounded-xl [&>svg]:w-full [&>svg]:h-full"
                dangerouslySetInnerHTML={{ __html: activeFatura.pixQrCodeSvg }}
              />
            )}
            <div className="md:col-span-9 space-y-3">
              {activeFatura.pixQrCodePayload && (
                <div className="space-y-1.5">
                  <p className="text-xs text-slate-300">Pix Copia e Cola:</p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={activeFatura.pixQrCodePayload}
                      className="flex-1 px-3 py-2 text-xs font-mono bg-slate-800 border border-slate-700 rounded-lg text-slate-200"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard?.writeText(activeFatura.pixQrCodePayload || '');
                        setCopiedPix(true);
                        window.setTimeout(() => setCopiedPix(false), 1800);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-[#0B1120]/90 text-slate-900 dark:text-white text-xs font-medium cursor-pointer"
                    >
                      {copiedPix ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedPix ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={busyId === `check:${activeFatura.id}`}
                  onClick={() => void handleCheckAsaasStatus(activeFatura)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium hover:bg-[#1E40AF] cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Verificar Pagamento no Asaas
                </button>
                <button
                  type="button"
                  disabled={busyId === `confirm:${activeFatura.id}`}
                  onClick={() => void handleConfirmWebhook(activeFatura)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-50 dark:bg-emerald-500/100 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Confirmar Recebimento e Liberar Agora
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Upgrade / Troca de Plano */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Assinar ou Fazer Upgrade de Plano
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Liberação automática assim que o pagamento for confirmado pelo gateway Asaas.
            </p>
          </div>
          <div className="inline-flex p-1 bg-slate-200/70 dark:bg-white/[0.08] rounded-lg">
            {(
              [
                { id: 'MENSAL', label: 'Mensal' },
                { id: 'SEMESTRAL', label: 'Semestral (-10%)' },
                { id: 'ANUAL', label: 'Anual (-20%)' },
              ] as const
            ).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCiclo(c.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  ciclo === c.id ? 'bg-white dark:bg-[#0B1120]/90 text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {(catalog?.planos ?? []).map((plano) => {
            const preco = calcularPrecoCicloCentavos(
              plano.precoMensalCentavos,
              ciclo,
              plano.descontoSemestral,
              plano.descontoAnual
            );
            const isCurrent =
              empresa.status === 'ATIVA' && empresa.planoSlug === plano.slug && empresa.ciclo === ciclo;

            return (
              <div
                key={plano.id}
                className={`bg-white dark:bg-[#0B1120]/90 rounded-xl p-5 border flex flex-col justify-between ${
                  plano.destaque ? 'border-[#1D4ED8]' : 'border-slate-200 dark:border-white/10'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">{plano.nome}</h4>
                    {isCurrent && (
                      <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">Atual</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{plano.subtitulo}</p>

                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                      {formatarMoedaBRL(preco.mensalEquivalenteCentavos)}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">/mês</span>
                    {ciclo !== 'MENSAL' && (
                      <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                        Total {formatarMoedaBRL(preco.totalPeriodoCentavos)} no ciclo
                      </p>
                    )}
                  </div>

                  <ul className="mt-4 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <li>Até {plano.limiteColaboradores} colaboradores</li>
                    <li>Até {plano.limiteUsuarios} usuários</li>
                    <li>Até {plano.limiteObras} contratos/obras</li>
                    {plano.incluiCartaAnuencia && <li>Cartas de Anuência inclusas</li>}
                    {plano.incluiAlertasWpp && <li>Alertas WhatsApp inclusos</li>}
                  </ul>
                </div>

                <button
                  type="button"
                  disabled={isCurrent || busyId === `plan:${plano.slug}`}
                  onClick={() => void handleContractPlan(plano)}
                  className={`mt-5 w-full py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
                    plano.destaque
                      ? 'bg-[#1D4ED8] text-white hover:bg-[#1E40AF]'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {isCurrent
                    ? 'Plano Atual'
                    : busyId === `plan:${plano.slug}`
                      ? 'Gerando cobrança...'
                      : empresa.status === 'TRIAL'
                        ? 'Assinar Agora'
                        : 'Fazer Upgrade'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Loja de Serviços Adicionais */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#1D4ED8] dark:text-blue-400" />
            Serviços Adicionais (Add-ons)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Expanda sua capacidade ou ative módulos exclusivos com liberação automática.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(catalog?.adicionais ?? []).map((addon) => {
            const alreadyActive =
              addon.incrementoQtd === 0 && (empresa.adicionaisAtivos ?? []).includes(addon.slug);

            return (
              <div
                key={addon.id}
                className="bg-white dark:bg-[#0B1120]/90 border border-slate-200 dark:border-white/10 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{addon.nome}</h4>
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-white shrink-0">
                      {formatarMoedaBRL(addon.precoMensalCentavos)}
                      <span className="font-normal text-slate-400">
                        {addon.tipoCobranca === 'RECORRENTE' ? '/mês' : ' único'}
                      </span>
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                    {addon.descricao}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={alreadyActive || busyId === `addon:${addon.slug}`}
                  onClick={() => void handleContractAddon(addon)}
                  className={`w-full py-2 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                    alreadyActive
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800'
                      : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1120]/90 text-slate-900 dark:text-white hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  {alreadyActive
                    ? 'Já ativo na sua conta'
                    : busyId === `addon:${addon.slug}`
                      ? 'Gerando cobrança...'
                      : 'Contratar Adicional'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Histórico de Faturas */}
      <section className="bg-white dark:bg-[#0B1120]/90 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-slate-700 dark:text-slate-200" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Histórico de Faturas ({faturas.length})
            </h3>
          </div>
        </div>

        {faturas.length === 0 ? (
          <p className="p-6 text-xs text-slate-500 dark:text-slate-400 text-center">
            Nenhuma fatura emitida até o momento.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-white/[0.04] border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-5">Descrição</th>
                  <th className="py-3 px-4">Vencimento</th>
                  <th className="py-3 px-4">Valor</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {faturas.map((fat) => (
                  <tr key={fat.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.05] dark:bg-white/[0.04]/70 dark:bg-white/[0.03]">
                    <td className="py-3 px-5 font-medium text-slate-900 dark:text-white">{fat.descricao}</td>
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">{fat.vencimentoIso}</td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-white">
                      {formatarMoedaBRL(fat.valorCentavos)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-semibold ${
                          fat.status === 'PAGA'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : fat.status === 'VENCIDA'
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-amber-700'
                        }`}
                      >
                        {fat.status}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-right space-x-2 whitespace-nowrap">
                      {fat.status !== 'PAGA' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setActiveFatura(fat)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.05] dark:bg-white/[0.04] cursor-pointer"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            Pix / Pagar
                          </button>
                          <button
                            type="button"
                            disabled={busyId === `confirm:${fat.id}`}
                            onClick={() => void handleConfirmWebhook(fat)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 cursor-pointer"
                          >
                            Confirmar
                          </button>
                        </>
                      )}
                      {fat.invoiceUrl && fat.invoiceUrl.startsWith('http') && (
                        <a
                          href={fat.invoiceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] dark:text-blue-400 hover:underline"
                        >
                          Fatura
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
