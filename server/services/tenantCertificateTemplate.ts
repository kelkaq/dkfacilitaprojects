import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import QRCode from 'qrcode';
import puppeteer from 'puppeteer-core';
import type { CertificateRenderPayload } from './certificateEngine.ts';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(process.cwd(), 'storage', 'certificate_layouts');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLORS = /^(?:#[0-9a-f]{3}|#[0-9a-f]{6}|transparent)$/i;
const FONTS = new Set(['Arial, Helvetica, sans-serif', "'Arial Narrow', Arial, sans-serif", 'Calibri, Arial, sans-serif', 'Georgia, serif', "'Times New Roman', serif", "'Segoe UI', Arial, sans-serif"]);

export type CertificateTemplatePage = 'front' | 'back';
export type CertificateTemplateElement = {
  id: string; page: CertificateTemplatePage; kind: 'text' | 'image' | 'signature' | 'qrcode' | 'line' | 'shape';
  x: number; y: number; width: number; height: number; content: string; asset: string | null;
  fontSize: number; fontFamily: string; fontWeight: '400' | '600' | '700'; color: string;
  textAlign: 'left' | 'center' | 'right' | 'justify'; lineHeight: number; background: string;
  borderColor: string; borderWidth: number; opacity: number; rotation: number; zIndex: number; clipPath: string | null;
};
export type CertificateTemplateLayout = { width: 960; height: 720; elements: CertificateTemplateElement[] };
export type CertificateTemplateMetadata = {
  engine: 'CSDK_LAYOUT_V1'; templateKey: string; fileName: string; version: number; pageCount: number;
  createdAt: string; frontSha256: string; backSha256: string; layout: CertificateTemplateLayout;
};

function assertUuid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('TEMPLATE_KEY_INVALID');
}

export function templateDirectory(empresaId: string, templateKey: string): string {
  assertUuid(empresaId); assertUuid(templateKey);
  const tenantRoot = path.resolve(ROOT, empresaId);
  const directory = path.resolve(tenantRoot, templateKey);
  if (!tenantRoot.startsWith(`${ROOT}${path.sep}`) || !directory.startsWith(`${tenantRoot}${path.sep}`)) throw new Error('TEMPLATE_PATH_INVALID');
  return directory;
}

export function normalizeCertificateTemplateLayout(raw: unknown): CertificateTemplateLayout {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('LAYOUT_INVALID');
  const source = raw as Record<string, unknown>;
  if (source.width !== 960 || source.height !== 720 || !Array.isArray(source.elements) || source.elements.length > 120) throw new Error('LAYOUT_INVALID');
  const ids = new Set<string>();
  const elements = source.elements.map((value): CertificateTemplateElement => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('LAYOUT_INVALID');
    const item = value as Record<string, unknown>;
    const str = (key: string, fallback: string, max = 200) => typeof item[key] === 'string' ? String(item[key]).slice(0, max) : fallback;
    const num = (key: string, fallback: number, min: number, max: number) => {
      const n = Number(item[key] ?? fallback);
      if (!Number.isFinite(n) || n < min || n > max) throw new Error('LAYOUT_INVALID');
      return n;
    };
    const id = str('id', '', 80);
    const kind = item.kind;
    const page = item.page;
    const fontWeight = item.fontWeight ?? '400';
    const textAlign = item.textAlign ?? 'left';
    const color = str('color', '#000000', 30);
    const background = str('background', 'transparent', 40);
    const borderColor = str('borderColor', '#000000', 30);
    const fontFamily = str('fontFamily', 'Arial, Helvetica, sans-serif', 100);
    const clipPath = item.clipPath == null ? null : str('clipPath', '', 200);
    if (!id || ids.has(id) || !['text', 'image', 'signature', 'qrcode', 'line', 'shape'].includes(String(kind)) || !['front', 'back'].includes(String(page)) ||
      !['400', '600', '700'].includes(String(fontWeight)) || !['left', 'center', 'right', 'justify'].includes(String(textAlign)) ||
      !COLORS.test(color) || !COLORS.test(background) || !COLORS.test(borderColor) || !FONTS.has(fontFamily) ||
      (clipPath && !/^polygon\([0-9.% ,]+\)$/i.test(clipPath))) throw new Error('LAYOUT_INVALID');
    ids.add(id);
    return {
      id, page: page as CertificateTemplatePage, kind: kind as CertificateTemplateElement['kind'],
      x: num('x', 0, 0, 960), y: num('y', 0, 0, 720), width: num('width', 100, 4, 960), height: num('height', 40, 2, 720),
      content: str('content', '', 5000), asset: item.asset == null ? null : str('asset', '', 80),
      fontSize: num('fontSize', 16, 6, 96), fontFamily, fontWeight: fontWeight as CertificateTemplateElement['fontWeight'], color,
      textAlign: textAlign as CertificateTemplateElement['textAlign'], lineHeight: num('lineHeight', 1.2, 0.8, 3), background,
      borderColor, borderWidth: num('borderWidth', 0, 0, 12), opacity: num('opacity', 1, 0, 1), rotation: num('rotation', 0, -180, 180),
      zIndex: Math.round(num('zIndex', 1, 0, 100)), clipPath,
    };
  });
  return { width: 960, height: 720, elements };
}

