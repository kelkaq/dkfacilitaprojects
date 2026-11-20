import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  auth,
  googleAuthProvider,
  SUPER_ADMIN_EMAIL,
} from './lib/firebase.ts';
import {
  fetchGlobalCatalogFromDb,
  seedGlobalCatalogToFirestore,
  type GlobalCatalogSnapshot,
} from './services/catalogService.ts';
import { sendAnalyticsHeartbeat } from './services/analyticsService.ts';
import { getEmpresaById, listMyEmpresas } from './services/tenantAuthService.ts';
import type { EmpresaDoc } from './types/domain.ts';
import { ThemeProvider } from './components/ThemeProvider.tsx';
import { LandingPage, type CheckoutSelection } from './components/LandingPage.tsx';
import { CheckoutFlow } from './components/CheckoutFlow.tsx';
import { OnboardingWizard } from './components/OnboardingWizard.tsx';
import { LoginView } from './components/LoginView.tsx';
import { ClientSaasApp } from './components/client/ClientSaasApp.tsx';
import { PublicExamPortal } from './components/client/PublicExamPortal.tsx';
import { PublicDossierView } from './components/client/PublicDossierView.tsx';
import { SuperAdminApp } from './components/admin/SuperAdminApp.tsx';

type AppView =
  | 'SITE'
  | 'CHECKOUT'
  | 'LOGIN'
  | 'ONBOARDING'
  | 'CLIENT_APP'
  | 'PUBLIC_EXAM'
  | 'PUBLIC_DOSSIER'
  | 'ADMIN_CONSOLE';

interface PublicExamRouteParams {
  tokenPublico: string;
  cpf?: string;
  nome?: string;
  colaboradorId?: string;
}

const DEFAULT_CHECKOUT_SELECTION: CheckoutSelection = {
  planoSlug: 'profissional',
  ciclo: 'ANUAL',
  modoInicio: 'TRIAL',
  adicionaisSlugs: [],
  cupomCodigo: '',
};

function parseCheckoutSelectionFromQuery(): Partial<CheckoutSelection> {
  const params = new URLSearchParams(window.location.search);
  const plano = params.get('plano')?.trim();
  const cupom = params.get('cupom')?.trim().toUpperCase();
  const cicloRaw = params.get('ciclo')?.trim().toUpperCase();
  const modoRaw = params.get('modo')?.trim().toUpperCase();
  const patch: Partial<CheckoutSelection> = {};
  if (plano) patch.planoSlug = plano;
  if (cupom) patch.cupomCodigo = cupom;
  if (cicloRaw === 'MENSAL' || cicloRaw === 'SEMESTRAL' || cicloRaw === 'ANUAL') {
    patch.ciclo = cicloRaw;
  }
  if (modoRaw === 'TRIAL' || modoRaw === 'IMEDIATO') {
    patch.modoInicio = modoRaw;
  }
  return patch;
}

function resolveRouteFromBrowser(): {
  view: AppView;
  examParams: PublicExamRouteParams | null;
  dossierToken: string | null;
} {
  const params = new URLSearchParams(window.location.search);
  const prova = params.get('prova');
  if (prova) {
    return {
      view: 'PUBLIC_EXAM',
      examParams: {
        tokenPublico: prova,
        cpf: params.get('cpf') || undefined,
        nome: params.get('nome') || undefined,
        colaboradorId: params.get('cid') || undefined,
      },
      dossierToken: null,
    };
  }

  const dossie = params.get('dossie');
  if (dossie) {
    return {
      view: 'PUBLIC_DOSSIER',
      examParams: null,
      dossierToken: dossie,
    };
  }

  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  const host = window.location.hostname.toLowerCase();

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return { view: 'ADMIN_CONSOLE', examParams: null, dossierToken: null };
  }
  if (pathname === '/app' || pathname.startsWith('/app/') || pathname.startsWith('/certifica')) {
    return { view: 'CLIENT_APP', examParams: null, dossierToken: null };
  }
  if (pathname === '/entrar' || pathname === '/login') {
    return { view: 'LOGIN', examParams: null, dossierToken: null };
  }
  if (pathname === '/checkout') {
    return { view: 'CHECKOUT', examParams: null, dossierToken: null };
  }
  if (pathname === '/primeiro-acesso') {
    return { view: 'ONBOARDING', examParams: null, dossierToken: null };
  }

  // Suporte automático aos subdomínios de produção (certifica.dkfacilita.com e admin.dkfacilita.com)
  if (pathname === '/' && host.startsWith('admin.')) {
    return { view: 'ADMIN_CONSOLE', examParams: null, dossierToken: null };
  }
  if (pathname === '/' && host.startsWith('certifica.')) {
    return { view: 'CLIENT_APP', examParams: null, dossierToken: null };
  }

  return { view: 'SITE', examParams: null, dossierToken: null };
}

