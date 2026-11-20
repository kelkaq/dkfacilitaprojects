// ============================================================================
// DK FACILITA — CERTIFICA SOFTWARE - DK
// Catálogo Global Oficial (Planos, Adicionais, NRs com Variações/Linhas e Modelos)
// Fonte única de verdade para o seed do PostgreSQL (Prisma) e Cloud Firestore
// ============================================================================

export interface PlanoCatalogo {
  id: string;
  slug: string;
  nome: string;
  subtitulo: string;
  descricao: string;
  precoMensalCentavos: number;
  precoPromocionalCentavos?: number | null;
  seloPromocional?: string | null;
  descontoSemestral: number;
  descontoAnual: number;
  limiteColaboradores: number;
  limiteUsuarios: number;
  limiteObras: number;
  incluiCartaAnuencia: boolean;
  incluiDossieLink: boolean;
  incluiAlertasWpp: boolean;
  incluiDominioProprio: boolean;
  destaque: boolean;
  ativo: boolean;
  ordem: number;
}

export interface AdicionalCatalogo {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  precoMensalCentavos: number;
  tipoCobranca: 'RECORRENTE' | 'UNICO';
  recursoChave: string;
  incrementoQtd: number;
  ativo: boolean;
  ordem: number;
}

export interface ConteudoLinhaCatalogo {
  ordem: number;
  descricao: string;
  cargaHorariaMin: number | null;
}

export interface NrVariacaoCatalogo {
  slug: string;
  nome: string;
  modalidade: 'INICIAL' | 'RECICLAGEM' | 'COMPLEMENTAR';
  cargaHorariaHoras: number;
  validadeMeses: number;
  notaMinimaAprovacao: number;
  ordem: number;
  linhas: ConteudoLinhaCatalogo[];
}

export interface NrGlobalCatalogo {
  id: string;
  codigo: string;
  titulo: string;
  descricao: string;
  baseLegal: string;
  validadePadraoMeses: number;
  ativa: boolean;
  ordem: number;
  variacoes: NrVariacaoCatalogo[];
}

export interface ModeloCertificadoCatalogo {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  categoria: 'GRATUITO' | 'PREMIUM';
  previewCssToken: string;
  layoutConfig: {
    moldura: 'dupla-classica' | 'minimal-linha' | 'tecnica-grade' | 'corporativa-barra';
    colunasVersoAuto: boolean;
    posicaoQr: 'rodape-direito' | 'rodape-central';
    corBordaPadrao: string;
    corFundoCabecalho: string;
    estiloTipografia: 'editorial' | 'geometrica' | 'tecnica';
  };
  ativo: boolean;
  ordem: number;
}

export const PLANOS_GLOBAIS_SEED: PlanoCatalogo[] = [
  {
    id: 'plano_autonomo_tst',
    slug: 'autonomo-tst',
    nome: 'Autônomo / TST',
    subtitulo: 'Para técnicos de segurança e instrutores independentes',
    descricao:
      'Ideal para profissionais autônomos que ministram treinamentos de NRs e emitem certificados digitais com QR Code de validação.',
    precoMensalCentavos: 14900,
    descontoSemestral: 10,
    descontoAnual: 20,
    limiteColaboradores: 150,
    limiteUsuarios: 2,
    limiteObras: 5,
    incluiCartaAnuencia: false,
    incluiDossieLink: true,
    incluiAlertasWpp: false,
    incluiDominioProprio: false,
    destaque: false,
    ativo: true,
    ordem: 1,
  },
  {
    id: 'plano_essencial',
    slug: 'essencial',
    nome: 'Essencial',
    subtitulo: 'Para consultorias SST e empresas em crescimento',
    descricao:
      'Controle completo de turmas, provas mobile com assinatura na tela, central de vencimentos e dossiê unificado por colaborador.',
    precoMensalCentavos: 29900,
    descontoSemestral: 10,
    descontoAnual: 20,
    limiteColaboradores: 500,
    limiteUsuarios: 5,
    limiteObras: 15,
    incluiCartaAnuencia: false,
    incluiDossieLink: true,
    incluiAlertasWpp: false,
    incluiDominioProprio: false,
    destaque: false,
    ativo: true,
    ordem: 2,
  },
  {
    id: 'plano_profissional',
    slug: 'profissional',
    nome: 'Profissional',
    subtitulo: 'Para operações industriais, estaleiros e construtoras',
    descricao:
      'Inclui Cartas de Anuência, dossiê completo com evidências fotográficas/selfie, alertas automáticos e múltiplos responsáveis técnicos.',
    precoMensalCentavos: 54900,
    descontoSemestral: 10,
    descontoAnual: 20,
    limiteColaboradores: 1500,
    limiteUsuarios: 15,
    limiteObras: 50,
    incluiCartaAnuencia: true,
    incluiDossieLink: true,
    incluiAlertasWpp: true,
    incluiDominioProprio: false,
    destaque: true,
    ativo: true,
    ordem: 3,
  },
  {
    id: 'plano_enterprise',
    slug: 'enterprise',
    nome: 'Enterprise',
    subtitulo: 'Para grandes grupos, EPCistas e operações multi-unidades',
    descricao:
      'Capacidade ampliada, domínio próprio white-label, modelo exclusivo de certificado, SLA prioritário e governança corporativa completa.',
    precoMensalCentavos: 119000,
    descontoSemestral: 10,
    descontoAnual: 20,
    limiteColaboradores: 10000,
    limiteUsuarios: 50,
    limiteObras: 500,
    incluiCartaAnuencia: true,
    incluiDossieLink: true,
    incluiAlertasWpp: true,
    incluiDominioProprio: true,
    destaque: false,
    ativo: true,
    ordem: 4,
  },
];