export function starterCertificateLayout(): CertificateTemplateLayout {
  const element = (id: string, page: CertificateTemplatePage, kind: CertificateTemplateElement['kind'], x: number, y: number,
    width: number, height: number, content = '', extra: Partial<CertificateTemplateElement> = {}): CertificateTemplateElement => ({
    id, page, kind, x, y, width, height, content, asset: null, fontSize: 20, fontFamily: 'Arial, Helvetica, sans-serif',
    fontWeight: '400', color: '#111827', textAlign: 'center', lineHeight: 1.25, background: 'transparent', borderColor: '#111827',
    borderWidth: 0, opacity: 1, rotation: 0, zIndex: 2, clipPath: null, ...extra,
  });
  return { width: 960, height: 720, elements: [
    element('front-title', 'front', 'text', 150, 36, 660, 58, 'CERTIFICADO', { fontSize: 36, fontWeight: '700' }),
    element('front-recipient', 'front', 'text', 80, 250, 800, 58, '{{nome_colaborador}}', { fontSize: 26, fontWeight: '700' }),
    element('front-course', 'front', 'text', 100, 330, 760, 112, 'Concluiu o treinamento {{treinamento}} (NR {{nr_numero}}), com carga horária de {{carga_horaria}}, realizado em {{data_realizacao}}.', { fontSize: 20 }),
    element('front-signature-1', 'front', 'signature', 100, 535, 250, 70, '', { asset: 'assinatura_1', borderWidth: 1 }),
    element('front-signer-1', 'front', 'text', 85, 610, 280, 44, '{{assinante_1_nome}}\n{{assinante_1_papel}}', { fontSize: 13, fontWeight: '600' }),
    element('back-content-title', 'back', 'text', 45, 48, 690, 45, 'CONTEÚDO PROGRAMÁTICO', { textAlign: 'left', fontSize: 24, fontWeight: '700' }),
    element('back-content', 'back', 'text', 45, 115, 860, 445, '{{conteudo_programatico}}', { textAlign: 'left', fontSize: 16 }),
    element('back-qrcode', 'back', 'qrcode', 815, 570, 90, 90, '', { asset: 'qrcode' }),
    element('back-code', 'back', 'text', 690, 665, 220, 25, '{{codigo_certificado}}', { fontSize: 11, fontWeight: '700' }),
  ] };
}

