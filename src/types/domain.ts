import type { Timestamp } from 'firebase/firestore';
import type { ConteudoLinhaCatalogo } from '../data/globalCatalogSeed.ts';

export type StatusEmpresa = 'TRIAL' | 'ATIVA' | 'INADIMPLENTE' | 'SUSPENSA' | 'CANCELADA';
export type CicloCobranca = 'MENSAL' | 'SEMESTRAL' | 'ANUAL';
export type PerfilUsuario = 'SUPER_ADMIN' | 'ADMIN_EMPRESA' | 'RT' | 'INSTRUTOR_TST';
export type ModoIdentificacaoProva = 'CPF' | 'CPF_PIN' | 'CPF_PIN_SELFIE';
export type StatusTurma = 'RASCUNHO' | 'ABERTA' | 'ENCERRADA' | 'CANCELADA';
export type TipoNotificacaoAdmin =
  | 'NOVO_TRIAL'
  | 'NOVA_VENDA'
  | 'UPGRADE'
  | 'ADICIONAL_CONTRATADO'
  | 'PAGAMENTO_ATRASADO'
  | 'TRIAL_EXPIRANDO';

export interface EmpresaDoc {
  id: string;
  ownerUid: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string | null;
  emailFinanceiro: string;
  whatsapp: string;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  logoUrl?: string | null;
  corPrimaria: string;
  corSecundaria?: string | null;
  prefixoCertificado: string;
  modeloCertificadoId?: string | null;
  modeloProprioUrl?: string | null;
  dominioProprio?: string | null;
  status: StatusEmpresa;
  trialExpiraEmIso?: string | null;
  onboardingConcluido: boolean;
  planoId?: string | null;
  planoSlug?: string | null;
  ciclo?: CicloCobranca | null;
  valorMensalCentavos?: number | null;
  asaasCustomerId?: string | null;
  adicionaisAtivos?: string[];
  featureFlags?: Record<string, boolean>;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface MembroDoc {
  id: string;
  uid: string;
  empresaId: string;
  nome: string;
  email: string;
  perfil: 'ADMIN_EMPRESA' | 'RT' | 'INSTRUTOR_TST';
  registroProfissional?: string | null;
  cargo?: string | null;
  ativo: boolean;
  createdAt?: Timestamp | null;
}

export interface FaturaDoc {
  id: string;
  empresaId: string;
  descricao: string;
  valorCentavos: number;
  status: 'PENDENTE' | 'PAGA' | 'VENCIDA' | 'CANCELADA' | 'ESTORNADA';
  metodoPagamento: 'PIX' | 'CARTAO_CREDITO' | 'BOLETO';
  tipoItem: 'PLANO' | 'ADICIONAL' | 'UPGRADE';
  itemSlug?: string | null;
  ciclo?: CicloCobranca | null;
  asaasPaymentId?: string | null;
  pixQrCodePayload?: string | null;
  pixQrCodeSvg?: string | null;
  invoiceUrl?: string | null;
  modoIntegracao?: string | null;
  vencimentoIso: string;
  pagoEmIso?: string | null;
  createdAt?: Timestamp | null;
}

export interface ObraDoc {
  id: string;
  empresaId: string;
  codigo: string;
  nome: string;
  clienteFinal?: string | null;
  localizacao?: string | null;
  ativo: boolean;
  createdAt?: Timestamp | null;
}

export interface ColaboradorDoc {
  id: string;
  empresaId: string;
  contratoObraId?: string | null;
  contratoObraNome?: string | null;
  nome: string;
  cpf: string;
  rg?: string | null;
  funcao: string;
  matricula?: string | null;
  email?: string | null;
  telefone?: string | null;
  ativo: boolean;
  createdAt?: Timestamp | null;
}

export interface AssinaturaDigitalDoc {
  id: string;
  empresaId: string;
  usuarioUid?: string | null;
  tipo: 'INSTRUTOR' | 'RT' | 'EMPRESA';
  nomeSignatario: string;
  registro?: string | null;
  imagemDataUrl: string;
  ativa: boolean;
  createdAt?: Timestamp | null;
}

export interface TreinamentoEmpresaDoc {
  id: string;
  empresaId: string;
  nrCodigo: string;
  nrTitulo: string;
  variacaoNome: string;
  modalidade: 'INICIAL' | 'RECICLAGEM' | 'COMPLEMENTAR';
  cargaHorariaHoras: number;
  validadeMeses: number;
  notaMinimaAprovacao: number;
  baseLegal?: string | null;
  conteudoLinhas: ConteudoLinhaCatalogo[];
  ativo: boolean;
  createdAt?: Timestamp | null;
}

export interface QuestaoAlternativa {
  id: 'A' | 'B' | 'C' | 'D';
  texto: string;
}

export interface QuestaoDoc {
  id: string;
  empresaId: string;
  treinamentoId: string;
  enunciado: string;
  alternativas: QuestaoAlternativa[];
  correta: 'A' | 'B' | 'C' | 'D';
  peso?: number;
  ativa: boolean;
  createdAt?: Timestamp | null;
}

export interface TurmaDoc {
  id: string;
  empresaId: string;
  treinamentoId: string;
  treinamentoResumo?: string | null;
  nrCodigo?: string | null;
  cargaHorariaHoras?: number | null;
  validadeMeses?: number | null;
  notaMinimaAprovacao?: number | null;
  contratoObraId?: string | null;
  contratoObraNome?: string | null;
  instrutorNome?: string | null;
  instrutorRegistro?: string | null;
  rtNome?: string | null;
  rtRegistro?: string | null;
  codigoTurma: string;
  titulo: string;
  dataRealizacaoIso: string;
  localRealizacao?: string | null;
  tokenPublico: string;
  modoIdentificacao: ModoIdentificacaoProva;
  pinAcesso?: string | null;
  status: StatusTurma;
  createdAt?: Timestamp | null;
}

export interface ProvaTentativaDoc {
  id: string;
  empresaId: string;
  turmaId: string;
  tokenPublico?: string | null;
  colaboradorId: string;
  colaboradorNome: string;
  colaboradorCpf: string;
  respostas: Record<string, string>;
  notaPercentual: number;
  acertos?: number;
  totalQuestoes?: number;
  status: 'EM_ANDAMENTO' | 'APROVADO' | 'REPROVADO';
  assinaturaDataUrl?: string | null;
  selfieDataUrl?: string | null;
  concluidaEm?: Timestamp | null;
}

export interface CertificadoDoc {
  id: string;
  empresaId: string;
  turmaId: string;
  contratoObraId?: string | null;
  contratoObraNome?: string | null;
  colaboradorId: string;
  numeroCertificado: string;
  codigoValidacaoQr: string;
  nrCodigo: string;
  treinamentoTitulo: string;
  cargaHorariaHoras: number;
  dataRealizacaoIso: string;
  dataValidadeIso: string;
  status: 'EMITIDO' | 'REVOGADO';
  snapshotConteudoLinhas: ConteudoLinhaCatalogo[];
  snapshotEmpresa: {
    razaoSocial: string;
    cnpj: string;
    endereco?: string;
    cidade?: string;
    uf?: string;
    logoUrl?: string;
    corPrimaria: string;
    instrutorNome?: string;
    instrutorRegistro?: string;
    instrutorAssinaturaUrl?: string;
    rtNome?: string;
    rtRegistro?: string;
    rtAssinaturaUrl?: string;
  };
  snapshotColaborador: {
    nome: string;
    cpf: string;
    funcao: string;
    assinaturaDataUrl?: string;
  };
  emitidoEm?: Timestamp | null;
}

export interface CertificadoPublicoDoc {
  codigoValidacaoQr: string;
  empresaId: string;
  numeroCertificado: string;
  nrCodigo: string;
  treinamentoTitulo: string;
  colaboradorNome: string;
  colaboradorCpfMascarado: string;
  empresaRazaoSocial: string;
  empresaCnpj?: string | null;
  cargaHorariaHoras: number;
  dataRealizacao?: string | null;
  dataValidade?: string | null;
  status: 'EMITIDO' | 'REVOGADO';
  snapshotConteudoLinhas?: ConteudoLinhaCatalogo[];
  emitidoEm?: Timestamp | null;
}

export interface CartaAnuenciaDoc {
  id: string;
  empresaId: string;
  colaboradorId: string;
  colaboradorNome: string;
  titulo: string;
  nrReferencia: string;
  textoLegal: string;
  responsavelNome?: string | null;
  assinaturaRespUrl?: string | null;
  validadeIso: string;
  emitidaEm?: Timestamp | null;
}

export interface TurmaPublicaDoc {
  tokenPublico: string;
  empresaId: string;
  turmaId: string;
  empresaRazaoSocial: string;
  empresaCorPrimaria?: string | null;
  empresaLogoUrl?: string | null;
  titulo: string;
  nrCodigo: string;
  cargaHorariaHoras: number;
  notaMinimaAprovacao: number;
  modoIdentificacao: ModoIdentificacaoProva;
  exigePin?: boolean;
  pinHash?: string | null;
  questoesPublicas: {
    id: string;
    enunciado: string;
    alternativas: QuestaoAlternativa[];
    correta: 'A' | 'B' | 'C' | 'D';
  }[];
  status: StatusTurma;
}

export interface DossiePublicoDoc {
  token: string;
  empresaId: string;
  colaboradorId: string;
  empresaRazaoSocial: string;
  colaboradorNome: string;
  colaboradorCpfMascarado: string;
  colaboradorFuncao: string;
  certificados: {
    numeroCertificado: string;
    codigoValidacaoQr: string;
    nrCodigo: string;
    treinamentoTitulo: string;
    cargaHorariaHoras: number;
    dataRealizacaoIso: string;
    dataValidadeIso: string;
    status: string;
  }[];
  cartasAnuencia: {
    titulo: string;
    nrReferencia: string;
    validadeIso: string;
  }[];
  provasResumo?: {
    turmaId: string;
    notaPercentual: number;
    status: string;
  }[];
  expiraEmIso: string;
}

export interface NotificacaoAdminDoc {
  id: string;
  tipo: TipoNotificacaoAdmin;
  titulo: string;
  mensagem: string;
  empresaId?: string | null;
  empresaNome?: string | null;
  lida: boolean;
  createdAt?: Timestamp | null;
}

export interface AnalyticsSessionDoc {
  id: string;
  sessaoId: string;
  rota: string;
  origem: 'SITE' | 'APP' | 'ADMIN' | 'PROVA_PUBLICA' | 'VALIDACAO_QR';
  empresaId?: string | null;
  usuarioUid?: string | null;
  ultimoPingEm?: Timestamp | null;
}

export interface EffectivePlanLimits {
  planoNome: string;
  planoSlug: string;
  limiteColaboradores: number;
  limiteUsuarios: number;
  limiteObras: number;
  incluiCartaAnuencia: boolean;
  incluiDossieLink: boolean;
  incluiAlertasWpp: boolean;
  incluiDominioProprio: boolean;
  incluiModeloProprio: boolean;
}
