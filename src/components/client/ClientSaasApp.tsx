import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BookOpen,
  CalendarClock,
  CheckCheck,
  CreditCard,
  FileBadge,
  Globe,
  GraduationCap,
  Info,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { auth } from '../../lib/firebase.ts';
import type { GlobalCatalogSnapshot } from '../../services/catalogService.ts';
import type {
  AssinaturaDigitalDoc,
  CartaAnuenciaDoc,
  CertificadoDoc,
  ColaboradorDoc,
  ComunicadoDoc,
  EmpresaDoc,
  FaturaDoc,
  MembroDoc,
  ObraDoc,
  ProvaTentativaDoc,
  TreinamentoEmpresaDoc,
  TurmaDoc,
} from '../../types/domain.ts';
import {
  computeEffectivePlanLimits,
  evaluateEmpresaAccess,
} from '../../services/planGuardService.ts';
import {
  getEmpresaById,
  listMembrosEmpresa,
} from '../../services/tenantAuthService.ts';
import { listFaturasEmpresa } from '../../services/billingService.ts';
import {
  listAssinaturasDigitais,
  listCartasAnuencia,
  listCertificados,
  listColaboradores,
  listObras,
  listTentativasTurma,
  listTreinamentosEmpresa,
  listTurmas,
} from '../../services/operationalCrudService.ts';
import {
  filterComunicadosForEmpresa,
  listComunicados,
  listComunicadosLidosEmpresa,
  markComunicadoLido,
} from '../../services/cmsAndCommsService.ts';
import { ThemeToggleButton } from '../ThemeProvider.tsx';
import { ExecutiveDashboard } from './ExecutiveDashboard.tsx';
import { NrsManagerModule } from './NrsManagerModule.tsx';
import { TurmasProvasModule } from './TurmasProvasModule.tsx';
import { ColaboradoresDossieModule } from './ColaboradoresDossieModule.tsx';
import { CertificadosVencimentosModule } from './CertificadosVencimentosModule.tsx';
import { MeuPlanoModule } from './MeuPlanoModule.tsx';
import {
  ConfiguracoesCertificadosModule,
  type ConfiguracoesSubTab,
} from './ConfiguracoesCertificadosModule.tsx';
import { CertificateViewerModal } from './CertificateViewerModal.tsx';
import { CertificateDetailsModal } from './CertificateDetailsModal.tsx';
import {
  DocumentPrintModal,
  type VectorDocumentRequest,
} from './DocumentPrintModal.tsx';
import { formatDocumentWithLabel } from '../../lib/brazilAddress.ts';

export type ClientTab =
  | 'dashboard'
  | 'nrs'
  | 'turmas'
  | 'colaboradores'
  | 'certificados'
  | 'vencimentos'
  | 'configuracoes'
  | 'plano';

interface ClientSaasAppProps {
  userEmail: string;
  userName: string;
  catalog: GlobalCatalogSnapshot | null;
  empresas: EmpresaDoc[];
  selectedEmpresaId: string | null;
  onSelectEmpresaId: (id: string) => void;
  onEmpresaUpdated: (updated: EmpresaDoc) => void;
  onCreateCompanyCheckout: () => void;
  onOpenOnboarding: (empresa: EmpresaDoc) => void;
  onOpenPublicExam: (params: {
    tokenPublico: string;
    cpf?: string;
    nome?: string;
    colaboradorId?: string;
  }) => void;
  onOpenPublicDossier: (token: string) => void;
  onBackToSite: () => void;
  onLogout: () => Promise<void>;
}

