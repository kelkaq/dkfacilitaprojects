import React, { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Eye, Image as ImageIcon, LoaderCircle, Move, QrCode, Save, Signature, Square, Type, X } from 'lucide-react';

export type TemplatePage = 'front' | 'back';
export type TemplateKind = 'text' | 'image' | 'signature' | 'qrcode' | 'line' | 'shape';
export type TemplateElement = {
  id: string; page: TemplatePage; kind: TemplateKind; x: number; y: number; width: number; height: number; content: string; asset: string | null;
  fontSize: number; fontFamily: string; fontWeight: '400' | '600' | '700'; color: string; textAlign: 'left' | 'center' | 'right' | 'justify';
  lineHeight: number; background: string; borderColor: string; borderWidth: number; opacity: number; rotation: number; zIndex: number; clipPath: string | null;
};
export type TemplateLayout = { width: 960; height: 720; elements: TemplateElement[] };
export type TemplateModel = { templateKey: string; fileName: string; version: number; pageCount: number; layout: TemplateLayout; frontUrl: string; backUrl: string };

type Interaction = { mode: 'move' | 'resize'; elementId: string; clientX: number; clientY: number; origin: TemplateElement; startLayout: TemplateLayout };
type Props = { model: TemplateModel; onSaved: () => void; onCancel: () => void };

const SCALE = 0.68;
const VARIABLES = [
  ['Nome do colaborador', '{{nome_colaborador}}'], ['CPF', '{{cpf}}'], ['Função', '{{funcao}}'], ['Treinamento', '{{treinamento}}'],
  ['Norma regulamentadora', '{{nr_numero}}'], ['Carga horária', '{{carga_horaria}}'], ['Data de realização', '{{data_realizacao}}'],
  ['Data de validade', '{{data_validade}}'], ['Data de emissão', '{{data_emissao}}'], ['Empresa', '{{empresa}}'], ['Documento da empresa', '{{documento_empresa}}'],
  ['Cidade', '{{cidade}}'], ['Conteúdo programático', '{{conteudo_programatico}}'], ['Código do certificado', '{{codigo_certificado}}'],
  ['Instrutor', '{{instrutor}}'], ['Registro do instrutor', '{{registro_instrutor}}'], ['Responsável técnico', '{{responsavel_tecnico}}'],
  ['Registro do responsável', '{{registro_responsavel}}'], ['Nome assinante 1', '{{assinante_1_nome}}'], ['Papel assinante 1', '{{assinante_1_papel}}'],
  ['Nome assinante 2', '{{assinante_2_nome}}'], ['Papel assinante 2', '{{assinante_2_papel}}'],
] as const;
const SAMPLE: Record<string, string> = {
  nome_colaborador: 'NOME DO COLABORADOR', cpf: '000.000.000-00', funcao: 'Função', treinamento: 'Equipamento de Proteção Individual', nr_numero: '06',
  carga_horaria: '4 horas', data_realizacao: '12/05/2026', data_validade: '12/05/2027', data_emissao: '12/05/2026', empresa: 'Nome da empresa',
  documento_empresa: '00.000.000/0000-00', cidade: 'Cidade', conteudo_programatico: 'Introdução e objetivos do treinamento\nRiscos e medidas de controle',
  codigo_certificado: 'DEMO-2026-000001', instrutor: 'Nome do instrutor', registro_instrutor: 'Registro profissional', responsavel_tecnico: 'Nome do responsável',
  registro_responsavel: 'Registro profissional', assinante_1_nome: 'Nome do assinante', assinante_1_papel: 'Responsável técnico',
  assinante_2_nome: 'Nome do assinante', assinante_2_papel: 'Instrutor',
};
const FONTS = [['Arial', 'Arial, Helvetica, sans-serif'], ['Arial Narrow', "'Arial Narrow', Arial, sans-serif"], ['Calibri', 'Calibri, Arial, sans-serif'],
  ['Georgia', 'Georgia, serif'], ['Times New Roman', "'Times New Roman', serif"], ['Segoe UI', "'Segoe UI', Arial, sans-serif"]] as const;

function createElement(kind: TemplateKind, page: TemplatePage, count: number): TemplateElement {
  const common: TemplateElement = { id: `${kind}-${Date.now()}-${count}`, page, kind, x: 80, y: 80, width: 300, height: kind === 'text' ? 64 : 90,
    content: kind === 'text' ? 'Novo texto' : '', asset: null, fontSize: 18, fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: '400', color: '#111827',
    textAlign: 'left', lineHeight: 1.2, background: 'transparent', borderColor: '#111827', borderWidth: 0, opacity: 1, rotation: 0, zIndex: 3, clipPath: null };
  if (kind === 'image') return { ...common, asset: 'logo_empresa', width: 220, height: 90 };
  if (kind === 'signature') return { ...common, asset: 'assinatura_colaborador', width: 230, height: 72, borderWidth: 1 };
  if (kind === 'qrcode') return { ...common, asset: 'qrcode', width: 90, height: 90 };
  if (kind === 'line') return { ...common, width: 260, height: 6, borderWidth: 1 };
  if (kind === 'shape') return { ...common, width: 220, height: 90, background: '#1d4ed8' };
  return common;
}

