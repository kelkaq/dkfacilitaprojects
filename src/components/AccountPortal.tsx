import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, LockKeyhole, Mail, ShieldCheck, Users } from 'lucide-react';
import { ThemeToggleButton } from './ThemeProvider.tsx';

type PortalView = 'login' | 'reset' | 'invite' | 'team';
type User = { id: string; nome: string; email: string; perfil: string; ativo: boolean };
type Invite = { id: string; email: string; perfil: string; expiraEm: string };
type Team = { users: User[]; invites: Invite[]; limiteUsuarios: number };
type Access = { permitido: boolean; motivo?: string; status?: string; plano?: { nome: string };
  limites?: { usuariosAtuais: number; limiteUsuarios: number } };

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, { credentials: 'same-origin', ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
}

async function message(response: Response): Promise<string> {
  try { return ((await response.json()) as { error?: string }).error ?? 'Não foi possível concluir.'; }
  catch { return 'Não foi possível concluir.'; }
}

const field = 'w-full rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-slate-950 px-4 py-3 text-sm outline-none focus:border-blue-500';
const primary = 'w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer';

export const AccountPortal: React.FC<{ view: PortalView }> = ({ view }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('RT');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [me, setMe] = useState<User | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const token = new URLSearchParams(window.location.search).get('token') ?? '';

  const loadTeam = async () => {
    const [meResponse, accessResponse, teamResponse] = await Promise.all([
      api('/api/auth/me'), api('/api/tenant/access'), api('/api/tenant/users'),
    ]);
    if (meResponse.status === 401) { window.location.assign('/acesso'); return; }
    if (!meResponse.ok || !accessResponse.ok || (!teamResponse.ok && teamResponse.status !== 403)) {
      setError('Não foi possível carregar a conta. Tente novamente.'); return;
    }
    const current = await meResponse.json() as User;
    setMe(current);
    setAccess(await accessResponse.json() as Access);
    setTeam(teamResponse.ok ? await teamResponse.json() as Team : { users: [], invites: [], limiteUsuarios: 0 });
  };

  useEffect(() => { if (view === 'team') void loadTeam(); }, [view]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      if (view === 'login') {
        const response = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        if (!response.ok) throw new Error(await message(response));
        const result = await response.json() as { authenticated?: boolean };
        if (!result.authenticated) throw new Error('O acesso pelo navegador ainda não está configurado neste ambiente.');
        window.location.assign('/minha-conta');
      } else if (view === 'reset') {
        if (token) {
          const response = await api('/api/auth/password-reset/confirm', { method: 'POST',
            body: JSON.stringify({ token, password }) });
          if (!response.ok) throw new Error(await message(response));
          setNotice('Senha alterada. Você já pode entrar.');
        } else {
          const response = await api('/api/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ email }) });
          if (!response.ok) throw new Error(await message(response));
          setNotice('Se houver uma conta com este e-mail, enviaremos um link para redefinir a senha.');
        }
      } else if (view === 'invite') {
        const response = await api('/api/auth/invitations/accept', { method: 'POST',
          body: JSON.stringify({ token, nome: name, password }) });
        if (!response.ok) throw new Error(await message(response));
        setNotice('Sua senha foi criada. Você já pode entrar.');
      } else {
        const response = await api('/api/tenant/users/invitations', { method: 'POST',
          body: JSON.stringify({ email, perfil: role }) });
        if (!response.ok) throw new Error(await message(response));
        setEmail(''); setNotice('Convite enviado.'); await loadTeam();
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível concluir.'); }
    finally { setBusy(false); }
  };

  const changeUser = async (user: User) => {
    setBusy(true); setError(''); setNotice('');
    const response = await api(`/api/tenant/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ ativo: !user.ativo }) });
    if (response.ok) { setNotice(user.ativo ? 'Acesso desativado.' : 'Acesso reativado.'); await loadTeam(); }
    else setError(await message(response));
    setBusy(false);
  };

  const revokeInvite = async (invite: Invite) => {
    setBusy(true); setError(''); setNotice('');
    const response = await api(`/api/tenant/users/invitations/${invite.id}`, { method: 'DELETE' });
    if (response.ok) { setNotice('Convite revogado.'); await loadTeam(); }
    else setError(await message(response));
    setBusy(false);
  };

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.assign('/acesso');
  };

  const title = view === 'login' ? 'Entrar na sua conta' : view === 'reset' ?
    (token ? 'Criar nova senha' : 'Recuperar acesso') : view === 'invite' ? 'Aceitar convite' : 'Minha conta e equipe';

  return <div className="min-h-screen dk-ambient-canvas text-slate-900 dark:text-slate-100">
    <header className="border-b border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-950/80 px-6 py-4">
      <div className="mx-auto max-w-5xl flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-5 w-5 text-blue-600" /> Certifica Software - DK</a>
        <ThemeToggleButton compact />
      </div>
    </header>
    <main className={`mx-auto px-5 py-12 ${view === 'team' ? 'max-w-5xl' : 'max-w-md'}`}>
      {view !== 'team' && <a href={view === 'login' ? '/' : '/acesso'} className="mb-6 inline-flex items-center gap-2 text-sm text-blue-700 dark:text-blue-400">
        <ArrowLeft className="h-4 w-4" /> Voltar</a>}
      <div className="dk-glass-card rounded-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-bold">{title}</h1>
        {view === 'login' && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Use o e-mail e a senha da sua conta.</p>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
        {notice && <p role="status" className="mt-4 flex gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 p-3 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</p>}
        {view === 'team' ? <div className="mt-6 space-y-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="font-semibold">{me?.nome ?? 'Carregando...'}</p><p className="text-sm text-slate-500">{me?.email}</p></div>
            <button type="button" onClick={() => void logout()} className="text-sm font-semibold text-blue-700 dark:text-blue-400 cursor-pointer">Sair</button>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-white/10 p-4">
            <p className="text-sm font-semibold">{access?.plano?.nome ?? 'Plano indisponível'} · {access?.status ?? 'Verificando'}</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{access?.permitido ?
              `${access.limites?.usuariosAtuais ?? 0} de ${access.limites?.limiteUsuarios ?? 0} usuários ativos` :
              access?.motivo ?? 'Acesso em verificação.'}</p>
          </div>
          {me?.perfil === 'ADMIN_EMPRESA' && <section><h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Users className="h-5 w-5" /> Usuários</h2>
            <div className="space-y-2">{team?.users.map((user) => <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-white/10 p-3 text-sm">
              <div><strong>{user.nome}</strong><p className="text-slate-500">{user.email} · {user.perfil} · {user.ativo ? 'Ativo' : 'Inativo'}</p></div>
              {user.id !== me?.id && <button type="button" disabled={busy} onClick={() => void changeUser(user)} className="font-semibold text-blue-700 dark:text-blue-400 cursor-pointer disabled:opacity-50">{user.ativo ? 'Desativar' : 'Reativar'}</button>}
            </div>)}</div>
          </section>}
          {me?.perfil === 'ADMIN_EMPRESA' && <section><h2 className="mb-3 text-lg font-bold">Convites pendentes</h2>
            {team?.invites.length ? team.invites.map((invite) => <div key={invite.id} className="flex justify-between gap-3 rounded-xl border border-slate-200 dark:border-white/10 p-3 text-sm">
              <span>{invite.email} · {invite.perfil}</span><button type="button" disabled={busy} onClick={() => void revokeInvite(invite)} className="font-semibold text-blue-700 dark:text-blue-400 cursor-pointer">Revogar</button>
            </div>) : <p className="text-sm text-slate-500">Nenhum convite pendente.</p>}
          </section>}
          {me?.perfil === 'ADMIN_EMPRESA' && <form onSubmit={(event) => void submit(event)} className="space-y-3"><h2 className="text-lg font-bold">Convidar usuário</h2>
            <input className={field} type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-mail do usuário" aria-label="E-mail do usuário" />
            <select className={field} value={role} onChange={(event) => setRole(event.target.value)} aria-label="Perfil do usuário">
              <option value="RT">Responsável técnico</option><option value="INSTRUTOR_TST">Instrutor ou TST</option><option value="ADMIN_EMPRESA">Administrador</option>
            </select><button type="submit" disabled={busy || !access?.permitido} className={primary}>Enviar convite</button>
          </form>}
        </div> : <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
          {view === 'invite' && <label className="block text-sm font-medium">Seu nome<input className={`${field} mt-1`} required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>}
          {(view === 'login' || (view === 'reset' && !token)) && <label className="block text-sm font-medium">E-mail<input className={`${field} mt-1`} type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>}
          {(view === 'login' || (view === 'reset' && token) || view === 'invite') && <label className="block text-sm font-medium">{view === 'login' ? 'Senha' : 'Nova senha'}<input className={`${field} mt-1`} type="password" required minLength={view === 'login' ? 1 : 12} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={view === 'login' ? 'current-password' : 'new-password'} /></label>}
          <button type="submit" disabled={busy || (view === 'invite' && !token)} className={primary}>{busy ? 'Aguarde...' : view === 'login' ? 'Entrar' : view === 'reset' ? (token ? 'Salvar nova senha' : 'Enviar link') : 'Criar meu acesso'}</button>
          {view === 'login' && <a href="/resetar-senha" className="flex items-center justify-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-400"><LockKeyhole className="h-4 w-4" /> Esqueci minha senha</a>}
          {(view === 'reset' || view === 'invite') && notice && <a href="/acesso" className="flex items-center justify-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-400"><Mail className="h-4 w-4" /> Ir para o login</a>}
        </form>}
      </div>
    </main>
  </div>;
};
