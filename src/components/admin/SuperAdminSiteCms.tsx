import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  Layers,
  Megaphone,
  Plus,
  Save,
  Sparkles,
  Tag,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  CmsHeroSlide,
  CmsPromoCard,
  CmsPromoPosition,
  CmsTopBarTheme,
  SiteCmsConfigDoc,
} from '../../types/domain.ts';
import type { PlanoCatalogo } from '../../data/globalCatalogSeed.ts';
import { formatarMoedaBRL } from '../../data/globalCatalogSeed.ts';
import {
  EMPTY_SITE_CMS_CONFIG,
  fetchSiteCmsConfig,
  getScheduleState,
  saveSiteCmsConfig,
  uploadCmsMediaFile,
} from '../../services/cmsAndCommsService.ts';
import { adminSavePlano } from '../../services/superAdminService.ts';

interface SuperAdminSiteCmsProps {
  planos: PlanoCatalogo[];
  onCatalogChanged: () => Promise<void>;
}

type CmsSlotKey = 'faixa' | 'carrossel' | 'cards' | 'ofertas';

const TOP_BAR_THEMES: { id: CmsTopBarTheme; label: string; previewClass: string }[] = [
  {
    id: 'AMBAR',
    label: 'Âmbar / Black Friday',
    previewClass: 'bg-gradient-to-r from-[#241608] via-[#452408] to-[#241608] border-amber-500/50 text-amber-200',
  },
  {
    id: 'AZUL',
    label: 'Azul Elétrico DK',
    previewClass: 'bg-gradient-to-r from-[#0B1B3B] via-[#1D4ED8] to-[#0B1B3B] border-blue-400/50 text-blue-100',
  },
  {
    id: 'ESMERALDA',
    label: 'Esmeralda / Lançamento',
    previewClass: 'bg-gradient-to-r from-[#05291E] via-[#047857] to-[#05291E] border-emerald-400/50 text-emerald-100',
  },
  {
    id: 'VERMELHO',
    label: 'Alerta / Últimas Horas',
    previewClass: 'bg-gradient-to-r from-[#2D0A0E] via-[#B91C1C] to-[#2D0A0E] border-red-400/50 text-red-100',
  },
];

function StatusPill({ state }: { state: 'ATIVO' | 'AGENDADO' | 'EXPIRADO' | 'INATIVO' }) {
  if (state === 'ATIVO') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-500 dark:text-emerald-400">
        <span className="dk-live-dot bg-emerald-400 shadow-[0_0_8px_#34D399]" />
        (Ativo)
      </span>
    );
  }
  if (state === 'AGENDADO') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-500 dark:text-amber-400">
        <span className="dk-live-dot bg-amber-400 shadow-[0_0_8px_#F59E0B]" />
        (Agendado)
      </span>
    );
  }
  if (state === 'EXPIRADO') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500 dark:text-red-400">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        (Expirado)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
      <span className="w-2 h-2 rounded-full bg-slate-500" />
      (Oculto no site)
    </span>
  );
}