function previewText(text: string) {
  return text.replace(/\{\{([a-z0-9_]+)}}/gi, (_match, key: string) => SAMPLE[key] ?? key.replaceAll('_', ' ').toUpperCase());
}

async function request<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) {
    const message = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(message?.error ?? 'Não foi possível concluir a operação.');
  }
  return response.json() as Promise<T>;
}

export const TenantCertificateTemplateEditor: React.FC<Props> = ({ model, onSaved, onCancel }) => {
  const [layout, setLayout] = useState<TemplateLayout>(model.layout);
  const [page, setPage] = useState<TemplatePage>('front');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'preview' | null>(null);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const interaction = useRef<Interaction | null>(null);
  const selected = layout.elements.find((element) => element.id === selectedId) ?? null;
  const isText = selected?.kind === 'text';

  useEffect(() => { setLayout(model.layout); setPage('front'); setSelectedId(null); }, [model.templateKey, model.layout]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const update = (id: string, patch: Partial<TemplateElement>) => setLayout((current) => ({ ...current, elements: current.elements.map((element) => element.id === id ? { ...element, ...patch } : element) }));
  const add = (kind: TemplateKind) => {
    const element = createElement(kind, page, layout.elements.length);
    setLayout((current) => ({ ...current, elements: [...current.elements, element] })); setSelectedId(element.id);
  };
  const startInteraction = (event: ReactPointerEvent<HTMLElement>, element: TemplateElement, mode: Interaction['mode']) => {
    event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setSelectedId(element.id);
    interaction.current = { mode, elementId: element.id, clientX: event.clientX, clientY: event.clientY, origin: element, startLayout: layout };
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = interaction.current;
    if (!current) return;
    const dx = (event.clientX - current.clientX) / SCALE; const dy = (event.clientY - current.clientY) / SCALE;
    setLayout((old) => ({ ...old, elements: old.elements.map((element) => {
      if (element.id !== current.elementId) return element;
      return current.mode === 'resize'
        ? { ...element, width: Math.max(20, Math.min(960 - element.x, current.origin.width + dx)), height: Math.max(12, Math.min(720 - element.y, current.origin.height + dy)) }
        : { ...element, x: Math.max(0, Math.min(960 - element.width, current.origin.x + dx)), y: Math.max(0, Math.min(720 - element.height, current.origin.y + dy)) };
    }) }));
  };
  const endMove = () => { interaction.current = null; };
  const save = async () => {
    setBusy('save'); setError('');
    try { await request('/api/tenant/certificate-template/layout', { templateKey: model.templateKey, layout }); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.'); }
    finally { setBusy(null); }
  };
  const preview = async () => {
    setBusy('preview'); setError('');
    try {
      const response = await fetch('/api/tenant/certificate-template/preview', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateKey: model.templateKey, layout }) });
      if (!response.ok) { const body = await response.json().catch(() => null) as { error?: string } | null; throw new Error(body?.error ?? 'Não foi possível gerar a prévia.'); }
      const nextUrl = URL.createObjectURL(await response.blob()); setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return nextUrl; });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível gerar a prévia.'); }
    finally { setBusy(null); }
  };
  const appendVariable = (token: string) => { if (selected?.kind === 'text') update(selected.id, { content: `${selected.content}${selected.content ? ' ' : ''}${token}` }); };

  const renderElement = (element: TemplateElement) => {
    const style: React.CSSProperties = { left: element.x, top: element.y, width: element.width, height: element.height, zIndex: element.zIndex, opacity: element.opacity,
      transform: `rotate(${element.rotation}deg)`, color: element.color, background: element.background, fontFamily: element.fontFamily, fontSize: element.fontSize,
      fontWeight: element.fontWeight, lineHeight: element.lineHeight, textAlign: element.textAlign, overflow: 'hidden', clipPath: element.clipPath ?? undefined };
    let content: React.ReactNode;
    if (element.kind === 'text') content = <span className="block h-full whitespace-pre-line">{previewText(element.content)}</span>;
    else if (element.kind === 'line') content = <span className="absolute inset-x-0 top-1/2 border-t" style={{ borderColor: element.borderColor, borderWidth: element.borderWidth || 1 }} />;
    else if (element.kind === 'shape') content = null;
    else if (element.kind === 'qrcode') content = <span className="grid h-full place-items-center border border-slate-400 bg-white text-center text-[10px] font-bold text-slate-600"><QrCode className="h-8 w-8" />QR DE VALIDAÇÃO</span>;
    else if (element.kind === 'signature') content = <span className="grid h-full place-items-center border-b text-center text-xs font-semibold text-slate-600" style={{ borderColor: element.borderColor, borderWidth: element.borderWidth || 1 }}>{element.asset?.replaceAll('_', ' ') || 'Assinatura'}</span>;
    else content = <span className="grid h-full place-items-center border border-dashed border-slate-500 bg-white/80 text-center text-xs font-semibold text-slate-600"><ImageIcon className="mb-1 h-5 w-5" />Logo da empresa</span>;
    return <div key={element.id} className={`absolute cursor-move select-none ${selectedId === element.id ? 'outline outline-2 outline-blue-600' : 'hover:outline hover:outline-1 hover:outline-blue-400'}`} style={style} onPointerDown={(event) => startInteraction(event, element, 'move')}>
      {content}{selectedId === element.id && <button type="button" title="Redimensionar" aria-label="Redimensionar" className="absolute -bottom-2 -right-2 h-4 w-4 cursor-se-resize border border-white bg-blue-600 shadow" onPointerDown={(event) => startInteraction(event, element, 'resize')} />}
    </div>;
  };

  return <section className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm dark:border-blue-400/20 dark:bg-slate-950/70">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-white/10"><div><h3 className="font-bold">Revisar: {model.fileName}</h3><p className="mt-1 text-sm text-slate-500">Versão {model.version} · {model.pageCount} slides importados. Arraste os campos e confira a prévia antes de ativar.</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy !== null} onClick={onCancel} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold dark:border-white/10">Fechar</button><button type="button" disabled={busy !== null} onClick={() => void preview()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold dark:border-white/10"><Eye className="h-4 w-4" />{busy === 'preview' ? 'Gerando…' : 'Prévia PDF'}</button><button type="button" disabled={busy !== null} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === 'save' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar e ativar</button></div>
    </header>
    {error && <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-2 border-b border-slate-200 p-3 dark:border-white/10">
      <button type="button" onClick={() => add('text')} className="rounded-lg border px-3 py-2 text-sm font-semibold"><Type className="mr-1 inline h-4 w-4" />Texto</button>
      <button type="button" onClick={() => add('image')} className="rounded-lg border px-3 py-2 text-sm font-semibold"><ImageIcon className="mr-1 inline h-4 w-4" />Logo</button>
      <button type="button" onClick={() => add('signature')} className="rounded-lg border px-3 py-2 text-sm font-semibold"><Signature className="mr-1 inline h-4 w-4" />Assinatura</button>
      <button type="button" onClick={() => add('qrcode')} className="rounded-lg border px-3 py-2 text-sm font-semibold"><QrCode className="mr-1 inline h-4 w-4" />QR</button>
      <button type="button" onClick={() => add('shape')} className="rounded-lg border px-3 py-2 text-sm font-semibold"><Square className="mr-1 inline h-4 w-4" />Forma</button>
      <button type="button" onClick={() => add('line')} className="rounded-lg border px-3 py-2 text-sm font-semibold">Linha</button>
    </div>
    <div className="grid min-w-0 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 bg-slate-100 dark:bg-slate-900">
        <div className="flex border-b border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950"><button type="button" className={`border-b-2 px-4 py-3 text-sm font-semibold ${page === 'front' ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500'}`} onClick={() => { setPage('front'); setSelectedId(null); }}>Frente</button><button type="button" className={`border-b-2 px-4 py-3 text-sm font-semibold ${page === 'back' ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500'}`} onClick={() => { setPage('back'); setSelectedId(null); }}>Verso</button></div>
        <div className="overflow-auto p-4"><div style={{ width: 960 * SCALE, height: 720 * SCALE }}><div className="relative origin-top-left bg-white shadow-xl" style={{ width: 960, height: 720, transform: `scale(${SCALE})` }} onPointerMove={move} onPointerUp={endMove} onPointerCancel={endMove} onPointerDown={() => setSelectedId(null)}>
          <img className="pointer-events-none absolute inset-0 h-full w-full object-fill" src={page === 'front' ? model.frontUrl : model.backUrl} alt="Fundo importado do PowerPoint" />
          {layout.elements.filter((element) => element.page === page).sort((a, b) => a.zIndex - b.zIndex).map(renderElement)}
        </div></div></div>
      </div>
      <aside className="space-y-4 border-t border-slate-200 p-4 dark:border-white/10 xl:border-l xl:border-t-0">
        <div><h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Campos automáticos</h4><p className="mt-1 text-xs text-slate-500">Selecione uma caixa de texto e toque em um campo para inseri-lo.</p><div className="mt-2 flex flex-wrap gap-1">{VARIABLES.map(([label, token]) => <button key={token} type="button" disabled={!isText} title={token} onClick={() => appendVariable(token)} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-left text-[11px] text-slate-700 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">{label}</button>)}</div></div>
        {selected ? <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-white/10"><div className="flex items-center justify-between"><strong className="text-sm capitalize">{selected.kind}</strong><button type="button" onClick={() => { setLayout((current) => ({ ...current, elements: current.elements.filter((element) => element.id !== selected.id) })); setSelectedId(null); }} className="text-xs font-semibold text-red-600">Excluir</button></div>
          {selected.kind === 'text' && <label className="block text-xs font-semibold">Texto<textarea className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm font-normal dark:border-white/10 dark:bg-slate-900" value={selected.content} onChange={(event) => update(selected.id, { content: event.target.value })} /></label>}
          {selected.kind === 'image' && <label className="block text-xs font-semibold">Imagem<select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-white/10 dark:bg-slate-900" value={selected.asset ?? 'logo_empresa'} onChange={(event) => update(selected.id, { asset: event.target.value })}><option value="logo_empresa">Logo desta empresa</option></select></label>}
          {selected.kind === 'signature' && <label className="block text-xs font-semibold">Assinatura<select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-white/10 dark:bg-slate-900" value={selected.asset ?? 'assinatura_colaborador'} onChange={(event) => update(selected.id, { asset: event.target.value })}><option value="assinatura_colaborador">Colaborador</option><option value="assinatura_1">Assinante 1</option><option value="assinatura_2">Assinante 2</option><option value="assinatura_3">Assinante 3</option><option value="assinatura_4">Assinante 4</option><option value="assinatura_5">Assinante 5</option><option value="assinatura_6">Assinante 6</option><option value="assinatura_instrutor">Instrutor</option><option value="assinatura_responsavel">Responsável técnico</option></select></label>}
          <div className="grid grid-cols-2 gap-2">{([['X', 'x'], ['Y', 'y'], ['Largura', 'width'], ['Altura', 'height']] as const).map(([label, key]) => <label key={key} className="text-xs font-semibold">{label}<input type="number" min="0" max={key === 'x' || key === 'width' ? 960 : 720} value={Math.round(selected[key])} onChange={(event) => update(selected.id, { [key]: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-normal dark:border-white/10 dark:bg-slate-900" /></label>)}</div>
          {selected.kind === 'text' && <div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold">Fonte<select value={selected.fontFamily} onChange={(event) => update(selected.id, { fontFamily: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-normal dark:border-white/10 dark:bg-slate-900">{FONTS.map(([label, value]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-semibold">Tamanho<input type="number" min="6" max="96" value={selected.fontSize} onChange={(event) => update(selected.id, { fontSize: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-normal dark:border-white/10 dark:bg-slate-900" /></label>
            <label className="text-xs font-semibold">Alinhamento<select value={selected.textAlign} onChange={(event) => update(selected.id, { textAlign: event.target.value as TemplateElement['textAlign'] })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-normal dark:border-white/10 dark:bg-slate-900"><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option><option value="justify">Justificado</option></select></label><label className="text-xs font-semibold">Peso<select value={selected.fontWeight} onChange={(event) => update(selected.id, { fontWeight: event.target.value as TemplateElement['fontWeight'] })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-normal dark:border-white/10 dark:bg-slate-900"><option value="400">Normal</option><option value="600">Seminegrito</option><option value="700">Negrito</option></select></label>
            <label className="text-xs font-semibold">Cor<input type="color" value={selected.color} onChange={(event) => update(selected.id, { color: event.target.value })} className="mt-1 h-9 w-full rounded border border-slate-300 p-1 dark:border-white/10" /></label>
          </div>}
          {selected.kind === 'shape' && <label className="block text-xs font-semibold">Cor da forma<input type="color" value={selected.background === 'transparent' ? '#ffffff' : selected.background} onChange={(event) => update(selected.id, { background: event.target.value })} className="mt-1 h-9 w-full rounded border border-slate-300 p-1 dark:border-white/10" /></label>}
        </div> : <div className="grid min-h-32 place-items-center text-center text-sm text-slate-500"><div><Move className="mx-auto mb-2 h-6 w-6" />Selecione ou adicione um campo.</div></div>}
      </aside>
    </div>
    {previewUrl && <div className="fixed inset-0 z-50 bg-slate-950/70 p-4" role="dialog" aria-modal="true"><div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><strong>Prévia PDF com dados de exemplo</strong><button type="button" aria-label="Fechar prévia" onClick={() => setPreviewUrl('')} className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></header><iframe title="Prévia do certificado" className="min-h-0 flex-1 bg-slate-200" src={previewUrl} /></div></div>}
  </section>;
};