export const ADICIONAIS_GLOBAIS_SEED: AdicionalCatalogo[] = [
  {
    id: 'addon_modelo_proprio',
    slug: 'modelo-proprio-certificado',
    nome: 'Modelo Próprio de Certificado',
    descricao:
      'Implantação de layout 100% personalizado (arte frente e verso da sua empresa) configurado diretamente pela equipe DK Facilita.',
    precoMensalCentavos: 19900,
    tipoCobranca: 'UNICO',
    recursoChave: 'modelo_proprio',
    incrementoQtd: 1,
    ativo: true,
    ordem: 1,
  },
  {
    id: 'addon_100_colaboradores',
    slug: 'pacote-100-colaboradores',
    nome: '+100 Colaboradores',
    descricao:
      'Expanda instantaneamente a capacidade de colaboradores ativos cadastrados na sua base sem precisar migrar de plano.',
    precoMensalCentavos: 4900,
    tipoCobranca: 'RECORRENTE',
    recursoChave: 'colaboradores_extra',
    incrementoQtd: 100,
    ativo: true,
    ordem: 2,
  },
  {
    id: 'addon_5_usuarios',
    slug: 'pacote-5-usuarios',
    nome: '+5 Usuários',
    descricao:
      'Adicione mais 5 acessos para Instrutores, Técnicos de Segurança (TST), Responsáveis Técnicos (RT) ou Administradores.',
    precoMensalCentavos: 5900,
    tipoCobranca: 'RECORRENTE',
    recursoChave: 'usuarios_extra',
    incrementoQtd: 5,
    ativo: true,
    ordem: 3,
  },
  {
    id: 'addon_carta_anuencia',
    slug: 'cartas-anuencia-dossie',
    nome: 'Cartas de Anuência & Dossiê',
    descricao:
      'Habilita emissão digital de Cartas de Anuência vinculadas ao Dossiê Unificado do colaborador com exportação em pacote.',
    precoMensalCentavos: 8900,
    tipoCobranca: 'RECORRENTE',
    recursoChave: 'carta_anuencia_dossie',
    incrementoQtd: 1,
    ativo: true,
    ordem: 4,
  },
  {
    id: 'addon_alertas_wpp',
    slug: 'alertas-whatsapp',
    nome: 'Alertas WhatsApp',
    descricao:
      'Envio automático de avisos de vencimento de NRs (60, 30, 15, 7 e 1 dia) para gestores de obra e equipe de SST via WhatsApp.',
    precoMensalCentavos: 7900,
    tipoCobranca: 'RECORRENTE',
    recursoChave: 'alertas_whatsapp',
    incrementoQtd: 1,
    ativo: true,
    ordem: 5,
  },
  {
    id: 'addon_dominio_proprio',
    slug: 'dominio-proprio',
    nome: 'Domínio Próprio',
    descricao:
      'Acesse o painel e a página de validação pública de QR Codes com o domínio da sua marca (ex.: certifica.suaempresa.com.br).',
    precoMensalCentavos: 12900,
    tipoCobranca: 'RECORRENTE',
    recursoChave: 'dominio_proprio',
    incrementoQtd: 1,
    ativo: true,
    ordem: 6,
  },
];

