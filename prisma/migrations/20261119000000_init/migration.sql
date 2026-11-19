-- ============================================================================
-- DK FACILITA — CERTIFICA SOFTWARE - DK
-- Migration Inicial PostgreSQL (20261119000000_init)
-- Arquitetura Multiempresa com isolamento estrito por empresa_id
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ENUMS
CREATE TYPE "CicloCobranca" AS ENUM ('MENSAL', 'SEMESTRAL', 'ANUAL');
CREATE TYPE "StatusEmpresa" AS ENUM ('TRIAL', 'ATIVA', 'INADIMPLENTE', 'SUSPENSA', 'CANCELADA');
CREATE TYPE "StatusAssinatura" AS ENUM ('TRIAL', 'ATIVA', 'ATRASADA', 'SUSPENSA', 'CANCELADA');
CREATE TYPE "StatusFatura" AS ENUM ('PENDENTE', 'PAGA', 'VENCIDA', 'CANCELADA', 'ESTORNADA');
CREATE TYPE "MetodoPagamento" AS ENUM ('PIX', 'CARTAO_CREDITO', 'BOLETO');
CREATE TYPE "PerfilUsuario" AS ENUM ('SUPER_ADMIN', 'ADMIN_EMPRESA', 'RT', 'INSTRUTOR_TST');
CREATE TYPE "ModoIdentificacaoProva" AS ENUM ('CPF', 'CPF_PIN', 'CPF_PIN_SELFIE');
CREATE TYPE "StatusTurma" AS ENUM ('RASCUNHO', 'ABERTA', 'ENCERRADA', 'CANCELADA');
CREATE TYPE "StatusTentativaProva" AS ENUM ('EM_ANDAMENTO', 'APROVADO', 'REPROVADO');
CREATE TYPE "StatusCertificado" AS ENUM ('EMITIDO', 'REVOGADO');
CREATE TYPE "TipoNotificacaoAdmin" AS ENUM (
  'NOVO_TRIAL',
  'NOVA_VENDA',
  'UPGRADE',
  'ADICIONAL_CONTRATADO',
  'PAGAMENTO_ATRASADO',
  'TRIAL_EXPIRANDO'
);

-- 1. TABELAS GLOBAIS
CREATE TABLE "planos" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "subtitulo" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "preco_mensal_centavos" INTEGER NOT NULL,
  "desconto_semestral" INTEGER NOT NULL DEFAULT 10,
  "desconto_anual" INTEGER NOT NULL DEFAULT 20,
  "limite_colaboradores" INTEGER NOT NULL,
  "limite_usuarios" INTEGER NOT NULL,
  "limite_obras" INTEGER NOT NULL,
  "inclui_carta_anuencia" BOOLEAN NOT NULL DEFAULT false,
  "inclui_dossie_link" BOOLEAN NOT NULL DEFAULT true,
  "inclui_alertas_wpp" BOOLEAN NOT NULL DEFAULT false,
  "inclui_dominio_proprio" BOOLEAN NOT NULL DEFAULT false,
  "destaque" BOOLEAN NOT NULL DEFAULT false,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "planos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "planos_slug_key" ON "planos"("slug");

CREATE TABLE "adicionais" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "preco_mensal_centavos" INTEGER NOT NULL,
  "tipo_cobranca" TEXT NOT NULL DEFAULT 'RECORRENTE',
  "recurso_chave" TEXT NOT NULL,
  "incremento_qtd" INTEGER NOT NULL DEFAULT 0,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "adicionais_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "adicionais_slug_key" ON "adicionais"("slug");

CREATE TABLE "nrs_globais" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "codigo" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "base_legal" TEXT NOT NULL,
  "validade_padrao_meses" INTEGER NOT NULL DEFAULT 24,
  "ativa" BOOLEAN NOT NULL DEFAULT true,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nrs_globais_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "nrs_globais_codigo_key" ON "nrs_globais"("codigo");

