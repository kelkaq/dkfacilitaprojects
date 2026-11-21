import React, { useEffect, useState } from 'react';
import { BadgeCheck, Building2, CalendarDays, Clock3, ShieldCheck } from 'lucide-react';

type Validation = { numeroCertificado: string; codigoNorma: string; treinamento: string; cargaHorariaHoras: number;
  dataRealizacao: string; dataValidade: string; status: string; emitidoEm: string; empresa: string; participante: string };

export const PostgresPublicCertificatePage: React.FC<{ code: string }> = ({ code }) => {
  const [certificate, setCertificate] = useState<Validation | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/public/certificates/${encodeURIComponent(code)}`, { headers: { Accept: 'application/json' }, signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as Validation | { error?: string } | null;
        if (!response.ok) throw new Error(body && 'error' in body && body.error ? body.error : 'Certificado não encontrado.');
        setCertificate(body as Validation);
      })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível validar o certificado.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [code]);

  const expired = certificate ? new Date(certificate.dataValidade).getTime() < Date.now() : false;
  const active = certificate?.status === 'EMITIDO' && !expired;
  const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-950/70';
  return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 dark:bg-[#070b14] dark:text-slate-100 sm:py-16">
    <div className="mx-auto max-w-2xl space-y-5">
      <header className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-700 text-sm font-black text-white">DK</span><div><p className="font-bold">Certifica Software - DK</p><p className="text-xs text-slate-500">Validação pública de certificado</p></div></header>
      {loading ? <section className={card}>Consultando o registro do certificado...</section> : error ? <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 dark:border-red-400/20 dark:bg-red-950/40 dark:text-red-200">{error}</section> : certificate && <>
        <section className={`${card} flex items-start gap-4`}><span className={`mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full ${active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'}`}><ShieldCheck className="h-6 w-6" /></span><div><h1 className="text-xl font-bold">{active ? 'Certificado válido' : expired ? 'Certificado vencido' : 'Certificado não ativo'}</h1><p className="mt-1 text-sm text-slate-500">Este registro confirma a emissão do documento na plataforma.</p></div></section>
        <section className={card}><div className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300"><BadgeCheck className="h-4 w-4" />{certificate.numeroCertificado}</div><h2 className="mt-4 text-2xl font-bold">{certificate.treinamento}</h2><p className="mt-1 text-sm text-slate-500">{certificate.codigoNorma} · {certificate.cargaHorariaHoras} horas</p><dl className="mt-6 grid gap-4 sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Participante</dt><dd className="mt-1 font-semibold">{certificate.participante}</dd></div><div><dt className="text-xs text-slate-500">Empresa emissora</dt><dd className="mt-1 flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4 text-slate-400" />{certificate.empresa}</dd></div><div><dt className="text-xs text-slate-500">Realização</dt><dd className="mt-1 flex items-center gap-2 font-semibold"><CalendarDays className="h-4 w-4 text-slate-400" />{new Date(certificate.dataRealizacao).toLocaleDateString('pt-BR')}</dd></div><div><dt className="text-xs text-slate-500">Validade</dt><dd className="mt-1 flex items-center gap-2 font-semibold"><Clock3 className="h-4 w-4 text-slate-400" />{new Date(certificate.dataValidade).toLocaleDateString('pt-BR')}</dd></div></dl><p className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-400 dark:border-white/10">Emitido em {new Date(certificate.emitidoEm).toLocaleString('pt-BR')}. CPF e assinaturas não são exibidos nesta consulta pública.</p></section>
      </>}
      <a href="/" className="inline-flex rounded-lg px-2 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-white/5">Voltar ao site</a>
    </div>
  </main>;
};
