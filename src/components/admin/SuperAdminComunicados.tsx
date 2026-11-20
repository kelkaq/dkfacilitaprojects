import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Info,
  Megaphone,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Wrench,
} from 'lucide-react';
import type {
  ComunicadoDoc,
  PublicoComunicado,
  RepeticaoComunicado,
  StatusComunicado,
  TipoComunicado,
} from '../../types/domain.ts';
import type { PlanoCatalogo } from '../../data/globalCatalogSeed.ts';
import {
  deleteComunicado,
  listComunicados,
  saveComunicado,
} from '../../services/cmsAndCommsService.ts';

interface SuperAdminComunicadosProps {
  planos: PlanoCatalogo[];
}

export const SuperAdminComunicados: React.FC<SuperAdminComunicadosProps> = ({ planos }) => {
  const [items, setItems] = useState<ComunicadoDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [tipo, setTipo] = useState<TipoComunicado>('NOVIDADE');
  const [exibirPopup, setExibirPopup] = useState(true);
  const [publicoAlvo, setPublicoAlvo] = useState<PublicoComunicado>('TODAS');
  const [planoAlvoSlug, setPlanoAlvoSlug] = useState('');
  const [agendadoInicioIso, setAgendadoInicioIso] = useState('');
  const [agendadoFimIso, setAgendadoFimIso] = useState('');
  const [repeticao, setRepeticao] = useState<RepeticaoComunicado>('UNICO');
  const [status, setStatus] = useState<StatusComunicado>('ATIVO');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listComunicados(true);
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setTitulo('');
    setMensagem('');
    setTipo('NOVIDADE');
    setExibirPopup(true);
    setPublicoAlvo('TODAS');
    setPlanoAlvoSlug('');
    setAgendadoInicioIso('');
    setAgendadoFimIso('');
    setRepeticao('UNICO');
    setStatus('ATIVO');
  };

  const handleEdit = (c: ComunicadoDoc) => {
    setEditingId(c.id);
    setTitulo(c.titulo);
    setMensagem(c.mensagem);
    setTipo(c.tipo);
    setExibirPopup(c.exibirPopup);
    setPublicoAlvo(c.publicoAlvo);
    setPlanoAlvoSlug(c.planoAlvoSlug || '');
    setAgendadoInicioIso(c.agendadoInicioIso || '');
    setAgendadoFimIso(c.agendadoFimIso || '');
    setRepeticao(c.repeticao);
    setStatus(c.status);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !mensagem.trim()) return;
    setSaving(true);
    setFeedback(null);
    try {
      await saveComunicado({
        id: editingId || undefined,
        titulo,
        mensagem,
        tipo,
        exibirPopup,
        publicoAlvo,
        planoAlvoSlug: publicoAlvo === 'PLANO_ESPECIFICO' ? planoAlvoSlug : null,
        agendadoInicioIso,
        agendadoFimIso,
        repeticao,
        status,
      });
      await load();
      setFeedback({
        type: 'ok',
        text: `Comunicado "${titulo}" salvo (${status}). Clientes elegíveis verão no sininho e pop-up.`,
      });
      resetForm();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao salvar comunicado.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: ComunicadoDoc) => {
    try {
      await deleteComunicado(item.id);
      await load();
      if (editingId === item.id) resetForm();
      setFeedback({ type: 'ok', text: `Comunicado "${item.titulo}" removido.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao excluir comunicado.',
      });
    }
  };

  const renderTipoIcon = (t: TipoComunicado) => {
    switch (t) {
      case 'URGENTE':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'MANUTENCAO':
        return <Wrench className="w-4 h-4 text-amber-500" />;
      case 'NOVIDADE':
        return <Sparkles className="w-4 h-4 text-blue-500" />;
      default:
        return <Info className="w-4 h-4 text-emerald-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Central de Comunicados (Dono → Clientes)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Envie avisos de manutenção, lançamentos e comunicados prioritários diretamente para o
            sininho de notificações e pop-up no painel das empresas clientes.
          </p>
        </div>
        {editingId && (
          <button
            type="button"
            onClick={resetForm}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-white/15 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer self-start"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo Comunicado
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
        {/* Lista de Comunicados */}
        <div className="lg:col-span-7 space-y-3">
          {loading ? (
            <div className="dk-glass-card rounded-2xl p-8 text-center text-xs text-slate-400">
              Carregando comunicados...
            </div>
          ) : items.length === 0 ? (
            <div className="dk-glass-card rounded-2xl p-10 text-center space-y-2">
              <Megaphone className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Nenhum comunicado publicado
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Crie um comunicado ao lado para notificar todas as empresas ou um plano específico.
              </p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="dk-glass-card rounded-2xl p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
              >
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {renderTipoIcon(item.tipo)}
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {item.titulo}
                    </h4>
                    <span
                      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                        item.status === 'ATIVO'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : item.status === 'AGENDADO'
                            ? 'bg-amber-500/10 text-amber-500'
                            : 'bg-slate-500/10 text-slate-400'
                      }`}
                    >
                      {item.status === 'ATIVO' && (
                        <span className="dk-live-dot bg-emerald-400" />
                      )}
                      {item.status}
                    </span>
                    {item.exibirPopup && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-500 dark:text-blue-400">
                        <BellRing className="w-3 h-3" />
                        Pop-up Prioritário
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                    {item.mensagem}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    <span>
                      Público:{' '}
                      <strong className="text-slate-700 dark:text-slate-200">
                        {item.publicoAlvo === 'PLANO_ESPECIFICO'
                          ? `Plano ${item.planoAlvoSlug || '—'}`
                          : item.publicoAlvo}
                      </strong>
                    </span>
                    <span>Repetição: {item.repeticao}</span>
                    {(item.agendadoInicioIso || item.agendadoFimIso) && (
                      <span>
                        Janela: {item.agendadoInicioIso || 'Imediato'} →{' '}
                        {item.agendadoFimIso || 'Sem fim'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEdit(item)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/15 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 cursor-pointer"
                  >
                    Revisar / Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(item)}
                    className="p-1.5 rounded-lg border border-red-200 dark:border-red-500/30 text-red-500 hover:bg-red-500/10 cursor-pointer"
                    title="Excluir comunicado"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Formulário Criar / Editar Comunicado */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 dk-glass-card rounded-2xl p-6 space-y-4 text-xs"
        >
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-white/10">
            <Megaphone className="w-4 h-4 text-blue-500" />
            {editingId ? 'Revisar / Editar Comunicado' : 'Criar Novo Comunicado'}
          </h3>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Título do Aviso *
            </label>
            <input
              required
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Nova atualização de Modelos .pptx liberada!"
              className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Mensagem Completa *
            </label>
            <textarea
              required
              rows={4}
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Descreva as novidades, janela de manutenção ou orientações para os clientes..."
              className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white resize-y"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Tipo do Comunicado
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoComunicado)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
              >
                <option value="NOVIDADE">Novidade / Recurso</option>
                <option value="INFORMATIVO">Informativo</option>
                <option value="MANUTENCAO">Manutenção Programada</option>
                <option value="URGENTE">Urgente / Crítico</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusComunicado)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
              >
                <option value="ATIVO">Ativo (Publicar agora)</option>
                <option value="AGENDADO">Agendado</option>
                <option value="RASCUNHO">Rascunho (Não enviar)</option>
                <option value="ENCERRADO">Encerrado</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Público-Alvo
              </label>
              <select
                value={publicoAlvo}
                onChange={(e) => setPublicoAlvo(e.target.value as PublicoComunicado)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
              >
                <option value="TODAS">Todas as empresas</option>
                <option value="ATIVAS">Somente Ativas (Pagantes)</option>
                <option value="TRIAL">Somente em Trial (7 dias)</option>
                <option value="PLANO_ESPECIFICO">Plano específico</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Repetição
              </label>
              <select
                value={repeticao}
                onChange={(e) => setRepeticao(e.target.value as RepeticaoComunicado)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
              >
                <option value="UNICO">Envio Único</option>
                <option value="DIARIO">Diário</option>
                <option value="SEMANAL">Semanal</option>
                <option value="MENSAL">Mensal</option>
              </select>
            </div>
          </div>

          {publicoAlvo === 'PLANO_ESPECIFICO' && (
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Selecione o Plano Alvo
              </label>
              <select
                value={planoAlvoSlug}
                onChange={(e) => setPlanoAlvoSlug(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
              >
                <option value="">Selecione um plano...</option>
                {planos.map((p) => (
                  <option key={p.id} value={p.slug}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Agendar Início
              </label>
              <input
                type="date"
                value={agendadoInicioIso}
                onChange={(e) => setAgendadoInicioIso(e.target.value)}
                className="w-full px-3 py-2 rounded-xl font-mono bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Agendar Fim
              </label>
              <input
                type="date"
                value={agendadoFimIso}
                onChange={(e) => setAgendadoFimIso(e.target.value)}
                className="w-full px-3 py-2 rounded-xl font-mono bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="font-medium text-slate-700 dark:text-slate-200">
                Exibir Pop-up Prioritário ao Entrar
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Abre um aviso em destaque para quem ainda não leu
              </p>
            </div>
            <button
              type="button"
              onClick={() => setExibirPopup((v) => !v)}
              className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                exibirPopup ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  exibirPopup ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white font-semibold hover:from-[#1D4ED8] hover:to-[#2563EB] shadow-lg shadow-blue-600/25 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : editingId ? 'Salvar Revisão' : 'Publicar Comunicado'}
          </button>
        </form>
      </div>
    </div>
  );
};
