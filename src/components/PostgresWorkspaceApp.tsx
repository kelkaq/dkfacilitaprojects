import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpenCheck, Building2, CheckCircle2, FileBadge, LogOut, Plus, RefreshCw, Users } from 'lucide-react';
import { ThemeToggleButton } from './ThemeProvider.tsx';

type Tab = 'resumo' | 'colaboradores' | 'obras' | 'treinamentos' | 'turmas';
type User = { id: string; nome: string; email: string; perfil: string };
type WorkspaceSummary = { empresa: string; status: string; permitido: boolean; motivo: string | null; plano: string | null;
  limites: { colaboradoresAtuais: number; limiteColaboradores: number; obrasAtuais: number; limiteObras: number } | null;
  totais: { colaboradores: number; obras: number; treinamentos: number; turmas: number; certificados: number } };
type Collaborator = { id: string; nome: string; cpf: string; funcao: string; matricula: string | null; email: string | null;
  telefone: string | null; ativo: boolean; contratoObraId: string | null; contratoObra: { codigo: string; nome: string } | null };
type Work = { id: string; codigo: string; nome: string; clienteFinal: string | null; localizacao: string | null; ativo: boolean;
  _count: { colaboradores: number; turmas: number } };
type TrainingContent = { id: string; ordem: number; descricao: string; cargaHorariaMin: number | null };
type Choice = { id: string; texto: string };
type Training = { id: string; nrCodigo: string; nrTitulo: string; variacaoNome: string; modalidade: string; cargaHorariaHoras: number;
  validadeMeses: number; notaMinimaAprovacao: number; ativo: boolean; conteudoLinhas: TrainingContent[]; _count: { questoes: number; turmas: number } };
type Variation = { id: string; slug: string; nome: string; modalidade: string; cargaHorariaHoras: number; validadeMeses: number;
  notaMinimaAprovacao: number; linhas: TrainingContent[] };
type Nr = { codigo: string; titulo: string; variacoes: Variation[] };
type Operator = { id: string; nome: string; perfil: string; registroProfissional: string | null };
type Class = { id: string; codigoTurma: string; titulo: string; dataRealizacao: string; localRealizacao: string | null;
  tokenPublico: string; status: 'ABERTA' | 'ENCERRADA' | 'CANCELADA'; modoIdentificacao: 'CPF' | 'CPF_PIN' | 'CPF_PIN_SELFIE'; temPin: boolean;
  treinamento: { id: string; nrCodigo: string; nrTitulo: string; variacaoNome: string; cargaHorariaHoras: number; notaMinimaAprovacao: number };
  contratoObra: { id: string; codigo: string; nome: string } | null; instrutor: { id: string; nome: string } | null;
  rt: { id: string; nome: string } | null; _count: { tentativas: number; certificados: number } };
type Question = { id: string; enunciado: string; alternativas: Choice[]; correta: string; peso: number; ativa: boolean };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init,
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  if (response.status === 401) { window.location.assign('/acesso'); throw new Error('Sua sessão expirou. Entre novamente.'); }
  const body = response.status === 204 ? null : await response.json().catch(() => null) as { error?: string } | T | null;
  if (!response.ok) throw new Error(body && typeof body === 'object' && 'error' in body ? String(body.error) : 'Não foi possível concluir a operação.');
  return body as T;
}

const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'resumo', label: 'Visão geral', icon: Building2 },
  { id: 'colaboradores', label: 'Colaboradores', icon: Users },
  { id: 'obras', label: 'Obras', icon: Building2 },
  { id: 'treinamentos', label: 'Treinamentos', icon: BookOpenCheck },
  { id: 'turmas', label: 'Turmas & provas', icon: FileBadge },
];

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length > 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  if (digits.length > 6) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  if (digits.length > 3) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  return digits;
}

