import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Plus, Save, Tag, TicketPercent, Trash2 } from 'lucide-react';
import type { CicloCobranca, CupomDoc, TipoDescontoCupom } from '../../types/domain.ts';
import type { PlanoCatalogo } from '../../data/globalCatalogSeed.ts';
import { formatarMoedaBRL } from '../../data/globalCatalogSeed.ts';
import {
  deleteCupom,
  getScheduleState,
  listCupons,
  saveCupom,
} from '../../services/cmsAndCommsService.ts';

interface SuperAdminCuponsProps {
  planos: PlanoCatalogo[];
}

export const SuperAdminCupons: React.FC<SuperAdminCuponsProps> = ({ planos }) => {
  const [cupons, setCupons] = useState<CupomDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tipoDesconto, setTipoDesconto] = useState<TipoDescontoCupom>('PERCENTUAL');
  const [valorInput, setValorInput] = useState('20');
  const [planosAplicaveis, setPlanosAplicaveis] = useState<string[]>([]);
  const [ciclosAplicaveis, setCiclosAplicaveis] = useState<CicloCobranca[]>([]);
  const [inicioIso, setInicioIso] = useState('');
  const [fimIso, setFimIso] = useState('');
  const [limiteUsos, setLimiteUsos] = useState('0');
  const [ativo, setAtivo] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listCupons(true);
      setCupons(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setCodigo('');
    setDescricao('');
    setTipoDesconto('PERCENTUAL');
    setValorInput('20');
    setPlanosAplicaveis([]);
    setCiclosAplicaveis([]);
    setInicioIso('');
    setFimIso('');
    setLimiteUsos('0');
    setAtivo(true);
  };

  const handleSelectEdit = (c: CupomDoc) => {
    setEditingId(c.id);
    setCodigo(c.codigo);
    setDescricao(c.descricao || '');
    setTipoDesconto(c.tipoDesconto);
    setValorInput(
      c.tipoDesconto === 'FIXO' ? (c.valorDesconto / 100).toFixed(2) : String(c.valorDesconto)
    );
    setPlanosAplicaveis(c.planosAplicaveis || []);
    setCiclosAplicaveis(c.ciclosAplicaveis || []);
    setInicioIso(c.inicioIso || '');
    setFimIso(c.fimIso || '');
    setLimiteUsos(String(c.limiteUsos || 0));
    setAtivo(c.ativo);
  };

  const togglePlano = (slug: string) => {
    setPlanosAplicaveis((prev) =>
      prev.includes(slug) ? prev.filter((p) => p !== slug) : [...prev, slug]
    );
  };

  const toggleCiclo = (c: CicloCobranca) => {
    setCiclosAplicaveis((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const rawNum = Number(valorInput.replace(',', '.'));
      if (Number.isNaN(rawNum) || rawNum <= 0) {
        throw new Error('Informe um valor de desconto válido.');
      }
      const valorFinal =
        tipoDesconto === 'FIXO' ? Math.round(rawNum * 100) : Math.min(90, Math.round(rawNum));

      await saveCupom({
        id: editingId || undefined,
        codigo,
        descricao,
        tipoDesconto,
        valorDesconto: valorFinal,
        planosAplicaveis,
        ciclosAplicaveis,
        inicioIso,
        fimIso,
        limiteUsos: Math.max(0, Number(limiteUsos) || 0),
        usosAtuais: 0,
        ativo,
      });

      await load();
      setFeedback({
        type: 'ok',
        text: `Cupom "${codigo.toUpperCase()}" salvo e disponível para validação no checkout.`,
      });
      resetForm();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao salvar cupom.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cupom: CupomDoc) => {
    try {
      await deleteCupom(cupom.id);
      await load();
      if (editingId === cupom.id) resetForm();
      setFeedback({ type: 'ok', text: `Cupom "${cupom.codigo}" removido.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao remover cupom.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Cupons de Desconto
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Crie cupons percentuais ou de valor fixo com limite de usos, validade e restrição por
            plano/ciclo. Validados automaticamente no Checkout 4 Etapas e nos banners do CMS.
          </p>
        </div>
        {editingId && (
          <button
            type="button"
            onClick={resetForm}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-white/15 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer self-start"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo Cupom
          </button>
        )}
      </div>

      {feedback && (
        <div
          className={`rounded-xl px-4 py-3 text-xs border flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-900 dark:text-red-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Lista de Cupons */}
        <div className="lg:col-span-7 space-y-3">
          {loading ? (
            <div className="dk-glass-card rounded-2xl p-8 text-center text-xs text-slate-400">
              Carregando cupons cadastrados...
            </div>
          ) : cupons.length === 0 ? (
            <div className="dk-glass-card rounded-2xl p-10 text-center space-y-2">
              <TicketPercent className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Nenhum cupom criado ainda
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Use o formulário ao lado para criar cupons como BLACKDK30 ou BEMVINDO10.
              </p>
            </div>
          ) : (
            cupons.map((c) => {
              const state = getScheduleState(c.ativo, c.inicioIso, c.fimIso);
              const usoPct =
                c.limiteUsos > 0 ? Math.min(100, Math.round((c.usosAtuais / c.limiteUsos) * 100)) : 0;
              return (
                <div
                  key={c.id}
                  className="dk-glass-card rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-mono text-sm font-bold text-slate-900 dark:text-white px-2.5 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/25 text-blue-600 dark:text-blue-400">
                        {c.codigo}
                      </span>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {c.tipoDesconto === 'PERCENTUAL'
                          ? `${c.valorDesconto}% OFF`
                          : `${formatarMoedaBRL(c.valorDesconto)} OFF`}
                      </span>
                      <span
                        className={`text-[11px] font-semibold ${
                          state === 'ATIVO'
                            ? 'text-emerald-500'
                            : state === 'AGENDADO'
                              ? 'text-amber-500'
                              : 'text-slate-400'
                        }`}
                      >
                        • {state}
                      </span>
                    </div>

                    {c.descricao && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{c.descricao}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      <span>
                        Usos: <strong className="text-slate-800 dark:text-slate-200">{c.usosAtuais}</strong>
                        {c.limiteUsos > 0 ? ` / ${c.limiteUsos}` : ' (ilimitado)'}
                      </span>
                      <span>
                        Planos:{' '}
                        {c.planosAplicaveis.length > 0 ? c.planosAplicaveis.join(', ') : 'Todos'}
                      </span>
                      <span>
                        Ciclos:{' '}
                        {c.ciclosAplicaveis.length > 0 ? c.ciclosAplicaveis.join(', ') : 'Todos'}
                      </span>
                    </div>

                    {c.limiteUsos > 0 && (
                      <div className="w-48 h-1.5 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${usoPct}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSelectEdit(c)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/15 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 cursor-pointer"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(c)}
                      className="p-1.5 rounded-lg border border-red-200 dark:border-red-500/30 text-red-500 hover:bg-red-500/10 cursor-pointer"
                      title="Excluir cupom"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Formulário Criar / Editar Cupom */}
        <form onSubmit={handleSubmit} className="lg:col-span-5 dk-glass-card rounded-2xl p-6 space-y-4 text-xs">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-white/10">
            <Tag className="w-4 h-4 text-blue-500" />
            {editingId ? `Editar Cupom (${codigo})` : 'Criar Novo Cupom'}
          </h3>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Código do Cupom *
            </label>
            <input
              required
              disabled={Boolean(editingId)}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
              placeholder="Ex.: BLACKDK30"
              className="w-full px-3 py-2.5 rounded-xl font-mono uppercase bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Descrição interna (opcional)
            </label>
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: Campanha Black Friday planos anuais"
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Tipo de Desconto
              </label>
              <select
                value={tipoDesconto}
                onChange={(e) => setTipoDesconto(e.target.value as TipoDescontoCupom)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
              >
                <option value="PERCENTUAL">Percentual (%)</option>
                <option value="FIXO">Valor Fixo (R$)</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tipoDesconto === 'PERCENTUAL' ? 'Desconto (%)' : 'Desconto (R$)'}
              </label>
              <input
                required
                value={valorInput}
                onChange={(e) => setValorInput(e.target.value)}
                placeholder={tipoDesconto === 'PERCENTUAL' ? '30' : '50.00'}
                className="w-full px-3 py-2 rounded-xl font-mono bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Planos Aplicáveis (nenhum marcado = todos os planos)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {planos.map((p) => {
                const selected = planosAplicaveis.includes(p.slug);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlano(p.slug)}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer ${
                      selected
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-slate-50 dark:bg-white/[0.04] border-slate-200 dark:border-white/15 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {p.nome}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Ciclos Aplicáveis (nenhum marcado = todos os ciclos)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(['MENSAL', 'SEMESTRAL', 'ANUAL'] as CicloCobranca[]).map((c) => {
                const selected = ciclosAplicaveis.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCiclo(c)}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer ${
                      selected
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-slate-50 dark:bg-white/[0.04] border-slate-200 dark:border-white/15 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Válido a partir de
              </label>
              <input
                type="date"
                value={inicioIso}
                onChange={(e) => setInicioIso(e.target.value)}
                className="w-full px-3 py-2 rounded-xl font-mono bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Expira em
              </label>
              <input
                type="date"
                value={fimIso}
                onChange={(e) => setFimIso(e.target.value)}
                className="w-full px-3 py-2 rounded-xl font-mono bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Limite de Usos (0 = ilimitado)
              </label>
              <input
                type="number"
                min={0}
                value={limiteUsos}
                onChange={(e) => setLimiteUsos(e.target.value)}
                className="w-full px-3 py-2 rounded-xl font-mono bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex items-center justify-between pt-4">
              <span className="font-medium text-slate-700 dark:text-slate-200">Cupom Ativo</span>
              <button
                type="button"
                onClick={() => setAtivo((v) => !v)}
                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                  ativo ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    ativo ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white font-semibold hover:from-[#1D4ED8] hover:to-[#2563EB] shadow-lg shadow-blue-600/25 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : editingId ? 'Atualizar Cupom' : 'Salvar Cupom'}
          </button>
        </form>
      </div>
    </div>
  );
};
