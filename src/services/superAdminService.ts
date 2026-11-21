import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import type {
  AdicionalCatalogo,
  ModeloCertificadoCatalogo,
  NrGlobalCatalogo,
  PlanoCatalogo,
} from '../data/globalCatalogSeed.ts';
import type { GlobalCatalogSnapshot } from './catalogService.ts';
import type { CicloCobranca, StatusEmpresa } from '../types/domain.ts';
import { platformAdminFetch } from './platformNotificationService.ts';

function sanitizeId(raw: string, prefix: string): string {
  const clean = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return clean || `${prefix}_${Date.now().toString(36)}`;
}

// ============================================================================
// 1. GESTÃO DE EMPRESAS CLIENTES (SUPER ADMIN)
// ============================================================================

export async function adminUpdateEmpresa(
  empresaId: string,
  patch: Partial<{
    status: StatusEmpresa;
    planoId: string | null;
    planoSlug: string | null;
    ciclo: CicloCobranca | null;
    valorMensalCentavos: number | null;
    trialExpiraEmIso: string | null;
    adicionaisAtivos: string[];
    featureFlags: Record<string, boolean>;
    modeloProprioUrl: string | null;
    dominioProprio: string | null;
  }>
): Promise<void> {
  if (patch.modeloProprioUrl && patch.modeloProprioUrl.length > 195000) {
    throw new Error('A imagem do Modelo Próprio excede o limite de 140 KB.');
  }

  const normalizedPatch: Record<string, unknown> = {
    ...patch,
    updatedAt: serverTimestamp(),
  };

  if (typeof patch.valorMensalCentavos === 'number') {
    normalizedPatch.valorMensalCentavos = Math.round(patch.valorMensalCentavos);
  }

  const path = `empresas/${empresaId}`;
  try {
    await updateDoc(doc(db, 'empresas', empresaId), normalizedPatch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ============================================================================
// 2. CATÁLOGO GLOBAL COMPLETO (INCLUINDO ITENS INATIVOS PARA SUPER ADMIN)
// ============================================================================

export async function adminFetchAllCatalog(): Promise<GlobalCatalogSnapshot> {
  try {
    const [planosSnap, adicionaisSnap, nrsSnap, modelosSnap] = await Promise.all([
      getDocs(collection(db, 'planos')),
      getDocs(collection(db, 'adicionais')),
      getDocs(collection(db, 'nrs_globais')),
      getDocs(collection(db, 'modelos_certificado_globais')),
    ]);

    const planos = planosSnap.docs
      .map((d) => ({ ...(d.data() as PlanoCatalogo), id: d.id }))
      .sort((a, b) => a.ordem - b.ordem);

    const adicionais = adicionaisSnap.docs
      .map((d) => ({ ...(d.data() as AdicionalCatalogo), id: d.id }))
      .sort((a, b) => a.ordem - b.ordem);

    const nrs = nrsSnap.docs
      .map((d) => ({ ...(d.data() as NrGlobalCatalogo), id: d.id }))
      .sort((a, b) => a.ordem - b.ordem);

    const modelos = modelosSnap.docs
      .map((d) => ({ ...(d.data() as ModeloCertificadoCatalogo), id: d.id }))
      .sort((a, b) => a.ordem - b.ordem);

    return { planos, adicionais, nrs, modelos };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'admin_catalogo_global');
  }
}

// --- CRUD PLANOS ---

export async function adminSavePlano(plano: PlanoCatalogo): Promise<PlanoCatalogo> {
  const id = plano.id ? sanitizeId(plano.id, 'plano') : sanitizeId(`plano_${plano.slug}`, 'plano');
  const promoVal =
    typeof plano.precoPromocionalCentavos === 'number' && plano.precoPromocionalCentavos > 0
      ? Math.round(plano.precoPromocionalCentavos)
      : null;
  const seloVal = plano.seloPromocional?.trim() ? plano.seloPromocional.trim().slice(0, 60) : null;

  const payload = {
    id,
    slug: sanitizeId(plano.slug || plano.nome, 'plano').replace(/_/g, '-'),
    nome: plano.nome.trim().slice(0, 100),
    subtitulo: plano.subtitulo.trim().slice(0, 200),
    descricao: plano.descricao.trim().slice(0, 600),
    precoMensalCentavos: Math.max(0, Math.round(Number(plano.precoMensalCentavos) || 0)),
    precoPromocionalCentavos: promoVal,
    seloPromocional: seloVal,
    descontoSemestral: Math.min(80, Math.max(0, Math.round(Number(plano.descontoSemestral) || 0))),
    descontoAnual: Math.min(80, Math.max(0, Math.round(Number(plano.descontoAnual) || 0))),
    limiteColaboradores: Math.max(1, Math.round(Number(plano.limiteColaboradores) || 50)),
    limiteUsuarios: Math.max(1, Math.round(Number(plano.limiteUsuarios) || 1)),
    limiteObras: Math.max(1, Math.round(Number(plano.limiteObras) || 1)),
    incluiCartaAnuencia: Boolean(plano.incluiCartaAnuencia),
    incluiDossieLink: Boolean(plano.incluiDossieLink),
    incluiAlertasWpp: Boolean(plano.incluiAlertasWpp),
    incluiDominioProprio: Boolean(plano.incluiDominioProprio),
    destaque: Boolean(plano.destaque),
    ativo: Boolean(plano.ativo),
    ordem: Math.round(Number(plano.ordem) || 1),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'planos', id), payload);
    await platformAdminFetch('/api/admin/commerce/plans', {
      method: 'POST',
      body: JSON.stringify({
        slug: payload.slug,
        nome: payload.nome,
        subtitulo: payload.subtitulo,
        descricao: payload.descricao,
        precoMensalCentavos: payload.precoMensalCentavos,
        descontoSemestral: payload.descontoSemestral,
        descontoAnual: payload.descontoAnual,
        limiteColaboradores: payload.limiteColaboradores,
        limiteUsuarios: payload.limiteUsuarios,
        limiteObras: payload.limiteObras,
        incluiCartaAnuencia: payload.incluiCartaAnuencia,
        incluiDossieLink: payload.incluiDossieLink,
        incluiAlertasWpp: payload.incluiAlertasWpp,
        incluiDominioProprio: payload.incluiDominioProprio,
        destaque: payload.destaque,
        ativo: payload.ativo,
        ordem: payload.ordem,
      }),
    });
    return {
      ...plano,
      id,
      slug: payload.slug,
      precoMensalCentavos: payload.precoMensalCentavos,
      precoPromocionalCentavos: payload.precoPromocionalCentavos,
      seloPromocional: payload.seloPromocional,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `planos/${id}`);
  }
}

