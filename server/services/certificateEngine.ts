import QRCode from 'qrcode';

export interface CertificateRenderPayload {
  numeroCertificado: string;
  codigoValidacaoQr: string;
  nrCodigo: string;
  treinamentoTitulo: string;
  cargaHorariaHoras: number;
  dataRealizacaoIso: string;
  dataValidadeIso: string;
  validationBaseUrl: string;
  snapshotEmpresa: {
    razaoSocial: string;
    cnpj: string;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDatePtBr(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export async function renderCertificateFrontAndBackHtml(
  payload: CertificateRenderPayload
): Promise<{
  html: string;
  colunasVerso: 1 | 2;
  validationUrl: string;
  qrCodeSvg: string;
}> {
  const base = payload.validationBaseUrl.replace(/\/$/, '');
  const validationUrl = `${base}/validar/${payload.codigoValidacaoQr}`;
  const qrCodeSvg = await QRCode.toString(validationUrl, {
    type: 'svg',
    margin: 1,
    width: 132,
  });

  // Regra automática: até 7 linhas => 1 coluna; 8 ou mais linhas => 2 colunas balanceadas
  const linhas = [...payload.snapshotConteudoLinhas].sort((a, b) => a.ordem - b.ordem);
  const colunasVerso: 1 | 2 = linhas.length >= 8 ? 2 : 1;
  const primaryColor = payload.snapshotEmpresa.corPrimaria || '#0F172A';

  const renderLinesList = (items: typeof linhas) =>
    items
      .map(
        (item) => `
      <li class="syllabus-item">
        <span class="syllabus-index">${String(item.ordem).padStart(2, '0')}.</span>
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
        <ol class="syllabus-list">${renderLinesList(col1)}</ol>
        <ol class="syllabus-list">${renderLinesList(col2)}</ol>
      </div>
    `;
  } else {
    versoContentHtml = `
      <div class="syllabus-grid one-col">
        <ol class="syllabus-list">${renderLinesList(linhas)}</ol>
      </div>
    `;
  }

  const emp = payload.snapshotEmpresa;
  const colab = payload.snapshotColaborador;

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Certificado ${escapeHtml(payload.numeroCertificado)} — ${escapeHtml(colab.nome)}</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Plus Jakarta Sans', 'DM Sans', Arial, sans-serif; background: #e2e8f0; color: #0f172a; }
    .sheet {
      width: 297mm;
      height: 210mm;
      background: #ffffff;
      margin: 12px auto;
      padding: 14mm;
      position: relative;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      border: 1px solid #cbd5e1;
    }
    .frame {
      flex: 1;
      border: 2px solid ${escapeHtml(primaryColor)};
      padding: 12mm 14mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 8mm;
    }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand img { max-height: 46px; max-width: 140px; object-fit: contain; }
    .brand-title { font-size: 15px; font-weight: 700; color: #0f172a; }
    .brand-sub { font-size: 11px; color: #475569; margin-top: 2px; }
    .cert-code { text-align: right; font-family: monospace; font-size: 11px; color: #334155; }
    .center-block { text-align: center; padding: 8mm 6mm; }
    .kicker { font-size: 12px; letter-spacing: 2.5px; color: ${escapeHtml(primaryColor)}; font-weight: 700; text-transform: uppercase; }
    .student-name { font-size: 28px; font-weight: 800; color: #0f172a; margin: 6mm 0 3mm; }
    .student-meta { font-size: 13px; color: #475569; margin-bottom: 6mm; }
    .body-text { font-size: 14px; line-height: 1.65; color: #1e293b; max-width: 215mm; margin: 0 auto; }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr auto;
      gap: 10mm;
      align-items: end;
      padding-top: 6mm;
      border-top: 1px solid #e2e8f0;
    }
    .sig-box { text-align: center; }
    .sig-img { height: 34px; object-fit: contain; margin: 0 auto 4px; display: block; }
    .sig-line { border-top: 1px solid #475569; padding-top: 4px; font-size: 11px; font-weight: 600; color: #0f172a; }
    .sig-role { font-size: 10px; color: #64748b; }
    .qr-box { text-align: center; }
    .qr-box svg { width: 88px; height: 88px; display: block; margin: 0 auto; }
    .qr-code-text { font-family: monospace; font-size: 9px; color: #475569; margin-top: 3px; }
    .verso-title { font-size: 16px; font-weight: 700; color: #0f172a; }
    .verso-sub { font-size: 11px; color: #475569; margin-top: 2px; }
    .syllabus-grid { margin-top: 6mm; flex: 1; }
    .syllabus-grid.two-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; }
    .syllabus-list { list-style: none; display: flex; flex-direction: column; gap: 7px; }
    .syllabus-item { display: flex; align-items: baseline; gap: 6px; font-size: 11.5px; line-height: 1.45; color: #1e293b; border-bottom: 1px solid #f1f5f9; padding-bottom: 5px; }
    .syllabus-index { font-family: monospace; font-weight: 700; color: ${escapeHtml(primaryColor)}; min-width: 22px; }
    .syllabus-text { flex: 1; }
    .syllabus-min { font-family: monospace; font-size: 10px; color: #64748b; white-space: nowrap; }
    .verso-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e2e8f0; padding-top: 5mm; font-size: 10.5px; color: #475569; }
    @media print {
      body { background: #fff; }
      .sheet { margin: 0; border: none; }
    }
  </style>
</head>
<body>
  <!-- FRENTE -->
  <section class="sheet">
    <div class="frame">
      <div class="header">
        <div class="brand">
          ${emp.logoUrl ? `<img src="${escapeHtml(emp.logoUrl)}" alt="Logo da Empresa" />` : ''}
          <div>
            <div class="brand-title">${escapeHtml(emp.razaoSocial)}</div>
            <div class="brand-sub">CNPJ ${escapeHtml(emp.cnpj)}${emp.cidade ? ` · ${escapeHtml(emp.cidade)}${emp.uf ? `/${escapeHtml(emp.uf)}` : ''}` : ''}</div>
          </div>
        </div>
        <div class="cert-code">
          <div>Nº ${escapeHtml(payload.numeroCertificado)}</div>
          <div>Validação: ${escapeHtml(payload.codigoValidacaoQr)}</div>
        </div>
      </div>

      <div class="center-block">
        <div class="kicker">Certificado de Capacitação Profissional</div>
        <div class="student-name">${escapeHtml(colab.nome)}</div>
        <div class="student-meta">CPF: ${escapeHtml(colab.cpf)} · Função: ${escapeHtml(colab.funcao)}</div>
        <p class="body-text">
          Certificamos que o(a) profissional acima identificado(a) concluiu com aproveitamento o treinamento
          <strong>${escapeHtml(payload.nrCodigo)} — ${escapeHtml(payload.treinamentoTitulo)}</strong>,
          com carga horária total de <strong>${payload.cargaHorariaHoras} horas</strong>,
          realizado em <strong>${formatDatePtBr(payload.dataRealizacaoIso)}</strong>,
          com validade normativa até <strong>${formatDatePtBr(payload.dataValidadeIso)}</strong>.
        </p>
      </div>

      <div class="signatures">
        <div class="sig-box">
          ${colab.assinaturaDataUrl ? `<img class="sig-img" src="${escapeHtml(colab.assinaturaDataUrl)}" alt="Assinatura do Colaborador" />` : ''}
          <div class="sig-line">${escapeHtml(colab.nome)}</div>
          <div class="sig-role">Colaborador</div>
        </div>
        <div class="sig-box">
          ${emp.instrutorAssinaturaUrl ? `<img class="sig-img" src="${escapeHtml(emp.instrutorAssinaturaUrl)}" alt="Assinatura do Instrutor" />` : ''}
          <div class="sig-line">${escapeHtml(emp.instrutorNome || 'Instrutor / TST')}</div>
          <div class="sig-role">${escapeHtml(emp.instrutorRegistro || 'Profissional Habilitado')}</div>
        </div>
        <div class="sig-box">
          ${emp.rtAssinaturaUrl ? `<img class="sig-img" src="${escapeHtml(emp.rtAssinaturaUrl)}" alt="Assinatura do Responsável Técnico" />` : ''}
          <div class="sig-line">${escapeHtml(emp.rtNome || 'Responsável Técnico')}</div>
          <div class="sig-role">${escapeHtml(emp.rtRegistro || 'Coordenação Técnica SST')}</div>
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
            <div class="verso-sub">${escapeHtml(payload.treinamentoTitulo)} · Carga Horária: ${payload.cargaHorariaHoras}h · Layout automático em ${colunasVerso} ${colunasVerso === 1 ? 'coluna' : 'colunas'}</div>
          </div>
          <div class="cert-code">
            <div>Certificado ${escapeHtml(payload.numeroCertificado)}</div>
            <div>Emitido por ${escapeHtml(emp.razaoSocial)}</div>
          </div>
        </div>
        ${versoContentHtml}
      </div>

      <div class="verso-footer">
        <div>
          Autenticidade verificável permanentemente via QR Code ou endereço: <strong>${escapeHtml(validationUrl)}</strong>
        </div>
        <div class="qr-box" style="display:flex;align-items:center;gap:10px;">
          ${qrCodeSvg}
        </div>
      </div>
    </div>
  </section>
</body>
</html>`;

  return { html, colunasVerso, validationUrl, qrCodeSvg };
}
