CREATE TYPE "CategoriaComunicado" AS ENUM ('INFORMATIVO', 'MANUTENCAO', 'NOVIDADE', 'URGENTE');
CREATE TYPE "PublicoComunicado" AS ENUM ('TODAS', 'ATIVAS', 'TRIAL', 'PLANO_ESPECIFICO', 'PERFIL', 'EMPRESAS', 'USUARIOS');
CREATE TYPE "RepeticaoComunicado" AS ENUM ('UNICO', 'DIARIO', 'SEMANAL', 'MENSAL');
CREATE TYPE "StatusComunicado" AS ENUM ('RASCUNHO', 'AGENDADO', 'ATIVO', 'PAUSADO', 'ENCERRADO');

CREATE TABLE "comunicados_plataforma" (
  "id" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "mensagem" TEXT NOT NULL,
  "categoria" "CategoriaComunicado" NOT NULL DEFAULT 'INFORMATIVO',
  "exibir_popup" BOOLEAN NOT NULL DEFAULT false,
  "exigir_confirmacao" BOOLEAN NOT NULL DEFAULT false,
  "link" TEXT,
  "publico_alvo" "PublicoComunicado" NOT NULL DEFAULT 'TODAS',
  "plano_alvo_slug" TEXT,
  "perfil_alvo" "PerfilUsuario",
  "empresa_ids" JSONB NOT NULL DEFAULT '[]',
  "usuario_ids" JSONB NOT NULL DEFAULT '[]',
  "inicio_em" TIMESTAMP(3) NOT NULL,
  "fim_em" TIMESTAMP(3),
  "fuso_horario" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  "repeticao" "RepeticaoComunicado" NOT NULL DEFAULT 'UNICO',
  "status" "StatusComunicado" NOT NULL DEFAULT 'RASCUNHO',
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "comunicados_plataforma_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "entregas_comunicados" (
  "id" TEXT NOT NULL,
  "comunicado_id" TEXT NOT NULL,
  "ocorrencia_key" TEXT NOT NULL,
  "usuario_id" TEXT NOT NULL,
  "empresa_id" TEXT NOT NULL,
  "exibida_em" TIMESTAMP(3),
  "lida_em" TIMESTAMP(3),
  "dispensada_em" TIMESTAMP(3),
  "confirmada_em" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entregas_comunicados_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "comunicados_plataforma_status_inicio_em_fim_em_idx" ON "comunicados_plataforma"("status", "inicio_em", "fim_em");
CREATE INDEX "comunicados_plataforma_publico_alvo_status_idx" ON "comunicados_plataforma"("publico_alvo", "status");
CREATE UNIQUE INDEX "entregas_comunicados_comunicado_id_ocorrencia_key_usuario_id_key" ON "entregas_comunicados"("comunicado_id", "ocorrencia_key", "usuario_id");
CREATE INDEX "entregas_comunicados_usuario_id_created_at_idx" ON "entregas_comunicados"("usuario_id", "created_at");
CREATE INDEX "entregas_comunicados_empresa_id_created_at_idx" ON "entregas_comunicados"("empresa_id", "created_at");
CREATE INDEX "entregas_comunicados_comunicado_id_ocorrencia_key_idx" ON "entregas_comunicados"("comunicado_id", "ocorrencia_key");

ALTER TABLE "comunicados_plataforma" ADD CONSTRAINT "comunicados_plataforma_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "entregas_comunicados" ADD CONSTRAINT "entregas_comunicados_comunicado_id_fkey" FOREIGN KEY ("comunicado_id") REFERENCES "comunicados_plataforma"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "entregas_comunicados" ADD CONSTRAINT "entregas_comunicados_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "entregas_comunicados" ADD CONSTRAINT "entregas_comunicados_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