CREATE TABLE "nrs_globais_variacoes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "nr_global_id" UUID NOT NULL,
  "slug" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "modalidade" TEXT NOT NULL DEFAULT 'INICIAL',
  "carga_horaria_horas" INTEGER NOT NULL,
  "validade_meses" INTEGER NOT NULL,
  "nota_minima_aprovacao" INTEGER NOT NULL DEFAULT 70,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nrs_globais_variacoes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "nrs_globais_variacoes_nr_global_id_fkey" FOREIGN KEY ("nr_global_id") REFERENCES "nrs_globais"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "nrs_globais_variacoes_slug_key" ON "nrs_globais_variacoes"("slug");
CREATE INDEX "nrs_globais_variacoes_nr_global_id_idx" ON "nrs_globais_variacoes"("nr_global_id");

CREATE TABLE "nrs_globais_conteudo_linhas" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "variacao_id" UUID NOT NULL,
  "ordem" INTEGER NOT NULL,
  "descricao" TEXT NOT NULL,
  "carga_horaria_min" INTEGER,
  CONSTRAINT "nrs_globais_conteudo_linhas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "nrs_globais_conteudo_linhas_variacao_id_fkey" FOREIGN KEY ("variacao_id") REFERENCES "nrs_globais_variacoes"("id") ON DELETE CASCADE
);
CREATE INDEX "nrs_globais_conteudo_linhas_variacao_id_ordem_idx" ON "nrs_globais_conteudo_linhas"("variacao_id", "ordem");

CREATE TABLE "modelos_certificado_globais" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "categoria" TEXT NOT NULL DEFAULT 'GRATUITO',
  "layout_config" JSONB NOT NULL,
  "preview_css_token" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "modelos_certificado_globais_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "modelos_certificado_globais_slug_key" ON "modelos_certificado_globais"("slug");

-- 2. EMPRESAS, ASSINATURAS E FATURAS
CREATE TABLE "empresas" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "cnpj" TEXT NOT NULL,
  "razao_social" TEXT NOT NULL,
  "nome_fantasia" TEXT,
  "email_financeiro" TEXT NOT NULL,
  "whatsapp" TEXT NOT NULL,
  "endereco" TEXT,
  "cidade" TEXT,
  "uf" TEXT,
  "logo_url" TEXT,
  "cor_primaria" TEXT NOT NULL DEFAULT '#0F172A',
  "cor_secundaria" TEXT NOT NULL DEFAULT '#1D4ED8',
  "prefixo_certificado" TEXT NOT NULL DEFAULT 'CERT',
  "modelo_certificado_id" UUID,
  "modelo_proprio_url" TEXT,
  "modelo_proprio_config" JSONB,
  "dominio_proprio" TEXT,
  "status" "StatusEmpresa" NOT NULL DEFAULT 'TRIAL',
  "trial_expira_em" TIMESTAMP(3),
  "onboarding_concluido" BOOLEAN NOT NULL DEFAULT false,
  "asaas_customer_id" TEXT,
  "feature_flags" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "empresas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "empresas_modelo_certificado_id_fkey" FOREIGN KEY ("modelo_certificado_id") REFERENCES "modelos_certificado_globais"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "empresas_cnpj_key" ON "empresas"("cnpj");
CREATE UNIQUE INDEX "empresas_dominio_proprio_key" ON "empresas"("dominio_proprio");
CREATE UNIQUE INDEX "empresas_asaas_customer_id_key" ON "empresas"("asaas_customer_id");

CREATE TABLE "assinaturas" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "empresa_id" UUID NOT NULL,
  "plano_id" UUID NOT NULL,
  "ciclo" "CicloCobranca" NOT NULL DEFAULT 'MENSAL',
  "status" "StatusAssinatura" NOT NULL DEFAULT 'TRIAL',
  "valor_centavos" INTEGER NOT NULL,
  "asaas_subscription_id" TEXT,
  "inicio_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "proxima_cobranca_em" TIMESTAMP(3),
  "cancelada_em" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assinaturas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assinaturas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE,
  CONSTRAINT "assinaturas_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "planos"("id")
);
CREATE UNIQUE INDEX "assinaturas_asaas_subscription_id_key" ON "assinaturas"("asaas_subscription_id");
CREATE INDEX "assinaturas_empresa_id_idx" ON "assinaturas"("empresa_id");

