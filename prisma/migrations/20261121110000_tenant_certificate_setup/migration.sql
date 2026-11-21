ALTER TABLE "empresas"
  ADD COLUMN "assinaturas_certificado" JSONB NOT NULL DEFAULT '[]'::jsonb;
