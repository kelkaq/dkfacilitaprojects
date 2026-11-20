ALTER TABLE "faturas" ADD COLUMN "mercado_pago_authorized_payment_id" TEXT;
CREATE UNIQUE INDEX "faturas_mercado_pago_authorized_payment_id_key" ON "faturas"("mercado_pago_authorized_payment_id");