export const PostgresWorkspaceApp: React.FC = () => {
  const [tab, setTab] = useState<Tab>('resumo');
  const [user, setUser] = useState<User | null>(null);
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [catalog, setCatalog] = useState<Nr[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionTrainingId, setQuestionTrainingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [collaboratorForm, setCollaboratorForm] = useState({ nome: '', cpf: '', funcao: '', matricula: '', email: '', telefone: '', contratoObraId: '' });
  const [workForm, setWorkForm] = useState({ codigo: '', nome: '', clienteFinal: '', localizacao: '' });
  const [selectedVariation, setSelectedVariation] = useState('');
  const [classForm, setClassForm] = useState({ codigoTurma: '', titulo: '', treinamentoId: '', contratoObraId: '',
    dataRealizacao: new Date().toISOString().slice(0, 10), localRealizacao: '', instrutorId: '', rtId: '', modoIdentificacao: 'CPF', pin: '' });
  const [questionForm, setQuestionForm] = useState({ enunciado: '', a: '', b: '', c: '', d: '', correta: 'A' });

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [me, home, people, sites, courses, nrs] = await Promise.all([
        api<User>('/api/auth/me'), api<WorkspaceSummary>('/api/tenant/workspace'),
        api<{ colaboradores: Collaborator[] }>('/api/tenant/colaboradores'),
        api<{ obras: Work[] }>('/api/tenant/obras'), api<{ treinamentos: Training[] }>('/api/tenant/trainings'),
        api<{ nrs: Nr[] }>('/api/tenant/training-catalog'),
      ]);
      const [classData, operatorData] = await Promise.all([
        api<{ turmas: Class[] }>('/api/tenant/classes'), api<{ responsaveis: Operator[] }>('/api/tenant/operators'),
      ]);
      setUser(me); setSummary(home); setCollaborators(people.colaboradores); setWorks(sites.obras);
      setTrainings(courses.treinamentos); setCatalog(nrs.nrs); setClasses(classData.turmas); setOperators(operatorData.responsaveis);
      if (!selectedVariation) setSelectedVariation(nrs.nrs.find((nr) => nr.variacoes.length)?.variacoes[0]?.slug ?? '');
      const firstTrainingId = courses.treinamentos[0]?.id ?? '';
      if (!classForm.treinamentoId && firstTrainingId) setClassForm((current) => ({ ...current, treinamentoId: firstTrainingId }));
      if (!questionTrainingId && firstTrainingId) setQuestionTrainingId(firstTrainingId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o painel.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const isWriter = user?.perfil === 'ADMIN_EMPRESA' || user?.perfil === 'RT';
  const activeCollaborators = useMemo(() => collaborators.filter((item) => item.ativo).length, [collaborators]);
  const activeWorks = useMemo(() => works.filter((item) => item.ativo).length, [works]);
  const allVariations = useMemo(() => catalog.flatMap((nr) => nr.variacoes.map((variation) => ({ ...variation, nr: nr.codigo, title: nr.titulo }))), [catalog]);

  const run = async (action: () => Promise<void>, message: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await load(); setNotice(message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  };

  const addCollaborator = (event: React.FormEvent) => {
    event.preventDefault();
    return run(async () => {
      await api('/api/tenant/colaboradores', { method: 'POST', body: JSON.stringify({ ...collaboratorForm, contratoObraId: collaboratorForm.contratoObraId || null }) });
      setCollaboratorForm({ nome: '', cpf: '', funcao: '', matricula: '', email: '', telefone: '', contratoObraId: '' });
    }, 'Colaborador cadastrado.');
  };

  const changeCollaborator = (person: Collaborator) => run(async () => {
    await api(`/api/tenant/colaboradores/${person.id}`, { method: 'PATCH', body: JSON.stringify({ ativo: !person.ativo }) });
  }, person.ativo ? 'Colaborador desativado.' : 'Colaborador reativado.');

  const addWork = (event: React.FormEvent) => {
    event.preventDefault();
    return run(async () => {
      await api('/api/tenant/obras', { method: 'POST', body: JSON.stringify(workForm) });
      setWorkForm({ codigo: '', nome: '', clienteFinal: '', localizacao: '' });
    }, 'Obra cadastrada.');
  };

  const changeWork = (work: Work) => run(async () => {
    await api(`/api/tenant/obras/${work.id}`, { method: 'PATCH', body: JSON.stringify({ ativo: !work.ativo }) });
  }, work.ativo ? 'Obra desativada.' : 'Obra reativada.');

  const addTraining = () => run(async () => {
    await api('/api/tenant/trainings', { method: 'POST', body: JSON.stringify({ variacaoSlug: selectedVariation }) });
  }, 'Treinamento adicionado à empresa.');

  useEffect(() => {
    if (!questionTrainingId) { setQuestions([]); return; }
    let active = true;
    void api<{ questoes: Question[] }>(`/api/tenant/trainings/${encodeURIComponent(questionTrainingId)}/questions`)
      .then((data) => { if (active) setQuestions(data.questoes); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível consultar as questões.'); });
    return () => { active = false; };
  }, [questionTrainingId]);

  const addClass = (event: React.FormEvent) => {
    event.preventDefault();
    return run(async () => {
      await api('/api/tenant/classes', { method: 'POST', body: JSON.stringify({ ...classForm,
        contratoObraId: classForm.contratoObraId || null, instrutorId: classForm.instrutorId || null,
        rtId: classForm.rtId || null, pin: classForm.modoIdentificacao === 'CPF' ? '' : classForm.pin }) });
      setClassForm((current) => ({ ...current, codigoTurma: '', titulo: '', localRealizacao: '', pin: '' }));
    }, 'Turma criada com link privado de avaliação.');
  };

  const changeClassStatus = (item: Class) => run(async () => {
    await api(`/api/tenant/classes/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: item.status === 'ABERTA' ? 'ENCERRADA' : 'ABERTA' }) });
  }, item.status === 'ABERTA' ? 'Turma encerrada.' : 'Turma reaberta.');

  const copyClassLink = async (item: Class) => {
    const link = `${window.location.origin}/?csdk_prova=${encodeURIComponent(item.tokenPublico)}`;
    await navigator.clipboard?.writeText(link);
    setError(''); setNotice('Link individual da turma copiado.');
  };

  const addQuestion = (event: React.FormEvent) => {
    event.preventDefault();
    const alternativas = [
      { id: 'A', texto: questionForm.a.trim() }, { id: 'B', texto: questionForm.b.trim() },
      { id: 'C', texto: questionForm.c.trim() }, { id: 'D', texto: questionForm.d.trim() },
    ].filter((item) => item.texto);
    return run(async () => {
      const created = await api<Question>(`/api/tenant/trainings/${encodeURIComponent(questionTrainingId)}/questions`, { method: 'POST',
        body: JSON.stringify({ enunciado: questionForm.enunciado, alternativas, correta: questionForm.correta, peso: 1 }) });
      setQuestions((current) => [...current, created]);
      setQuestionForm({ enunciado: '', a: '', b: '', c: '', d: '', correta: 'A' });
    }, 'Questão adicionada ao banco da empresa.');
  };

  const changeQuestionStatus = (question: Question) => run(async () => {
    await api(`/api/tenant/questions/${question.id}`, { method: 'PATCH', body: JSON.stringify({ ativa: !question.ativa }) });
    setQuestions((current) => current.map((item) => item.id === question.id ? { ...item, ativa: !item.ativa } : item));
  }, question.ativa ? 'Questão desativada.' : 'Questão reativada.');

  const logout = async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } finally { window.location.assign('/'); }
  };

  const field = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-white/15 dark:bg-slate-900';
  const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-950/70';
  const button = 'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50';

  return <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#070b14] dark:text-slate-100">
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-700 text-sm font-black text-white">DK</span><div className="min-w-0"><p className="truncate text-sm font-bold">Certifica Software - DK</p><p className="truncate text-xs text-slate-500">{summary?.empresa ?? 'Área da empresa'}</p></div></div>
        <div className="flex items-center gap-2"><a href="/minha-conta" className="hidden rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-white/10 sm:inline-flex">Minha conta e equipe</a><ThemeToggleButton compact /><button type="button" onClick={() => void logout()} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-white/10"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sair</span></button></div>
      </div>
    </header>
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-8">
      <aside className="space-y-2 lg:sticky lg:top-24 lg:h-fit">
        <p className="hidden px-3 pb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400 lg:block">Área de trabalho</p>
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setTab(id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition ${tab === id ? 'bg-blue-700 text-white shadow-md shadow-blue-900/15' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-white/5'}`}><Icon className="h-4 w-4" />{label}</button>)}
        <a href="/minha-conta" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-white/5"><Users className="h-4 w-4" />Conta e equipe</a>
      </aside>

      <main className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">{summary?.plano ?? 'Plano'}</p><h1 className="mt-1 text-2xl font-bold sm:text-3xl">{tab === 'resumo' ? 'Visão geral' : tabs.find((item) => item.id === tab)?.label}</h1><p className="mt-1 text-sm text-slate-500">{summary?.empresa ?? 'Carregando empresa...'}</p></div><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:bg-white/5"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Atualizar</button></div>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-400/20 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
        {notice && <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-950/30 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />{notice}</p>}
        {summary && !summary.permitido && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-950/30 dark:text-amber-100"><strong>Operações bloqueadas.</strong> {summary.motivo}</div>}

        {tab === 'resumo' && <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Colaboradores', summary?.totais.colaboradores ?? 0, `${activeCollaborators} ativos${summary?.limites ? ` · limite ${summary.limites.limiteColaboradores}` : ''}`],
              ['Obras', summary?.totais.obras ?? 0, `${activeWorks} ativas${summary?.limites ? ` · limite ${summary.limites.limiteObras}` : ''}`],
              ['Treinamentos', summary?.totais.treinamentos ?? 0, 'Configurações desta empresa'],
              ['Turmas', summary?.totais.turmas ?? 0, 'Aplicações e provas'],
              ['Certificados', summary?.totais.certificados ?? 0, 'Emitidos e ativos'],
            ].map(([title, value, description]) => <article key={String(title)} className={card}><p className="text-sm text-slate-500">{title}</p><p className="mt-2 text-3xl font-bold">{value}</p><p className="mt-2 text-xs text-slate-500">{description}</p></article>)}
          </section>
          <section className={`${card} grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center`}><div><h2 className="font-bold">Personalize a identidade e os certificados</h2><p className="mt-1 text-sm text-slate-500">Logo, cores, modelo e papéis de assinatura são configurados por empresa.</p></div><a href="/minha-conta" className={button}>Abrir configuração</a></section>
          <section className={`${card} grid gap-4 sm:grid-cols-2`}><div><h2 className="font-bold">Comece pela sua operação</h2><p className="mt-1 text-sm text-slate-500">Cadastre colaboradores e obras. Depois escolha os treinamentos que sua empresa oferece.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setTab('colaboradores')} className={button}><Users className="h-4 w-4" />Colaboradores</button><button type="button" onClick={() => setTab('treinamentos')} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"><BookOpenCheck className="mr-2 inline h-4 w-4" />Treinamentos</button></div></section>
        </>}

        {tab === 'colaboradores' && <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
          <section className={card}><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-bold">Colaboradores</h2><p className="mt-1 text-sm text-slate-500">{activeCollaborators} ativos de {summary?.limites?.limiteColaboradores ?? '—'} vagas</p></div><Users className="h-5 w-5 text-blue-700" /></div>
            <div className="space-y-2">{collaborators.length ? collaborators.map((person) => <div key={person.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10"><div className="min-w-0"><p className="truncate text-sm font-semibold">{person.nome} <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] ${person.ativo ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>{person.ativo ? 'Ativo' : 'Inativo'}</span></p><p className="mt-1 text-xs text-slate-500">CPF {formatCpf(person.cpf)} · {person.funcao}{person.contratoObra ? ` · ${person.contratoObra.codigo}` : ''}</p></div>{isWriter && <button type="button" disabled={busy || !summary?.permitido} onClick={() => void changeCollaborator(person)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold dark:border-white/10">{person.ativo ? 'Desativar' : 'Reativar'}</button>}</div>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-white/5">Nenhum colaborador cadastrado.</p>}</div>
          </section>
          {isWriter && <form onSubmit={(event) => void addCollaborator(event)} className={`${card} space-y-3`}><div><h2 className="font-bold">Novo colaborador</h2><p className="mt-1 text-sm text-slate-500">CPF único dentro desta empresa.</p></div><input className={field} required minLength={2} maxLength={120} placeholder="Nome completo" value={collaboratorForm.nome} onChange={(event) => setCollaboratorForm({ ...collaboratorForm, nome: event.target.value })} /><input className={field} required inputMode="numeric" maxLength={14} placeholder="CPF" value={formatCpf(collaboratorForm.cpf)} onChange={(event) => setCollaboratorForm({ ...collaboratorForm, cpf: event.target.value.replace(/\D/g, '').slice(0, 11) })} /><input className={field} required minLength={2} maxLength={120} placeholder="Função" value={collaboratorForm.funcao} onChange={(event) => setCollaboratorForm({ ...collaboratorForm, funcao: event.target.value })} /><input className={field} maxLength={80} placeholder="Matrícula (opcional)" value={collaboratorForm.matricula} onChange={(event) => setCollaboratorForm({ ...collaboratorForm, matricula: event.target.value })} /><input className={field} type="email" maxLength={160} placeholder="E-mail (opcional)" value={collaboratorForm.email} onChange={(event) => setCollaboratorForm({ ...collaboratorForm, email: event.target.value })} /><input className={field} inputMode="tel" placeholder="Telefone com DDD (opcional)" value={collaboratorForm.telefone} onChange={(event) => setCollaboratorForm({ ...collaboratorForm, telefone: event.target.value })} /><select className={field} value={collaboratorForm.contratoObraId} onChange={(event) => setCollaboratorForm({ ...collaboratorForm, contratoObraId: event.target.value })}><option value="">Sem obra vinculada</option>{works.filter((work) => work.ativo).map((work) => <option key={work.id} value={work.id}>{work.codigo} · {work.nome}</option>)}</select><button type="submit" disabled={busy || !summary?.permitido} className={`${button} w-full`}><Plus className="h-4 w-4" />Cadastrar colaborador</button></form>}
        </div>}

        {tab === 'obras' && <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
          <section className={card}><div className="mb-4"><h2 className="font-bold">Obras e contratos</h2><p className="mt-1 text-sm text-slate-500">{activeWorks} ativos de {summary?.limites?.limiteObras ?? '—'} permitidos</p></div><div className="space-y-2">{works.length ? works.map((work) => <div key={work.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10"><div><p className="text-sm font-semibold">{work.codigo} · {work.nome}</p><p className="mt-1 text-xs text-slate-500">{work.clienteFinal || 'Sem cliente informado'} · {work._count.colaboradores} colaboradores · {work._count.turmas} turmas</p></div>{isWriter && <button type="button" disabled={busy || !summary?.permitido} onClick={() => void changeWork(work)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold dark:border-white/10">{work.ativo ? 'Desativar' : 'Reativar'}</button>}</div>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-white/5">Nenhuma obra cadastrada.</p>}</div></section>
          {isWriter && <form onSubmit={(event) => void addWork(event)} className={`${card} space-y-3`}><div><h2 className="font-bold">Nova obra</h2><p className="mt-1 text-sm text-slate-500">Código não se repete dentro da empresa.</p></div><input className={field} required minLength={2} maxLength={40} placeholder="Código" value={workForm.codigo} onChange={(event) => setWorkForm({ ...workForm, codigo: event.target.value })} /><input className={field} required minLength={2} maxLength={160} placeholder="Nome da obra ou contrato" value={workForm.nome} onChange={(event) => setWorkForm({ ...workForm, nome: event.target.value })} /><input className={field} maxLength={180} placeholder="Cliente final (opcional)" value={workForm.clienteFinal} onChange={(event) => setWorkForm({ ...workForm, clienteFinal: event.target.value })} /><input className={field} maxLength={240} placeholder="Localização (opcional)" value={workForm.localizacao} onChange={(event) => setWorkForm({ ...workForm, localizacao: event.target.value })} /><button type="submit" disabled={busy || !summary?.permitido} className={`${button} w-full`}><Plus className="h-4 w-4" />Cadastrar obra</button></form>}
        </div>}

        {tab === 'treinamentos' && <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
          <section className={card}><div className="mb-4 flex items-center gap-3"><FileBadge className="h-5 w-5 text-blue-700" /><div><h2 className="font-bold">Treinamentos desta empresa</h2><p className="mt-1 text-sm text-slate-500">O conteúdo copiado fica separado do catálogo geral da plataforma.</p></div></div><div className="space-y-3">{trainings.length ? trainings.map((training) => <article key={training.id} className="rounded-xl border border-slate-200 p-4 dark:border-white/10"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{training.nrCodigo} · {training.variacaoNome}</p><p className="mt-1 text-xs text-slate-500">{training.nrTitulo} · {training.cargaHorariaHoras} horas · validade {training.validadeMeses} meses · nota mínima {training.notaMinimaAprovacao}%</p></div><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-800 dark:bg-blue-500/10 dark:text-blue-200">{training.conteudoLinhas.length} tópicos</span></div><ol className="mt-3 grid gap-x-6 gap-y-1 text-xs text-slate-500 sm:grid-cols-2">{training.conteudoLinhas.slice(0, 6).map((line) => <li key={line.id}>{line.ordem}. {line.descricao}</li>)}</ol></article>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-white/5">Escolha um treinamento do catálogo ao lado para adicioná-lo.</p>}</div></section>
          {isWriter && <section className={`${card} space-y-3`}><div><h2 className="font-bold">Catálogo de NRs</h2><p className="mt-1 text-sm text-slate-500">Selecione a variação e copie o conteúdo para a sua empresa.</p></div><select className={field} value={selectedVariation} onChange={(event) => setSelectedVariation(event.target.value)}><option value="">Escolha uma variação</option>{allVariations.map((variation) => <option key={variation.slug} value={variation.slug}>{variation.nr} · {variation.title} — {variation.nome}</option>)}</select>{selectedVariation && <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-white/5">{allVariations.find((item) => item.slug === selectedVariation)?.linhas.length ?? 0} tópicos de conteúdo programático serão copiados.</div>}<button type="button" disabled={busy || !summary?.permitido || !selectedVariation} onClick={() => void addTraining()} className={`${button} w-full`}><Plus className="h-4 w-4" />Adicionar à empresa</button></section>}
        </div>}

        {tab === 'turmas' && <div className="space-y-5">
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
            <div className={card}><div className="mb-4"><h2 className="font-bold">Turmas e aplicações</h2><p className="mt-1 text-sm text-slate-500">Links de prova são privados, aleatórios e associados ao treinamento desta empresa.</p></div><div className="space-y-3">{classes.length ? classes.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-4 dark:border-white/10"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{item.codigoTurma} · {item.titulo}</p><p className="mt-1 text-xs text-slate-500">{item.treinamento.nrCodigo} · {item.treinamento.variacaoNome} · {new Date(item.dataRealizacao).toLocaleDateString('pt-BR')} · {item.treinamento.cargaHorariaHoras}h</p><p className="mt-1 text-xs text-slate-500">{item.instrutor ? `Instrutor: ${item.instrutor.nome}` : 'Instrutor não informado'}{item.rt ? ` · RT: ${item.rt.nome}` : ''}{item.contratoObra ? ` · ${item.contratoObra.codigo}` : ''}</p><p className="mt-2 text-xs text-slate-500">{item._count.tentativas} tentativas · {item._count.certificados} certificados · {item.temPin ? 'PIN ativo' : 'sem PIN'}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${item.status === 'ABERTA' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>{item.status}</span></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void copyClassLink(item)} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 dark:bg-blue-500/10 dark:text-blue-200">Copiar link da prova</button>{isWriter && item.status !== 'CANCELADA' && <button type="button" disabled={busy || !summary?.permitido} onClick={() => void changeClassStatus(item)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold dark:border-white/10">{item.status === 'ABERTA' ? 'Encerrar turma' : 'Reabrir turma'}</button>}</div></article>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-white/5">Nenhuma turma criada.</p>}</div></div>
            {isWriter && <form onSubmit={(event) => void addClass(event)} className={`${card} space-y-3`}><div><h2 className="font-bold">Nova turma</h2><p className="mt-1 text-sm text-slate-500">A prova usa questões do banco do treinamento escolhido.</p></div><input className={field} required minLength={2} maxLength={40} placeholder="Código da turma" value={classForm.codigoTurma} onChange={(event) => setClassForm({ ...classForm, codigoTurma: event.target.value })} /><input className={field} required minLength={3} maxLength={180} placeholder="Título da turma" value={classForm.titulo} onChange={(event) => setClassForm({ ...classForm, titulo: event.target.value })} /><select required className={field} value={classForm.treinamentoId} onChange={(event) => setClassForm({ ...classForm, treinamentoId: event.target.value })}><option value="">Selecione o treinamento</option>{trainings.filter((training) => training.ativo).map((training) => <option key={training.id} value={training.id}>{training.nrCodigo} · {training.variacaoNome}</option>)}</select><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Data de realização<input className={`${field} mt-1`} type="date" required value={classForm.dataRealizacao} onChange={(event) => setClassForm({ ...classForm, dataRealizacao: event.target.value })} /></label><input className={field} maxLength={240} placeholder="Local da aplicação (opcional)" value={classForm.localRealizacao} onChange={(event) => setClassForm({ ...classForm, localRealizacao: event.target.value })} /><select className={field} value={classForm.contratoObraId} onChange={(event) => setClassForm({ ...classForm, contratoObraId: event.target.value })}><option value="">Sem obra vinculada</option>{works.filter((work) => work.ativo).map((work) => <option key={work.id} value={work.id}>{work.codigo} · {work.nome}</option>)}</select><select className={field} value={classForm.instrutorId} onChange={(event) => setClassForm({ ...classForm, instrutorId: event.target.value })}><option value="">Instrutor a definir</option>{operators.filter((item) => ['ADMIN_EMPRESA', 'RT', 'INSTRUTOR_TST'].includes(item.perfil)).map((item) => <option key={item.id} value={item.id}>{item.nome} · {item.perfil}</option>)}</select><select className={field} value={classForm.rtId} onChange={(event) => setClassForm({ ...classForm, rtId: event.target.value })}><option value="">Responsável técnico a definir</option>{operators.filter((item) => ['ADMIN_EMPRESA', 'RT'].includes(item.perfil)).map((item) => <option key={item.id} value={item.id}>{item.nome} · {item.registroProfissional || item.perfil}</option>)}</select><select className={field} value={classForm.modoIdentificacao} onChange={(event) => setClassForm({ ...classForm, modoIdentificacao: event.target.value })}><option value="CPF">CPF</option><option value="CPF_PIN">CPF e PIN</option><option value="CPF_PIN_SELFIE">CPF, PIN e selfie</option></select>{classForm.modoIdentificacao !== 'CPF' && <input className={field} required minLength={4} maxLength={8} inputMode="numeric" placeholder="PIN numérico de 4 a 8 dígitos" value={classForm.pin} onChange={(event) => setClassForm({ ...classForm, pin: event.target.value.replace(/\D/g, '').slice(0, 8) })} />}<button type="submit" disabled={busy || !summary?.permitido || !trainings.length} className={`${button} w-full`}><Plus className="h-4 w-4" />Criar turma</button></form>}
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
            <div className={card}><div className="mb-4"><h2 className="font-bold">Banco de questões</h2><p className="mt-1 text-sm text-slate-500">Gabarito e nota mínima ficam no servidor.</p></div><select className={field} value={questionTrainingId} onChange={(event) => setQuestionTrainingId(event.target.value)}><option value="">Selecione um treinamento</option>{trainings.map((training) => <option key={training.id} value={training.id}>{training.nrCodigo} · {training.variacaoNome}</option>)}</select><div className="mt-4 space-y-3">{questions.length ? questions.map((question, index) => <article key={question.id} className="rounded-xl border border-slate-200 p-3 dark:border-white/10"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{index + 1}. {question.enunciado}</p><ul className="mt-2 space-y-1 text-xs text-slate-500">{question.alternativas.map((option) => <li key={option.id} className={option.id === question.correta ? 'font-semibold text-emerald-700 dark:text-emerald-300' : ''}>{option.id}. {option.texto}{option.id === question.correta ? ' · gabarito' : ''}</li>)}</ul></div>{isWriter && <button type="button" disabled={busy || !summary?.permitido} onClick={() => void changeQuestionStatus(question)} className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] font-semibold dark:border-white/10">{question.ativa ? 'Desativar' : 'Reativar'}</button>}</div></article>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-white/5">Este treinamento ainda não tem questões.</p>}</div></div>
            {isWriter && <form onSubmit={(event) => void addQuestion(event)} className={`${card} space-y-3`}><div><h2 className="font-bold">Nova questão</h2><p className="mt-1 text-sm text-slate-500">O treinamento selecionado determina em quais turmas a questão aparece.</p></div><textarea className={`${field} min-h-24`} required minLength={10} maxLength={2000} placeholder="Enunciado da questão" value={questionForm.enunciado} onChange={(event) => setQuestionForm({ ...questionForm, enunciado: event.target.value })} />{(['a', 'b', 'c', 'd'] as const).map((key) => <input key={key} className={field} maxLength={600} placeholder={`Alternativa ${key.toUpperCase()}${key === 'a' || key === 'b' ? ' (obrigatória)' : ' (opcional)'}`} required={key === 'a' || key === 'b'} value={questionForm[key]} onChange={(event) => setQuestionForm({ ...questionForm, [key]: event.target.value })} />)}<label className="block text-xs font-semibold">Gabarito<select className={`${field} mt-1`} value={questionForm.correta} onChange={(event) => setQuestionForm({ ...questionForm, correta: event.target.value })}><option value="A">A</option><option value="B">B</option><option value="C" disabled={!questionForm.c.trim()}>C</option><option value="D" disabled={!questionForm.d.trim()}>D</option></select></label><button type="submit" disabled={busy || !summary?.permitido || !questionTrainingId} className={`${button} w-full`}><Plus className="h-4 w-4" />Salvar questão</button></form>}
          </section>
        </div>}
      </main>
    </div>
    {loading && <div className="fixed bottom-4 right-4 rounded-xl border border-slate-200 bg-white/95 px-4 py-2 text-xs font-medium shadow-lg dark:border-white/10 dark:bg-slate-900/95">Carregando dados...</div>}
    <footer className="mx-auto flex max-w-7xl items-center gap-2 px-4 pb-8 text-xs text-slate-400 sm:px-6"><ArrowLeft className="h-3 w-3" /><a href="/" className="hover:text-blue-600">Voltar ao site</a><span>·</span><span>Dados pertencentes a {summary?.empresa ?? 'esta empresa'}</span></footer>
  </div>;
};