export async function adminDeletePlano(planoId: string): Promise<void> {
  try {
    const snapshot = await getDoc(doc(db, 'planos', planoId));
    const plano = snapshot.data() as PlanoCatalogo | undefined;
    if (plano?.slug) {
      await platformAdminFetch(`/api/admin/commerce/plans/${encodeURIComponent(plano.slug)}`, { method: 'DELETE' });
    }
    await deleteDoc(doc(db, 'planos', planoId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `planos/${planoId}`);
  }
}

// --- CRUD ADICIONAIS ---

export async function adminSaveAdicional(
  adicional: AdicionalCatalogo
): Promise<AdicionalCatalogo> {
  const id = adicional.id
    ? sanitizeId(adicional.id, 'addon')
    : sanitizeId(`addon_${adicional.slug}`, 'addon');

  const payload = {
    id,
    slug: sanitizeId(adicional.slug || adicional.nome, 'addon').replace(/_/g, '-'),
    nome: adicional.nome.trim().slice(0, 120),
    descricao: adicional.descricao.trim().slice(0, 600),
    precoMensalCentavos: Math.max(0, Math.round(Number(adicional.precoMensalCentavos) || 0)),
    tipoCobranca: adicional.tipoCobranca === 'UNICO' ? ('UNICO' as const) : ('RECORRENTE' as const),
    recursoChave: sanitizeId(adicional.recursoChave || adicional.slug, 'recurso').slice(0, 64),
    incrementoQtd: Math.max(0, Math.round(Number(adicional.incrementoQtd) || 0)),
    ativo: Boolean(adicional.ativo),
    ordem: Math.round(Number(adicional.ordem) || 1),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'adicionais', id), payload);
    return { ...adicional, id, slug: payload.slug };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `adicionais/${id}`);
  }
}