CREATE TABLE "assinaturas_adicionais" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "assinatura_id" UUID NOT NULL,
  "adicional_id" UUID NOT NULL,
  "quantidade" INTEGER NOT NULL DEFAULT 1,
  "valor_centavos" INTEGER NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "contratado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assinaturas_adicionais_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assinaturas_adicionais_assinatura_id_fkey" FOREIGN KEY ("assinatura_id") REFERENCES "assinaturas"("id") ON DELETE CASCADE,
  CONSTRAINT "assinaturas_adicionais_adicional_id_fkey" FOREIGN KEY ("adicional_id") REFERENCES "adicionais"("id")
);
CREATE UNIQUE INDEX "assinaturas_adicionais_assinatura_id_adicional_id_key" ON "assinaturas_adicionais"("assinatura_id", "adicional_id");

CREATE TABLE "faturas" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "empresa_id" UUID NOT NULL,
  "assinatura_id" UUID,
  "descricao" TEXT NOT NULL,
  "valor_centavos" INTEGER NOT NULL,
  "status" "StatusFatura" NOT NULL DEFAULT 'PENDENTE',
  "metodo_pagamento" "MetodoPagamento" NOT NULL DEFAULT 'PIX',
  "asaas_payment_id" TEXT,
  "pix_qr_code_payload" TEXT,
  "pix_qr_code_base64" TEXT,
  "invoice_url" TEXT,
  "vencimento_em" TIMESTAMP(3) NOT NULL,
  "pago_em" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "faturas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "faturas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE,
  CONSTRAINT "faturas_assinatura_id_fkey" FOREIGN KEY ("assinatura_id") REFERENCES "assinaturas"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "faturas_asaas_payment_id_key" ON "faturas"("asaas_payment_id");
CREATE INDEX "faturas_empresa_id_status_idx" ON "faturas"("empresa_id", "status");

-- 3. USUÁRIOS, OBRAS, COLABORADORES E ASSINATURAS DIGITAIS
CREATE TABLE "usuarios" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "empresa_id" UUID,
  "nome" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "senha_hash" TEXT NOT NULL,
  "perfil" "PerfilUsuario" NOT NULL DEFAULT 'ADMIN_EMPRESA',
  "registro_profissional" TEXT,
  "cargo" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "ultimo_acesso_em" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "usuarios_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");
CREATE INDEX "usuarios_empresa_id_idx" ON "usuarios"("empresa_id");

CREATE TABLE "contratos_obras" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "empresa_id" UUID NOT NULL,
  "codigo" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "cliente_final" TEXT,
  "localizacao" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contratos_obras_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contratos_obras_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "contratos_obras_empresa_id_codigo_key" ON "contratos_obras"("empresa_id", "codigo");
CREATE INDEX "contratos_obras_empresa_id_idx" ON "contratos_obras"("empresa_id");

CREATE TABLE "colaboradores" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "empresa_id" UUID NOT NULL,
  "contrato_obra_id" UUID,
  "nome" TEXT NOT NULL,
  "cpf" TEXT NOT NULL,
  "rg" TEXT,
  "funcao" TEXT NOT NULL,
  "matricula" TEXT,
  "email" TEXT,
  "telefone" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "colaboradores_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "colaboradores_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE,
  CONSTRAINT "colaboradores_contrato_obra_id_fkey" FOREIGN KEY ("contrato_obra_id") REFERENCES "contratos_obras"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "colaboradores_empresa_id_cpf_key" ON "colaboradores"("empresa_id", "cpf");
CREATE INDEX "colaboradores_empresa_id_idx" ON "colaboradores"("empresa_id");

CREATE TABLE "assinaturas_digitais" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "empresa_id" UUID NOT NULL,
  "usuario_id" UUID,
  "tipo" TEXT NOT NULL,
  "nome_signatario" TEXT NOT NULL,
  "registro" TEXT,
  "imagem_data_url" TEXT NOT NULL,
  "ativa" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assinaturas_digitais_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assinaturas_digitais_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE,
  CONSTRAINT "assinaturas_digitais_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL
);
CREATE INDEX "assinaturas_digitais_empresa_id_idx" ON "assinaturas_digitais"("empresa_id");

