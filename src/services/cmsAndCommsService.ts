import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import type {
  CicloCobranca,
  ComunicadoDoc,
  ComunicadoLidoDoc,
  CupomDoc,
  EmpresaDoc,
  SiteCmsConfigDoc,
} from '../types/domain.ts';

// ============================================================================
// UTILITÁRIOS DE AGENDAMENTO E MÍDIA
// ============================================================================

export function isWithinSchedule(inicioIso?: string | null, fimIso?: string | null): boolean {
  const now = Date.now();
  if (inicioIso && inicioIso.trim()) {
    const startMs = Date.parse(inicioIso.length === 10 ? `${inicioIso}T00:00:00` : inicioIso);
    if (!Number.isNaN(startMs) && now < startMs) return false;
  }
  if (fimIso && fimIso.trim()) {
    const endMs = Date.parse(fimIso.length === 10 ? `${fimIso}T23:59:59` : fimIso);
    if (!Number.isNaN(endMs) && now > endMs) return false;
  }
  return true;
}

export function getScheduleState(
  ativo: boolean,
  inicioIso?: string | null,
  fimIso?: string | null
): 'ATIVO' | 'AGENDADO' | 'EXPIRADO' | 'INATIVO' {
  if (!ativo) return 'INATIVO';
  const now = Date.now();
  if (inicioIso && inicioIso.trim()) {
    const startMs = Date.parse(inicioIso.length === 10 ? `${inicioIso}T00:00:00` : inicioIso);
    if (!Number.isNaN(startMs) && now < startMs) return 'AGENDADO';
  }
  if (fimIso && fimIso.trim()) {
    const endMs = Date.parse(fimIso.length === 10 ? `${fimIso}T23:59:59` : fimIso);
    if (!Number.isNaN(endMs) && now > endMs) return 'EXPIRADO';
  }
  return 'ATIVO';
}

export const EMPTY_SITE_CMS_CONFIG: SiteCmsConfigDoc = {
  id: 'principal',
  faixaTopo: {
    ativo: false,
    texto: '',
    textoBotao: 'Aproveitar',
    corTema: 'AMBAR',
    linkDestino: '/checkout',
    cupomAutomatico: '',
    inicioIso: '',
    fimIso: '',
  },
  carrosselSlides: [],
  cardsPromocionais: [],
  secaoPlanos: {
    etiqueta: 'Planos para sua empresa',
    titulo: 'A solução ideal para a sua equipe',
    descricao: 'Organize treinamentos, avaliações e certificados da sua empresa em um só lugar. Escolha o plano que acompanha o tamanho da sua operação.',
    semOfertasTitulo: 'Conheça em breve as opções para sua empresa',
    semOfertasDescricao: 'Estamos preparando condições comerciais para atender empresas de diferentes tamanhos. Enquanto isso, clientes atuais podem acessar sua conta normalmente.',
    botaoEntrar: 'Já sou cliente — entrar',
  },
};

export async function uploadCmsMediaFile(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Selecione uma imagem PNG, JPG ou WebP.');
  }
  if (file.size > 3 * 1024 * 1024) {
    throw new Error('A imagem deve ter no máximo 3 MB.');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Erro ao ler arquivo de imagem.'));
    reader.readAsDataURL(file);
  });

  const resp = await fetch('/api/cms/upload-media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl, fileName: file.name }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error || 'Falha ao enviar banner para o servidor.');
  }

  const json = await resp.json();
  return String(json.url);
}

// ============================================================================
// 1. SITE & CAMPANHAS (CMS)
// ============================================================================

export async function fetchSiteCmsConfig(): Promise<SiteCmsConfigDoc> {
  const path = 'site_cms/principal';
  try {
    const snap = await getDoc(doc(db, 'site_cms', 'principal'));
    if (!snap.exists()) return EMPTY_SITE_CMS_CONFIG;
    const data = snap.data() as Partial<SiteCmsConfigDoc>;
    return {
      id: 'principal',
      faixaTopo: {
        ...EMPTY_SITE_CMS_CONFIG.faixaTopo,
        ...(data.faixaTopo || {}),
      },
      carrosselSlides: Array.isArray(data.carrosselSlides)
        ? [...data.carrosselSlides].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
        : [],
      cardsPromocionais: Array.isArray(data.cardsPromocionais)
        ? [...data.cardsPromocionais].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
        : [],
      secaoPlanos: {
        ...EMPTY_SITE_CMS_CONFIG.secaoPlanos,
      ...(data.secaoPlanos || {}),
      },
      updatedAt: data.updatedAt ?? null,
    };
  } catch (error) {
    console.warn('CMS indisponível ou não configurado ainda:', error);
    return EMPTY_SITE_CMS_CONFIG;
  }
}