export async function adminDeleteAdicional(adicionalId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'adicionais', adicionalId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `adicionais/${adicionalId}`);
  }
}

// --- CRUD NRS GLOBAIS ---

export async function adminSaveNrGlobal(nr: NrGlobalCatalogo): Promise<NrGlobalCatalogo> {
  const id = nr.id ? sanitizeId(nr.id, 'nr') : sanitizeId(nr.codigo, 'nr');
  const variacoesNormalizadas = nr.variacoes.map((v, vIdx) => ({
    slug: sanitizeId(v.slug || `${nr.codigo}_${v.nome}_${vIdx + 1}`, 'var').replace(/_/g, '-'),
    nome: v.nome.trim(),
    modalidade: v.modalidade,
    cargaHorariaHoras: Math.max(1, Math.round(Number(v.cargaHorariaHoras) || 8)),
    validadeMeses: Math.max(1, Math.round(Number(v.validadeMeses) || 24)),
    notaMinimaAprovacao: Math.min(100, Math.max(0, Math.round(Number(v.notaMinimaAprovacao) || 70))),
    ordem: vIdx + 1,
    linhas: v.linhas
      .filter((l) => l.descricao.trim().length > 0)
      .map((l, idx) => ({
        ordem: idx + 1,
        descricao: l.descricao.trim(),
        cargaHorariaMin: l.cargaHorariaMin ? Math.round(Number(l.cargaHorariaMin)) : null,
      })),
  }));

  const payload = {
    id,
    codigo: nr.codigo.trim().toUpperCase().slice(0, 20),
    titulo: nr.titulo.trim().slice(0, 240),
    descricao: nr.descricao.trim().slice(0, 800),
    baseLegal: nr.baseLegal.trim().slice(0, 240),
    validadePadraoMeses: Math.min(
      120,
      Math.max(1, Math.round(Number(nr.validadePadraoMeses) || 24))
    ),
    ativa: Boolean(nr.ativa),
    ordem: Math.round(Number(nr.ordem) || 1),
    variacoes: variacoesNormalizadas,
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'nrs_globais', id), payload);
    return { ...nr, id, variacoes: variacoesNormalizadas };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `nrs_globais/${id}`);
  }
}

export async function adminDeleteNrGlobal(nrId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'nrs_globais', nrId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `nrs_globais/${nrId}`);
  }
}

// --- CRUD MODELOS GRATUITOS DE CERTIFICADO ---

export async function adminSaveModeloCertificado(
  modelo: ModeloCertificadoCatalogo
): Promise<ModeloCertificadoCatalogo> {
  const id = modelo.id
    ? sanitizeId(modelo.id, 'modelo')
    : sanitizeId(`modelo_${modelo.slug || modelo.nome}`, 'modelo');

  const payload = {
    id,
    slug: sanitizeId(modelo.slug || modelo.nome, 'modelo').replace(/_/g, '-'),
    nome: modelo.nome.trim().slice(0, 120),
    descricao: modelo.descricao.trim().slice(0, 500),
    categoria: modelo.categoria === 'PREMIUM' ? ('PREMIUM' as const) : ('GRATUITO' as const),
    previewCssToken: modelo.previewCssToken.trim().slice(0, 64) || 'classico-institucional',
    layoutConfig: modelo.layoutConfig,
    ativo: Boolean(modelo.ativo),
    ordem: Math.round(Number(modelo.ordem) || 1),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'modelos_certificado_globais', id), payload);
    return { ...modelo, id, slug: payload.slug };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `modelos_certificado_globais/${id}`);
  }
}

export async function adminDeleteModeloCertificado(modeloId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'modelos_certificado_globais', modeloId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `modelos_certificado_globais/${modeloId}`);
  }
}
