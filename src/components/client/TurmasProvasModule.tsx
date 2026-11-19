import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Edit3,
  ExternalLink,
  FileBadge,
  HelpCircle,
  Plus,
  QrCode,
  Save,
  ShieldCheck,
  Smartphone,
  Trash2,
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
  createQuestao,
  createTurma,
  deleteQuestao,
  issueCertificadoImutavel,
  listQuestoes,
  listTentativasTurma,
  updateQuestao,
  updateTurmaAndPublicGateway,
} from '../../services/operationalCrudService.ts';

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
  onOpenCertificate: (cert: CertificadoDoc) => void;
  onOpenPublicExam: (params: {
    tokenPublico: string;
    cpf?: string;
    nome?: string;
    colaboradorId?: string;
  }) => void;
}

type TurmaTab = 'participantes' | 'link_qr' | 'questoes' | 'evidencias';

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
  onOpenPublicExam,
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
  const [newInstrutor, setNewInstrutor] = useState('');
  const [newInstrutorReg, setNewInstrutorReg] = useState('');
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
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Pré-preencher criação de turma quando acionado de "Agendar Reciclagem"
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
  }, [activeTurma, activeTreinamento, empresa.id]);

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
        pinAcesso: newModo === 'CPF' ? undefined : newPin.trim() || '1234',
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

  const handleSaveTurmaSettings = async () => {
    if (!activeTurma || !activeTreinamento) return;
    setBusy(true);
    setFeedback(null);
    try {
      await updateTurmaAndPublicGateway({
        empresa,
        turma: activeTurma,
        treinamento: activeTreinamento,
        patch: {
          modoIdentificacao: editModo,
          pinAcesso: editModo === 'CPF' ? null : editPin.trim() || '1234',
          status: editStatus,
          notaMinimaAprovacao: editNotaMinima,
        },
      });
      await onRefresh();
      setFeedback({
        type: 'ok',
        text: 'Regras da turma e gateway público de prova atualizados com sucesso.',
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

  const handleSaveQuestao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTurma || !activeTreinamento) return;
    const rawAlternativas: QuestaoAlternativa[] = [
      { id: 'A', texto: qAltA.trim() },
      { id: 'B', texto: qAltB.trim() },
      { id: 'C', texto: qAltC.trim() },
      { id: 'D', texto: qAltD.trim() },
    ];
    const alternativas: QuestaoAlternativa[] = rawAlternativas.filter(
      (a) => a.texto.length > 0
    );

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

      // Sincroniza questões no gateway público da turma
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
      const sigInstrutor = assinaturas.find((a) => a.tipo === 'INSTRUTOR' && a.ativa);
      const sigRt = assinaturas.find((a) => a.tipo === 'RT' && a.ativa);

      const cert = await issueCertificadoImutavel({
        empresa,
        turma: activeTurma,
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
      onOpenCertificate(cert);
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

  const filteredColaboradores = useMemo(() => {
    const q = participantSearch.trim().toLowerCase();
    return colaboradores.filter((c) => {
      if (!q) return true;
      return (
        c.nome.toLowerCase().includes(q) ||
        c.cpf.includes(q) ||
        c.funcao.toLowerCase().includes(q)
      );
    });
  }, [colaboradores, participantSearch]);

  const collectiveUrl = activeTurma
    ? `${window.location.origin}/?prova=${encodeURIComponent(activeTurma.tokenPublico)}`
    : '';

  return (
    <div className="space-y-5">
      {/* Cabeçalho + Seletor de Turma */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Turmas & Provas Unificadas
          </h2>
          <p className="text-xs text-slate-500">
            Controle participantes, gere links/QR Codes públicos, edite questões e audite selfies e
            assinaturas em um só lugar.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Nova Turma / Aplicação
        </button>
      </div>

      {feedback && (
        <div
          className={`rounded-xl px-4 py-3 text-xs border flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {feedback.type === 'ok' && <Check className="w-4 h-4 text-emerald-700 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Formulário Nova Turma */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateTurma}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Abrir Nova Turma de Treinamento</h3>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                NR / Variação do Treinamento
              </label>
              <select
                required
                value={newTreinamentoId}
                onChange={(e) => setNewTreinamentoId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
              >
                {treinamentos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nrCodigo} — {t.variacaoNome} ({t.cargaHorariaHoras}h)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Contrato / Obra
              </label>
              <select
                value={newObraId}
                onChange={(e) => setNewObraId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
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
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Data de Realização
              </label>
              <input
                type="date"
                required
                value={newDataIso}
                onChange={(e) => setNewDataIso(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Título da Turma
              </label>
              <input
                required
                value={newTitulo}
                onChange={(e) => setNewTitulo(e.target.value)}
                placeholder="Ex.: Turma NR-35 Manhã — Parada Unidade II"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Validação da Prova
              </label>
              <select
                value={newModo}
                onChange={(e) => setNewModo(e.target.value as ModoIdentificacaoProva)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
              >
                <option value="CPF">Apenas CPF</option>
                <option value="CPF_PIN">CPF + PIN</option>
                <option value="CPF_PIN_SELFIE">CPF + PIN + Selfie</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                PIN de Acesso
              </label>
              <input
                value={newPin}
                disabled={newModo === 'CPF'}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="Ex.: 4580"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Instrutor (Nome)
              </label>
              <input
                value={newInstrutor}
                onChange={(e) => setNewInstrutor(e.target.value)}
                placeholder="Ex.: Marcos Silva"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Registro Instrutor
              </label>
              <input
                value={newInstrutorReg}
                onChange={(e) => setNewInstrutorReg(e.target.value)}
                placeholder="MTE 0042150/RJ"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Responsável Técnico
              </label>
              <input
                value={newRt}
                onChange={(e) => setNewRt(e.target.value)}
                placeholder="Eng. Ana Beatriz"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Registro CREA / RT
              </label>
              <input
                value={newRtReg}
                onChange={(e) => setNewRtReg(e.target.value)}
                placeholder="CREA-RJ 20191029"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <input
              value={newLocal}
              onChange={(e) => setNewLocal(e.target.value)}
              placeholder="Local de realização (opcional)"
              className="w-72 px-3 py-2 text-xs border border-slate-200 rounded-lg"
            />
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium hover:bg-[#1E40AF] cursor-pointer disabled:opacity-50"
            >
              {busy ? 'Criando...' : 'Criar Turma e Gerar QR Code'}
            </button>
          </div>
        </form>
      )}

      {/* Seletor Horizontal de Turmas */}
      {turmas.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-900">Nenhuma turma criada ainda</p>
          <p className="text-xs text-slate-500">
            Crie a primeira turma acima para gerar o link público de prova mobile, QR Code e emitir
            certificados.
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
                  className={`text-left px-4 py-3 rounded-xl border transition-colors shrink-0 min-w-[240px] cursor-pointer ${
                    selected
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                    <span className={selected ? 'text-blue-300' : 'text-[#1D4ED8] font-semibold'}>
                      {t.nrCodigo || 'NR'} · {t.codigoTurma}
                    </span>
                    <span className={selected ? 'text-slate-300' : 'text-slate-400'}>
                      {t.status}
                    </span>
                  </div>
                  <p className="text-xs font-semibold mt-1 truncate">{t.titulo}</p>
                  <p
                    className={`text-[11px] mt-0.5 truncate ${
                      selected ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {t.dataRealizacaoIso} · {t.contratoObraNome || 'Geral'}
                  </p>
                </button>
              );
            })}
          </div>

          {activeTurma && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {/* 4 Abas Unificadas da Turma */}
              <div className="px-4 pt-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3 bg-slate-50/70">
                <div className="flex items-center gap-1 overflow-x-auto">
                  {(
                    [
                      { id: 'participantes', label: '1. Participantes & Status', icon: Users },
                      { id: 'link_qr', label: '2. Link / QR Público', icon: QrCode },
                      { id: 'questoes', label: `3. Questões (${questoes.length})`, icon: HelpCircle },
                      {
                        id: 'evidencias',
                        label: `4. Evidências & Assinaturas (${tentativas.length})`,
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
                            ? 'border-[#1D4ED8] text-slate-900 bg-white rounded-t-lg'
                            : 'border-transparent text-slate-500 hover:text-slate-900'
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
                  onClick={() =>
                    onOpenPublicExam({ tokenPublico: activeTurma.tokenPublico })
                  }
                  className="mb-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium hover:bg-[#1E40AF] cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  Abrir Prova Mobile Agora
                </button>
              </div>

              {/* ABA 1 — PARTICIPANTES & STATUS */}
              {activeTab === 'participantes' && (
                <div className="p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <input
                      value={participantSearch}
                      onChange={(e) => setParticipantSearch(e.target.value)}
                      placeholder="Buscar colaborador por nome, CPF ou função..."
                      className="w-full sm:w-80 px-3 py-2 text-xs border border-slate-200 rounded-lg"
                    />
                    <p className="text-xs text-slate-500">
                      {tentativas.length} prova(s) recebida(s) · Nota mínima{' '}
                      <strong className="font-mono text-slate-900">{editNotaMinima}%</strong>
                    </p>
                  </div>

                  {filteredColaboradores.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      Nenhum colaborador cadastrado nesta empresa ainda. Cadastre em "Colaboradores
                      & Dossiê" ou receba provas pelo link público.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                            <th className="py-2.5 px-4">Colaborador</th>
                            <th className="py-2.5 px-3">Função / Obra</th>
                            <th className="py-2.5 px-3">Status da Prova</th>
                            <th className="py-2.5 px-3">Nota</th>
                            <th className="py-2.5 px-4 text-right">Certificado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredColaboradores.map((colab) => {
                            const cleanCpf = colab.cpf.replace(/\D/g, '');
                            const attempt = tentativas.find(
                              (t) =>
                                t.colaboradorId === colab.id ||
                                t.colaboradorCpf.replace(/\D/g, '') === cleanCpf
                            );
                            const existingCert = certificados.find(
                              (c) =>
                                c.turmaId === activeTurma.id && c.colaboradorId === colab.id
                            );

                            return (
                              <tr key={colab.id} className="hover:bg-slate-50/70">
                                <td className="py-3 px-4">
                                  <p className="font-semibold text-slate-900">{colab.nome}</p>
                                  <p className="font-mono text-[11px] text-slate-500">{colab.cpf}</p>
                                </td>
                                <td className="py-3 px-3 text-slate-600">
                                  <p>{colab.funcao}</p>
                                  <p className="text-[11px] text-slate-400">
                                    {colab.contratoObraNome || 'Sem obra vinculada'}
                                  </p>
                                </td>
                                <td className="py-3 px-3">
                                  {!attempt ? (
                                    <span className="text-slate-500 font-medium">Pendente</span>
                                  ) : attempt.status === 'APROVADO' ? (
                                    <span className="text-emerald-700 font-semibold">Aprovado</span>
                                  ) : (
                                    <span className="text-red-700 font-semibold">Reprovado</span>
                                  )}
                                </td>
                                <td className="py-3 px-3 font-mono font-semibold text-slate-900">
                                  {attempt ? `${attempt.notaPercentual}%` : '—'}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  {existingCert ? (
                                    <button
                                      type="button"
                                      onClick={() => onOpenCertificate(existingCert)}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-medium hover:bg-emerald-100 cursor-pointer"
                                    >
                                      <FileBadge className="w-3.5 h-3.5" />
                                      Ver {existingCert.numeroCertificado}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => void handleEmitCertificate(colab, attempt)}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                                    >
                                      <FileBadge className="w-3.5 h-3.5" />
                                      Emitir Certificado
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
                  {/* QR Code e Link Coletivo */}
                  <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Link e QR Code Coletivo da Turma
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
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
                      <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-[11px] font-mono text-slate-700 break-all">
                        {collectiveUrl}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleCopy('coletivo', collectiveUrl)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          {copiedKey === 'coletivo' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-700" />
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
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium hover:bg-[#1E40AF] cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Testar
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Regras de Validação + Links Individuais */}
                  <div className="lg:col-span-7 space-y-5">
                    <div className="border border-slate-200 rounded-xl p-5 space-y-4">
                      <h3 className="text-sm font-semibold text-slate-900">
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
                                ? 'border-[#1D4ED8] bg-blue-50/50'
                                : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <p className="text-xs font-semibold text-slate-900">{opt.title}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</p>
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            PIN da Turma
                          </label>
                          <input
                            disabled={editModo === 'CPF'}
                            value={editPin}
                            onChange={(e) => setEditPin(e.target.value)}
                            placeholder="Ex.: 4580"
                            className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg disabled:bg-slate-50"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Status da Turma
                          </label>
                          <select
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value as StatusTurma)}
                            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
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
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                        >
                          <Save className="w-3.5 h-3.5" />
                          Salvar Regra
                        </button>
                      </div>
                    </div>

                    {/* Links Individuais por Colaborador */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                        <h4 className="text-xs font-semibold text-slate-900">
                          Links Individuais Pré-Identificados ({colaboradores.length})
                        </h4>
                      </div>
                      <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                        {colaboradores.length === 0 ? (
                          <p className="p-4 text-xs text-slate-500">
                            Cadastre colaboradores para gerar links individuais pré-preenchidos.
                          </p>
                        ) : (
                          colaboradores.map((c) => {
                            const individualUrl = `${collectiveUrl}&cpf=${encodeURIComponent(
                              c.cpf
                            )}&nome=${encodeURIComponent(c.nome)}&cid=${encodeURIComponent(c.id)}`;
                            return (
                              <div
                                key={c.id}
                                className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs"
                              >
                                <div className="min-w-0">
                                  <p className="font-medium text-slate-900 truncate">{c.nome}</p>
                                  <p className="font-mono text-[11px] text-slate-400">{c.cpf}</p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => void handleCopy(c.id, individualUrl)}
                                    className="px-2.5 py-1 rounded border border-slate-200 text-[11px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
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
                                    className="px-2.5 py-1 rounded bg-slate-900 text-white text-[11px] font-medium hover:bg-slate-800 cursor-pointer"
                                  >
                                    Abrir
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ABA 3 — QUESTÕES DA PROVA */}
              {activeTab === 'questoes' && (
                <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Lista de Questões */}
                  <div className="lg:col-span-7 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                      <div className="text-xs">
                        <span className="font-semibold text-slate-900">
                          Nota mínima de aprovação ({activeTreinamento?.nrCodigo}):
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={editNotaMinima}
                          onChange={(e) => setEditNotaMinima(Number(e.target.value))}
                          className="w-20 px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg bg-white"
                        />
                        <span className="text-xs text-slate-500">%</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleSaveTurmaSettings()}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 cursor-pointer"
                        >
                          Aplicar
                        </button>
                      </div>
                    </div>

                    {questoes.length === 0 ? (
                      <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
                        Nenhuma questão cadastrada para esta NR ainda. Adicione perguntas ao lado
                        para compor a avaliação online.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {questoes.map((q, idx) => (
                          <div
                            key={q.id}
                            className="border border-slate-200 rounded-xl p-4 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-900">
                                <span className="font-mono text-slate-400 mr-1.5">
                                  {String(idx + 1).padStart(2, '0')}.
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
                                  className="p-1 text-slate-400 hover:text-slate-900 cursor-pointer"
                                  title="Editar questão"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteQuestao(q.id)}
                                  className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                                  title="Excluir questão"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
                              {q.alternativas.map((alt) => (
                                <div
                                  key={alt.id}
                                  className={`px-2.5 py-1.5 rounded-md border ${
                                    alt.id === q.correta
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900 font-medium'
                                      : 'border-slate-100 bg-slate-50 text-slate-600'
                                  }`}
                                >
                                  <span className="font-mono font-bold mr-1">{alt.id})</span>
                                  {alt.texto}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Formulário Nova / Editar Questão */}
                  <form
                    onSubmit={handleSaveQuestao}
                    className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-slate-900">
                        {editingQuestaoId ? 'Editar Questão' : 'Adicionar Questão ao Banco da NR'}
                      </h3>
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
                          className="text-[11px] text-slate-500 underline cursor-pointer"
                        >
                          Cancelar edição
                        </button>
                      )}
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Enunciado da Pergunta
                      </label>
                      <textarea
                        required
                        rows={3}
                        value={qEnunciado}
                        onChange={(e) => setQEnunciado(e.target.value)}
                        placeholder="Ex.: Qual é a altura mínima considerada trabalho em altura segundo a NR-35?"
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                    </div>

                    {(
                      [
                        { id: 'A', val: qAltA, set: setQAltA, req: true },
                        { id: 'B', val: qAltB, set: setQAltB, req: true },
                        { id: 'C', val: qAltC, set: setQAltC, req: false },
                        { id: 'D', val: qAltD, set: setQAltD, req: false },
                      ] as const
                    ).map((alt) => (
                      <div key={alt.id} className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-500 w-4">
                          {alt.id}
                        </span>
                        <input
                          required={alt.req}
                          value={alt.val}
                          onChange={(e) => alt.set(e.target.value)}
                          placeholder={`Alternativa ${alt.id}`}
                          className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                        />
                      </div>
                    ))}

                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-600">Gabarito:</span>
                        <select
                          value={qCorreta}
                          onChange={(e) =>
                            setQCorreta(e.target.value as 'A' | 'B' | 'C' | 'D')
                          }
                          className="px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg bg-white"
                        >
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                          <option value="D">D</option>
                        </select>
                      </div>

                      <button
                        type="submit"
                        disabled={busy}
                        className="px-4 py-2 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium hover:bg-[#1E40AF] cursor-pointer disabled:opacity-50"
                      >
                        {editingQuestaoId ? 'Atualizar Questão' : 'Salvar Questão'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* ABA 4 — EVIDÊNCIAS & ASSINATURAS */}
              {activeTab === 'evidencias' && (
                <div className="p-5">
                  {tentativas.length === 0 ? (
                    <div className="py-10 text-center space-y-2">
                      <p className="text-sm font-medium text-slate-800">
                        Nenhuma prova respondida nesta turma ainda
                      </p>
                      <p className="text-xs text-slate-500">
                        Clique em "Abrir Prova Mobile Agora" para testar o fluxo completo com selfie
                        e assinatura na tela.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {tentativas.map((t) => (
                        <div
                          key={t.id}
                          className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                {t.colaboradorNome}
                              </p>
                              <p className="font-mono text-[11px] text-slate-500">
                                CPF {t.colaboradorCpf}
                              </p>
                            </div>
                            <div className="text-right">
                              <span
                                className={`text-xs font-semibold ${
                                  t.status === 'APROVADO' ? 'text-emerald-700' : 'text-red-700'
                                }`}
                              >
                                {t.status} · {t.notaPercentual}%
                              </span>
                              <p className="text-[11px] font-mono text-slate-400">
                                {t.acertos ?? 0}/{t.totalQuestoes ?? 0} acertos
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 pt-1">
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                              <p className="text-[10px] font-medium text-slate-500 mb-1.5">
                                Selfie de Validação
                              </p>
                              {t.selfieDataUrl ? (
                                <img
                                  src={t.selfieDataUrl}
                                  alt={`Selfie ${t.colaboradorNome}`}
                                  className="w-full h-24 object-cover rounded-md border border-slate-200"
                                />
                              ) : (
                                <div className="h-24 flex items-center justify-center text-[11px] text-slate-400">
                                  Não exigida nesta turma
                                </div>
                              )}
                            </div>

                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                              <p className="text-[10px] font-medium text-slate-500 mb-1.5">
                                Assinatura Digital na Tela
                              </p>
                              {t.assinaturaDataUrl ? (
                                <img
                                  src={t.assinaturaDataUrl}
                                  alt={`Assinatura ${t.colaboradorNome}`}
                                  className="w-full h-24 object-contain bg-white rounded-md border border-slate-200 p-1"
                                />
                              ) : (
                                <div className="h-24 flex items-center justify-center text-[11px] text-slate-400">
                                  Sem assinatura
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
