-- CreateEnum
CREATE TYPE "AmbientePagamento" AS ENUM ('TEST', 'PRODUCTION');

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "oferta_id" TEXT;

-- CreateTable
CREATE TABLE "plano_ofertas" (
    "id" TEXT NOT NULL,
    "plano_id" TEXT NOT NULL,
    "ciclo" "CicloCobranca" NOT NULL,
    "ambiente" "AmbientePagamento" NOT NULL,
    "trial_dias" INTEGER NOT NULL DEFAULT 0,
    "total_centavos" INTEGER NOT NULL,
    "mercado_pago_plan_id" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plano_ofertas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plano_ofertas_mercado_pago_plan_id_key" ON "plano_ofertas"("mercado_pago_plan_id");

-- CreateIndex
CREATE INDEX "plano_ofertas_plano_id_ciclo_ambiente_ativa_idx" ON "plano_ofertas"("plano_id", "ciclo", "ambiente", "ativa");

-- AddForeignKey
ALTER TABLE "plano_ofertas" ADD CONSTRAINT "plano_ofertas_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "planos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "plano_ofertas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
