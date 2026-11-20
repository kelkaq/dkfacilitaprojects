import React, { useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  Lock,
  Save,
  Search,
  Settings2,
  Trash2,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import type { GlobalCatalogSnapshot } from '../../services/catalogService.ts';
import {
  calcularPrecoCicloCentavos,
  formatarMoedaBRL,
} from '../../data/globalCatalogSeed.ts';
import type { CicloCobranca, EmpresaDoc, StatusEmpresa } from '../../types/domain.ts';
import { adminUpdateEmpresa } from '../../services/superAdminService.ts';

interface SuperAdminCompaniesProps {
  empresas: EmpresaDoc[];
  catalog: GlobalCatalogSnapshot | null;
  onRefresh: () => Promise<void>;
  onImpersonateClient: (empresaId: string) => void;
}

const FEATURE_FLAG_DEFINITIONS = [
  {
    key: 'modelo_proprio',
    addonSlug: 'modelo-proprio-certificado',
    label: 'Modelo Próprio de Certificado',
    desc: 'Habilita a arte/PowerPoint exclusivo (.pptx ou arte) desta empresa na emissão.',
  },
  {
    key: 'carta_anuencia_dossie',
    addonSlug: 'cartas-anuencia-dossie',
    label: 'Cartas de Anuência & Dossiê',
    desc: 'Libera emissão de cartas de anuência vinculadas ao dossiê do colaborador.',
  },
  {
    key: 'alertas_whatsapp',
    addonSlug: 'alertas-whatsapp',
    label: 'Alertas Automáticos WhatsApp',
    desc: 'Ativa avisos automáticos de reciclagem (60, 30, 15, 7 e 1 dia).',
  },
  {
    key: 'selfie_prova',
    addonSlug: null,
    label: 'Selfie na Prova Online',
    desc: 'Permite exigir captura de selfie junto ao CPF + PIN nas turmas.',
  },
  {
    key: 'dominio_proprio',
    addonSlug: 'dominio-proprio',
    label: 'Domínio Próprio (White-Label)',
    desc: 'Permite apontamento de subdomínio personalizado para a empresa.',
  },
] as const;

const PPTX_SUPPORTED_TAGS = [
  '{{NOME_COLABORADOR}}',
  '{{CPF}}',
  '{{FUNCAO}}',
  '{{NORMA_NR}}',
  '{{CARGA_HORARIA}}',
  '{{DATA_REALIZACAO}}',
  '{{DATA_VALIDADE}}',
  '{{CONTEUDO_COLUNA_1}}',
  '{{CONTEUDO_COLUNA_2}}',
  '{{QRCODE}}',
  '{{ASSINATURA_ALUNO}}',
  '{{ASSINATURA_INSTRUTOR}}',
  '{{ASSINATURA_RT}}',
] as const;

interface PptxUploadInfo {
  fileName: string;
  slideCount: number;
  detectedTags: string[];
  sizeBytes: number;
}

export const SuperAdminCompanies: React.FC<SuperAdminCompaniesProps> = ({
  empresas,
  catalog,
  onRefresh,
  onImpersonateClient,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ATIVA' | 'TRIAL' | 'BLOQUEADA'>('ALL');
  const [managingEmpresa, setManagingEmpresa] = useState<EmpresaDoc | null>(null);

  // Estado do drawer de gerenciamento
  const [editPlanoSlug, setEditPlanoSlug] = useState('');
  const [editCiclo, setEditCiclo] = useState<CicloCobranca>('ANUAL');
  const [editStatus, setEditStatus] = useState<StatusEmpresa>('ATIVA');
  const [editTrialIso, setEditTrialIso] = useState('');
  const [editFlags, setEditFlags] = useState<Record<string, boolean>>({});
  const [editAddons, setEditAddons] = useState<string[]>([]);
  const [editModeloProprioUrl, setEditModeloProprioUrl] = useState<string | null>(null);

  const [uploadingPptx, setUploadingPptx] = useState(false);
  const [pptxInfo, setPptxInfo] = useState<PptxUploadInfo | null>(null);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return empresas.filter((e) => {
      if (statusFilter === 'ATIVA' && e.status !== 'ATIVA') return false;
      if (statusFilter === 'TRIAL' && e.status !== 'TRIAL') return false;
      if (
        statusFilter === 'BLOQUEADA' &&
        e.status !== 'INADIMPLENTE' &&
        e.status !== 'SUSPENSA' &&
        e.status !== 'CANCELADA'
      ) {
        return false;
      }
      if (!q) return true;
      return (
        e.razaoSocial.toLowerCase().includes(q) ||
        e.cnpj.includes(q) ||
        e.emailFinanceiro.toLowerCase().includes(q)
      );
    });
  }, [empresas, search, statusFilter]);

  const openManager = (emp: EmpresaDoc) => {
    setManagingEmpresa(emp);
    setEditPlanoSlug(emp.planoSlug || catalog?.planos[0]?.slug || 'profissional');
    setEditCiclo(emp.ciclo || 'ANUAL');
    setEditStatus(emp.status);
    setEditTrialIso(emp.trialExpiraEmIso ? emp.trialExpiraEmIso.slice(0, 10) : '');
    const flags: Record<string, boolean> = {
      selfie_prova: true,
      ...(emp.featureFlags ?? {}),
    };
    const addons = emp.adicionaisAtivos ?? [];
    for (const def of FEATURE_FLAG_DEFINITIONS) {
      if (def.addonSlug && addons.includes(def.addonSlug)) {
        flags[def.key] = true;
      }
    }
    setEditFlags(flags);
    setEditAddons(addons);
    setEditModeloProprioUrl(emp.modeloProprioUrl || null);
    setPptxInfo(null);
    setFeedback(null);
  };

  const handleExtendTrial = (days: number) => {
    const baseMs = editTrialIso
      ? Math.max(Date.now(), new Date(`${editTrialIso}T12:00:00`).getTime())
      : Date.now();
    const nextDate = new Date(baseMs + days * 24 * 60 * 60 * 1000);
    setEditTrialIso(nextDate.toISOString().slice(0, 10));
    setEditStatus('TRIAL');
  };

  const handleToggleFlag = (key: string, addonSlug: string | null) => {
    const nextVal = !editFlags[key];
    setEditFlags((prev) => ({ ...prev, [key]: nextVal }));
    if (addonSlug) {
      setEditAddons((prev) =>
        nextVal
          ? Array.from(new Set([...prev, addonSlug]))
          : prev.filter((slug) => slug !== addonSlug)
      );
    }
  };

  const handleCopyTag = async (tag: string) => {
    await navigator.clipboard?.writeText(tag);
    setCopiedTag(tag);
    window.setTimeout(() => setCopiedTag(null), 1400);
  };

  const handleUploadPptxTemplate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !managingEmpresa) return;
    if (!file.name.toLowerCase().endsWith('.pptx')) {
      setFeedback({
        type: 'err',
        text: 'Selecione um arquivo PowerPoint válido com extensão .pptx.',
      });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setFeedback({
        type: 'err',
        text: 'O arquivo .pptx excede o limite de 15 MB.',
      });
      return;
    }

    setUploadingPptx(true);
    setFeedback(null);
    try {
      const base64Content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          const idx = result.indexOf(',');
          resolve(idx >= 0 ? result.slice(idx + 1) : result);
        };
        reader.onerror = () => reject(new Error('Falha ao ler arquivo .pptx.'));
        reader.readAsDataURL(file);
      });

      const resp = await fetch('/api/certificates/pptx-template/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresaId: managingEmpresa.id,
          fileName: file.name,
          base64Content,
        }),
      });
      const json = (await resp.json()) as {
        ok?: boolean;
        error?: string;
        templateRef?: string;
        fileName?: string;
        slideCount?: number;
        detectedTags?: string[];
        sizeBytes?: number;
      };

      if (!resp.ok || !json.ok || !json.templateRef) {
        throw new Error(json.error || 'Erro ao validar arquivo .pptx no servidor.');
      }

      setEditModeloProprioUrl(json.templateRef);
      setPptxInfo({
        fileName: json.fileName || file.name,
        slideCount: json.slideCount ?? 0,
        detectedTags: json.detectedTags ?? [],
        sizeBytes: json.sizeBytes ?? file.size,
      });
      setEditFlags((prev) => ({ ...prev, modelo_proprio: true }));
      setEditAddons((prev) =>
        Array.from(new Set([...prev, 'modelo-proprio-certificado']))
      );
      setFeedback({
        type: 'ok',
        text: `Modelo PowerPoint (.pptx) validado (${json.slideCount ?? 0} slide(s), ${(json.detectedTags ?? []).length} tag(s) dinâmica(s) detectada(s)). Clique em "Salvar Alterações da Empresa" para ativar.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao enviar modelo .pptx.',
      });
    } finally {
      setUploadingPptx(false);
      e.target.value = '';
    }
  };

  const handleUploadModeloProprioImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 140 * 1024) {
      setFeedback({
        type: 'err',
        text: 'Para arte em imagem, envie PNG, JPG ou SVG de até 140 KB (ou use o upload .pptx acima).',
      });
      return;
    }
    setFeedback(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setEditModeloProprioUrl(reader.result);
        setPptxInfo(null);
        setEditFlags((prev) => ({ ...prev, modelo_proprio: true }));
        setEditAddons((prev) =>
          Array.from(new Set([...prev, 'modelo-proprio-certificado']))
        );
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCompanyChanges = async () => {
    if (!managingEmpresa) return;
    setSaving(true);
    setFeedback(null);
    try {
      const targetPlano =
        catalog?.planos.find((p) => p.slug === editPlanoSlug) ?? catalog?.planos[0];
      const preco = targetPlano
        ? calcularPrecoCicloCentavos(
            targetPlano.precoMensalCentavos,
            editCiclo,
            targetPlano.descontoSemestral,
            targetPlano.descontoAnual
          )
        : null;

      await adminUpdateEmpresa(managingEmpresa.id, {
        status: editStatus,
        planoId: targetPlano?.id ?? managingEmpresa.planoId ?? null,
        planoSlug: targetPlano?.slug ?? editPlanoSlug,
        ciclo: editCiclo,
        valorMensalCentavos:
          preco?.mensalEquivalenteCentavos ?? managingEmpresa.valorMensalCentavos ?? 0,
        trialExpiraEmIso: editTrialIso ? new Date(`${editTrialIso}T23:59:59Z`).toISOString() : null,
        featureFlags: editFlags,
        adicionaisAtivos: editAddons,
        modeloProprioUrl: editModeloProprioUrl,
      });

      await onRefresh();
      setFeedback({
        type: 'ok',
        text: `Alterações aplicadas imediatamente na conta ${managingEmpresa.razaoSocial}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao atualizar empresa.',
      });
    } finally {
      setSaving(false);
    }
  };

  const isPptxTemplateRef = Boolean(editModeloProprioUrl?.startsWith('pptx://'));
  const pptxRefFilename = isPptxTemplateRef
    ? editModeloProprioUrl!.split('/').slice(3).join('/') || 'modelo.pptx'
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Gestão de Empresas Clientes ({empresas.length})
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Altere planos, estenda trials, bloqueie/desbloqueie acesso, controle feature flags e
            submeta modelos próprios em PowerPoint (.pptx) por empresa_id.
          </p>
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="dk-glass-card rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'ALL', label: `Todas (${empresas.length})` },
              {
                id: 'ATIVA',
                label: `Ativas (${empresas.filter((e) => e.status === 'ATIVA').length})`,
              },
              {
                id: 'TRIAL',
                label: `Trial (${empresas.filter((e) => e.status === 'TRIAL').length})`,
              },
              {
                id: 'BLOQUEADA',
                label: `Inadimplentes / Suspensas (${
                  empresas.filter((e) => e.status !== 'ATIVA' && e.status !== 'TRIAL').length
                })`,
              },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                statusFilter === f.id
                  ? 'bg-[#1D4ED8] text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar empresa, CNPJ ou e-mail..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Tabela de Empresas */}
      <div className="dk-glass-card rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Nenhuma empresa encontrada com o filtro selecionado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-5">Empresa / CNPJ</th>
                  <th className="py-3 px-4">Plano / Ciclo</th>
                  <th className="py-3 px-4">MRR</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Adicionais / Modelo</th>
                  <th className="py-3 px-5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filtered.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
                    <td className="py-3 px-5">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {emp.razaoSocial}
                      </p>
                      <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {emp.cnpj} · {emp.emailFinanceiro}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900 dark:text-slate-100 uppercase">
                        {emp.planoSlug || 'trial'}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {emp.ciclo || 'TRIAL'}
                      </p>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-white">
                      {emp.status === 'ATIVA'
                        ? formatarMoedaBRL(emp.valorMensalCentavos ?? 0)
                        : 'R$ 0,00'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 font-semibold ${
                          emp.status === 'ATIVA'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : emp.status === 'TRIAL'
                              ? 'text-[#1D4ED8] dark:text-blue-400'
                              : 'text-red-700 dark:text-red-400'
                        }`}
                      >
                        {emp.status === 'ATIVA' && <span className="dk-live-dot" />}
                        {emp.status}
                      </span>
                      {emp.status === 'TRIAL' && emp.trialExpiraEmIso && (
                        <p className="text-[11px] font-mono text-slate-400">
                          até {emp.trialExpiraEmIso.slice(0, 10)}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      <span className="font-mono">
                        {(emp.adicionaisAtivos ?? []).length} add-on(s)
                      </span>
                      {emp.modeloProprioUrl && (
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                          {emp.modeloProprioUrl.startsWith('pptx://')
                            ? 'Modelo PowerPoint (.pptx) ativo'
                            : 'Arte exclusiva ativa'}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-5 text-right whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        onClick={() => onImpersonateClient(emp.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Painel
                      </button>
                      <button
                        type="button"
                        onClick={() => openManager(emp)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium hover:bg-[#1E40AF] cursor-pointer"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                        Gerenciar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Painel Lateral (Drawer) de Gerenciamento da Empresa */}
      {managingEmpresa && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-xl bg-white dark:bg-[#0B1120] border-l border-slate-200 dark:border-white/10 h-full shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-mono text-slate-400">{managingEmpresa.id}</p>
                <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                  {managingEmpresa.razaoSocial}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setManagingEmpresa(null)}
                className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {feedback && (
                <div
                  className={`rounded-xl px-4 py-3 text-xs border flex items-center gap-2 ${
                    feedback.type === 'ok'
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
                      : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-900 dark:text-red-200'
                  }`}
                >
                  {feedback.type === 'ok' && (
                    <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  )}
                  <span>{feedback.text}</span>
                </div>
              )}

              {/* Plano, Ciclo e Status */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
                  1. Plano, Ciclo e Controle de Acesso
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Plano Contratado
                    </label>
                    <select
                      value={editPlanoSlug}
                      onChange={(e) => setEditPlanoSlug(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-white/10 rounded-lg bg-white dark:bg-[#060913] text-slate-900 dark:text-white"
                    >
                      {(catalog?.planos ?? []).map((p) => (
                        <option key={p.id} value={p.slug}>
                          {p.nome} ({formatarMoedaBRL(p.precoMensalCentavos)}/mês)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Ciclo de Cobrança
                    </label>
                    <select
                      value={editCiclo}
                      onChange={(e) => setEditCiclo(e.target.value as CicloCobranca)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-white/10 rounded-lg bg-white dark:bg-[#060913] text-slate-900 dark:text-white"
                    >
                      <option value="MENSAL">Mensal</option>
                      <option value="SEMESTRAL">Semestral (-10%)</option>
                      <option value="ANUAL">Anual (-20%)</option>
                    </select>
                  </div>
                </div>

                {/* Ações Rápidas de Status */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditStatus('ATIVA')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                      editStatus === 'ATIVA'
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    Ativa (Liberada)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditStatus('TRIAL')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                      editStatus === 'TRIAL'
                        ? 'bg-[#1D4ED8] border-[#1D4ED8] text-white'
                        : 'border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Em Trial
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditStatus('SUSPENSA')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                      editStatus === 'SUSPENSA' || editStatus === 'INADIMPLENTE'
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Bloquear / Suspender
                  </button>
                </div>

                {/* Extensão de Trial */}
                <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Expiração do Trial:
                    </span>
                    <input
                      type="date"
                      value={editTrialIso}
                      onChange={(e) => setEditTrialIso(e.target.value)}
                      className="ml-2 px-2 py-1 text-xs font-mono bg-white dark:bg-[#060913] border border-slate-200 dark:border-white/10 rounded text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[7, 15, 30].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => handleExtendTrial(d)}
                        className="px-2 py-1 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.05] text-[11px] font-mono font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                      >
                        +{d}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Chaves de Liberação (Feature Flags) */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
                  2. Chaves de Liberação (Feature Flags)
                </h4>
                <div className="divide-y divide-slate-100 dark:divide-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
                  {FEATURE_FLAG_DEFINITIONS.map((def) => {
                    const enabled = Boolean(editFlags[def.key]);
                    return (
                      <div
                        key={def.key}
                        className="px-4 py-3 flex items-center justify-between gap-4 bg-white dark:bg-white/[0.02]"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white">
                            {def.label}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {def.desc}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={enabled}
                          onClick={() => handleToggleFlag(def.key, def.addonSlug)}
                          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer ${
                            enabled ? 'bg-[#1D4ED8]' : 'bg-slate-200 dark:bg-slate-700'
                          }`}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                              enabled ? 'translate-x-5.5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Upload do Modelo Próprio via PowerPoint (.pptx) */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
                  3. Modelo Próprio Exclusivo via PowerPoint (.pptx)
                </h4>
                <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl p-4 space-y-4">
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Envie o modelo de certificado em <strong className="text-slate-900 dark:text-white">PowerPoint (.pptx)</strong>{' '}
                    personalizado de <strong>{managingEmpresa.razaoSocial}</strong>. Na emissão, o
                    motor preserva 100% das camadas/vetores, substitui as tags dinâmicas abaixo e
                    converte para PDF vetorial via LibreOffice Headless.
                  </p>

                  {/* Estado atual do modelo vinculado */}
                  {editModeloProprioUrl && (
                    <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-500/10 p-3 space-y-2.5">
                      {isPptxTemplateRef ? (
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <FileSpreadsheet className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-emerald-950 dark:text-emerald-200 truncate">
                                {pptxInfo?.fileName || pptxRefFilename}
                              </p>
                              <p className="text-[11px] font-mono text-emerald-800 dark:text-emerald-300/80">
                                Vinculado exclusivamente ao empresa_id {managingEmpresa.id}
                              </p>
                              {pptxInfo && (
                                <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-1">
                                  {pptxInfo.slideCount} slide(s) · {pptxInfo.detectedTags.length}{' '}
                                  tag(s) detectada(s) ·{' '}
                                  {(pptxInfo.sizeBytes / 1024).toFixed(0)} KB
                                </p>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditModeloProprioUrl(null);
                              setPptxInfo(null);
                            }}
                            className="inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-400 hover:underline cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remover
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <img
                            src={editModeloProprioUrl}
                            alt="Arte Modelo Próprio"
                            className="w-full max-h-36 object-contain bg-white border border-slate-200 rounded-lg p-2"
                          />
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                              Arte de fundo vinculada a {managingEmpresa.id}
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditModeloProprioUrl(null)}
                              className="inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-400 hover:underline cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Remover Arte
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Botões de Upload (.pptx principal + imagem opcional) */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1D4ED8] text-white text-xs font-semibold hover:bg-[#1E40AF] cursor-pointer shadow-sm shadow-blue-600/20">
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingPptx
                        ? 'Validando .pptx...'
                        : 'Subir Modelo PowerPoint (.pptx)'}
                      <input
                        type="file"
                        accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                        disabled={uploadingPptx}
                        onChange={(e) => void handleUploadPptxTemplate(e)}
                        className="hidden"
                      />
                    </label>

                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      Fundo PNG/JPG/SVG (opcional)
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml"
                        onChange={handleUploadModeloProprioImage}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* Lista interativa das 13 Tags Dinâmicas suportadas no .pptx */}
                  <div className="pt-2 border-t border-slate-200 dark:border-white/10 space-y-2">
                    <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Tags suportadas no PowerPoint (.pptx) — clique para copiar:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {PPTX_SUPPORTED_TAGS.map((tag) => {
                        const detected = pptxInfo?.detectedTags.includes(tag);
                        const isCopied = copiedTag === tag;
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => void handleCopyTag(tag)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-mono text-[10px] border transition-colors cursor-pointer ${
                              detected
                                ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300'
                                : 'bg-white dark:bg-[#060913] border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-blue-400'
                            }`}
                          >
                            <span>{tag}</span>
                            {isCopied ? (
                              <Check className="w-2.5 h-2.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-2.5 h-2.5 opacity-60" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Rodapé Salvar */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#060913] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setManagingEmpresa(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 cursor-pointer"
              >
                Fechar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSaveCompanyChanges()}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#1D4ED8] text-white text-xs font-semibold hover:bg-[#1E40AF] cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Aplicando...' : 'Salvar Alterações da Empresa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