-- 4. TREINAMENTOS (LINHA POR LINHA) E BANCO DE QUESTÕES
CREATE TABLE "treinamentos_empresa" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "empresa_id" UUID NOT NULL,
  "nr_codigo" TEXT NOT NULL,
  "nr_titulo" TEXT NOT NULL,
  "variacao_nome" TEXT NOT NULL,
  "modalidade" TEXT NOT NULL DEFAULT 'INICIAL',
  "carga_horaria_horas" INTEGER NOT NULL,
  "validade_meses" INTEGER NOT NULL DEFAULT 24,
  "nota_minima_aprovacao" INTEGER NOT NULL DEFAULT 70,
  "base_legal" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "treinamentos_empresa_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "treinamentos_empresa_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE
);
CREATE INDEX "treinamentos_empresa_empresa_id_nr_codigo_idx" ON "treinamentos_empresa"("empresa_id", "nr_codigo");

CREATE TABLE "treinamentos_conteudo_linhas" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "treinamento_id" UUID NOT NULL,
  "ordem" INTEGER NOT NULL,
  "descricao" TEXT NOT NULL,
  "carga_horaria_min" INTEGER,
  CONSTRAINT "treinamentos_conteudo_linhas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "treinamentos_conteudo_linhas_treinamento_id_fkey" FOREIGN KEY ("treinamento_id") REFERENCES "treinamentos_empresa"("id") ON DELETE CASCADE
);
CREATE INDEX "treinamentos_conteudo_linhas_treinamento_id_ordem_idx" ON "treinamentos_conteudo_linhas"("treinamento_id", "ordem");

CREATE TABLE "banco_questoes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "empresa_id" UUID NOT NULL,
  "treinamento_id" UUID NOT NULL,
  "enunciado" TEXT NOT NULL,
  "alternativas" JSONB NOT NULL,
  "correta" TEXT NOT NULL,
  "peso" INTEGER NOT NULL DEFAULT 1,
  "ativa" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "banco_questoes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "banco_questoes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE,
  CONSTRAINT "banco_questoes_treinamento_id_fkey" FOREIGN KEY ("treinamento_id") REFERENCES "treinamentos_empresa"("id") ON DELETE CASCADE
);
CREATE INDEX "banco_questoes_empresa_id_treinamento_id_idx" ON "banco_questoes"("empresa_id", "treinamento_id");

-- 5. TURMAS, PROVAS, CERTIFICADOS E CARTAS DE ANUÊNCIA
CREATE TABLE "turmas_aplicacoes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "empresa_id" UUID NOT NULL,
  "treinamento_id" UUID NOT NULL,
  "contrato_obra_id" UUID,
  "instrutor_id" UUID,
  "rt_id" UUID,
  "codigo_turma" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "data_realizacao" TIMESTAMP(3) NOT NULL,
  "local_realizacao" TEXT,
  "token_publico" TEXT NOT NULL,
  "modo_identificacao" "ModoIdentificacaoProva" NOT NULL DEFAULT 'CPF',
  "pin_acesso" TEXT,
  "status" "StatusTurma" NOT NULL DEFAULT 'ABERTA',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "turmas_aplicacoes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "turmas_aplicacoes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE,
  CONSTRAINT "turmas_aplicacoes_treinamento_id_fkey" FOREIGN KEY ("treinamento_id") REFERENCES "treinamentos_empresa"("id"),
  CONSTRAINT "turmas_aplicacoes_contrato_obra_id_fkey" FOREIGN KEY ("contrato_obra_id") REFERENCES "contratos_obras"("id") ON DELETE SET NULL,
  CONSTRAINT "turmas_aplicacoes_instrutor_id_fkey" FOREIGN KEY ("instrutor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL,
  CONSTRAINT "turmas_aplicacoes_rt_id_fkey" FOREIGN KEY ("rt_id") REFERENCES "usuarios"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "turmas_aplicacoes_token_publico_key" ON "turmas_aplicacoes"("token_publico");
CREATE INDEX "turmas_aplicacoes_empresa_id_status_idx" ON "turmas_aplicacoes"("empresa_id", "status");

CREATE TABLE "provas_tentativas" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "empresa_id" UUID NOT NULL,
  "turma_id" UUID NOT NULL,
  "colaborador_id" UUID NOT NULL,
  "respostas_json" JSONB NOT NULL,
  "nota_percentual" INTEGER NOT NULL,
  "status" "StatusTentativaProva" NOT NULL DEFAULT 'EM_ANDAMENTO',
  "assinatura_data_url" TEXT,
  "selfie_data_url" TEXT,
  "ip_origem" TEXT,
  "user_agent" TEXT,
  "iniciada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "concluida_em" TIMESTAMP(3),
  CONSTRAINT "provas_tentativas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "provas_tentativas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE,
  CONSTRAINT "provas_tentativas_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "turmas_aplicacoes"("id") ON DELETE CASCADE,
  CONSTRAINT "provas_tentativas_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaboradores"("id") ON DELETE CASCADE
);
CREATE INDEX "provas_tentativas_empresa_id_turma_id_idx" ON "provas_tentativas"("empresa_id", "turma_id");
CREATE INDEX "provas_tentativas_colaborador_id_idx" ON "provas_tentativas"("colaborador_id");

