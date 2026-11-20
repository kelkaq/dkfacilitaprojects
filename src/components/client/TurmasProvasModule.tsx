import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Check,
  ClipboardList,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileBadge,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  KeyRound,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import type {
  AssinaturaDigitalDoc,
  CertificadoDoc,
  ColaboradorDoc,
  EmpresaDoc,
  ModoIdentificacaoProva,
  ObraDoc,
  ProvaTentativaDoc,
  QuestaoAlternativa,
  QuestaoDoc,
  StatusTurma,
  TreinamentoEmpresaDoc,
  TurmaDoc,
} from '../../types/domain.ts';
import {
  buildDossierProvaCode,
  buildEvidenceCode,
  createQuestao,
  createTurma,
  deleteQuestao,
  issueCertificadoImutavel,
  listQuestoes,
  listTentativasTurma,
  maskCpfDisplay,
  renderDocumentVectorHtml,
  updateQuestao,
  updateTurmaAndPublicGateway,
} from '../../services/operationalCrudService.ts';
import type { VectorDocumentRequest } from './DocumentPrintModal.tsx';

interface TurmasProvasModuleProps {
  empresa: EmpresaDoc;
  treinamentos: TreinamentoEmpresaDoc[];
  obras: ObraDoc[];
  colaboradores: ColaboradorDoc[];
  turmas: TurmaDoc[];
  certificados: CertificadoDoc[];
  assinaturas: AssinaturaDigitalDoc[];
  prefillRecyclingCert?: CertificadoDoc | null;
  onClearPrefill?: () => void;
  onRefresh: () => Promise<void>;
  onOpenCertificate: (cert: CertificadoDoc, hideCollaboratorSig?: boolean) => void;
  onOpenVectorDocument: (doc: VectorDocumentRequest) => void;
  onOpenPublicExam: (params: {
    tokenPublico: string;
    cpf?: string;
    nome?: string;
    colaboradorId?: string;
  }) => void;
  onGoConfiguracoesResponsaveis?: () => void;
}

type TurmaTab = 'participantes' | 'link_qr' | 'questoes' | 'evidencias';