export async function saveSiteCmsConfig(config: SiteCmsConfigDoc): Promise<SiteCmsConfigDoc> {
  const path = 'site_cms/principal';
  const payload = {
    id: 'principal',
    faixaTopo: {
      ativo: Boolean(config.faixaTopo.ativo),
      texto: config.faixaTopo.texto.trim().slice(0, 220),
      textoBotao: (config.faixaTopo.textoBotao || 'Aproveitar').trim().slice(0, 40),
      corTema: config.faixaTopo.corTema || 'AMBAR',
      linkDestino: (config.faixaTopo.linkDestino || '/checkout').trim().slice(0, 240),
      cupomAutomatico: config.faixaTopo.cupomAutomatico.trim().toUpperCase().slice(0, 40),
      inicioIso: config.faixaTopo.inicioIso.trim().slice(0, 32),
      fimIso: config.faixaTopo.fimIso.trim().slice(0, 32),
    },
    carrosselSlides: config.carrosselSlides.slice(0, 10).map((s, idx) => ({
      id: s.id || `slide_${Date.now().toString(36)}_${idx}`,
      titulo: s.titulo.trim().slice(0, 140),
      subtitulo: (s.subtitulo || '').trim().slice(0, 200),
      imagemDesktopUrl: s.imagemDesktopUrl.trim().slice(0, 500),
      imagemMobileUrl: (s.imagemMobileUrl || '').trim().slice(0, 500),
      linkDestino: (s.linkDestino || '/checkout').trim().slice(0, 240),
      cupomAutomatico: (s.cupomAutomatico || '').trim().toUpperCase().slice(0, 40),
      inicioIso: (s.inicioIso || '').trim().slice(0, 32),
      fimIso: (s.fimIso || '').trim().slice(0, 32),
      ativo: Boolean(s.ativo),
      ordem: idx + 1,
    })),
    cardsPromocionais: config.cardsPromocionais.slice(0, 12).map((c, idx) => ({
      id: c.id || `card_${Date.now().toString(36)}_${idx}`,
      titulo: c.titulo.trim().slice(0, 140),
      descricao: (c.descricao || '').trim().slice(0, 260),
      imagemUrl: c.imagemUrl.trim().slice(0, 500),
      posicao: c.posicao || 'ACIMA_PLANOS',
      textoBotao: (c.textoBotao || 'Aproveitar oferta').trim().slice(0, 40),
      linkDestino: (c.linkDestino || '/checkout').trim().slice(0, 240),
      cupomAutomatico: (c.cupomAutomatico || '').trim().toUpperCase().slice(0, 40),
      inicioIso: (c.inicioIso || '').trim().slice(0, 32),
      fimIso: (c.fimIso || '').trim().slice(0, 32),
      ativo: Boolean(c.ativo),
      ordem: idx + 1,
    })),
    secaoPlanos: {
      etiqueta: (config.secaoPlanos.etiqueta || '').trim().slice(0, 80),
      titulo: (config.secaoPlanos.titulo || '').trim().slice(0, 140),
      descricao: (config.secaoPlanos.descricao || '').trim().slice(0, 320),
      semOfertasTitulo: (config.secaoPlanos.semOfertasTitulo || '').trim().slice(0, 140),
      semOfertasDescricao: (config.secaoPlanos.semOfertasDescricao || '').trim().slice(0, 320),
      botaoEntrar: (config.secaoPlanos.botaoEntrar || '').trim().slice(0, 60),
    },
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'site_cms', 'principal'), payload);
    return {
      ...payload,
      updatedAt: null,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ============================================================================
// 2. CUPONS DE DESCONTO
// ============================================================================

function normalizeCouponId(codigo: string): string {
  return codigo
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 36);
}

