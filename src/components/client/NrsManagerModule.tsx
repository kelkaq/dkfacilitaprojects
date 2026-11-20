import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Columns2,
  Download,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import type { GlobalCatalogSnapshot } from '../../services/catalogService.ts';
import type { ConteudoLinhaCatalogo } from '../../data/globalCatalogSeed.ts';
import type { EmpresaDoc, TreinamentoEmpresaDoc } from '../../types/domain.ts';
import {
  deleteTreinamentoEmpresa,
  saveTreinamentoEmpresa,
} from '../../services/operationalCrudService.ts';

interface NrsManagerModuleProps {
  empresa: EmpresaDoc;
  catalog: GlobalCatalogSnapshot | null;
  treinamentos: TreinamentoEmpresaDoc[];
  onRefresh: () => Promise<void>;
}

export const NrsManagerModule: React.FC<NrsManagerModuleProps> = ({
  empresa,
  catalog,
  treinamentos,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [selectedNrCodigo, setSelectedNrCodigo] = useState<string | null>(null);
  const [selectedVariacaoId, setSelectedVariacaoId] = useState<string | null>(null);

  // Estado editável da variação selecionada
  const [variacaoNome, setVariacaoNome] = useState('');
  const [nrTitulo, setNrTitulo] = useState('');
  const [modalidade, setModalidade] = useState<'INICIAL' | 'RECICLAGEM' | 'COMPLEMENTAR'>('INICIAL');
  const [cargaHorariaHoras, setCargaHorariaHoras] = useState(8);
  const [validadeMeses, setValidadeMeses] = useState(24);
  const [notaMinimaAprovacao, setNotaMinimaAprovacao] = useState(70);
  const [baseLegal, setBaseLegal] = useState('');
  const [linhas, setLinhas] = useState<ConteudoLinhaCatalogo[]>([]);
  const [novaLinhaTexto, setNovaLinhaTexto] = useState('');
  const [novaLinhaMin, setNovaLinhaMin] = useState('');

  // Modal/Drawer para Nova NR/Variação ou Importar do Catálogo Global
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newNrCodigo, setNewNrCodigo] = useState('NR-35');
  const [newNrTitulo, setNewNrTitulo] = useState('');
  const [newVarNome, setNewVarNome] = useState('');
  const [newModalidade, setNewModalidade] = useState<'INICIAL' | 'RECICLAGEM' | 'COMPLEMENTAR'>('INICIAL');
  const [newCarga, setNewCarga] = useState(8);
  const [newValidade, setNewValidade] = useState(24);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Agrupamento limpo por Norma Pai (ex.: NR-10, NR-33, NR-34, NR-35)
  const normasAgrupadas = useMemo(() => {
    const map = new Map<
      string,
      { codigo: string; titulo: string; variacoes: TreinamentoEmpresaDoc[] }
    >();
    for (const tr of treinamentos) {
      const code = tr.nrCodigo.toUpperCase();
      const group = map.get(code);
      if (group) {
        group.variacoes.push(tr);
      } else {
        map.set(code, {
          codigo: code,
          titulo: tr.nrTitulo,
          variacoes: [tr],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true })
    );
  }, [treinamentos]);

  const filteredNormas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return normasAgrupadas;
    return normasAgrupadas.filter(
      (n) =>
        n.codigo.toLowerCase().includes(q) ||
        n.titulo.toLowerCase().includes(q) ||
        n.variacoes.some((v) => v.variacaoNome.toLowerCase().includes(q))
    );
  }, [normasAgrupadas, search]);

  const activeNorma = useMemo(() => {
    if (!filteredNormas.length) return null;
    return (
      filteredNormas.find((n) => n.codigo === selectedNrCodigo) ?? filteredNormas[0]
    );
  }, [filteredNormas, selectedNrCodigo]);

  const activeVariacao = useMemo(() => {
    if (!activeNorma || !activeNorma.variacoes.length) return null;
    return (
      activeNorma.variacoes.find((v) => v.id === selectedVariacaoId) ??
      activeNorma.variacoes[0]
    );
  }, [activeNorma, selectedVariacaoId]);

  useEffect(() => {
    if (!activeVariacao) return;
    setVariacaoNome(activeVariacao.variacaoNome);
    setNrTitulo(activeVariacao.nrTitulo);
    setModalidade(activeVariacao.modalidade);
    setCargaHorariaHoras(activeVariacao.cargaHorariaHoras);
    setValidadeMeses(activeVariacao.validadeMeses);
    setNotaMinimaAprovacao(activeVariacao.notaMinimaAprovacao);
    setBaseLegal(activeVariacao.baseLegal || '');
    setLinhas(
      activeVariacao.conteudoLinhas.map((l, idx) => ({
        ordem: idx + 1,
        descricao: l.descricao,
        cargaHorariaMin: l.cargaHorariaMin ?? null,
      }))
    );
  }, [activeVariacao]);

  const colunasVerso: 1 | 2 = linhas.length > 12 ? 2 : 1;

  const handleAddLine = () => {
    const texto = novaLinhaTexto.trim();
    if (!texto) return;
    const minVal = novaLinhaMin.trim() ? Number(novaLinhaMin) : null;
    setLinhas((prev) => [
      ...prev,
      {
        ordem: prev.length + 1,
        descricao: texto,
        cargaHorariaMin: minVal && !Number.isNaN(minVal) ? minVal : null,
      },
    ]);
    setNovaLinhaTexto('');
    setNovaLinhaMin('');
  };

  const handleMoveLine = (idx: number, delta: -1 | 1) => {
    const target = idx + delta;
    if (target < 0 || target >= linhas.length) return;
    const copy = [...linhas];
    const [moved] = copy.splice(idx, 1);
    copy.splice(target, 0, moved);
    setLinhas(copy.map((item, i) => ({ ...item, ordem: i + 1 })));
  };

  const handleRemoveLine = (idx: number) => {
    setLinhas((prev) =>
      prev.filter((_, i) => i !== idx).map((item, i) => ({ ...item, ordem: i + 1 }))
    );
  };

  const handleUpdateLineText = (idx: number, text: string) => {
    setLinhas((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, descricao: text } : item))
    );
  };

  const handleUpdateLineMin = (idx: number, raw: string) => {
    const val = raw.trim() ? Number(raw) : null;
    setLinhas((prev) =>
      prev.map((item, i) =>
        i === idx
          ? { ...item, cargaHorariaMin: val && !Number.isNaN(val) ? val : null }
          : item
      )
    );
  };

  const handleSaveCurrent = async () => {
    if (!activeVariacao) return;
    setSaving(true);
    setFeedback(null);
    try {
      await saveTreinamentoEmpresa(empresa, {
        id: activeVariacao.id,
        nrCodigo: activeVariacao.nrCodigo,
        nrTitulo: nrTitulo.trim() || activeVariacao.nrTitulo,
        variacaoNome: variacaoNome.trim() || activeVariacao.variacaoNome,
        modalidade,
        cargaHorariaHoras: Math.max(1, Number(cargaHorariaHoras) || 1),
        validadeMeses: Math.max(1, Number(validadeMeses) || 12),
        notaMinimaAprovacao: Math.min(100, Math.max(0, Number(notaMinimaAprovacao) || 70)),
        baseLegal: baseLegal.trim() || null,
        conteudoLinhas: linhas.filter((l) => l.descricao.trim().length > 0),
      });
      await onRefresh();
      setFeedback({
        type: 'ok',
        text: `Conteúdo programático de ${activeVariacao.nrCodigo} (${variacaoNome}) salvo com ${linhas.length} linhas.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao salvar treinamento.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCurrent = async () => {
    if (!activeVariacao) return;
    setSaving(true);
    setFeedback(null);
    try {
      await deleteTreinamentoEmpresa(empresa.id, activeVariacao.id);
      setSelectedVariacaoId(null);
      await onRefresh();
      setFeedback({
        type: 'ok',
        text: `Variação "${activeVariacao.variacaoNome}" removida da empresa.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao remover variação.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleImportGlobalNr = async (nrCodigo: string) => {
    const globalNr = catalog?.nrs.find((n) => n.codigo === nrCodigo);
    if (!globalNr) return;
    setSaving(true);
    setFeedback(null);
    try {
      let count = 0;
      for (const v of globalNr.variacoes) {
        const exists = treinamentos.some(
          (t) =>
            t.nrCodigo.toUpperCase() === globalNr.codigo.toUpperCase() &&
            t.variacaoNome.toLowerCase() === v.nome.toLowerCase()
        );
        if (exists) continue;
        await saveTreinamentoEmpresa(empresa, {
          nrCodigo: globalNr.codigo,
          nrTitulo: globalNr.titulo,
          variacaoNome: v.nome,
          modalidade: v.modalidade,
          cargaHorariaHoras: v.cargaHorariaHoras,
          validadeMeses: v.validadeMeses,
          notaMinimaAprovacao: v.notaMinimaAprovacao,
          baseLegal: globalNr.baseLegal,
          conteudoLinhas: v.linhas,
        });
        count += 1;
      }
      await onRefresh();
      setSelectedNrCodigo(globalNr.codigo.toUpperCase());
      setShowImportPanel(false);
      setFeedback({
        type: 'ok',
        text:
          count > 0
            ? `${globalNr.codigo} importada com ${count} variação(ões) e conteúdo linha por linha.`
            : `${globalNr.codigo} já possui todas as variações padrão nesta empresa.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao importar norma do catálogo.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCustomVariacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNrCodigo.trim() || !newVarNome.trim()) return;
    setSaving(true);
    setFeedback(null);
    try {
      const created = await saveTreinamentoEmpresa(empresa, {
        nrCodigo: newNrCodigo.trim().toUpperCase(),
        nrTitulo:
          newNrTitulo.trim() ||
          activeNorma?.titulo ||
          `Treinamento ${newNrCodigo.trim().toUpperCase()}`,
        variacaoNome: newVarNome.trim(),
        modalidade: newModalidade,
        cargaHorariaHoras: Math.max(1, Number(newCarga) || 8),
        validadeMeses: Math.max(1, Number(newValidade) || 24),
        notaMinimaAprovacao: 70,
        baseLegal: activeVariacao?.baseLegal || 'Norma Regulamentadora MTE',
        conteudoLinhas: [
          { ordem: 1, descricao: 'Objetivos, responsabilidades e base legal da norma.', cargaHorariaMin: 60 },
          { ordem: 2, descricao: 'Análise de riscos, medidas de controle e procedimentos seguros.', cargaHorariaMin: 120 },
        ],
      });
      await onRefresh();
      setSelectedNrCodigo(created.nrCodigo);
      setSelectedVariacaoId(created.id);
      setShowNewModal(false);
      setNewVarNome('');
      setFeedback({
        type: 'ok',
        text: `Variação "${created.variacaoNome}" criada em ${created.nrCodigo}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao criar variação.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Barra superior de ações */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            NRs & Conteúdo Programático Linha por Linha
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Organize por Norma Pai, gerencie variações e visualize o verso do certificado em tempo
            real.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowImportPanel((v) => !v);
              setShowNewModal(false);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1120]/90 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.05] dark:bg-white/[0.04] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Importar NR do Catálogo Global
          </button>
          <button
            type="button"
            onClick={() => {
              setNewNrCodigo(activeNorma?.codigo || 'NR-35');
              setNewNrTitulo(activeNorma?.titulo || '');
              setShowNewModal((v) => !v);
              setShowImportPanel(false);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Nova NR / Variação
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl px-4 py-3 text-xs border flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-900 dark:text-red-200'
          }`}
        >
          {feedback.type === 'ok' && <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Drawer de Importação do Catálogo Global */}
      {showImportPanel && (
        <div className="bg-white dark:bg-[#0B1120]/90 border border-slate-200 dark:border-white/10 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Catálogo Global DK Facilita ({catalog?.nrs.length ?? 0} NRs disponíveis)
            </h3>
            <button
              type="button"
              onClick={() => setShowImportPanel(false)}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white dark:text-white cursor-pointer"
            >
              Fechar
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {(catalog?.nrs ?? []).map((nr) => (
              <div
                key={nr.id}
                className="border border-slate-200 dark:border-white/10 rounded-lg p-3 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs font-bold text-slate-900 dark:text-white">{nr.codigo}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 truncate">{nr.titulo}</p>
                  <p className="text-[11px] text-slate-400">
                    {nr.variacoes.length} variações padrão
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleImportGlobalNr(nr.codigo)}
                  className="px-2.5 py-1.5 rounded-md bg-slate-900 text-white text-[11px] font-medium hover:bg-slate-800 shrink-0 cursor-pointer disabled:opacity-50"
                >
                  Importar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Formulário Nova NR / Variação */}
      {showNewModal && (
        <form
          onSubmit={handleCreateCustomVariacao}
          className="bg-white dark:bg-[#0B1120]/90 border border-slate-200 dark:border-white/10 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Cadastrar Nova NR ou Variação de Treinamento
            </h3>
            <button
              type="button"
              onClick={() => setShowNewModal(false)}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white dark:text-white cursor-pointer"
            >
              Cancelar
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">Norma Pai</label>
              <input
                required
                value={newNrCodigo}
                onChange={(e) => setNewNrCodigo(e.target.value)}
                placeholder="Ex.: NR-35"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 dark:border-white/10 rounded-lg"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                Título da Norma
              </label>
              <input
                required
                value={newNrTitulo}
                onChange={(e) => setNewNrTitulo(e.target.value)}
                placeholder="Ex.: Trabalho em Altura"
                className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-white/10 rounded-lg"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                Nome da Variação
              </label>
              <input
                required
                value={newVarNome}
                onChange={(e) => setNewVarNome(e.target.value)}
                placeholder="Ex.: Reciclagem 4h / Observador 8h"
                className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-white/10 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">Modalidade</label>
              <select
                value={newModalidade}
                onChange={(e) =>
                  setNewModalidade(e.target.value as 'INICIAL' | 'RECICLAGEM' | 'COMPLEMENTAR')
                }
                className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-white/10 rounded-lg bg-white dark:bg-[#0B1120]/90"
              >
                <option value="INICIAL">Inicial</option>
                <option value="RECICLAGEM">Reciclagem</option>
                <option value="COMPLEMENTAR">Complementar</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Carga (h)
                </label>
                <input
                  type="number"
                  min={1}
                  value={newCarga}
                  onChange={(e) => setNewCarga(Number(e.target.value))}
                  className="w-24 px-3 py-2 text-xs font-mono border border-slate-200 dark:border-white/10 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Validade (meses)
                </label>
                <input
                  type="number"
                  min={1}
                  value={newValidade}
                  onChange={(e) => setNewValidade(Number(e.target.value))}
                  className="w-28 px-3 py-2 text-xs font-mono border border-slate-200 dark:border-white/10 rounded-lg"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium hover:bg-[#1E40AF] cursor-pointer disabled:opacity-50"
            >
              Criar Variação
            </button>
          </div>
        </form>
      )}

      {/* Layout Principal: Lista de Normas Pai + Editor + Prévia ao Vivo do Verso */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Coluna 1: Normas Pai */}
        <div className="xl:col-span-3 bg-white dark:bg-[#0B1120]/90 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-slate-200 dark:border-white/10 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar NR..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-lg"
            />
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[600px] overflow-y-auto">
            {filteredNormas.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                Nenhuma NR cadastrada. Clique em "Importar NR do Catálogo Global".
              </div>
            ) : (
              filteredNormas.map((norma) => {
                const selected = activeNorma?.codigo === norma.codigo;
                return (
                  <button
                    key={norma.codigo}
                    type="button"
                    onClick={() => {
                      setSelectedNrCodigo(norma.codigo);
                      setSelectedVariacaoId(norma.variacoes[0]?.id ?? null);
                    }}
                    className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                      selected ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 dark:hover:bg-white/[0.05] dark:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold">{norma.codigo}</span>
                      <span
                        className={`text-[11px] font-mono ${
                          selected ? 'text-slate-300' : 'text-slate-400'
                        }`}
                      >
                        {norma.variacoes.length} var.
                      </span>
                    </div>
                    <p
                      className={`text-xs mt-0.5 line-clamp-1 ${
                        selected ? 'text-slate-200' : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {norma.titulo}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Coluna 2: Variações + Editor Linha por Linha */}
        <div className="xl:col-span-5 bg-white dark:bg-[#0B1120]/90 border border-slate-200 dark:border-white/10 rounded-xl p-5 space-y-5">
          {!activeNorma || !activeVariacao ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              Selecione uma Norma Pai à esquerda para editar suas variações e conteúdo programático.
            </div>
          ) : (
            <>
              {/* Abas de Variações */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-[#1D4ED8] dark:text-blue-400">
                      {activeNorma.codigo}
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{activeNorma.titulo}</h3>
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleDeleteCurrent()}
                    title="Excluir variação selecionada"
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-400 hover:text-red-600 hover:border-red-200 dark:border-red-500/30 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 dark:bg-white/[0.06] rounded-lg">
                  {activeNorma.variacoes.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVariacaoId(v.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        activeVariacao.id === v.id
                          ? 'bg-white dark:bg-[#0B1120]/90 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white dark:text-white'
                      }`}
                    >
                      {v.variacaoNome} ({v.cargaHorariaHoras}h)
                    </button>
                  ))}
                </div>
              </div>

              {/* Metadados da Variação */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                <div className="col-span-2">
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Nome da Variação
                  </label>
                  <input
                    value={variacaoNome}
                    onChange={(e) => setVariacaoNome(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-white/10 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Carga (h)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={cargaHorariaHoras}
                    onChange={(e) => setCargaHorariaHoras(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 dark:border-white/10 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Validade (m)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={validadeMeses}
                    onChange={(e) => setValidadeMeses(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 dark:border-white/10 rounded-lg"
                  />
                </div>
              </div>

              {/* Editor LINHA POR LINHA */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
                    Conteúdo Programático Linha por Linha ({linhas.length} tópicos)
                  </h4>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    Nota mín. {notaMinimaAprovacao}%
                  </span>
                </div>

                <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
                  {linhas.map((linha, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-1.5 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-lg p-1.5"
                    >
                      <span className="font-mono text-[11px] text-slate-400 w-6 text-center shrink-0">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <input
                        value={linha.descricao}
                        onChange={(e) => handleUpdateLineText(idx, e.target.value)}
                        className="flex-1 min-w-0 bg-white dark:bg-[#0B1120]/90 px-2.5 py-1.5 text-xs border border-slate-200 dark:border-white/10 rounded-md"
                      />
                      <input
                        type="number"
                        min={0}
                        placeholder="min"
                        value={linha.cargaHorariaMin ?? ''}
                        onChange={(e) => handleUpdateLineMin(idx, e.target.value)}
                        className="w-16 bg-white dark:bg-[#0B1120]/90 px-2 py-1.5 text-xs font-mono text-right border border-slate-200 dark:border-white/10 rounded-md shrink-0"
                        title="Carga horária opcional em minutos"
                      />
                      <div className="flex items-center shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMoveLine(idx, -1)}
                          disabled={idx === 0}
                          className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white dark:text-white disabled:opacity-30 cursor-pointer"
                          title="Mover para cima"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveLine(idx, 1)}
                          disabled={idx === linhas.length - 1}
                          className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white dark:text-white disabled:opacity-30 cursor-pointer"
                          title="Mover para baixo"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                          title="Remover linha"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Adicionar Nova Linha */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    value={novaLinhaTexto}
                    onChange={(e) => setNovaLinhaTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddLine();
                      }
                    }}
                    placeholder="Adicionar nova linha do conteúdo programático..."
                    className="flex-1 px-3 py-2 text-xs border border-slate-200 dark:border-white/10 rounded-lg"
                  />
                  <input
                    type="number"
                    min={0}
                    value={novaLinhaMin}
                    onChange={(e) => setNovaLinhaMin(e.target.value)}
                    placeholder="Min"
                    className="w-16 px-2 py-2 text-xs font-mono border border-slate-200 dark:border-white/10 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.05] dark:bg-white/[0.04] cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Linha
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveCurrent()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium hover:bg-[#1E40AF] cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Salvando...' : 'Salvar Alterações no Banco'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Coluna 3: Prévia ao Vivo do Verso do Certificado */}
        <div className="xl:col-span-4 bg-white dark:bg-[#0B1120]/90 border border-slate-200 dark:border-white/10 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                Prévia ao Vivo — Verso do Certificado
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Ajuste automático: até 12 linhas = 1 coluna · acima de 12 = 2 colunas
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-[#1D4ED8] dark:text-blue-400">
              <Columns2 className="w-3.5 h-3.5" />
              {colunasVerso} {colunasVerso === 1 ? 'col' : 'cols'}
            </span>
          </div>

          {/* Simulação fiel A4 Paisagem do Verso */}
          <div
            className="dk-paper-surface text-slate-900 border border-slate-300 rounded-lg bg-white p-4 shadow-xs min-h-[360px] flex flex-col justify-between"
            style={{ borderTop: `4px solid ${empresa.corPrimaria || '#0F172A'}` }}
          >
            <div>
              <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-200">
                <div>
                  <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                    Conteúdo Programático Ministrado
                  </p>
                  <p className="text-xs font-bold text-slate-900 mt-0.5">
                    {activeNorma?.codigo || 'NR'} — {variacaoNome || 'Variação'} ({cargaHorariaHoras}h)
                  </p>
                </div>
                <div className="text-right text-[10px] font-mono text-slate-500 shrink-0">
                  <p>{empresa.prefixoCertificado}-2026-00001</p>
                  <p>{linhas.length} tópicos</p>
                </div>
              </div>

              <div
                className={`mt-3 grid gap-x-4 gap-y-1.5 ${
                  colunasVerso === 2 ? 'grid-cols-2' : 'grid-cols-1'
                }`}
              >
                {linhas.map((l, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-700"
                  >
                    <span className="font-mono font-semibold text-slate-400 shrink-0">
                      {String(idx + 1).padStart(2, '0')}.
                    </span>
                    <span className="flex-1">{l.descricao || '—'}</span>
                    {l.cargaHorariaMin ? (
                      <span className="font-mono text-[9px] text-slate-400 shrink-0">
                        {l.cargaHorariaMin}m
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between gap-3 text-[9px] text-slate-500">
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 truncate">{empresa.razaoSocial}</p>
                <p className="font-mono">CNPJ {empresa.cnpj}</p>
                <p className="truncate">{baseLegal || 'Conformidade com Normas Regulamentadoras MTE'}</p>
              </div>
              <div className="w-10 h-10 rounded border border-slate-300 bg-slate-50 flex items-center justify-center font-mono text-[8px] text-slate-500 shrink-0">
                QR
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
