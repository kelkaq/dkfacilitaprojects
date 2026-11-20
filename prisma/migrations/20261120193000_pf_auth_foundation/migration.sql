-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('PF', 'PJ');

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN "documento" TEXT,
ADD COLUMN "tipo_documento" "TipoDocumento" NOT NULL DEFAULT 'PJ';

-- Preserve existing legal identities before removing the legacy column.
UPDATE "empresas" SET "documento" = regexp_replace("cnpj", '[^0-9]', '', 'g');
ALTER TABLE "empresas" ALTER COLUMN "documento" SET NOT NULL;
DROP INDEX "empresas_cnpj_key";
ALTER TABLE "empresas" DROP COLUMN "cnpj";

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "versao_sessao" INTEGER NOT NULL DEFAULT 0;

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
CREATE UNIQUE INDEX "empresas_documento_key" ON "empresas"("documento");

-- AddForeignKey
ALTER TABLE "convites_usuario" ADD CONSTRAINT "convites_usuario_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convites_usuario" ADD CONSTRAINT "convites_usuario_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recuperacoes_senha" ADD CONSTRAINT "recuperacoes_senha_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_acesso" ADD CONSTRAINT "auditoria_acesso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
