import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Database,
  FileBadge,
  Plus,
  QrCode,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import type { GlobalCatalogSnapshot } from '../services/catalogService.ts';
import {
  calcularPrecoCicloCentavos,
  formatarMoedaBRL,
} from '../data/globalCatalogSeed.ts';
import type { CertificadoPublicoDoc, CicloCobranca } from '../types/domain.ts';
import { validatePublicCertificadoQr } from '../services/operationalCrudService.ts';
import { ThemeToggleButton } from './ThemeProvider.tsx';

import heroImage from '../assets/images/hero_dk_industrial_safety_1795121863859.jpg';
import mobileImage from '../assets/images/showcase_mobile_exam_1795121884518.jpg';

const HERO_IMAGE = heroImage;
const MOBILE_IMAGE = mobileImage;

export interface CheckoutSelection {
  planoSlug: string;
  ciclo: CicloCobranca;
  modoInicio: 'TRIAL' | 'IMEDIATO';
  adicionaisSlugs: string[];
}

interface LandingPageProps {
  catalog: GlobalCatalogSnapshot | null;
  loadingCatalog: boolean;
  isAuthenticated: boolean;
  onStartCheckout: (selection: CheckoutSelection) => void;
  onGoLogin: () => void;
  onGoPanel: () => void;
}

