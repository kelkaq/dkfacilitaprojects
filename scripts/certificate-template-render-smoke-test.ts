import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeCertificateTemplateLayout, readTemplateMetadata, renderTenantCertificateHtml,
  renderTenantCertificatePdf, starterCertificateLayout, templateDirectory, writeTemplateMetadata } from '../server/services/tenantCertificateTemplate.ts';
import type { CertificateRenderPayload } from '../server/services/certificateEngine.ts';

const empresaId = crypto.randomUUID();
const templateKey = crypto.randomUUID();
const directory = templateDirectory(empresaId, templateKey);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF3sAAAAASUVORK5CYII=', 'base64');
const digest = crypto.createHash('sha256').update(png).digest('hex');
const model = { engine: 'CSDK_LAYOUT_V1' as const, templateKey, fileName: 'synthetic.pptx', version: 1, pageCount: 1,
  createdAt: new Date().toISOString(), frontSha256: digest, backSha256: digest, layout: starterCertificateLayout() };
const payload: CertificateRenderPayload = {
  numeroCertificado: 'DEMO-2026-000001', codigoValidacaoQr: crypto.randomBytes(32).toString('base64url'), nrCodigo: '06',
  treinamentoTitulo: 'Treinamento sintético', cargaHorariaHoras: 4, dataRealizacaoIso: '2026-05-12T12:00:00.000Z',
  dataValidadeIso: '2027-05-12T12:00:00.000Z', dataEmissaoIso: '2026-05-12T12:00:00.000Z', validationBaseUrl: 'https://example.invalid',
  snapshotEmpresa: { razaoSocial: 'Empresa sintética', cnpj: '', cidade: 'Cidade', uf: 'SP', assinaturasCertificado: [
    { tipo: 'RESPONSAVEL_TECNICO', rotulo: 'Responsável técnico', nome: 'Nome sintético', forma: 'FISICA' },
  ] },
  snapshotColaborador: { nome: 'Pessoa sintética', cpf: '000.000.000-00', funcao: 'Função' },
  snapshotConteudoLinhas: [{ ordem: 1, descricao: 'Conteúdo de teste' }],
};

try {
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'front.png'), png);
  await fs.writeFile(path.join(directory, 'back.png'), png);
  await writeTemplateMetadata(empresaId, model);
  const stored = await readTemplateMetadata(empresaId, templateKey);
  const html = await renderTenantCertificateHtml({ empresaId, model: stored, payload });
  assert.match(html, /Pessoa sintética/);
  assert.ok(!html.includes('<script>'));
  const pdf = await renderTenantCertificatePdf({ empresaId, model: stored, payload });
  assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF');
  assert.ok(pdf.length > 5_000);
  assert.throws(() => normalizeCertificateTemplateLayout({ width: 960, height: 720, elements: [{ ...stored.layout.elements[0], fontFamily: 'url(javascript:alert(1))' }] }));
  console.log(`PASS: template layout isolation, fields, HTML escaping and Chromium PDF (${pdf.length} bytes).`);
} finally {
  await fs.rm(path.resolve(process.cwd(), 'storage', 'certificate_layouts', empresaId), { recursive: true, force: true });
}