function generateRandomPin4(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const TurmasProvasModule: React.FC<TurmasProvasModuleProps> = ({
  empresa,
  treinamentos,
  obras,
  colaboradores,
  turmas,
  certificados,
  assinaturas,
  prefillRecyclingCert,
  onClearPrefill,
  onRefresh,
  onOpenCertificate,
  onOpenVectorDocument,
  onOpenPublicExam,
  onGoConfiguracoesResponsaveis,
}) => {
  const [selectedTurmaId, setSelectedTurmaId] = useState<string | null>(turmas[0]?.id ?? null);
  const [activeTab, setActiveTab] = useState<TurmaTab>('participantes');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Formulário Nova Turma
  const [newTreinamentoId, setNewTreinamentoId] = useState(treinamentos[0]?.id ?? '');
  const [newObraId, setNewObraId] = useState('');
  const [newTitulo, setNewTitulo] = useState('');
  const [newDataIso, setNewDataIso] = useState(new Date().toISOString().slice(0, 10));
  const [newLocal, setNewLocal] = useState('');
  const [newInstrutorSigId, setNewInstrutorSigId] = useState('');
  const [newInstrutor, setNewInstrutor] = useState('');
  const [newInstrutorReg, setNewInstrutorReg] = useState('');
  const [newRtSigId, setNewRtSigId] = useState('');
  const [newRt, setNewRt] = useState('');
  const [newRtReg, setNewRtReg] = useState('');
  const [newModo, setNewModo] = useState<ModoIdentificacaoProva>('CPF_PIN_SELFIE');
  const [newPin, setNewPin] = useState('4580');

  // Dados dinâmicos da turma selecionada
  const [tentativas, setTentativas] = useState<ProvaTentativaDoc[]>([]);
  const [questoes, setQuestoes] = useState<QuestaoDoc[]>([]);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [participantSearch, setParticipantSearch] = useState('');
  const [includedColabIds, setIncludedColabIds] = useState<string[] | null>(null);
  const [showIncludeModal, setShowIncludeModal] = useState(false);
  const [participantPins, setParticipantPins] = useState<Record<string, string>>({});

  // Responsáveis e Assinaturas da Turma (aplica apenas a certificados ainda não emitidos)
  const [respInstrutorNome, setRespInstrutorNome] = useState('');
  const [respInstrutorReg, setRespInstrutorReg] = useState('');
  const [selectedInstrutorSigId, setSelectedInstrutorSigId] = useState('');
  const [respRtNome, setRespRtNome] = useState('');
  const [respRtReg, setRespRtReg] = useState('');
  const [selectedRtSigId, setSelectedRtSigId] = useState('');

  // Configurações editáveis (Aba 2 e Aba 3)
  const [editModo, setEditModo] = useState<ModoIdentificacaoProva>('CPF');
  const [editPin, setEditPin] = useState('');
  const [editStatus, setEditStatus] = useState<StatusTurma>('ABERTA');
  const [editNotaMinima, setEditNotaMinima] = useState(70);

  // Formulário de Questão (Aba 3)
  const [editingQuestaoId, setEditingQuestaoId] = useState<string | null>(null);
  const [qEnunciado, setQEnunciado] = useState('');
  const [qAltA, setQAltA] = useState('');
  const [qAltB, setQAltB] = useState('');
  const [qAltC, setQAltC] = useState('');
  const [qAltD, setQAltD] = useState('');
  const [qCorreta, setQCorreta] = useState<'A' | 'B' | 'C' | 'D'>('A');

  const [busy, setBusy] = useState(false);
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const instrutorSigs = useMemo(
    () => assinaturas.filter((a) => a.tipo === 'INSTRUTOR' && a.ativa),
    [assinaturas]
  );
  const rtSigs = useMemo(() => assinaturas.filter((a) => a.tipo === 'RT' && a.ativa), [assinaturas]);

  useEffect(() => {
    if (!prefillRecyclingCert) return;
    const matchedTraining =
      treinamentos.find(
        (t) =>
          t.nrCodigo.toUpperCase() === prefillRecyclingCert.nrCodigo.toUpperCase() &&
          t.modalidade === 'RECICLAGEM'
      ) ??
      treinamentos.find(
        (t) => t.nrCodigo.toUpperCase() === prefillRecyclingCert.nrCodigo.toUpperCase()
      ) ??
      treinamentos[0];

    if (matchedTraining) {
      setNewTreinamentoId(matchedTraining.id);
    }
    setNewTitulo(
      `Reciclagem ${prefillRecyclingCert.nrCodigo} — ${prefillRecyclingCert.snapshotColaborador.nome}`
    );
    setNewObraId(prefillRecyclingCert.contratoObraId || '');
    setNewDataIso(new Date().toISOString().slice(0, 10));
    setShowCreateForm(true);
    onClearPrefill?.();
  }, [prefillRecyclingCert, treinamentos, onClearPrefill]);

  const activeTurma = useMemo(() => {
    if (!turmas.length) return null;
    return turmas.find((t) => t.id === selectedTurmaId) ?? turmas[0];
  }, [turmas, selectedTurmaId]);

  const activeTreinamento = useMemo(() => {
    if (!activeTurma) return null;
    return treinamentos.find((t) => t.id === activeTurma.treinamentoId) ?? null;
  }, [activeTurma, treinamentos]);

  useEffect(() => {
    if (!activeTurma) {
      setTentativas([]);
      setQuestoes([]);
      setQrSvg(null);
      return;
    }
    setEditModo(activeTurma.modoIdentificacao);
    setEditPin(activeTurma.pinAcesso || '');
    setEditStatus(activeTurma.status);
    setEditNotaMinima(
      activeTreinamento?.notaMinimaAprovacao ?? activeTurma.notaMinimaAprovacao ?? 70
    );
    setRespInstrutorNome(activeTurma.instrutorNome || instrutorSigs[0]?.nomeSignatario || '');
    setRespInstrutorReg(activeTurma.instrutorRegistro || instrutorSigs[0]?.registro || '');
    setSelectedInstrutorSigId(instrutorSigs[0]?.id || '');
    setRespRtNome(activeTurma.rtNome || rtSigs[0]?.nomeSignatario || '');
    setRespRtReg(activeTurma.rtRegistro || rtSigs[0]?.registro || '');
    setSelectedRtSigId(rtSigs[0]?.id || '');
    setIncludedColabIds(null);

    void listTentativasTurma(empresa.id, activeTurma.id)
      .then(setTentativas)
      .catch(() => setTentativas([]));

    void listQuestoes(empresa.id, activeTurma.treinamentoId)
      .then(setQuestoes)
      .catch(() => setQuestoes([]));

    const examUrl = `${window.location.origin}/?prova=${encodeURIComponent(activeTurma.tokenPublico)}`;
    void fetch(`/api/qrcode?text=${encodeURIComponent(examUrl)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.svg) setQrSvg(data.svg);
      })
      .catch(() => setQrSvg(null));
  }, [activeTurma, activeTreinamento, empresa.id, instrutorSigs, rtSigs]);

  const displayedColaboradores = useMemo(() => {
    const base =
      includedColabIds === null
        ? colaboradores
        : colaboradores.filter((c) => includedColabIds.includes(c.id));
    const q = participantSearch.trim().toLowerCase();
    return base.filter((c) => {
      if (!q) return true;
      return (
        c.nome.toLowerCase().includes(q) ||
        c.cpf.includes(q) ||
        c.funcao.toLowerCase().includes(q)
      );
    });
  }, [colaboradores, includedColabIds, participantSearch]);

  const collectiveUrl = activeTurma
    ? `${window.location.origin}/?prova=${encodeURIComponent(activeTurma.tokenPublico)}`
    : '';

  const getParticipantPin = (colabId: string) =>
    participantPins[colabId] || activeTurma?.pinAcesso || editPin || '—';

  const getParticipantRowData = (colab: ColaboradorDoc) => {
    const cleanCpf = colab.cpf.replace(/\D/g, '');
    const attempt = tentativas.find(
      (t) =>
        t.colaboradorId === colab.id || t.colaboradorCpf.replace(/\D/g, '') === cleanCpf
    );
    const existingCert = activeTurma
      ? certificados.find((c) => c.turmaId === activeTurma.id && c.colaboradorId === colab.id)
      : undefined;
    const evdCode = attempt ? buildEvidenceCode(attempt.id) : null;
    const terminoStr = attempt?.concluidaEm?.toDate
      ? attempt.concluidaEm.toDate().toLocaleString('pt-BR')
      : attempt
        ? 'Horário não registrado'
        : '—';
    const inicioStr = activeTurma?.createdAt?.toDate
      ? activeTurma.createdAt.toDate().toLocaleString('pt-BR')
      : activeTurma?.dataRealizacaoIso || '—';
    return { attempt, existingCert, evdCode, inicioStr, terminoStr };
  };

  const handleCreateTurma = async (e: React.FormEvent) => {
    e.preventDefault();
    const tr = treinamentos.find((t) => t.id === newTreinamentoId) ?? treinamentos[0];
    if (!tr) {
      setFeedback({
        type: 'err',
        text: 'Cadastre ou importe pelo menos uma NR em "NRs & Conteúdo" antes de abrir uma turma.',
      });
      return;
    }
    const obra = obras.find((o) => o.id === newObraId);
    setBusy(true);
    setFeedback(null);
    try {
      const created = await createTurma(empresa, tr, {
        titulo: newTitulo.trim() || `${tr.nrCodigo} — ${tr.variacaoNome}`,
        dataRealizacaoIso: newDataIso,
        localRealizacao: newLocal.trim() || undefined,
        contratoObraId: obra?.id || null,
        contratoObraNome: obra ? `${obra.codigo} — ${obra.nome}` : null,
        instrutorNome: newInstrutor.trim() || undefined,
        instrutorRegistro: newInstrutorReg.trim() || undefined,
        rtNome: newRt.trim() || undefined,
        rtRegistro: newRtReg.trim() || undefined,
        modoIdentificacao: newModo,
        pinAcesso: newModo === 'CPF' ? undefined : newPin.trim() || generateRandomPin4(),
      });
      await onRefresh();
      setSelectedTurmaId(created.id);
      setShowCreateForm(false);
      setNewTitulo('');
      setFeedback({
        type: 'ok',
        text: `Turma ${created.codigoTurma} criada com link público e QR Code ativos.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao criar turma.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveTurmaSettings = async (overridePin?: string) => {
    if (!activeTurma || !activeTreinamento) return;
    setBusy(true);
    setFeedback(null);
    try {
      const nextPin = overridePin !== undefined ? overridePin : editPin;
      await updateTurmaAndPublicGateway({
        empresa,
        turma: activeTurma,
        treinamento: activeTreinamento,
        patch: {
          modoIdentificacao: editModo,
          pinAcesso: editModo === 'CPF' ? null : nextPin.trim() || generateRandomPin4(),
          status: editStatus,
          notaMinimaAprovacao: editNotaMinima,
          instrutorNome: respInstrutorNome || null,
          instrutorRegistro: respInstrutorReg || null,
          rtNome: respRtNome || null,
          rtRegistro: respRtReg || null,
        },
      });
      await onRefresh();
      setFeedback({
        type: 'ok',
        text: 'Configurações, responsáveis e gateway público da aplicação salvos com sucesso.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao atualizar turma.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateAllPins = async () => {
    if (!activeTurma || !activeTreinamento) return;
    const newMasterPin = generateRandomPin4();
    const nextMap: Record<string, string> = {};
    for (const c of displayedColaboradores) {
      nextMap[c.id] = newMasterPin;
    }
    setParticipantPins(nextMap);
    setEditPin(newMasterPin);
    if (editModo === 'CPF') {
      setEditModo('CPF_PIN');
    }
    await handleSaveTurmaSettings(newMasterPin);
  };

  const handleRegenerateSinglePin = (colabId: string) => {
    const nextPin = generateRandomPin4();
    setParticipantPins((prev) => ({ ...prev, [colabId]: nextPin }));
    setFeedback({
      type: 'ok',
      text: `Novo PIN ${nextPin} gerado para o colaborador.`,
    });
  };

  // --- DOCUMENTOS DA APLICAÇÃO ---

  const handleOpenListaVector = async (modo: 'oficial' | 'status') => {
    if (!activeTurma) return;
    setDocBusy(modo);
    setFeedback(null);
    try {
      const participantes = displayedColaboradores.map((c, idx) => {
        const { attempt, existingCert, evdCode } = getParticipantRowData(c);
        return {
          ordem: idx + 1,
          nome: c.nome,
          cpfMascarado: maskCpfDisplay(c.cpf),
          funcao: c.funcao,
          situacao: !attempt
            ? 'Pendente'
            : attempt.status === 'APROVADO'
              ? 'Aprovado'
              : 'Reprovado',
          nota: attempt ? `${attempt.notaPercentual}%` : '—',
          pin: getParticipantPin(c.id),
          codigoEvidencia: evdCode || '—',
          numeroCertificado: existingCert?.numeroCertificado || '—',
        };
      });

      const res = await renderDocumentVectorHtml('/api/documents/render-lista-presenca', {
        modo,
        empresa: {
          razaoSocial:
            empresa.certificadoNomeExibicao || empresa.nomeFantasia || empresa.razaoSocial,
          cnpj: empresa.cnpj,
          tipoPessoa: empresa.tipoPessoa,
          exibirDocumento: empresa.certificadoExibirDocumento !== false,
          telefoneRodape: empresa.certificadoTelefoneRodape || undefined,
          emailRodape: empresa.certificadoEmailRodape || undefined,
          endereco: empresa.endereco || undefined,
          cidade: empresa.cidade || undefined,
          uf: empresa.uf || undefined,
          logoUrl: empresa.logoUrl || undefined,
          corPrimaria: empresa.corPrimaria,
        },
        turma: {
          codigoTurma: activeTurma.codigoTurma,
          titulo: activeTurma.titulo,
          nrCodigo: activeTurma.nrCodigo || activeTreinamento?.nrCodigo || 'NR',
          cargaHorariaHoras:
            activeTurma.cargaHorariaHoras || activeTreinamento?.cargaHorariaHoras || 8,
          dataRealizacaoIso: activeTurma.dataRealizacaoIso,
          contratoObraNome: activeTurma.contratoObraNome || 'Geral',
          localRealizacao: activeTurma.localRealizacao || undefined,
          instrutorNome: respInstrutorNome || activeTurma.instrutorNome || undefined,
          instrutorRegistro: respInstrutorReg || activeTurma.instrutorRegistro || undefined,
          rtNome: respRtNome || activeTurma.rtNome || undefined,
          rtRegistro: respRtReg || activeTurma.rtRegistro || undefined,
        },
        participantes,
      });

      onOpenVectorDocument({
        title:
          modo === 'oficial'
            ? `Lista Oficial de Presença — ${activeTurma.codigoTurma}`
            : `Lista com Status — ${activeTurma.codigoTurma}`,
        subtitle: `${activeTurma.nrCodigo || 'NR'} · ${displayedColaboradores.length} colaborador(es)`,
        code: activeTurma.codigoTurma,
        html: res.html,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao gerar lista da aplicação.',
      });
    } finally {
      setDocBusy(null);
    }
  };

  const handleOpenDossieCompleto = async () => {
    if (!activeTurma || !activeTreinamento) return;
    setDocBusy('dossie');
    setFeedback(null);
    try {
      const codigoDossie = buildDossierProvaCode(activeTurma.codigoTurma);
      const participantesDossie = tentativas.map((att) => {
        const col = colaboradores.find(
          (c) =>
            c.id === att.colaboradorId ||
            c.cpf.replace(/\D/g, '') === att.colaboradorCpf.replace(/\D/g, '')
        );
        return {
          codigoEvidencia: buildEvidenceCode(att.id),
          nome: att.colaboradorNome,
          cpf: att.colaboradorCpf,
          funcao: col?.funcao || 'Colaborador',
          notaPercentual: att.notaPercentual,
          status: att.status,
          acertos: att.acertos ?? 0,
          totalQuestoes: att.totalQuestoes ?? questoes.length,
          dataHoraConclusao: att.concluidaEm?.toDate
            ? att.concluidaEm.toDate().toLocaleString('pt-BR')
            : 'Horário não registrado',
          assinaturaDataUrl: att.assinaturaDataUrl || null,
          selfieDataUrl: att.selfieDataUrl || null,
          questoes: questoes.map((q, idx) => {
            const marcada = att.respostas[q.id] || '';
            return {
              ordem: idx + 1,
              enunciado: q.enunciado,
              respostaMarcada: marcada,
              gabarito: q.correta,
              correta: marcada === q.correta,
            };
          }),
        };
      });

      const res = await renderDocumentVectorHtml('/api/documents/render-dossie-aplicacao', {
        codigoDossie,
        validationBaseUrl: window.location.origin,
        empresa: {
          razaoSocial:
            empresa.certificadoNomeExibicao || empresa.nomeFantasia || empresa.razaoSocial,
          cnpj: empresa.cnpj,
          tipoPessoa: empresa.tipoPessoa,
          exibirDocumento: empresa.certificadoExibirDocumento !== false,
          telefoneRodape: empresa.certificadoTelefoneRodape || undefined,
          emailRodape: empresa.certificadoEmailRodape || undefined,
          endereco: empresa.endereco || undefined,
          cidade: empresa.cidade || undefined,
          uf: empresa.uf || undefined,
          logoUrl: empresa.logoUrl || undefined,
          corPrimaria: empresa.corPrimaria,
        },
        turma: {
          codigoTurma: activeTurma.codigoTurma,
          titulo: activeTurma.titulo,
          nrCodigo: activeTreinamento.nrCodigo,
          cargaHorariaHoras: activeTreinamento.cargaHorariaHoras,
          dataRealizacaoIso: activeTurma.dataRealizacaoIso,
          contratoObraNome: activeTurma.contratoObraNome || 'Geral',
          localRealizacao: activeTurma.localRealizacao || undefined,
          instrutorNome: respInstrutorNome || activeTurma.instrutorNome || undefined,
          instrutorRegistro: respInstrutorReg || activeTurma.instrutorRegistro || undefined,
          rtNome: respRtNome || activeTurma.rtNome || undefined,
          rtRegistro: respRtReg || activeTurma.rtRegistro || undefined,
          conteudoLinhas: activeTreinamento.conteudoLinhas,
        },
        participantes: participantesDossie,
      });

      onOpenVectorDocument({
        title: `Dossiê Completo da Aplicação — ${codigoDossie}`,
        subtitle: `${activeTurma.titulo} · ${participantesDossie.length} folha(s) de resposta`,
        code: codigoDossie,
        html: res.html,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao gerar Dossiê Completo.',
      });
    } finally {
      setDocBusy(null);
    }
  };

  const handleOpenEvidenciaIndividual = async (
    colab: ColaboradorDoc,
    attempt: ProvaTentativaDoc
  ) => {
    if (!activeTurma || !activeTreinamento) return;
    setDocBusy(attempt.id);
    setFeedback(null);
    try {
      const evdCode = buildEvidenceCode(attempt.id);
      const sigInstrutor = assinaturas.find((a) => a.id === selectedInstrutorSigId) ?? instrutorSigs[0];
      const sigRt = assinaturas.find((a) => a.id === selectedRtSigId) ?? rtSigs[0];

      const res = await renderDocumentVectorHtml('/api/documents/render-comprovante', {
        codigoEvidencia: evdCode,
        validationBaseUrl: window.location.origin,
        empresa: {
          razaoSocial:
            empresa.certificadoNomeExibicao || empresa.nomeFantasia || empresa.razaoSocial,
          cnpj: empresa.cnpj,
          tipoPessoa: empresa.tipoPessoa,
          exibirDocumento: empresa.certificadoExibirDocumento !== false,
          telefoneRodape: empresa.certificadoTelefoneRodape || undefined,
          emailRodape: empresa.certificadoEmailRodape || undefined,
          endereco: empresa.endereco || undefined,
          cidade: empresa.cidade || undefined,
          uf: empresa.uf || undefined,
          logoUrl: empresa.logoUrl || undefined,
          corPrimaria: empresa.corPrimaria,
        },
        turma: {
          codigoTurma: activeTurma.codigoTurma,
          titulo: activeTurma.titulo,
          nrCodigo: activeTreinamento.nrCodigo,
          cargaHorariaHoras: activeTreinamento.cargaHorariaHoras,
          dataRealizacaoIso: activeTurma.dataRealizacaoIso,
          contratoObraNome: activeTurma.contratoObraNome || 'Geral',
          localRealizacao: activeTurma.localRealizacao || undefined,
          instrutorNome: respInstrutorNome || activeTurma.instrutorNome || undefined,
          instrutorRegistro: respInstrutorReg || activeTurma.instrutorRegistro || undefined,
          instrutorAssinaturaUrl: sigInstrutor?.imagemDataUrl || undefined,
          rtNome: respRtNome || activeTurma.rtNome || undefined,
          rtRegistro: respRtReg || activeTurma.rtRegistro || undefined,
          rtAssinaturaUrl: sigRt?.imagemDataUrl || undefined,
        },
        participante: {
          nome: colab.nome,
          cpf: colab.cpf,
          funcao: colab.funcao,
          notaPercentual: attempt.notaPercentual,
          notaMinima: editNotaMinima,
          status: attempt.status,
          acertos: attempt.acertos ?? 0,
          totalQuestoes: attempt.totalQuestoes ?? questoes.length,
          dataHoraConclusao: attempt.concluidaEm?.toDate
            ? attempt.concluidaEm.toDate().toLocaleString('pt-BR')
            : 'Horário não registrado',
          assinaturaDataUrl: attempt.assinaturaDataUrl || null,
          selfieDataUrl: attempt.selfieDataUrl || null,
        },
        questoes: questoes.map((q, idx) => {
          const marcada = attempt.respostas[q.id] || '';
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
      });

      onOpenVectorDocument({
        title: `Comprovante Individual de Avaliação — ${evdCode}`,
        subtitle: `${colab.nome} · Nota ${attempt.notaPercentual}% (${attempt.status})`,
        code: evdCode,
        html: res.html,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao gerar comprovante de avaliação.',
      });
    } finally {
      setDocBusy(null);
    }
  };

  const handleDownloadListaXlsx = () => {
    if (!activeTurma) return;
    const rows = displayedColaboradores.map((c, idx) => {
      const { attempt, existingCert, evdCode, inicioStr, terminoStr } = getParticipantRowData(c);
      return {
        '#': idx + 1,
        Colaborador: c.nome,
        CPF_Mascarado: maskCpfDisplay(c.cpf),
        Funcao: c.funcao,
        Obra: c.contratoObraNome || 'Geral',
        Capacitacao: `${activeTurma.nrCodigo || 'NR'} (${activeTurma.cargaHorariaHoras || 8}h)`,
        Situacao: !attempt ? 'Pendente' : attempt.status,
        Inicio: inicioStr,
        Termino: terminoStr,
        Nota: attempt ? `${attempt.notaPercentual}%` : '—',
        PIN: getParticipantPin(c.id),
        Evidencia: evdCode || '—',
        Certificado: existingCert?.numeroCertificado || '—',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Participantes');
    XLSX.writeFile(wb, `lista_${activeTurma.codigoTurma}.xlsx`);
  };

  const handleDownloadAcessos = (format: 'csv' | 'xlsx') => {
    if (!activeTurma) return;
    const rows = displayedColaboradores.map((c) => {
      const individualUrl = `${collectiveUrl}&cpf=${encodeURIComponent(c.cpf)}&nome=${encodeURIComponent(c.nome)}&cid=${encodeURIComponent(c.id)}`;
      return {
        Colaborador: c.nome,
        CPF_Mascarado: maskCpfDisplay(c.cpf),
        Funcao: c.funcao,
        PIN: getParticipantPin(c.id),
        Link_Individual: individualUrl,
      };
    });

    if (format === 'xlsx') {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Acessos');
      XLSX.writeFile(wb, `acessos_${activeTurma.codigoTurma}.xlsx`);
      return;
    }

    const header = ['Colaborador', 'CPF_Mascarado', 'Funcao', 'PIN', 'Link_Individual'];
    const csvLines = [
      header.join(';'),
      ...rows.map((r) =>
        [r.Colaborador, r.CPF_Mascarado, r.Funcao, r.PIN, r.Link_Individual]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(';')
      ),
    ];
    const blob = new Blob(['\uFEFF' + csvLines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    downloadBlob(blob, `acessos_${activeTurma.codigoTurma}.csv`);
  };

  const handleCopyAllIndividualLinks = async () => {
    if (!activeTurma) return;
    const text = displayedColaboradores
      .map((c) => {
        const url = `${collectiveUrl}&cpf=${encodeURIComponent(c.cpf)}&nome=${encodeURIComponent(c.nome)}&cid=${encodeURIComponent(c.id)}`;
        return `${c.nome} (${maskCpfDisplay(c.cpf)}) | PIN: ${getParticipantPin(c.id)} | ${url}`;
      })
      .join('\n');
    await navigator.clipboard?.writeText(text);
    setCopiedKey('all_links');
    window.setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSaveQuestao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTurma || !activeTreinamento) return;
    const rawAlternativas: QuestaoAlternativa[] = [
      { id: 'A', texto: qAltA.trim() },
      { id: 'B', texto: qAltB.trim() },
      { id: 'C', texto: qAltC.trim() },
      { id: 'D', texto: qAltD.trim() },
    ];
    const alternativas: QuestaoAlternativa[] = rawAlternativas.filter((a) => a.texto.length > 0);

    if (alternativas.length < 2) {
      setFeedback({ type: 'err', text: 'Informe pelo menos 2 alternativas para a questão.' });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      if (editingQuestaoId) {
        await updateQuestao(empresa, editingQuestaoId, {
          enunciado: qEnunciado,
          alternativas,
          correta: qCorreta,
        });
      } else {
        await createQuestao(empresa, {
          treinamentoId: activeTreinamento.id,
          enunciado: qEnunciado,
          alternativas,
          correta: qCorreta,
        });
      }

      await updateTurmaAndPublicGateway({
        empresa,
        turma: activeTurma,
        treinamento: activeTreinamento,
        patch: { notaMinimaAprovacao: editNotaMinima },
      });

      const refreshed = await listQuestoes(empresa.id, activeTreinamento.id);
      setQuestoes(refreshed);
      setEditingQuestaoId(null);
      setQEnunciado('');
      setQAltA('');
      setQAltB('');
      setQAltC('');
      setQAltD('');
      setQCorreta('A');
      setFeedback({
        type: 'ok',
        text: 'Questão salva e sincronizada automaticamente na prova pública da turma.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao salvar questão.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteQuestao = async (questaoId: string) => {
    if (!activeTurma || !activeTreinamento) return;
    setBusy(true);
    try {
      await deleteQuestao(empresa.id, questaoId);
      await updateTurmaAndPublicGateway({
        empresa,
        turma: activeTurma,
        treinamento: activeTreinamento,
        patch: {},
      });
      setQuestoes((prev) => prev.filter((q) => q.id !== questaoId));
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao remover questão.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleEmitCertificate = async (colab: ColaboradorDoc, attempt?: ProvaTentativaDoc) => {
    if (!activeTurma || !activeTreinamento) return;
    setBusy(true);
    setFeedback(null);
    try {
      const sigInstrutor =
        assinaturas.find((a) => a.id === selectedInstrutorSigId) ?? instrutorSigs[0];
      const sigRt = assinaturas.find((a) => a.id === selectedRtSigId) ?? rtSigs[0];

      const turmaWithResp: TurmaDoc = {
        ...activeTurma,
        instrutorNome: respInstrutorNome || activeTurma.instrutorNome,
        instrutorRegistro: respInstrutorReg || activeTurma.instrutorRegistro,
        rtNome: respRtNome || activeTurma.rtNome,
        rtRegistro: respRtReg || activeTurma.rtRegistro,
      };

      const cert = await issueCertificadoImutavel({
        empresa,
        turma: turmaWithResp,
        treinamento: activeTreinamento,
        colaborador: colab,
        assinaturaColaboradorUrl: attempt?.assinaturaDataUrl || null,
        instrutorAssinaturaUrl: sigInstrutor?.imagemDataUrl || null,
        rtAssinaturaUrl: sigRt?.imagemDataUrl || null,
      });

      await onRefresh();
      setFeedback({
        type: 'ok',
        text: `Certificado ${cert.numeroCertificado} emitido com snapshot congelado e QR Code ${cert.codigoValidacaoQr}.`,
      });
      onOpenCertificate(cert, false);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao emitir certificado.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async (key: string, text: string) => {
    await navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1800);
  };

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Turmas & Provas Unificadas
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Documentos da aplicação, responsáveis e assinaturas, links/QR Codes, questões e
            evidências individuais (EVD / PROVA).
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-medium cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Nova Turma / Aplicação
        </button>
      </div>

      {feedback && (
        <div
          className={`rounded-xl px-4 py-3 text-xs border flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-900 dark:text-red-200'
          }`}
        >
          {feedback.type === 'ok' && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Formulário Nova Turma */}
      {showCreateForm && (
        <form onSubmit={handleCreateTurma} className="dk-glass-card rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Abrir Nova Turma de Treinamento
            </h3>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="text-xs text-slate-500 dark:text-slate-400 cursor-pointer"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                NR / Variação do Treinamento
              </label>
              <select
                required
                value={newTreinamentoId}
                onChange={(e) => setNewTreinamentoId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100"
              >
                {treinamentos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nrCodigo} — {t.variacaoNome} ({t.cargaHorariaHoras}h)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                Contrato / Obra
              </label>
              <select
                value={newObraId}
                onChange={(e) => setNewObraId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100"
              >
                <option value="">Geral / Sem obra específica</option>
                {obras.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.codigo} — {o.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                Data de Realização
              </label>
              <input
                type="date"
                required
                value={newDataIso}
                onChange={(e) => setNewDataIso(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                Título da Turma
              </label>
              <input
                required
                value={newTitulo}
                onChange={(e) => setNewTitulo(e.target.value)}
                placeholder="Ex.: Turma NR-35 Manhã — Parada Unidade II"
                className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                Validação da Prova
              </label>
              <select
                value={newModo}
                onChange={(e) => setNewModo(e.target.value as ModoIdentificacaoProva)}
                className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100"
              >
                <option value="CPF">Apenas CPF</option>
                <option value="CPF_PIN">CPF + PIN</option>
                <option value="CPF_PIN_SELFIE">CPF + PIN + Selfie</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                PIN de Acesso
              </label>
              <input
                value={newPin}
                disabled={newModo === 'CPF'}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="4580"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 disabled:opacity-50"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Instrutor / TST
                </label>
                {onGoConfiguracoesResponsaveis && (
                  <button
                    type="button"
                    onClick={onGoConfiguracoesResponsaveis}
                    className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    + Cadastrar
                  </button>
                )}
              </div>
              <select
                value={newInstrutorSigId}
                onChange={(e) => {
                  const id = e.target.value;
                  setNewInstrutorSigId(id);
                  const found = instrutorSigs.find((s) => s.id === id);
                  setNewInstrutor(found?.nomeSignatario || '');
                  setNewInstrutorReg(found?.registro || '');
                }}
                className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100"
              >
                <option value="">
                  {instrutorSigs.length === 0
                    ? 'Nenhum Instrutor cadastrado — cadastre em Configurações'
                    : 'Selecione o Instrutor / TST'}
                </option>
                {instrutorSigs.map((sig) => (
                  <option key={sig.id} value={sig.id}>
                    {sig.nomeSignatario}
                    {sig.registro ? ` (${sig.registro})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                Registro MTE (automático)
              </label>
              <input
                readOnly
                value={newInstrutorReg}
                placeholder="Preenchido ao escolher o instrutor"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 dark:border-white/10 rounded-lg bg-slate-50 dark:bg-white/[0.03] text-slate-600 dark:text-slate-300"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Responsável Técnico (RT)
                </label>
                {onGoConfiguracoesResponsaveis && (
                  <button
                    type="button"
                    onClick={onGoConfiguracoesResponsaveis}
                    className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    + Cadastrar
                  </button>
                )}
              </div>
              <select
                value={newRtSigId}
                onChange={(e) => {
                  const id = e.target.value;
                  setNewRtSigId(id);
                  const found = rtSigs.find((s) => s.id === id);
                  setNewRt(found?.nomeSignatario || '');
                  setNewRtReg(found?.registro || '');
                }}
                className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100"
              >
                <option value="">
                  {rtSigs.length === 0
                    ? 'Nenhum RT cadastrado — cadastre em Configurações'
                    : 'Selecione o Responsável Técnico'}
                </option>
                {rtSigs.map((sig) => (
                  <option key={sig.id} value={sig.id}>
                    {sig.nomeSignatario}
                    {sig.registro ? ` (${sig.registro})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                Registro CREA / RT (automático)
              </label>
              <input
                readOnly
                value={newRtReg}
                placeholder="Preenchido ao escolher o RT"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 dark:border-white/10 rounded-lg bg-slate-50 dark:bg-white/[0.03] text-slate-600 dark:text-slate-300"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <input
              value={newLocal}
              onChange={(e) => setNewLocal(e.target.value)}
              placeholder="Local de realização (opcional)"
              className="w-full sm:w-72 px-3 py-2 text-xs border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-[#1D4ED8] cursor-pointer disabled:opacity-50"
            >
              {busy ? 'Criando...' : 'Criar Turma e Gerar QR Code'}
            </button>
          </div>
        </form>
      )}

      {/* Seletor Horizontal de Turmas */}
      {turmas.length === 0 ? (
        <div className="dk-glass-card rounded-xl p-10 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Nenhuma turma criada ainda
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Crie a primeira turma acima para gerar o link público de prova mobile, QR Code e
            documentos oficiais.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {turmas.map((t) => {
              const selected = activeTurma?.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTurmaId(t.id)}
                  className={`text-left px-4 py-3 rounded-xl border transition-all shrink-0 min-w-[240px] cursor-pointer ${
                    selected
                      ? 'bg-[#2563EB] border-[#3B82F6] text-white shadow-[0_0_24px_-8px_rgba(59,130,246,0.6)]'
                      : 'dk-glass-card text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                    <span className={selected ? 'text-blue-100 font-bold' : 'text-[#2563EB] dark:text-blue-400 font-semibold'}>
                      {t.nrCodigo || 'NR'} · {t.codigoTurma}
                    </span>
                    <span className={selected ? 'text-blue-100' : 'text-slate-400'}>{t.status}</span>
                  </div>
                  <p className="text-xs font-semibold mt-1 truncate">{t.titulo}</p>
                  <p
                    className={`text-[11px] mt-0.5 truncate ${
                      selected ? 'text-blue-100/80' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {t.dataRealizacaoIso} · {t.contratoObraNome || 'Geral'}
                  </p>
                </button>
              );
            })}
          </div>

          {activeTurma && (
            <>
              {/* BLOCO 1: DOCUMENTOS DA APLICAÇÃO (7 BOTÕES FUNCIONAIS) */}
              <div className="dk-glass-card rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-[#3B82F6]" />
                    <h3 className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
                      Documentos da aplicação ({activeTurma.codigoTurma})
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {buildDossierProvaCode(activeTurma.codigoTurma)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={docBusy !== null}
                    onClick={() => void handleOpenListaVector('oficial')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/10 text-xs font-medium text-slate-800 dark:text-slate-100 cursor-pointer disabled:opacity-50"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#3B82F6]" />
                    {docBusy === 'oficial' ? 'Gerando...' : 'Lista oficial'}
                  </button>
                  <button
                    type="button"
                    disabled={docBusy !== null}
                    onClick={() => void handleOpenListaVector('status')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/10 text-xs font-medium text-slate-800 dark:text-slate-100 cursor-pointer disabled:opacity-50"
                  >
                    <ClipboardList className="w-3.5 h-3.5 text-emerald-500" />
                    {docBusy === 'status' ? 'Gerando...' : 'Lista com status'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadListaXlsx}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/10 text-xs font-medium text-slate-800 dark:text-slate-100 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    Baixar lista XLSX
                  </button>
                  <button
                    type="button"
                    disabled={docBusy !== null}
                    onClick={() => void handleOpenDossieCompleto()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    <FileBadge className="w-3.5 h-3.5" />
                    {docBusy === 'dossie' ? 'Compilando...' : 'Dossiê completo'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadAcessos('csv')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/10 text-xs font-medium text-slate-800 dark:text-slate-100 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    Baixar acessos CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadAcessos('xlsx')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/10 text-xs font-medium text-slate-800 dark:text-slate-100 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-blue-500" />
                    Baixar acessos XLSX
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleGenerateAllPins()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-500/20 cursor-pointer disabled:opacity-50"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    Gerar PINs
                  </button>
                </div>
              </div>

              {/* BLOCO 2: RESPONSÁVEIS E ASSINATURAS (SÓ PARA CERTIFICADOS NÃO EMITIDOS) */}
              <div className="dk-glass-card rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
                      Responsáveis e assinaturas
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Alterações aqui valem apenas para certificados ainda não emitidos (certificados
                      emitidos mantêm snapshot imutável).
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSaveTurmaSettings()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Salvar Responsáveis
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Instrutor / TST
                    </label>
                    <input
                      value={respInstrutorNome}
                      onChange={(e) => setRespInstrutorNome(e.target.value)}
                      placeholder="Nome do Instrutor"
                      className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100"
                    />
                    <input
                      value={respInstrutorReg}
                      onChange={(e) => setRespInstrutorReg(e.target.value)}
                      placeholder="Registro MTE"
                      className="w-full mt-1.5 px-3 py-1.5 text-[11px] font-mono border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-700 dark:text-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Assinatura do Instrutor
                    </label>
                    <select
                      value={selectedInstrutorSigId}
                      onChange={(e) => {
                        setSelectedInstrutorSigId(e.target.value);
                        const found = instrutorSigs.find((s) => s.id === e.target.value);
                        if (found) {
                          setRespInstrutorNome(found.nomeSignatario);
                          if (found.registro) setRespInstrutorReg(found.registro);
                        }
                      }}
                      className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100"
                    >
                      <option value="">Sem assinatura digital selecionada</option>
                      {instrutorSigs.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nomeSignatario} {s.registro ? `(${s.registro})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Responsável Técnico (RT)
                    </label>
                    <input
                      value={respRtNome}
                      onChange={(e) => setRespRtNome(e.target.value)}
                      placeholder="Nome do RT"
                      className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100"
                    />
                    <input
                      value={respRtReg}
                      onChange={(e) => setRespRtReg(e.target.value)}
                      placeholder="Registro CREA"
                      className="w-full mt-1.5 px-3 py-1.5 text-[11px] font-mono border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-700 dark:text-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Assinatura do RT
                    </label>
                    <select
                      value={selectedRtSigId}
                      onChange={(e) => {
                        setSelectedRtSigId(e.target.value);
                        const found = rtSigs.find((s) => s.id === e.target.value);
                        if (found) {
                          setRespRtNome(found.nomeSignatario);
                          if (found.registro) setRespRtReg(found.registro);
                        }
                      }}
                      className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100"
                    >
                      <option value="">Sem assinatura digital selecionada</option>
                      {rtSigs.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nomeSignatario} {s.registro ? `(${s.registro})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* CARD PRINCIPAL COM AS 4 ABAS */}
              <div className="dk-glass-card rounded-xl overflow-hidden">
                <div className="px-4 pt-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between flex-wrap gap-3 bg-slate-50/70 dark:bg-white/[0.02]">
                  <div className="flex items-center gap-1 overflow-x-auto">
                    {(
                      [
                        { id: 'participantes', label: '1. Participantes e evidências', icon: Users },
                        { id: 'link_qr', label: '2. Link / QR Público', icon: QrCode },
                        { id: 'questoes', label: `3. Questões (${questoes.length})`, icon: HelpCircle },
                        {
                          id: 'evidencias',
                          label: `4. Evidências & Selfies (${tentativas.length})`,
                          icon: ShieldCheck,
                        },
                      ] as const
                    ).map((tab) => {
                      const Icon = tab.icon;
                      const active = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveTab(tab.id)}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                            active
                              ? 'border-[#3B82F6] text-slate-900 dark:text-white bg-white dark:bg-white/[0.05] rounded-t-lg'
                              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenPublicExam({ tokenPublico: activeTurma.tokenPublico })}
                    className="mb-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-[#1D4ED8] cursor-pointer"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    Abrir Prova Mobile Agora
                  </button>
                </div>

                {/* ABA 1 — PARTICIPANTES E EVIDÊNCIAS */}
                {activeTab === 'participantes' && (
                  <div className="p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <input
                        value={participantSearch}
                        onChange={(e) => setParticipantSearch(e.target.value)}
                        placeholder="Buscar colaborador por nome, CPF ou função..."
                        className="w-full sm:w-72 px-3 py-2 text-xs border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100"
                      />

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowIncludeModal((v) => !v)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[0.04] text-xs font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/10 cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5 text-[#3B82F6]" />
                          Incluir colaboradores
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCopyAllIndividualLinks()}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[0.04] text-xs font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/10 cursor-pointer"
                        >
                          {copiedKey === 'all_links' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-amber-500" />
                          )}
                          {copiedKey === 'all_links'
                            ? 'Links copiados!'
                            : 'Copiar links individuais'}
                        </button>
                      </div>
                    </div>

                    {showIncludeModal && (
                      <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50/40 dark:bg-blue-500/5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-900 dark:text-white">
                            Selecionar colaboradores incluídos nesta aplicação ({displayedColaboradores.length}/{colaboradores.length})
                          </span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setIncludedColabIds(null)}
                              className="text-[11px] font-medium text-[#2563EB] dark:text-blue-400 hover:underline cursor-pointer"
                            >
                              Todos
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowIncludeModal(false)}
                              className="text-[11px] text-slate-500 cursor-pointer"
                            >
                              Concluir
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-44 overflow-y-auto">
                          {colaboradores.map((c) => {
                            const checked =
                              includedColabIds === null || includedColabIds.includes(c.id);
                            return (
                              <label
                                key={c.id}
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1120] text-xs cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    const current =
                                      includedColabIds === null
                                        ? colaboradores.map((item) => item.id)
                                        : includedColabIds;
                                    setIncludedColabIds(
                                      checked
                                        ? current.filter((id) => id !== c.id)
                                        : [...current, c.id]
                                    );
                                  }}
                                />
                                <span className="truncate text-slate-800 dark:text-slate-200">
                                  {c.nome}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {displayedColaboradores.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                        Nenhum colaborador vinculado ainda. Cadastre em "Colaboradores & Dossiê" ou
                        receba provas pelo link público.
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-slate-200 dark:border-white/10 rounded-lg">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400">
                              <th className="py-2.5 px-3">Colaborador / CPF</th>
                              <th className="py-2.5 px-3">Capacitação</th>
                              <th className="py-2.5 px-3">Situação</th>
                              <th className="py-2.5 px-3">Início / Término</th>
                              <th className="py-2.5 px-3">Nota</th>
                              <th className="py-2.5 px-3">PIN</th>
                              <th className="py-2.5 px-3">Evidência</th>
                              <th className="py-2.5 px-3 text-right">Certificado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {displayedColaboradores.map((colab) => {
                              const { attempt, existingCert, evdCode, inicioStr, terminoStr } =
                                getParticipantRowData(colab);
                              const pin = getParticipantPin(colab.id);

                              return (
                                <tr
                                  key={colab.id}
                                  className="hover:bg-slate-50/70 dark:hover:bg-white/[0.03]"
                                >
                                  <td className="py-3 px-3">
                                    <p className="font-semibold text-slate-900 dark:text-white">
                                      {colab.nome}
                                    </p>
                                    <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                      {maskCpfDisplay(colab.cpf)} · {colab.funcao}
                                    </p>
                                  </td>
                                  <td className="py-3 px-3 whitespace-nowrap">
                                    <span className="font-mono font-semibold text-[#2563EB] dark:text-blue-400">
                                      {activeTurma.nrCodigo || 'NR'}
                                    </span>{' '}
                                    <span className="text-slate-500 dark:text-slate-400">
                                      ({activeTurma.cargaHorariaHoras || 8}h)
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 whitespace-nowrap">
                                    {!attempt ? (
                                      <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium">
                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                        Pendente
                                      </span>
                                    ) : attempt.status === 'APROVADO' ? (
                                      <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                                        <span className="dk-live-dot bg-emerald-500 shadow-[0_0_8px_#10B981]" />
                                        Aprovado
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 font-semibold">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                        Reprovado
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                    <div>{inicioStr}</div>
                                    <div>{terminoStr}</div>
                                  </td>
                                  <td className="py-3 px-3 font-mono font-semibold text-slate-900 dark:text-white">
                                    {attempt ? `${attempt.notaPercentual}%` : '—'}
                                  </td>
                                  <td className="py-3 px-3 whitespace-nowrap">
                                    <div className="inline-flex items-center gap-1">
                                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                                        {pin}
                                      </span>
                                      <button
                                        type="button"
                                        title="Regenerar PIN"
                                        onClick={() => handleRegenerateSinglePin(colab.id)}
                                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-[#3B82F6] cursor-pointer"
                                      >
                                        <RefreshCw className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </td>
                                  <td className="py-3 px-3 whitespace-nowrap">
                                    {attempt && evdCode ? (
                                      <button
                                        type="button"
                                        disabled={docBusy === attempt.id}
                                        onClick={() =>
                                          void handleOpenEvidenciaIndividual(colab, attempt)
                                        }
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 text-[#1D4ED8] dark:text-blue-300 font-mono text-[11px] font-medium hover:bg-blue-100 dark:hover:bg-blue-500/20 cursor-pointer"
                                      >
                                        <Eye className="w-3 h-3" />
                                        {docBusy === attempt.id ? '...' : evdCode}
                                      </button>
                                    ) : (
                                      <span className="text-slate-400 font-mono text-[11px]">—</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-3 text-right whitespace-nowrap">
                                    {existingCert ? (
                                      <button
                                        type="button"
                                        onClick={() => onOpenCertificate(existingCert, false)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-mono font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-500/20 cursor-pointer"
                                      >
                                        <FileBadge className="w-3.5 h-3.5" />
                                        {existingCert.numeroCertificado}
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => void handleEmitCertificate(colab, attempt)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 cursor-pointer disabled:opacity-50"
                                      >
                                        <FileBadge className="w-3.5 h-3.5" />
                                        Emitir
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* ABA 2 — LINK / QR CODE PÚBLICO */}
                {activeTab === 'link_qr' && (
                  <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <div className="lg:col-span-5 bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl p-5 space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                          Link e QR Code Coletivo da Turma
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Projete na sala de aula ou envie no grupo da obra para acesso imediato no
                          celular.
                        </p>
                      </div>

                      {qrSvg && (
                        <div
                          className="w-44 h-44 mx-auto bg-white p-3 rounded-xl border border-slate-200 [&>svg]:w-full [&>svg]:h-full"
                          dangerouslySetInnerHTML={{ __html: qrSvg }}
                        />
                      )}

                      <div className="space-y-2">
                        <div className="bg-white dark:bg-[#0B1120] border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-[11px] font-mono text-slate-700 dark:text-slate-300 break-all">
                          {collectiveUrl}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void handleCopy('coletivo', collectiveUrl)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-white/[0.05] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                          >
                            {copiedKey === 'coletivo' ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            {copiedKey === 'coletivo' ? 'Link Copiado' : 'Copiar Link Coletivo'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onOpenPublicExam({ tokenPublico: activeTurma.tokenPublico })
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-[#1D4ED8] cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Testar
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="lg:col-span-7 space-y-5">
                      <div className="border border-slate-200 dark:border-white/10 rounded-xl p-5 space-y-4">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                          Segurança e Regra de Identificação
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {(
                            [
                              { id: 'CPF', title: 'Somente CPF', desc: 'Acesso rápido em sala' },
                              { id: 'CPF_PIN', title: 'CPF + PIN', desc: 'Exige código do instrutor' },
                              {
                                id: 'CPF_PIN_SELFIE',
                                title: 'CPF + PIN + Selfie',
                                desc: 'Auditoria máxima com foto',
                              },
                            ] as const
                          ).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setEditModo(opt.id)}
                              className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                                editModo === opt.id
                                  ? 'border-[#3B82F6] bg-blue-50/70 dark:bg-blue-500/15'
                                  : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                              }`}
                            >
                              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                                {opt.title}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {opt.desc}
                              </p>
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                              PIN da Turma
                            </label>
                            <input
                              disabled={editModo === 'CPF'}
                              value={editPin}
                              onChange={(e) => setEditPin(e.target.value)}
                              placeholder="4580"
                              className="w-full px-3 py-2 text-xs font-mono border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 disabled:opacity-50"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                              Status da Turma
                            </label>
                            <select
                              value={editStatus}
                              onChange={(e) => setEditStatus(e.target.value as StatusTurma)}
                              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100"
                            >
                              <option value="ABERTA">ABERTA (Recebendo provas)</option>
                              <option value="ENCERRADA">ENCERRADA</option>
                              <option value="RASCUNHO">RASCUNHO</option>
                            </select>
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleSaveTurmaSettings()}
                            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-[#1D4ED8] cursor-pointer disabled:opacity-50"
                          >
                            <Save className="w-3.5 h-3.5" />
                            Salvar Regra
                          </button>
                        </div>
                      </div>

                      <div className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/10">
                          <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
                            Links Individuais Pré-Identificados ({displayedColaboradores.length})
                          </h4>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-56 overflow-y-auto">
                          {displayedColaboradores.map((c) => {
                            const individualUrl = `${collectiveUrl}&cpf=${encodeURIComponent(
                              c.cpf
                            )}&nome=${encodeURIComponent(c.nome)}&cid=${encodeURIComponent(c.id)}`;
                            return (
                              <div
                                key={c.id}
                                className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs"
                              >
                                <div className="min-w-0">
                                  <p className="font-medium text-slate-900 dark:text-white truncate">
                                    {c.nome}
                                  </p>
                                  <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                    {maskCpfDisplay(c.cpf)} · PIN {getParticipantPin(c.id)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => void handleCopy(c.id, individualUrl)}
                                    className="px-2.5 py-1 rounded border border-slate-200 dark:border-white/15 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 cursor-pointer"
                                  >
                                    {copiedKey === c.id ? 'Copiado' : 'Copiar'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onOpenPublicExam({
                                        tokenPublico: activeTurma.tokenPublico,
                                        cpf: c.cpf,
                                        nome: c.nome,
                                        colaboradorId: c.id,
                                      })
                                    }
                                    className="px-2.5 py-1 rounded bg-[#2563EB] text-white text-[11px] font-medium hover:bg-[#1D4ED8] cursor-pointer"
                                  >
                                    Abrir
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ABA 3 — QUESTÕES DA PROVA */}
                {activeTab === 'questoes' && (
                  <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <div className="lg:col-span-7 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">
                          Nota mínima de aprovação ({activeTreinamento?.nrCodigo}):
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={editNotaMinima}
                            onChange={(e) => setEditNotaMinima(Number(e.target.value))}
                            className="w-20 px-2.5 py-1.5 text-xs font-mono border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100"
                          />
                          <span className="text-xs text-slate-500">%</span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleSaveTurmaSettings()}
                            className="px-3 py-1.5 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-[#1D4ED8] cursor-pointer"
                          >
                            Aplicar
                          </button>
                        </div>
                      </div>

                      {questoes.length === 0 ? (
                        <div className="p-8 text-center border border-dashed border-slate-300 dark:border-white/15 rounded-xl text-xs text-slate-500 dark:text-slate-400">
                          Nenhuma questão cadastrada para esta NR ainda. Adicione ao lado.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {questoes.map((q, idx) => (
                            <div
                              key={q.id}
                              className="border border-slate-200 dark:border-white/10 rounded-xl p-4 space-y-2 bg-white dark:bg-white/[0.02]"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                                  <span className="font-mono text-[#3B82F6] mr-1.5">
                                    Q{String(idx + 1).padStart(2, '0')}
                                  </span>
                                  {q.enunciado}
                                </p>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingQuestaoId(q.id);
                                      setQEnunciado(q.enunciado);
                                      setQAltA(q.alternativas.find((a) => a.id === 'A')?.texto || '');
                                      setQAltB(q.alternativas.find((a) => a.id === 'B')?.texto || '');
                                      setQAltC(q.alternativas.find((a) => a.id === 'C')?.texto || '');
                                      setQAltD(q.alternativas.find((a) => a.id === 'D')?.texto || '');
                                      setQCorreta(q.correta);
                                    }}
                                    className="p-1.5 rounded text-slate-400 hover:text-[#3B82F6] cursor-pointer"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteQuestao(q.id)}
                                    className="p-1.5 rounded text-slate-400 hover:text-red-500 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              <ul className="space-y-1 text-xs">
                                {q.alternativas.map((alt) => (
                                  <li
                                    key={alt.id}
                                    className={
                                      alt.id === q.correta
                                        ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                        : 'text-slate-600 dark:text-slate-300'
                                    }
                                  >
                                    <span className="font-mono mr-1.5">{alt.id})</span>
                                    {alt.texto}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <form
                      onSubmit={handleSaveQuestao}
                      className="lg:col-span-5 border border-slate-200 dark:border-white/10 rounded-xl p-4 space-y-3 bg-slate-50/70 dark:bg-white/[0.02]"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
                          {editingQuestaoId ? 'Editar Questão' : 'Nova Questão da Prova'}
                        </h4>
                        {editingQuestaoId && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingQuestaoId(null);
                              setQEnunciado('');
                              setQAltA('');
                              setQAltB('');
                              setQAltC('');
                              setQAltD('');
                            }}
                            className="text-[11px] text-slate-500 cursor-pointer"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                      <textarea
                        required
                        rows={3}
                        value={qEnunciado}
                        onChange={(e) => setQEnunciado(e.target.value)}
                        placeholder="Enunciado da questão..."
                        className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100"
                      />
                      <div className="space-y-2">
                        {[
                          { id: 'A', val: qAltA, set: setQAltA, req: true },
                          { id: 'B', val: qAltB, set: setQAltB, req: true },
                          { id: 'C', val: qAltC, set: setQAltC, req: false },
                          { id: 'D', val: qAltD, set: setQAltD, req: false },
                        ].map((item) => (
                          <input
                            key={item.id}
                            required={item.req}
                            value={item.val}
                            onChange={(e) => item.set(e.target.value)}
                            placeholder={`Alternativa ${item.id}${item.req ? ' (obrigatória)' : ' (opcional)'}`}
                            className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100"
                          />
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <label className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                          Correta:
                          <select
                            value={qCorreta}
                            onChange={(e) => setQCorreta(e.target.value as 'A' | 'B' | 'C' | 'D')}
                            className="px-2.5 py-1.5 text-xs font-mono border border-slate-200 dark:border-white/15 rounded-lg bg-white dark:bg-[#0B1120] text-slate-900 dark:text-slate-100"
                          >
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                            <option value="D">D</option>
                          </select>
                        </label>
                        <button
                          type="submit"
                          disabled={busy}
                          className="px-4 py-2 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-[#1D4ED8] cursor-pointer disabled:opacity-50"
                        >
                          {editingQuestaoId ? 'Atualizar' : 'Salvar Questão'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* ABA 4 — EVIDÊNCIAS & ASSINATURAS */}
                {activeTab === 'evidencias' && (
                  <div className="p-5">
                    {tentativas.length === 0 ? (
                      <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                        Nenhuma prova respondida ainda nesta turma.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {tentativas.map((att) => {
                          const evdCode = buildEvidenceCode(att.id);
                          const colab = colaboradores.find(
                            (c) =>
                              c.id === att.colaboradorId ||
                              c.cpf.replace(/\D/g, '') === att.colaboradorCpf.replace(/\D/g, '')
                          ) ?? {
                            id: att.colaboradorId,
                            empresaId: empresa.id,
                            nome: att.colaboradorNome,
                            cpf: att.colaboradorCpf,
                            funcao: 'Colaborador',
                            ativo: true,
                          };
                          return (
                            <div
                              key={att.id}
                              className="border border-slate-200 dark:border-white/10 rounded-xl p-4 space-y-3 bg-white dark:bg-white/[0.02]"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-mono text-[11px] font-semibold text-[#2563EB] dark:text-blue-400">
                                    {evdCode}
                                  </p>
                                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                    {att.colaboradorNome}
                                  </p>
                                  <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                    {maskCpfDisplay(att.colaboradorCpf)}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <span
                                    className={`font-mono text-sm font-bold ${
                                      att.status === 'APROVADO'
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-red-600 dark:text-red-400'
                                    }`}
                                  >
                                    {att.notaPercentual}%
                                  </span>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    {att.status}
                                  </p>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-lg p-2 text-center">
                                  <p className="text-[10px] text-slate-500 mb-1">Selfie</p>
                                  {att.selfieDataUrl ? (
                                    <img
                                      src={att.selfieDataUrl}
                                      alt="Selfie"
                                      className="h-20 w-full object-cover rounded"
                                    />
                                  ) : (
                                    <div className="h-20 flex items-center justify-center text-[11px] text-slate-400">
                                      Não exigida
                                    </div>
                                  )}
                                </div>
                                <div className="bg-white border border-slate-200 rounded-lg p-2 text-center">
                                  <p className="text-[10px] text-slate-500 mb-1">Assinatura</p>
                                  {att.assinaturaDataUrl ? (
                                    <img
                                      src={att.assinaturaDataUrl}
                                      alt="Assinatura"
                                      className="h-20 w-full object-contain"
                                    />
                                  ) : (
                                    <div className="h-20 flex items-center justify-center text-[11px] text-slate-400">
                                      Sem assinatura
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  disabled={docBusy === att.id}
                                  onClick={() => void handleOpenEvidenciaIndividual(colab, att)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-medium cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  Visualizar Comprovante {evdCode}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