export const MODELOS_CERTIFICADO_GLOBAIS_SEED: ModeloCertificadoCatalogo[] = [
  {
    id: 'modelo_classico_institucional',
    slug: 'classico-institucional',
    nome: 'Clássico Institucional',
    descricao:
      'Moldura dupla sóbria, cabeçalho centralizado com logotipo da empresa e verso estruturado com colunas balanceadas automaticamente.',
    categoria: 'GRATUITO',
    previewCssToken: 'classic-frame',
    layoutConfig: {
      moldura: 'dupla-classica',
      colunasVersoAuto: true,
      posicaoQr: 'rodape-direito',
      corBordaPadrao: '#1E293B',
      corFundoCabecalho: '#F8FAFC',
      estiloTipografia: 'editorial',
    },
    ativo: true,
    ordem: 1,
  },
  {
    id: 'modelo_executivo_minimal',
    slug: 'executivo-minimalista',
    nome: 'Executivo Minimalista',
    descricao:
      'Design limpo padrão auditoria corporativa, filete fino perimetral, hierarquia tipográfica precisa e QR Code integrado ao rodapé.',
    categoria: 'GRATUITO',
    previewCssToken: 'minimal-slate',
    layoutConfig: {
      moldura: 'minimal-linha',
      colunasVersoAuto: true,
      posicaoQr: 'rodape-direito',
      corBordaPadrao: '#334155',
      corFundoCabecalho: '#FFFFFF',
      estiloTipografia: 'geometrica',
    },
    ativo: true,
    ordem: 2,
  },
  {
    id: 'modelo_engenharia_tecnica',
    slug: 'engenharia-tecnica',
    nome: 'Engenharia Técnica',
    descricao:
      'Layout técnico orientado a canteiros de obra, indústrias e estaleiros, com blocos tabulares para carga horária, base legal e assinaturas.',
    categoria: 'GRATUITO',
    previewCssToken: 'engineering-grid',
    layoutConfig: {
      moldura: 'tecnica-grade',
      colunasVersoAuto: true,
      posicaoQr: 'rodape-central',
      corBordaPadrao: '#0F172A',
      corFundoCabecalho: '#F1F5F9',
      estiloTipografia: 'tecnica',
    },
    ativo: true,
    ordem: 3,
  },
  {
    id: 'modelo_corporativo_moderno',
    slug: 'corporativo-moderno',
    nome: 'Corporativo Moderno',
    descricao:
      'Barra superior dinâmica adaptada à cor primária da empresa contratante, espaçamento amplo e validação instantânea destacada.',
    categoria: 'GRATUITO',
    previewCssToken: 'corporate-band',
    layoutConfig: {
      moldura: 'corporativa-barra',
      colunasVersoAuto: true,
      posicaoQr: 'rodape-direito',
      corBordaPadrao: '#0F172A',
      corFundoCabecalho: '#0F172A',
      estiloTipografia: 'geometrica',
    },
    ativo: true,
    ordem: 4,
  },
];

