import React, { useMemo, useState } from 'react';
import {
  Building2,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileBadge,
  FileText,
  Link2,
  Lock,
  PenTool,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import type {
  AssinaturaDigitalDoc,
  CartaAnuenciaDoc,
  CertificadoDoc,
  ColaboradorDoc,
  DossiePublicoDoc,
  EffectivePlanLimits,
  EmpresaDoc,
  ObraDoc,
  ProvaTentativaDoc,
} from '../../types/domain.ts';
import {
  createCartaAnuencia,
  createColaborador,
  createObra,
  createTemporaryDossieLink,
  deleteColaborador,
  deleteObra,
  saveAssinaturaDigital,
} from '../../services/operationalCrudService.ts';
import { SignaturePadCanvas } from './SignaturePadCanvas.tsx';

interface ColaboradoresDossieModuleProps {
  empresa: EmpresaDoc;
  limits: EffectivePlanLimits;
  obras: ObraDoc[];
  colaboradores: ColaboradorDoc[];
  certificados: CertificadoDoc[];
  cartas: CartaAnuenciaDoc[];
  tentativas: ProvaTentativaDoc[];
  assinaturas: AssinaturaDigitalDoc[];
  onRefresh: () => Promise<void>;
  onOpenCertificate: (cert: CertificadoDoc) => void;
  onOpenPublicDossier: (token: string) => void;
  onGoUpgrade: () => void;
}

type SubView = 'colaboradores' | 'obras' | 'assinaturas';

export const ColaboradoresDossieModule: React.FC<ColaboradoresDossieModuleProps> = ({
  empresa,
  limits,
  obras,
  colaboradores,
  certificados,
  cartas,
  tentativas,
  assinaturas,
  onRefresh,
  onOpenCertificate,
  onOpenPublicDossier,
  onGoUpgrade,
}) => {
  const [subView, setSubView] = useState<SubView>('colaboradores');
  const [search, setSearch] = useState('');
  const [selectedColabId, setSelectedColabId] = useState<string | null>(
    colaboradores[0]?.id ?? null
  );

  // Novo Colaborador
  const [showNewColab, setShowNewColab] = useState(false);
  const [cNome, setCNome] = useState('');
  const [cCpf, setCCpf] = useState('');
  const [cFuncao, setCFuncao] = useState('');
  const [cObraId, setCObraId] = useState('');
  const [cTelefone, setCTelefone] = useState('');

  // Nova Obra
  const [oCodigo, setOCodigo] = useState('');
  const [oNome, setONome] = useState('');
  const [oCliente, setOCliente] = useState('');
  const [oLocal, setOLocal] = useState('');

  // Nova Carta de Anuência
  const [showCartaForm, setShowCartaForm] = useState(false);
  const [cartaTitulo, setCartaTitulo] = useState('Carta de Anuência — Liberação para Atividade Crítica');
  const [cartaNr, setCartaNr] = useState('NR-35');
  const [cartaValidade, setCartaValidade] = useState(
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [cartaResp, setCartaResp] = useState('');
  const [cartaTexto, setCartaTexto] = useState(
    'Declaramos para os devidos fins de auditoria e mobilização em obra que o colaborador encontra-se apto, treinado e formalmente autorizado a executar atividades conforme a Norma Regulamentadora indicada.'
  );

  // Nova Assinatura Digital (Instrutor / RT)
  const [sigTipo, setSigTipo] = useState<'INSTRUTOR' | 'RT' | 'EMPRESA'>('INSTRUTOR');
  const [sigNome, setSigNome] = useState('');
  const [sigRegistro, setSigRegistro] = useState('');
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null);

  // Link temporário de dossiê
  const [generatedDossie, setGeneratedDossie] = useState<DossiePublicoDoc | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const filteredColaboradores = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return colaboradores;
    return colaboradores.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        c.cpf.includes(q) ||
        c.funcao.toLowerCase().includes(q) ||
        (c.contratoObraNome || '').toLowerCase().includes(q)
    );
  }, [colaboradores, search]);

  const activeColab = useMemo(() => {
    if (!filteredColaboradores.length) return null;
    return (
      filteredColaboradores.find((c) => c.id === selectedColabId) ?? filteredColaboradores[0]
    );
  }, [filteredColaboradores, selectedColabId]);

  const colabCerts = useMemo(
    () => (activeColab ? certificados.filter((c) => c.colaboradorId === activeColab.id) : []),
    [activeColab, certificados]
  );

  const colabCartas = useMemo(
    () => (activeColab ? cartas.filter((c) => c.colaboradorId === activeColab.id) : []),
    [activeColab, cartas]
  );

  const colabTentativas = useMemo(() => {
    if (!activeColab) return [];
    const clean = activeColab.cpf.replace(/\D/g, '');
    return tentativas.filter(
      (t) => t.colaboradorId === activeColab.id || t.colaboradorCpf.replace(/\D/g, '') === clean
    );
  }, [activeColab, tentativas]);

  const handleCreateColaborador = async (e: React.FormEvent) => {
    e.preventDefault();
    const obra = obras.find((o) => o.id === cObraId);
    setBusy(true);
    setFeedback(null);
    try {
      const created = await createColaborador(empresa, limits, {
        nome: cNome,
        cpf: cCpf,
        funcao: cFuncao,
        contratoObraId: obra?.id || null,
        contratoObraNome: obra ? `${obra.codigo} — ${obra.nome}` : null,
        telefone: cTelefone,
      });
      await onRefresh();
      setSelectedColabId(created.id);
      setShowNewColab(false);
      setCNome('');
      setCCpf('');
      setCFuncao('');
      setCTelefone('');
      setFeedback({ type: 'ok', text: `Colaborador ${created.nome} cadastrado com sucesso.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao cadastrar colaborador.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteColaborador = async (id: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      await deleteColaborador(empresa.id, id);
      await onRefresh();
      setFeedback({ type: 'ok', text: 'Colaborador removido.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao remover colaborador.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateObra = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      await createObra(empresa, limits, {
        codigo: oCodigo,
        nome: oNome,
        clienteFinal: oCliente,
        localizacao: oLocal,
      });
      await onRefresh();
      setOCodigo('');
      setONome('');
      setOCliente('');
      setOLocal('');
      setFeedback({ type: 'ok', text: 'Contrato / Obra cadastrado com sucesso.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao cadastrar obra.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteObra = async (obraId: string) => {
    setBusy(true);
    try {
      await deleteObra(empresa.id, obraId);
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao excluir obra.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateCarta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeColab) return;
    setBusy(true);
    setFeedback(null);
    try {
      await createCartaAnuencia(empresa, limits, {
        colaboradorId: activeColab.id,
        colaboradorNome: activeColab.nome,
        titulo: cartaTitulo,
        nrReferencia: cartaNr,
        textoLegal: cartaTexto,
        responsavelNome: cartaResp,
        validadeIso: cartaValidade,
      });
      await onRefresh();
      setShowCartaForm(false);
      setFeedback({ type: 'ok', text: 'Carta de Anuência emitida e vinculada ao dossiê.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao emitir Carta de Anuência.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAssinatura = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sigDataUrl) {
      setFeedback({ type: 'err', text: 'Desenhe a assinatura no quadro antes de salvar.' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await saveAssinaturaDigital(empresa, {
        tipo: sigTipo,
        nomeSignatario: sigNome,
        registro: sigRegistro,
        imagemDataUrl: sigDataUrl,
      });
      await onRefresh();
      setSigNome('');
      setSigRegistro('');
      setSigDataUrl(null);
      setFeedback({
        type: 'ok',
        text: 'Assinatura digital salva e pronta para emissão de certificados.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao salvar assinatura.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateDossieLink = async () => {
    if (!activeColab) return;
    setBusy(true);
    setFeedback(null);
    try {
      const created = await createTemporaryDossieLink({
        empresa,
        colaborador: activeColab,
        certificados: colabCerts,
        cartas: colabCartas,
        tentativas: colabTentativas,
        validadeHoras: 72,
      });
      setGeneratedDossie(created);
      setFeedback({
        type: 'ok',
        text: `Link temporário de auditoria gerado (válido por 72 horas): ${created.token}`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao gerar link do dossiê.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadDossie = () => {
    if (!activeColab) return;
    const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" /><title>Dossiê — ${activeColab.nome}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; max-width: 820px; margin: 32px auto; padding: 0 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 24px 0 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
  .meta { font-size: 12px; color: #475569; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
  th { background: #f8fafc; }
</style></head><body>
  <p class="meta">${empresa.razaoSocial} · CNPJ ${empresa.cnpj}</p>
  <h1>Dossiê Unificado — ${activeColab.nome}</h1>
  <p class="meta">CPF: ${activeColab.cpf} · Função: ${activeColab.funcao} · Obra: ${activeColab.contratoObraNome || 'Geral'}</p>
  <h2>Certificados Emitidos (${colabCerts.length})</h2>
  <table><thead><tr><th>Número</th><th>NR</th><th>Treinamento</th><th>CH</th><th>Realização</th><th>Validade</th><th>QR</th></tr></thead><tbody>
    ${colabCerts.map((c) => `<tr><td>${c.numeroCertificado}</td><td>${c.nrCodigo}</td><td>${c.treinamentoTitulo}</td><td>${c.cargaHorariaHoras}h</td><td>${c.dataRealizacaoIso}</td><td>${c.dataValidadeIso}</td><td>${c.codigoValidacaoQr}</td></tr>`).join('') || '<tr><td colspan="7">Nenhum certificado emitido.</td></tr>'}
  </tbody></table>
  <h2>Cartas de Anuência (${colabCartas.length})</h2>
  <table><thead><tr><th>Título</th><th>NR</th><th>Responsável</th><th>Validade</th></tr></thead><tbody>
    ${colabCartas.map((ca) => `<tr><td>${ca.titulo}</td><td>${ca.nrReferencia}</td><td>${ca.responsavelNome || '—'}</td><td>${ca.validadeIso}</td></tr>`).join('') || '<tr><td colspan="4">Nenhuma carta de anuência.</td></tr>'}
  </tbody></table>
  <h2>Provas e Evidências (${colabTentativas.length})</h2>
  <table><thead><tr><th>Status</th><th>Nota</th><th>Acertos</th><th>Selfie</th><th>Assinatura</th></tr></thead><tbody>
    ${colabTentativas.map((t) => `<tr><td>${t.status}</td><td>${t.notaPercentual}%</td><td>${t.acertos ?? 0}/${t.totalQuestoes ?? 0}</td><td>${t.selfieDataUrl ? 'Registrada' : '—'}</td><td>${t.assinaturaDataUrl ? 'Coletada' : '—'}</td></tr>`).join('') || '<tr><td colspan="5">Nenhuma prova registrada.</td></tr>'}
  </tbody></table>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dossie-${activeColab.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-5">
      {/* Navegação Interna */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          {(
            [
              { id: 'colaboradores', label: `Colaboradores & Dossiê (${colaboradores.length})`, icon: Users },
              { id: 'obras', label: `Contratos / Obras (${obras.length})`, icon: Building2 },
              { id: 'assinaturas', label: `Assinaturas Digitais (${assinaturas.length})`, icon: PenTool },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubView(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  subView === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {subView === 'colaboradores' && (
          <button
            type="button"
            onClick={() => setShowNewColab((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo Colaborador
          </button>
        )}
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

      {/* SUBVIEW 1: COLABORADORES & DOSSIÊ UNIFICADO */}
      {subView === 'colaboradores' && (
        <div className="space-y-5">
          {showNewColab && (
            <form
              onSubmit={handleCreateColaborador}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Cadastrar Colaborador</h3>
                <button
                  type="button"
                  onClick={() => setShowNewColab(false)}
                  className="text-xs text-slate-500 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <input
                  required
                  value={cNome}
                  onChange={(e) => setCNome(e.target.value)}
                  placeholder="Nome completo"
                  className="lg:col-span-2 px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
                <input
                  required
                  value={cCpf}
                  onChange={(e) => setCCpf(e.target.value)}
                  placeholder="CPF (000.000.000-00)"
                  className="px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                />
                <input
                  required
                  value={cFuncao}
                  onChange={(e) => setCFuncao(e.target.value)}
                  placeholder="Função (Ex.: Caldeireiro)"
                  className="px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
                <select
                  value={cObraId}
                  onChange={(e) => setCObraId(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                >
                  <option value="">Sem obra vinculada</option>
                  {obras.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.codigo} — {o.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between gap-3">
                <input
                  value={cTelefone}
                  onChange={(e) => setCTelefone(e.target.value)}
                  placeholder="WhatsApp / Telefone (opcional)"
                  className="w-64 px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium hover:bg-[#1E40AF] cursor-pointer disabled:opacity-50"
                >
                  Salvar Colaborador
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Lista de Colaboradores */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-3 border-b border-slate-200 relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-5 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar colaborador..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="divide-y divide-slate-100 max-h-[620px] overflow-y-auto">
                {filteredColaboradores.length === 0 ? (
                  <p className="p-6 text-center text-xs text-slate-500">
                    Nenhum colaborador cadastrado ainda.
                  </p>
                ) : (
                  filteredColaboradores.map((c) => {
                    const selected = activeColab?.id === c.id;
                    const certCount = certificados.filter((x) => x.colaboradorId === c.id).length;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedColabId(c.id);
                          setGeneratedDossie(null);
                        }}
                        className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                          selected ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold truncate">{c.nome}</span>
                          <span
                            className={`text-[11px] font-mono shrink-0 ${
                              selected ? 'text-blue-300' : 'text-slate-400'
                            }`}
                          >
                            {certCount} cert.
                          </span>
                        </div>
                        <p
                          className={`text-[11px] mt-0.5 truncate ${
                            selected ? 'text-slate-300' : 'text-slate-500'
                          }`}
                        >
                          {c.funcao} · {c.cpf}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Dossiê Unificado do Colaborador */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              {!activeColab ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  Selecione ou cadastre um colaborador para visualizar seu Dossiê Unificado.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
                    <div>
                      <p className="text-[11px] font-mono text-slate-400">
                        DOSSIÊ UNIFICADO · {activeColab.cpf}
                      </p>
                      <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                        {activeColab.nome}
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {activeColab.funcao} · {activeColab.contratoObraNome || 'Sem obra vinculada'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadDossie}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Baixar Dossiê
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleGenerateDossieLink()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium hover:bg-[#1E40AF] cursor-pointer disabled:opacity-50"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        Link Temporário Auditoria
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteColaborador(activeColab.id)}
                        className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 cursor-pointer"
                        title="Remover colaborador"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Link temporário gerado */}
                  {generatedDossie && generatedDossie.colaboradorId === activeColab.id && (
                    <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900">
                          Link Temporário de Auditoria Ativo (72h)
                        </p>
                        <p className="text-[11px] font-mono text-slate-600 truncate mt-0.5">
                          {`${window.location.origin}/?dossie=${generatedDossie.token}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard?.writeText(
                              `${window.location.origin}/?dossie=${generatedDossie.token}`
                            );
                            setCopiedLink(true);
                            window.setTimeout(() => setCopiedLink(false), 1800);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700 cursor-pointer"
                        >
                          {copiedLink ? (
                            <Check className="w-3.5 h-3.5 text-emerald-700" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          {copiedLink ? 'Copiado' : 'Copiar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenPublicDossier(generatedDossie.token)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Visualizar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Certificados do Colaborador */}
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                      <FileBadge className="w-4 h-4 text-[#1D4ED8]" />
                      Certificados Emitidos ({colabCerts.length})
                    </h4>
                    {colabCerts.length === 0 ? (
                      <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
                        Nenhum certificado emitido para este colaborador ainda.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                        {colabCerts.map((cert) => (
                          <div
                            key={cert.id}
                            className="px-4 py-3 flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900">
                                <span className="font-mono text-[#1D4ED8] mr-1.5">
                                  {cert.nrCodigo}
                                </span>
                                {cert.treinamentoTitulo}
                              </p>
                              <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                                {cert.numeroCertificado} · Validade {cert.dataValidadeIso} · QR{' '}
                                {cert.codigoValidacaoQr}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => onOpenCertificate(cert)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 shrink-0 cursor-pointer"
                            >
                              Frente e Verso
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Cartas de Anuência */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-slate-700" />
                        Cartas de Anuência ({colabCartas.length})
                      </h4>
                      {limits.incluiCartaAnuencia ? (
                        <button
                          type="button"
                          onClick={() => setShowCartaForm((v) => !v)}
                          className="text-xs font-medium text-[#1D4ED8] hover:underline cursor-pointer"
                        >
                          + Emitir Carta de Anuência
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={onGoUpgrade}
                          className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 hover:underline cursor-pointer"
                        >
                          <Lock className="w-3 h-3" />
                          Liberar em Meu Plano
                        </button>
                      )}
                    </div>

                    {showCartaForm && limits.incluiCartaAnuencia && (
                      <form
                        onSubmit={handleCreateCarta}
                        className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <input
                            required
                            value={cartaTitulo}
                            onChange={(e) => setCartaTitulo(e.target.value)}
                            placeholder="Título da Carta"
                            className="sm:col-span-2 px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                          />
                          <input
                            required
                            value={cartaNr}
                            onChange={(e) => setCartaNr(e.target.value)}
                            placeholder="NR Referência"
                            className="px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                          />
                        </div>
                        <textarea
                          required
                          rows={2}
                          value={cartaTexto}
                          onChange={(e) => setCartaTexto(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              value={cartaResp}
                              onChange={(e) => setCartaResp(e.target.value)}
                              placeholder="Responsável Técnico"
                              className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                            />
                            <input
                              type="date"
                              required
                              value={cartaValidade}
                              onChange={(e) => setCartaValidade(e.target.value)}
                              className="px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={busy}
                            className="px-3.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium cursor-pointer"
                          >
                            Emitir Carta
                          </button>
                        </div>
                      </form>
                    )}

                    {colabCartas.length === 0 ? (
                      <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
                        {limits.incluiCartaAnuencia
                          ? 'Nenhuma Carta de Anuência emitida para este colaborador.'
                          : 'Recurso disponível nos planos Profissional/Enterprise ou via adicional "Cartas de Anuência & Dossiê".'}
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                        {colabCartas.map((ca) => (
                          <div key={ca.id} className="px-4 py-3 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-900">{ca.titulo}</span>
                              <span className="font-mono text-[11px] text-slate-500">
                                {ca.nrReferencia} · Val. {ca.validadeIso}
                              </span>
                            </div>
                            <p className="text-slate-600 mt-1">{ca.textoLegal}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Provas & Evidências (Selfie + Assinatura) */}
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-semibold text-slate-900">
                      Evidências de Provas & Selfies ({colabTentativas.length})
                    </h4>
                    {colabTentativas.length === 0 ? (
                      <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
                        Nenhuma tentativa de prova online registrada para este colaborador.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {colabTentativas.map((t) => (
                          <div
                            key={t.id}
                            className="border border-slate-200 rounded-lg p-3 space-y-2 text-xs"
                          >
                            <div className="flex justify-between">
                              <span
                                className={`font-semibold ${
                                  t.status === 'APROVADO' ? 'text-emerald-700' : 'text-red-700'
                                }`}
                              >
                                {t.status} · {t.notaPercentual}%
                              </span>
                              <span className="font-mono text-[11px] text-slate-400">
                                {t.acertos ?? 0}/{t.totalQuestoes ?? 0}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {t.selfieDataUrl && (
                                <img
                                  src={t.selfieDataUrl}
                                  alt="Selfie"
                                  className="w-12 h-12 rounded-md object-cover border border-slate-200"
                                />
                              )}
                              {t.assinaturaDataUrl && (
                                <img
                                  src={t.assinaturaDataUrl}
                                  alt="Assinatura"
                                  className="h-12 flex-1 object-contain bg-slate-50 rounded-md border border-slate-200 p-1"
                                />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUBVIEW 2: CONTRATOS / OBRAS */}
      {subView === 'obras' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <form
            onSubmit={handleCreateObra}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3"
          >
            <h3 className="text-sm font-semibold text-slate-900">
              Novo Contrato / Obra ({obras.length}/{limits.limiteObras})
            </h3>
            <input
              required
              value={oCodigo}
              onChange={(e) => setOCodigo(e.target.value)}
              placeholder="Código (Ex.: CTR-2026-01)"
              className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
            />
            <input
              required
              value={oNome}
              onChange={(e) => setONome(e.target.value)}
              placeholder="Nome do Contrato ou Unidade"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
            />
            <input
              value={oCliente}
              onChange={(e) => setOCliente(e.target.value)}
              placeholder="Contratante / Cliente final (opcional)"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
            />
            <input
              value={oLocal}
              onChange={(e) => setOLocal(e.target.value)}
              placeholder="Cidade / Polo industrial (opcional)"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium hover:bg-[#1E40AF] cursor-pointer disabled:opacity-50"
            >
              Cadastrar Obra
            </button>
          </form>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 text-xs font-semibold text-slate-900">
              Contratos / Obras Cadastrados
            </div>
            {obras.length === 0 ? (
              <p className="p-6 text-xs text-slate-500 text-center">
                Nenhuma obra cadastrada ainda.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {obras.map((o) => (
                  <div
                    key={o.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        <span className="font-mono text-[#1D4ED8] mr-1.5">{o.codigo}</span>
                        {o.nome}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {o.clienteFinal || 'Cliente não informado'}{' '}
                        {o.localizacao ? `· ${o.localizacao}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteObra(o.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBVIEW 3: ASSINATURAS DIGITAIS */}
      {subView === 'assinaturas' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <form
            onSubmit={handleSaveAssinatura}
            className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Cadastrar Assinatura Digital (Instrutor / RT)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Utilizada automaticamente na frente dos certificados emitidos pela empresa.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <select
                value={sigTipo}
                onChange={(e) => setSigTipo(e.target.value as 'INSTRUTOR' | 'RT' | 'EMPRESA')}
                className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
              >
                <option value="INSTRUTOR">Instrutor / TST</option>
                <option value="RT">Responsável Técnico</option>
                <option value="EMPRESA">Empresa</option>
              </select>
              <input
                required
                value={sigNome}
                onChange={(e) => setSigNome(e.target.value)}
                placeholder="Nome do signatário"
                className="px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
              <input
                value={sigRegistro}
                onChange={(e) => setSigRegistro(e.target.value)}
                placeholder="CREA / MTE"
                className="px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
              />
            </div>

            <SignaturePadCanvas
              value={sigDataUrl}
              onChange={setSigDataUrl}
              height={150}
              label="Desenhe a assinatura do signatário"
            />

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium hover:bg-[#1E40AF] cursor-pointer disabled:opacity-50"
            >
              Salvar Assinatura Digital
            </button>
          </form>

          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Assinaturas Ativas ({assinaturas.length})
            </h3>
            {assinaturas.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhuma assinatura cadastrada ainda.</p>
            ) : (
              <div className="space-y-3">
                {assinaturas.map((sig) => (
                  <div
                    key={sig.id}
                    className="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-4"
                  >
                    <div>
                      <p className="text-[11px] font-mono font-semibold text-[#1D4ED8]">
                        {sig.tipo}
                      </p>
                      <p className="text-xs font-semibold text-slate-900">{sig.nomeSignatario}</p>
                      <p className="text-[11px] text-slate-500">{sig.registro || 'Sem registro'}</p>
                    </div>
                    <img
                      src={sig.imagemDataUrl}
                      alt={sig.nomeSignatario}
                      className="h-12 max-w-[160px] object-contain bg-slate-50 border border-slate-200 rounded p-1"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
