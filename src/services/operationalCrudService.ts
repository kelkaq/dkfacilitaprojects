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
import type { ConteudoLinhaCatalogo } from '../data/globalCatalogSeed.ts';
import type {
  AssinaturaDigitalDoc,
  CartaAnuenciaDoc,
  CertificadoDoc,
  CertificadoPublicoDoc,
  ColaboradorDoc,
  DossiePublicoDoc,
  EffectivePlanLimits,
  EmpresaDoc,
  ModoIdentificacaoProva,
  ObraDoc,
  ProvaTentativaDoc,
  QuestaoAlternativa,
  QuestaoDoc,
  StatusTurma,
  TreinamentoEmpresaDoc,
  TurmaDoc,
  TurmaPublicaDoc,
} from '../types/domain.ts';
import {
  assertTenantOperationalAccess,
  assertWithinLimit,
} from './planGuardService.ts';

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function maskCpfClient(cpf: string): string {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return '***.***.***-**';
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

// ============================================================================
// 1. IDENTIDADE VISUAL DINÂMICA DA EMPRESA (ZERO MARCAS FIXAS)
// ============================================================================

export async function updateEmpresaIdentidade(
  empresaId: string,
  patch: Partial<{
    nomeFantasia: string;
    whatsapp: string;
    endereco: string;
    cidade: string;
    uf: string;
    logoUrl: string | null;
    corPrimaria: string;
    corSecundaria: string;
    prefixoCertificado: string;
    modeloCertificadoId: string;
    onboardingConcluido: boolean;
  }>
): Promise<void> {
  const path = `empresas/${empresaId}`;
  try {
    await updateDoc(doc(db, 'empresas', empresaId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ============================================================================
// 2. CONTRATOS / OBRAS
// ============================================================================

export async function listObras(empresaId: string): Promise<ObraDoc[]> {
  const path = `empresas/${empresaId}/contratos_obras`;
  try {
    const snap = await getDocs(
      query(collection(db, 'empresas', empresaId, 'contratos_obras'), where('empresaId', '==', empresaId))
    );
    return snap.docs.map((d) => ({ ...(d.data() as ObraDoc), id: d.id }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createObra(
  empresa: EmpresaDoc,
  limits: EffectivePlanLimits,
  input: { codigo: string; nome: string; clienteFinal?: string; localizacao?: string }
): Promise<ObraDoc> {
  assertTenantOperationalAccess(empresa);
  const atuais = await listObras(empresa.id);
  assertWithinLimit({
    recursoLabel: 'Contratos / Obras',
    atual: atuais.length,
    limite: limits.limiteObras,
  });

  const obraId = genId('obra');
  const path = `empresas/${empresa.id}/contratos_obras/${obraId}`;
  const now = serverTimestamp();
  const payload = {
    empresaId: empresa.id,
    codigo: input.codigo.trim().toUpperCase(),
    nome: input.nome.trim(),
    clienteFinal: input.clienteFinal?.trim() || null,
    localizacao: input.localizacao?.trim() || null,
    ativo: true,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await setDoc(doc(db, 'empresas', empresa.id, 'contratos_obras', obraId), payload);
    return { ...payload, id: obraId, createdAt: null };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteObra(empresaId: string, obraId: string): Promise<void> {
  const path = `empresas/${empresaId}/contratos_obras/${obraId}`;
  try {
    await deleteDoc(doc(db, 'empresas', empresaId, 'contratos_obras', obraId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ============================================================================
// 3. COLABORADORES
// ============================================================================

export async function listColaboradores(empresaId: string): Promise<ColaboradorDoc[]> {
  const path = `empresas/${empresaId}/colaboradores`;
  try {
    const snap = await getDocs(
      query(collection(db, 'empresas', empresaId, 'colaboradores'), where('empresaId', '==', empresaId))
    );
    return snap.docs.map((d) => ({ ...(d.data() as ColaboradorDoc), id: d.id }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createColaborador(
  empresa: EmpresaDoc,
  limits: EffectivePlanLimits,
  input: {
    nome: string;
    cpf: string;
    funcao: string;
    contratoObraId?: string | null;
    contratoObraNome?: string | null;
    matricula?: string;
    email?: string;
    telefone?: string;
  }
): Promise<ColaboradorDoc> {
  assertTenantOperationalAccess(empresa);
  const atuais = await listColaboradores(empresa.id);
  assertWithinLimit({
    recursoLabel: 'Colaboradores ativos',
    atual: atuais.length,
    limite: limits.limiteColaboradores,
  });

  const cleanCpf = input.cpf.replace(/\D/g, '');
  if (atuais.some((c) => c.cpf.replace(/\D/g, '') === cleanCpf)) {
    throw new Error('Já existe um colaborador cadastrado com este CPF nesta empresa.');
  }

  const colabId = genId('col');
  const path = `empresas/${empresa.id}/colaboradores/${colabId}`;
  const now = serverTimestamp();
  const payload = {
    empresaId: empresa.id,
    contratoObraId: input.contratoObraId || null,
    contratoObraNome: input.contratoObraNome || null,
    nome: input.nome.trim(),
    cpf: input.cpf.trim(),
    rg: null,
    funcao: input.funcao.trim(),
    matricula: input.matricula?.trim() || null,
    email: input.email?.trim() || null,
    telefone: input.telefone?.trim() || null,
    ativo: true,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await setDoc(doc(db, 'empresas', empresa.id, 'colaboradores', colabId), payload);
    return { ...payload, id: colabId, createdAt: null };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteColaborador(empresaId: string, colaboradorId: string): Promise<void> {
  const path = `empresas/${empresaId}/colaboradores/${colaboradorId}`;
  try {
    await deleteDoc(doc(db, 'empresas', empresaId, 'colaboradores', colaboradorId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ============================================================================
// 4. ASSINATURAS DIGITAIS
// ============================================================================

export async function listAssinaturasDigitais(empresaId: string): Promise<AssinaturaDigitalDoc[]> {
  const path = `empresas/${empresaId}/assinaturas_digitais`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'empresas', empresaId, 'assinaturas_digitais'),
        where('empresaId', '==', empresaId)
      )
    );
    return snap.docs.map((d) => ({ ...(d.data() as AssinaturaDigitalDoc), id: d.id }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function saveAssinaturaDigital(
  empresa: EmpresaDoc,
  input: {
    tipo: 'INSTRUTOR' | 'RT' | 'EMPRESA';
    nomeSignatario: string;
    registro?: string;
    imagemDataUrl: string;
  }
): Promise<AssinaturaDigitalDoc> {
  assertTenantOperationalAccess(empresa);
  const sigId = genId('sig');
  const path = `empresas/${empresa.id}/assinaturas_digitais/${sigId}`;
  const payload = {
    empresaId: empresa.id,
    usuarioUid: null,
    tipo: input.tipo,
    nomeSignatario: input.nomeSignatario.trim(),
    registro: input.registro?.trim() || null,
    imagemDataUrl: input.imagemDataUrl,
    ativa: true,
    createdAt: serverTimestamp(),
  };
  try {
    await setDoc(doc(db, 'empresas', empresa.id, 'assinaturas_digitais', sigId), payload);
    return { ...payload, id: sigId, createdAt: null };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// ============================================================================
// 5. NRs & TREINAMENTOS DA EMPRESA (CONTEÚDO LINHA POR LINHA)
// ============================================================================

export async function listTreinamentosEmpresa(
  empresaId: string
): Promise<TreinamentoEmpresaDoc[]> {
  const path = `empresas/${empresaId}/treinamentos_empresa`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'empresas', empresaId, 'treinamentos_empresa'),
        where('empresaId', '==', empresaId)
      )
    );
    return snap.docs
      .map((d) => ({ ...(d.data() as TreinamentoEmpresaDoc), id: d.id }))
      .sort((a, b) => a.nrCodigo.localeCompare(b.nrCodigo));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function saveTreinamentoEmpresa(
  empresa: EmpresaDoc,
  input: {
    id?: string;
    nrCodigo: string;
    nrTitulo: string;
    variacaoNome: string;
    modalidade: 'INICIAL' | 'RECICLAGEM' | 'COMPLEMENTAR';
    cargaHorariaHoras: number;
    validadeMeses: number;
    notaMinimaAprovacao: number;
    baseLegal?: string | null;
    conteudoLinhas: ConteudoLinhaCatalogo[];
  }
): Promise<TreinamentoEmpresaDoc> {
  assertTenantOperationalAccess(empresa);
  const treinamentoId = input.id || genId('trn');
  const path = `empresas/${empresa.id}/treinamentos_empresa/${treinamentoId}`;

  const linhasOrdenadas = input.conteudoLinhas.map((l, idx) => ({
    ordem: idx + 1,
    descricao: l.descricao.trim(),
    cargaHorariaMin: l.cargaHorariaMin ?? null,
  }));

  try {
    if (input.id) {
      await updateDoc(doc(db, 'empresas', empresa.id, 'treinamentos_empresa', treinamentoId), {
        nrCodigo: input.nrCodigo.trim().toUpperCase(),
        nrTitulo: input.nrTitulo.trim(),
        variacaoNome: input.variacaoNome.trim(),
        modalidade: input.modalidade,
        cargaHorariaHoras: input.cargaHorariaHoras,
        validadeMeses: input.validadeMeses,
        notaMinimaAprovacao: input.notaMinimaAprovacao,
        baseLegal: input.baseLegal || null,
        conteudoLinhas: linhasOrdenadas,
        ativo: true,
        updatedAt: serverTimestamp(),
      });
    } else {
      const now = serverTimestamp();
      await setDoc(doc(db, 'empresas', empresa.id, 'treinamentos_empresa', treinamentoId), {
        empresaId: empresa.id,
        nrCodigo: input.nrCodigo.trim().toUpperCase(),
        nrTitulo: input.nrTitulo.trim(),
        variacaoNome: input.variacaoNome.trim(),
        modalidade: input.modalidade,
        cargaHorariaHoras: input.cargaHorariaHoras,
        validadeMeses: input.validadeMeses,
        notaMinimaAprovacao: input.notaMinimaAprovacao,
        baseLegal: input.baseLegal || null,
        conteudoLinhas: linhasOrdenadas,
        ativo: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      id: treinamentoId,
      empresaId: empresa.id,
      nrCodigo: input.nrCodigo.trim().toUpperCase(),
      nrTitulo: input.nrTitulo.trim(),
      variacaoNome: input.variacaoNome.trim(),
      modalidade: input.modalidade,
      cargaHorariaHoras: input.cargaHorariaHoras,
      validadeMeses: input.validadeMeses,
      notaMinimaAprovacao: input.notaMinimaAprovacao,
      baseLegal: input.baseLegal || null,
      conteudoLinhas: linhasOrdenadas,
      ativo: true,
      createdAt: null,
    };
  } catch (error) {
    handleFirestoreError(error, input.id ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteTreinamentoEmpresa(
  empresaId: string,
  treinamentoId: string
): Promise<void> {
  const path = `empresas/${empresaId}/treinamentos_empresa/${treinamentoId}`;
  try {
    await deleteDoc(doc(db, 'empresas', empresaId, 'treinamentos_empresa', treinamentoId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ============================================================================
// 6. BANCO DE QUESTÕES
// ============================================================================

export async function listQuestoes(
  empresaId: string,
  treinamentoId?: string
): Promise<QuestaoDoc[]> {
  const path = `empresas/${empresaId}/banco_questoes`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'empresas', empresaId, 'banco_questoes'),
        where('empresaId', '==', empresaId)
      )
    );
    const items = snap.docs.map((d) => ({ ...(d.data() as QuestaoDoc), id: d.id }));
    return treinamentoId ? items.filter((q) => q.treinamentoId === treinamentoId) : items;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createQuestao(
  empresa: EmpresaDoc,
  input: {
    treinamentoId: string;
    enunciado: string;
    alternativas: QuestaoAlternativa[];
    correta: 'A' | 'B' | 'C' | 'D';
  }
): Promise<QuestaoDoc> {
  assertTenantOperationalAccess(empresa);
  const questaoId = genId('qst');
  const path = `empresas/${empresa.id}/banco_questoes/${questaoId}`;
  const payload = {
    empresaId: empresa.id,
    treinamentoId: input.treinamentoId,
    enunciado: input.enunciado.trim(),
    alternativas: input.alternativas,
    correta: input.correta,
    peso: 1,
    ativa: true,
    createdAt: serverTimestamp(),
  };
  try {
    await setDoc(doc(db, 'empresas', empresa.id, 'banco_questoes', questaoId), payload);
    return { ...payload, id: questaoId, createdAt: null };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateQuestao(
  empresa: EmpresaDoc,
  questaoId: string,
  input: {
    enunciado: string;
    alternativas: QuestaoAlternativa[];
    correta: 'A' | 'B' | 'C' | 'D';
    ativa?: boolean;
  }
): Promise<void> {
  assertTenantOperationalAccess(empresa);
  const path = `empresas/${empresa.id}/banco_questoes/${questaoId}`;
  try {
    await updateDoc(doc(db, 'empresas', empresa.id, 'banco_questoes', questaoId), {
      enunciado: input.enunciado.trim(),
      alternativas: input.alternativas,
      correta: input.correta,
      ativa: input.ativa ?? true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteQuestao(empresaId: string, questaoId: string): Promise<void> {
  const path = `empresas/${empresaId}/banco_questoes/${questaoId}`;
  try {
    await deleteDoc(doc(db, 'empresas', empresaId, 'banco_questoes', questaoId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ============================================================================
// 7. TURMAS & GATEWAY PÚBLICO DE PROVA (CPF / CPF+PIN / CPF+PIN+SELFIE)
// ============================================================================

export async function listTurmas(empresaId: string): Promise<TurmaDoc[]> {
  const path = `empresas/${empresaId}/turmas_aplicacoes`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'empresas', empresaId, 'turmas_aplicacoes'),
        where('empresaId', '==', empresaId)
      )
    );
    return snap.docs
      .map((d) => ({ ...(d.data() as TurmaDoc), id: d.id }))
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createTurma(
  empresa: EmpresaDoc,
  treinamento: TreinamentoEmpresaDoc,
  input: {
    titulo: string;
    dataRealizacaoIso: string;
    localRealizacao?: string;
    contratoObraId?: string | null;
    contratoObraNome?: string | null;
    instrutorNome?: string;
    instrutorRegistro?: string;
    rtNome?: string;
    rtRegistro?: string;
    modoIdentificacao: ModoIdentificacaoProva;
    pinAcesso?: string;
  }
): Promise<TurmaDoc> {
  assertTenantOperationalAccess(empresa);
  const turmaId = genId('trm');
  const codigoTurma = `T-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const tokenPublico = `PRV-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const now = serverTimestamp();

  const questoes = await listQuestoes(empresa.id, treinamento.id);

  const turmaPayload = {
    empresaId: empresa.id,
    treinamentoId: treinamento.id,
    treinamentoResumo: `${treinamento.nrCodigo} — ${treinamento.variacaoNome}`,
    nrCodigo: treinamento.nrCodigo,
    cargaHorariaHoras: treinamento.cargaHorariaHoras,
    validadeMeses: treinamento.validadeMeses,
    notaMinimaAprovacao: treinamento.notaMinimaAprovacao,
    contratoObraId: input.contratoObraId || null,
    contratoObraNome: input.contratoObraNome || null,
    instrutorNome: input.instrutorNome?.trim() || null,
    instrutorRegistro: input.instrutorRegistro?.trim() || null,
    rtNome: input.rtNome?.trim() || null,
    rtRegistro: input.rtRegistro?.trim() || null,
    codigoTurma,
    titulo: input.titulo.trim(),
    dataRealizacaoIso: input.dataRealizacaoIso,
    localRealizacao: input.localRealizacao?.trim() || null,
    tokenPublico,
    modoIdentificacao: input.modoIdentificacao,
    pinAcesso: input.pinAcesso?.trim() || null,
    status: 'ABERTA' as StatusTurma,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'empresas', empresa.id, 'turmas_aplicacoes', turmaId), turmaPayload);

    // Publica gateway seguro em /turmas_publicas/{tokenPublico}
    await setDoc(doc(db, 'turmas_publicas', tokenPublico), {
      tokenPublico,
      empresaId: empresa.id,
      turmaId,
      empresaRazaoSocial: empresa.razaoSocial,
      empresaCorPrimaria: empresa.corPrimaria,
      empresaLogoUrl: empresa.logoUrl || null,
      titulo: turmaPayload.titulo,
      nrCodigo: treinamento.nrCodigo,
      cargaHorariaHoras: treinamento.cargaHorariaHoras,
      notaMinimaAprovacao: treinamento.notaMinimaAprovacao,
      modoIdentificacao: input.modoIdentificacao,
      exigePin: input.modoIdentificacao !== 'CPF',
      pinHash: input.pinAcesso?.trim() || null,
      questoesPublicas: questoes.map((q) => ({
        id: q.id,
        enunciado: q.enunciado,
        alternativas: q.alternativas,
        correta: q.correta,
      })),
      status: 'ABERTA',
      updatedAt: serverTimestamp(),
    });

    return { ...turmaPayload, id: turmaId, createdAt: null };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `empresas/${empresa.id}/turmas_aplicacoes/${turmaId}`);
  }
}

export async function updateTurmaAndPublicGateway(params: {
  empresa: EmpresaDoc;
  turma: TurmaDoc;
  treinamento: TreinamentoEmpresaDoc;
  patch: {
    titulo?: string;
    dataRealizacaoIso?: string;
    localRealizacao?: string | null;
    modoIdentificacao?: ModoIdentificacaoProva;
    pinAcesso?: string | null;
    status?: StatusTurma;
    notaMinimaAprovacao?: number;
  };
}): Promise<TurmaDoc> {
  assertTenantOperationalAccess(params.empresa);
  const modo = params.patch.modoIdentificacao ?? params.turma.modoIdentificacao;
  const pin =
    params.patch.pinAcesso !== undefined
      ? params.patch.pinAcesso?.trim() || null
      : params.turma.pinAcesso ?? null;
  const status = params.patch.status ?? params.turma.status;
  const titulo = params.patch.titulo?.trim() || params.turma.titulo;
  const dataRealizacaoIso = params.patch.dataRealizacaoIso ?? params.turma.dataRealizacaoIso;
  const localRealizacao =
    params.patch.localRealizacao !== undefined
      ? params.patch.localRealizacao?.trim() || null
      : params.turma.localRealizacao ?? null;
  const notaMinima =
    params.patch.notaMinimaAprovacao ??
    params.treinamento.notaMinimaAprovacao ??
    params.turma.notaMinimaAprovacao ??
    70;

  const questoes = await listQuestoes(params.empresa.id, params.treinamento.id);

  try {
    await updateDoc(doc(db, 'empresas', params.empresa.id, 'turmas_aplicacoes', params.turma.id), {
      titulo,
      dataRealizacaoIso,
      localRealizacao,
      modoIdentificacao: modo,
      pinAcesso: pin,
      status,
      updatedAt: serverTimestamp(),
    });

    if (
      params.patch.notaMinimaAprovacao !== undefined &&
      params.patch.notaMinimaAprovacao !== params.treinamento.notaMinimaAprovacao
    ) {
      await updateDoc(
        doc(db, 'empresas', params.empresa.id, 'treinamentos_empresa', params.treinamento.id),
        {
          notaMinimaAprovacao: notaMinima,
          updatedAt: serverTimestamp(),
        }
      );
    }

    await setDoc(doc(db, 'turmas_publicas', params.turma.tokenPublico), {
      tokenPublico: params.turma.tokenPublico,
      empresaId: params.empresa.id,
      turmaId: params.turma.id,
      empresaRazaoSocial: params.empresa.razaoSocial,
      empresaCorPrimaria: params.empresa.corPrimaria,
      empresaLogoUrl: params.empresa.logoUrl || null,
      titulo,
      nrCodigo: params.treinamento.nrCodigo,
      cargaHorariaHoras: params.treinamento.cargaHorariaHoras,
      notaMinimaAprovacao: notaMinima,
      modoIdentificacao: modo,
      exigePin: modo !== 'CPF',
      pinHash: pin,
      questoesPublicas: questoes
        .filter((q) => q.ativa)
        .map((q) => ({
          id: q.id,
          enunciado: q.enunciado,
          alternativas: q.alternativas,
          correta: q.correta,
        })),
      status,
      updatedAt: serverTimestamp(),
    });

    return {
      ...params.turma,
      titulo,
      dataRealizacaoIso,
      localRealizacao,
      modoIdentificacao: modo,
      pinAcesso: pin,
      status,
      notaMinimaAprovacao: notaMinima,
    };
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `empresas/${params.empresa.id}/turmas_aplicacoes/${params.turma.id}`
    );
  }
}

export async function getPublicTurmaByToken(tokenPublico: string): Promise<TurmaPublicaDoc | null> {
  const path = `turmas_publicas/${tokenPublico}`;
  try {
    const snap = await getDoc(doc(db, 'turmas_publicas', tokenPublico));
    if (!snap.exists()) return null;
    return snap.data() as TurmaPublicaDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function submitPublicProvaTentativa(params: {
  turmaPublica: TurmaPublicaDoc;
  colaboradorId: string;
  colaboradorNome: string;
  colaboradorCpf: string;
  pinInformado?: string;
  respostas: Record<string, string>;
  assinaturaDataUrl?: string | null;
  selfieDataUrl?: string | null;
}): Promise<ProvaTentativaDoc> {
  if (params.turmaPublica.status !== 'ABERTA') {
    throw new Error('Esta turma não está mais aberta para recebimento de provas.');
  }
  if (
    params.turmaPublica.exigePin &&
    params.turmaPublica.pinHash &&
    params.pinInformado?.trim() !== params.turmaPublica.pinHash
  ) {
    throw new Error('PIN de acesso incorreto.');
  }
  if (params.turmaPublica.modoIdentificacao === 'CPF_PIN_SELFIE' && !params.selfieDataUrl) {
    throw new Error('Esta turma exige captura de selfie para evidência.');
  }

  const total = params.turmaPublica.questoesPublicas.length;
  let acertos = 0;
  for (const q of params.turmaPublica.questoesPublicas) {
    if (params.respostas[q.id] === q.correta) {
      acertos += 1;
    }
  }
  const notaPercentual = total > 0 ? Math.round((acertos / total) * 100) : 100;
  const aprovado = notaPercentual >= params.turmaPublica.notaMinimaAprovacao;

  const tentativaId = genId('tnt');
  const path = `empresas/${params.turmaPublica.empresaId}/provas_tentativas/${tentativaId}`;
  const payload = {
    empresaId: params.turmaPublica.empresaId,
    turmaId: params.turmaPublica.turmaId,
    tokenPublico: params.turmaPublica.tokenPublico,
    colaboradorId: params.colaboradorId,
    colaboradorNome: params.colaboradorNome.trim(),
    colaboradorCpf: params.colaboradorCpf.trim(),
    respostas: params.respostas,
    notaPercentual,
    acertos,
    totalQuestoes: total,
    status: (aprovado ? 'APROVADO' : 'REPROVADO') as 'APROVADO' | 'REPROVADO',
    assinaturaDataUrl: params.assinaturaDataUrl || null,
    selfieDataUrl: params.selfieDataUrl || null,
    concluidaEm: serverTimestamp(),
  };

  try {
    await setDoc(
      doc(db, 'empresas', params.turmaPublica.empresaId, 'provas_tentativas', tentativaId),
      payload
    );
    return { ...payload, id: tentativaId, concluidaEm: null };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function listTentativasTurma(
  empresaId: string,
  turmaId?: string
): Promise<ProvaTentativaDoc[]> {
  const path = `empresas/${empresaId}/provas_tentativas`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'empresas', empresaId, 'provas_tentativas'),
        where('empresaId', '==', empresaId)
      )
    );
    const items = snap.docs.map((d) => ({ ...(d.data() as ProvaTentativaDoc), id: d.id }));
    return turmaId ? items.filter((t) => t.turmaId === turmaId) : items;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// ============================================================================
// 8. EMISSÃO DE CERTIFICADO IMUTÁVEL + RENDERIZAÇÃO FRENTE/VERSO + QR PÚBLICO
// ============================================================================

export async function listCertificados(empresaId: string): Promise<CertificadoDoc[]> {
  const path = `empresas/${empresaId}/certificados`;
  try {
    const snap = await getDocs(
      query(collection(db, 'empresas', empresaId, 'certificados'), where('empresaId', '==', empresaId))
    );
    return snap.docs
      .map((d) => ({ ...(d.data() as CertificadoDoc), id: d.id }))
      .sort((a, b) => (b.emitidoEm?.toMillis() ?? 0) - (a.emitidoEm?.toMillis() ?? 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function issueCertificadoImutavel(params: {
  empresa: EmpresaDoc;
  turma: TurmaDoc;
  treinamento: TreinamentoEmpresaDoc;
  colaborador: ColaboradorDoc;
  assinaturaColaboradorUrl?: string | null;
  instrutorAssinaturaUrl?: string | null;
  rtAssinaturaUrl?: string | null;
}): Promise<CertificadoDoc> {
  assertTenantOperationalAccess(params.empresa);

  const certId = genId('cert');
  const seq = Math.floor(10000 + Math.random() * 89999);
  const numeroCertificado = `${params.empresa.prefixoCertificado || 'CERT'}-${new Date().getFullYear()}-${seq}`;
  const codigoValidacaoQr = `QR-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const dataRealizacao = new Date(params.turma.dataRealizacaoIso || Date.now());
  const dataValidade = new Date(dataRealizacao);
  dataValidade.setMonth(dataValidade.getMonth() + params.treinamento.validadeMeses);

  const dataRealizacaoIso = dataRealizacao.toISOString().slice(0, 10);
  const dataValidadeIso = dataValidade.toISOString().slice(0, 10);

  const snapshotConteudoLinhas = params.treinamento.conteudoLinhas.map((l, idx) => ({
    ordem: idx + 1,
    descricao: l.descricao,
    cargaHorariaMin: l.cargaHorariaMin ?? null,
  }));

  const snapshotEmpresa = {
    razaoSocial: params.empresa.razaoSocial,
    cnpj: params.empresa.cnpj,
    endereco: params.empresa.endereco || undefined,
    cidade: params.empresa.cidade || undefined,
    uf: params.empresa.uf || undefined,
    logoUrl: params.empresa.logoUrl || undefined,
    corPrimaria: params.empresa.corPrimaria || '#0F172A',
    instrutorNome: params.turma.instrutorNome || undefined,
    instrutorRegistro: params.turma.instrutorRegistro || undefined,
    instrutorAssinaturaUrl: params.instrutorAssinaturaUrl || undefined,
    rtNome: params.turma.rtNome || undefined,
    rtRegistro: params.turma.rtRegistro || undefined,
    rtAssinaturaUrl: params.rtAssinaturaUrl || undefined,
  };

  const snapshotColaborador = {
    nome: params.colaborador.nome,
    cpf: params.colaborador.cpf,
    funcao: params.colaborador.funcao,
    assinaturaDataUrl: params.assinaturaColaboradorUrl || undefined,
  };

  const now = serverTimestamp();

  const certPayload = {
    empresaId: params.empresa.id,
    turmaId: params.turma.id,
    contratoObraId: params.turma.contratoObraId || params.colaborador.contratoObraId || null,
    contratoObraNome: params.turma.contratoObraNome || params.colaborador.contratoObraNome || null,
    colaboradorId: params.colaborador.id,
    numeroCertificado,
    codigoValidacaoQr,
    nrCodigo: params.treinamento.nrCodigo,
    treinamentoTitulo: `${params.treinamento.nrTitulo} — ${params.treinamento.variacaoNome}`,
    cargaHorariaHoras: params.treinamento.cargaHorariaHoras,
    dataRealizacaoIso,
    dataValidadeIso,
    status: 'EMITIDO' as const,
    snapshotConteudoLinhas,
    snapshotEmpresa,
    snapshotColaborador,
    emitidoEm: now,
  };

  try {
    // 1. Grava certificado imutável isolado na empresa
    await setDoc(doc(db, 'empresas', params.empresa.id, 'certificados', certId), certPayload);

    // 2. Grava espelho público de validação QR (SEMPRE acessível mesmo se empresa inadimplente)
    await setDoc(doc(db, 'certificados_publicos', codigoValidacaoQr), {
      codigoValidacaoQr,
      empresaId: params.empresa.id,
      numeroCertificado,
      nrCodigo: params.treinamento.nrCodigo,
      treinamentoTitulo: certPayload.treinamentoTitulo,
      colaboradorNome: params.colaborador.nome,
      colaboradorCpfMascarado: maskCpfClient(params.colaborador.cpf),
      empresaRazaoSocial: params.empresa.razaoSocial,
      empresaCnpj: params.empresa.cnpj,
      cargaHorariaHoras: params.treinamento.cargaHorariaHoras,
      dataRealizacao: dataRealizacaoIso,
      dataValidade: dataValidadeIso,
      status: 'EMITIDO',
      snapshotConteudoLinhas,
      emitidoEm: now,
    });

    return { ...certPayload, id: certId, emitidoEm: null };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `empresas/${params.empresa.id}/certificados/${certId}`);
  }
}

export async function renderCertificadoFrenteVerso(certificado: CertificadoDoc): Promise<{
  html: string;
  colunasVerso: 1 | 2;
  validationUrl: string;
  qrCodeSvg: string;
}> {
  const response = await fetch('/api/certificates/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      numeroCertificado: certificado.numeroCertificado,
      codigoValidacaoQr: certificado.codigoValidacaoQr,
      nrCodigo: certificado.nrCodigo,
      treinamentoTitulo: certificado.treinamentoTitulo,
      cargaHorariaHoras: certificado.cargaHorariaHoras,
      dataRealizacaoIso: certificado.dataRealizacaoIso,
      dataValidadeIso: certificado.dataValidadeIso,
      validationBaseUrl: window.location.origin,
      snapshotEmpresa: certificado.snapshotEmpresa,
      snapshotColaborador: certificado.snapshotColaborador,
      snapshotConteudoLinhas: certificado.snapshotConteudoLinhas,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao renderizar frente e verso do certificado.');
  }
  return await response.json();
}

export async function validatePublicCertificadoQr(
  codigoValidacaoQr: string
): Promise<CertificadoPublicoDoc | null> {
  const cleanCode = codigoValidacaoQr.trim().toUpperCase();
  if (!cleanCode) return null;
  const path = `certificados_publicos/${cleanCode}`;
  try {
    const snap = await getDoc(doc(db, 'certificados_publicos', cleanCode));
    if (!snap.exists()) return null;
    return snap.data() as CertificadoPublicoDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

// ============================================================================
// 9. CARTAS DE ANUÊNCIA & DOSSIÊ UNIFICADO COM LINK TEMPORÁRIO
// ============================================================================

export async function listCartasAnuencia(empresaId: string): Promise<CartaAnuenciaDoc[]> {
  const path = `empresas/${empresaId}/cartas_anuencia`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'empresas', empresaId, 'cartas_anuencia'),
        where('empresaId', '==', empresaId)
      )
    );
    return snap.docs.map((d) => ({ ...(d.data() as CartaAnuenciaDoc), id: d.id }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createCartaAnuencia(
  empresa: EmpresaDoc,
  limits: EffectivePlanLimits,
  input: {
    colaboradorId: string;
    colaboradorNome: string;
    titulo: string;
    nrReferencia: string;
    textoLegal: string;
    responsavelNome?: string;
    validadeIso: string;
  }
): Promise<CartaAnuenciaDoc> {
  assertTenantOperationalAccess(empresa);
  if (!limits.incluiCartaAnuencia) {
    throw new Error(
      'Cartas de Anuência não estão inclusas no seu plano atual. Ative o adicional "Cartas de Anuência & Dossiê" em Meu Plano.'
    );
  }

  const cartaId = genId('anu');
  const path = `empresas/${empresa.id}/cartas_anuencia/${cartaId}`;
  const payload = {
    empresaId: empresa.id,
    colaboradorId: input.colaboradorId,
    colaboradorNome: input.colaboradorNome.trim(),
    titulo: input.titulo.trim(),
    nrReferencia: input.nrReferencia.trim(),
    textoLegal: input.textoLegal.trim(),
    responsavelNome: input.responsavelNome?.trim() || null,
    assinaturaRespUrl: null,
    validadeIso: input.validadeIso,
    emitidaEm: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'empresas', empresa.id, 'cartas_anuencia', cartaId), payload);
    return { ...payload, id: cartaId, emitidaEm: null };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function createTemporaryDossieLink(params: {
  empresa: EmpresaDoc;
  colaborador: ColaboradorDoc;
  certificados: CertificadoDoc[];
  cartas: CartaAnuenciaDoc[];
  tentativas: ProvaTentativaDoc[];
  validadeHoras?: number;
}): Promise<DossiePublicoDoc> {
  assertTenantOperationalAccess(params.empresa);
  const token = `DOS-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const expiraEmIso = new Date(
    Date.now() + (params.validadeHoras ?? 72) * 60 * 60 * 1000
  ).toISOString();

  const dossiePayload = {
    token,
    empresaId: params.empresa.id,
    colaboradorId: params.colaborador.id,
    empresaRazaoSocial: params.empresa.razaoSocial,
    colaboradorNome: params.colaborador.nome,
    colaboradorCpfMascarado: maskCpfClient(params.colaborador.cpf),
    colaboradorFuncao: params.colaborador.funcao,
    certificados: params.certificados
      .filter((c) => c.colaboradorId === params.colaborador.id)
      .map((c) => ({
        numeroCertificado: c.numeroCertificado,
        codigoValidacaoQr: c.codigoValidacaoQr,
        nrCodigo: c.nrCodigo,
        treinamentoTitulo: c.treinamentoTitulo,
        cargaHorariaHoras: c.cargaHorariaHoras,
        dataRealizacaoIso: c.dataRealizacaoIso,
        dataValidadeIso: c.dataValidadeIso,
        status: c.status,
      })),
    cartasAnuencia: params.cartas
      .filter((ca) => ca.colaboradorId === params.colaborador.id)
      .map((ca) => ({
        titulo: ca.titulo,
        nrReferencia: ca.nrReferencia,
        validadeIso: ca.validadeIso,
      })),
    provasResumo: params.tentativas
      .filter((t) => t.colaboradorId === params.colaborador.id)
      .map((t) => ({
        turmaId: t.turmaId,
        notaPercentual: t.notaPercentual,
        status: t.status,
      })),
    expiraEmIso,
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'dossies_publicos', token), dossiePayload);
    return { ...dossiePayload };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `dossies_publicos/${token}`);
  }
}

export async function getPublicDossieByToken(token: string): Promise<DossiePublicoDoc | null> {
  const path = `dossies_publicos/${token}`;
  try {
    const snap = await getDoc(doc(db, 'dossies_publicos', token));
    if (!snap.exists()) return null;
    return snap.data() as DossiePublicoDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}
