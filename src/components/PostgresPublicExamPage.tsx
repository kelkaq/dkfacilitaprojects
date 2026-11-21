import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, ClipboardCheck, LoaderCircle, ShieldCheck, XCircle } from 'lucide-react';
import { SignaturePadCanvas } from './client/SignaturePadCanvas.tsx';
import { ThemeToggleButton } from './ThemeProvider.tsx';

type Choice = { id: string; texto: string };
type Question = { id: string; ordem: number; enunciado: string; alternativas: Choice[] };
type StartedExam = { tentativaId: string; participante: string; turma: string; treinamento: string;
  notaMinimaAprovacao: number; selfieObrigatoria: boolean; assinaturaColaboradorObrigatoria: boolean; questoes: Question[] };
type ExamResult = { tentativaId: string; status: 'APROVADO' | 'REPROVADO'; notaPercentual: number;
  notaMinimaAprovacao: number; acertos: number; totalQuestoes: number };

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers } });
  const body = await response.json().catch(() => null) as { error?: string } | T | null;
  if (!response.ok) throw new Error(body && typeof body === 'object' && 'error' in body ? String(body.error) : 'Não foi possível concluir a avaliação.');
  return body as T;
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Não foi possível ler o arquivo.'));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

export const PostgresPublicExamPage: React.FC<{ token: string }> = ({ token }) => {
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [pin, setPin] = useState('');
  const [selfie, setSelfie] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [exam, setExam] = useState<StartedExam | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ExamResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const field = 'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-white/15 dark:bg-slate-900';
  const primary = 'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50';

  const start = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const started = await request<StartedExam>(`/api/public/exams/${encodeURIComponent(token)}/start`, {
        method: 'POST', body: JSON.stringify({ nome: name.trim(), cpf, pin }),
      });
      setExam(started); setAnswers({}); window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível abrir esta avaliação.'); }
    finally { setBusy(false); }
  };

  const handleSelfie = async (file?: File) => {
    if (!file) return;
    setError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1_572_864) {
      setError('Escolha uma foto PNG, JPG ou WebP de até 1,5 MB.'); return;
    }
    try { setSelfie(await readDataUrl(file)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a foto.'); }
  };

  const finish = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!exam) return;
    setError('');
    const unanswered = exam.questoes.filter((question) => !answers[question.id]);
    if (unanswered.length) { setError(`Responda todas as questões. Faltam ${unanswered.length}.`); return; }
    if (exam.assinaturaColaboradorObrigatoria && !signature) { setError('Assine no quadro antes de enviar.'); return; }
    if (exam.selfieObrigatoria && !selfie) { setError('Envie uma selfie para concluir esta avaliação.'); return; }
    setBusy(true);
    try {
      const submitted = await request<ExamResult>(`/api/public/exams/${encodeURIComponent(token)}/finish`, {
        method: 'POST', body: JSON.stringify({ tentativaId: exam.tentativaId, respostas: answers,
          assinaturaDataUrl: signature, selfieDataUrl: selfie }),
      });
      setResult(submitted); window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível enviar suas respostas.'); }
    finally { setBusy(false); }
  };

  return <main className="min-h-screen bg-slate-50 px-4 py-7 text-slate-900 dark:bg-[#070b14] dark:text-slate-100 sm:px-6 sm:py-10">
    <div className="mx-auto max-w-3xl">
      <header className="mb-7 flex items-center justify-between"><a href="/" className="inline-flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-5 w-5 text-blue-700" /> Certifica Software - DK</a><ThemeToggleButton compact /></header>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-950/80 sm:p-8">
        {!exam && !result && <>
          <div className="mb-6 flex items-start gap-3"><span className="rounded-xl bg-blue-50 p-2.5 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><ClipboardCheck className="h-5 w-5" /></span><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">Avaliação de treinamento</p><h1 className="mt-1 text-2xl font-bold">Confirme seus dados para começar</h1><p className="mt-2 text-sm text-slate-500">Use o mesmo nome e CPF informados pela empresa. Se a turma exigir, informe também o PIN do instrutor.</p></div></div>
          <form onSubmit={(event) => void start(event)} className="space-y-4"><label className="block text-sm font-medium">Nome completo<input className={`${field} mt-1.5`} required minLength={3} maxLength={120} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label><label className="block text-sm font-medium">CPF<input className={`${field} mt-1.5`} required inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={formatCpf(cpf)} onChange={(event) => setCpf(event.target.value.replace(/\D/g, '').slice(0, 11))} /></label><label className="block text-sm font-medium">PIN da turma (se solicitado)<input className={`${field} mt-1.5`} inputMode="numeric" autoComplete="off" maxLength={8} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))} /></label>{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}<button disabled={busy} className={primary}>{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}Começar avaliação</button></form>
        </>}

        {exam && !result && <>
          <div className="mb-6 border-b border-slate-200 pb-5 dark:border-white/10"><p className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">{exam.turma}</p><h1 className="mt-1 text-2xl font-bold">{exam.treinamento}</h1><p className="mt-2 text-sm text-slate-500">Participante: {exam.participante} · Nota mínima: {exam.notaMinimaAprovacao}% · {exam.questoes.length} questões</p></div>
          <form onSubmit={(event) => void finish(event)} className="space-y-5">{exam.questoes.map((question, index) => <fieldset key={question.id} className="rounded-xl border border-slate-200 p-4 dark:border-white/10 sm:p-5"><legend className="px-1 text-sm font-bold">Questão {index + 1}</legend><p className="text-sm leading-6">{question.enunciado}</p><div className="mt-4 space-y-2">{question.alternativas.map((option) => <label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${answers[question.id] === option.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5'}`}><input type="radio" name={question.id} checked={answers[question.id] === option.id} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))} className="mt-0.5 accent-blue-700" /><span className="font-semibold">{option.id}.</span><span>{option.texto}</span></label>)}</div></fieldset>)}
            {exam.selfieObrigatoria && <section className="rounded-xl border border-slate-200 p-4 dark:border-white/10"><h2 className="font-bold">Selfie de identificação</h2><p className="mt-1 text-xs text-slate-500">Esta empresa exige uma selfie para esta turma.</p>{selfie && <img src={selfie} alt="Prévia da selfie" className="mt-3 h-32 w-32 rounded-xl object-cover" />}<label className="mt-3 inline-flex cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold dark:border-white/10">{selfie ? 'Trocar foto' : 'Enviar foto'}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { void handleSelfie(event.target.files?.[0]); event.target.value = ''; }} /></label></section>}
            {exam.assinaturaColaboradorObrigatoria && <section className="rounded-xl border border-slate-200 p-4 dark:border-white/10"><h2 className="mb-3 font-bold">Confirmação do participante</h2><SignaturePadCanvas value={signature} onChange={setSignature} height={140} label="Assine na tela para registrar sua participação" /></section>}
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}<button disabled={busy} className={primary}>{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}Enviar respostas</button>
          </form>
        </>}

        {result && <div className="py-8 text-center"><span className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${result.status === 'APROVADO' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'}`}>{result.status === 'APROVADO' ? <CheckCircle2 className="h-7 w-7" /> : <XCircle className="h-7 w-7" />}</span><p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Resultado registrado</p><h1 className="mt-1 text-3xl font-bold">{result.status === 'APROVADO' ? 'Aprovado' : 'Não aprovado'}</h1><p className="mt-3 text-slate-600 dark:text-slate-300">Nota {result.notaPercentual}% · mínimo {result.notaMinimaAprovacao}% · {result.acertos} de {result.totalQuestoes} questões corretas.</p><p className="mt-2 text-xs text-slate-500">A empresa pode consultar o resultado no painel dela.</p><a href="/" className="mt-7 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"><ArrowLeft className="h-4 w-4" />Voltar ao site</a></div>}
      </section>
      <p className="mt-5 text-center text-xs text-slate-400">Suas respostas são corrigidas no servidor e registradas na empresa responsável pelo treinamento.</p>
    </div>
  </main>;
};
