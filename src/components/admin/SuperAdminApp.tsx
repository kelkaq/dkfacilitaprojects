import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Building2,
  Database,
  Globe,
  LayoutDashboard,
  Layers,
  LogOut,
  Menu,
  RefreshCw,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import type { GlobalCatalogSnapshot } from '../../services/catalogService.ts';
import type {
  AnalyticsSessionDoc,
  EmpresaDoc,
  NotificacaoAdminDoc,
} from '../../types/domain.ts';
import { listMyEmpresas } from '../../services/tenantAuthService.ts';
import {
  fetchRealtimeAnalytics,
  listNotificacoesAdmin,
} from '../../services/analyticsService.ts';
import { adminFetchAllCatalog } from '../../services/superAdminService.ts';
import { SuperAdminDashboard } from './SuperAdminDashboard.tsx';
import { SuperAdminCompanies } from './SuperAdminCompanies.tsx';
import { SuperAdminNotifications } from './SuperAdminNotifications.tsx';
import { SuperAdminCatalogManager } from './SuperAdminCatalogManager.tsx';

type AdminTab = 'dashboard' | 'empresas' | 'notificacoes' | 'catalogo';

interface SuperAdminAppProps {
  userEmail: string;
  userName: string;
  onSyncSeedGlobal: () => Promise<void>;
  onCatalogChanged: () => Promise<void>;
  onOpenClientPanel: (empresaId?: string) => void;
  onBackToSite: () => void;
  onLogout: () => Promise<void>;
}

export const SuperAdminApp: React.FC<SuperAdminAppProps> = ({
  userEmail,
  userName,
  onSyncSeedGlobal,
  onCatalogChanged,
  onOpenClientPanel,
  onBackToSite,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [empresas, setEmpresas] = useState<EmpresaDoc[]>([]);
  const [notificacoes, setNotificacoes] = useState<NotificacaoAdminDoc[]>([]);
  const [adminCatalog, setAdminCatalog] = useState<GlobalCatalogSnapshot>({
    planos: [],
    adicionais: [],
    nrs: [],
    modelos: [],
  });
  const [analytics, setAnalytics] = useState<{
    totalAcessosRegistrados: number;
    acessosHoje: number;
    acessosMes: number;
    usuariosOnlineAgora: number;
    sessoesRecentes: AnalyticsSessionDoc[];
  }>({
    totalAcessosRegistrados: 0,
    acessosHoje: 0,
    acessosMes: 0,
    usuariosOnlineAgora: 0,
    sessoesRecentes: [],
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [emps, notifs, cat, anl] = await Promise.all([
        listMyEmpresas(true),
        listNotificacoesAdmin(),
        adminFetchAllCatalog(),
        fetchRealtimeAnalytics(),
      ]);
      setEmpresas(emps);
      setNotificacoes(notifs);
      setAdminCatalog(cat);
      setAnalytics(anl);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
    const timer = window.setInterval(() => {
      void fetchRealtimeAnalytics().then(setAnalytics).catch(() => {});
      void listNotificacoesAdmin().then(setNotificacoes).catch(() => {});
    }, 15000);
    return () => window.clearInterval(timer);
  }, [loadAll]);

  const unreadCount = notificacoes.filter((n) => !n.lida).length;

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await onSyncSeedGlobal();
      await loadAll();
    } finally {
      setSeeding(false);
    }
  };

  const handleCatalogRefresh = async () => {
    await loadAll();
    await onCatalogChanged();
  };

  const navItems: {
    id: AdminTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'empresas', label: 'Empresas Clientes', icon: Building2 },
    { id: 'notificacoes', label: 'Notificações', icon: Bell, badge: unreadCount },
    { id: 'catalogo', label: 'Catálogo Global', icon: Layers },
  ];

  const sidebarContent = (
    <div className="h-full flex flex-col bg-[#0B1120] text-slate-200 select-none">
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#1D4ED8] text-white flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">DK Facilita</p>
            <p className="text-[11px] font-mono text-slate-400 truncate">admin.dkfacilita.com</p>
          </div>
        </div>
      </div>

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
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                active
                  ? 'bg-[#1D4ED8] text-white'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <span className="inline-flex items-center gap-3 truncate">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </span>
              {item.badge && item.badge > 0 ? (
                <span className="font-mono text-[11px] font-bold text-white bg-red-600 px-1.5 py-0.5 rounded-md">
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-slate-800 space-y-1">
        <button
          type="button"
          onClick={() => onOpenClientPanel()}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800/70 cursor-pointer"
        >
          <Users className="w-3.5 h-3.5 shrink-0" />
          <span>Painel do Cliente (/app)</span>
        </button>

        <button
          type="button"
          onClick={onBackToSite}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800/70 cursor-pointer"
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
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex">
      <aside className="hidden lg:block w-[252px] shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-[260px] h-full shadow-2xl">{sidebarContent}</div>
          <div className="flex-1 bg-slate-950/60" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-5 sm:px-6 h-16 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-700 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-slate-900 tracking-tight truncate">
                {activeTab === 'dashboard' && 'Visão Geral — Dono do Software'}
                {activeTab === 'empresas' && 'Empresas Clientes & Feature Flags'}
                {activeTab === 'notificacoes' && 'Central de Notificações'}
                {activeTab === 'catalogo' && 'Catálogo Global DK Facilita'}
              </h1>
              <p className="text-[11px] text-slate-500 truncate">
                Controle executivo multiempresa · Certifica Software - DK
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadAll()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              type="button"
              disabled={seeding}
              onClick={() => void handleSeed()}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 cursor-pointer disabled:opacity-50"
            >
              <Database className="w-3.5 h-3.5" />
              {seeding ? 'Sincronizando...' : 'Sincronizar Seed'}
            </button>
          </div>
        </header>

        <main className="flex-1 p-5 sm:p-6 max-w-[1360px] w-full mx-auto">
          {activeTab === 'dashboard' && (
            <SuperAdminDashboard
              empresas={empresas}
              catalog={adminCatalog}
              analytics={analytics}
              onGoCompanies={() => setActiveTab('empresas')}
            />
          )}

          {activeTab === 'empresas' && (
            <SuperAdminCompanies
              empresas={empresas}
              catalog={adminCatalog}
              onRefresh={loadAll}
              onImpersonateClient={(empId) => onOpenClientPanel(empId)}
            />
          )}

          {activeTab === 'notificacoes' && (
            <SuperAdminNotifications notificacoes={notificacoes} onRefresh={loadAll} />
          )}

          {activeTab === 'catalogo' && (
            <SuperAdminCatalogManager
              catalog={adminCatalog}
              onRefresh={handleCatalogRefresh}
            />
          )}
        </main>
      </div>
    </div>
  );
};
