import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Edit3,
  FileCheck2,
  Package,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import type { GlobalCatalogSnapshot } from '../../services/catalogService.ts';
import {
  formatarMoedaBRL,
  type AdicionalCatalogo,
  type ModeloCertificadoCatalogo,
  type NrGlobalCatalogo,
  type NrVariacaoCatalogo,
  type PlanoCatalogo,
} from '../../data/globalCatalogSeed.ts';
import {
  adminDeleteAdicional,
  adminDeleteModeloCertificado,
  adminDeleteNrGlobal,
  adminDeletePlano,
  adminSaveAdicional,
  adminSaveModeloCertificado,
  adminSaveNrGlobal,
  adminSavePlano,
} from '../../services/superAdminService.ts';
import { CertificateTemplatePreview } from '../CertificateTemplatePreview.tsx';

interface SuperAdminCatalogManagerProps {
  catalog: GlobalCatalogSnapshot;
  onRefresh: () => Promise<void>;
}

type CatalogTab = 'planos' | 'nrs' | 'modelos';

export const SuperAdminCatalogManager: React.FC<SuperAdminCatalogManagerProps> = ({
  catalog,
  onRefresh,
}) => {
  const [tab, setTab] = useState<CatalogTab>('planos');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Estado edição Plano
  const [editingPlano, setEditingPlano] = useState<PlanoCatalogo | null>(null);
  // Estado edição Adicional
  const [editingAddon, setEditingAddon] = useState<AdicionalCatalogo | null>(null);
  // Estado edição NR Global
  const [selectedNrId, setSelectedNrId] = useState<string | null>(catalog.nrs[0]?.id ?? null);
  const [editingNr, setEditingNr] = useState<NrGlobalCatalogo | null>(null);
  const [activeVarIdx, setActiveVarIdx] = useState(0);
  const [novaLinha, setNovaLinha] = useState('');
  const [novaLinhaMin, setNovaLinhaMin] = useState('');
  // Estado edição Modelo Gratuito
  const [editingModelo, setEditingModelo] = useState<ModeloCertificadoCatalogo | null>(null);

  const selectedNr = useMemo(() => {
    if (editingNr) return editingNr;
    return catalog.nrs.find((n) => n.id === selectedNrId) ?? catalog.nrs[0] ?? null;
  }, [catalog.nrs, selectedNrId, editingNr]);

  const startEditNr = (nr: NrGlobalCatalogo) => {
    setSelectedNrId(nr.id);
    setEditingNr(structuredClone(nr));
    setActiveVarIdx(0);
    setFeedback(null);
  };

  const handleSavePlano = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlano) return;
    setBusy(true);
    setFeedback(null);
    try {
      await adminSavePlano(editingPlano);
      await onRefresh();
      setEditingPlano(null);
      setFeedback({ type: 'ok', text: `Plano "${editingPlano.nome}" salvo no catálogo global.` });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao salvar plano.' });
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePlano = async (id: string) => {
    setBusy(true);
    try {
      await adminDeletePlano(id);
      await onRefresh();
      setFeedback({ type: 'ok', text: 'Plano removido do catálogo.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao remover plano.' });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAddon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAddon) return;
    setBusy(true);
    setFeedback(null);
    try {
      await adminSaveAdicional(editingAddon);
      await onRefresh();
      setEditingAddon(null);
      setFeedback({ type: 'ok', text: `Adicional "${editingAddon.nome}" salvo com sucesso.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao salvar adicional.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAddon = async (id: string) => {
    setBusy(true);
    try {
      await adminDeleteAdicional(id);
      await onRefresh();
      setFeedback({ type: 'ok', text: 'Adicional removido.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao remover adicional.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveNr = async () => {
    if (!editingNr) return;
    setBusy(true);
    setFeedback(null);
    try {
      const saved = await adminSaveNrGlobal(editingNr);
      await onRefresh();
      setSelectedNrId(saved.id);
      setEditingNr(null);
      setFeedback({
        type: 'ok',
        text: `${saved.codigo} salva no Catálogo Global (${saved.variacoes.length} variações).`,
      });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao salvar NR.' });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteNr = async (id: string) => {
    setBusy(true);
    try {
      await adminDeleteNrGlobal(id);
      setEditingNr(null);
      setSelectedNrId(null);
      await onRefresh();
      setFeedback({ type: 'ok', text: 'NR removida do catálogo global.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao remover NR.' });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveModelo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModelo) return;
    setBusy(true);
    setFeedback(null);
    try {
      await adminSaveModeloCertificado(editingModelo);
      await onRefresh();
      setEditingModelo(null);
      setFeedback({ type: 'ok', text: `Modelo "${editingModelo.nome}" salvo com sucesso.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao salvar modelo.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteModelo = async (id: string) => {
    setBusy(true);
    try {
      await adminDeleteModeloCertificado(id);
      await onRefresh();
      setFeedback({ type: 'ok', text: 'Modelo removido do catálogo.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao remover modelo.',
      });
    } finally {
      setBusy(false);
    }
  };

  const updateCurrentVar = (updater: (v: NrVariacaoCatalogo) => NrVariacaoCatalogo) => {
    if (!editingNr) return;
    setEditingNr({
      ...editingNr,
      variacoes: editingNr.variacoes.map((v, idx) => (idx === activeVarIdx ? updater(v) : v)),
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Gestão Global — Planos, NRs e Modelos Gratuitos
          </h2>
          <p className="text-xs text-slate-500">
            Alterações feitas aqui refletem automaticamente no site dkfacilita.com, no checkout e
            nas novas contas.
          </p>
        </div>

        <div className="inline-flex p-1 bg-slate-200/70 rounded-lg">
          {(
            [
              { id: 'planos', label: `Planos & Adicionais (${catalog.planos.length}/${catalog.adicionais.length})`, icon: Package },
              { id: 'nrs', label: `Catálogo de NRs (${catalog.nrs.length})`, icon: BookOpen },
              { id: 'modelos', label: `Modelos Gratuitos (${catalog.modelos.length})`, icon: FileCheck2 },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                  tab === item.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
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

      {/* ABA 1: PLANOS & ADICIONAIS */}
      {tab === 'planos' && (
        <div className="space-y-6">
          {/* Planos */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Planos Comerciais</h3>
              <button
                type="button"
                onClick={() =>
                  setEditingPlano({
                    id: '',
                    slug: '',
                    nome: '',
                    subtitulo: '',
                    descricao: '',
                    precoMensalCentavos: 19900,
                    descontoSemestral: 10,
                    descontoAnual: 20,
                    limiteColaboradores: 150,
                    limiteUsuarios: 3,
                    limiteObras: 5,
                    incluiCartaAnuencia: false,
                    incluiDossieLink: true,
                    incluiAlertasWpp: false,
                    incluiDominioProprio: false,
                    destaque: false,
                    ativo: true,
                    ordem: catalog.planos.length + 1,
                  })
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Novo Plano
              </button>
            </div>

            {editingPlano && (
              <form
                onSubmit={handleSavePlano}
                className="p-5 bg-slate-50 border-b border-slate-200 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <input
                    required
                    value={editingPlano.nome}
                    onChange={(e) => setEditingPlano({ ...editingPlano, nome: e.target.value })}
                    placeholder="Nome do Plano"
                    className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                  />
                  <input
                    required
                    value={editingPlano.slug}
                    onChange={(e) => setEditingPlano({ ...editingPlano, slug: e.target.value })}
                    placeholder="Slug (ex.: profissional)"
                    className="px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                  />
                  <input
                    required
                    value={editingPlano.subtitulo}
                    onChange={(e) =>
                      setEditingPlano({ ...editingPlano, subtitulo: e.target.value })
                    }
                    placeholder="Subtítulo curto"
                    className="lg:col-span-2 px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                  />
                  <input
                    required
                    value={editingPlano.descricao}
                    onChange={(e) =>
                      setEditingPlano({ ...editingPlano, descricao: e.target.value })
                    }
                    placeholder="Descrição comercial"
                    className="lg:col-span-4 px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                  />
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1">
                      Preço Mensal (R$ em centavos)
                    </label>
                    <input
                      type="number"
                      required
                      value={editingPlano.precoMensalCentavos}
                      onChange={(e) =>
                        setEditingPlano({
                          ...editingPlano,
                          precoMensalCentavos: Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1">
                      Desc. Semestral / Anual (%)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={editingPlano.descontoSemestral}
                        onChange={(e) =>
                          setEditingPlano({
                            ...editingPlano,
                            descontoSemestral: Number(e.target.value),
                          })
                        }
                        className="w-1/2 px-2 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                      />
                      <input
                        type="number"
                        value={editingPlano.descontoAnual}
                        onChange={(e) =>
                          setEditingPlano({
                            ...editingPlano,
                            descontoAnual: Number(e.target.value),
                          })
                        }
                        className="w-1/2 px-2 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1">
                      Limites (Colab / Usuários / Obras)
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        value={editingPlano.limiteColaboradores}
                        onChange={(e) =>
                          setEditingPlano({
                            ...editingPlano,
                            limiteColaboradores: Number(e.target.value),
                          })
                        }
                        className="w-1/3 px-2 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                      />
                      <input
                        type="number"
                        value={editingPlano.limiteUsuarios}
                        onChange={(e) =>
                          setEditingPlano({
                            ...editingPlano,
                            limiteUsuarios: Number(e.target.value),
                          })
                        }
                        className="w-1/3 px-2 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                      />
                      <input
                        type="number"
                        value={editingPlano.limiteObras}
                        onChange={(e) =>
                          setEditingPlano({
                            ...editingPlano,
                            limiteObras: Number(e.target.value),
                          })
                        }
                        className="w-1/3 px-2 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Ordem</label>
                    <input
                      type="number"
                      value={editingPlano.ordem}
                      onChange={(e) =>
                        setEditingPlano({ ...editingPlano, ordem: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap gap-4 text-xs text-slate-700">
                    {(
                      [
                        { key: 'incluiCartaAnuencia', label: 'Cartas Anuência' },
                        { key: 'incluiAlertasWpp', label: 'Alertas WPP' },
                        { key: 'incluiDominioProprio', label: 'Domínio Próprio' },
                        { key: 'destaque', label: 'Destaque' },
                        { key: 'ativo', label: 'Ativo' },
                      ] as const
                    ).map((chk) => (
                      <label key={chk.key} className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(editingPlano[chk.key])}
                          onChange={(e) =>
                            setEditingPlano({ ...editingPlano, [chk.key]: e.target.checked })
                          }
                        />
                        {chk.label}
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingPlano(null)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-4 py-1.5 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium cursor-pointer"
                    >
                      Salvar Plano
                    </button>
                  </div>
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 px-5">Plano</th>
                    <th className="py-2.5 px-4">Mensal</th>
                    <th className="py-2.5 px-4">Limites (Colab / Usr / Obras)</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {catalog.planos.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-5">
                        <p className="font-semibold text-slate-900">{p.nome}</p>
                        <p className="text-[11px] text-slate-500">{p.subtitulo}</p>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                        {formatarMoedaBRL(p.precoMensalCentavos)}
                        <span className="block text-[10px] text-slate-400 font-normal">
                          -{p.descontoSemestral}% sem · -{p.descontoAnual}% anual
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {p.limiteColaboradores} / {p.limiteUsuarios} / {p.limiteObras}
                      </td>
                      <td className="py-3 px-4">
                        <span className={p.ativo ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                          {p.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => setEditingPlano({ ...p })}
                          className="p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeletePlano(p.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Adicionais */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Serviços Adicionais (Add-ons)</h3>
              <button
                type="button"
                onClick={() =>
                  setEditingAddon({
                    id: '',
                    slug: '',
                    nome: '',
                    descricao: '',
                    precoMensalCentavos: 7900,
                    tipoCobranca: 'RECORRENTE',
                    recursoChave: 'recurso_extra',
                    incrementoQtd: 0,
                    ativo: true,
                    ordem: catalog.adicionais.length + 1,
                  })
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Novo Adicional
              </button>
            </div>

            {editingAddon && (
              <form
                onSubmit={handleSaveAddon}
                className="p-5 bg-slate-50 border-b border-slate-200 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <input
                    required
                    value={editingAddon.nome}
                    onChange={(e) => setEditingAddon({ ...editingAddon, nome: e.target.value })}
                    placeholder="Nome do Adicional"
                    className="lg:col-span-2 px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                  />
                  <input
                    required
                    value={editingAddon.slug}
                    onChange={(e) => setEditingAddon({ ...editingAddon, slug: e.target.value })}
                    placeholder="Slug"
                    className="px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                  />
                  <select
                    value={editingAddon.tipoCobranca}
                    onChange={(e) =>
                      setEditingAddon({
                        ...editingAddon,
                        tipoCobranca: e.target.value as 'RECORRENTE' | 'UNICO',
                      })
                    }
                    className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="RECORRENTE">Mensal Recorrente</option>
                    <option value="UNICO">Pagamento Único</option>
                  </select>
                  <input
                    required
                    value={editingAddon.descricao}
                    onChange={(e) =>
                      setEditingAddon({ ...editingAddon, descricao: e.target.value })
                    }
                    placeholder="Descrição comercial"
                    className="lg:col-span-2 px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                  />
                  <input
                    type="number"
                    required
                    value={editingAddon.precoMensalCentavos}
                    onChange={(e) =>
                      setEditingAddon({
                        ...editingAddon,
                        precoMensalCentavos: Number(e.target.value),
                      })
                    }
                    placeholder="Preço em centavos"
                    className="px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                  />
                  <input
                    type="number"
                    value={editingAddon.incrementoQtd}
                    onChange={(e) =>
                      setEditingAddon({
                        ...editingAddon,
                        incrementoQtd: Number(e.target.value),
                      })
                    }
                    placeholder="Incremento (ex.: 100)"
                    className="px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingAddon.ativo}
                      onChange={(e) =>
                        setEditingAddon({ ...editingAddon, ativo: e.target.checked })
                      }
                    />
                    Ativo na loja
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingAddon(null)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-4 py-1.5 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium cursor-pointer"
                    >
                      Salvar Adicional
                    </button>
                  </div>
                </div>
              </form>
            )}

            <div className="divide-y divide-slate-100">
              {catalog.adicionais.map((a) => (
                <div
                  key={a.id}
                  className="px-5 py-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/70"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{a.nome}</p>
                    <p className="text-[11px] text-slate-500 truncate">{a.descricao}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="font-mono font-semibold text-slate-900">
                      {formatarMoedaBRL(a.precoMensalCentavos)}
                      <span className="text-slate-400 font-normal">
                        {a.tipoCobranca === 'RECORRENTE' ? '/mês' : ' único'}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingAddon({ ...a })}
                      className="p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteAddon(a.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ABA 2: CATÁLOGO GLOBAL DE NRs (NORMA PAI + VARIAÇÕES + LINHAS) */}
      {tab === 'nrs' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-3 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900">Normas Pai Globais</span>
              <button
                type="button"
                onClick={() =>
                  startEditNr({
                    id: '',
                    codigo: 'NR-00',
                    titulo: 'Nova Norma Regulamentadora',
                    descricao: 'Descrição padrão do treinamento normativo.',
                    baseLegal: 'Portaria MTE',
                    validadePadraoMeses: 24,
                    ativa: true,
                    ordem: catalog.nrs.length + 1,
                    variacoes: [
                      {
                        slug: 'inicial-8h',
                        nome: 'Formação Inicial 8h',
                        modalidade: 'INICIAL',
                        cargaHorariaHoras: 8,
                        validadeMeses: 24,
                        notaMinimaAprovacao: 70,
                        ordem: 1,
                        linhas: [
                          {
                            ordem: 1,
                            descricao: 'Normas, regulamentos e responsabilidades legais.',
                            cargaHorariaMin: 60,
                          },
                        ],
                      },
                    ],
                  })
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900 text-white text-[11px] font-medium cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                Nova NR
              </button>
            </div>
            <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
              {catalog.nrs.map((nr) => (
                <button
                  key={nr.id}
                  type="button"
                  onClick={() => startEditNr(nr)}
                  className={`w-full text-left px-4 py-3 cursor-pointer ${
                    selectedNr?.id === nr.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold">{nr.codigo}</span>
                    <span className="text-[11px] opacity-70">{nr.variacoes.length} var.</span>
                  </div>
                  <p className="text-xs mt-0.5 truncate opacity-85">{nr.titulo}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            {!editingNr && selectedNr ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs text-[#1D4ED8] font-bold">
                      {selectedNr.codigo} · {selectedNr.baseLegal}
                    </p>
                    <h3 className="text-base font-bold text-slate-900 mt-0.5">
                      {selectedNr.titulo}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEditNr(selectedNr)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Editar Norma e Linhas
                  </button>
                </div>
                <p className="text-xs text-slate-600">{selectedNr.descricao}</p>
                <div className="space-y-3">
                  {selectedNr.variacoes.map((v) => (
                    <div key={v.slug} className="border border-slate-200 rounded-lg p-3.5">
                      <p className="text-xs font-semibold text-slate-900">
                        {v.nome} · {v.cargaHorariaHoras}h · Validade {v.validadeMeses}m (
                        {v.linhas.length} linhas)
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : editingNr ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Editor Global: {editingNr.codigo}
                  </h3>
                  <div className="flex items-center gap-2">
                    {editingNr.id && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleDeleteNr(editingNr.id)}
                        className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditingNr(null)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleSaveNr()}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Salvar NR Global
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    value={editingNr.codigo}
                    onChange={(e) => setEditingNr({ ...editingNr, codigo: e.target.value })}
                    placeholder="Código (NR-35)"
                    className="px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                  <input
                    value={editingNr.titulo}
                    onChange={(e) => setEditingNr({ ...editingNr, titulo: e.target.value })}
                    placeholder="Título"
                    className="sm:col-span-2 px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                  <input
                    value={editingNr.baseLegal}
                    onChange={(e) => setEditingNr({ ...editingNr, baseLegal: e.target.value })}
                    placeholder="Base Legal"
                    className="sm:col-span-2 px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                  <input
                    type="number"
                    value={editingNr.validadePadraoMeses}
                    onChange={(e) =>
                      setEditingNr({
                        ...editingNr,
                        validadePadraoMeses: Number(e.target.value),
                      })
                    }
                    placeholder="Validade (meses)"
                    className="px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                </div>

                {/* Variações */}
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
                  {editingNr.variacoes.map((v, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveVarIdx(idx)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                        activeVarIdx === idx ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      {v.nome}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const nextIdx = editingNr.variacoes.length;
                      setEditingNr({
                        ...editingNr,
                        variacoes: [
                          ...editingNr.variacoes,
                          {
                            slug: `variacao-${nextIdx + 1}`,
                            nome: 'Nova Variação 4h',
                            modalidade: 'RECICLAGEM',
                            cargaHorariaHoras: 4,
                            validadeMeses: 24,
                            notaMinimaAprovacao: 70,
                            ordem: nextIdx + 1,
                            linhas: [],
                          },
                        ],
                      });
                      setActiveVarIdx(nextIdx);
                    }}
                    className="px-2.5 py-1.5 text-xs font-medium text-[#1D4ED8] hover:underline cursor-pointer"
                  >
                    + Variação
                  </button>
                </div>

                {editingNr.variacoes[activeVarIdx] && (
                  <div className="space-y-3 border border-slate-200 rounded-xl p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <input
                        value={editingNr.variacoes[activeVarIdx].nome}
                        onChange={(e) =>
                          updateCurrentVar((v) => ({ ...v, nome: e.target.value }))
                        }
                        className="col-span-2 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
                      />
                      <input
                        type="number"
                        value={editingNr.variacoes[activeVarIdx].cargaHorariaHoras}
                        onChange={(e) =>
                          updateCurrentVar((v) => ({
                            ...v,
                            cargaHorariaHoras: Number(e.target.value),
                          }))
                        }
                        className="px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg"
                        title="Horas"
                      />
                      <input
                        type="number"
                        value={editingNr.variacoes[activeVarIdx].validadeMeses}
                        onChange={(e) =>
                          updateCurrentVar((v) => ({
                            ...v,
                            validadeMeses: Number(e.target.value),
                          }))
                        }
                        className="px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg"
                        title="Validade (meses)"
                      />
                    </div>

                    {/* Linhas da Variação */}
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {editingNr.variacoes[activeVarIdx].linhas.map((l, lIdx) => (
                        <div key={lIdx} className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] text-slate-400 w-5">
                            {String(lIdx + 1).padStart(2, '0')}
                          </span>
                          <input
                            value={l.descricao}
                            onChange={(e) =>
                              updateCurrentVar((v) => ({
                                ...v,
                                linhas: v.linhas.map((item, i) =>
                                  i === lIdx ? { ...item, descricao: e.target.value } : item
                                ),
                              }))
                            }
                            className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                          />
                          <button
                            type="button"
                            disabled={lIdx === 0}
                            onClick={() =>
                              updateCurrentVar((v) => {
                                const arr = [...v.linhas];
                                [arr[lIdx - 1], arr[lIdx]] = [arr[lIdx], arr[lIdx - 1]];
                                return { ...v, linhas: arr };
                              })
                            }
                            className="p-1 text-slate-400 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={lIdx === editingNr.variacoes[activeVarIdx].linhas.length - 1}
                            onClick={() =>
                              updateCurrentVar((v) => {
                                const arr = [...v.linhas];
                                [arr[lIdx + 1], arr[lIdx]] = [arr[lIdx], arr[lIdx + 1]];
                                return { ...v, linhas: arr };
                              })
                            }
                            className="p-1 text-slate-400 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateCurrentVar((v) => ({
                                ...v,
                                linhas: v.linhas.filter((_, i) => i !== lIdx),
                              }))
                            }
                            className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <input
                        value={novaLinha}
                        onChange={(e) => setNovaLinha(e.target.value)}
                        placeholder="Nova linha do conteúdo programático..."
                        className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
                      />
                      <input
                        type="number"
                        value={novaLinhaMin}
                        onChange={(e) => setNovaLinhaMin(e.target.value)}
                        placeholder="Min"
                        className="w-16 px-2 py-1.5 text-xs font-mono border border-slate-200 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!novaLinha.trim()) return;
                          updateCurrentVar((v) => ({
                            ...v,
                            linhas: [
                              ...v.linhas,
                              {
                                ordem: v.linhas.length + 1,
                                descricao: novaLinha.trim(),
                                cargaHorariaMin: novaLinhaMin ? Number(novaLinhaMin) : null,
                              },
                            ],
                          }));
                          setNovaLinha('');
                          setNovaLinhaMin('');
                        }}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium hover:bg-slate-50 cursor-pointer"
                      >
                        + Linha
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ABA 3: MODELOS GRATUITOS DE CERTIFICADO */}
      {tab === 'modelos' && (
        <div className="space-y-5">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                setEditingModelo({
                  id: '',
                  slug: '',
                  nome: '',
                  descricao: '',
                  categoria: 'GRATUITO',
                  previewCssToken: 'classico-institucional',
                  layoutConfig: {
                    moldura: 'dupla-classica',
                    colunasVersoAuto: true,
                    posicaoQr: 'rodape-direito',
                    corBordaPadrao: '#0F172A',
                    corFundoCabecalho: '#F8FAFC',
                    estiloTipografia: 'editorial',
                  },
                  ativo: true,
                  ordem: catalog.modelos.length + 1,
                })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo Modelo Gratuito
            </button>
          </div>

          {editingModelo && (
            <form
              onSubmit={handleSaveModelo}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  required
                  value={editingModelo.nome}
                  onChange={(e) => setEditingModelo({ ...editingModelo, nome: e.target.value })}
                  placeholder="Nome do Modelo"
                  className="px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
                <input
                  required
                  value={editingModelo.slug}
                  onChange={(e) => setEditingModelo({ ...editingModelo, slug: e.target.value })}
                  placeholder="Slug"
                  className="px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                />
                <select
                  value={editingModelo.layoutConfig.moldura}
                  onChange={(e) =>
                    setEditingModelo({
                      ...editingModelo,
                      layoutConfig: {
                        ...editingModelo.layoutConfig,
                        moldura: e.target.value as
                          | 'corporativa-barra'
                          | 'dupla-classica'
                          | 'minimal-linha'
                          | 'tecnica-grade',
                      },
                    })
                  }
                  className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                >
                  <option value="dupla-classica">Moldura Dupla Clássica</option>
                  <option value="corporativa-barra">Barra Corporativa Lateral</option>
                  <option value="minimal-linha">Minimalista Limpo</option>
                  <option value="tecnica-grade">Grade Técnica Industrial</option>
                </select>
                <input
                  required
                  value={editingModelo.descricao}
                  onChange={(e) =>
                    setEditingModelo({ ...editingModelo, descricao: e.target.value })
                  }
                  placeholder="Descrição visual do modelo"
                  className="sm:col-span-3 px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingModelo.ativo}
                    onChange={(e) =>
                      setEditingModelo({ ...editingModelo, ativo: e.target.checked })
                    }
                  />
                  Disponível para todas as empresas
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingModelo(null)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-1.5 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium cursor-pointer"
                  >
                    Salvar Modelo
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {catalog.modelos.map((modelo) => (
              <div
                key={modelo.id}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{modelo.nome}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{modelo.descricao}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingModelo({ ...modelo })}
                      className="p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteModelo(modelo.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <CertificateTemplatePreview modelo={modelo} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
