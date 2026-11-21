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
  PlatformNotice,
  NoticeTargets,
} from '../../services/platformNotificationService.ts';
import type { PlanoCatalogo } from '../../data/globalCatalogSeed.ts';
import {
  deletePlatformNotice,
  listNoticeTargets,
  listPlatformNotices,
  savePlatformNotice,
} from '../../services/platformNotificationService.ts';

const toLocalInput = (iso: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const defaultSchedule = () => {
  const now = new Date(Date.now() + 60_000);
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

interface SuperAdminComunicadosProps {
  planos: PlanoCatalogo[];
}

export const SuperAdminComunicados: React.FC<SuperAdminComunicadosProps> = ({ planos }) => {
  const [items, setItems] = useState<PlatformNotice[]>([]);
  const [targets, setTargets] = useState<NoticeTargets>({ empresas: [], usuarios: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [tipo, setTipo] = useState<PlatformNotice['tipo']>('NOVIDADE');
  const [exibirPopup, setExibirPopup] = useState(true);
  const [exigirConfirmacao, setExigirConfirmacao] = useState(false);
  const [link, setLink] = useState('');
  const [publicoAlvo, setPublicoAlvo] = useState<PlatformNotice['publicoAlvo']>('TODAS');
  const [planoAlvoSlug, setPlanoAlvoSlug] = useState('');
  const [perfilAlvo, setPerfilAlvo] = useState('ADMIN_EMPRESA');
  const [empresaIds, setEmpresaIds] = useState<string[]>([]);
  const [usuarioIds, setUsuarioIds] = useState<string[]>([]);
  const [agendadoInicioIso, setAgendadoInicioIso] = useState(defaultSchedule());
  const [agendadoFimIso, setAgendadoFimIso] = useState('');
  const [fusoHorario, setFusoHorario] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo');
  const [repeticao, setRepeticao] = useState<PlatformNotice['repeticao']>('UNICO');
  const [status, setStatus] = useState<PlatformNotice['status']>('ATIVO');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, choices] = await Promise.all([listPlatformNotices(), listNoticeTargets()]);
      setItems(list);
      setTargets(choices);
    } catch (error) {
      setFeedback({ type: 'err', text: error instanceof Error ? error.message : 'Não foi possível carregar a central de avisos.' });
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
    setExigirConfirmacao(false);
    setLink('');
    setPerfilAlvo('ADMIN_EMPRESA');
    setEmpresaIds([]);
    setUsuarioIds([]);
    setAgendadoInicioIso(defaultSchedule());
    setAgendadoFimIso('');
    setFusoHorario(Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo');
    setRepeticao('UNICO');
    setStatus('ATIVO');
  };

  const handleEdit = (c: PlatformNotice) => {
    setEditingId(c.id);
    setTitulo(c.titulo);
    setMensagem(c.mensagem);
    setTipo(c.tipo);
    setExibirPopup(c.exibirPopup);
    setExigirConfirmacao(c.exigirConfirmacao);
    setLink(c.link || '');
    setPublicoAlvo(c.publicoAlvo);
    setPlanoAlvoSlug(c.planoAlvoSlug || '');
    setPerfilAlvo(c.perfilAlvo || 'ADMIN_EMPRESA');
    setEmpresaIds(c.empresaIds || []);
    setUsuarioIds(c.usuarioIds || []);
    setAgendadoInicioIso(toLocalInput(c.agendadoInicioIso));
    setAgendadoFimIso(toLocalInput(c.agendadoFimIso));
    setFusoHorario(c.fusoHorario || 'America/Sao_Paulo');
    setRepeticao(c.repeticao);
    setStatus(c.status);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !mensagem.trim()) return;
    setSaving(true);
    setFeedback(null);
    try {
      await savePlatformNotice({
        id: editingId || undefined,
        titulo,
        mensagem,
        tipo,
        exibirPopup,
        exigirConfirmacao,
        link: link.trim() || null,
        publicoAlvo,
        planoAlvoSlug: publicoAlvo === 'PLANO_ESPECIFICO' ? planoAlvoSlug : null,
        perfilAlvo: publicoAlvo === 'PERFIL' ? perfilAlvo : null,
        empresaIds: publicoAlvo === 'EMPRESAS' ? empresaIds : [],
        usuarioIds: publicoAlvo === 'USUARIOS' ? usuarioIds : [],
        agendadoInicioIso: new Date(agendadoInicioIso).toISOString(),
        agendadoFimIso: agendadoFimIso ? new Date(agendadoFimIso).toISOString() : '',
        fusoHorario,
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

  const handleDelete = async (item: PlatformNotice) => {
    try {
      await deletePlatformNotice(item.id);
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

  const handleStatusChange = async (item: PlatformNotice, nextStatus: PlatformNotice['status']) => {
    try {
      await savePlatformNotice({
        id: item.id, titulo: item.titulo, mensagem: item.mensagem, tipo: item.tipo,
        exibirPopup: item.exibirPopup, exigirConfirmacao: item.exigirConfirmacao, link: item.link,
        publicoAlvo: item.publicoAlvo, planoAlvoSlug: item.planoAlvoSlug, perfilAlvo: item.perfilAlvo,
        empresaIds: item.empresaIds, usuarioIds: item.usuarioIds, agendadoInicioIso: item.agendadoInicioIso,
        agendadoFimIso: item.agendadoFimIso, fusoHorario: item.fusoHorario, repeticao: item.repeticao,
        status: nextStatus,
      });
      await load();
      setFeedback({ type: 'ok', text: `Comunicado "${item.titulo}" atualizado para ${nextStatus}.` });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao encerrar comunicado.' });
    }
  };

  const renderTipoIcon = (t: PlatformNotice['tipo']) => {
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
                            : item.status === 'PAUSADO'
                              ? 'bg-orange-500/10 text-orange-500'
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
                    {item.exigirConfirmacao && <span className="rounded-md bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-300">Confirmação obrigatória</span>}
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                    {item.mensagem}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    <span>
                      Público:{' '}
                      <strong className="text-slate-700 dark:text-slate-200">
                        {item.publicoAlvo === 'PLANO_ESPECIFICO' ? `Plano ${item.planoAlvoSlug || '—'}` :
                          item.publicoAlvo === 'PERFIL' ? `Perfil ${item.perfilAlvo || '—'}` :
                            item.publicoAlvo === 'EMPRESAS' ? `${item.empresaIds.length} empresa(s)` :
                              item.publicoAlvo === 'USUARIOS' ? `${item.usuarioIds.length} usuário(s)` : item.publicoAlvo}
                      </strong>
                    </span>
                    <span>Repetição: {item.repeticao}</span>
                    {(item.agendadoInicioIso || item.agendadoFimIso) && (
                      <span>
                        Início: {new Date(item.agendadoInicioIso).toLocaleString('pt-BR')} · Fim: {item.agendadoFimIso ? new Date(item.agendadoFimIso).toLocaleString('pt-BR') : 'Sem fim'} ({item.fusoHorario})
                      </span>
                    )}
                    <span>Entregues: {item.entregas} · lidos: {item.lidas}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEdit(item)}
                    disabled={item.entregas > 0}
                    title={item.entregas > 0 ? 'O conteúdo fica congelado depois da primeira entrega.' : 'Revisar comunicado'}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/15 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 cursor-pointer"
                  >
                    Revisar
                  </button>
                  {item.entregas > 0 && ['ATIVO', 'AGENDADO'].includes(item.status) && <button type="button" onClick={() => void handleStatusChange(item, 'PAUSADO')} className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-300">Pausar</button>}
                  {item.entregas > 0 && item.status === 'PAUSADO' && <button type="button" onClick={() => void handleStatusChange(item, 'ATIVO')} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300">Retomar</button>}
                  {item.entregas > 0 && item.status !== 'ENCERRADO' && <button type="button" onClick={() => void handleStatusChange(item, 'ENCERRADO')} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300">Encerrar</button>}
                  <button
                    type="button"
                    onClick={() => void handleDelete(item)}
                    disabled={item.entregas > 0}
                    title={item.entregas > 0 ? 'Avisos entregues permanecem no histórico.' : 'Excluir comunicado'}
                    className="p-1.5 rounded-lg border border-red-200 dark:border-red-500/30 text-red-500 hover:bg-red-500/10 cursor-pointer"
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
                onChange={(e) => setTipo(e.target.value as PlatformNotice['tipo'])}
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
                onChange={(e) => setStatus(e.target.value as PlatformNotice['status'])}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
              >
                <option value="ATIVO">Ativo (Publicar agora)</option>
                <option value="AGENDADO">Agendado</option>
                <option value="RASCUNHO">Rascunho (Não enviar)</option>
                <option value="PAUSADO">Pausado</option>
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
                onChange={(e) => setPublicoAlvo(e.target.value as PlatformNotice['publicoAlvo'])}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
              >
                <option value="TODAS">Todas as empresas</option>
                <option value="ATIVAS">Somente Ativas (Pagantes)</option>
                <option value="TRIAL">Somente em Trial (7 dias)</option>
                <option value="PLANO_ESPECIFICO">Plano específico</option>
                <option value="PERFIL">Por perfil de usuário</option>
                <option value="EMPRESAS">Empresas selecionadas</option>
                <option value="USUARIOS">Usuários selecionados</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Repetição
              </label>
              <select
                value={repeticao}
                onChange={(e) => setRepeticao(e.target.value as PlatformNotice['repeticao'])}
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

          {publicoAlvo === 'PERFIL' && <div>
            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Perfil que receberá o aviso</label>
            <select value={perfilAlvo} onChange={(e) => setPerfilAlvo(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-white/15 dark:bg-[#060913] dark:text-white">
              <option value="ADMIN_EMPRESA">Administrador da empresa</option><option value="RT">Responsável técnico</option><option value="INSTRUTOR_TST">Instrutor / TST</option>
            </select>
          </div>}

          {publicoAlvo === 'EMPRESAS' && <div>
            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Empresas (Ctrl/Cmd para selecionar várias)</label>
            <select multiple size={6} value={empresaIds} onChange={(e) => setEmpresaIds(Array.from(e.currentTarget.selectedOptions, (option) => option.value))} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-white/15 dark:bg-[#060913] dark:text-white">
              {targets.empresas.map((item) => <option key={item.id} value={item.id}>{item.nome} · {item.status}</option>)}
            </select>
          </div>}

          {publicoAlvo === 'USUARIOS' && <div>
            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Usuários (Ctrl/Cmd para selecionar vários)</label>
            <select multiple size={7} value={usuarioIds} onChange={(e) => setUsuarioIds(Array.from(e.currentTarget.selectedOptions, (option) => option.value))} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-white/15 dark:bg-[#060913] dark:text-white">
              {targets.usuarios.map((item) => <option key={item.id} value={item.id}>{item.nome} · {item.empresa} · {item.email}</option>)}
            </select>
          </div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Agendar Início
              </label>
              <input
                type="datetime-local"
                required
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
                type="datetime-local"
                value={agendadoFimIso}
                onChange={(e) => setAgendadoFimIso(e.target.value)}
                className="w-full px-3 py-2 rounded-xl font-mono bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Link opcional (HTTPS ou caminho interno)</label>
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://... ou /ajuda" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 dark:border-white/15 dark:bg-[#060913] dark:text-white" />
            <p className="mt-1 text-[11px] text-slate-500">Agenda no fuso {fusoHorario}; o servidor guarda o horário convertido.</p>
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

          <div className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-white/10">
            <div><p className="font-medium text-slate-700 dark:text-slate-200">Exigir confirmação do usuário</p><p className="text-[11px] text-slate-500">Registra quem confirmou o recebimento.</p></div>
            <button type="button" aria-pressed={exigirConfirmacao} onClick={() => setExigirConfirmacao((value) => !value)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${exigirConfirmacao ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-700'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${exigirConfirmacao ? 'translate-x-5' : 'translate-x-0.5'}`} /></button>
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