export const ClientSaasApp: React.FC<ClientSaasAppProps> = ({
  userEmail,
  userName,
  catalog,
  empresas,
  selectedEmpresaId,
  onSelectEmpresaId,
  onEmpresaUpdated,
  onCreateCompanyCheckout,
  onOpenOnboarding,
  onOpenPublicExam,
  onOpenPublicDossier,
  onBackToSite,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<ClientTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Dados reais do tenant logado (isolados por empresa_id)
  const [loadingTenant, setLoadingTenant] = useState(false);
  const [obras, setObras] = useState<ObraDoc[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorDoc[]>([]);
  const [treinamentos, setTreinamentos] = useState<TreinamentoEmpresaDoc[]>([]);
  const [turmas, setTurmas] = useState<TurmaDoc[]>([]);
  const [certificados, setCertificados] = useState<CertificadoDoc[]>([]);
  const [cartas, setCartas] = useState<CartaAnuenciaDoc[]>([]);
  const [tentativas, setTentativas] = useState<ProvaTentativaDoc[]>([]);
  const [assinaturas, setAssinaturas] = useState<AssinaturaDigitalDoc[]>([]);
  const [faturas, setFaturas] = useState<FaturaDoc[]>([]);
  const [membros, setMembros] = useState<MembroDoc[]>([]);
  const [comunicadosRaw, setComunicadosRaw] = useState<ComunicadoDoc[]>([]);
  const [comunicadosLidosIds, setComunicadosLidosIds] = useState<string[]>([]);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [dismissedPopupIds, setDismissedPopupIds] = useState<string[]>([]);

  // Modais e estados cruzados
  const [viewerState, setViewerState] = useState<{
    cert: CertificadoDoc;
    hideColabSig: boolean;
  } | null>(null);
  const [detailsCert, setDetailsCert] = useState<CertificadoDoc | null>(null);
  const [vectorDoc, setVectorDoc] = useState<VectorDocumentRequest | null>(null);
  const [recyclingCertPrefill, setRecyclingCertPrefill] = useState<CertificadoDoc | null>(null);
  const [configSubTabTarget, setConfigSubTabTarget] = useState<ConfiguracoesSubTab | undefined>(
    undefined
  );

  const empresa = useMemo(() => {
    if (!empresas.length) return null;
    return empresas.find((e) => e.id === selectedEmpresaId) ?? empresas[0];
  }, [empresas, selectedEmpresaId]);

  const loadTenantData = useCallback(
    async (empresaId: string) => {
      setLoadingTenant(true);
      try {
        const [
          freshEmpresa,
          obrasList,
          colabList,
          treinList,
          turmasList,
          certsList,
          cartasList,
          tentList,
          sigList,
          fatList,
          membrosList,
          comList,
          lidosIds,
        ] = await Promise.all([
          getEmpresaById(empresaId),
          listObras(empresaId),
          listColaboradores(empresaId),
          listTreinamentosEmpresa(empresaId),
          listTurmas(empresaId),
          listCertificados(empresaId),
          listCartasAnuencia(empresaId),
          listTentativasTurma(empresaId),
          listAssinaturasDigitais(empresaId),
          listFaturasEmpresa(empresaId),
          listMembrosEmpresa(empresaId),
          listComunicados(false).catch(() => []),
          listComunicadosLidosEmpresa(empresaId),
        ]);

        if (freshEmpresa) {
          onEmpresaUpdated(freshEmpresa);
        }
        setObras(obrasList);
        setColaboradores(colabList);
        setTreinamentos(treinList);
        setTurmas(turmasList);
        setCertificados(certsList);
        setCartas(cartasList);
        setTentativas(tentList);
        setAssinaturas(sigList);
        setFaturas(fatList);
        setMembros(membrosList);
        setComunicadosRaw(comList);
        setComunicadosLidosIds(lidosIds);
      } finally {
        setLoadingTenant(false);
      }
    },
    [onEmpresaUpdated]
  );

  useEffect(() => {
    if (!empresa?.id) return;
    void loadTenantData(empresa.id);
  }, [empresa?.id, loadTenantData]);

  const comunicadosElegiveis = useMemo(
    () => (empresa ? filterComunicadosForEmpresa(comunicadosRaw, empresa) : []),
    [comunicadosRaw, empresa]
  );

  const unreadComunicados = useMemo(
    () => comunicadosElegiveis.filter((c) => !comunicadosLidosIds.includes(c.id)),
    [comunicadosElegiveis, comunicadosLidosIds]
  );

  const priorityPopupComunicado = useMemo(
    () =>
      unreadComunicados.find(
        (c) => c.exibirPopup && !dismissedPopupIds.includes(c.id)
      ) ?? null,
    [unreadComunicados, dismissedPopupIds]
  );

  const handleMarkComunicadoRead = async (comunicadoId: string) => {
    if (!empresa) return;
    setComunicadosLidosIds((prev) =>
      prev.includes(comunicadoId) ? prev : [...prev, comunicadoId]
    );
    setDismissedPopupIds((prev) =>
      prev.includes(comunicadoId) ? prev : [...prev, comunicadoId]
    );
    await markComunicadoLido(
      empresa.id,
      comunicadoId,
      auth.currentUser?.uid || empresa.ownerUid
    ).catch(() => {});
  };

  const handleMarkAllComunicadosRead = async () => {
    if (!empresa) return;
    for (const c of unreadComunicados) {
      await handleMarkComunicadoRead(c.id);
    }
  };

  const limits = useMemo(() => {
    if (!empresa) return null;
    return computeEffectivePlanLimits(
      empresa,
      catalog?.planos ?? [],
      catalog?.adicionais ?? []
    );
  }, [empresa, catalog]);

  const accessDecision = useMemo(
    () => (empresa ? evaluateEmpresaAccess(empresa) : { permitido: true }),
    [empresa]
  );

  const pendingFatura = useMemo(
    () => faturas.find((f) => f.status === 'PENDENTE' || f.status === 'VENCIDA') ?? null,
    [faturas]
  );

  const handleScheduleRecycling = (cert: CertificadoDoc) => {
    setRecyclingCertPrefill(cert);
    setActiveTab('turmas');
  };

  const handleOpenCertificate = (cert: CertificadoDoc, hideCollaboratorSig = false) => {
    setViewerState({ cert, hideColabSig: Boolean(hideCollaboratorSig) });
  };

  const navItems: {
    id: ClientTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'nrs', label: 'NRs & Conteúdo', icon: BookOpen },
    { id: 'turmas', label: 'Turmas & Provas', icon: GraduationCap },
    { id: 'colaboradores', label: 'Colaboradores & Dossiê', icon: Users },
    { id: 'certificados', label: 'Certificados', icon: FileBadge },
    { id: 'vencimentos', label: 'Vencimentos', icon: CalendarClock },
    { id: 'configuracoes', label: 'Configurações & Certificados', icon: Settings },
    { id: 'plano', label: 'Meu Plano', icon: CreditCard },
  ];

  // Caso o usuário autenticado ainda não tenha nenhuma empresa cadastrada
  if (!empresa || !limits) {
    return (
      <div className="min-h-screen dk-ambient-canvas flex flex-col">
        <header className="bg-white/85 dark:bg-[#060913]/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/10 px-6 py-4 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900 dark:text-white">
            DK Facilita · Certifica Software - DK
          </span>
          <div className="flex items-center gap-2">
            <ThemeToggleButton compact />
            <button
              type="button"
              onClick={onBackToSite}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
            >
              Site dkfacilita.com
            </button>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full dk-glass-card rounded-2xl p-8 text-center space-y-5">
            <div className="w-12 h-12 rounded-xl bg-[#1D4ED8] text-white flex items-center justify-center mx-auto font-bold text-sm shadow-lg shadow-blue-600/25">
              DK
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                Nenhuma empresa vinculada ainda
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                Crie sua empresa agora com 7 dias de teste grátis para liberar o painel completo do{' '}
                <strong className="text-slate-900 dark:text-white">Certifica Software - DK</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={onCreateCompanyCheckout}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#1D4ED8] text-white text-sm font-medium hover:bg-[#1E40AF] cursor-pointer shadow-lg shadow-blue-600/20"
            >
              <Plus className="w-4 h-4" />
              Criar Minha Empresa (7 Dias Grátis)
            </button>
          </div>
        </main>
      </div>
    );
  }

  const sidebarContent = (
    <div className="h-full flex flex-col bg-[#0B1120] dark:bg-[#060913] text-slate-200 border-r border-slate-800/90 dark:border-white/10 select-none">
      {/* Identidade Dinâmica da Empresa Cliente */}
      <div className="px-5 py-5 border-b border-slate-800/80 dark:border-white/10 space-y-3">
        <div className="flex items-center gap-3 min-w-0">
          {empresa.logoUrl ? (
            <img
              src={empresa.logoUrl}
              alt={empresa.razaoSocial}
              className="w-9 h-9 rounded-lg object-contain bg-white p-1 shrink-0"
            />
          ) : (
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-md"
              style={{ backgroundColor: empresa.corPrimaria || '#1D4ED8' }}
            >
              {(empresa.prefixoCertificado || 'DK').slice(0, 3)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {empresa.certificadoNomeExibicao || empresa.nomeFantasia || empresa.razaoSocial}
            </p>
            <p className="text-[11px] text-slate-400 truncate">Certifica Software - DK</p>
          </div>
        </div>

        {empresas.length > 1 && (
          <select
            value={empresa.id}
            onChange={(e) => onSelectEmpresaId(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-slate-900/90 border border-slate-700/80 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
          >
            {empresas.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.certificadoNomeExibicao || emp.nomeFantasia || emp.razaoSocial} ({emp.status})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Menu Principal Limpo (7 itens — sem poluição e sem rolagem excessiva) */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all cursor-pointer ${
                active
                  ? 'bg-gradient-to-r from-[#1D4ED8] to-[#2563EB] text-white shadow-md shadow-blue-600/25'
                  : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Rodapé Discreto da Sidebar */}
      <div className="px-3 py-3 border-t border-slate-800/80 dark:border-white/10 space-y-1">
        <button
          type="button"
          onClick={() => {
            setMobileMenuOpen(false);
            setActiveTab('configuracoes');
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <Settings className="w-3.5 h-3.5 shrink-0" />
          <span>Identidade &amp; Modelos</span>
        </button>

        <button
          type="button"
          onClick={onBackToSite}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <Globe className="w-3.5 h-3.5 shrink-0" />
          <span>Site dkfacilita.com</span>
        </button>

        <div className="pt-2 mt-2 border-t border-slate-800/80 dark:border-white/10 px-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-200 truncate">{userName}</p>
            <p className="text-[10px] text-slate-500 truncate">{userEmail}</p>
          </div>
          <button
            type="button"
            onClick={() => void onLogout()}
            title="Sair"
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen dk-ambient-canvas flex">
      {/* Sidebar Desktop Escura Limpa (248px fixa) */}
      <aside className="hidden lg:block w-[248px] shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Drawer Mobile */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-[260px] h-full shadow-2xl">{sidebarContent}</div>
          <div
            className="flex-1 bg-slate-950/65 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      {/* Área Principal do Cliente */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Faixa Discreta de Trial ou Fatura Pendente */}
        {empresa.status === 'TRIAL' && accessDecision.permitido && (
          <div className="bg-[#0B1120] dark:bg-blue-950/50 text-slate-100 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-800 dark:border-blue-500/20">
            <span className="inline-flex items-center gap-2">
              <span className="dk-live-dot" style={{ backgroundColor: '#3B82F6' }} />
              Período de teste grátis ativo —{' '}
              <strong className="font-mono text-white">
                {accessDecision.diasRestantesTrial ?? 7} dia(s) restante(s)
              </strong>{' '}
              no plano {limits.planoNome}.
            </span>
            <button
              type="button"
              onClick={() => setActiveTab('plano')}
              className="px-3 py-1 rounded-md bg-[#1D4ED8] text-white text-xs font-medium hover:bg-[#1E40AF] cursor-pointer"
            >
              Assinar Agora
            </button>
          </div>
        )}

        {pendingFatura && accessDecision.permitido && (
          <div className="bg-amber-50 dark:bg-amber-500/10 text-amber-950 dark:text-amber-200 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs border-b border-amber-200 dark:border-amber-500/20">
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
              Você possui uma fatura {pendingFatura.status.toLowerCase()} ({pendingFatura.descricao}).
            </span>
            <button
              type="button"
              onClick={() => setActiveTab('plano')}
              className="font-semibold text-amber-900 dark:text-amber-300 underline cursor-pointer"
            >
              Ver Fatura / Pagar
            </button>
          </div>
        )}

        {/* Top Bar Translúcida Limpa */}
        <header className="bg-white/85 dark:bg-[#060913]/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/10 px-5 sm:px-6 h-16 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menu"
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>

            <div className="min-w-0">
              <h1 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight truncate">
                {activeTab === 'dashboard' && 'Visão Geral'}
                {activeTab === 'nrs' && 'NRs & Treinamentos'}
                {activeTab === 'turmas' && 'Turmas & Provas'}
                {activeTab === 'colaboradores' && 'Colaboradores, Obras & Dossiê'}
                {activeTab === 'certificados' && 'Certificados Emitidos'}
                {activeTab === 'vencimentos' && 'Central de Vencimentos'}
                {activeTab === 'configuracoes' && 'Configurações & Certificados'}
                {activeTab === 'plano' && 'Meu Plano e Serviços Adicionais'}
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {empresa.certificadoNomeExibicao || empresa.nomeFantasia || empresa.razaoSocial} ·{' '}
                {formatDocumentWithLabel(empresa.cnpj, empresa.tipoPessoa)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 relative">
            {/* Sininho de Comunicados com Contador */}
            <div className="relative">
              <button
                type="button"
                aria-label="Central de Comunicados"
                onClick={() => setInboxOpen((v) => !v)}
                className="relative p-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.08] cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadComunicados.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white font-mono text-[10px] font-bold flex items-center justify-center shadow">
                    {unreadComunicados.length}
                  </span>
                )}
              </button>

              {inboxOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#0B1120] shadow-2xl z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      Comunicados DK Facilita ({unreadComunicados.length} não lido(s))
                    </span>
                    {unreadComunicados.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleMarkAllComunicadosRead()}
                        className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Marcar todos
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-white/5">
                    {comunicadosElegiveis.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                        Nenhum comunicado ativo no momento.
                      </div>
                    ) : (
                      comunicadosElegiveis.map((c) => {
                        const isUnread = !comunicadosLidosIds.includes(c.id);
                        return (
                          <div
                            key={c.id}
                            className={`p-4 space-y-1.5 text-xs ${
                              isUnread ? 'bg-blue-50/50 dark:bg-blue-500/10' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                {c.tipo === 'URGENTE' && (
                                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                )}
                                {c.tipo === 'MANUTENCAO' && (
                                  <Wrench className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                )}
                                {c.tipo === 'NOVIDADE' && (
                                  <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                )}
                                {c.tipo === 'INFORMATIVO' && (
                                  <Info className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                )}
                                {c.titulo}
                              </span>
                              {isUnread && (
                                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1" />
                              )}
                            </div>
                            <p className="text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                              {c.mensagem}
                            </p>
                            {isUnread && (
                              <button
                                type="button"
                                onClick={() => void handleMarkComunicadoRead(c.id)}
                                className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer pt-1"
                              >
                                Marcar como lido
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <ThemeToggleButton compact />
            <button
              type="button"
              disabled={loadingTenant}
              onClick={() => void loadTenantData(empresa.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.08] cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingTenant ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('turmas')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium hover:bg-[#1E40AF] cursor-pointer shadow-sm shadow-blue-600/20"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova Turma
            </button>
          </div>
        </header>

        {/* Conteúdo Principal */}
        <main className="flex-1 p-5 sm:p-6 max-w-[1360px] w-full mx-auto">
          {/* Bloqueio por Inadimplência ou Trial Expirado (mantém Meu Plano liberado) */}
          {!accessDecision.permitido && activeTab !== 'plano' ? (
            <div className="max-w-xl mx-auto mt-10 dk-glass-card rounded-2xl p-8 text-center space-y-4 border-red-200 dark:border-red-500/30">
              <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-400 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Painel Operacional Temporariamente Bloqueado
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {accessDecision.motivo}
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('plano')}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#1D4ED8] text-white text-sm font-medium hover:bg-[#1E40AF] cursor-pointer"
              >
                <CreditCard className="w-4 h-4" />
                Regularizar em Meu Plano Agora
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <ExecutiveDashboard
                  empresa={empresa}
                  limits={limits}
                  obras={obras}
                  colaboradores={colaboradores}
                  turmas={turmas}
                  certificados={certificados}
                  onNavigate={(tab) => setActiveTab(tab)}
                  onScheduleRecycling={handleScheduleRecycling}
                  onOpenCertificate={(cert) => handleOpenCertificate(cert, false)}
                />
              )}

              {activeTab === 'nrs' && (
                <NrsManagerModule
                  empresa={empresa}
                  catalog={catalog}
                  treinamentos={treinamentos}
                  onRefresh={() => loadTenantData(empresa.id)}
                />
              )}

              {activeTab === 'turmas' && (
                <TurmasProvasModule
                  empresa={empresa}
                  treinamentos={treinamentos}
                  obras={obras}
                  colaboradores={colaboradores}
                  turmas={turmas}
                  certificados={certificados}
                  assinaturas={assinaturas}
                  prefillRecyclingCert={recyclingCertPrefill}
                  onClearPrefill={() => setRecyclingCertPrefill(null)}
                  onRefresh={() => loadTenantData(empresa.id)}
                  onOpenCertificate={handleOpenCertificate}
                  onOpenVectorDocument={setVectorDoc}
                  onOpenPublicExam={onOpenPublicExam}
                  onGoConfiguracoesResponsaveis={() => {
                    setConfigSubTabTarget('responsaveis');
                    setActiveTab('configuracoes');
                  }}
                />
              )}

              {activeTab === 'colaboradores' && (
                <ColaboradoresDossieModule
                  empresa={empresa}
                  limits={limits}
                  obras={obras}
                  colaboradores={colaboradores}
                  certificados={certificados}
                  cartas={cartas}
                  tentativas={tentativas}
                  assinaturas={assinaturas}
                  onRefresh={() => loadTenantData(empresa.id)}
                  onOpenCertificate={(cert) => handleOpenCertificate(cert, false)}
                  onOpenPublicDossier={onOpenPublicDossier}
                  onGoUpgrade={() => setActiveTab('plano')}
                />
              )}

              {(activeTab === 'certificados' || activeTab === 'vencimentos') && (
                <CertificadosVencimentosModule
                  mode={activeTab}
                  empresa={empresa}
                  certificados={certificados}
                  turmas={turmas}
                  treinamentos={treinamentos}
                  colaboradores={colaboradores}
                  assinaturas={assinaturas}
                  onRefresh={() => loadTenantData(empresa.id)}
                  onOpenCertificate={handleOpenCertificate}
                  onOpenCertificateDetails={setDetailsCert}
                  onScheduleRecycling={handleScheduleRecycling}
                />
              )}

              {activeTab === 'configuracoes' && (
                <ConfiguracoesCertificadosModule
                  empresa={empresa}
                  limits={limits}
                  catalog={catalog}
                  assinaturas={assinaturas}
                  obras={obras}
                  initialSubTab={configSubTabTarget}
                  onSubTabConsumed={() => setConfigSubTabTarget(undefined)}
                  onEmpresaUpdated={onEmpresaUpdated}
                  onRefresh={() => loadTenantData(empresa.id)}
                  onGoPlano={() => setActiveTab('plano')}
                />
              )}

              {activeTab === 'plano' && (
                <MeuPlanoModule
                  empresa={empresa}
                  limits={limits}
                  catalog={catalog}
                  faturas={faturas}
                  usoColaboradores={colaboradores.filter((c) => c.ativo).length}
                  usoUsuarios={Math.max(1, membros.filter((m) => m.ativo).length)}
                  usoObras={obras.filter((o) => o.ativo).length}
                  onRefresh={() => loadTenantData(empresa.id)}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Modal de Detalhes do Certificado + Carta de Anuência + Pacote de Auditoria */}
      <CertificateDetailsModal
        certificado={detailsCert}
        empresa={empresa}
        turmas={turmas}
        cartas={cartas}
        tentativas={tentativas}
        assinaturas={assinaturas}
        onClose={() => setDetailsCert(null)}
        onPrintCertificate={(cert, hideColabSig) => {
          setDetailsCert(null);
          handleOpenCertificate(cert, hideColabSig);
        }}
        onOpenVectorDocument={(doc) => {
          setVectorDoc(doc);
        }}
      />

      {/* Modal de Visualização e Impressão PDF Vetorial Frente e Verso */}
      <CertificateViewerModal
        certificado={viewerState?.cert ?? null}
        initialHideCollaboratorSignature={viewerState?.hideColabSig ?? false}
        modeloProprioUrl={empresa.modeloProprioUrl ?? null}
        onClose={() => setViewerState(null)}
      />

      {/* Modal Universal de Documentos Vetoriais (Comprovante EVD, Dossiê PROVA, Carta CAN, Listas, Pacote de Auditoria) */}
      <DocumentPrintModal
        document={vectorDoc}
        onClose={() => setVectorDoc(null)}
      />

      {/* Pop-up Prioritário de Comunicado do Super Admin */}
      {priorityPopupComunicado && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0B1120] border border-slate-200 dark:border-blue-500/40 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  {priorityPopupComunicado.tipo === 'URGENTE' ? (
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  ) : priorityPopupComunicado.tipo === 'MANUTENCAO' ? (
                    <Wrench className="w-5 h-5 text-amber-500" />
                  ) : (
                    <Sparkles className="w-5 h-5 text-blue-500" />
                  )}
                </div>
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    Comunicado Oficial DK Facilita · {priorityPopupComunicado.tipo}
                  </span>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {priorityPopupComunicado.titulo}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar aviso"
                onClick={() =>
                  setDismissedPopupIds((prev) => [...prev, priorityPopupComunicado.id])
                }
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
              {priorityPopupComunicado.mensagem}
            </p>

            <div className="pt-3 border-t border-slate-200 dark:border-white/10 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void handleMarkComunicadoRead(priorityPopupComunicado.id)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white text-xs font-semibold hover:from-[#1D4ED8] hover:to-[#2563EB] cursor-pointer"
              >
                Entendi, marcar como lido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
