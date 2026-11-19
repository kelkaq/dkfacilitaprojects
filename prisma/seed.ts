// ============================================================================
// DK FACILITA — CERTIFICA SOFTWARE - DK
// Seed Real Idempotente (PostgreSQL + Prisma)
// Execução: npx tsx prisma/seed.ts
// ============================================================================

import { PrismaClient } from '@prisma/client';
import {
  PLANOS_GLOBAIS_SEED,
  ADICIONAIS_GLOBAIS_SEED,
  MODELOS_CERTIFICADO_GLOBAIS_SEED,
  NRS_GLOBAIS_SEED,
} from '../src/data/globalCatalogSeed.ts';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando seed real do catálogo global DK Facilita — Certifica Software - DK...');

  // 1. Planos comerciais (Autônomo/TST, Essencial, Profissional, Enterprise)
  for (const plano of PLANOS_GLOBAIS_SEED) {
    await prisma.plano.upsert({
      where: { slug: plano.slug },
      update: {
        nome: plano.nome,
        subtitulo: plano.subtitulo,
        descricao: plano.descricao,
        precoMensalCentavos: plano.precoMensalCentavos,
        descontoSemestral: plano.descontoSemestral,
        descontoAnual: plano.descontoAnual,
        limiteColaboradores: plano.limiteColaboradores,
        limiteUsuarios: plano.limiteUsuarios,
        limiteObras: plano.limiteObras,
        incluiCartaAnuencia: plano.incluiCartaAnuencia,
        incluiDossieLink: plano.incluiDossieLink,
        incluiAlertasWpp: plano.incluiAlertasWpp,
        incluiDominioProprio: plano.incluiDominioProprio,
        destaque: plano.destaque,
        ativo: plano.ativo,
        ordem: plano.ordem,
      },
      create: {
        slug: plano.slug,
        nome: plano.nome,
        subtitulo: plano.subtitulo,
        descricao: plano.descricao,
        precoMensalCentavos: plano.precoMensalCentavos,
        descontoSemestral: plano.descontoSemestral,
        descontoAnual: plano.descontoAnual,
        limiteColaboradores: plano.limiteColaboradores,
        limiteUsuarios: plano.limiteUsuarios,
        limiteObras: plano.limiteObras,
        incluiCartaAnuencia: plano.incluiCartaAnuencia,
        incluiDossieLink: plano.incluiDossieLink,
        incluiAlertasWpp: plano.incluiAlertasWpp,
        incluiDominioProprio: plano.incluiDominioProprio,
        destaque: plano.destaque,
        ativo: plano.ativo,
        ordem: plano.ordem,
      },
    });
  }
  console.log(`✔ ${PLANOS_GLOBAIS_SEED.length} planos sincronizados.`);

  // 2. Serviços adicionais comerciais
  for (const adicional of ADICIONAIS_GLOBAIS_SEED) {
    await prisma.adicional.upsert({
      where: { slug: adicional.slug },
      update: {
        nome: adicional.nome,
        descricao: adicional.descricao,
        precoMensalCentavos: adicional.precoMensalCentavos,
        tipoCobranca: adicional.tipoCobranca,
        recursoChave: adicional.recursoChave,
        incrementoQtd: adicional.incrementoQtd,
        ativo: adicional.ativo,
        ordem: adicional.ordem,
      },
      create: {
        slug: adicional.slug,
        nome: adicional.nome,
        descricao: adicional.descricao,
        precoMensalCentavos: adicional.precoMensalCentavos,
        tipoCobranca: adicional.tipoCobranca,
        recursoChave: adicional.recursoChave,
        incrementoQtd: adicional.incrementoQtd,
        ativo: adicional.ativo,
        ordem: adicional.ordem,
      },
    });
  }
  console.log(`✔ ${ADICIONAIS_GLOBAIS_SEED.length} adicionais comerciais sincronizados.`);

  // 3. Modelos gratuitos neutros de certificado
  for (const modelo of MODELOS_CERTIFICADO_GLOBAIS_SEED) {
    await prisma.modeloCertificadoGlobal.upsert({
      where: { slug: modelo.slug },
      update: {
        nome: modelo.nome,
        descricao: modelo.descricao,
        categoria: modelo.categoria,
        layoutConfig: modelo.layoutConfig,
        previewCssToken: modelo.previewCssToken,
        ativo: modelo.ativo,
        ordem: modelo.ordem,
      },
      create: {
        slug: modelo.slug,
        nome: modelo.nome,
        descricao: modelo.descricao,
        categoria: modelo.categoria,
        layoutConfig: modelo.layoutConfig,
        previewCssToken: modelo.previewCssToken,
        ativo: modelo.ativo,
        ordem: modelo.ordem,
      },
    });
  }
  console.log(`✔ ${MODELOS_CERTIFICADO_GLOBAIS_SEED.length} modelos gratuitos de certificado sincronizados.`);

  // 4. Catálogo Global de NRs + Variações + Linhas de Conteúdo Programático
  let totalVariacoes = 0;
  let totalLinhas = 0;

  for (const nr of NRS_GLOBAIS_SEED) {
    const nrRecord = await prisma.nrGlobal.upsert({
      where: { codigo: nr.codigo },
      update: {
        titulo: nr.titulo,
        descricao: nr.descricao,
        baseLegal: nr.baseLegal,
        validadePadraoMeses: nr.validadePadraoMeses,
        ativa: nr.ativa,
        ordem: nr.ordem,
      },
      create: {
        codigo: nr.codigo,
        titulo: nr.titulo,
        descricao: nr.descricao,
        baseLegal: nr.baseLegal,
        validadePadraoMeses: nr.validadePadraoMeses,
        ativa: nr.ativa,
        ordem: nr.ordem,
      },
    });

    for (const variacao of nr.variacoes) {
      totalVariacoes += 1;
      const variacaoRecord = await prisma.nrGlobalVariacao.upsert({
        where: { slug: variacao.slug },
        update: {
          nrGlobalId: nrRecord.id,
          nome: variacao.nome,
          modalidade: variacao.modalidade,
          cargaHorariaHoras: variacao.cargaHorariaHoras,
          validadeMeses: variacao.validadeMeses,
          notaMinimaAprovacao: variacao.notaMinimaAprovacao,
          ordem: variacao.ordem,
        },
        create: {
          nrGlobalId: nrRecord.id,
          slug: variacao.slug,
          nome: variacao.nome,
          modalidade: variacao.modalidade,
          cargaHorariaHoras: variacao.cargaHorariaHoras,
          validadeMeses: variacao.validadeMeses,
          notaMinimaAprovacao: variacao.notaMinimaAprovacao,
          ordem: variacao.ordem,
        },
      });

      // Substituição idempotente das linhas de conteúdo programático da variação
      await prisma.nrGlobalConteudoLinha.deleteMany({
        where: { variacaoId: variacaoRecord.id },
      });

      await prisma.nrGlobalConteudoLinha.createMany({
        data: variacao.linhas.map((linha) => ({
          variacaoId: variacaoRecord.id,
          ordem: linha.ordem,
          descricao: linha.descricao,
          cargaHorariaMin: linha.cargaHorariaMin,
        })),
      });

      totalLinhas += variacao.linhas.length;
    }
  }

  console.log(
    `✔ ${NRS_GLOBAIS_SEED.length} NRs globais, ${totalVariacoes} variações e ${totalLinhas} linhas de conteúdo programático sincronizadas.`
  );
}

main()
  .catch((error) => {
    console.error('Erro ao executar seed Prisma:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