export const SuperAdminSiteCms: React.FC<SuperAdminSiteCmsProps> = ({
  planos,
  onCatalogChanged,
}) => {
  const [cms, setCms] = useState<SiteCmsConfigDoc>(EMPTY_SITE_CMS_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [activeSlot, setActiveSlot] = useState<CmsSlotKey>('carrossel');
  const [selectedSlideIdx, setSelectedSlideIdx] = useState(0);
  const [selectedCardIdx, setSelectedCardIdx] = useState(0);

  // Edição rápida de preço promocional e selo nos planos reais
  const [promoDrafts, setPromoDrafts] = useState<
    Record<string, { precoNormalReais: string; precoPromoReais: string; selo: string }>
  >({});
  const [savingPlanoId, setSavingPlanoId] = useState<string | null>(null);

  const desktopInputRef = useRef<HTMLInputElement | null>(null);
  const mobileInputRef = useRef<HTMLInputElement | null>(null);
  const cardInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchSiteCmsConfig()
      .then((cfg) => {
        if (active) setCms(cfg);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const map: Record<string, { precoNormalReais: string; precoPromoReais: string; selo: string }> =
      {};
    for (const p of planos) {
      map[p.id] = {
        precoNormalReais: (p.precoMensalCentavos / 100).toFixed(2),
        precoPromoReais:
          typeof p.precoPromocionalCentavos === 'number' && p.precoPromocionalCentavos > 0
            ? (p.precoPromocionalCentavos / 100).toFixed(2)
            : '',
        selo: p.seloPromocional || '',
      };
    }
    setPromoDrafts(map);
  }, [planos]);

  const handleSaveCms = async (nextCms?: SiteCmsConfigDoc) => {
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await saveSiteCmsConfig(nextCms || cms);
      setCms(saved);
      setFeedback({
        type: 'ok',
        text: 'Alterações de campanha salvas e publicadas em tempo real no site dkfacilita.com.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao salvar configurações do CMS.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddSlide = () => {
    const newSlide: CmsHeroSlide = {
      id: `slide_${Date.now().toString(36)}`,
      titulo: 'Nova Campanha Principal',
      subtitulo: '',
      imagemDesktopUrl: '',
      imagemMobileUrl: '',
      linkDestino: '/checkout?plano=profissional',
      cupomAutomatico: '',
      inicioIso: '',
      fimIso: '',
      ativo: true,
      ordem: cms.carrosselSlides.length + 1,
    };
    const nextSlides = [...cms.carrosselSlides, newSlide];
    setCms((prev) => ({ ...prev, carrosselSlides: nextSlides }));
    setSelectedSlideIdx(nextSlides.length - 1);
    setActiveSlot('carrossel');
  };

  const handleMoveSlide = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= cms.carrosselSlides.length) return;
    const arr = [...cms.carrosselSlides];
    const [item] = arr.splice(idx, 1);
    arr.splice(target, 0, item);
    setCms((prev) => ({ ...prev, carrosselSlides: arr }));
    setSelectedSlideIdx(target);
  };

  const handleRemoveSlide = (idx: number) => {
    const arr = cms.carrosselSlides.filter((_, i) => i !== idx);
    setCms((prev) => ({ ...prev, carrosselSlides: arr }));
    setSelectedSlideIdx(Math.max(0, idx - 1));
  };

  const handleAddCard = () => {
    const newCard: CmsPromoCard = {
      id: `card_${Date.now().toString(36)}`,
      titulo: 'Oferta Especial DK Facilita',
      descricao: '',
      imagemUrl: '',
      posicao: 'ACIMA_PLANOS',
      textoBotao: 'Aproveitar oferta',
      linkDestino: '/checkout?plano=profissional',
      cupomAutomatico: '',
      inicioIso: '',
      fimIso: '',
      ativo: true,
      ordem: cms.cardsPromocionais.length + 1,
    };
    const nextCards = [...cms.cardsPromocionais, newCard];
    setCms((prev) => ({ ...prev, cardsPromocionais: nextCards }));
    setSelectedCardIdx(nextCards.length - 1);
    setActiveSlot('cards');
  };

  const handleRemoveCard = (idx: number) => {
    const arr = cms.cardsPromocionais.filter((_, i) => i !== idx);
    setCms((prev) => ({ ...prev, cardsPromocionais: arr }));
    setSelectedCardIdx(Math.max(0, idx - 1));
  };

  const handleUploadImage = async (
    file: File | undefined,
    key: string,
    onDone: (url: string) => void
  ) => {
    if (!file) return;
    setUploadingKey(key);
    setFeedback(null);
    try {
      const url = await uploadCmsMediaFile(file);
      onDone(url);
      setFeedback({ type: 'ok', text: 'Imagem enviada com sucesso. Clique em "Salvar Alterações".' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Falha ao enviar imagem.',
      });
    } finally {
      setUploadingKey(null);
    }
  };

  const handleSavePlanoOferta = async (plano: PlanoCatalogo) => {
    const draft = promoDrafts[plano.id];
    if (!draft) return;
    setSavingPlanoId(plano.id);
    setFeedback(null);
    try {
      const normalCentavos = Math.max(
        0,
        Math.round(Number(draft.precoNormalReais.replace(',', '.')) * 100) || plano.precoMensalCentavos
      );
      const promoNum = Number(draft.precoPromoReais.replace(',', '.'));
      const promoCentavos =
        draft.precoPromoReais.trim() && !Number.isNaN(promoNum) && promoNum > 0
          ? Math.round(promoNum * 100)
          : null;

      await adminSavePlano({
        ...plano,
        precoMensalCentavos: normalCentavos,
        precoPromocionalCentavos: promoCentavos,
        seloPromocional: draft.selo.trim() || null,
      });
      await onCatalogChanged();
      setFeedback({
        type: 'ok',
        text: `Oferta do plano "${plano.nome}" atualizada e sincronizada na Landing Page.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao atualizar preço promocional do plano.',
      });
    } finally {
      setSavingPlanoId(null);
    }
  };

  const currentSlide = cms.carrosselSlides[selectedSlideIdx] ?? null;
  const currentCard = cms.cardsPromocionais[selectedCardIdx] ?? null;

  const faixaState = getScheduleState(
    cms.faixaTopo.ativo && Boolean(cms.faixaTopo.texto.trim()),
    cms.faixaTopo.inicioIso,
    cms.faixaTopo.fimIso
  );

  const activeSlidesCount = cms.carrosselSlides.filter(
    (s) =>
      Boolean(s.imagemDesktopUrl) &&
      getScheduleState(s.ativo, s.inicioIso, s.fimIso) === 'ATIVO'
  ).length;
  const scheduledSlidesCount = cms.carrosselSlides.filter(
    (s) => getScheduleState(s.ativo, s.inicioIso, s.fimIso) === 'AGENDADO'
  ).length;
  const carrosselState =
    activeSlidesCount > 0 ? 'ATIVO' : scheduledSlidesCount > 0 ? 'AGENDADO' : 'INATIVO';

  const activeCardsCount = cms.cardsPromocionais.filter(
    (c) => Boolean(c.imagemUrl) && getScheduleState(c.ativo, c.inicioIso, c.fimIso) === 'ATIVO'
  ).length;
  const scheduledCardsCount = cms.cardsPromocionais.filter(
    (c) => getScheduleState(c.ativo, c.inicioIso, c.fimIso) === 'AGENDADO'
  ).length;
  const cardsState =
    activeCardsCount > 0 ? 'ATIVO' : scheduledCardsCount > 0 ? 'AGENDADO' : 'INATIVO';

  const activePromosCount = planos.filter(
    (p) => (p.precoPromocionalCentavos && p.precoPromocionalCentavos > 0) || p.seloPromocional
  ).length;

  const topBarPreviewTheme =
    TOP_BAR_THEMES.find((t) => t.id === cms.faixaTopo.corTema) ?? TOP_BAR_THEMES[0];

  if (loading) {
    return (
      <div className="dk-glass-card rounded-2xl p-10 text-center text-sm text-slate-500 dark:text-slate-400">
        Carregando configurações de Site & Campanhas...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página (Padrão Mockup Dark Intelligence) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Gestão de Campanhas e Banners do Site
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Controle os 4 espaços dinâmicos da página inicial. Espaços sem campanha ativa ou fora da
            data agendada ficam 100% invisíveis para os visitantes.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (activeSlot === 'cards') {
              handleAddCard();
            } else {
              handleAddSlide();
            }
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#3B82F6] hover:from-[#1D4ED8] hover:to-[#2563EB] text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all cursor-pointer self-start"
        >
          <Plus className="w-4 h-4" />
          Nova Campanha
        </button>
      </div>

      {feedback && (
        <div
          className={`rounded-xl px-4 py-3 text-xs border flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-900 dark:text-red-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Layout em 2 Colunas — Esquerda: Espaços Ativos | Direita: Painel de Configuração */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUNA ESQUERDA: LISTA DOS 4 SLOTS */}
        <div className="lg:col-span-7 space-y-4">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Banners e Espaços Ativos
          </h3>

          {/* SLOT 1: FAIXA DE TOPO */}
          <div
            onClick={() => setActiveSlot('faixa')}
            className={`dk-glass-card rounded-2xl p-5 cursor-pointer transition-all ${
              activeSlot === 'faixa'
                ? '!border-blue-500/70 ring-1 ring-blue-500/30 shadow-[0_0_30px_-10px_rgba(59,130,246,0.4)]'
                : ''
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    1. Faixa de Topo
                  </span>
                  <StatusPill state={faixaState} />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {cms.faixaTopo.texto || 'Nenhuma mensagem configurada para a barra superior.'}
                </p>
                <div className="pt-1">
                  <span className="inline-flex items-center px-3 py-1 rounded-lg border border-slate-200 dark:border-white/15 text-xs font-medium text-slate-700 dark:text-slate-200">
                    Editar
                  </span>
                </div>
              </div>

              <div className="sm:w-64 shrink-0">
                <div
                  className={`rounded-lg border px-3 py-2 text-[10px] font-medium flex items-center justify-between gap-2 ${topBarPreviewTheme.previewClass}`}
                >
                  <span className="truncate">
                    {cms.faixaTopo.texto || 'Prévia da faixa de topo...'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/15 border border-white/25 text-[9px] font-semibold shrink-0">
                    {cms.faixaTopo.textoBotao || 'Aproveitar'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SLOT 2: CARROSSEL PRINCIPAL */}
          <div
            onClick={() => setActiveSlot('carrossel')}
            className={`dk-glass-card rounded-2xl p-5 cursor-pointer transition-all ${
              activeSlot === 'carrossel'
                ? '!border-blue-500/70 ring-1 ring-blue-500/30 shadow-[0_0_30px_-10px_rgba(59,130,246,0.4)]'
                : ''
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    2. Carrossel Principal
                  </span>
                  <StatusPill state={carrosselState} />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {cms.carrosselSlides.length === 0
                    ? 'Nenhum banner cadastrado (slot oculto automaticamente).'
                    : `${cms.carrosselSlides.length} slide(s) cadastrado(s) · ${activeSlidesCount} ativo(s) agora`}
                </p>
                <div className="pt-1 flex items-center gap-2">
                  <span className="inline-flex items-center px-3 py-1 rounded-lg border border-slate-200 dark:border-white/15 text-xs font-medium text-slate-700 dark:text-slate-200">
                    Editar
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddSlide();
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/15 text-blue-600 dark:text-blue-400 text-xs font-semibold hover:bg-blue-600/25 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Slide
                  </button>
                </div>
              </div>

              <div className="sm:w-64 h-24 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/[0.03] shrink-0 flex items-center justify-center">
                {cms.carrosselSlides[0]?.imagemDesktopUrl ? (
                  <img
                    src={cms.carrosselSlides[0].imagemDesktopUrl}
                    alt={cms.carrosselSlides[0].titulo}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center px-3 text-[11px] text-slate-400">
                    <ImageIcon className="w-5 h-5 mx-auto mb-1 opacity-60" />
                    Banner 1920×450px
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SLOT 3: CARDS & FLYERS PROMOCIONAIS */}
          <div
            onClick={() => setActiveSlot('cards')}
            className={`dk-glass-card rounded-2xl p-5 cursor-pointer transition-all ${
              activeSlot === 'cards'
                ? '!border-blue-500/70 ring-1 ring-blue-500/30 shadow-[0_0_30px_-10px_rgba(59,130,246,0.4)]'
                : ''
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    3. Cards & Flyers Promocionais
                  </span>
                  <StatusPill state={cardsState} />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {cms.cardsPromocionais.length === 0
                    ? 'Nenhum flyer configurado (slot invisível na página inicial).'
                    : `${cms.cardsPromocionais.length} card(s) · ${activeCardsCount} visível(is) agora`}
                </p>
                <div className="pt-1 flex items-center gap-2">
                  <span className="inline-flex items-center px-3 py-1 rounded-lg border border-slate-200 dark:border-white/15 text-xs font-medium text-slate-700 dark:text-slate-200">
                    Editar
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddCard();
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-semibold hover:bg-amber-500/25 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Card / Flyer
                  </button>
                </div>
              </div>

              {cms.cardsPromocionais[0]?.inicioIso && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300 text-xs font-mono shrink-0">
                  <Calendar className="w-3.5 h-3.5" />
                  {cms.cardsPromocionais[0].inicioIso}
                  {cms.cardsPromocionais[0].fimIso ? ` → ${cms.cardsPromocionais[0].fimIso}` : ''}
                </span>
              )}
            </div>
          </div>

          {/* SLOT 4: PLANOS, PREÇOS PROMOCIONAIS & SELOS */}
          <div
            onClick={() => setActiveSlot('ofertas')}
            className={`dk-glass-card rounded-2xl p-5 cursor-pointer transition-all ${
              activeSlot === 'ofertas'
                ? '!border-blue-500/70 ring-1 ring-blue-500/30 shadow-[0_0_30px_-10px_rgba(59,130,246,0.4)]'
                : ''
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    4. Planos, Preços Promocionais ("De/Por") & Selos
                  </span>
                  <StatusPill state={activePromosCount > 0 ? 'ATIVO' : 'INATIVO'} />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {activePromosCount > 0
                    ? `${activePromosCount} plano(s) com selo ou preço promocional ativo na vitrine.`
                    : 'Configure preço normal, preço promocional riscado e selo flutuante (ex.: OFERTA BLACK FRIDAY).'}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/15 text-xs font-medium text-slate-700 dark:text-slate-200 shrink-0">
                <Tag className="w-3.5 h-3.5 text-blue-500" />
                Configurar Planos
              </span>
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA: PAINEL DE CONFIGURAÇÃO DO SLOT SELECIONADO */}
        <div className="lg:col-span-5 dk-glass-card rounded-2xl p-6 space-y-5">
          {/* EDITOR SLOT 1: FAIXA DE TOPO */}
          {activeSlot === 'faixa' && (
            <>
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-white/10">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-amber-500" />
                  Configurações — Faixa de Topo
                </h3>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Texto da Faixa
                  </label>
                  <input
                    value={cms.faixaTopo.texto}
                    onChange={(e) =>
                      setCms((prev) => ({
                        ...prev,
                        faixaTopo: { ...prev.faixaTopo, texto: e.target.value },
                      }))
                    }
                    placeholder="Ex.: BLACK FRIDAY DK: 30% OFF nos planos anuais com o cupom BLACKDK30"
                    className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Texto do Botão
                    </label>
                    <input
                      value={cms.faixaTopo.textoBotao}
                      onChange={(e) =>
                        setCms((prev) => ({
                          ...prev,
                          faixaTopo: { ...prev.faixaTopo, textoBotao: e.target.value },
                        }))
                      }
                      placeholder="Aproveitar"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Cor de Destaque
                    </label>
                    <select
                      value={cms.faixaTopo.corTema}
                      onChange={(e) =>
                        setCms((prev) => ({
                          ...prev,
                          faixaTopo: {
                            ...prev.faixaTopo,
                            corTema: e.target.value as CmsTopBarTheme,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
                    >
                      {TOP_BAR_THEMES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Link de Destino
                  </label>
                  <input
                    value={cms.faixaTopo.linkDestino}
                    onChange={(e) =>
                      setCms((prev) => ({
                        ...prev,
                        faixaTopo: { ...prev.faixaTopo, linkDestino: e.target.value },
                      }))
                    }
                    placeholder="/checkout?plano=profissional&cupom=BLACKDK30"
                    className="w-full px-3 py-2 rounded-xl font-mono bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Cupom Automático (aplicado no clique)
                  </label>
                  <input
                    value={cms.faixaTopo.cupomAutomatico}
                    onChange={(e) =>
                      setCms((prev) => ({
                        ...prev,
                        faixaTopo: {
                          ...prev.faixaTopo,
                          cupomAutomatico: e.target.value.toUpperCase(),
                        },
                      }))
                    }
                    placeholder="BLACKDK30"
                    className="w-full px-3 py-2 rounded-xl font-mono uppercase bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Início
                    </label>
                    <input
                      type="date"
                      value={cms.faixaTopo.inicioIso}
                      onChange={(e) =>
                        setCms((prev) => ({
                          ...prev,
                          faixaTopo: { ...prev.faixaTopo, inicioIso: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl font-mono bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Fim
                    </label>
                    <input
                      type="date"
                      value={cms.faixaTopo.fimIso}
                      onChange={(e) =>
                        setCms((prev) => ({
                          ...prev,
                          faixaTopo: { ...prev.faixaTopo, fimIso: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl font-mono bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    Faixa Visível no Site
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCms((prev) => ({
                        ...prev,
                        faixaTopo: { ...prev.faixaTopo, ativo: !prev.faixaTopo.ativo },
                      }))
                    }
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      cms.faixaTopo.ativo ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        cms.faixaTopo.ativo ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>

                <div className="pt-3 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSaveCms()}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white font-semibold hover:from-[#1D4ED8] hover:to-[#2563EB] shadow-lg shadow-blue-600/25 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* EDITOR SLOT 2: CARROSSEL PRINCIPAL */}
          {activeSlot === 'carrossel' && (
            <>
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-white/10">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Configurações do Banner — Carrossel Principal
                </h3>
                <button
                  type="button"
                  onClick={handleAddSlide}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/15 text-blue-600 dark:text-blue-400 text-xs font-semibold hover:bg-blue-600/25 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar
                </button>
              </div>

              {cms.carrosselSlides.length === 0 ? (
                <div className="py-8 text-center space-y-3">
                  <ImageIcon className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Nenhum banner cadastrado no Carrossel Principal. O espaço permanece invisível no
                    site até você adicionar e ativar um slide.
                  </p>
                  <button
                    type="button"
                    onClick={handleAddSlide}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2563EB] text-white text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Criar primeiro slide
                  </button>
                </div>
              ) : (
                <div className="space-y-4 text-xs">
                  {/* Seletor + Ordenação dos Slides */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {cms.carrosselSlides.map((s, idx) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedSlideIdx(idx)}
                        className={`px-2.5 py-1.5 rounded-lg font-medium border transition-colors cursor-pointer ${
                          selectedSlideIdx === idx
                            ? 'bg-blue-600 text-white border-blue-500'
                            : 'bg-slate-100 dark:bg-white/[0.04] border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        Slide {idx + 1}
                      </button>
                    ))}
                  </div>

                  {currentSlide && (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono text-slate-400">
                          Ordem #{selectedSlideIdx + 1} de {cms.carrosselSlides.length}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={selectedSlideIdx === 0}
                            onClick={() => handleMoveSlide(selectedSlideIdx, -1)}
                            title="Mover para cima"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-white/15 text-slate-600 dark:text-slate-300 disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={selectedSlideIdx === cms.carrosselSlides.length - 1}
                            onClick={() => handleMoveSlide(selectedSlideIdx, 1)}
                            title="Mover para baixo"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-white/15 text-slate-600 dark:text-slate-300 disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveSlide(selectedSlideIdx)}
                            title="Remover slide"
                            className="p-1.5 rounded-lg border border-red-200 dark:border-red-500/30 text-red-500 hover:bg-red-500/10 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Upload Banner Desktop */}
                      <div>
                        <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          Banner Desktop (1920×450px, PNG/JPG máx 3MB)
                        </label>
                        <input
                          ref={desktopInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            void handleUploadImage(f, 'desktop', (url) => {
                              setCms((prev) => ({
                                ...prev,
                                carrosselSlides: prev.carrosselSlides.map((item, i) =>
                                  i === selectedSlideIdx ? { ...item, imagemDesktopUrl: url } : item
                                ),
                              }));
                            });
                            e.target.value = '';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => desktopInputRef.current?.click()}
                          className="w-full rounded-xl border border-dashed border-slate-300 dark:border-white/20 bg-slate-50/70 dark:bg-white/[0.02] hover:border-blue-500/60 p-4 text-center transition-colors cursor-pointer"
                        >
                          {currentSlide.imagemDesktopUrl ? (
                            <div className="space-y-2">
                              <img
                                src={currentSlide.imagemDesktopUrl}
                                alt="Preview Desktop"
                                className="w-full h-24 object-cover rounded-lg border border-white/10"
                              />
                              <p className="text-[11px] text-blue-500 font-medium">
                                {uploadingKey === 'desktop'
                                  ? 'Enviando...'
                                  : 'Clique para substituir a imagem Desktop'}
                              </p>
                            </div>
                          ) : (
                            <div className="py-2 space-y-1.5">
                              <Upload className="w-5 h-5 text-slate-400 mx-auto" />
                              <p className="font-medium text-slate-700 dark:text-slate-200">
                                {uploadingKey === 'desktop'
                                  ? 'Enviando banner...'
                                  : 'Arraste o banner PNG/JPG ou clique para buscar'}
                              </p>
                              <p className="text-[11px] text-slate-400">1920×450px, máx 3MB</p>
                            </div>
                          )}
                        </button>
                      </div>

                      {/* Upload Banner Mobile (Opcional) */}
                      <div>
                        <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          Banner Mobile (opcional — exibe em telas pequenas)
                        </label>
                        <input
                          ref={mobileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            void handleUploadImage(f, 'mobile', (url) => {
                              setCms((prev) => ({
                                ...prev,
                                carrosselSlides: prev.carrosselSlides.map((item, i) =>
                                  i === selectedSlideIdx ? { ...item, imagemMobileUrl: url } : item
                                ),
                              }));
                            });
                            e.target.value = '';
                          }}
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => mobileInputRef.current?.click()}
                            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-[#060913] text-slate-700 dark:text-slate-200 hover:border-blue-500/60 cursor-pointer"
                          >
                            {uploadingKey === 'mobile'
                              ? 'Enviando...'
                              : currentSlide.imagemMobileUrl
                                ? 'Trocar Imagem Mobile'
                                : 'Enviar Imagem Mobile'}
                          </button>
                          {currentSlide.imagemMobileUrl && (
                            <span className="text-[11px] text-emerald-500 font-medium">
                              Mobile configurado
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          Título da Campanha (acessibilidade / referência interna)
                        </label>
                        <input
                          value={currentSlide.titulo}
                          onChange={(e) =>
                            setCms((prev) => ({
                              ...prev,
                              carrosselSlides: prev.carrosselSlides.map((item, i) =>
                                i === selectedSlideIdx ? { ...item, titulo: e.target.value } : item
                              ),
                            }))
                          }
                          placeholder="Ex.: Black Friday Certifica DK — 30% OFF"
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          Link de Destino
                        </label>
                        <input
                          value={currentSlide.linkDestino}
                          onChange={(e) =>
                            setCms((prev) => ({
                              ...prev,
                              carrosselSlides: prev.carrosselSlides.map((item, i) =>
                                i === selectedSlideIdx
                                  ? { ...item, linkDestino: e.target.value }
                                  : item
                              ),
                            }))
                          }
                          placeholder="/checkout?plano=profissional&cupom=BLACKDK30"
                          className="w-full px-3 py-2 rounded-xl font-mono bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          Cupom Automático
                        </label>
                        <input
                          value={currentSlide.cupomAutomatico}
                          onChange={(e) =>
                            setCms((prev) => ({
                              ...prev,
                              carrosselSlides: prev.carrosselSlides.map((item, i) =>
                                i === selectedSlideIdx
                                  ? { ...item, cupomAutomatico: e.target.value.toUpperCase() }
                                  : item
                              ),
                            }))
                          }
                          placeholder="BLACKDK30"
                          className="w-full px-3 py-2 rounded-xl font-mono uppercase bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                            Início
                          </label>
                          <input
                            type="date"
                            value={currentSlide.inicioIso}
                            onChange={(e) =>
                              setCms((prev) => ({
                                ...prev,
                                carrosselSlides: prev.carrosselSlides.map((item, i) =>
                                  i === selectedSlideIdx
                                    ? { ...item, inicioIso: e.target.value }
                                    : item
                                ),
                              }))
                            }
                            className="w-full px-3 py-2 rounded-xl font-mono bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                            Fim
                          </label>
                          <input
                            type="date"
                            value={currentSlide.fimIso}
                            onChange={(e) =>
                              setCms((prev) => ({
                                ...prev,
                                carrosselSlides: prev.carrosselSlides.map((item, i) =>
                                  i === selectedSlideIdx ? { ...item, fimIso: e.target.value } : item
                                ),
                              }))
                            }
                            className="w-full px-3 py-2 rounded-xl font-mono bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          Banner Visível no Site
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setCms((prev) => ({
                              ...prev,
                              carrosselSlides: prev.carrosselSlides.map((item, i) =>
                                i === selectedSlideIdx ? { ...item, ativo: !item.ativo } : item
                              ),
                            }))
                          }
                          className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                            currentSlide.ativo ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                              currentSlide.ativo ? 'left-[22px]' : 'left-0.5'
                            }`}
                          />
                        </button>
                      </div>

                      <div className="pt-3 flex items-center gap-3">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleSaveCms()}
                          className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white font-semibold hover:from-[#1D4ED8] hover:to-[#2563EB] shadow-lg shadow-blue-600/25 cursor-pointer disabled:opacity-50"
                        >
                          <Save className="w-4 h-4" />
                          {saving ? 'Salvando...' : 'Salvar Alterações'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* EDITOR SLOT 3: CARDS & FLYERS PROMOCIONAIS */}
          {activeSlot === 'cards' && (
            <>
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-white/10">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-500" />
                  Cards & Flyers Promocionais
                </h3>
                <button
                  type="button"
                  onClick={handleAddCard}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Novo Card
                </button>
              </div>

              {cms.cardsPromocionais.length === 0 ? (
                <div className="py-8 text-center space-y-3">
                  <Sparkles className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Nenhum flyer promocional cadastrado. Adicione artes para exibir acima ou abaixo
                    da tabela de planos.
                  </p>
                  <button
                    type="button"
                    onClick={handleAddCard}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2563EB] text-white text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Criar primeiro Flyer
                  </button>
                </div>
              ) : (
                <div className="space-y-4 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {cms.cardsPromocionais.map((c, idx) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedCardIdx(idx)}
                          className={`px-2.5 py-1.5 rounded-lg font-medium border cursor-pointer ${
                            selectedCardIdx === idx
                              ? 'bg-blue-600 text-white border-blue-500'
                              : 'bg-slate-100 dark:bg-white/[0.04] border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          Card {idx + 1}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCard(selectedCardIdx)}
                      className="p-1.5 rounded-lg border border-red-200 dark:border-red-500/30 text-red-500 hover:bg-red-500/10 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {currentCard && (
                    <>
                      <div>
                        <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          Arte do Card / Flyer (PNG/JPG máx 3MB)
                        </label>
                        <input
                          ref={cardInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            void handleUploadImage(f, 'card', (url) => {
                              setCms((prev) => ({
                                ...prev,
                                cardsPromocionais: prev.cardsPromocionais.map((item, i) =>
                                  i === selectedCardIdx ? { ...item, imagemUrl: url } : item
                                ),
                              }));
                            });
                            e.target.value = '';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => cardInputRef.current?.click()}
                          className="w-full rounded-xl border border-dashed border-slate-300 dark:border-white/20 bg-slate-50/70 dark:bg-white/[0.02] hover:border-blue-500/60 p-4 text-center cursor-pointer"
                        >
                          {currentCard.imagemUrl ? (
                            <img
                              src={currentCard.imagemUrl}
                              alt={currentCard.titulo}
                              className="w-full h-28 object-cover rounded-lg"
                            />
                          ) : (
                            <div className="py-2">
                              <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                              <p className="text-slate-600 dark:text-slate-300 font-medium">
                                {uploadingKey === 'card'
                                  ? 'Enviando arte...'
                                  : 'Clique para enviar o flyer PNG/JPG'}
                              </p>
                            </div>
                          )}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                            Título
                          </label>
                          <input
                            value={currentCard.titulo}
                            onChange={(e) =>
                              setCms((prev) => ({
                                ...prev,
                                cardsPromocionais: prev.cardsPromocionais.map((item, i) =>
                                  i === selectedCardIdx ? { ...item, titulo: e.target.value } : item
                                ),
                              }))
                            }
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                            Posição na Página
                          </label>
                          <select
                            value={currentCard.posicao}
                            onChange={(e) =>
                              setCms((prev) => ({
                                ...prev,
                                cardsPromocionais: prev.cardsPromocionais.map((item, i) =>
                                  i === selectedCardIdx
                                    ? { ...item, posicao: e.target.value as CmsPromoPosition }
                                    : item
                                ),
                              }))
                            }
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
                          >
                            <option value="ABAIXO_HERO">Logo abaixo do Hero</option>
                            <option value="ACIMA_PLANOS">Acima dos Planos</option>
                            <option value="ABAIXO_PLANOS">Abaixo dos Planos</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                            Link de Destino
                          </label>
                          <input
                            value={currentCard.linkDestino}
                            onChange={(e) =>
                              setCms((prev) => ({
                                ...prev,
                                cardsPromocionais: prev.cardsPromocionais.map((item, i) =>
                                  i === selectedCardIdx
                                    ? { ...item, linkDestino: e.target.value }
                                    : item
                                ),
                              }))
                            }
                            className="w-full px-3 py-2 rounded-xl font-mono bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                            Cupom Automático
                          </label>
                          <input
                            value={currentCard.cupomAutomatico}
                            onChange={(e) =>
                              setCms((prev) => ({
                                ...prev,
                                cardsPromocionais: prev.cardsPromocionais.map((item, i) =>
                                  i === selectedCardIdx
                                    ? { ...item, cupomAutomatico: e.target.value.toUpperCase() }
                                    : item
                                ),
                              }))
                            }
                            placeholder="OPCIONAL"
                            className="w-full px-3 py-2 rounded-xl font-mono uppercase bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                            Início
                          </label>
                          <input
                            type="date"
                            value={currentCard.inicioIso}
                            onChange={(e) =>
                              setCms((prev) => ({
                                ...prev,
                                cardsPromocionais: prev.cardsPromocionais.map((item, i) =>
                                  i === selectedCardIdx
                                    ? { ...item, inicioIso: e.target.value }
                                    : item
                                ),
                              }))
                            }
                            className="w-full px-3 py-2 rounded-xl font-mono bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                            Fim
                          </label>
                          <input
                            type="date"
                            value={currentCard.fimIso}
                            onChange={(e) =>
                              setCms((prev) => ({
                                ...prev,
                                cardsPromocionais: prev.cardsPromocionais.map((item, i) =>
                                  i === selectedCardIdx ? { ...item, fimIso: e.target.value } : item
                                ),
                              }))
                            }
                            className="w-full px-3 py-2 rounded-xl font-mono bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          Card Visível no Site
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setCms((prev) => ({
                              ...prev,
                              cardsPromocionais: prev.cardsPromocionais.map((item, i) =>
                                i === selectedCardIdx ? { ...item, ativo: !item.ativo } : item
                              ),
                            }))
                          }
                          className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                            currentCard.ativo ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                              currentCard.ativo ? 'left-[22px]' : 'left-0.5'
                            }`}
                          />
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleSaveCms()}
                        className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white font-semibold hover:from-[#1D4ED8] hover:to-[#2563EB] shadow-lg shadow-blue-600/25 cursor-pointer disabled:opacity-50"
                      >
                        <Save className="w-4 h-4" />
                        {saving ? 'Salvando...' : 'Salvar Alterações'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* EDITOR SLOT 4: PLANOS, PREÇO PROMOCIONAL ("DE/POR") & SELO NO CARD */}
          {activeSlot === 'ofertas' && (
            <>
              <div className="pb-3 border-b border-slate-200 dark:border-white/10">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Tag className="w-4 h-4 text-blue-500" />
                  Preços Promocionais ("De / Por") e Selos nos Planos
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Deixe o Preço Promocional em branco para exibir apenas o preço normal.
                </p>
              </div>

              <div className="space-y-4 max-h-[540px] overflow-y-auto pr-1">
                {planos.map((plano) => {
                  const draft = promoDrafts[plano.id] || {
                    precoNormalReais: (plano.precoMensalCentavos / 100).toFixed(2),
                    precoPromoReais: '',
                    selo: '',
                  };
                  return (
                    <div
                      key={plano.id}
                      className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] p-3.5 space-y-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {plano.nome}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          Atual: {formatarMoedaBRL(plano.precoMensalCentavos)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                            Preço Normal (R$/mês)
                          </label>
                          <input
                            value={draft.precoNormalReais}
                            onChange={(e) =>
                              setPromoDrafts((prev) => ({
                                ...prev,
                                [plano.id]: { ...draft, precoNormalReais: e.target.value },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg font-mono bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-amber-600 dark:text-amber-400 mb-1">
                            Preço Promo ("Por R$")
                          </label>
                          <input
                            value={draft.precoPromoReais}
                            onChange={(e) =>
                              setPromoDrafts((prev) => ({
                                ...prev,
                                [plano.id]: { ...draft, precoPromoReais: e.target.value },
                              }))
                            }
                            placeholder="Opcional"
                            className="w-full px-2.5 py-1.5 rounded-lg font-mono bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                          Selo flutuante no card (ex.: OFERTA BLACK FRIDAY)
                        </label>
                        <input
                          value={draft.selo}
                          onChange={(e) =>
                            setPromoDrafts((prev) => ({
                              ...prev,
                              [plano.id]: { ...draft, selo: e.target.value },
                            }))
                          }
                          placeholder="Deixe vazio para não exibir selo"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
                        />
                      </div>

                      <button
                        type="button"
                        disabled={savingPlanoId === plano.id}
                        onClick={() => void handleSavePlanoOferta(plano)}
                        className="w-full py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {savingPlanoId === plano.id ? 'Salvando...' : `Salvar oferta · ${plano.nome}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="pt-3 border-t border-slate-200 dark:border-white/10 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Sincronização imediata via Firestore</span>
            <a
              href="/"
              className="inline-flex items-center gap-1 text-blue-500 hover:underline font-medium"
            >
              Ver site ao vivo
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
