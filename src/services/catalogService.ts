import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import {
  ADICIONAIS_GLOBAIS_SEED,
  AdicionalCatalogo,
  MODELOS_CERTIFICADO_GLOBAIS_SEED,
  ModeloCertificadoCatalogo,
  NRS_GLOBAIS_SEED,
  NrGlobalCatalogo,
  PLANOS_GLOBAIS_SEED,
  PlanoCatalogo,
} from '../data/globalCatalogSeed.ts';

export interface GlobalCatalogSnapshot {
  planos: PlanoCatalogo[];
  adicionais: AdicionalCatalogo[];
  nrs: NrGlobalCatalogo[];
  modelos: ModeloCertificadoCatalogo[];
}

export async function fetchGlobalCatalogFromDb(): Promise<GlobalCatalogSnapshot> {
  try {
    const [planosSnap, adicionaisSnap, nrsSnap, modelosSnap] = await Promise.all([
      getDocs(query(collection(db, 'planos'), where('ativo', '==', true))),
      getDocs(query(collection(db, 'adicionais'), where('ativo', '==', true))),
      getDocs(query(collection(db, 'nrs_globais'), where('ativa', '==', true))),
      getDocs(query(collection(db, 'modelos_certificado_globais'), where('ativo', '==', true))),
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
    handleFirestoreError(error, OperationType.LIST, 'catalogo_global');
  }
}

export interface SeedResult {
  planosGravados: number;
  adicionaisGravados: number;
  nrsGravadas: number;
  variacoesGravadas: number;
  linhasGravadas: number;
  modelosGravados: number;
}

export async function seedGlobalCatalogToFirestore(): Promise<SeedResult> {
  const batch = writeBatch(db);
  const now = serverTimestamp();

  for (const plano of PLANOS_GLOBAIS_SEED) {
    batch.set(doc(db, 'planos', plano.id), {
      ...plano,
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const adicional of ADICIONAIS_GLOBAIS_SEED) {
    batch.set(doc(db, 'adicionais', adicional.id), {
      ...adicional,
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const modelo of MODELOS_CERTIFICADO_GLOBAIS_SEED) {
    batch.set(doc(db, 'modelos_certificado_globais', modelo.id), {
      ...modelo,
      createdAt: now,
      updatedAt: now,
    });
  }

  let variacoesGravadas = 0;
  let linhasGravadas = 0;

  for (const nr of NRS_GLOBAIS_SEED) {
    variacoesGravadas += nr.variacoes.length;
    for (const v of nr.variacoes) {
      linhasGravadas += v.linhas.length;
    }
    batch.set(doc(db, 'nrs_globais', nr.id), {
      ...nr,
      createdAt: now,
      updatedAt: now,
    });
  }

  try {
    await batch.commit();
    return {
      planosGravados: PLANOS_GLOBAIS_SEED.length,
      adicionaisGravados: ADICIONAIS_GLOBAIS_SEED.length,
      nrsGravadas: NRS_GLOBAIS_SEED.length,
      variacoesGravadas,
      linhasGravadas,
      modelosGravados: MODELOS_CERTIFICADO_GLOBAIS_SEED.length,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'catalogo_global_seed');
  }
}