function pathForView(view: AppView): string {
  switch (view) {
    case 'SITE':
      return '/';
    case 'CLIENT_APP':
      return '/app';
    case 'ADMIN_CONSOLE':
      return '/admin';
    case 'LOGIN':
      return '/entrar';
    case 'CHECKOUT':
      return '/checkout';
    case 'ONBOARDING':
      return '/primeiro-acesso';
    default:
      return '/';
  }
}

function AppRouter() {
  const initialRoute = useMemo(() => resolveRouteFromBrowser(), []);
  const [view, setView] = useState<AppView>(initialRoute.view);
  const [postLoginTarget, setPostLoginTarget] = useState<'CLIENT_APP' | 'ADMIN_CONSOLE'>(
    initialRoute.view === 'ADMIN_CONSOLE' ? 'ADMIN_CONSOLE' : 'CLIENT_APP'
  );
  const [publicExamParams, setPublicExamParams] = useState<PublicExamRouteParams | null>(
    initialRoute.examParams
  );
  const [publicDossierToken, setPublicDossierToken] = useState<string | null>(
    initialRoute.dossierToken
  );

  const [checkoutSelection, setCheckoutSelection] = useState<CheckoutSelection>(() => ({
    ...DEFAULT_CHECKOUT_SELECTION,
    ...parseCheckoutSelectionFromQuery(),
  }));

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userEmpresas, setUserEmpresas] = useState<EmpresaDoc[]>([]);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string | null>(null);
  const [onboardingEmpresa, setOnboardingEmpresa] = useState<EmpresaDoc | null>(null);

  const [catalog, setCatalog] = useState<GlobalCatalogSnapshot | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const isSuperAdmin =
    Boolean(user?.emailVerified) && user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;

  const navigate = useCallback((nextView: AppView, opts?: { replace?: boolean }) => {
    setView(nextView);
    if (nextView === 'PUBLIC_EXAM' || nextView === 'PUBLIC_DOSSIER') return;

    const targetPath = pathForView(nextView);
    const currentPathWithQuery = `${window.location.pathname}${window.location.search}`;
    if (currentPathWithQuery !== targetPath) {
      if (opts?.replace) {
        window.history.replaceState({}, '', targetPath);
      } else {
        window.history.pushState({}, '', targetPath);
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const resolved = resolveRouteFromBrowser();
      setPublicExamParams(resolved.examParams);
      setPublicDossierToken(resolved.dossierToken);
      setView(resolved.view);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const data = await fetchGlobalCatalogFromDb();
      setCatalog(data);
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  const refreshUserEmpresas = useCallback(async (): Promise<EmpresaDoc[]> => {
    if (!auth.currentUser) {
      setUserEmpresas([]);
      return [];
    }
    try {
      // Painel do cliente carrega estritamente as empresas vinculadas ao usuário logado
      const list = await listMyEmpresas(false);
      setUserEmpresas(list);
      if (list.length > 0) {
        setSelectedEmpresaId((prev) =>
          prev && list.some((item) => item.id === prev) ? prev : list[0].id
        );
      } else {
        setSelectedEmpresaId(null);
      }
      return list;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (currentUser) {
        void refreshUserEmpresas();
      } else {
        setUserEmpresas([]);
        setSelectedEmpresaId(null);
      }
    });
    return unsub;
  }, [refreshUserEmpresas]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // Guarda de rotas autenticadas / acesso administrativo exclusivamente via /admin
  useEffect(() => {
    if (!authReady) return;
    if (view === 'ADMIN_CONSOLE') {
      if (!user) {
        setPostLoginTarget('ADMIN_CONSOLE');
        navigate('LOGIN', { replace: true });
      } else if (!isSuperAdmin) {
        navigate('CLIENT_APP', { replace: true });
      }
    } else if (view === 'CLIENT_APP' && !user) {
      setPostLoginTarget('CLIENT_APP');
      navigate('LOGIN', { replace: true });
    } else if (view === 'ONBOARDING' && !user) {
      navigate('LOGIN', { replace: true });
    }
  }, [authReady, view, user, isSuperAdmin, navigate]);

  // Heartbeat real de analytics (a cada 30 segundos + mudança de tela)
  useEffect(() => {
    const origem =
      view === 'SITE' || view === 'CHECKOUT' || view === 'LOGIN'
        ? 'SITE'
        : view === 'PUBLIC_EXAM'
          ? 'PROVA_PUBLICA'
          : view === 'PUBLIC_DOSSIER'
            ? 'VALIDACAO_QR'
            : view === 'ADMIN_CONSOLE'
              ? 'ADMIN'
              : 'APP';

    const rota =
      view === 'PUBLIC_EXAM'
        ? `/prova/${publicExamParams?.tokenPublico ?? ''}`
        : view === 'PUBLIC_DOSSIER'
          ? `/dossie/${publicDossierToken ?? ''}`
          : pathForView(view);

    void sendAnalyticsHeartbeat({ rota, origem, empresaId: selectedEmpresaId });

    const timer = window.setInterval(() => {
      void sendAnalyticsHeartbeat({ rota, origem, empresaId: selectedEmpresaId });
    }, 30000);

    return () => window.clearInterval(timer);
  }, [view, selectedEmpresaId, publicExamParams, publicDossierToken]);

  const handleLogin = async () => {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    const adminFlag =
      Boolean(cred.user.emailVerified) &&
      cred.user.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
    const list = await refreshUserEmpresas();

    if (postLoginTarget === 'ADMIN_CONSOLE' && adminFlag) {
      navigate('ADMIN_CONSOLE');
      return;
    }

    const pendingOnboarding = list.find(
      (emp) => emp.ownerUid === cred.user.uid && emp.onboardingConcluido === false
    );
    if (pendingOnboarding) {
      setSelectedEmpresaId(pendingOnboarding.id);
      setOnboardingEmpresa(pendingOnboarding);
      navigate('ONBOARDING');
      return;
    }

    navigate('CLIENT_APP');
  };

  const handleLogout = async () => {
    await signOut(auth);
    setOnboardingEmpresa(null);
    setPostLoginTarget('CLIENT_APP');
    navigate('SITE');
  };

  const handleRunSeed = async () => {
    await seedGlobalCatalogToFirestore();
    await loadCatalog();
  };

  const handleStartCheckout = (selection: CheckoutSelection) => {
    setCheckoutSelection(selection);
    navigate('CHECKOUT');
  };

  const handleEmpresaUpdated = useCallback((updated: EmpresaDoc) => {
    setUserEmpresas((prev) => {
      const exists = prev.some((item) => item.id === updated.id);
      return exists
        ? prev.map((item) => (item.id === updated.id ? updated : item))
        : [updated, ...prev];
    });
  }, []);

  const handleEnterPanelFromCheckout = (empresa: EmpresaDoc) => {
    handleEmpresaUpdated(empresa);
    setSelectedEmpresaId(empresa.id);

    if (!empresa.onboardingConcluido) {
      setOnboardingEmpresa(empresa);
      navigate('ONBOARDING');
    } else {
      navigate('CLIENT_APP');
    }
  };

  const handleOnboardingCompleted = (updated: EmpresaDoc) => {
    handleEmpresaUpdated(updated);
    setSelectedEmpresaId(updated.id);
    setOnboardingEmpresa(null);
    navigate('CLIENT_APP');
  };

  const handleGoPanelFromLanding = () => {
    if (!user) {
      setPostLoginTarget('CLIENT_APP');
      navigate('LOGIN');
      return;
    }
    const pendingOnboarding = userEmpresas.find(
      (emp) => emp.ownerUid === user.uid && emp.onboardingConcluido === false
    );
    if (pendingOnboarding) {
      setSelectedEmpresaId(pendingOnboarding.id);
      setOnboardingEmpresa(pendingOnboarding);
      navigate('ONBOARDING');
      return;
    }
    navigate('CLIENT_APP');
  };

  const activeEmpresaForOnboarding = useMemo(() => {
    if (onboardingEmpresa) return onboardingEmpresa;
    if (selectedEmpresaId) {
      return userEmpresas.find((e) => e.id === selectedEmpresaId) ?? userEmpresas[0] ?? null;
    }
    return userEmpresas[0] ?? null;
  }, [onboardingEmpresa, selectedEmpresaId, userEmpresas]);

  // 1. PORTAL PÚBLICO DE PROVA MOBILE-FIRST (?prova=TOKEN)
  if (view === 'PUBLIC_EXAM' && publicExamParams) {
    return (
      <PublicExamPortal
        tokenPublico={publicExamParams.tokenPublico}
        prefilledCpf={publicExamParams.cpf}
        prefilledNome={publicExamParams.nome}
        prefilledColaboradorId={publicExamParams.colaboradorId}
        onExit={() => {
          setPublicExamParams(null);
          navigate(user ? 'CLIENT_APP' : 'SITE');
        }}
      />
    );
  }

  // 2. VISUALIZAÇÃO PÚBLICA DE DOSSIÊ TEMPORÁRIO (?dossie=TOKEN)
  if (view === 'PUBLIC_DOSSIER' && publicDossierToken) {
    return (
      <PublicDossierView
        token={publicDossierToken}
        onExit={() => {
          setPublicDossierToken(null);
          navigate(user ? 'CLIENT_APP' : 'SITE');
        }}
      />
    );
  }

  // 3. CHECKOUT + TRIAL AUTOMÁTICO (/checkout)
  if (view === 'CHECKOUT') {
    return (
      <CheckoutFlow
        catalog={catalog}
        initialSelection={checkoutSelection}
        onBackToSite={() => navigate('SITE')}
        onEnterPanel={handleEnterPanelFromCheckout}
      />
    );
  }

  // 4. LOGIN (/entrar)
  if (view === 'LOGIN') {
    return (
      <LoginView
        onLoginGoogle={handleLogin}
        onBackToSite={() => navigate('SITE')}
        onGoTrialCheckout={() => handleStartCheckout(DEFAULT_CHECKOUT_SELECTION)}
      />
    );
  }

  // 5. ASSISTENTE DE PRIMEIRO ACESSO (/primeiro-acesso)
  if (view === 'ONBOARDING' && activeEmpresaForOnboarding) {
    return (
      <OnboardingWizard
        empresa={activeEmpresaForOnboarding}
        catalog={catalog}
        onCompleted={handleOnboardingCompleted}
      />
    );
  }

  // 6. PAINEL EXCLUSIVO DO DONO (admin.dkfacilita.com | /admin — sem botões públicos)
  if (view === 'ADMIN_CONSOLE' && user && isSuperAdmin) {
    return (
      <SuperAdminApp
        userEmail={user.email || ''}
        userName={user.displayName || user.email || 'Administrador'}
        onSyncSeedGlobal={handleRunSeed}
        onCatalogChanged={loadCatalog}
        onOpenClientPanel={(empresaId) => {
          if (empresaId) {
            void getEmpresaById(empresaId).then((emp) => {
              if (emp) {
                setUserEmpresas((prev) =>
                  prev.some((item) => item.id === emp.id) ? prev : [emp, ...prev]
                );
                setSelectedEmpresaId(emp.id);
              }
            });
          }
          navigate('CLIENT_APP');
        }}
        onBackToSite={() => navigate('SITE')}
        onLogout={handleLogout}
      />
    );
  }

  // 7. SISTEMA SAAS DO CLIENTE — CERTIFICA SOFTWARE - DK (certifica.dkfacilita.com | /app)
  if (view === 'CLIENT_APP' && user) {
    return (
      <ClientSaasApp
        userEmail={user.email || ''}
        userName={user.displayName || user.email || 'Usuário'}
        catalog={catalog}
        empresas={userEmpresas}
        selectedEmpresaId={selectedEmpresaId}
        onSelectEmpresaId={setSelectedEmpresaId}
        onEmpresaUpdated={handleEmpresaUpdated}
        onCreateCompanyCheckout={() => handleStartCheckout(DEFAULT_CHECKOUT_SELECTION)}
        onOpenOnboarding={(emp) => {
          setOnboardingEmpresa(emp);
          navigate('ONBOARDING');
        }}
        onOpenPublicExam={(params) => {
          setPublicExamParams(params);
          setView('PUBLIC_EXAM');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenPublicDossier={(token) => {
          setPublicDossierToken(token);
          setView('PUBLIC_DOSSIER');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onBackToSite={() => navigate('SITE')}
        onLogout={handleLogout}
      />
    );
  }

  // 8. SITE INSTITUCIONAL DK FACILITA (dkfacilita.com | /)
  return (
    <LandingPage
      catalog={catalog}
      loadingCatalog={loadingCatalog}
      isAuthenticated={Boolean(user)}
      onStartCheckout={handleStartCheckout}
      onGoLogin={() => {
        setPostLoginTarget('CLIENT_APP');
        navigate('LOGIN');
      }}
      onGoPanel={handleGoPanelFromLanding}
    />
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppRouter />
    </ThemeProvider>
  );
}
