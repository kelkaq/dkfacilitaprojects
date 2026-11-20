import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { apiRouter } from '../server/routes/apiRoutes.ts';
import { getPrisma } from '../server/lib/prisma.ts';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatória.');
const db = getPrisma();
const suffix = crypto.randomBytes(6).toString('hex');
const slug = `smoke-${suffix}`;
const app = express();
app.use(express.json());
app.use(apiRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Falha HTTP.');
const url = `http://127.0.0.1:${address.port}/api/public/orders`;

let planId: string | null = null;
try {
  const plan = await db.plano.create({ data: {
    slug, nome: 'Teste', subtitulo: 'Teste', descricao: 'Somente teste',
    precoMensalCentavos: 10000, descontoSemestral: 10, descontoAnual: 20,
    limiteColaboradores: 1, limiteUsuarios: 1, limiteObras: 1,
  } });
  planId = plan.id;
  const key = crypto.randomUUID();
  const body = { tipoDocumento: 'PF', documento: '529.982.247-25', emailComprador: `smoke-${suffix}@example.invalid`, planoSlug: slug, ciclo: 'SEMESTRAL' };
  const post = (payload: unknown, idempotencyKey: string) => fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-idempotency-key': idempotencyKey }, body: JSON.stringify(payload),
  });
  const first = await post(body, key);
  assert.equal(first.status, 201);
  const created = await first.json() as { id: string; status: string; totalCentavos: number };
  assert.equal(created.totalCentavos, 54000);
  assert.equal(created.status, 'CARRINHO');
  const repeated = await post(body, key);
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json() as { id: string }).id, created.id);
  assert.equal((await post({ ...body, documento: '11.222.333/0001-81', tipoDocumento: 'PJ' }, key)).status, 409);
  assert.equal((await post({ ...body, documento: '529.982.247-24' }, crypto.randomUUID())).status, 400);
  const parallelKey = crypto.randomUUID();
  const parallel = await Promise.all([post(body, parallelKey), post(body, parallelKey)]);
  assert.deepEqual(parallel.map((item) => item.status).sort(), [200, 201]);
  const parallelIds = await Promise.all(parallel.map(async (item) => (await item.json() as { id: string }).id));
  assert.equal(parallelIds[0], parallelIds[1]);
  assert.equal(await db.usoTrial.count({ where: { documento: '52998224725' } }), 0);
  process.stdout.write('Pedido passou: preço servidor, CPF, idempotência, conflito e trial não ativado.\n');
} finally {
  if (planId) {
    await db.pedido.deleteMany({ where: { planoId: planId } });
    await db.plano.delete({ where: { id: planId } });
  }
  server.close();
  await db.$disconnect();
}
