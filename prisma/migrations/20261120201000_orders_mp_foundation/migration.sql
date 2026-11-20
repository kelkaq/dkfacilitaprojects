-- CreateEnum
CREATE TYPE "StatusPedido" AS ENUM ('CARRINHO', 'AGUARDANDO_DADOS', 'AGUARDANDO_CARTAO', 'AGUARDANDO_PAGAMENTO', 'TRIAL_ATIVO', 'ASSINATURA_ATIVA', 'PAGAMENTO_RECUSADO', 'CANCELADO', 'EXPIRADO');

-- AlterTable
ALTER TABLE "assinaturas" ADD COLUMN     "condicoes_snapshot" JSONB,
ADD COLUMN     "mercado_pago_id" TEXT;

-- CreateTable
CREATE TABLE "pedidos" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT,
    "plano_id" TEXT NOT NULL,
    "tipo_documento" "TipoDocumento" NOT NULL,
    "documento" TEXT NOT NULL,
    "email_comprador" TEXT NOT NULL,
    "ciclo" "CicloCobranca" NOT NULL,
    "status" "StatusPedido" NOT NULL DEFAULT 'CARRINHO',
    "preco_snapshot" JSONB NOT NULL,
    "total_centavos" INTEGER NOT NULL,
    "cupom_codigo" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "external_reference" TEXT NOT NULL,
    "mercado_pago_id" TEXT,
    "expira_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usos_trial" (
    "documento" TEXT NOT NULL,
    "tipo_documento" "TipoDocumento" NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "ativado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usos_trial_pkey" PRIMARY KEY ("documento")
);

-- CreateTable
CREATE TABLE "pagamento_eventos" (
    "id" TEXT NOT NULL,
    "provedor_evento_id" TEXT NOT NULL,
    "topico" TEXT NOT NULL,
    "recurso_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEBIDO',
    "recebido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processado_em" TIMESTAMP(3),

    CONSTRAINT "pagamento_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_idempotency_key_key" ON "pedidos"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_external_reference_key" ON "pedidos"("external_reference");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_mercado_pago_id_key" ON "pedidos"("mercado_pago_id");

-- CreateIndex
CREATE INDEX "pedidos_documento_created_at_idx" ON "pedidos"("documento", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pagamento_eventos_provedor_evento_id_key" ON "pagamento_eventos"("provedor_evento_id");

-- CreateIndex
CREATE INDEX "pagamento_eventos_topico_recurso_id_idx" ON "pagamento_eventos"("topico", "recurso_id");

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_mercado_pago_id_key" ON "assinaturas"("mercado_pago_id");

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "planos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