export async function importPptxBackgrounds(params: { empresaId: string; fileName: string; base64Content: string; version: number }): Promise<CertificateTemplateMetadata> {
  const templateKey = crypto.randomUUID();
  const stagingId = `${params.empresaId}_${templateKey}`;
  const { inspectAndSavePptxTemplate } = await import('./certificateEngine.ts');
  let stagedPptx = '';
  let tempDirectory = '';
  const destination = templateDirectory(params.empresaId, templateKey);
  try {
    const inspected = await inspectAndSavePptxTemplate({ empresaId: stagingId, fileName: params.fileName, base64Content: params.base64Content });
    stagedPptx = path.resolve(process.cwd(), inspected.storageRelativePath);
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'csdk-pptx-import-'));
    const profile = `file://${path.join(tempDirectory, 'lo-profile').replace(/\\/g, '/')}`;
    await execFileAsync(process.env.CSDK_LIBREOFFICE_PATH || 'libreoffice', ['--headless', `-env:UserInstallation=${profile}`, '--convert-to', 'pdf', '--outdir', tempDirectory, stagedPptx], { timeout: 90_000, maxBuffer: 2 * 1024 * 1024 });
    const pdfPath = path.join(tempDirectory, `${path.basename(stagedPptx, '.pptx')}.pdf`);
    const prefix = path.join(tempDirectory, 'slide');
    await execFileAsync(process.env.CSDK_PDFTOPPM_PATH || 'pdftoppm', ['-f', '1', '-l', '2', '-scale-to-x', '960', '-scale-to-y', '720', '-png', pdfPath, prefix], { timeout: 45_000, maxBuffer: 2 * 1024 * 1024 });
    const first = await fs.readFile(`${prefix}-1.png`);
    const second = inspected.slideCount >= 2 ? await fs.readFile(`${prefix}-2.png`) : first;
    await fs.mkdir(destination, { recursive: true, mode: 0o750 });
    await fs.writeFile(path.join(destination, 'front.png'), first, { mode: 0o640, flag: 'wx' });
    await fs.writeFile(path.join(destination, 'back.png'), second, { mode: 0o640, flag: 'wx' });
    const metadata: CertificateTemplateMetadata = { engine: 'CSDK_LAYOUT_V1', templateKey, fileName: params.fileName.slice(0, 120),
      version: params.version, pageCount: inspected.slideCount, createdAt: new Date().toISOString(),
      frontSha256: crypto.createHash('sha256').update(first).digest('hex'), backSha256: crypto.createHash('sha256').update(second).digest('hex'),
      layout: starterCertificateLayout() };
    await writeTemplateMetadata(params.empresaId, metadata);
    return metadata;
  } catch (error) {
    await fs.rm(destination, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : '';
    if (message.includes('ENOENT') || message.includes('not found')) throw new Error('PPTX_RENDER_TOOLS_MISSING');
    throw error;
  } finally {
    if (stagedPptx) await fs.rm(stagedPptx, { force: true }).catch(() => undefined);
    if (tempDirectory) await fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function readTemplateMetadata(empresaId: string, templateKey: string): Promise<CertificateTemplateMetadata> {
  const file = path.join(templateDirectory(empresaId, templateKey), 'template.json');
  const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as CertificateTemplateMetadata;
  if (parsed.templateKey !== templateKey || parsed.engine !== 'CSDK_LAYOUT_V1') throw new Error('TEMPLATE_CONFIG_INVALID');
  parsed.layout = normalizeCertificateTemplateLayout(parsed.layout);
  return parsed;
}

export async function writeTemplateMetadata(empresaId: string, metadata: CertificateTemplateMetadata): Promise<void> {
  assertUuid(metadata.templateKey);
  metadata.layout = normalizeCertificateTemplateLayout(metadata.layout);
  const dir = templateDirectory(empresaId, metadata.templateKey);
  await fs.mkdir(dir, { recursive: true, mode: 0o750 });
  const temporary = path.join(dir, `template.${crypto.randomUUID()}.tmp`);
  await fs.writeFile(temporary, JSON.stringify(metadata), { mode: 0o640, flag: 'wx' });
  await fs.rename(temporary, path.join(dir, 'template.json'));
}

export async function cloneTemplateVersion(empresaId: string, source: CertificateTemplateMetadata, version: number): Promise<CertificateTemplateMetadata> {
  const templateKey = crypto.randomUUID();
  const sourceDir = templateDirectory(empresaId, source.templateKey);
  const destination = templateDirectory(empresaId, templateKey);
  await fs.mkdir(destination, { recursive: true, mode: 0o750 });
  try {
    await fs.copyFile(path.join(sourceDir, 'front.png'), path.join(destination, 'front.png'));
    await fs.copyFile(path.join(sourceDir, 'back.png'), path.join(destination, 'back.png'));
    const metadata: CertificateTemplateMetadata = { ...source, templateKey, version, createdAt: new Date().toISOString(), layout: normalizeCertificateTemplateLayout(source.layout) };
    await writeTemplateMetadata(empresaId, metadata);
    return metadata;
  } catch (error) { await fs.rm(destination, { recursive: true, force: true }); throw error; }
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const safeDataImage = (value: unknown) => typeof value === 'string' && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value) ? value : '';
const datePt = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value));

