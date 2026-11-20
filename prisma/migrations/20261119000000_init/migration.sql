-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CicloCobranca" AS ENUM ('MENSAL', 'SEMESTRAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('PF', 'PJ');

-- CreateEnum
CREATE TYPE "StatusEmpresa" AS ENUM ('TRIAL', 'ATIVA', 'INADIMPLENTE', 'SUSPENSA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusAssinatura" AS ENUM ('TRIAL', 'ATIVA', 'ATRASADA', 'SUSPENSA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusFatura" AS ENUM ('PENDENTE', 'PAGA', 'VENCIDA', 'CANCELADA', 'ESTORNADA');

-- CreateEnum
CREATE TYPE "MetodoPagamento" AS ENUM ('PIX', 'CARTAO_CREDITO', 'BOLETO');

-- CreateEnum
CREATE TYPE "PerfilUsuario" AS ENUM ('SUPER_ADMIN', 'ADMIN_EMPRESA', 'RT', 'INSTRUTOR_TST');

-- CreateEnum
CREATE TYPE "ModoIdentificacaoProva" AS ENUM ('CPF', 'CPF_PIN', 'CPF_PIN_SELFIE');

-- CreateEnum
CREATE TYPE "StatusTurma" AS ENUM ('RASCUNHO', 'ABERTA', 'ENCERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusTentativaProva" AS ENUM ('EM_ANDAMENTO', 'APROVADO', 'REPROVADO');

-- CreateEnum
CREATE TYPE "StatusCertificado" AS ENUM ('EMITIDO', 'REVOGADO');

-- CreateEnum
CREATE TYPE "TipoNotificacaoAdmin" AS ENUM ('NOVO_TRIAL', 'NOVA_VENDA', 'UPGRADE', 'ADICIONAL_CONTRATADO', 'PAGAMENTO_ATRASADO', 'TRIAL_EXPIRANDO');

-- CreateTable
CREATE TABLE "planos" (
    "id" TEXT NOT NULL,
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
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adicionais" (
    "id" TEXT NOT NULL,
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
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adicionais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nrs_globais" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "base_legal" TEXT NOT NULL,
    "validade_padrao_meses" INTEGER NOT NULL DEFAULT 24,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nrs_globais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nrs_globais_variacoes" (
    "id" TEXT NOT NULL,
    "nr_global_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "modalidade" TEXT NOT NULL DEFAULT 'INICIAL',
    "carga_horaria_horas" INTEGER NOT NULL,
    "validade_meses" INTEGER NOT NULL,
    "nota_minima_aprovacao" INTEGER NOT NULL DEFAULT 70,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nrs_globais_variacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nrs_globais_conteudo_linhas" (
    "id" TEXT NOT NULL,
    "variacao_id" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "carga_horaria_min" INTEGER,

    CONSTRAINT "nrs_globais_conteudo_linhas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelos_certificado_globais" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'GRATUITO',
    "layout_config" JSONB NOT NULL,
    "preview_css_token" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modelos_certificado_globais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "tipo_documento" "TipoDocumento" NOT NULL,
    "documento" TEXT NOT NULL,
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
    "modelo_certificado_id" TEXT,
    "modelo_proprio_url" TEXT,
    "modelo_proprio_config" JSONB,
    "dominio_proprio" TEXT,
    "status" "StatusEmpresa" NOT NULL DEFAULT 'TRIAL',
    "trial_expira_em" TIMESTAMP(3),
    "onboarding_concluido" BOOLEAN NOT NULL DEFAULT false,
    "asaas_customer_id" TEXT,
    "feature_flags" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assinaturas" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "plano_id" TEXT NOT NULL,
    "ciclo" "CicloCobranca" NOT NULL DEFAULT 'MENSAL',
    "status" "StatusAssinatura" NOT NULL DEFAULT 'TRIAL',
    "valor_centavos" INTEGER NOT NULL,
    "asaas_subscription_id" TEXT,
    "inicio_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proxima_cobranca_em" TIMESTAMP(3),
    "cancelada_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assinaturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assinaturas_adicionais" (
    "id" TEXT NOT NULL,
    "assinatura_id" TEXT NOT NULL,
    "adicional_id" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "valor_centavos" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "contratado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assinaturas_adicionais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faturas" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "assinatura_id" TEXT,
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
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "perfil" "PerfilUsuario" NOT NULL DEFAULT 'ADMIN_EMPRESA',
    "registro_profissional" TEXT,
    "cargo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "versao_sessao" INTEGER NOT NULL DEFAULT 0,
    "ultimo_acesso_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "convites_usuario" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "perfil" "PerfilUsuario" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "criado_por_id" TEXT NOT NULL,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "aceito_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "convites_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recuperacoes_senha" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "usado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recuperacoes_senha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria_acesso" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT,
    "empresa_id" TEXT,
    "acao" TEXT NOT NULL,
    "detalhes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_acesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contratos_obras" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cliente_final" TEXT,
    "localizacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contratos_obras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colaboradores" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "contrato_obra_id" TEXT,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "rg" TEXT,
    "funcao" TEXT NOT NULL,
    "matricula" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colaboradores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assinaturas_digitais" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "usuario_id" TEXT,
    "tipo" TEXT NOT NULL,
    "nome_signatario" TEXT NOT NULL,
    "registro" TEXT,
    "imagem_data_url" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assinaturas_digitais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treinamentos_empresa" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
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
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treinamentos_empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treinamentos_conteudo_linhas" (
    "id" TEXT NOT NULL,
    "treinamento_id" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "carga_horaria_min" INTEGER,

    CONSTRAINT "treinamentos_conteudo_linhas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banco_questoes" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "treinamento_id" TEXT NOT NULL,
    "enunciado" TEXT NOT NULL,
    "alternativas" JSONB NOT NULL,
    "correta" TEXT NOT NULL,
    "peso" INTEGER NOT NULL DEFAULT 1,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banco_questoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turmas_aplicacoes" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "treinamento_id" TEXT NOT NULL,
    "contrato_obra_id" TEXT,
    "instrutor_id" TEXT,
    "rt_id" TEXT,
    "codigo_turma" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "data_realizacao" TIMESTAMP(3) NOT NULL,
    "local_realizacao" TEXT,
    "token_publico" TEXT NOT NULL,
    "modo_identificacao" "ModoIdentificacaoProva" NOT NULL DEFAULT 'CPF',
    "pin_acesso" TEXT,
    "status" "StatusTurma" NOT NULL DEFAULT 'ABERTA',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "turmas_aplicacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provas_tentativas" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "turma_id" TEXT NOT NULL,
    "colaborador_id" TEXT NOT NULL,
    "respostas_json" JSONB NOT NULL,
    "nota_percentual" INTEGER NOT NULL,
    "status" "StatusTentativaProva" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "assinatura_data_url" TEXT,
    "selfie_data_url" TEXT,
    "ip_origem" TEXT,
    "user_agent" TEXT,
    "iniciada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluida_em" TIMESTAMP(3),

    CONSTRAINT "provas_tentativas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificados" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "turma_id" TEXT NOT NULL,
    "colaborador_id" TEXT NOT NULL,
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

    CONSTRAINT "certificados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cartas_anuencia" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "colaborador_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "nr_referencia" TEXT NOT NULL,
    "texto_legal" TEXT NOT NULL,
    "assinatura_resp_url" TEXT,
    "emitida_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validade_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cartas_anuencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs_acesso_analytics" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT,
    "usuario_id" TEXT,
    "sessao_id" TEXT NOT NULL,
    "rota" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'SITE',
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "ultimo_ping_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_acesso_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes_admin" (
    "id" TEXT NOT NULL,
    "tipo" "TipoNotificacaoAdmin" NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "empresa_id" TEXT,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_admin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planos_slug_key" ON "planos"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "adicionais_slug_key" ON "adicionais"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "nrs_globais_codigo_key" ON "nrs_globais"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "nrs_globais_variacoes_slug_key" ON "nrs_globais_variacoes"("slug");

-- CreateIndex
CREATE INDEX "nrs_globais_variacoes_nr_global_id_idx" ON "nrs_globais_variacoes"("nr_global_id");

-- CreateIndex
CREATE INDEX "nrs_globais_conteudo_linhas_variacao_id_ordem_idx" ON "nrs_globais_conteudo_linhas"("variacao_id", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "modelos_certificado_globais_slug_key" ON "modelos_certificado_globais"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "empresas_documento_key" ON "empresas"("documento");

-- CreateIndex
CREATE UNIQUE INDEX "empresas_dominio_proprio_key" ON "empresas"("dominio_proprio");

-- CreateIndex
CREATE UNIQUE INDEX "empresas_asaas_customer_id_key" ON "empresas"("asaas_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_asaas_subscription_id_key" ON "assinaturas"("asaas_subscription_id");

-- CreateIndex
CREATE INDEX "assinaturas_empresa_id_idx" ON "assinaturas"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_adicionais_assinatura_id_adicional_id_key" ON "assinaturas_adicionais"("assinatura_id", "adicional_id");

-- CreateIndex
CREATE UNIQUE INDEX "faturas_asaas_payment_id_key" ON "faturas"("asaas_payment_id");

-- CreateIndex
CREATE INDEX "faturas_empresa_id_status_idx" ON "faturas"("empresa_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_empresa_id_idx" ON "usuarios"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "convites_usuario_token_hash_key" ON "convites_usuario"("token_hash");

-- CreateIndex
CREATE INDEX "convites_usuario_empresa_id_email_idx" ON "convites_usuario"("empresa_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "recuperacoes_senha_token_hash_key" ON "recuperacoes_senha"("token_hash");

-- CreateIndex
CREATE INDEX "recuperacoes_senha_usuario_id_idx" ON "recuperacoes_senha"("usuario_id");

-- CreateIndex
CREATE INDEX "auditoria_acesso_empresa_id_created_at_idx" ON "auditoria_acesso"("empresa_id", "created_at");

-- CreateIndex
CREATE INDEX "contratos_obras_empresa_id_idx" ON "contratos_obras"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_obras_empresa_id_codigo_key" ON "contratos_obras"("empresa_id", "codigo");

-- CreateIndex
CREATE INDEX "colaboradores_empresa_id_idx" ON "colaboradores"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "colaboradores_empresa_id_cpf_key" ON "colaboradores"("empresa_id", "cpf");

-- CreateIndex
CREATE INDEX "assinaturas_digitais_empresa_id_idx" ON "assinaturas_digitais"("empresa_id");

-- CreateIndex
CREATE INDEX "treinamentos_empresa_empresa_id_nr_codigo_idx" ON "treinamentos_empresa"("empresa_id", "nr_codigo");

-- CreateIndex
CREATE INDEX "treinamentos_conteudo_linhas_treinamento_id_ordem_idx" ON "treinamentos_conteudo_linhas"("treinamento_id", "ordem");

-- CreateIndex
CREATE INDEX "banco_questoes_empresa_id_treinamento_id_idx" ON "banco_questoes"("empresa_id", "treinamento_id");

-- CreateIndex
CREATE UNIQUE INDEX "turmas_aplicacoes_token_publico_key" ON "turmas_aplicacoes"("token_publico");

-- CreateIndex
CREATE INDEX "turmas_aplicacoes_empresa_id_status_idx" ON "turmas_aplicacoes"("empresa_id", "status");

-- CreateIndex
CREATE INDEX "provas_tentativas_empresa_id_turma_id_idx" ON "provas_tentativas"("empresa_id", "turma_id");

-- CreateIndex
CREATE INDEX "provas_tentativas_colaborador_id_idx" ON "provas_tentativas"("colaborador_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificados_codigo_validacao_qr_key" ON "certificados"("codigo_validacao_qr");

-- CreateIndex
CREATE INDEX "certificados_empresa_id_data_validade_idx" ON "certificados"("empresa_id", "data_validade");

-- CreateIndex
CREATE UNIQUE INDEX "certificados_empresa_id_numero_certificado_key" ON "certificados"("empresa_id", "numero_certificado");

-- CreateIndex
CREATE INDEX "cartas_anuencia_empresa_id_colaborador_id_idx" ON "cartas_anuencia"("empresa_id", "colaborador_id");

-- CreateIndex
CREATE INDEX "logs_acesso_analytics_ultimo_ping_em_idx" ON "logs_acesso_analytics"("ultimo_ping_em");

-- CreateIndex
CREATE INDEX "logs_acesso_analytics_empresa_id_created_at_idx" ON "logs_acesso_analytics"("empresa_id", "created_at");

-- CreateIndex
CREATE INDEX "notificacoes_admin_lida_created_at_idx" ON "notificacoes_admin"("lida", "created_at");

-- AddForeignKey
ALTER TABLE "nrs_globais_variacoes" ADD CONSTRAINT "nrs_globais_variacoes_nr_global_id_fkey" FOREIGN KEY ("nr_global_id") REFERENCES "nrs_globais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nrs_globais_conteudo_linhas" ADD CONSTRAINT "nrs_globais_conteudo_linhas_variacao_id_fkey" FOREIGN KEY ("variacao_id") REFERENCES "nrs_globais_variacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_modelo_certificado_id_fkey" FOREIGN KEY ("modelo_certificado_id") REFERENCES "modelos_certificado_globais"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "planos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas_adicionais" ADD CONSTRAINT "assinaturas_adicionais_assinatura_id_fkey" FOREIGN KEY ("assinatura_id") REFERENCES "assinaturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas_adicionais" ADD CONSTRAINT "assinaturas_adicionais_adicional_id_fkey" FOREIGN KEY ("adicional_id") REFERENCES "adicionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faturas" ADD CONSTRAINT "faturas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faturas" ADD CONSTRAINT "faturas_assinatura_id_fkey" FOREIGN KEY ("assinatura_id") REFERENCES "assinaturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convites_usuario" ADD CONSTRAINT "convites_usuario_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convites_usuario" ADD CONSTRAINT "convites_usuario_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recuperacoes_senha" ADD CONSTRAINT "recuperacoes_senha_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_acesso" ADD CONSTRAINT "auditoria_acesso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos_obras" ADD CONSTRAINT "contratos_obras_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_contrato_obra_id_fkey" FOREIGN KEY ("contrato_obra_id") REFERENCES "contratos_obras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas_digitais" ADD CONSTRAINT "assinaturas_digitais_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas_digitais" ADD CONSTRAINT "assinaturas_digitais_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treinamentos_empresa" ADD CONSTRAINT "treinamentos_empresa_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treinamentos_conteudo_linhas" ADD CONSTRAINT "treinamentos_conteudo_linhas_treinamento_id_fkey" FOREIGN KEY ("treinamento_id") REFERENCES "treinamentos_empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banco_questoes" ADD CONSTRAINT "banco_questoes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banco_questoes" ADD CONSTRAINT "banco_questoes_treinamento_id_fkey" FOREIGN KEY ("treinamento_id") REFERENCES "treinamentos_empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turmas_aplicacoes" ADD CONSTRAINT "turmas_aplicacoes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turmas_aplicacoes" ADD CONSTRAINT "turmas_aplicacoes_treinamento_id_fkey" FOREIGN KEY ("treinamento_id") REFERENCES "treinamentos_empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turmas_aplicacoes" ADD CONSTRAINT "turmas_aplicacoes_contrato_obra_id_fkey" FOREIGN KEY ("contrato_obra_id") REFERENCES "contratos_obras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turmas_aplicacoes" ADD CONSTRAINT "turmas_aplicacoes_instrutor_id_fkey" FOREIGN KEY ("instrutor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turmas_aplicacoes" ADD CONSTRAINT "turmas_aplicacoes_rt_id_fkey" FOREIGN KEY ("rt_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provas_tentativas" ADD CONSTRAINT "provas_tentativas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provas_tentativas" ADD CONSTRAINT "provas_tentativas_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "turmas_aplicacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provas_tentativas" ADD CONSTRAINT "provas_tentativas_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaboradores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificados" ADD CONSTRAINT "certificados_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificados" ADD CONSTRAINT "certificados_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "turmas_aplicacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificados" ADD CONSTRAINT "certificados_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaboradores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cartas_anuencia" ADD CONSTRAINT "cartas_anuencia_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cartas_anuencia" ADD CONSTRAINT "cartas_anuencia_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaboradores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs_acesso_analytics" ADD CONSTRAINT "logs_acesso_analytics_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
