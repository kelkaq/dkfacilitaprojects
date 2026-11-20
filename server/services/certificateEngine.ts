import QRCode from 'qrcode';
import JSZip from 'jszip';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const PPTX_SUPPORTED_TAGS = [
  '{{NOME_COLABORADOR}}',
  '{{CPF}}',
  '{{FUNCAO}}',
  '{{NORMA_NR}}',
  '{{CARGA_HORARIA}}',
  '{{DATA_REALIZACAO}}',
  '{{DATA_VALIDADE}}',
  '{{CONTEUDO_COLUNA_1}}',
  '{{CONTEUDO_COLUNA_2}}',
  '{{QRCODE}}',
  '{{ASSINATURA_ALUNO}}',
  '{{ASSINATURA_INSTRUTOR}}',
  '{{ASSINATURA_RT}}',
] as const;

export interface CertificateRenderPayload {
  numeroCertificado: string;
  codigoValidacaoQr: string;
  nrCodigo: string;
  treinamentoTitulo: string;
  cargaHorariaHoras: number;
  dataRealizacaoIso: string;
  dataValidadeIso: string;
  validationBaseUrl: string;
  ocultarAssinaturaColaborador?: boolean;
  modeloProprioUrl?: string | null;
  snapshotEmpresa: {
    razaoSocial: string;
    cnpj: string;
    tipoPessoa?: 'PF' | 'PJ' | null;
    exibirDocumento?: boolean | null;
    telefoneRodape?: string | null;
    emailRodape?: string | null;
    endereco?: string;
    cidade?: string;
    uf?: string;
    logoUrl?: string;
    corPrimaria?: string;
    instrutorNome?: string;
    instrutorRegistro?: string;
    instrutorAssinaturaUrl?: string;
    rtNome?: string;
    rtRegistro?: string;
    rtAssinaturaUrl?: string;
  };
  snapshotColaborador: {
    nome: string;
    cpf: string;
    funcao: string;
    assinaturaDataUrl?: string;
  };
  snapshotConteudoLinhas: {
    ordem: number;
    descricao: string;
    cargaHorariaMin?: number | null;
  }[];
}

export interface ComprovanteAvaliacaoPayload {
  codigoEvidencia: string;
  validationBaseUrl: string;
  empresa: {
    razaoSocial: string;
    cnpj: string;
    tipoPessoa?: 'PF' | 'PJ' | null;
    exibirDocumento?: boolean | null;
    telefoneRodape?: string | null;
    emailRodape?: string | null;
    endereco?: string;
    cidade?: string;
    uf?: string;
    logoUrl?: string;
    corPrimaria?: string;
  };
  turma: {
    codigoTurma: string;
    titulo: string;
    nrCodigo: string;
    cargaHorariaHoras: number;
    dataRealizacaoIso: string;
    horarioOficial?: string;
    contratoObraNome?: string;
    localRealizacao?: string;
    instrutorNome?: string;
    instrutorRegistro?: string;
    instrutorAssinaturaUrl?: string;
    rtNome?: string;
    rtRegistro?: string;
    rtAssinaturaUrl?: string;
  };
  participante: {
    nome: string;
    cpf: string;
    funcao: string;
    notaPercentual: number;
    notaMinima: number;
    status: 'APROVADO' | 'REPROVADO' | 'EM_ANDAMENTO';
    acertos: number;
    totalQuestoes: number;
    dataHoraConclusao: string;
    assinaturaDataUrl?: string | null;
    selfieDataUrl?: string | null;
  };
  questoes: {
    ordem: number;
    enunciado: string;
    respostaMarcada: string;
    respostaMarcadaTexto?: string;
    gabarito: string;
    gabaritoTexto?: string;
    correta: boolean;
  }[];
}

export interface DossieAplicacaoPayload {
  codigoDossie: string;
  validationBaseUrl: string;
  empresa: ComprovanteAvaliacaoPayload['empresa'];
  turma: ComprovanteAvaliacaoPayload['turma'] & {
    conteudoLinhas: { ordem: number; descricao: string; cargaHorariaMin?: number | null }[];
  };
  participantes: {
    codigoEvidencia: string;
    nome: string;
    cpf: string;
    funcao: string;
    notaPercentual: number;
    status: string;
    acertos: number;
    totalQuestoes: number;
    dataHoraConclusao: string;
    assinaturaDataUrl?: string | null;
    selfieDataUrl?: string | null;
    questoes: ComprovanteAvaliacaoPayload['questoes'];
  }[];
}

export interface CartaAnuenciaRenderPayload {
  codigoCarta: string;
  validationBaseUrl: string;
  empresa: {
    razaoSocial: string;
    cnpj: string;
    endereco?: string;
    cidade?: string;
    uf?: string;
    logoUrl?: string;
    corPrimaria?: string;
  };
  colaborador: {
    nome: string;
    cpf: string;
    funcao: string;
    assinaturaDataUrl?: string | null;
  };
  carta: {
    titulo: string;
    nrReferencia: string;
    textoLegal: string;
    periodoRealizacao: string;
    localRealizacao?: string;
    validadeIso: string;
    tstNome?: string;
    tstRegistro?: string;
    tstAssinaturaUrl?: string | null;
    prepostoNome?: string;
    prepostoAssinaturaUrl?: string | null;
    rtNome?: string;
    rtRegistro?: string;
    rtAssinaturaUrl?: string | null;
  };
}

export interface ListaPresencaPayload {
  modo: 'oficial' | 'status';
  empresa: {
    razaoSocial: string;
    cnpj: string;
    endereco?: string;
    cidade?: string;
    uf?: string;
    logoUrl?: string;
    corPrimaria?: string;
  };
  turma: {
    codigoTurma: string;
    titulo: string;
    nrCodigo: string;
    cargaHorariaHoras: number;
    dataRealizacaoIso: string;
    contratoObraNome?: string;
    localRealizacao?: string;
    instrutorNome?: string;
    instrutorRegistro?: string;
    rtNome?: string;
    rtRegistro?: string;
  };
  participantes: {
    ordem: number;
    nome: string;
    cpfMascarado: string;
    funcao: string;
    situacao: string;
    nota?: string;
    pin?: string;
    codigoEvidencia?: string;
    numeroCertificado?: string;
  }[];
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDatePtBr(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function formatEmpresaAddress(emp: {
  endereco?: string;
  cidade?: string;
  uf?: string;
}): string {
  const parts: string[] = [];
  if (emp.endereco) parts.push(emp.endereco);
  if (emp.cidade) {
    const cityUf = `${emp.cidade}${emp.uf ? `/${emp.uf}` : ''}`;
    if (!emp.endereco || !emp.endereco.toLowerCase().includes(emp.cidade.toLowerCase())) {
      parts.push(cityUf);
    }
  }
  return parts.join(' — ');
}

function formatIssuerDocument(emp: {
  cnpj?: string;
  tipoPessoa?: 'PF' | 'PJ' | null;
  exibirDocumento?: boolean | null;
}): string {
  if (emp.exibirDocumento === false) return '';
  const clean = (emp.cnpj || '').trim();
  if (!clean) return '';
  const digits = clean.replace(/\D/g, '');
  const label =
    emp.tipoPessoa === 'PF' ? 'CPF' : emp.tipoPessoa === 'PJ' ? 'CNPJ' : digits.length <= 11 ? 'CPF' : 'CNPJ';
  return `${label} ${clean}`;
}

function formatIssuerContact(emp: {
  telefoneRodape?: string | null;
  emailRodape?: string | null;
}): string {
  return [emp.telefoneRodape?.trim(), emp.emailRodape?.trim()].filter(Boolean).join(' · ');
}

function computeIntegrityHash(seed: string): string {
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32).toUpperCase();
}

function buildLetterIndex(idx: number): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  if (idx < letters.length) return `${letters[idx]})`;
  return `${String(idx + 1).padStart(2, '0')}.`;
}

