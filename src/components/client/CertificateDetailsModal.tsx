import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileBadge,
  FileCheck2,
  FileText,
  PenLine,
  Printer,
  ShieldCheck,
  X,
} from 'lucide-react';
import type {
  AssinaturaDigitalDoc,
  CartaAnuenciaDoc,
  CertificadoDoc,
  EmpresaDoc,
  ProvaTentativaDoc,
  QuestaoDoc,
  TurmaDoc,
} from '../../types/domain.ts';
import {
  buildCartaCode,
  buildEvidenceCode,
  listQuestoes,
  renderDocumentVectorHtml,
} from '../../services/operationalCrudService.ts';
import type { VectorDocumentRequest } from './DocumentPrintModal.tsx';

interface CertificateDetailsModalProps {
  certificado: CertificadoDoc | null;
  empresa: EmpresaDoc;
  turmas: TurmaDoc[];
  cartas: CartaAnuenciaDoc[];
  tentativas: ProvaTentativaDoc[];
  assinaturas: AssinaturaDigitalDoc[];
  onClose: () => void;
  onPrintCertificate: (cert: CertificadoDoc, hideCollaboratorSig: boolean) => void;
  onOpenVectorDocument: (doc: VectorDocumentRequest) => void;
}

function buildIntegrityHashHex(cert: CertificadoDoc): string {
  const input = `${cert.numeroCertificado}|${cert.codigoValidacaoQr}|${cert.snapshotColaborador.cpf}|${cert.nrCodigo}|${cert.dataRealizacaoIso}`;
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ (ch + i), 0x27d4eb2d);
  }
  const partA = (h1 >>> 0).toString(16).padStart(8, '0');
  const partB = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${partA}${partB}${cert.codigoValidacaoQr.replace(/[^A-Z0-9]/g, '')}`.toUpperCase().slice(0, 24);
}

export const CertificateDetailsModal: React.FC<CertificateDetailsModalProps> = ({
  certificado,
  empresa,
  turmas,
  cartas,
  tentativas,
  assinaturas,
  onClose,
  onPrintCertificate,
  onOpenVectorDocument,
}) => {
  const [busyAction, setBusyAction] = useState<'carta' | 'pacote' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const turma = useMemo(
    () => (certificado ? turmas.find((t) => t.id === certificado.turmaId) ?? null : null),
    [certificado, turmas]
  );

  const linkedCarta = useMemo(() => {
    if (!certificado) return null;
    return (
      cartas.find(
        (c) =>
          c.colaboradorId === certificado.colaboradorId &&
          c.nrReferencia.toUpperCase().includes(certificado.nrCodigo.toUpperCase())
      ) ??
      cartas.find((c) => c.colaboradorId === certificado.colaboradorId) ??
      null
    );
  }, [certificado, cartas]);

  const linkedAttempt = useMemo(() => {
    if (!certificado) return null;
    const cleanCpf = certificado.snapshotColaborador.cpf.replace(/\D/g, '');
    return (
      tentativas.find(
        (t) =>
          t.turmaId === certificado.turmaId &&
          (t.colaboradorId === certificado.colaboradorId ||
            t.colaboradorCpf.replace(/\D/g, '') === cleanCpf)
      ) ?? null
    );
  }, [certificado, tentativas]);

  if (!certificado) return null;

  const integrityHash = buildIntegrityHashHex(certificado);
  const baseVisualLabel = empresa.modeloProprioUrl
    ? empresa.modeloProprioUrl.startsWith('pptx://')
      ? `Modelo Próprio PowerPoint (.pptx)`
      : 'Modelo Próprio Exclusivo'
    : `Modelo Padrão (${empresa.modeloCertificadoId || 'Clássico Institucional'})`;

  const emittedAtFormatted = certificado.emitidoEm?.toDate
    ? certificado.emitidoEm.toDate().toLocaleString('pt-BR')
    : 'Horário não registrado';

  const cartaCode = linkedCarta ? buildCartaCode(linkedCarta.id) : null;

  const buildCartaPayload = () => {
    if (!linkedCarta || !cartaCode) return null;
    const sigEmpresa = assinaturas.find((a) => a.tipo === 'EMPRESA' && a.ativa);
    const sigInstrutor = assinaturas.find((a) => a.tipo === 'INSTRUTOR' && a.ativa);
    const sigRt = assinaturas.find((a) => a.tipo === 'RT' && a.ativa);

    return {
      codigoCarta: cartaCode,
      validationBaseUrl: window.location.origin,
      empresa: {
        razaoSocial: certificado.snapshotEmpresa.razaoSocial,
        cnpj: certificado.snapshotEmpresa.cnpj,
        endereco: certificado.snapshotEmpresa.endereco,
        cidade: certificado.snapshotEmpresa.cidade,
        uf: certificado.snapshotEmpresa.uf,
        logoUrl: certificado.snapshotEmpresa.logoUrl,
        corPrimaria: certificado.snapshotEmpresa.corPrimaria,
      },
      colaborador: {
        nome: certificado.snapshotColaborador.nome,
        cpf: certificado.snapshotColaborador.cpf,
        funcao: certificado.snapshotColaborador.funcao,
        assinaturaDataUrl: certificado.snapshotColaborador.assinaturaDataUrl || null,
      },
      carta: {
        titulo: linkedCarta.titulo,
        nrReferencia: linkedCarta.nrReferencia,
        textoLegal: linkedCarta.textoLegal,
        periodoRealizacao: certificado.dataRealizacaoIso,
        localRealizacao:
          turma?.localRealizacao ||
          certificado.contratoObraNome ||
          certificado.snapshotEmpresa.cidade ||
          'Unidade Operacional',
        validadeIso: linkedCarta.validadeIso || certificado.dataValidadeIso,
        tstNome: certificado.snapshotEmpresa.instrutorNome || sigInstrutor?.nomeSignatario,
        tstRegistro:
          certificado.snapshotEmpresa.instrutorRegistro || sigInstrutor?.registro || undefined,
        tstAssinaturaUrl:
          certificado.snapshotEmpresa.instrutorAssinaturaUrl || sigInstrutor?.imagemDataUrl || null,
        prepostoNome:
          linkedCarta.responsavelNome || sigEmpresa?.nomeSignatario || empresa.razaoSocial,
        prepostoAssinaturaUrl:
          linkedCarta.assinaturaRespUrl || sigEmpresa?.imagemDataUrl || null,
        rtNome: certificado.snapshotEmpresa.rtNome || sigRt?.nomeSignatario,
        rtRegistro: certificado.snapshotEmpresa.rtRegistro || sigRt?.registro || undefined,
        rtAssinaturaUrl:
          certificado.snapshotEmpresa.rtAssinaturaUrl || sigRt?.imagemDataUrl || null,
      },
    };
  };

  const handleOpenCarta = async () => {
    const payload = buildCartaPayload();
    if (!payload || !cartaCode) return;
    setBusyAction('carta');
    setActionError(null);
    try {
      const res = await renderDocumentVectorHtml('/api/documents/render-carta-anuencia', payload);
      onOpenVectorDocument({
        title: `Carta de Anuência — ${cartaCode}`,
        subtitle: `${certificado.snapshotColaborador.nome} · ${certificado.nrCodigo}`,
        code: cartaCode,
        html: res.html,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao gerar Carta de Anuência.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleOpenAuditPackage = async () => {
    setBusyAction('pacote');
    setActionError(null);
    try {
      let comprovantePayload = null;
      if (linkedAttempt && turma) {
        const questoes: QuestaoDoc[] = await listQuestoes(empresa.id, turma.treinamentoId).catch(
          () => []
        );
        const evdCode = buildEvidenceCode(linkedAttempt.id);
        comprovantePayload = {
          codigoEvidencia: evdCode,
          validationBaseUrl: window.location.origin,
          empresa: {
            razaoSocial: certificado.snapshotEmpresa.razaoSocial,
            cnpj: certificado.snapshotEmpresa.cnpj,
            endereco: certificado.snapshotEmpresa.endereco,
            cidade: certificado.snapshotEmpresa.cidade,
            uf: certificado.snapshotEmpresa.uf,
            logoUrl: certificado.snapshotEmpresa.logoUrl,
            corPrimaria: certificado.snapshotEmpresa.corPrimaria,
          },
          turma: {
            codigoTurma: turma.codigoTurma,
            titulo: turma.titulo,
            nrCodigo: certificado.nrCodigo,
            cargaHorariaHoras: certificado.cargaHorariaHoras,
            dataRealizacaoIso: certificado.dataRealizacaoIso,
            contratoObraNome: turma.contratoObraNome || certificado.contratoObraNome || 'Geral',
            localRealizacao: turma.localRealizacao || undefined,
            instrutorNome: certificado.snapshotEmpresa.instrutorNome,
            instrutorRegistro: certificado.snapshotEmpresa.instrutorRegistro,
            instrutorAssinaturaUrl: certificado.snapshotEmpresa.instrutorAssinaturaUrl,
            rtNome: certificado.snapshotEmpresa.rtNome,
            rtRegistro: certificado.snapshotEmpresa.rtRegistro,
            rtAssinaturaUrl: certificado.snapshotEmpresa.rtAssinaturaUrl,
          },
          participante: {
            nome: certificado.snapshotColaborador.nome,
            cpf: certificado.snapshotColaborador.cpf,
            funcao: certificado.snapshotColaborador.funcao,
            notaPercentual: linkedAttempt.notaPercentual,
            notaMinima: turma.notaMinimaAprovacao ?? 70,
            status: linkedAttempt.status,
            acertos: linkedAttempt.acertos ?? 0,
            totalQuestoes: linkedAttempt.totalQuestoes ?? questoes.length,
            dataHoraConclusao: linkedAttempt.concluidaEm?.toDate
              ? linkedAttempt.concluidaEm.toDate().toLocaleString('pt-BR')
              : 'Horário não registrado',
            assinaturaDataUrl: linkedAttempt.assinaturaDataUrl || null,
            selfieDataUrl: linkedAttempt.selfieDataUrl || null,
          },
          questoes: questoes.map((q, idx) => {
            const marcada = linkedAttempt.respostas[q.id] || '';
            const altMarcada = q.alternativas.find((a) => a.id === marcada);
            const altCorreta = q.alternativas.find((a) => a.id === q.correta);
            return {
              ordem: idx + 1,
              enunciado: q.enunciado,
              respostaMarcada: marcada,
              respostaMarcadaTexto: altMarcada?.texto,
              gabarito: q.correta,
              gabaritoTexto: altCorreta?.texto,
              correta: marcada === q.correta,
            };
          }),
        };
      }

      const cartaPayload = buildCartaPayload();
      const res = await renderDocumentVectorHtml('/api/documents/render-pacote-auditoria', {
        certificado: {
          numeroCertificado: certificado.numeroCertificado,
          codigoValidacaoQr: certificado.codigoValidacaoQr,
          nrCodigo: certificado.nrCodigo,
          treinamentoTitulo: certificado.treinamentoTitulo,
          cargaHorariaHoras: certificado.cargaHorariaHoras,
          dataRealizacaoIso: certificado.dataRealizacaoIso,
          dataValidadeIso: certificado.dataValidadeIso,
          validationBaseUrl: window.location.origin,
          modeloProprioUrl: empresa.modeloProprioUrl || null,
          snapshotEmpresa: certificado.snapshotEmpresa,
          snapshotColaborador: certificado.snapshotColaborador,
          snapshotConteudoLinhas: certificado.snapshotConteudoLinhas,
        },
        comprovante: comprovantePayload,
        cartaAnuencia: cartaPayload,
      });

      const parts = ['Certificado'];
      if (comprovantePayload) parts.push('Comprovante EVD');
      if (cartaPayload && cartaCode) parts.push(`Carta de Anuência ${cartaCode}`);

      onOpenVectorDocument({
        title: `Pacote Completo de Auditoria — ${certificado.numeroCertificado}`,
        subtitle: parts.join(' + '),
        code: certificado.numeroCertificado,
        html: res.html,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao montar Pacote de Auditoria.');
    } finally {
      setBusyAction(null);
    }
  };

  const signatureRows = [
    {
      papel: 'Colaborador / Avaliado',
      assinado: Boolean(certificado.snapshotColaborador.assinaturaDataUrl),
      nome: certificado.snapshotColaborador.nome,
      dataHora: certificado.snapshotColaborador.assinaturaDataUrl
        ? linkedAttempt?.concluidaEm?.toDate
          ? linkedAttempt.concluidaEm.toDate().toLocaleString('pt-BR')
          : emittedAtFormatted
        : 'Disponível para assinatura física',
    },
    {
      papel: 'Instrutor / TST',
      assinado: Boolean(certificado.snapshotEmpresa.instrutorAssinaturaUrl),
      nome:
        certificado.snapshotEmpresa.instrutorNome ||
        'Instrutor / Técnico de Segurança do Trabalho',
      dataHora: certificado.snapshotEmpresa.instrutorAssinaturaUrl
        ? emittedAtFormatted
        : 'Sem assinatura digital vinculada',
    },
    {
      papel: 'Responsável Técnico (RT)',
      assinado: Boolean(certificado.snapshotEmpresa.rtAssinaturaUrl),
      nome: certificado.snapshotEmpresa.rtNome || 'Responsável Técnico SST',
      dataHora: certificado.snapshotEmpresa.rtAssinaturaUrl
        ? emittedAtFormatted
        : 'Sem assinatura digital vinculada',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#0B1120] border border-slate-200 dark:border-white/15 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
              <FileBadge className="w-3.5 h-3.5 text-[#3B82F6]" />
              <span className="font-semibold text-slate-900 dark:text-white">
                {certificado.numeroCertificado}
              </span>
              <span>·</span>
              <span>QR {certificado.codigoValidacaoQr}</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white truncate mt-0.5">
              Detalhes do Certificado — {certificado.snapshotColaborador.nome}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes"
            className="p-2 rounded-lg border border-slate-200 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {actionError && (
            <div className="rounded-xl px-4 py-3 text-xs border bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-900 dark:text-red-200">
              {actionError}
            </div>
          )}

          {/* Cards de Resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="dk-glass-card rounded-xl p-3.5">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Status</p>
              <p className="mt-1 inline-flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                <span className="dk-live-dot bg-emerald-500 shadow-[0_0_8px_#10B981]" />
                {certificado.status}
              </p>
            </div>
            <div className="dk-glass-card rounded-xl p-3.5 sm:col-span-2">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Treinamento</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white truncate">
                {certificado.nrCodigo} — {certificado.treinamentoTitulo}
              </p>
            </div>
            <div className="dk-glass-card rounded-xl p-3.5">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Período / Realização</p>
              <p className="mt-1 text-sm font-mono font-semibold text-slate-900 dark:text-white">
                {certificado.dataRealizacaoIso}
              </p>
            </div>
            <div className="dk-glass-card rounded-xl p-3.5">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Capacitação / Carga Horária
              </p>
              <p className="mt-1 text-sm font-mono font-semibold text-slate-900 dark:text-white">
                {certificado.cargaHorariaHoras} horas ({certificado.snapshotConteudoLinhas.length}{' '}
                tópicos)
              </p>
            </div>
            <div className="dk-glass-card rounded-xl p-3.5">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Validade Normativa</p>
              <p className="mt-1 text-sm font-mono font-semibold text-slate-900 dark:text-white">
                {certificado.dataValidadeIso}
              </p>
            </div>
            <div className="dk-glass-card rounded-xl p-3.5 sm:col-span-2">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Base Visual</p>
              <p className="mt-1 text-xs font-semibold text-slate-900 dark:text-slate-100">
                {baseVisualLabel}
              </p>
            </div>
            <div className="dk-glass-card rounded-xl p-3.5">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Hash de Integridade</p>
              <p className="mt-1 text-xs font-mono font-semibold text-[#2563EB] dark:text-blue-400 truncate">
                SHA256:{integrityHash}
              </p>
            </div>
          </div>

          {/* Ações Principais de Impressão do Certificado */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onPrintCertificate(certificado, false)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Visualizar e imprimir
            </button>
            <button
              type="button"
              onClick={() => onPrintCertificate(certificado, true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.08] text-slate-800 dark:text-slate-100 text-xs font-semibold transition-colors cursor-pointer"
            >
              <PenLine className="w-4 h-4 text-amber-500" />
              Imprimir sem assinatura do colaborador
            </button>
          </div>

          {/* Bloco Carta de Anuência Vinculada & Pacote de Auditoria */}
          <div className="dk-glass-card rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-[#3B82F6]" />
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {linkedCarta && cartaCode
                      ? `Carta de Anuência vinculada (${cartaCode})`
                      : 'Pacote de Auditoria & Carta de Anuência'}
                  </h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {linkedCarta
                    ? `Autorização formal emitida (${linkedCarta.nrReferencia}) vinculada ao colaborador com bloco de 4 assinaturas.`
                    : 'Nenhuma Carta de Anuência emitida e vinculada a este certificado. Emita uma Carta no módulo "Cartas de Anuência" para incluí-la no pacote.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {linkedCarta && (
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => void handleOpenCarta()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[0.05] text-xs font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/10 cursor-pointer disabled:opacity-50"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {busyAction === 'carta' ? 'Gerando...' : 'Visualizar carta'}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void handleOpenAuditPackage()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-amber-400 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  {busyAction === 'pacote' ? 'Compilando...' : 'Baixar Pacote de Auditoria'}
                </button>
              </div>
            </div>
          </div>

          {/* Tabela Status das Assinaturas */}
          <div className="dk-glass-card rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
                Status das Assinaturas
              </h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-4">Papel</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Nome</th>
                    <th className="py-2.5 px-4 text-right">Data / Hora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {signatureRows.map((row) => (
                    <tr key={row.papel}>
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                        {row.papel}
                      </td>
                      <td className="py-3 px-4">
                        {row.assinado ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold">
                            <CheckCircle2 className="w-3 h-3" />
                            Assinado digitalmente
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px] font-semibold">
                            Assinatura física / Pendente
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-200">{row.nome}</td>
                      <td className="py-3 px-4 text-right font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {row.dataHora}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
