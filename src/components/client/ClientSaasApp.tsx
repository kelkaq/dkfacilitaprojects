import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CreditCard,
  FileBadge,
  Globe,
  GraduationCap,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Shield,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import type { GlobalCatalogSnapshot } from '../../services/catalogService.ts';
import type {
  AssinaturaDigitalDoc,
  CartaAnuenciaDoc,
  CertificadoDoc,
  ColaboradorDoc,
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
import { ExecutiveDashboard } from './ExecutiveDashboard.tsx';
import { NrsManagerModule } from './NrsManagerModule.tsx';
import { TurmasProvasModule } from './TurmasProvasModule.tsx';
import { ColaboradoresDossieModule } from './ColaboradoresDossieModule.tsx';
import { CertificadosVencimentosModule } from './CertificadosVencimentosModule.tsx';
import { MeuPlanoModule } from './MeuPlanoModule.tsx';
import { CertificateViewerModal } from './CertificateViewerModal.tsx';

export type ClientTab =
  | 'dashboard'
  | 'nrs'
  | 'turmas'
  | 'colaboradores'
  | 'certificados'
  | 'vencimentos'
  | 'plano';

interface ClientSaasAppProps {
  userEmail: string;
  userName: string;
  isSuperAdmin: boolean;
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
  onOpenAdminConsole?: () => void;
  onLogout: () => Promise<void>;
}

export const ClientSaasApp: React.FC<ClientSaasAppProps> = ({
  userEmail,
  userName,
  isSuperAdmin,
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
  onOpenAdminConsole,
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

  // Modais e estados cruzados
  const [viewerCert, setViewerCert] = useState<CertificadoDoc | null>(null);
  const [recyclingCertPrefill, setRecyclingCertPrefill] = useState<CertificadoDoc | null>(null);

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
    { id: 'plano', label: 'Meu Plano', icon: CreditCard },
  ];

  // Caso o usuário autenticado ainda não tenha nenhuma empresa cadastrada
  if (!empresa || !limits) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900">
            DK Facilita · Certifica Software - DK
          </span>
          <div className="flex items-center gap-2">
            {isSuperAdmin && onOpenAdminConsole && (
              <button
                type="button"
                onClick={onOpenAdminConsole}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5" />
                Console Técnico
              </button>
            )}
            <button
              type="button"
              onClick={onBackToSite}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Site dkfacilita.com
            </button>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-5">
            <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center mx-auto font-bold text-sm">
              DK
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                Nenhuma empresa vinculada ainda
              </h1>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Crie sua empresa agora com 7 dias de teste grátis para liberar o painel completo do{' '}
                <strong>Certifica Software - DK</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={onCreateCompanyCheckout}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#1D4ED8] text-white text-sm font-medium hover:bg-[#1E40AF] cursor-pointer"
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
    <div className="h-full flex flex-col bg-[#0F172A] text-slate-200 select-none">
      {/* Identidade Dinâmica da Empresa Cliente */}
      <div className="px-5 py-5 border-b border-slate-800 space-y-3">
        <div className="flex items-center gap-3 min-w-0">
          {empresa.logoUrl ? (
            <img
              src={empresa.logoUrl}
              alt={empresa.razaoSocial}
              className="w-9 h-9 rounded-lg object-contain bg-white p-1 shrink-0"
            />
          ) : (
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: empresa.corPrimaria || '#1D4ED8' }}
            >
              {(empresa.prefixoCertificado || 'DK').slice(0, 3)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {empresa.nomeFantasia || empresa.razaoSocial}
            </p>
            <p className="text-[11px] text-slate-400 truncate">Certifica Software - DK</p>
          </div>
        </div>

        {empresas.length > 1 && (
          <select
            value={empresa.id}
            onChange={(e) => onSelectEmpresaId(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-slate-500"
          >
            {empresas.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.razaoSocial} ({emp.status})
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
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                active
                  ? 'bg-[#1D4ED8] text-white'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Rodapé Discreto da Sidebar */}
      <div className="px-3 py-3 border-t border-slate-800 space-y-1">
        <button
          type="button"
          onClick={() => {
            setMobileMenuOpen(false);
            onOpenOnboarding(empresa);
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors cursor-pointer"
        >
          <Wand2 className="w-3.5 h-3.5 shrink-0" />
          <span>Identidade & 1º Acesso</span>
        </button>

        {isSuperAdmin && onOpenAdminConsole && (
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              onOpenAdminConsole();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <span>Console Super Admin</span>
          </button>
        )}

        <button
          type="button"
          onClick={onBackToSite}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors cursor-pointer"
        >
          <Globe className="w-3.5 h-3.5 shrink-0" />
          <span>Site dkfacilita.com</span>
        </button>

        <div className="pt-2 mt-2 border-t border-slate-800/80 px-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-200 truncate">{userName}</p>
            <p className="text-[10px] text-slate-500 truncate">{userEmail}</p>
          </div>
          <button
            type="button"
            onClick={() => void onLogout()}
            title="Sair"
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex">
      {/* Sidebar Desktop Escura Limpa (248px fixa) */}
      <aside className="hidden lg:block w-[248px] shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Drawer Mobile */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-[260px] h-full shadow-2xl">{sidebarContent}</div>
          <div
            className="flex-1 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      {/* Área Principal do Cliente */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Faixa Discreta de Trial ou Fatura Pendente */}
        {empresa.status === 'TRIAL' && accessDecision.permitido && (
          <div className="bg-slate-900 text-slate-100 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-800">
            <span>
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
          <div className="bg-amber-50 text-amber-950 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs border-b border-amber-200">
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              Você possui uma fatura {pendingFatura.status.toLowerCase()} ({pendingFatura.descricao}).
            </span>
            <button
              type="button"
              onClick={() => setActiveTab('plano')}
              className="font-semibold text-amber-900 underline cursor-pointer"
            >
              Ver Fatura / Pagar
            </button>
          </div>
        )}

        {/* Top Bar Limpa (3 zonas) */}
        <header className="bg-white border-b border-slate-200 px-5 sm:px-6 h-16 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menu"
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>

            <div className="min-w-0">
              <h1 className="text-base font-semibold text-slate-900 tracking-tight truncate">
                {activeTab === 'dashboard' && 'Visão Geral'}
                {activeTab === 'nrs' && 'NRs & Treinamentos'}
                {activeTab === 'turmas' && 'Turmas & Provas'}
                {activeTab === 'colaboradores' && 'Colaboradores, Obras & Dossiê'}
                {activeTab === 'certificados' && 'Certificados Emitidos'}
                {activeTab === 'vencimentos' && 'Central de Vencimentos'}
                {activeTab === 'plano' && 'Meu Plano e Serviços Adicionais'}
              </h1>
              <p className="text-[11px] text-slate-500 truncate">
                {empresa.razaoSocial} · CNPJ {empresa.cnpj}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={loadingTenant}
              onClick={() => void loadTenantData(empresa.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingTenant ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('turmas')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 cursor-pointer"
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
            <div className="max-w-xl mx-auto mt-10 bg-white border border-red-200 rounded-2xl p-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-red-50 text-red-700 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                Painel Operacional Temporariamente Bloqueado
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">{accessDecision.motivo}</p>
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
                  onOpenCertificate={setViewerCert}
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
                  onOpenCertificate={setViewerCert}
                  onOpenPublicExam={onOpenPublicExam}
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
                  onOpenCertificate={setViewerCert}
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
                  onOpenCertificate={setViewerCert}
                  onScheduleRecycling={handleScheduleRecycling}
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

      {/* Modal de Visualização e Impressão PDF Frente e Verso */}
      <CertificateViewerModal
        certificado={viewerCert}
        onClose={() => setViewerCert(null)}
      />
    </div>
  );
};