export const NRS_GLOBAIS_SEED: NrGlobalCatalogo[] = [
  {
    id: 'nr_01',
    codigo: 'NR-01',
    titulo: 'Disposições Gerais e Gerenciamento de Riscos Ocupacionais (GRO/PGR)',
    descricao:
      'Integração de segurança, direitos e deveres, percepção de riscos ocupacionais e procedimentos de emergência.',
    baseLegal: 'Portaria SEPRT nº 6.730/2020 e atualizações MTE',
    validadePadraoMeses: 24,
    ativa: true,
    ordem: 1,
    variacoes: [
      {
        slug: 'nr-01-integracao-4h',
        nome: 'Integração GRO / PGR 4h',
        modalidade: 'INICIAL',
        cargaHorariaHoras: 4,
        validadeMeses: 24,
        notaMinimaAprovacao: 70,
        ordem: 1,
        linhas: [
          { ordem: 1, descricao: 'Direitos, deveres e responsabilidades do empregador e do trabalhador (NR-01)', cargaHorariaMin: 45 },
          { ordem: 2, descricao: 'Conceitos de Gerenciamento de Riscos Ocupacionais (GRO) e PGR', cargaHorariaMin: 60 },
          { ordem: 3, descricao: 'Identificação de perigos, avaliação de riscos e medidas de prevenção coletiva e individual', cargaHorariaMin: 60 },
          { ordem: 4, descricao: 'Direito de recusa diante de risco grave e iminente', cargaHorariaMin: 30 },
          { ordem: 5, descricao: 'Procedimentos de resposta a emergências e comunicação de acidentes', cargaHorariaMin: 45 },
        ],
      },
    ],
  },
  {
    id: 'nr_06',
    codigo: 'NR-06',
    titulo: 'Equipamento de Proteção Individual (EPI)',
    descricao:
      'Orientação técnica sobre seleção, uso correto, guarda, conservação, higienização e limites de proteção dos EPIs.',
    baseLegal: 'Portaria MTP nº 2.175/2022',
    validadePadraoMeses: 12,
    ativa: true,
    ordem: 2,
    variacoes: [
      {
        slug: 'nr-06-uso-conservacao-2h',
        nome: 'Uso, Guarda e Conservação de EPI 2h',
        modalidade: 'INICIAL',
        cargaHorariaHoras: 2,
        validadeMeses: 12,
        notaMinimaAprovacao: 70,
        ordem: 1,
        linhas: [
          { ordem: 1, descricao: 'Requisitos legais da NR-06 e Certificado de Aprovação (CA)', cargaHorariaMin: 25 },
          { ordem: 2, descricao: 'Hierarquia de controle de riscos e limitações técnicas dos EPIs', cargaHorariaMin: 25 },
          { ordem: 3, descricao: 'Uso adequado de proteção respiratória, auditiva, ocular, manual e contra quedas', cargaHorariaMin: 40 },
          { ordem: 4, descricao: 'Higienização, inspeção pré-uso, guarda, substituição e descarte correto', cargaHorariaMin: 30 },
        ],
      },
    ],
  },
  {
    id: 'nr_10',
    codigo: 'NR-10',
    titulo: 'Segurança em Instalações e Serviços em Eletricidade',
    descricao:
      'Capacitação obrigatória para profissionais que atuam direta ou indiretamente em instalações elétricas e SEP.',
    baseLegal: 'Portaria MTE nº 598/2004 e atualizações',
    validadePadraoMeses: 24,
    ativa: true,
    ordem: 3,
    variacoes: [
      {
        slug: 'nr-10-basico-40h',
        nome: 'Básico 40h',
        modalidade: 'INICIAL',
        cargaHorariaHoras: 40,
        validadeMeses: 24,
        notaMinimaAprovacao: 70,
        ordem: 1,
        linhas: [
          { ordem: 1, descricao: 'Introdução à segurança com eletricidade e riscos em instalações e serviços', cargaHorariaMin: 240 },
          { ordem: 2, descricao: 'Choque elétrico, arco elétrico, queimaduras e campos eletromagnéticos', cargaHorariaMin: 300 },
          { ordem: 3, descricao: 'Técnicas de Análise de Risco (APR) e medidas de controle elétrico', cargaHorariaMin: 360 },
          { ordem: 4, descricao: 'Desenergização, bloqueio, etiquetagem (LOTO) e aterramento temporário', cargaHorariaMin: 360 },
          { ordem: 5, descricao: 'Normas Técnicas Brasileiras (NBR 5410, NBR 14039) e regulamentações MTE', cargaHorariaMin: 240 },
          { ordem: 6, descricao: 'Equipamentos de proteção coletiva (EPC) e individual (EPI) para eletricidade', cargaHorariaMin: 300 },
          { ordem: 7, descricao: 'Rotinas de trabalho, prontuário de instalações elétricas e áreas classificadas', cargaHorariaMin: 240 },
          { ordem: 8, descricao: 'Prevenção e combate a incêndios em instalações elétricas', cargaHorariaMin: 180 },
          { ordem: 9, descricao: 'Acidentes de origem elétrica e primeiros socorros (RCP e imobilização)', cargaHorariaMin: 180 },
        ],
      },
      {
        slug: 'nr-10-sep-40h',
        nome: 'Complementar SEP 40h',
        modalidade: 'COMPLEMENTAR',
        cargaHorariaHoras: 40,
        validadeMeses: 24,
        notaMinimaAprovacao: 70,
        ordem: 2,
        linhas: [
          { ordem: 1, descricao: 'Organização do Sistema Elétrico de Potência (SEP)', cargaHorariaMin: 240 },
          { ordem: 2, descricao: 'Organização do trabalho, programação e planejamento de serviços no SEP', cargaHorariaMin: 300 },
          { ordem: 3, descricao: 'Aspectos comportamentais e condições impeditivas para serviços', cargaHorariaMin: 240 },
          { ordem: 4, descricao: 'Riscos típicos no SEP e sua prevenção (proximidade, indução, descargas)', cargaHorariaMin: 420 },
          { ordem: 5, descricao: 'Técnicas de trabalho sob tensão (linha viva) e ao potencial', cargaHorariaMin: 480 },
          { ordem: 6, descricao: 'Equipamentos, ferramentas isoladas e ensaios dielétricos', cargaHorariaMin: 360 },
          { ordem: 7, descricao: 'Liberação de instalação, sinalização e isolamento de áreas de trabalho', cargaHorariaMin: 360 },
        ],
      },
      {
        slug: 'nr-10-reciclagem-8h',
        nome: 'Reciclagem Bienal 8h',
        modalidade: 'RECICLAGEM',
        cargaHorariaHoras: 8,
        validadeMeses: 24,
        notaMinimaAprovacao: 70,
        ordem: 3,
        linhas: [
          { ordem: 1, descricao: 'Revisão de riscos elétricos, choque e arco elétrico em operações reais', cargaHorariaMin: 120 },
          { ordem: 2, descricao: 'Atualização dos procedimentos de desenergização e bloqueio LOTO', cargaHorariaMin: 120 },
          { ordem: 3, descricao: 'Inspeção de EPCs, EPIs isolantes e vestimentas ATPV', cargaHorariaMin: 120 },
          { ordem: 4, descricao: 'Estudo de casos de acidentes elétricos e protocolo de primeiros socorros', cargaHorariaMin: 120 },
        ],
      },
    ],
  },
  {
    id: 'nr_11',
    codigo: 'NR-11',
    titulo: 'Transporte, Movimentação, Armazenagem e Manuseio de Materiais',
    descricao:
      'Habilitação de operadores de empilhadeira, ponte rolante, guindauto e sinaleiros/amarradores de carga.',
    baseLegal: 'Portaria MTb nº 3.214/1978 e atualizações',
    validadePadraoMeses: 12,
    ativa: true,
    ordem: 4,
    variacoes: [
      {
        slug: 'nr-11-ponte-rolante-16h',
        nome: 'Operador de Ponte Rolante e Talha 16h',
        modalidade: 'INICIAL',
        cargaHorariaHoras: 16,
        validadeMeses: 12,
        notaMinimaAprovacao: 70,
        ordem: 1,
        linhas: [
          { ordem: 1, descricao: 'Legislação NR-11 e responsabilidades do operador de movimentação de cargas', cargaHorariaMin: 120 },
          { ordem: 2, descricao: 'Componentes mecânicos, elétricos, limitadores de carga e freios de ponte rolante', cargaHorariaMin: 180 },
          { ordem: 3, descricao: 'Inspeção diária (checklist), cabos de aço, cintas, manilhas e ganchos', cargaHorariaMin: 180 },
          { ordem: 4, descricao: 'Centro de gravidade, ângulos de içamento e tabela de capacidade de carga', cargaHorariaMin: 180 },
          { ordem: 5, descricao: 'Sinalização convencional e comunicação com sinaleiro/amarrador', cargaHorariaMin: 120 },
          { ordem: 6, descricao: 'Prática supervisionada de içamento, translação e posicionamento seguro', cargaHorariaMin: 180 },
        ],
      },
      {
        slug: 'nr-11-empilhadeira-16h',
        nome: 'Operador de Empilhadeira 16h',
        modalidade: 'INICIAL',
        cargaHorariaHoras: 16,
        validadeMeses: 12,
        notaMinimaAprovacao: 70,
        ordem: 2,
        linhas: [
          { ordem: 1, descricao: 'Normas de segurança NR-11 e regras de circulação industrial', cargaHorariaMin: 120 },
          { ordem: 2, descricao: 'Triângulo de estabilidade, centro de carga e prevenção de tombamento', cargaHorariaMin: 180 },
          { ordem: 3, descricao: 'Inspeção pré-operacional, abastecimento GLP/elétrico e manutenção básica', cargaHorariaMin: 180 },
          { ordem: 4, descricao: 'Técnicas seguras de empilhamento, desempilhamento e rampas', cargaHorariaMin: 240 },
          { ordem: 5, descricao: 'Prática operacional em circuito controlado com carga real', cargaHorariaMin: 240 },
        ],
      },
    ],
  },
  {
    id: 'nr_12',
    codigo: 'NR-12',
    titulo: 'Segurança no Trabalho em Máquinas e Equipamentos',
    descricao:
      'Capacitação para operação segura, proteções fixas e móveis, dispositivos de intertravamento e bloqueio de energias.',
    baseLegal: 'Portaria SEPRT nº 916/2019 e atualizações',
    validadePadraoMeses: 24,
    ativa: true,
    ordem: 5,
    variacoes: [
      {
        slug: 'nr-12-operacao-segura-8h',
        nome: 'Operação Segura de Máquinas 8h',
        modalidade: 'INICIAL',
        cargaHorariaHoras: 8,
        validadeMeses: 24,
        notaMinimaAprovacao: 70,
        ordem: 1,
        linhas: [
          { ordem: 1, descricao: 'Descrição e identificação dos riscos associados a cada máquina e equipamento', cargaHorariaMin: 90 },
          { ordem: 2, descricao: 'Funcionamento das proteções fixas, móveis e sensores de intertravamento', cargaHorariaMin: 90 },
          { ordem: 3, descricao: 'Dispositivos de parada de emergência e comando bimanual', cargaHorariaMin: 60 },
          { ordem: 4, descricao: 'Procedimentos de trabalho seguro, limpeza, ajuste e manutenção', cargaHorariaMin: 90 },
          { ordem: 5, descricao: 'Bloqueio e etiquetagem de fontes de energia perigosa (LOTO)', cargaHorariaMin: 90 },
          { ordem: 6, descricao: 'Sistema de permissão de trabalho e conduta diante de anomalias', cargaHorariaMin: 60 },
        ],
      },
    ],
  },
  {
    id: 'nr_18',
    codigo: 'NR-18',
    titulo: 'Segurança e Saúde no Trabalho na Indústria da Construção',
    descricao:
      'Capacitação admissional e periódica para canteiros de obras, andaimes, escavações e trabalhos civis.',
    baseLegal: 'Portaria SEPRT nº 3.733/2020',
    validadePadraoMeses: 24,
    ativa: true,
    ordem: 6,
    variacoes: [
      {
        slug: 'nr-18-admissional-6h',
        nome: 'Treinamento Admissional Construção 6h',
        modalidade: 'INICIAL',
        cargaHorariaHoras: 6,
        validadeMeses: 24,
        notaMinimaAprovacao: 70,
        ordem: 1,
        linhas: [
          { ordem: 1, descricao: 'Condições e meio ambiente de trabalho no canteiro de obras (PGR da obra)', cargaHorariaMin: 60 },
          { ordem: 2, descricao: 'Riscos inerentes à função em escavações, armação, concretagem e demolição', cargaHorariaMin: 90 },
          { ordem: 3, descricao: 'Proteções coletivas contra quedas: guarda-corpo, bandejas e linhas de vida', cargaHorariaMin: 90 },
          { ordem: 4, descricao: 'Uso correto de EPIs, ordem, limpeza e sinalização de segurança no canteiro', cargaHorariaMin: 60 },
          { ordem: 5, descricao: 'Instalações elétricas provisórias, máquinas portáteis e emergência', cargaHorariaMin: 60 },
        ],
      },
    ],
  },
  {
    id: 'nr_20',
    codigo: 'NR-20',
    titulo: 'Segurança e Saúde no Trabalho com Inflamáveis e Combustíveis',
    descricao:
      'Capacitação para atividades em instalações classes I, II e III com líquidos combustíveis e gases inflamáveis.',
    baseLegal: 'Portaria SEPRT nº 1.360/2019',
    validadePadraoMeses: 36,
    ativa: true,
    ordem: 7,
    variacoes: [
      {
        slug: 'nr-20-basico-8h',
        nome: 'Básico Classe I/II/III 8h',
        modalidade: 'INICIAL',
        cargaHorariaHoras: 8,
        validadeMeses: 36,
        notaMinimaAprovacao: 70,
        ordem: 1,
        linhas: [
          { ordem: 1, descricao: 'Inflamáveis: características físico-químicas, ponto de fulgor, LIE/LSE e riscos', cargaHorariaMin: 90 },
          { ordem: 2, descricao: 'Controles coletivos e individuais para trabalhos com inflamáveis', cargaHorariaMin: 90 },
          { ordem: 3, descricao: 'Fontes de ignição, eletricidade estática e controle em áreas classificadas', cargaHorariaMin: 90 },
          { ordem: 4, descricao: 'Proteção contra incêndio com inflamáveis e uso de agentes extintores', cargaHorariaMin: 120 },
          { ordem: 5, descricao: 'Procedimentos básicos em situações de emergência, vazamentos e evacuação', cargaHorariaMin: 90 },
        ],
      },
      {
        slug: 'nr-20-intermediario-16h',
        nome: 'Intermediário 16h',
        modalidade: 'INICIAL',
        cargaHorariaHoras: 16,
        validadeMeses: 24,
        notaMinimaAprovacao: 70,
        ordem: 2,
        linhas: [
          { ordem: 1, descricao: 'Características de inflamáveis, classificação de áreas e FISPQ/FDS', cargaHorariaMin: 180 },
          { ordem: 2, descricao: 'Estudo da NR-20, prontuário da instalação e análise preliminar de perigos', cargaHorariaMin: 180 },
          { ordem: 3, descricao: 'Permissão de Trabalho (PT) para atividades a quente e manutenção em inflamáveis', cargaHorariaMin: 180 },
          { ordem: 4, descricao: 'Acidentes com inflamáveis: causas, consequências e barreiras de contenção', cargaHorariaMin: 180 },
          { ordem: 5, descricao: 'Plano de resposta a emergências e prática de combate a princípios de incêndio', cargaHorariaMin: 240 },
        ],
      },
    ],
  },
  {
    id: 'nr_33',
    codigo: 'NR-33',
    titulo: 'Segurança e Saúde nos Trabalhos em Espaços Confinados',
    descricao:
      'Capacitação obrigatória para Trabalhadores Autorizados, Vigias e Supervisores de Entrada em Espaços Confinados.',
    baseLegal: 'Portaria MTP nº 1.690/2022',
    validadePadraoMeses: 12,
    ativa: true,
    ordem: 8,
    variacoes: [
      {
        slug: 'nr-33-autorizado-vigia-16h',
        nome: 'Trabalhador Autorizado e Vigia 16h',
        modalidade: 'INICIAL',
        cargaHorariaHoras: 16,
        validadeMeses: 12,
        notaMinimaAprovacao: 70,
        ordem: 1,
        linhas: [
          { ordem: 1, descricao: 'Definições, caracterização de espaços confinados e requisitos legais da NR-33', cargaHorariaMin: 120 },
          { ordem: 2, descricao: 'Reconhecimento, avaliação e controle de riscos atmosféricos, mecânicos e biológicos', cargaHorariaMin: 180 },
          { ordem: 3, descricao: 'Funcionamento de detectores multigás, monitoramento contínuo e ventilação', cargaHorariaMin: 180 },
          { ordem: 4, descricao: 'Emissão, cumprimento e encerramento da Permissão de Entrada e Trabalho (PET)', cargaHorariaMin: 120 },
          { ordem: 5, descricao: 'Atribuições do Vigia, comunicação contínua e sinalização de isolamento', cargaHorariaMin: 120 },
          { ordem: 6, descricao: 'Noções de resgate, primeiros socorros e prática simulada de entrada e extração', cargaHorariaMin: 240 },
        ],
      },
      {
        slug: 'nr-33-supervisor-40h',
        nome: 'Supervisor de Entrada 40h',
        modalidade: 'INICIAL',
        cargaHorariaHoras: 40,
        validadeMeses: 12,
        notaMinimaAprovacao: 75,
        ordem: 2,
        linhas: [
          { ordem: 1, descricao: 'Gestão completa do programa de entrada em espaços confinados (NR-33 e NBR 16577)', cargaHorariaMin: 300 },
          { ordem: 2, descricao: 'Identificação, cadastro, sinalização e bloqueio/isolamento de energias (LOTO)', cargaHorariaMin: 360 },
          { ordem: 3, descricao: 'Avaliação e controle de atmosferas perigosas, calibração e teste de resposta (bump test)', cargaHorariaMin: 420 },
          { ordem: 4, descricao: 'Ventilação mecânica, purga, inertização e proteção respiratória (EPR/autônomo)', cargaHorariaMin: 420 },
          { ordem: 5, descricao: 'Responsabilidade técnica na emissão, validação e cancelamento da PET', cargaHorariaMin: 300 },
          { ordem: 6, descricao: 'Coordenação de equipe de emergência, técnicas de salvamento e prática de campo', cargaHorariaMin: 600 },
        ],
      },
      {
        slug: 'nr-33-reciclagem-8h',
        nome: 'Reciclagem Anual 8h',
        modalidade: 'RECICLAGEM',
        cargaHorariaHoras: 8,
        validadeMeses: 12,
        notaMinimaAprovacao: 70,
        ordem: 3,
        linhas: [
          { ordem: 1, descricao: 'Atualização normativa NR-33 e revisão crítica de incidentes em espaços confinados', cargaHorariaMin: 120 },
          { ordem: 2, descricao: 'Revisão prática de leitura de multigás, PET e deveres do Vigia/Autorizado', cargaHorariaMin: 180 },
          { ordem: 3, descricao: 'Simulado prático de emergência, evacuação assistida e primeiros socorros', cargaHorariaMin: 180 },
        ],
      },
    ],
  },
  {
    id: 'nr_34',
    codigo: 'NR-34',
    titulo: 'Condições e Meio Ambiente de Trabalho na Indústria da Construção, Reparação e Desmonte Naval',
    descricao:
      'Capacitação especializada para trabalho a quente, observador de trabalho a quente, movimentação de cargas e pintura naval.',
    baseLegal: 'Portaria MTE nº 200/2011 e atualizações',
    validadePadraoMeses: 12,
    ativa: true,
    ordem: 9,
    variacoes: [
      {
        slug: 'nr-34-trabalho-quente-executante-8h',
        nome: 'Executante 8h (Trabalho a Quente)',
        modalidade: 'INICIAL',
        cargaHorariaHoras: 8,
        validadeMeses: 12,
        notaMinimaAprovacao: 70,
        ordem: 1,
        linhas: [
          { ordem: 1, descricao: 'Requisitos da NR-34 para atividades a quente (soldagem, corte, goivagem e esmerilhamento)', cargaHorariaMin: 60 },
          { ordem: 2, descricao: 'Análise Preliminar de Risco (APR) e Permissão de Trabalho (PT) para trabalho a quente', cargaHorariaMin: 60 },
          { ordem: 3, descricao: 'Inspeção prévia do local, segregação de combustíveis e compartimentos adjacentes', cargaHorariaMin: 60 },
          { ordem: 4, descricao: 'Controle de fumos metálicos, gases, ventilação local exaustora e radiações não ionizantes', cargaHorariaMin: 60 },
          { ordem: 5, descricao: 'Segurança com cilindros de gases, conjuntos oxiacetilênicos, válvulas corta-chama e máquinas de solda', cargaHorariaMin: 90 },
          { ordem: 6, descricao: 'Proteção contra incêndios, mantas antichama, biombos e atuação inicial de combate', cargaHorariaMin: 90 },
          { ordem: 7, descricao: 'Uso específico de EPIs para trabalho a quente e inspeção pós-serviço', cargaHorariaMin: 60 },
        ],
      },
      {
        slug: 'nr-34-observador-8h',
        nome: 'Observador 8h (Vigia de Trabalho a Quente)',
        modalidade: 'INICIAL',
        cargaHorariaHoras: 8,
        validadeMeses: 12,
        notaMinimaAprovacao: 70,
        ordem: 2,
        linhas: [
          { ordem: 1, descricao: 'Papel legal, atribuições e responsabilidade exclusiva do Observador conforme NR-34', cargaHorariaMin: 60 },
          { ordem: 2, descricao: 'Química do fogo, propagação de fagulhas e transferência de calor por condução em anteparas', cargaHorariaMin: 90 },
          { ordem: 3, descricao: 'Checklist de liberação da área, isolamento de ralos, frestas e proteção de compartimentos', cargaHorariaMin: 90 },
          { ordem: 4, descricao: 'Prática de prevenção e combate a princípios de incêndio (extintores e linhas de mangueira)', cargaHorariaMin: 120 },
          { ordem: 5, descricao: 'Monitoramento contínuo durante a execução e vigilância obrigatória pós-término', cargaHorariaMin: 60 },
          { ordem: 6, descricao: 'Protocolo de alarme, acionamento da brigada de emergência e interrupção imediata da PT', cargaHorariaMin: 60 },
        ],
      },
      {
        slug: 'nr-34-reciclagem-4h',
        nome: 'Reciclagem 4h',
        modalidade: 'RECICLAGEM',
        cargaHorariaHoras: 4,
        validadeMeses: 12,
        notaMinimaAprovacao: 70,
        ordem: 3,
        linhas: [
          { ordem: 1, descricao: 'Revisão dos procedimentos de APR, PT e inspeção de segurança NR-34', cargaHorariaMin: 60 },
          { ordem: 2, descricao: 'Inspeção prática de equipamentos de solda, corte a quente e proteção coletiva', cargaHorariaMin: 60 },
          { ordem: 3, descricao: 'Prevenção de incêndios em ambientes navais/industriais e análise de desvios reais', cargaHorariaMin: 60 },
          { ordem: 4, descricao: 'Atualização de EPIs, emergências e avaliação teórica de reciclagem', cargaHorariaMin: 60 },
        ],
      },
    ],
  },
  {
    id: 'nr_35',
    codigo: 'NR-35',
    titulo: 'Trabalho em Altura',
    descricao:
      'Capacitação obrigatória para qualquer atividade executada acima de 2,00 m do nível inferior onde haja risco de queda.',
    baseLegal: 'Portaria MTP nº 4.218/2022 e Anexos I, II e III',
    validadePadraoMeses: 24,
    ativa: true,
    ordem: 10,
    variacoes: [
      {
        slug: 'nr-35-inicial-8h',
        nome: 'Inicial 8h',
        modalidade: 'INICIAL',
        cargaHorariaHoras: 8,
        validadeMeses: 24,
        notaMinimaAprovacao: 70,
        ordem: 1,
        linhas: [
          { ordem: 1, descricao: 'Normas e regulamentos aplicáveis ao trabalho em altura (NR-35 e Anexos)', cargaHorariaMin: 45 },
          { ordem: 2, descricao: 'Análise de Risco (AR), Permissão de Trabalho (PT) e condições impeditivas', cargaHorariaMin: 60 },
          { ordem: 3, descricao: 'Riscos potenciais inerentes ao trabalho em altura e medidas de prevenção e controle', cargaHorariaMin: 60 },
          { ordem: 4, descricao: 'Sistemas de Proteção Coletiva e Individual contra Quedas (SPIQ), fator de queda e ZLQ', cargaHorariaMin: 90 },
          { ordem: 5, descricao: 'Seleção, inspeção, conservação e limitação de cinturões paraquedista, talabartes e trava-quedas', cargaHorariaMin: 60 },
          { ordem: 6, descricao: 'Acidentes típicos em trabalhos em altura e síndrome da suspensão inerte', cargaHorariaMin: 45 },
          { ordem: 7, descricao: 'Condutas em situações de emergência, noções de resgate, primeiros socorros e prática de campo', cargaHorariaMin: 120 },
        ],
      },
      {
        slug: 'nr-35-reciclagem-8h',
        nome: 'Reciclagem Bienal 8h',
        modalidade: 'RECICLAGEM',
        cargaHorariaHoras: 8,
        validadeMeses: 24,
        notaMinimaAprovacao: 70,
        ordem: 2,
        linhas: [
          { ordem: 1, descricao: 'Atualizações da NR-35 (Anexos de escadas, ancoragem e acesso por cordas)', cargaHorariaMin: 60 },
          { ordem: 2, descricao: 'Revisão de Análise de Risco, cálculo de Zona Livre de Queda e pontos de ancoragem', cargaHorariaMin: 120 },
          { ordem: 3, descricao: 'Inspeção detalhada de EPIs contra quedas e critérios de descarte imediato', cargaHorariaMin: 120 },
          { ordem: 4, descricao: 'Prática supervisionada de ancoragem, movimentação segura e resposta a emergências', cargaHorariaMin: 180 },
        ],
      },
    ],
  },
];

export function calcularPrecoCicloCentavos(
  precoMensalCentavos: number,
  ciclo: 'MENSAL' | 'SEMESTRAL' | 'ANUAL',
  descontoSemestral = 10,
  descontoAnual = 20
): { mensalEquivalenteCentavos: number; totalPeriodoCentavos: number; descontoPercentual: number } {
  if (ciclo === 'SEMESTRAL') {
    const mensal = Math.round(precoMensalCentavos * (1 - descontoSemestral / 100));
    return {
      mensalEquivalenteCentavos: mensal,
      totalPeriodoCentavos: mensal * 6,
      descontoPercentual: descontoSemestral,
    };
  }
  if (ciclo === 'ANUAL') {
    const mensal = Math.round(precoMensalCentavos * (1 - descontoAnual / 100));
    return {
      mensalEquivalenteCentavos: mensal,
      totalPeriodoCentavos: mensal * 12,
      descontoPercentual: descontoAnual,
    };
  }
  return {
    mensalEquivalenteCentavos: precoMensalCentavos,
    totalPeriodoCentavos: precoMensalCentavos,
    descontoPercentual: 0,
  };
}

export function formatarMoedaBRL(centavos: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(centavos / 100);
}
