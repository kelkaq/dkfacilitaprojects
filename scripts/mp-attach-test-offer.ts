import fs from 'node:fs';
import { getPrisma } from '../server/lib/prisma.ts';

const file = process.env.CSDK_TEST_PLAN_OUTPUT;
if (!process.env.DATABASE_URL || !file?.startsWith('/etc/dk/csdk/')) throw new Error('Ambiente de homologação ausente.');
const { id } = JSON.parse(fs.readFileSync(file, 'utf8')) as { id?: string };
if (!id || !/^[a-zA-Z0-9_-]{8,128}$/.test(id)) throw new Error('ID de plano Mercado Pago inválido.');
const db = getPrisma();
try {
  const plan = await db.plano.upsert({
    where: { slug: 'csdk-homologacao' },
    create: {
      slug: 'csdk-homologacao', nome: 'Homologação CSDK', subtitulo: 'Somente teste interno',
      descricao: 'Plano inativo para testar a integração.', precoMensalCentavos: 1000,
      limiteColaboradores: 1, limiteUsuarios: 1, limiteObras: 1, ativo: false,
    },
    update: { ativo: false },
  });
  await db.planoOferta.upsert({
    where: { mercadoPagoPlanId: id },
    create: { planoId: plan.id, ciclo: 'MENSAL', ambiente: 'TEST', trialDias: 7, totalCentavos: 1000, mercadoPagoPlanId: id, ativa: false },
    update: { ativa: false },
  });
  process.stdout.write('Oferta TEST vinculada a plano interno inativo; sem venda pública.\n');
} finally {
  await db.$disconnect();
}