function templateValues(payload: CertificateRenderPayload, qr: string) {
  const emp = payload.snapshotEmpresa;
  const col = payload.snapshotColaborador;
  const signers = emp.assinaturasCertificado ?? [];
  const lines = [...payload.snapshotConteudoLinhas].sort((a, b) => a.ordem - b.ordem).map((line) => `${line.ordem}. ${line.descricao}`).join('\n');
  const values: Record<string, string> = {
    nome_colaborador: col.nome, cpf: col.cpf, funcao: col.funcao || '', treinamento: payload.treinamentoTitulo, nr_numero: payload.nrCodigo,
    carga_horaria: `${payload.cargaHorariaHoras} horas`, data_realizacao: datePt(payload.dataRealizacaoIso), data_validade: datePt(payload.dataValidadeIso),
    data_emissao: datePt(payload.dataEmissaoIso || new Date().toISOString()), empresa: emp.razaoSocial, documento_empresa: emp.cnpj || '', cidade: emp.cidade || '', uf: emp.uf || '',
    conteudo_programatico: lines, codigo_certificado: payload.numeroCertificado, codigo_validacao: payload.codigoValidacaoQr, qrcode: qr,
    instrutor: emp.instrutorNome || '', registro_instrutor: emp.instrutorRegistro || '', responsavel_tecnico: emp.rtNome || '', registro_responsavel: emp.rtRegistro || '',
  };
  signers.slice(0, 6).forEach((signer, i) => {
    values[`assinante_${i + 1}_nome`] = signer.nome || signer.rotulo;
    values[`assinante_${i + 1}_papel`] = signer.rotulo;
    values[`assinante_${i + 1}_registro`] = signer.registro || '';
  });
  return values;
}

function assetMap(payload: CertificateRenderPayload, qr: string): Record<string, string> {
  const emp = payload.snapshotEmpresa;
  const result: Record<string, string> = { logo_empresa: safeDataImage(emp.logoUrl), qrcode: qr, assinatura_colaborador: safeDataImage(payload.snapshotColaborador.assinaturaDataUrl) };
  (emp.assinaturasCertificado ?? []).slice(0, 6).forEach((signer, i) => { result[`assinatura_${i + 1}`] = signer.forma === 'FISICA' ? '' : safeDataImage(signer.assinaturaDataUrl); });
  result.assinatura_instrutor = safeDataImage(emp.assinaturasCertificado?.find((signer) => signer.tipo === 'INSTRUTOR')?.assinaturaDataUrl);
  result.assinatura_responsavel = safeDataImage(emp.assinaturasCertificado?.find((signer) => ['RESPONSAVEL_TECNICO', 'RT'].includes(signer.tipo))?.assinaturaDataUrl);
  return result;
}