CREATE TABLE "certificados" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "empresa_id" UUID NOT NULL,
  "turma_id" UUID NOT NULL,
  "colaborador_id" UUID NOT NULL,
  "numero_certificado" TEXT NOT NULL,
  "codigo_validacao_qr" TEXT NOT NULL,
  "nr_codigo" TEXT NOT NULL,
  "treinamento_titulo" TEXT NOT NULL,
  "carga_horaria_horas" INTEGER NOT NULL,
  "data_realizacao" TIMESTAMP(3) NOT NULL,
  "data_validade" TIMESTAMP(3) NOT NULL,
  "status" "StatusCertificado" NOT NULL DEFAULT 'EMITIDO',
  "snapshot_conteudo_linhas" JSONB NOT NULL,
  "snapshot_empresa" JSONB NOT NULL,
  "snapshot_colaborador" JSONB NOT NULL,
  "emitido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "certificados_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "certificados_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE,
  CONSTRAINT "certificados_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "turmas_aplicacoes"("id"),
  CONSTRAINT "certificados_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaboradores"("id")
);
CREATE UNIQUE INDEX "certificados_codigo_validacao_qr_key" ON "certificados"("codigo_validacao_qr");
CREATE UNIQUE INDEX "certificados_empresa_id_numero_certificado_key" ON "certificados"("empresa_id", "numero_certificado");
CREATE INDEX "certificados_empresa_id_data_validade_idx" ON "certificados"("empresa_id", "data_validade");

CREATE TABLE "cartas_anuencia" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "empresa_id" UUID NOT NULL,
  "colaborador_id" UUID NOT NULL,
  "titulo" TEXT NOT NULL,
  "nr_referencia" TEXT NOT NULL,
  "texto_legal" TEXT NOT NULL,
  "assinatura_resp_url" TEXT,
  "emitida_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validade_em" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cartas_anuencia_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cartas_anuencia_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE,
  CONSTRAINT "cartas_anuencia_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaboradores"("id") ON DELETE CASCADE
);
CREATE INDEX "cartas_anuencia_empresa_id_colaborador_id_idx" ON "cartas_anuencia"("empresa_id", "colaborador_id");

-- 6. ANALYTICS E NOTIFICAÇÕES
CREATE TABLE "logs_acesso_analytics" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "empresa_id" UUID,
  "usuario_id" UUID,
  "sessao_id" TEXT NOT NULL,
  "rota" TEXT NOT NULL,
  "origem" TEXT NOT NULL DEFAULT 'SITE',
  "ip_hash" TEXT,
  "user_agent" TEXT,
  "ultimo_ping_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "logs_acesso_analytics_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "logs_acesso_analytics_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE SET NULL
);
CREATE INDEX "logs_acesso_analytics_ultimo_ping_em_idx" ON "logs_acesso_analytics"("ultimo_ping_em");
CREATE INDEX "logs_acesso_analytics_empresa_id_created_at_idx" ON "logs_acesso_analytics"("empresa_id", "created_at");

CREATE TABLE "notificacoes_admin" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tipo" "TipoNotificacaoAdmin" NOT NULL,
  "titulo" TEXT NOT NULL,
  "mensagem" TEXT NOT NULL,
  "empresa_id" UUID,
  "lida" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notificacoes_admin_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notificacoes_admin_lida_created_at_idx" ON "notificacoes_admin"("lida", "created_at");
