import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import type {
  CicloCobranca,
  EmpresaDoc,
  MembroDoc,
  StatusEmpresa,
} from '../types/domain.ts';
import {
  calcularPrecoCicloCentavos,
  type NrGlobalCatalogo,
  type PlanoCatalogo,
} from '../data/globalCatalogSeed.ts';
import { createAdminNotification } from './analyticsService.ts';

export interface RegisterCompanyInput {
  tipoPessoa?: 'PJ' | 'PF';
  cnpj: string; // CNPJ para PJ ou CPF para PF
  razaoSocial: string; // Razão Social (PJ) ou Nome Completo (PF)
  nomeFantasia?: string;
  nomeAdministrador?: string;
  emailFinanceiro: string;
  whatsapp: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  plano: PlanoCatalogo;
  ciclo: CicloCobranca;
  modoInicio: 'TRIAL' | 'IMEDIATO';
  nrsIniciais: NrGlobalCatalogo[];
  adicionaisIniciais?: string[];
  cupomAplicado?: string | null;
  descontoCupomCentavos?: number | null;
  valorMensalOverrideCentavos?: number | null;
  modeloPadraoId?: string;
}

export async function registerNewTenantCompany(
  input: RegisterCompanyInput
): Promise<EmpresaDoc> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    throw new Error('Faça login com uma conta verificada para criar sua conta.');
  }

  const empresaId = `emp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const now = serverTimestamp();
  const trialExpira = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const baseMensal =
    typeof input.plano.precoPromocionalCentavos === 'number' &&
    input.plano.precoPromocionalCentavos > 0
      ? input.plano.precoPromocionalCentavos
      : input.plano.precoMensalCentavos;
  const preco = calcularPrecoCicloCentavos(
    baseMensal,
    input.ciclo,
    input.plano.descontoSemestral,
    input.plano.descontoAnual
  );

  const prefixo =
    input.razaoSocial
      .replace(/[^A-Za-z]/g, '')
      .toUpperCase()
      .slice(0, 4) || 'CERT';

  const tipoPessoa: 'PF' | 'PJ' = input.tipoPessoa === 'PF' ? 'PF' : 'PJ';
  const adminName = input.nomeAdministrador?.trim() || user.displayName || input.razaoSocial.trim();

  const empresaData = {
    ownerUid: user.uid,
    tipoPessoa,
    cnpj: input.cnpj.trim(),
    razaoSocial: input.razaoSocial.trim(),
    nomeFantasia: input.nomeFantasia?.trim() || input.razaoSocial.trim(),
    nomeAdministrador: adminName,
    emailFinanceiro: input.emailFinanceiro.trim().toLowerCase(),
    whatsapp: input.whatsapp.trim(),
    cupomAplicado: input.cupomAplicado?.trim().toUpperCase() || null,
    descontoCupomCentavos:
      typeof input.descontoCupomCentavos === 'number' && input.descontoCupomCentavos > 0
        ? Math.round(input.descontoCupomCentavos)
        : null,
    certificadoNomeExibicao: input.nomeFantasia?.trim() || input.razaoSocial.trim(),
    certificadoExibirDocumento: true,
    certificadoTelefoneRodape: input.whatsapp.trim(),
    certificadoEmailRodape: input.emailFinanceiro.trim().toLowerCase(),
    cep: input.cep?.trim() || null,
    logradouro: input.logradouro?.trim() || null,
    numero: input.numero?.trim() || null,
    complemento: input.complemento?.trim() || null,
    bairro: input.bairro?.trim() || null,
    endereco: input.endereco?.trim() || null,
    cidade: input.cidade?.trim() || null,
    uf: input.uf?.trim().toUpperCase() || null,
    logoUrl: null,
    corPrimaria: '#0F172A',
    corSecundaria: '#1D4ED8',
    prefixoCertificado: prefixo,
    modeloCertificadoId: input.modeloPadraoId || 'modelo_classico_institucional',
    modeloProprioUrl: null,
    dominioProprio: null,
    status: (input.modoInicio === 'TRIAL' ? 'TRIAL' : 'ATIVA') as StatusEmpresa,
    trialExpiraEmIso: input.modoInicio === 'TRIAL' ? trialExpira : null,
    onboardingConcluido: false,
    planoId: input.plano.id,
    planoSlug: input.plano.slug,
    ciclo: input.ciclo,
    valorMensalCentavos:
      typeof input.valorMensalOverrideCentavos === 'number' &&
      input.valorMensalOverrideCentavos >= 0
        ? Math.round(input.valorMensalOverrideCentavos)
        : preco.mensalEquivalenteCentavos,
    asaasCustomerId: null,
    adicionaisAtivos: Array.isArray(input.adicionaisIniciais) ? input.adicionaisIniciais : [],
    featureFlags: {},
    createdAt: now,
    updatedAt: now,
  };

  try {
    // 1. Cria documento principal da empresa / titular (tenant)
    await setDoc(doc(db, 'empresas', empresaId), empresaData);

    // 2. Cria membro ADMIN_EMPRESA na subcoleção RBAC (Master Gate)
    await setDoc(doc(db, 'empresas', empresaId, 'membros', user.uid), {
      uid: user.uid,
      empresaId,
      nome: adminName,
      email: user.email || input.emailFinanceiro.trim().toLowerCase(),
      perfil: 'ADMIN_EMPRESA',
      registroProfissional: null,
      cargo: tipoPessoa === 'PF' ? 'Profissional Titular' : 'Administrador',
      ativo: true,
      createdAt: now,
    });

    // 3. Clona catálogo inicial de NRs selecionadas para treinamentos_empresa (linha por linha)
    if (input.nrsIniciais.length > 0) {
      const batch = writeBatch(db);
      for (const nr of input.nrsIniciais.slice(0, 5)) {
        for (const variacao of nr.variacoes) {
          const treinId = `trn_${variacao.slug.replace(/[^a-zA-Z0-9]/g, '_')}`;
          batch.set(doc(db, 'empresas', empresaId, 'treinamentos_empresa', treinId), {
            empresaId,
            nrCodigo: nr.codigo,
            nrTitulo: nr.titulo,
            variacaoNome: variacao.nome,
            modalidade: variacao.modalidade,
            cargaHorariaHoras: variacao.cargaHorariaHoras,
            validadeMeses: variacao.validadeMeses,
            notaMinimaAprovacao: variacao.notaMinimaAprovacao,
            baseLegal: nr.baseLegal,
            conteudoLinhas: variacao.linhas,
            ativo: true,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      await batch.commit();
    }

    // 4. Notifica o Super Admin em tempo real
    const docLabel = tipoPessoa === 'PF' ? `CPF ${input.cnpj}` : `CNPJ ${input.cnpj}`;
    const cupomLabel = input.cupomAplicado ? ` · Cupom ${input.cupomAplicado}` : '';
    await createAdminNotification({
      tipo: input.modoInicio === 'TRIAL' ? 'NOVO_TRIAL' : 'NOVA_VENDA',
      titulo:
        input.modoInicio === 'TRIAL'
          ? `Novo Trial 7 dias: ${input.razaoSocial}`
          : `Nova contratação: ${input.razaoSocial}`,
      mensagem: `Plano ${input.plano.nome} (${input.ciclo}) · ${docLabel} · Contato ${input.whatsapp}${cupomLabel}`,
      empresaId,
      empresaNome: input.razaoSocial,
    });

    return { ...empresaData, id: empresaId, createdAt: null, updatedAt: null };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `empresas/${empresaId}`);
  }
}

export async function listMyEmpresas(includeAllAsSuperAdmin = false): Promise<EmpresaDoc[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const path = 'empresas';
  try {
    const q = includeAllAsSuperAdmin
      ? query(collection(db, path))
      : query(collection(db, path), where('ownerUid', '==', user.uid));
    const snap = await getDocs(q);
    const seenIds = new Set<string>();
    const results: EmpresaDoc[] = [];
    for (const d of snap.docs) {
      if (seenIds.has(d.id)) continue;
      seenIds.add(d.id);
      const data = { ...(d.data() as EmpresaDoc), id: d.id };
      // Filtra qualquer registro legado de testes com marca antiga
      const combinedName = `${data.razaoSocial || ''} ${data.nomeFantasia || ''}`.toLowerCase();
      if (!includeAllAsSuperAdmin && /\balfa\b/.test(combinedName)) {
        continue;
      }
      results.push(data);
    }
    return results.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function getEmpresaById(empresaId: string): Promise<EmpresaDoc | null> {
  const path = `empresas/${empresaId}`;
  try {
    const snap = await getDoc(doc(db, 'empresas', empresaId));
    if (!snap.exists()) return null;
    return { ...(snap.data() as EmpresaDoc), id: snap.id };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function updateEmpresaStatus(
  empresaId: string,
  status: StatusEmpresa
): Promise<void> {
  const path = `empresas/${empresaId}`;
  try {
    await updateDoc(doc(db, 'empresas', empresaId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function listMembrosEmpresa(empresaId: string): Promise<MembroDoc[]> {
  const path = `empresas/${empresaId}/membros`;
  try {
    const snap = await getDocs(
      query(collection(db, 'empresas', empresaId, 'membros'), where('empresaId', '==', empresaId))
    );
    return snap.docs.map((d) => ({ ...(d.data() as MembroDoc), id: d.id }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createMembroEmpresa(
  empresaId: string,
  input: {
    nome: string;
    email: string;
    perfil: 'ADMIN_EMPRESA' | 'RT' | 'INSTRUTOR_TST';
    registroProfissional?: string;
    cargo?: string;
  }
): Promise<MembroDoc> {
  const memberUid = `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const path = `empresas/${empresaId}/membros/${memberUid}`;
  try {
    const payload = {
      uid: memberUid,
      empresaId,
      nome: input.nome.trim(),
      email: input.email.trim().toLowerCase(),
      perfil: input.perfil,
      registroProfissional: input.registroProfissional?.trim() || null,
      cargo: input.cargo?.trim() || null,
      ativo: true,
      createdAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'empresas', empresaId, 'membros', memberUid), payload);
    return { ...payload, id: memberUid, createdAt: null };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}