const CAPABILITIES = [
  {
    numero: '01.',
    titulo: 'Provas online com CPF, PIN e Selfie',
    descricao:
      'Aplique avaliações presenciais ou remotas pelo celular do colaborador com três níveis configuráveis de validação de identidade.',
  },
  {
    numero: '02.',
    titulo: 'Assinatura digital direto na tela',
    descricao:
      'O trabalhador assina com o dedo ao concluir a prova e a assinatura é incorporada automaticamente ao certificado e às evidências da turma.',
  },
  {
    numero: '03.',
    titulo: 'Conteúdo programático linha por linha',
    descricao:
      'Organize cada NR por norma pai e variações (Inicial, Observador, Reciclagem), com editor item a item e distribuição automática em 1 ou 2 colunas no verso.',
  },
  {
    numero: '04.',
    titulo: 'Certificado PDF vetorial com QR Code permanente',
    descricao:
      'Emissão com snapshot imutável do conteúdo ministrado e validação pública instantânea por QR Code, disponível 24h para contratantes e auditores.',
  },
  {
    numero: '05.',
    titulo: 'Dossiê unificado e Cartas de Anuência',
    descricao:
      'Reúna certificados, comprovantes de prova, dossiês de aplicação e cartas de anuência de cada colaborador prontos para mobilização em obra.',
  },
  {
    numero: '06.',
    titulo: 'Central de vencimentos e alertas automáticos',
    descricao:
      'Monitore reciclagens com antecedência de 60, 30, 15, 7 e 1 dia para zerar bloqueios em portarias industriais e auditorias do MTE.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  catalog,
  loadingCatalog,
  isAuthenticated,
  onStartCheckout,
  onGoLogin,
  onGoPanel,
}) => {
  const [ciclo, setCiclo] = useState<CicloCobranca>('ANUAL');
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [mobileImgFailed, setMobileImgFailed] = useState(false);

  // Validador público de QR Code
  const [qrCodeInput, setQrCodeInput] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrResult, setQrResult] = useState<CertificadoPublicoDoc | null>(null);
  const [qrSearched, setQrSearched] = useState(false);

  const toggleAddon = (slug: string) => {
    setSelectedAddons((prev) =>
      prev.includes(slug) ? prev.filter((item) => item !== slug) : [...prev, slug]
    );
  };

  const selectedAddonsTotalCentavos = useMemo(() => {
    if (!catalog) return 0;
    return catalog.adicionais
      .filter((a) => selectedAddons.includes(a.slug))
      .reduce((sum, a) => sum + a.precoMensalCentavos, 0);
  }, [catalog, selectedAddons]);

  const defaultPlanoSlug =
    catalog?.planos.find((p) => p.destaque)?.slug || catalog?.planos[0]?.slug || 'profissional';

  const handleValidateQr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrCodeInput.trim()) return;
    setQrLoading(true);
    setQrSearched(false);
    try {
      const found = await validatePublicCertificadoQr(qrCodeInput);
      setQrResult(found);
      setQrSearched(true);
    } finally {
      setQrLoading(false);
    }
  };

  const hasCatalog = Boolean(catalog && catalog.planos.length > 0);

  return (
    <div className="min-h-screen dk-ambient-canvas">
      {/* NAVBAR FLUTUANTE TRANSLÚCIDA */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-[#060913]/75 backdrop-blur-xl border-b border-slate-200/80 dark:border-white/10">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <a
            href="#topo"
            className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 flex items-center gap-2.5"
          >
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#1D4ED8] to-[#3B82F6] text-white text-xs font-extrabold flex items-center justify-center shadow-md shadow-blue-600/30">
              DK
            </span>
            <span>DK Facilita</span>
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a
              href="#softwares"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Softwares
            </a>
            <a
              href="#recursos"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Recursos
            </a>
            <a
              href="#planos"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Planos
            </a>
            <a
              href="#adicionais"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Adicionais
            </a>
            <a
              href="#validar-qr"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Validar QR
            </a>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <ThemeToggleButton compact />
            {isAuthenticated ? (
              <button
                type="button"
                onClick={onGoPanel}
                className="px-4 py-2 rounded-lg bg-[#1D4ED8] text-white text-xs font-semibold hover:bg-[#1E40AF] transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-md shadow-blue-600/25"
              >
                Acessar Painel
              </button>
            ) : (
              <button
                type="button"
                onClick={onGoLogin}
                className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Entrar
              </button>
            )}
          </div>
        </div>
      </header>

      {/* HERO SECTION — DARK INTELLIGENCE / PRO MAX */}
      <section id="topo" className="border-b border-slate-200/80 dark:border-white/10">
        <div className="max-w-[1200px] mx-auto px-6 py-16 lg:py-24 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <div className="inline-flex items-center gap-2 self-start px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/25 text-xs font-medium text-[#1D4ED8] dark:text-blue-400">
              <span className="dk-live-dot" style={{ backgroundColor: '#3B82F6' }} />
              <span>DK Facilita · Ecossistema de Softwares Empresariais</span>
            </div>

            <h1 className="mt-5 text-[clamp(2.2rem,3.8vw,3.35rem)] font-bold tracking-tight leading-[1.08] dk-gradient-title">
              Treinamentos de NRs, provas digitais e certificados com QR Code em um só lugar
            </h1>
            <p className="mt-5 text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              Conheça o{' '}
              <strong className="text-slate-900 dark:text-white">Certifica Software - DK</strong>, o
              sistema multiempresa da DK Facilita criado para consultorias de SST, engenheiros de
              segurança, estaleiros e indústrias eliminarem papelada e acelerarem a mobilização de
              equipes.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() =>
                  onStartCheckout({
                    planoSlug: defaultPlanoSlug,
                    ciclo,
                    modoInicio: 'TRIAL',
                    adicionaisSlugs: selectedAddons,
                  })
                }
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-[#1D4ED8] to-[#2563EB] text-white text-sm font-semibold hover:from-[#1E40AF] hover:to-[#1D4ED8] transition-all whitespace-nowrap shrink-0 cursor-pointer shadow-lg shadow-blue-600/30"
              >
                Testar Grátis por 7 Dias
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() =>
                  onStartCheckout({
                    planoSlug: defaultPlanoSlug,
                    ciclo,
                    modoInicio: 'IMEDIATO',
                    adicionaisSlugs: selectedAddons,
                  })
                }
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-white text-sm font-medium hover:bg-slate-50 dark:hover:bg-white/[0.08] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Contratar Agora
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-200/80 dark:border-white/10 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Liberação imediata no cadastro</span>
              <span aria-hidden="true">·</span>
              <span>Identidade visual 100% da sua empresa</span>
              <span aria-hidden="true">·</span>
              <span>Validação QR permanente</span>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[300px] lg:min-h-[430px] rounded-2xl overflow-hidden border border-slate-200 dark:border-white/15 bg-slate-900 relative shadow-2xl shadow-blue-950/20">
              {!heroImgFailed ? (
                <img
                  src={HERO_IMAGE}
                  alt="Engenheiros de segurança do trabalho revisando certificações digitais de NRs em ambiente industrial"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-slate-200 bg-gradient-to-br from-slate-900 to-slate-800">
                  <FileBadge className="w-10 h-10 text-blue-400 mb-3" />
                  <p className="text-sm font-semibold">Certifica Software - DK</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Operação normativa digital para equipes técnicas e industriais
                  </p>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#060913]/95 via-[#060913]/65 to-transparent px-6 py-5 text-white">
                <p className="text-xs text-blue-300 font-medium inline-flex items-center gap-2">
                  <span className="dk-live-dot" />
                  Produto principal · DK Facilita
                </p>
                <p className="text-sm font-semibold mt-1">
                  Certifica Software - DK — Isolamento multiempresa, provas mobile e dossiês de obra
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* VITRINE DE SOFTWARES DA DK FACILITA */}
      <section id="softwares" className="max-w-[1200px] mx-auto px-6 py-16 space-y-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#1D4ED8] dark:text-blue-400">
            Portfólio DK Facilita
          </p>
          <h2 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight dk-gradient-title">
            Uma plataforma empresarial pensada para crescer com a sua operação
          </h2>
          <p className="mt-2.5 text-sm sm:text-base text-slate-600 dark:text-slate-400">
            Comece hoje pelo Certifica Software - DK e acompanhe os próximos softwares corporativos
            do ecossistema DK Facilita.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Produto Principal em Destaque */}
          <div className="lg:col-span-7 dk-glass-card rounded-2xl p-7 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-[#1D4ED8] dark:text-blue-400 inline-flex items-center gap-1.5">
                  <span className="dk-live-dot" />
                  Produto principal · Disponível agora
                </span>
                <span className="font-mono">certifica.dkfacilita.com</span>
              </div>
              <h3 className="mt-3 text-xl font-bold text-slate-900 dark:text-white">
                Certifica Software - DK
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Gestão ponta a ponta de treinamentos de Normas Regulamentadoras: catálogo completo
                de NRs linha por linha, aplicação de provas via QR Code no celular, captura de
                assinatura e selfie, emissão de certificados Frente e Verso vetoriais, cartas de
                anuência e pacote completo de auditoria por contrato ou obra.
              </p>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700 dark:text-slate-200 pt-5 border-t border-slate-200/80 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#1D4ED8] dark:text-blue-400 shrink-0" />
                  <span>Isolamento estrito multiempresa</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#1D4ED8] dark:text-blue-400 shrink-0" />
                  <span>Snapshot imutável de conteúdo no verso</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#1D4ED8] dark:text-blue-400 shrink-0" />
                  <span>4 modelos gratuitos + modelo próprio (.pptx)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#1D4ED8] dark:text-blue-400 shrink-0" />
                  <span>Central de vencimentos 60/30/15/7/1 dias</span>
                </div>
              </div>
            </div>

            <div className="mt-7 pt-5 border-t border-slate-200/80 dark:border-white/10 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  onStartCheckout({
                    planoSlug: defaultPlanoSlug,
                    ciclo,
                    modoInicio: 'TRIAL',
                    adicionaisSlugs: selectedAddons,
                  })
                }
                className="px-4 py-2.5 rounded-xl bg-[#1D4ED8] text-white text-xs font-semibold hover:bg-[#1E40AF] transition-colors cursor-pointer"
              >
                Iniciar Teste Grátis de 7 Dias
              </button>
              <a
                href="#planos"
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/15 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                Comparar Planos
              </a>
            </div>
          </div>

          {/* Espaço Estruturado para Futuros Softwares da DK Facilita */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="dk-glass-card rounded-2xl p-6 flex-1 flex flex-col justify-between">
              <div>
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Ecossistema DK · Próximo lançamento
                </p>
                <h3 className="mt-2 text-base font-semibold text-slate-900 dark:text-white">
                  DK Inspeções & Checklists de Campo
                </h3>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Vistorias digitais de equipamentos, APRs de campo e planos de ação integrados aos
                  mesmos contratos e colaboradores cadastrados na sua conta DK Facilita.
                </p>
              </div>
              <p className="mt-4 pt-3 border-t border-slate-200/80 dark:border-white/10 text-xs text-slate-500 dark:text-slate-400">
                Arquitetura preparada para login unificado da sua empresa.
              </p>
            </div>

            <div className="dk-glass-card rounded-2xl p-6 flex-1 flex flex-col justify-between">
              <div>
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Ecossistema DK · Roadmap corporativo
                </p>
                <h3 className="mt-2 text-base font-semibold text-slate-900 dark:text-white">
                  DK Gestão de EPIs & Fichas Digitais
                </h3>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Controle de entregas com validade de CA, assinatura na tela e integração direta
                  ao dossiê trabalhista do colaborador.
                </p>
              </div>
              <p className="mt-4 pt-3 border-t border-slate-200/80 dark:border-white/10 text-xs text-slate-500 dark:text-slate-400">
                Clientes ativos do Certifica terão acesso antecipado.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* BENEFÍCIOS PRÁTICOS */}
      <section
        id="recursos"
        className="border-y border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-white/[0.015]"
      >
        <div className="max-w-[1200px] mx-auto px-6 py-16 space-y-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-5">
              <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-white/15 bg-slate-100 dark:bg-slate-900 aspect-[4/3] shadow-xl">
                {!mobileImgFailed ? (
                  <img
                    src={MOBILE_IMAGE}
                    alt="Colaborador assinando prova e treinamento digital na tela do celular"
                    referrerPolicy="no-referrer"
                    onError={() => setMobileImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-500">
                    <Smartphone className="w-8 h-8 mb-2" />
                    <p className="text-xs font-medium">Prova mobile com assinatura na tela</p>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-7 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#1D4ED8] dark:text-blue-400">
                Fluxo operacional sem retrabalho
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight dk-gradient-title">
                Da sala de aula ou canteiro de obra ao certificado validado em minutos
              </h2>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                Cada recurso foi desenhado para a rotina real de Técnicos de Segurança, Instrutores
                e Responsáveis Técnicos — sem planilhas soltas, sem digitar o mesmo conteúdo
                programático duas vezes e sem risco de perder evidências em auditoria.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-6 border-t border-slate-200/80 dark:border-white/10">
            {CAPABILITIES.map((cap) => (
              <div key={cap.numero} className="dk-glass-card rounded-xl p-5 space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xs font-semibold text-[#1D4ED8] dark:text-blue-400">
                    {cap.numero}
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {cap.titulo}
                  </h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {cap.descricao}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TABELA DE PLANOS INTERATIVA (LENDO DA BASE REAL) */}
      <section id="planos" className="max-w-[1200px] mx-auto px-6 py-16 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#1D4ED8] dark:text-blue-400">
              Planos Certifica Software - DK
            </p>
            <h2 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight dk-gradient-title">
              Preços transparentes por porte da sua operação
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Todos os planos oferecem teste grátis de 7 dias com liberação imediata ou contratação
              direta via Pix e Cartão Recorrente.
            </p>
          </div>

          {/* Seletor Interativo de Ciclo */}
          <div className="inline-flex items-center gap-1 p-1 bg-slate-200/80 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl self-start">
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
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  ciclo === opt.id
                    ? 'bg-white dark:bg-[#1D4ED8] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {loadingCatalog ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-96 dk-glass-card rounded-2xl animate-pulse"
              />
            ))}
          </div>
        ) : !hasCatalog ? (
          <div className="dk-glass-card rounded-2xl p-8 text-center max-w-xl mx-auto">
            <Database className="w-8 h-8 text-slate-400 mx-auto" />
            <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">
              Planos em atualização comercial
            </h3>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              Nosso catálogo comercial está sendo sincronizado em tempo real. Atualize a página em
              instantes ou acesse sua conta existente.
            </p>
            <div className="mt-5">
              <button
                type="button"
                onClick={onGoLogin}
                className="px-4 py-2.5 rounded-xl bg-[#1D4ED8] text-white text-xs font-semibold hover:bg-[#1E40AF] cursor-pointer"
              >
                Entrar na minha conta
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {catalog!.planos.map((plano) => {
              const preco = calcularPrecoCicloCentavos(
                plano.precoMensalCentavos,
                ciclo,
                plano.descontoSemestral,
                plano.descontoAnual
              );

              return (
                <div
                  key={plano.id}
                  className={`dk-glass-card rounded-2xl p-6 flex flex-col justify-between ${
                    plano.destaque
                      ? '!border-[#1D4ED8] dark:!border-blue-500/70 ring-1 ring-blue-500/25 shadow-xl shadow-blue-950/15'
                      : ''
                  }`}
                >
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {plano.nome}
                      </h3>
                      {plano.destaque && (
                        <span className="text-[11px] font-semibold text-[#1D4ED8] dark:text-blue-400">
                          Recomendado
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 min-h-[32px]">
                      {plano.subtitulo}
                    </p>

                    <div className="mt-5 pt-5 border-t border-slate-200/80 dark:border-white/10">
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                          {formatarMoedaBRL(preco.mensalEquivalenteCentavos)}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">/mês</span>
                      </div>
                      <p className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {ciclo === 'MENSAL'
                          ? 'Sem fidelidade · cobrança mensal'
                          : `${formatarMoedaBRL(preco.totalPeriodoCentavos)} no plano ${ciclo.toLowerCase()}`}
                      </p>
                    </div>

                    <dl className="mt-5 pt-5 border-t border-slate-200/80 dark:border-white/10 space-y-2.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-600 dark:text-slate-400">Colaboradores ativos</dt>
                        <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                          {plano.limiteColaboradores.toLocaleString('pt-BR')}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-600 dark:text-slate-400">Usuários da equipe</dt>
                        <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                          {plano.limiteUsuarios}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-600 dark:text-slate-400">Contratos / Obras</dt>
                        <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                          {plano.limiteObras}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-600 dark:text-slate-400">Cartas de Anuência</dt>
                        <dd className="font-medium text-slate-900 dark:text-slate-200">
                          {plano.incluiCartaAnuencia ? 'Incluso' : 'Adicional'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-600 dark:text-slate-400">Alertas WhatsApp</dt>
                        <dd className="font-medium text-slate-900 dark:text-slate-200">
                          {plano.incluiAlertasWpp ? 'Incluso' : 'Adicional'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-600 dark:text-slate-400">Domínio Próprio</dt>
                        <dd className="font-medium text-slate-900 dark:text-slate-200">
                          {plano.incluiDominioProprio ? 'Incluso' : 'Adicional'}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="mt-6 pt-5 border-t border-slate-200/80 dark:border-white/10 space-y-2">
                    <button
                      type="button"
                      onClick={() =>
                        onStartCheckout({
                          planoSlug: plano.slug,
                          ciclo,
                          modoInicio: 'TRIAL',
                          adicionaisSlugs: selectedAddons,
                        })
                      }
                      className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                        plano.destaque
                          ? 'bg-[#1D4ED8] text-white hover:bg-[#1E40AF] shadow-md shadow-blue-600/25'
                          : 'bg-slate-900 dark:bg-white text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-slate-100'
                      }`}
                    >
                      Testar Grátis por 7 Dias
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onStartCheckout({
                          planoSlug: plano.slug,
                          ciclo,
                          modoInicio: 'IMEDIATO',
                          adicionaisSlugs: selectedAddons,
                        })
                      }
                      className="w-full py-2 px-4 rounded-xl border border-slate-200 dark:border-white/15 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      Contratar Agora
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SEÇÃO DE SERVIÇOS ADICIONAIS */}
      {hasCatalog && (
        <section
          id="adicionais"
          className="border-y border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-white/[0.015]"
        >
          <div className="max-w-[1200px] mx-auto px-6 py-16 space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="max-w-xl">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#1D4ED8] dark:text-blue-400">
                  Expansão sob demanda
                </p>
                <h2 className="mt-1.5 text-2xl font-bold tracking-tight dk-gradient-title">
                  Serviços Adicionais (Add-ons)
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Marque os recursos que deseja incluir já na contratação ou contrate depois com
                  liberação automática dentro do painel.
                </p>
              </div>

              {selectedAddons.length > 0 && (
                <div className="flex items-center gap-4 dk-glass-card rounded-xl px-4 py-2.5">
                  <div className="text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      {selectedAddons.length}{' '}
                      {selectedAddons.length === 1
                        ? 'adicional selecionado'
                        : 'adicionais selecionados'}
                    </span>
                    <p className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                      +{formatarMoedaBRL(selectedAddonsTotalCentavos)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onStartCheckout({
                        planoSlug: defaultPlanoSlug,
                        ciclo,
                        modoInicio: 'IMEDIATO',
                        adicionaisSlugs: selectedAddons,
                      })
                    }
                    className="px-3.5 py-2 rounded-lg bg-[#1D4ED8] text-white text-xs font-semibold hover:bg-[#1E40AF] whitespace-nowrap cursor-pointer"
                  >
                    Levar ao Checkout
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {catalog!.adicionais.map((addon) => {
                const isSelected = selectedAddons.includes(addon.slug);
                return (
                  <button
                    key={addon.id}
                    type="button"
                    onClick={() => toggleAddon(addon.slug)}
                    className={`text-left p-5 rounded-2xl transition-all flex flex-col justify-between cursor-pointer dk-glass-card ${
                      isSelected
                        ? '!border-[#1D4ED8] dark:!border-blue-500/70 !bg-blue-50/50 dark:!bg-blue-500/10'
                        : ''
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                          {addon.nome}
                        </h3>
                        <span
                          className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-[#1D4ED8] border-[#1D4ED8] text-white'
                              : 'border-slate-300 dark:border-white/20 text-slate-400'
                          }`}
                        >
                          {isSelected ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {addon.descricao}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200/80 dark:border-white/10 flex items-baseline justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">
                        {addon.tipoCobranca === 'UNICO' ? 'Taxa única' : 'Recorrente mensal'}
                      </span>
                      <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                        {formatarMoedaBRL(addon.precoMensalCentavos)}
                        {addon.tipoCobranca === 'RECORRENTE' ? '/mês' : ''}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* VALIDAÇÃO PÚBLICA DE QR CODE */}
      <section id="validar-qr" className="max-w-[1200px] mx-auto px-6 py-16">
        <div className="dk-glass-card rounded-2xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#1D4ED8] dark:text-blue-400">
              <QrCode className="w-4 h-4" />
              <span>Portal Público de Autenticidade</span>
            </div>
            <h2 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
              Validar Certificado por Código QR
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              Digite o código impresso no certificado emitido pelo Certifica Software - DK para
              conferir validade, carga horária e conteúdo programático registrado.
            </p>
          </div>

          <form
            onSubmit={handleValidateQr}
            className="flex flex-col sm:flex-row gap-2.5 w-full lg:w-auto"
          >
            <input
              value={qrCodeInput}
              onChange={(e) => setQrCodeInput(e.target.value)}
              placeholder="Ex.: QR-XXXX-YYYY"
              className="sm:w-64 px-3.5 py-2.5 text-sm font-mono bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={qrLoading}
              className="px-5 py-2.5 rounded-xl bg-[#1D4ED8] text-white text-xs font-semibold hover:bg-[#1E40AF] whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              {qrLoading ? 'Consultando...' : 'Verificar Autenticidade'}
            </button>
          </form>
        </div>

        {qrSearched && (
          <div className="mt-4">
            {qrResult ? (
              <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-5 text-sm text-emerald-950 dark:text-emerald-100 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-emerald-900 dark:text-emerald-300">
                  <ShieldCheck className="w-5 h-5" />
                  Certificado Autêntico · Nº {qrResult.numeroCertificado} ({qrResult.status})
                </div>
                <p>
                  <strong>Colaborador:</strong> {qrResult.colaboradorNome} · CPF{' '}
                  <span className="font-mono">{qrResult.colaboradorCpfMascarado}</span>
                </p>
                <p>
                  <strong>Treinamento:</strong> {qrResult.nrCodigo} — {qrResult.treinamentoTitulo}{' '}
                  ({qrResult.cargaHorariaHoras}h)
                </p>
                <p>
                  <strong>Emissor:</strong> {qrResult.empresaRazaoSocial} · Validade até{' '}
                  <span className="font-mono">{qrResult.dataValidade}</span>
                </p>
              </div>
            ) : (
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-4 text-sm text-red-900 dark:text-red-200">
                Nenhum certificado encontrado para o código{' '}
                <span className="font-mono font-semibold">{qrCodeInput}</span>.
              </div>
            )}
          </div>
        )}
      </section>

      {/* RODAPÉ INSTITUCIONAL */}
      <footer className="bg-white/75 dark:bg-[#060913]/80 border-t border-slate-200/80 dark:border-white/10">
        <div className="max-w-[1200px] mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-xs text-slate-500 dark:text-slate-400">
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">DK Facilita</p>
            <p className="mt-1">
              dkfacilita.com · Tecnologia empresarial para gestão normativa e certificação digital.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <a href="#softwares" className="hover:text-slate-900 dark:hover:text-white">
              Softwares
            </a>
            <a href="#planos" className="hover:text-slate-900 dark:hover:text-white">
              Planos
            </a>
            <a href="#validar-qr" className="hover:text-slate-900 dark:hover:text-white">
              Validar QR
            </a>
            <button
              type="button"
              onClick={isAuthenticated ? onGoPanel : onGoLogin}
              className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              {isAuthenticated ? 'Acessar Painel' : 'Entrar'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
