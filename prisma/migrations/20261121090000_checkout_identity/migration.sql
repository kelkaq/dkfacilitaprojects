ALTER TABLE "pedidos"
  ADD COLUMN "razao_social" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "nome_administrador" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "whatsapp" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "checkout_lock_until" TIMESTAMP(3);

ALTER TABLE "pedidos"
  ALTER COLUMN "razao_social" DROP DEFAULT,
  ALTER COLUMN "nome_administrador" DROP DEFAULT,
  ALTER COLUMN "whatsapp" DROP DEFAULT;