export async function listCupons(includeInactive = false): Promise<CupomDoc[]> {
  const path = 'cupons';
  try {
    const q = includeInactive
      ? query(collection(db, path))
      : query(collection(db, path), where('ativo', '==', true));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ ...(d.data() as CupomDoc), id: d.id }))
      .sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function saveCupom(
  cupom: Omit<CupomDoc, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<CupomDoc> {
  const cleanCode = normalizeCouponId(cupom.codigo);
  if (cleanCode.length < 3) {
    throw new Error('O código do cupom deve possuir pelo menos 3 caracteres alfanuméricos.');
  }

  const docId = cupom.id ? normalizeCouponId(cupom.id) : cleanCode;
  const path = `cupons/${docId}`;
  const existingSnap = await getDoc(doc(db, 'cupons', docId)).catch(() => null);
  const existingData = existingSnap?.exists() ? (existingSnap.data() as CupomDoc) : null;

  const payload = {
    codigo: cleanCode,
    descricao: cupom.descricao?.trim().slice(0, 200) || null,
    tipoDesconto: cupom.tipoDesconto === 'FIXO' ? ('FIXO' as const) : ('PERCENTUAL' as const),
    valorDesconto:
      cupom.tipoDesconto === 'FIXO'
        ? Math.max(100, Math.round(Number(cupom.valorDesconto) || 0))
        : Math.min(90, Math.max(1, Math.round(Number(cupom.valorDesconto) || 0))),
    planosAplicaveis: Array.isArray(cupom.planosAplicaveis) ? cupom.planosAplicaveis : [],
    ciclosAplicaveis: Array.isArray(cupom.ciclosAplicaveis) ? cupom.ciclosAplicaveis : [],
    inicioIso: (cupom.inicioIso || '').trim().slice(0, 32),
    fimIso: (cupom.fimIso || '').trim().slice(0, 32),
    limiteUsos: Math.max(0, Math.round(Number(cupom.limiteUsos) || 0)),
    usosAtuais: existingData ? existingData.usosAtuais : Math.max(0, Math.round(cupom.usosAtuais || 0)),
    ativo: Boolean(cupom.ativo),
    createdAt: existingData?.createdAt ?? serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'cupons', docId), payload);
    return {
      ...payload,
      id: docId,
      createdAt: existingData?.createdAt ?? null,
      updatedAt: null,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCupom(cupomId: string): Promise<void> {
  const path = `cupons/${cupomId}`;
  try {
    await deleteDoc(doc(db, 'cupons', cupomId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function validateCupomByCode(params: {
  codigo: string;
  planoSlug: string;
  ciclo: CicloCobranca;
}): Promise<{ ok: true; cupom: CupomDoc } | { ok: false; error: string }> {
  const cleanCode = normalizeCouponId(params.codigo);
  if (cleanCode.length < 3) {
    return { ok: false, error: 'Informe um código de cupom válido.' };
  }

  try {
    const snap = await getDoc(doc(db, 'cupons', cleanCode));
    if (!snap.exists()) {
      return { ok: false, error: `Cupom "${cleanCode}" não encontrado.` };
    }
    const cupom = { ...(snap.data() as CupomDoc), id: snap.id };

    if (!cupom.ativo) {
      return { ok: false, error: 'Este cupom está inativo no momento.' };
    }
    if (!isWithinSchedule(cupom.inicioIso, cupom.fimIso)) {
      return { ok: false, error: 'Este cupom está fora do período de validade.' };
    }
    if (cupom.limiteUsos > 0 && cupom.usosAtuais >= cupom.limiteUsos) {
      return { ok: false, error: 'Este cupom atingiu o limite máximo de utilizações.' };
    }
    if (cupom.planosAplicaveis.length > 0 && !cupom.planosAplicaveis.includes(params.planoSlug)) {
      return { ok: false, error: 'Este cupom não se aplica ao plano selecionado.' };
    }
    if (cupom.ciclosAplicaveis.length > 0 && !cupom.ciclosAplicaveis.includes(params.ciclo)) {
      return {
        ok: false,
        error: `Cupom válido apenas para ciclo(s): ${cupom.ciclosAplicaveis.join(', ')}.`,
      };
    }

    return { ok: true, cupom };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Não foi possível validar o cupom.',
    };
  }
}

export function calcularDescontoCupomCentavos(
  subtotalCentavos: number,
  cupom: CupomDoc | null
): number {
  if (!cupom || subtotalCentavos <= 0) return 0;
  if (cupom.tipoDesconto === 'PERCENTUAL') {
    return Math.min(subtotalCentavos, Math.round((subtotalCentavos * cupom.valorDesconto) / 100));
  }
  return Math.min(subtotalCentavos, Math.round(cupom.valorDesconto));
}

export async function incrementCupomUso(cupomId: string): Promise<void> {
  const path = `cupons/${cupomId}`;
  try {
    const snap = await getDoc(doc(db, 'cupons', cupomId));
    if (!snap.exists()) return;
    const current = Number((snap.data() as CupomDoc).usosAtuais || 0);
    await updateDoc(doc(db, 'cupons', cupomId), {
      usosAtuais: current + 1,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Falha ao incrementar uso do cupom:', error);
  }
}

// ============================================================================
// 3. CENTRAL DE COMUNICADOS (DONO -> EMPRESAS CLIENTES)
// ============================================================================

export async function listComunicados(includeAll = false): Promise<ComunicadoDoc[]> {
  const path = 'comunicados';
  try {
    const q = includeAll
      ? query(collection(db, path))
      : query(collection(db, path), where('status', 'in', ['ATIVO', 'AGENDADO']));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ ...(d.data() as ComunicadoDoc), id: d.id }))
      .sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export function filterComunicadosForEmpresa(
  comunicados: ComunicadoDoc[],
  empresa: EmpresaDoc
): ComunicadoDoc[] {
  return comunicados.filter((c) => {
    if (c.status !== 'ATIVO' && c.status !== 'AGENDADO') return false;
    if (!isWithinSchedule(c.agendadoInicioIso, c.agendadoFimIso)) return false;

    if (c.publicoAlvo === 'ATIVAS' && empresa.status !== 'ATIVA') return false;
    if (c.publicoAlvo === 'TRIAL' && empresa.status !== 'TRIAL') return false;
    if (
      c.publicoAlvo === 'PLANO_ESPECIFICO' &&
      c.planoAlvoSlug &&
      empresa.planoSlug !== c.planoAlvoSlug
    ) {
      return false;
    }
    return true;
  });
}

export async function saveComunicado(
  input: Omit<ComunicadoDoc, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<ComunicadoDoc> {
  const id = input.id || `com_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const path = `comunicados/${id}`;
  const existingSnap = input.id ? await getDoc(doc(db, 'comunicados', id)).catch(() => null) : null;
  const existingData = existingSnap?.exists() ? (existingSnap.data() as ComunicadoDoc) : null;

  const payload = {
    titulo: input.titulo.trim().slice(0, 160),
    mensagem: input.mensagem.trim().slice(0, 2000),
    tipo: input.tipo || 'INFORMATIVO',
    exibirPopup: Boolean(input.exibirPopup),
    publicoAlvo: input.publicoAlvo || 'TODAS',
    planoAlvoSlug:
      input.publicoAlvo === 'PLANO_ESPECIFICO' && input.planoAlvoSlug
        ? input.planoAlvoSlug.trim().slice(0, 64)
        : null,
    agendadoInicioIso: (input.agendadoInicioIso || '').trim().slice(0, 32),
    agendadoFimIso: (input.agendadoFimIso || '').trim().slice(0, 32),
    repeticao: input.repeticao || 'UNICO',
    status: input.status || 'ATIVO',
    createdAt: existingData?.createdAt ?? serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'comunicados', id), payload);
    return {
      ...payload,
      id,
      createdAt: existingData?.createdAt ?? null,
      updatedAt: null,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteComunicado(comunicadoId: string): Promise<void> {
  const path = `comunicados/${comunicadoId}`;
  try {
    await deleteDoc(doc(db, 'comunicados', comunicadoId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function listComunicadosLidosEmpresa(empresaId: string): Promise<string[]> {
  const path = `empresas/${empresaId}/comunicados_lidos`;
  try {
    const snap = await getDocs(collection(db, 'empresas', empresaId, 'comunicados_lidos'));
    return snap.docs.map((d) => d.id);
  } catch (error) {
    console.warn('Erro ao consultar comunicados lidos:', error);
    return [];
  }
}

export async function markComunicadoLido(
  empresaId: string,
  comunicadoId: string,
  userUid: string
): Promise<ComunicadoLidoDoc> {
  const path = `empresas/${empresaId}/comunicados_lidos/${comunicadoId}`;
  const payload = {
    comunicadoId,
    empresaId,
    lidoPorUid: userUid,
    lidoEm: serverTimestamp(),
  };
  try {
    await setDoc(doc(db, 'empresas', empresaId, 'comunicados_lidos', comunicadoId), payload);
    return { ...payload, id: comunicadoId, lidoEm: null };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