// ============================================================================
// 1. CERTIFICADO FRENTE E VERSO (VETORIAL A4 — COM OU SEM ASSINATURA DO ALUNO)
// ============================================================================

export async function renderCertificateFrontAndBackHtml(
  payload: CertificateRenderPayload
): Promise<{
  html: string;
  colunasVerso: 1 | 2;
  validationUrl: string;
  qrCodeSvg: string;
  integrityHash: string;
}> {
  const base = payload.validationBaseUrl.replace(/\/$/, '');
  const validationUrl = `${base}/?validar=${encodeURIComponent(payload.codigoValidacaoQr)}`;
  const qrCodeSvg = await QRCode.toString(validationUrl, {
    type: 'svg',
    margin: 1,
    width: 120,
  });

  const linhas = [...payload.snapshotConteudoLinhas].sort((a, b) => a.ordem - b.ordem);
  const colunasVerso: 1 | 2 = linhas.length >= 8 ? 2 : 1;
  const primaryColor = payload.snapshotEmpresa.corPrimaria || '#0F172A';
  const ocultarAssinaturaAluno = Boolean(payload.ocultarAssinaturaColaborador);
  const integrityHash = computeIntegrityHash(
    `${payload.numeroCertificado}|${payload.codigoValidacaoQr}|${payload.snapshotColaborador.cpf}|${payload.nrCodigo}|${payload.dataRealizacaoIso}`
  );

  const renderLinesList = (items: typeof linhas, offset: number) =>
    items
      .map(
        (item, i) => `
      <li class="syllabus-item">
        <span class="syllabus-index">${String(item.ordem).padStart(2, '0')} · ${buildLetterIndex(offset + i)}</span>
        <span class="syllabus-text">${escapeHtml(item.descricao)}</span>
        ${
          item.cargaHorariaMin
            ? `<span class="syllabus-min">${item.cargaHorariaMin} min</span>`
            : ''
        }
      </li>`
      )
      .join('');

  let versoContentHtml = '';
  if (colunasVerso === 2) {
    const mid = Math.ceil(linhas.length / 2);
    const col1 = linhas.slice(0, mid);
    const col2 = linhas.slice(mid);
    versoContentHtml = `
      <div class="syllabus-grid two-cols">
        <ol class="syllabus-list">${renderLinesList(col1, 0)}</ol>
        <ol class="syllabus-list">${renderLinesList(col2, mid)}</ol>
      </div>
    `;
  } else {
    versoContentHtml = `
      <div class="syllabus-grid one-col">
        <ol class="syllabus-list">${renderLinesList(linhas, 0)}</ol>
      </div>
    `;
  }

  const emp = payload.snapshotEmpresa;
  const colab = payload.snapshotColaborador;
  const fullAddress = formatEmpresaAddress(emp);
  const isImageCustomBg =
    payload.modeloProprioUrl &&
    (payload.modeloProprioUrl.startsWith('data:image/') ||
      /\.(png|jpe?g|svg)(\?|$)/i.test(payload.modeloProprioUrl));

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Certificado ${escapeHtml(payload.numeroCertificado)} — ${escapeHtml(colab.nome)}</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'Plus Jakarta Sans', 'DM Sans', Arial, sans-serif; background: #e2e8f0; color: #0f172a; }
    .sheet {
      width: 297mm;
      height: 210mm;
      background: #ffffff;
      margin: 12px auto;
      padding: 13mm;
      position: relative;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      border: 1px solid #cbd5e1;
      overflow: hidden;
    }
    .sheet.has-custom-bg {
      background-image: url('${isImageCustomBg ? escapeHtml(payload.modeloProprioUrl || '') : ''}');
      background-size: cover;
      background-position: center;
    }
    .frame {
      flex: 1;
      border: 2px solid ${escapeHtml(primaryColor)};
      background: rgba(255, 255, 255, ${isImageCustomBg ? '0.92' : '1'});
      padding: 11mm 13mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
    }
    .frame::before {
      content: '';
      position: absolute;
      inset: 3px;
      border: 0.75px solid rgba(15, 23, 42, 0.14);
      pointer-events: none;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 7mm;
    }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand img { max-height: 46px; max-width: 140px; object-fit: contain; }
    .brand-title { font-size: 15px; font-weight: 800; color: #0f172a; }
    .brand-sub { font-size: 11px; color: #475569; margin-top: 2px; }
    .cert-code { text-align: right; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: #334155; line-height: 1.5; }
    .center-block { text-align: center; padding: 6mm 6mm; }
    .kicker { font-size: 11.5px; letter-spacing: 2.5px; color: ${escapeHtml(primaryColor)}; font-weight: 700; text-transform: uppercase; }
    .student-name { font-size: 27px; font-weight: 800; color: #0f172a; margin: 5mm 0 2.5mm; letter-spacing: -0.02em; }
    .student-meta { font-size: 12.5px; color: #475569; margin-bottom: 5.5mm; }
    .body-text { font-size: 13.5px; line-height: 1.65; color: #1e293b; max-width: 220mm; margin: 0 auto; }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr auto;
      gap: 9mm;
      align-items: end;
      padding-top: 6mm;
      border-top: 1px solid #e2e8f0;
    }
    .sig-box { text-align: center; }
    .sig-slot { height: 38px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px; }
    .sig-img { max-height: 36px; max-width: 150px; object-fit: contain; display: block; }
    .sig-physical-hint { font-size: 9px; color: #94a3b8; font-style: italic; margin-bottom: 2px; }
    .sig-line { border-top: 1px solid #334155; padding-top: 4px; font-size: 11px; font-weight: 700; color: #0f172a; }
    .sig-role { font-size: 9.5px; color: #64748b; margin-top: 1px; }
    .qr-box { text-align: center; }
    .qr-box svg { width: 84px; height: 84px; display: block; margin: 0 auto; }
    .qr-code-text { font-family: 'JetBrains Mono', monospace; font-size: 8.5px; color: #475569; margin-top: 3px; }
    .verso-title { font-size: 15.5px; font-weight: 800; color: #0f172a; }
    .verso-sub { font-size: 11px; color: #475569; margin-top: 2px; }
    .syllabus-grid { margin-top: 5mm; flex: 1; }
    .syllabus-grid.two-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 9mm; }
    .syllabus-list { list-style: none; display: flex; flex-direction: column; gap: 5.5px; }
    .syllabus-item { display: flex; align-items: baseline; gap: 6px; font-size: 11px; line-height: 1.42; color: #1e293b; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px; }
    .syllabus-index { font-family: 'JetBrains Mono', monospace; font-weight: 700; color: ${escapeHtml(primaryColor)}; min-width: 44px; font-size: 10px; }
    .syllabus-text { flex: 1; }
    .syllabus-min { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; color: #64748b; white-space: nowrap; }
    .verso-footer { display: flex; justify-content: space-between; align-items: center; gap: 14px; border-top: 1px solid #e2e8f0; padding-top: 5mm; font-size: 10px; color: #475569; line-height: 1.5; }
    @media print {
      body { background: #ffffff; }
      .sheet { margin: 0; border: none; page-break-after: always; }
      .sheet:last-child { page-break-after: auto; }
    }
  </style>
</head>
<body>
  <!-- FRENTE -->
  <section class="sheet ${isImageCustomBg ? 'has-custom-bg' : ''}">
    <div class="frame">
      <div class="header">
        <div class="brand">
          ${emp.logoUrl ? `<img src="${escapeHtml(emp.logoUrl)}" alt="Logo da Empresa" />` : ''}
          <div>
            <div class="brand-title">${escapeHtml(emp.razaoSocial)}</div>
            ${
              [formatIssuerDocument(emp), fullAddress].filter(Boolean).length > 0
                ? `<div class="brand-sub">${escapeHtml([formatIssuerDocument(emp), fullAddress].filter(Boolean).join(' · '))}</div>`
                : ''
            }
          </div>
        </div>
        <div class="cert-code">
          <div><strong>Nº ${escapeHtml(payload.numeroCertificado)}</strong></div>
          <div>QR: ${escapeHtml(payload.codigoValidacaoQr)}</div>
          <div>Hash: ${integrityHash.slice(0, 14)}</div>
        </div>
      </div>

      <div class="center-block">
        <div class="kicker">Certificado de Capacitação Profissional</div>
        <div class="student-name">${escapeHtml(colab.nome)}</div>
        <div class="student-meta">CPF: ${escapeHtml(colab.cpf)} · Função: ${escapeHtml(colab.funcao)}</div>
        <p class="body-text">
          Certificamos que o(a) profissional acima identificado(a) concluiu com aproveitamento o treinamento normativo
          <strong>${escapeHtml(payload.nrCodigo)} — ${escapeHtml(payload.treinamentoTitulo)}</strong>,
          com carga horária total de <strong>${payload.cargaHorariaHoras} horas</strong>,
          realizado em <strong>${formatDatePtBr(payload.dataRealizacaoIso)}</strong>,
          com validade normativa até <strong>${formatDatePtBr(payload.dataValidadeIso)}</strong>.
        </p>
      </div>

      <div class="signatures">
        <div class="sig-box">
          <div class="sig-slot">
            ${
              emp.rtAssinaturaUrl
                ? `<img class="sig-img" src="${escapeHtml(emp.rtAssinaturaUrl)}" alt="Assinatura do Responsável Técnico" />`
                : ''
            }
          </div>
          <div class="sig-line">${escapeHtml(emp.rtNome || 'Responsável Técnico')}</div>
          <div class="sig-role">Responsável Técnico · ${escapeHtml(emp.rtRegistro || 'Registro Profissional')}</div>
        </div>

        <div class="sig-box">
          <div class="sig-slot">
            ${
              emp.instrutorAssinaturaUrl
                ? `<img class="sig-img" src="${escapeHtml(emp.instrutorAssinaturaUrl)}" alt="Assinatura do Instrutor" />`
                : ''
            }
          </div>
          <div class="sig-line">${escapeHtml(emp.instrutorNome || 'Instrutor / TST')}</div>
          <div class="sig-role">Instrutor / TST · ${escapeHtml(emp.instrutorRegistro || 'Profissional Habilitado')}</div>
        </div>

        <div class="sig-box">
          <div class="sig-slot">
            ${
              !ocultarAssinaturaAluno && colab.assinaturaDataUrl
                ? `<img class="sig-img" src="${escapeHtml(colab.assinaturaDataUrl)}" alt="Assinatura do Colaborador" />`
                : ocultarAssinaturaAluno
                  ? `<span class="sig-physical-hint">Assinatura física</span>`
                  : ''
            }
          </div>
          <div class="sig-line">${escapeHtml(colab.nome)}</div>
          <div class="sig-role">Colaborador · CPF ${escapeHtml(colab.cpf)}</div>
        </div>

        <div class="qr-box">
          ${qrCodeSvg}
          <div class="qr-code-text">${escapeHtml(payload.codigoValidacaoQr)}</div>
        </div>
      </div>
    </div>
  </section>

  <!-- VERSO -->
  <section class="sheet">
    <div class="frame">
      <div>
        <div class="header">
          <div>
            <div class="verso-title">Conteúdo Programático — ${escapeHtml(payload.nrCodigo)}</div>
            <div class="verso-sub">${escapeHtml(payload.treinamentoTitulo)} · Carga Horária: ${payload.cargaHorariaHoras}h · ${linhas.length} tópicos em ${colunasVerso} ${colunasVerso === 1 ? 'coluna' : 'colunas'}</div>
          </div>
          <div class="cert-code">
            <div><strong>Certificado ${escapeHtml(payload.numeroCertificado)}</strong></div>
            <div>Emitido em ${formatDatePtBr(payload.dataRealizacaoIso)}</div>
          </div>
        </div>
        ${versoContentHtml}
      </div>

      <div class="verso-footer">
        <div>
          <div><strong>${escapeHtml(emp.razaoSocial)}</strong>${formatIssuerDocument(emp) ? ` · ${escapeHtml(formatIssuerDocument(emp))}` : ''}</div>
          ${
            [fullAddress ? `Endereço: ${fullAddress}` : '', formatIssuerContact(emp)]
              .filter(Boolean)
              .length > 0
              ? `<div>${escapeHtml([fullAddress ? `Endereço: ${fullAddress}` : '', formatIssuerContact(emp)].filter(Boolean).join(' · '))}</div>`
              : ''
          }
          <div>Validação pública permanente: <strong>${escapeHtml(validationUrl)}</strong> · Hash SHA-256: <span style="font-family:monospace">${integrityHash}</span></div>
        </div>
        <div class="qr-box">
          ${qrCodeSvg}
          <div class="qr-code-text">${escapeHtml(payload.codigoValidacaoQr)}</div>
        </div>
      </div>
    </div>
  </section>
</body>
</html>`;

  return { html, colunasVerso, validationUrl, qrCodeSvg, integrityHash };
}

// ============================================================================
// 2. COMPROVANTE INDIVIDUAL DE AVALIAÇÃO (EVD-...)
// ============================================================================

export async function renderComprovanteAvaliacaoHtml(
  payload: ComprovanteAvaliacaoPayload
): Promise<{ html: string; qrCodeSvg: string }> {
  const base = payload.validationBaseUrl.replace(/\/$/, '');
  const validationUrl = `${base}/?evidencia=${encodeURIComponent(payload.codigoEvidencia)}`;
  const qrCodeSvg = await QRCode.toString(validationUrl, {
    type: 'svg',
    margin: 1,
    width: 100,
  });

  const emp = payload.empresa;
  const t = payload.turma;
  const p = payload.participante;
  const primary = emp.corPrimaria || '#0F172A';
  const statusColor = p.status === 'APROVADO' ? '#15803D' : '#B91C1C';
  const statusBg = p.status === 'APROVADO' ? '#F0FDF4' : '#FEF2F2';

  const rowsHtml = payload.questoes
    .map(
      (q) => `
      <tr>
        <td class="mono center">${String(q.ordem).padStart(2, '0')}</td>
        <td>
          <div class="q-title">${escapeHtml(q.enunciado)}</div>
          ${q.respostaMarcadaTexto ? `<div class="q-sub">Marcada: (${escapeHtml(q.respostaMarcada)}) ${escapeHtml(q.respostaMarcadaTexto)}</div>` : ''}
        </td>
        <td class="mono center"><strong>${escapeHtml(q.respostaMarcada || '—')}</strong></td>
        <td class="mono center">${escapeHtml(q.gabarito)}</td>
        <td class="center">
          <span class="pill ${q.correta ? 'pill-ok' : 'pill-err'}">${q.correta ? 'Correta' : 'Incorreta'}</span>
        </td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Comprovante ${escapeHtml(payload.codigoEvidencia)} — ${escapeHtml(p.nome)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'DM Sans', Arial, sans-serif; background: #e2e8f0; color: #0f172a; }
    .page {
      width: 210mm;
      min-height: 297mm;
      background: #ffffff;
      margin: 12px auto;
      padding: 14mm;
      border: 1px solid #cbd5e1;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${escapeHtml(primary)}; padding-bottom: 10px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand img { max-height: 40px; max-width: 120px; object-fit: contain; }
    .title { font-size: 16px; font-weight: 800; color: #0f172a; }
    .sub { font-size: 11px; color: #475569; margin-top: 2px; }
    .code-box { text-align: right; font-family: 'JetBrains Mono', monospace; font-size: 11px; }
    .score-banner {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: center;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid ${statusColor}44;
      background: ${statusBg};
    }
    .score-num { font-family: 'JetBrains Mono', monospace; font-size: 28px; font-weight: 800; color: ${statusColor}; }
    .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; font-size: 11px; }
    .meta-label { color: #64748b; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.04em; }
    .meta-val { font-weight: 600; color: #0f172a; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    th { background: #f8fafc; border-bottom: 1px solid #cbd5e1; padding: 7px 8px; text-align: left; font-size: 10px; color: #475569; }
    td { border-bottom: 1px solid #f1f5f9; padding: 7px 8px; vertical-align: top; }
    .mono { font-family: 'JetBrains Mono', monospace; }
    .center { text-align: center; }
    .q-title { font-weight: 600; color: #0f172a; }
    .q-sub { font-size: 9.5px; color: #64748b; margin-top: 2px; }
    .pill { display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 9.5px; font-weight: 700; }
    .pill-ok { background: #dcfce7; color: #166534; }
    .pill-err { background: #fee2e2; color: #991b1b; }
    .sigs { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 12px; align-items: end; margin-top: auto; padding-top: 12px; border-top: 1px solid #e2e8f0; }
    .sig-box { text-align: center; }
    .sig-img { max-height: 36px; max-width: 130px; object-fit: contain; margin: 0 auto 4px; display: block; }
    .sig-line { border-top: 1px solid #475569; padding-top: 4px; font-size: 10px; font-weight: 700; }
    .sig-role { font-size: 9px; color: #64748b; }
    .qr svg { width: 76px; height: 76px; display: block; margin: 0 auto; }
    @media print {
      body { background: #fff; }
      .page { margin: 0; border: none; width: auto; min-height: auto; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="brand">
        ${emp.logoUrl ? `<img src="${escapeHtml(emp.logoUrl)}" alt="Logo" />` : ''}
        <div>
          <div class="title">Comprovante Individual de Avaliação</div>
          <div class="sub">${escapeHtml(emp.razaoSocial)}${formatIssuerDocument(emp) ? ` · ${escapeHtml(formatIssuerDocument(emp))}` : ''}</div>
        </div>
      </div>
      <div class="code-box">
        <div><strong>${escapeHtml(payload.codigoEvidencia)}</strong></div>
        <div>Turma: ${escapeHtml(t.codigoTurma)}</div>
      </div>
    </div>

    <div class="score-banner">
      <div>
        <div style="font-size:11px;color:#475569;font-weight:600">RESULTADO OFICIAL DA AVALIAÇÃO</div>
        <div style="font-size:16px;font-weight:800;color:${statusColor};margin-top:2px">${escapeHtml(p.status)}</div>
        <div style="font-size:11px;color:#475569;margin-top:2px">
          Acertos: <strong>${p.acertos}/${p.totalQuestoes}</strong> · Nota mínima exigida: <strong>${p.notaMinima}%</strong>
        </div>
      </div>
      <div class="score-num">${p.notaPercentual}%</div>
    </div>

    <div class="meta-grid">
      <div>
        <div class="meta-label">Colaborador</div>
        <div class="meta-val">${escapeHtml(p.nome)}</div>
      </div>
      <div>
        <div class="meta-label">CPF</div>
        <div class="meta-val mono">${escapeHtml(p.cpf)}</div>
      </div>
      <div>
        <div class="meta-label">Função</div>
        <div class="meta-val">${escapeHtml(p.funcao)}</div>
      </div>
      <div>
        <div class="meta-label">Treinamento / Norma</div>
        <div class="meta-val">${escapeHtml(t.nrCodigo)} — ${escapeHtml(t.titulo)} (${t.cargaHorariaHoras}h)</div>
      </div>
      <div>
        <div class="meta-label">Data / Conclusão</div>
        <div class="meta-val mono">${formatDatePtBr(t.dataRealizacaoIso)}${t.horarioOficial ? ` · ${escapeHtml(t.horarioOficial)}` : p.dataHoraConclusao ? ` · ${escapeHtml(p.dataHoraConclusao)}` : ''}</div>
      </div>
      <div>
        <div class="meta-label">Contrato / Obra</div>
        <div class="meta-val">${escapeHtml(t.contratoObraNome || 'Geral')}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:36px" class="center">#</th>
          <th>Questão</th>
          <th style="width:74px" class="center">Marcada</th>
          <th style="width:68px" class="center">Gabarito</th>
          <th style="width:88px" class="center">Resultado</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="5" class="center" style="padding:16px;color:#64748b">Avaliação registrada sem questões objetivas vinculadas.</td></tr>'}
      </tbody>
    </table>

    <div class="sigs">
      <div class="sig-box">
        ${p.assinaturaDataUrl ? `<img class="sig-img" src="${escapeHtml(p.assinaturaDataUrl)}" alt="Assinatura Colaborador" />` : '<div style="height:36px"></div>'}
        <div class="sig-line">${escapeHtml(p.nome)}</div>
        <div class="sig-role">Colaborador Avaliado</div>
      </div>
      <div class="sig-box">
        ${t.instrutorAssinaturaUrl ? `<img class="sig-img" src="${escapeHtml(t.instrutorAssinaturaUrl)}" alt="Assinatura Instrutor" />` : '<div style="height:36px"></div>'}
        <div class="sig-line">${escapeHtml(t.instrutorNome || 'Instrutor / TST')}</div>
        <div class="sig-role">${escapeHtml(t.instrutorRegistro || 'Instrutor')}</div>
      </div>
      <div class="sig-box">
        ${t.rtAssinaturaUrl ? `<img class="sig-img" src="${escapeHtml(t.rtAssinaturaUrl)}" alt="Assinatura RT" />` : '<div style="height:36px"></div>'}
        <div class="sig-line">${escapeHtml(t.rtNome || 'Responsável Técnico')}</div>
        <div class="sig-role">${escapeHtml(t.rtRegistro || 'RT')}</div>
      </div>
      <div class="qr">
        ${qrCodeSvg}
        <div class="mono" style="font-size:8px;text-align:center;color:#475569;margin-top:2px">${escapeHtml(payload.codigoEvidencia)}</div>
      </div>
    </div>
  </div>
</body>
</html>`;

  return { html, qrCodeSvg };
}

// ============================================================================
// 3. DOSSIÊ COMPLETO DA APLICAÇÃO (PROVA-...)
// ============================================================================

export async function renderDossieAplicacaoHtml(
  payload: DossieAplicacaoPayload
): Promise<{ html: string; qrCodeSvg: string }> {
  const base = payload.validationBaseUrl.replace(/\/$/, '');
  const validationUrl = `${base}/?aplicacao=${encodeURIComponent(payload.codigoDossie)}`;
  const qrCodeSvg = await QRCode.toString(validationUrl, {
    type: 'svg',
    margin: 1,
    width: 96,
  });

  const emp = payload.empresa;
  const t = payload.turma;
  const primary = emp.corPrimaria || '#0F172A';
  const linhas = [...t.conteudoLinhas].sort((a, b) => a.ordem - b.ordem);
  const mid = Math.ceil(linhas.length / 2);
  const col1 = linhas.slice(0, mid);
  const col2 = linhas.slice(mid);

  const renderCols = (items: typeof linhas) =>
    items
      .map(
        (l) =>
          `<li style="margin-bottom:4px;font-size:10.5px;line-height:1.4"><strong>${String(l.ordem).padStart(2, '0')}.</strong> ${escapeHtml(l.descricao)}</li>`
      )
      .join('');

  const participantPages = payload.participantes
    .map((p, idx) => {
      const qRows = p.questoes
        .map(
          (q) => `
          <tr>
            <td class="mono center">${String(q.ordem).padStart(2, '0')}</td>
            <td>${escapeHtml(q.enunciado)}</td>
            <td class="mono center"><strong>${escapeHtml(q.respostaMarcada || '—')}</strong></td>
            <td class="center"><span class="pill ${q.correta ? 'pill-ok' : 'pill-err'}">${q.correta ? 'Correta' : 'Incorreta'}</span></td>
          </tr>`
        )
        .join('');

      return `
      <section class="page">
        <div class="header">
          <div>
            <div class="title">Folha de Respostas Individual — ${escapeHtml(p.codigoEvidencia)}</div>
            <div class="sub">${escapeHtml(payload.codigoDossie)} · Participante ${idx + 1} de ${payload.participantes.length}</div>
          </div>
          <div class="mono" style="text-align:right;font-size:11px">
            <div><strong>Nota: ${p.notaPercentual}%</strong></div>
            <div style="color:${p.status === 'APROVADO' ? '#15803D' : '#B91C1C'};font-weight:700">${escapeHtml(p.status)}</div>
          </div>
        </div>

        <div class="meta-grid">
          <div><div class="meta-label">Colaborador</div><div class="meta-val">${escapeHtml(p.nome)}</div></div>
          <div><div class="meta-label">CPF</div><div class="meta-val mono">${escapeHtml(p.cpf)}</div></div>
          <div><div class="meta-label">Função</div><div class="meta-val">${escapeHtml(p.funcao)}</div></div>
          <div><div class="meta-label">Acertos</div><div class="meta-val mono">${p.acertos}/${p.totalQuestoes}</div></div>
          <div><div class="meta-label">Conclusão</div><div class="meta-val mono">${escapeHtml(p.dataHoraConclusao)}</div></div>
          <div><div class="meta-label">Norma</div><div class="meta-val">${escapeHtml(t.nrCodigo)} (${t.cargaHorariaHoras}h)</div></div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:36px" class="center">#</th>
              <th>Questão</th>
              <th style="width:74px" class="center">Resposta</th>
              <th style="width:86px" class="center">Resultado</th>
            </tr>
          </thead>
          <tbody>${qRows || '<tr><td colspan="4" class="center" style="padding:12px;color:#64748b">Sem respostas objetivas registradas.</td></tr>'}</tbody>
        </table>

        <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-top:auto;padding-top:12px;border-top:1px solid #e2e8f0">
          ${p.selfieDataUrl ? `<img src="${escapeHtml(p.selfieDataUrl)}" alt="Selfie" style="height:64px;width:64px;object-fit:cover;border-radius:8px;border:1px solid #cbd5e1" />` : '<div></div>'}
          <div style="text-align:center;min-width:220px">
            ${p.assinaturaDataUrl ? `<img src="${escapeHtml(p.assinaturaDataUrl)}" alt="Assinatura" style="max-height:36px;margin:0 auto 4px;display:block" />` : '<div style="height:36px"></div>'}
            <div style="border-top:1px solid #475569;padding-top:4px;font-size:10px;font-weight:700">${escapeHtml(p.nome)}</div>
            <div style="font-size:9px;color:#64748b">Assinatura Digital na Avaliação</div>
          </div>
        </div>
      </section>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Dossiê Completo ${escapeHtml(payload.codigoDossie)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'DM Sans', Arial, sans-serif; background: #e2e8f0; color: #0f172a; }
    .page {
      width: 210mm;
      min-height: 297mm;
      background: #ffffff;
      margin: 12px auto;
      padding: 14mm;
      border: 1px solid #cbd5e1;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${escapeHtml(primary)}; padding-bottom: 10px; }
    .title { font-size: 16px; font-weight: 800; color: #0f172a; }
    .sub { font-size: 11px; color: #475569; margin-top: 2px; }
    .mono { font-family: 'JetBrains Mono', monospace; }
    .center { text-align: center; }
    .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; font-size: 11px; }
    .meta-label { color: #64748b; font-size: 9.5px; text-transform: uppercase; }
    .meta-val { font-weight: 600; color: #0f172a; margin-top: 2px; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; list-style: none; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    th { background: #f8fafc; border-bottom: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; font-size: 10px; color: #475569; }
    td { border-bottom: 1px solid #f1f5f9; padding: 6px 8px; }
    .pill { display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 9.5px; font-weight: 700; }
    .pill-ok { background: #dcfce7; color: #166534; }
    .pill-err { background: #fee2e2; color: #991b1b; }
    @media print {
      body { background: #fff; }
      .page { margin: 0; border: none; width: auto; min-height: auto; padding: 0; }
      .page:last-child { page-break-after: auto; }
    }
  </style>
</head>
<body>
  <!-- CAPA DO DOSSIÊ -->
  <section class="page">
    <div class="header">
      <div style="display:flex;align-items:center;gap:12px">
        ${emp.logoUrl ? `<img src="${escapeHtml(emp.logoUrl)}" alt="Logo" style="max-height:42px;max-width:120px;object-fit:contain" />` : ''}
        <div>
          <div class="title">Dossiê Completo da Aplicação</div>
          <div class="sub">${escapeHtml(emp.razaoSocial)}${formatIssuerDocument(emp) ? ` · ${escapeHtml(formatIssuerDocument(emp))}` : ''}</div>
        </div>
      </div>
      <div class="mono" style="text-align:right;font-size:11px">
        <div><strong>${escapeHtml(payload.codigoDossie)}</strong></div>
        <div>Turma: ${escapeHtml(t.codigoTurma)}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div><div class="meta-label">Treinamento / Norma</div><div class="meta-val">${escapeHtml(t.nrCodigo)} — ${escapeHtml(t.titulo)}</div></div>
      <div><div class="meta-label">Contrato / Obra</div><div class="meta-val">${escapeHtml(t.contratoObraNome || 'Geral')}</div></div>
      <div><div class="meta-label">Carga Horária</div><div class="meta-val mono">${t.cargaHorariaHoras} horas</div></div>
      <div><div class="meta-label">Período / Data</div><div class="meta-val mono">${formatDatePtBr(t.dataRealizacaoIso)}</div></div>
      <div><div class="meta-label">Horário Registrado</div><div class="meta-val mono">${escapeHtml(t.horarioOficial || 'Não registrado')}</div></div>
      <div><div class="meta-label">Local</div><div class="meta-val">${escapeHtml(t.localRealizacao || formatEmpresaAddress(emp) || 'Unidade Operacional')}</div></div>
      <div><div class="meta-label">Instrutor / TST</div><div class="meta-val">${escapeHtml(t.instrutorNome || '—')} ${t.instrutorRegistro ? `(${escapeHtml(t.instrutorRegistro)})` : ''}</div></div>
      <div><div class="meta-label">Responsável Técnico</div><div class="meta-val">${escapeHtml(t.rtNome || '—')} ${t.rtRegistro ? `(${escapeHtml(t.rtRegistro)})` : ''}</div></div>
      <div><div class="meta-label">Avaliações Anexadas</div><div class="meta-val mono">${payload.participantes.length} folha(s)</div></div>
    </div>

    <div>
      <div style="font-size:12px;font-weight:700;margin-bottom:6px">Conteúdo Programático Ministrado (2 colunas)</div>
      <div class="two-col">
        <ul style="list-style:none">${renderCols(col1)}</ul>
        <ul style="list-style:none">${renderCols(col2)}</ul>
      </div>
    </div>

    <div style="margin-top:auto;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:10px;color:#475569">
        <div><strong>Resumo de Evidências:</strong> ${payload.participantes.filter((p) => p.status === 'APROVADO').length} aprovado(s) · ${payload.participantes.filter((p) => p.status !== 'APROVADO').length} reprovado(s)/pendente(s)</div>
        <div>Documento gerado vetorialmente para auditoria trabalhista e mobilização de contrato.</div>
      </div>
      <div>${qrCodeSvg}</div>
    </div>
  </section>

  ${participantPages}
</body>
</html>`;

  return { html, qrCodeSvg };
}

// ============================================================================
// 4. CARTA DE ANUÊNCIA (CAN-...) — 4 ASSINATURAS
// ============================================================================

export async function renderCartaAnuenciaHtml(
  payload: CartaAnuenciaRenderPayload
): Promise<{ html: string; qrCodeSvg: string }> {
  const base = payload.validationBaseUrl.replace(/\/$/, '');
  const validationUrl = `${base}/?carta=${encodeURIComponent(payload.codigoCarta)}`;
  const qrCodeSvg = await QRCode.toString(validationUrl, {
    type: 'svg',
    margin: 1,
    width: 92,
  });

  const emp = payload.empresa;
  const col = payload.colaborador;
  const c = payload.carta;
  const primary = emp.corPrimaria || '#0F172A';
  const address = formatEmpresaAddress(emp);

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Carta de Anuência ${escapeHtml(payload.codigoCarta)} — ${escapeHtml(col.nome)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'DM Sans', Arial, sans-serif; background: #e2e8f0; color: #0f172a; }
    .page {
      width: 210mm;
      min-height: 297mm;
      background: #ffffff;
      margin: 12px auto;
      padding: 16mm;
      border: 1px solid #cbd5e1;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid ${escapeHtml(primary)}; padding-bottom: 12px; }
    .title { font-size: 17px; font-weight: 800; color: #0f172a; letter-spacing: -0.01em; }
    .sub { font-size: 11px; color: #475569; margin-top: 2px; }
    .mono { font-family: 'JetBrains Mono', monospace; }
    .info-box { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; font-size: 11.5px; }
    .label { font-size: 9.5px; text-transform: uppercase; color: #64748b; }
    .val { font-weight: 700; color: #0f172a; margin-top: 2px; }
    .legal-body { font-size: 12.5px; line-height: 1.75; color: #1e293b; text-align: justify; white-space: pre-line; padding: 6px 2px; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px 26px; margin-top: auto; padding-top: 16px; border-top: 1px solid #e2e8f0; }
    .sig-item { text-align: center; }
    .sig-slot { height: 42px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px; }
    .sig-slot img { max-height: 40px; max-width: 150px; object-fit: contain; }
    .sig-line { border-top: 1px solid #334155; padding-top: 5px; font-size: 11px; font-weight: 700; color: #0f172a; }
    .sig-role { font-size: 9.5px; color: #64748b; margin-top: 2px; }
    .footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 10px; color: #475569; }
    @media print {
      body { background: #fff; }
      .page { margin: 0; border: none; width: auto; min-height: auto; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div style="display:flex;align-items:center;gap:12px">
        ${emp.logoUrl ? `<img src="${escapeHtml(emp.logoUrl)}" alt="Logo" style="max-height:44px;max-width:130px;object-fit:contain" />` : ''}
        <div>
          <div class="title">CARTA DE ANUÊNCIA E AUTORIZAÇÃO</div>
          <div class="sub">${escapeHtml(c.titulo)} · Referência ${escapeHtml(c.nrReferencia)}</div>
        </div>
      </div>
      <div class="mono" style="text-align:right;font-size:11px">
        <div><strong>${escapeHtml(payload.codigoCarta)}</strong></div>
        <div>Validade: ${formatDatePtBr(c.validadeIso)}</div>
      </div>
    </div>

    <div class="info-box">
      <div><div class="label">Empresa Emissora</div><div class="val">${escapeHtml(emp.razaoSocial)}${formatIssuerDocument(emp) ? ` (${escapeHtml(formatIssuerDocument(emp))})` : ''}</div></div>
      <div><div class="label">Funcionário Autorizado</div><div class="val">${escapeHtml(col.nome)} · CPF ${escapeHtml(col.cpf)}</div></div>
      <div><div class="label">Função Exercida</div><div class="val">${escapeHtml(col.funcao)}</div></div>
      <div><div class="label">Período / Local de Referência</div><div class="val">${escapeHtml(c.periodoRealizacao)}${c.localRealizacao ? ` · ${escapeHtml(c.localRealizacao)}` : ''}</div></div>
    </div>

    <div class="legal-body">${escapeHtml(c.textoLegal)}</div>

    <div class="sig-grid">
      <div class="sig-item">
        <div class="sig-slot">
          ${col.assinaturaDataUrl ? `<img src="${escapeHtml(col.assinaturaDataUrl)}" alt="Assinatura Funcionário" />` : ''}
        </div>
        <div class="sig-line">${escapeHtml(col.nome)}</div>
        <div class="sig-role">1. Funcionário Autorizado · CPF ${escapeHtml(col.cpf)}</div>
      </div>

      <div class="sig-item">
        <div class="sig-slot">
          ${c.tstAssinaturaUrl ? `<img src="${escapeHtml(c.tstAssinaturaUrl)}" alt="Assinatura TST" />` : ''}
        </div>
        <div class="sig-line">${escapeHtml(c.tstNome || 'Técnico de Segurança do Trabalho')}</div>
        <div class="sig-role">2. TST · ${escapeHtml(c.tstRegistro || 'Registro MTE')}</div>
      </div>

      <div class="sig-item">
        <div class="sig-slot">
          ${c.prepostoAssinaturaUrl ? `<img src="${escapeHtml(c.prepostoAssinaturaUrl)}" alt="Assinatura Preposto" />` : ''}
        </div>
        <div class="sig-line">${escapeHtml(c.prepostoNome || emp.razaoSocial)}</div>
        <div class="sig-role">3. Responsável pela Empresa / Preposto</div>
      </div>

      <div class="sig-item">
        <div class="sig-slot">
          ${c.rtAssinaturaUrl ? `<img src="${escapeHtml(c.rtAssinaturaUrl)}" alt="Assinatura RT" />` : ''}
        </div>
        <div class="sig-line">${escapeHtml(c.rtNome || 'Responsável Técnico')}</div>
        <div class="sig-role">4. Responsável Técnico (RT) · ${escapeHtml(c.rtRegistro || 'CREA')}</div>
      </div>
    </div>

    <div class="footer">
      <div>
        <div><strong>${escapeHtml(emp.razaoSocial)}</strong>${address ? ` · ${escapeHtml(address)}` : ''}</div>
        <div>Código da Carta: <span class="mono">${escapeHtml(payload.codigoCarta)}</span> · Validade normativa até ${formatDatePtBr(c.validadeIso)}</div>
      </div>
      <div>${qrCodeSvg}</div>
    </div>
  </div>
</body>
</html>`;

  return { html, qrCodeSvg };
}

// ============================================================================
// 5. LISTAS DA APLICAÇÃO (LISTA OFICIAL / LISTA COM STATUS)
// ============================================================================

export function renderListaPresencaHtml(payload: ListaPresencaPayload): { html: string } {
  const emp = payload.empresa;
  const t = payload.turma;
  const isOficial = payload.modo === 'oficial';
  const primary = emp.corPrimaria || '#0F172A';

  const rows = payload.participantes
    .map((p) =>
      isOficial
        ? `
      <tr>
        <td class="mono center">${String(p.ordem).padStart(2, '0')}</td>
        <td><strong>${escapeHtml(p.nome)}</strong></td>
        <td class="mono">${escapeHtml(p.cpfMascarado)}</td>
        <td>${escapeHtml(p.funcao)}</td>
        <td style="width:200px;border-bottom:1px solid #94a3b8"></td>
      </tr>`
        : `
      <tr>
        <td class="mono center">${String(p.ordem).padStart(2, '0')}</td>
        <td><strong>${escapeHtml(p.nome)}</strong><div style="font-size:9.5px;color:#64748b">${escapeHtml(p.funcao)}</div></td>
        <td class="mono">${escapeHtml(p.cpfMascarado)}</td>
        <td><strong>${escapeHtml(p.situacao)}</strong></td>
        <td class="mono center">${escapeHtml(p.nota || '—')}</td>
        <td class="mono center">${escapeHtml(p.pin || '—')}</td>
        <td class="mono">${escapeHtml(p.codigoEvidencia || '—')}</td>
        <td class="mono">${escapeHtml(p.numeroCertificado || '—')}</td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${isOficial ? 'Lista Oficial de Presença' : 'Lista com Status'} — ${escapeHtml(t.codigoTurma)}</title>
  <style>
    @page { size: A4 ${isOficial ? 'portrait' : 'landscape'}; margin: 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'DM Sans', Arial, sans-serif; background: #e2e8f0; color: #0f172a; }
    .page {
      width: ${isOficial ? '210mm' : '297mm'};
      min-height: ${isOficial ? '297mm' : '210mm'};
      background: #ffffff;
      margin: 12px auto;
      padding: 14mm;
      border: 1px solid #cbd5e1;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid ${escapeHtml(primary)}; padding-bottom: 10px; }
    .title { font-size: 16px; font-weight: 800; }
    .sub { font-size: 11px; color: #475569; margin-top: 2px; }
    .mono { font-family: 'JetBrains Mono', monospace; }
    .center { text-align: center; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    th { background: #f8fafc; border-bottom: 1px solid #cbd5e1; padding: 7px 8px; text-align: left; font-size: 10px; color: #475569; }
    td { border-bottom: 1px solid #e2e8f0; padding: 9px 8px; }
    @media print {
      body { background: #fff; }
      .page { margin: 0; border: none; width: auto; min-height: auto; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="title">${isOficial ? 'Lista Oficial de Presença' : 'Relatório de Aplicação e Status dos Participantes'}</div>
        <div class="sub">${escapeHtml(emp.razaoSocial)}${formatIssuerDocument(emp) ? ` · ${escapeHtml(formatIssuerDocument(emp))}` : ''}</div>
      </div>
      <div class="mono" style="text-align:right;font-size:11px">
        <div><strong>${escapeHtml(t.codigoTurma)}</strong></div>
        <div>${escapeHtml(t.nrCodigo)} (${t.cargaHorariaHoras}h) · ${formatDatePtBr(t.dataRealizacaoIso)}</div>
      </div>
    </div>

    <div style="font-size:11px;color:#334155;display:flex;flex-wrap:wrap;gap:14px">
      <span><strong>Turma:</strong> ${escapeHtml(t.titulo)}</span>
      <span><strong>Contrato/Obra:</strong> ${escapeHtml(t.contratoObraNome || 'Geral')}</span>
      <span><strong>Instrutor:</strong> ${escapeHtml(t.instrutorNome || '—')}</span>
      <span><strong>RT:</strong> ${escapeHtml(t.rtNome || '—')}</span>
    </div>

    <table>
      <thead>
        ${
          isOficial
            ? `<tr><th style="width:36px" class="center">#</th><th>Colaborador</th><th style="width:120px">CPF</th><th>Função</th><th style="width:210px">Assinatura Física</th></tr>`
            : `<tr><th style="width:36px" class="center">#</th><th>Colaborador</th><th>CPF</th><th>Situação</th><th class="center">Nota</th><th class="center">PIN</th><th>Evidência</th><th>Certificado</th></tr>`
        }
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="8" class="center" style="padding:18px;color:#64748b">Nenhum participante vinculado a esta aplicação.</td></tr>'}
      </tbody>
    </table>
  </div>
</body>
</html>`;

  return { html };
}

// ============================================================================
// 6. PACOTE COMPLETO DE AUDITORIA (CERTIFICADO + COMPROVANTE + CARTA)
// ============================================================================

export async function renderPacoteAuditoriaHtml(params: {
  certificado: CertificateRenderPayload;
  comprovante?: ComprovanteAvaliacaoPayload | null;
  cartaAnuencia?: CartaAnuenciaRenderPayload | null;
}): Promise<{ html: string }> {
  const [certRes, compRes, cartaRes] = await Promise.all([
    renderCertificateFrontAndBackHtml(params.certificado),
    params.comprovante ? renderComprovanteAvaliacaoHtml(params.comprovante) : Promise.resolve(null),
    params.cartaAnuencia ? renderCartaAnuenciaHtml(params.cartaAnuencia) : Promise.resolve(null),
  ]);

  const extractBody = (docHtml: string) => {
    const match = docHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return match ? match[1] : docHtml;
  };
  const extractStyle = (docHtml: string) => {
    const match = docHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    return match ? match[1].replace(/@page\s*\{[^}]*\}/gi, '') : '';
  };

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Pacote de Auditoria — ${escapeHtml(params.certificado.numeroCertificado)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'Plus Jakarta Sans', 'DM Sans', Arial, sans-serif; background: #e2e8f0; color: #0f172a; }
    .pkg-section { page-break-after: always; }
    .pkg-section:last-child { page-break-after: auto; }
    .pkg-banner {
      max-width: 297mm;
      margin: 10px auto 0;
      padding: 6px 12px;
      background: #0f172a;
      color: #f8fafc;
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      border-radius: 6px 6px 0 0;
    }
    @media print {
      body { background: #fff; }
      .pkg-banner { display: none; }
    }
    ${extractStyle(certRes.html)}
    ${compRes ? extractStyle(compRes.html) : ''}
    ${cartaRes ? extractStyle(cartaRes.html) : ''}
  </style>
</head>
<body>
  <div class="pkg-section">
    <div class="pkg-banner">1. CERTIFICADO FRENTE E VERSO — ${escapeHtml(params.certificado.numeroCertificado)}</div>
    ${extractBody(certRes.html)}
  </div>
  ${
    compRes
      ? `<div class="pkg-section">
          <div class="pkg-banner">2. COMPROVANTE INDIVIDUAL DE AVALIAÇÃO — ${escapeHtml(params.comprovante!.codigoEvidencia)}</div>
          ${extractBody(compRes.html)}
        </div>`
      : ''
  }
  ${
    cartaRes && params.cartaAnuencia
      ? `<div class="pkg-section">
          <div class="pkg-banner">${compRes ? '3' : '2'}. CARTA DE ANUÊNCIA — ${escapeHtml(params.cartaAnuencia.codigoCarta)}</div>
          ${extractBody(cartaRes.html)}
        </div>`
      : ''
  }
</body>
</html>`;

  return { html };
}

// ============================================================================
// 7. MOTOR POWERPOINT (.PPTX) POR empresa_id + CONVERSÃO LIBREOFFICE HEADLESS
// ============================================================================

const PPTX_STORAGE_DIR = path.resolve(process.cwd(), 'storage', 'pptx_templates');

function sanitizeTenantFileKey(empresaId: string): string {
  return empresaId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'empresa';
}

export async function inspectAndSavePptxTemplate(params: {
  empresaId: string;
  fileName: string;
  base64Content: string;
}): Promise<{
  empresaId: string;
  fileName: string;
  storageRelativePath: string;
  slideCount: number;
  detectedTags: string[];
  supportedTags: readonly string[];
  sizeBytes: number;
}> {
  const safeId = sanitizeTenantFileKey(params.empresaId);
  const rawBase64 = params.base64Content.includes(',')
    ? params.base64Content.split(',')[1]
    : params.base64Content;
  const buffer = Buffer.from(rawBase64, 'base64');

  if (buffer.length < 100 || buffer.length > 15 * 1024 * 1024) {
    throw new Error('Arquivo .pptx inválido ou acima do limite de 15 MB.');
  }

  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files).filter((name) =>
    /^ppt\/slides\/slide\d+\.xml$/i.test(name)
  );
  if (slideFiles.length === 0) {
    throw new Error('O arquivo enviado não é um PowerPoint (.pptx) válido com slides.');
  }

  const foundSet = new Set<string>();
  for (const slidePath of slideFiles) {
    const xml = await zip.files[slidePath].async('string');
    // PowerPoint pode quebrar uma tag em vários <a:t> runs; extraímos texto plano dos parágrafos para detecção confiável
    const plainText = xml.replace(/<[^>]+>/g, '');
    for (const tag of PPTX_SUPPORTED_TAGS) {
      if (xml.includes(tag) || plainText.includes(tag)) {
        foundSet.add(tag);
      }
    }
  }

  await fs.mkdir(PPTX_STORAGE_DIR, { recursive: true });
  const targetFile = path.join(PPTX_STORAGE_DIR, `${safeId}.pptx`);
  await fs.writeFile(targetFile, buffer);

  return {
    empresaId: safeId,
    fileName: params.fileName.slice(0, 120),
    storageRelativePath: `storage/pptx_templates/${safeId}.pptx`,
    slideCount: slideFiles.length,
    detectedTags: Array.from(foundSet),
    supportedTags: PPTX_SUPPORTED_TAGS,
    sizeBytes: buffer.length,
  };
}

function escapeXml(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Preserva 100% das camadas XML, fontes, vetores e imagens do .pptx da empresa,
 * substituindo as tags suportadas e convertendo para PDF vetorial via LibreOffice headless na VPS Ubuntu.
 */
export async function compilePptxCertificateToPdf(params: {
  empresaId: string;
  payload: CertificateRenderPayload;
}): Promise<{
  mode: 'LIBREOFFICE_PDF' | 'PPTX_PREPARED_FALLBACK';
  pdfBase64?: string;
  pptxPath?: string;
  message: string;
}> {
  const safeId = sanitizeTenantFileKey(params.empresaId);
  const templatePath = path.join(PPTX_STORAGE_DIR, `${safeId}.pptx`);

  const rawBuffer = await fs.readFile(templatePath);
  const zip = await JSZip.loadAsync(rawBuffer);

  const linhas = [...params.payload.snapshotConteudoLinhas].sort((a, b) => a.ordem - b.ordem);
  const mid = Math.ceil(linhas.length / 2);
  const col1Text = linhas
    .slice(0, mid)
    .map((l) => `${String(l.ordem).padStart(2, '0')}. ${l.descricao}`)
    .join('\n');
  const col2Text = linhas
    .slice(mid)
    .map((l) => `${String(l.ordem).padStart(2, '0')}. ${l.descricao}`)
    .join('\n');

  const tagValues: Record<string, string> = {
    '{{NOME_COLABORADOR}}': params.payload.snapshotColaborador.nome,
    '{{CPF}}': params.payload.snapshotColaborador.cpf,
    '{{FUNCAO}}': params.payload.snapshotColaborador.funcao,
    '{{NORMA_NR}}': `${params.payload.nrCodigo} — ${params.payload.treinamentoTitulo}`,
    '{{CARGA_HORARIA}}': `${params.payload.cargaHorariaHoras} horas`,
    '{{DATA_REALIZACAO}}': formatDatePtBr(params.payload.dataRealizacaoIso),
    '{{DATA_VALIDADE}}': formatDatePtBr(params.payload.dataValidadeIso),
    '{{CONTEUDO_COLUNA_1}}': col1Text,
    '{{CONTEUDO_COLUNA_2}}': col2Text,
    '{{QRCODE}}': params.payload.codigoValidacaoQr,
    '{{ASSINATURA_ALUNO}}': params.payload.ocultarAssinaturaColaborador
      ? ''
      : params.payload.snapshotColaborador.nome,
    '{{ASSINATURA_INSTRUTOR}}': params.payload.snapshotEmpresa.instrutorNome || '',
    '{{ASSINATURA_RT}}': params.payload.snapshotEmpresa.rtNome || '',
  };

  // Substitui tags preservando todas as camadas, formas, cores e estilos do XML do slide
  const slideFiles = Object.keys(zip.files).filter((name) =>
    /^ppt\/slides\/slide\d+\.xml$/i.test(name)
  );
  for (const slidePath of slideFiles) {
    let xml = await zip.files[slidePath].async('string');
    for (const [tag, value] of Object.entries(tagValues)) {
      xml = xml.split(tag).join(escapeXml(value));
    }
    zip.file(slidePath, xml);
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dk-pptx-'));
  const mergedPptxPath = path.join(tmpDir, `${params.payload.numeroCertificado}.pptx`);
  const mergedBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(mergedPptxPath, mergedBuffer);

  try {
    await execFileAsync('libreoffice', [
      '--headless',
      '--convert-to',
      'pdf',
      '--outdir',
      tmpDir,
      mergedPptxPath,
    ]);
    const pdfPath = mergedPptxPath.replace(/\.pptx$/i, '.pdf');
    const pdfBuffer = await fs.readFile(pdfPath);
    return {
      mode: 'LIBREOFFICE_PDF',
      pdfBase64: pdfBuffer.toString('base64'),
      message: 'PDF vetorial compilado via LibreOffice headless preservando 100% das camadas .pptx.',
    };
  } catch {
    return {
      mode: 'PPTX_PREPARED_FALLBACK',
      pptxPath: mergedPptxPath,
      message:
        'PPTX mesclado com camadas preservadas. Instale `libreoffice` na VPS Ubuntu (`sudo apt install libreoffice-impress`) para conversão automática para PDF.',
    };
  }
}