function renderElement(item: CertificateTemplateElement, values: Record<string, string>, assets: Record<string, string>) {
  const style = [`left:${item.x}px`, `top:${item.y}px`, `width:${item.width}px`, `height:${item.height}px`, `z-index:${item.zIndex}`, `opacity:${item.opacity}`,
    `transform:rotate(${item.rotation}deg)`, `color:${item.color}`, `background:${item.background}`, `font-family:${item.fontFamily}`, `font-size:${item.fontSize}px`,
    `font-weight:${item.fontWeight}`, `line-height:${item.lineHeight}`, `text-align:${item.textAlign}`, item.clipPath ? `clip-path:${item.clipPath}` : ''].filter(Boolean).join(';');
  const replace = (source: string) => escapeHtml(source).replace(/\{\{([a-z0-9_]+)}}/gi, (_match, key: string) => escapeHtml(values[key] ?? ''));
  if (item.kind === 'text') return `<div style="${style};position:absolute;white-space:pre-line;overflow:hidden">${replace(item.content)}</div>`;
  if (item.kind === 'shape') return `<div style="${style};position:absolute"></div>`;
  if (item.kind === 'line') return `<div style="${style};position:absolute;border-top:${Math.max(1, item.borderWidth)}px solid ${item.borderColor}"></div>`;
  const source = item.kind === 'qrcode' ? assets.qrcode : item.kind === 'image' || item.kind === 'signature' ? assets[item.asset || ''] : '';
  const border = item.kind === 'signature' ? `border-bottom:${Math.max(1, item.borderWidth)}px solid ${item.borderColor};` : '';
  const text = item.kind === 'signature' && !source ? replace(`{{${(item.asset || '').replace('assinatura_', 'assinante_').replace(/^(assinante_\d+)$/, '$1_papel')}}}`) : '';
  return `<div style="${style};position:absolute;display:flex;align-items:center;justify-content:center;overflow:hidden;${border}">${source ? `<img src="${source}" alt="" style="width:100%;height:100%;object-fit:contain" />` : escapeHtml(text)}</div>`;
}

export async function renderTenantCertificateHtml(params: { empresaId: string; model: CertificateTemplateMetadata; payload: CertificateRenderPayload; layout?: unknown }) {
  const layout = normalizeCertificateTemplateLayout(params.layout ?? params.model.layout);
  const directory = templateDirectory(params.empresaId, params.model.templateKey);
  const front = await fs.readFile(path.join(directory, 'front.png'));
  const back = await fs.readFile(path.join(directory, 'back.png'));
  if (crypto.createHash('sha256').update(front).digest('hex') !== params.model.frontSha256 || crypto.createHash('sha256').update(back).digest('hex') !== params.model.backSha256) throw new Error('TEMPLATE_INTEGRITY_FAILED');
  const qrUrl = `${params.payload.validationBaseUrl.replace(/\/$/, '')}/?csdk_cert=${encodeURIComponent(params.payload.codigoValidacaoQr)}`;
  const qr = await QRCode.toDataURL(qrUrl, { margin: 0, width: 256 });
  const values = templateValues(params.payload, qr);
  const assets = assetMap(params.payload, qr);
  const baseFront = `data:image/png;base64,${front.toString('base64')}`;
  const baseBack = `data:image/png;base64,${back.toString('base64')}`;
  const pages = (['front', 'back'] as const).map((page, index) => `<main class="page"><img class="base" src="${index === 0 ? baseFront : baseBack}" alt="" />${layout.elements.filter((item) => item.page === page).sort((a, b) => a.zIndex - b.zIndex).map((item) => renderElement(item, values, assets)).join('')}</main>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Certificado ${escapeHtml(params.payload.numeroCertificado)}</title><style>@page{size:10in 7.5in;margin:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}html,body{margin:0;padding:0;background:#fff}.page{position:relative;width:960px;height:720px;overflow:hidden;page-break-after:always;background:#fff}.page:last-child{page-break-after:auto}.base{position:absolute;inset:0;width:960px;height:720px;object-fit:fill}</style></head><body>${pages}</body></html>`;
}

export async function renderTenantCertificatePdf(params: { empresaId: string; model: CertificateTemplateMetadata; payload: CertificateRenderPayload; layout?: unknown }): Promise<Buffer> {
  const html = await renderTenantCertificateHtml(params);
  const executablePath = process.env.CSDK_CHROMIUM_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  const browser = await puppeteer.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 720, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load', timeout: 20_000 });
    return Buffer.from(await page.pdf({ printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } }));
  } finally { await browser.close(); }
}
