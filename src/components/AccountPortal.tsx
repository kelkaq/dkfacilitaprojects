import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, ImageUp, LockKeyhole, Mail, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { ThemeToggleButton } from './ThemeProvider.tsx';

type PortalView = 'login' | 'reset' | 'invite' | 'team' | 'workspace';
type User = { id: string; nome: string; email: string; perfil: string; ativo: boolean };
type Invite = { id: string; email: string; perfil: string; expiraEm: string };
type Team = { users: User[]; invites: Invite[]; limiteUsuarios: number };
type Access = { permitido: boolean; motivo?: string; status?: string; plano?: { nome: string };
  limites?: { usuariosAtuais: number; limiteUsuarios: number } };
type SignerType = 'COLABORADOR' | 'RESPONSAVEL_TECNICO' | 'INSTRUTOR' | 'EMPRESA' | 'PERSONALIZADO';
type CertificateSigner = { tipo: SignerType; rotulo: string; obrigatoria: boolean; forma: 'DIGITAL' | 'FISICA'; nomeSignatario: string };
type CertificateTemplate = { id: string; slug: string; nome: string; descricao: string; categoria: string; previewCssToken: string };
type TenantSettings = { tipoDocumento: 'PF' | 'PJ'; documento: string; razaoSocial: string; nomeFantasia: string | null;
  emailFinanceiro: string; whatsapp: string; endereco: string | null; cidade: string | null; uf: string | null;
  corPrimaria: string; corSecundaria: string; prefixoCertificado: string; modeloCertificadoId: string | null;
  assinaturasCertificado: CertificateSigner[]; onboardingConcluido: boolean; temLogo: boolean; editavel: boolean;
  templates: CertificateTemplate[] };

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
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoVersion, setLogoVersion] = useState(Date.now());
  const token = new URLSearchParams(window.location.search).get('token') ?? '';

  const loadTeam = async () => {
    const [meResponse, accessResponse, teamResponse, settingsResponse] = await Promise.all([
      api('/api/auth/me'), api('/api/tenant/access'), api('/api/tenant/users'), api('/api/tenant/settings'),
    ]);
    if (meResponse.status === 401) { window.location.assign('/acesso'); return; }
    if (!meResponse.ok || !accessResponse.ok || !settingsResponse.ok || (!teamResponse.ok && teamResponse.status !== 403)) {
      setError('Não foi possível carregar a conta. Tente novamente.'); return;
    }
    const current = await meResponse.json() as User;
    setMe(current);
    setAccess(await accessResponse.json() as Access);
    setTeam(teamResponse.ok ? await teamResponse.json() as Team : { users: [], invites: [], limiteUsuarios: 0 });
    const tenantSettings = await settingsResponse.json() as TenantSettings;
    if (!tenantSettings.assinaturasCertificado.length) {
      tenantSettings.assinaturasCertificado = [{ tipo: 'COLABORADOR', rotulo: 'Colaborador', obrigatoria: true, forma: 'DIGITAL', nomeSignatario: '' }];
    }
    setSettings(tenantSettings);
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
        window.location.assign('/workspace');
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

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    setSavingSettings(true); setError(''); setNotice('');
    try {
      const response = await api('/api/tenant/settings', { method: 'PATCH', body: JSON.stringify({
        nomeFantasia: settings.nomeFantasia ?? '', emailFinanceiro: settings.emailFinanceiro,
        whatsapp: settings.whatsapp, endereco: settings.endereco ?? '', cidade: settings.cidade ?? '', uf: settings.uf ?? '',
        corPrimaria: settings.corPrimaria, corSecundaria: settings.corSecundaria,
        prefixoCertificado: settings.prefixoCertificado, modeloCertificadoId: settings.modeloCertificadoId,
        assinaturasCertificado: settings.assinaturasCertificado,
      }) });
      if (!response.ok) throw new Error(await message(response));
      const updated = await response.json() as Partial<TenantSettings>;
      setSettings({ ...settings, ...updated });
      setNotice('Configuração da empresa salva.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a configuração.'); }
    finally { setSavingSettings(false); }
  };

  const uploadLogo = async (file?: File) => {
    if (!file || !settings?.editavel) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1_572_864) {
      setError('Escolha um logo PNG, JPG ou WebP de até 1,5 MB.'); return;
    }
    setUploadingLogo(true); setError(''); setNotice('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Falha ao ler imagem.'));
        reader.onerror = () => reject(new Error('Falha ao ler imagem.'));
        reader.readAsDataURL(file);
      });
      const response = await api('/api/tenant/settings/logo', { method: 'POST', body: JSON.stringify({ dataUrl }) });
      if (!response.ok) throw new Error(await message(response));
      setSettings({ ...settings, temLogo: true }); setLogoVersion(Date.now()); setNotice('Logo da empresa atualizado.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o logo.'); }
    finally { setUploadingLogo(false); }
  };

  const updateSigner = (index: number, patch: Partial<CertificateSigner>) => setSettings((current) => current ? ({
    ...current,
    assinaturasCertificado: current.assinaturasCertificado.map((signer, signerIndex) => signerIndex === index ? { ...signer, ...patch } : signer),
  }) : current);

  const addSigner = () => setSettings((current) => current && current.assinaturasCertificado.length < 6 ? ({
    ...current,
    assinaturasCertificado: [...current.assinaturasCertificado, { tipo: 'PERSONALIZADO', rotulo: 'Responsável', obrigatoria: false, forma: 'DIGITAL', nomeSignatario: '' }],
  }) : current);

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
        <div className="flex items-center gap-3">{view === 'team' && <a href="/workspace" className="text-sm font-semibold text-blue-700 dark:text-blue-400">Abrir painel</a>}<ThemeToggleButton compact /></div>
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
          {settings && <section className="rounded-2xl border border-slate-200 dark:border-white/10 p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-lg font-bold">Identidade da empresa e certificados</h2><p className="mt-1 text-sm text-slate-500">Estas opções pertencem somente a esta empresa e podem ser alteradas pelo administrador.</p></div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${settings.onboardingConcluido ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'}`}>{settings.onboardingConcluido ? 'Configuração salva' : 'Configure seu primeiro acesso'}</span>
            </div>
            <div className="mb-5 grid gap-4 rounded-xl bg-slate-50 p-4 text-sm dark:bg-white/[0.04] sm:grid-cols-2">
              <div><span className="text-slate-500">Titular</span><p className="font-semibold">{settings.razaoSocial}</p></div>
              <div><span className="text-slate-500">Documento</span><p className="font-semibold">{settings.tipoDocumento} · {settings.documento}</p></div>
            </div>
            <div className="mb-6 flex flex-wrap items-center gap-4">
              {settings.temLogo ? <img src={`/api/tenant/settings/logo?v=${logoVersion}`} alt="Logo da empresa" className="h-20 w-32 rounded-xl border border-slate-200 bg-white object-contain p-2 dark:border-white/10" /> : <div className="grid h-20 w-32 place-items-center rounded-xl border border-dashed border-slate-300 text-xs text-slate-500 dark:border-white/20">Sem logo</div>}
              <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold dark:border-white/10 ${!settings.editavel || uploadingLogo ? 'pointer-events-none opacity-50' : ''}`}><ImageUp className="h-4 w-4" />{uploadingLogo ? 'Enviando...' : settings.temLogo ? 'Trocar logo' : 'Enviar logo'}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={!settings.editavel || uploadingLogo} onChange={(event) => { void uploadLogo(event.target.files?.[0]); event.target.value = ''; }} /></label>
              <p className="max-w-sm text-xs text-slate-500">PNG, JPG ou WebP · até 1,5 MB. O arquivo fica armazenado na área privada desta empresa.</p>
            </div>
            <form onSubmit={(event) => void saveSettings(event)} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">Nome fantasia<input className={`${field} mt-1`} maxLength={180} value={settings.nomeFantasia ?? ''} disabled={!settings.editavel} onChange={(event) => setSettings({ ...settings, nomeFantasia: event.target.value })} /></label>
                <label className="block text-sm font-medium">E-mail financeiro<input className={`${field} mt-1`} type="email" required maxLength={160} value={settings.emailFinanceiro} disabled={!settings.editavel} onChange={(event) => setSettings({ ...settings, emailFinanceiro: event.target.value })} /></label>
                <label className="block text-sm font-medium">WhatsApp<input className={`${field} mt-1`} inputMode="tel" required value={settings.whatsapp} disabled={!settings.editavel} onChange={(event) => setSettings({ ...settings, whatsapp: event.target.value })} /></label>
                <label className="block text-sm font-medium">Prefixo dos certificados<input className={`${field} mt-1 uppercase`} required minLength={2} maxLength={12} value={settings.prefixoCertificado} disabled={!settings.editavel} onChange={(event) => setSettings({ ...settings, prefixoCertificado: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} /></label>
                <label className="block text-sm font-medium">Endereço<input className={`${field} mt-1`} maxLength={240} value={settings.endereco ?? ''} disabled={!settings.editavel} onChange={(event) => setSettings({ ...settings, endereco: event.target.value })} /></label>
                <div className="grid grid-cols-[1fr_90px] gap-3"><label className="block text-sm font-medium">Cidade<input className={`${field} mt-1`} maxLength={120} value={settings.cidade ?? ''} disabled={!settings.editavel} onChange={(event) => setSettings({ ...settings, cidade: event.target.value })} /></label><label className="block text-sm font-medium">UF<input className={`${field} mt-1 uppercase`} maxLength={2} value={settings.uf ?? ''} disabled={!settings.editavel} onChange={(event) => setSettings({ ...settings, uf: event.target.value.toUpperCase().slice(0, 2) })} /></label></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-medium dark:border-white/10">Cor principal<input type="color" value={settings.corPrimaria} disabled={!settings.editavel} onChange={(event) => setSettings({ ...settings, corPrimaria: event.target.value })} className="ml-auto h-9 w-14 cursor-pointer rounded border-0 bg-transparent disabled:cursor-not-allowed" /></label>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-medium dark:border-white/10">Cor secundária<input type="color" value={settings.corSecundaria} disabled={!settings.editavel} onChange={(event) => setSettings({ ...settings, corSecundaria: event.target.value })} className="ml-auto h-9 w-14 cursor-pointer rounded border-0 bg-transparent disabled:cursor-not-allowed" /></label>
              </div>
              <label className="block text-sm font-medium">Modelo de certificado<select className={`${field} mt-1`} value={settings.modeloCertificadoId ?? ''} disabled={!settings.editavel} onChange={(event) => setSettings({ ...settings, modeloCertificadoId: event.target.value || null })}><option value="">Escolher depois</option>{settings.templates.map((template) => <option key={template.id} value={template.id}>{template.nome} · {template.categoria}</option>)}</select></label>
              <section className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Assinaturas que aparecem no certificado</h3><p className="mt-1 text-xs text-slate-500">Escolha os papéis desta empresa. Cada cliente define sua própria combinação.</p></div><button type="button" onClick={addSigner} disabled={!settings.editavel || settings.assinaturasCertificado.length >= 6} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-white/10"><Plus className="h-4 w-4" /> Adicionar campo</button></div>
                <div className="space-y-3">{settings.assinaturasCertificado.map((signer, index) => <div key={`${signer.tipo}-${index}`} className="grid gap-3 rounded-xl bg-slate-50 p-3 dark:bg-white/[0.04] sm:grid-cols-2">
                  <label className="block text-xs font-semibold">Papel<select className={`${field} mt-1`} value={signer.tipo} disabled={!settings.editavel} onChange={(event) => { const tipo = event.target.value as SignerType; const defaultLabel: Record<SignerType, string> = { COLABORADOR: 'Colaborador', RESPONSAVEL_TECNICO: 'Responsável técnico', INSTRUTOR: 'Instrutor', EMPRESA: 'Empresa', PERSONALIZADO: 'Assinante' }; updateSigner(index, { tipo, rotulo: defaultLabel[tipo] }); }}><option value="COLABORADOR">Colaborador</option><option value="RESPONSAVEL_TECNICO">Responsável técnico</option><option value="INSTRUTOR">Instrutor / TST</option><option value="EMPRESA">Empresa</option><option value="PERSONALIZADO">Outro papel</option></select></label>
                  <label className="block text-xs font-semibold">Rótulo exibido<input className={`${field} mt-1`} required minLength={2} maxLength={80} value={signer.rotulo} disabled={!settings.editavel} onChange={(event) => updateSigner(index, { rotulo: event.target.value })} /></label>
                  <label className="block text-xs font-semibold">Forma<select className={`${field} mt-1`} value={signer.forma ?? 'DIGITAL'} disabled={!settings.editavel} onChange={(event) => updateSigner(index, { forma: event.target.value as 'DIGITAL' | 'FISICA' })}><option value="DIGITAL">Assinatura digital</option><option value="FISICA">Linha para assinatura física</option></select></label>
                  {(signer.tipo === 'EMPRESA' || signer.tipo === 'PERSONALIZADO') && <label className="block text-xs font-semibold">Nome do signatário<input className={`${field} mt-1`} maxLength={120} value={signer.nomeSignatario ?? ''} disabled={!settings.editavel} onChange={(event) => updateSigner(index, { nomeSignatario: event.target.value })} /></label>}
                  <label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={signer.obrigatoria} disabled={!settings.editavel} onChange={(event) => updateSigner(index, { obrigatoria: event.target.checked })} />Obrigatória</label>
                  <button type="button" aria-label="Remover campo de assinatura" disabled={!settings.editavel || settings.assinaturasCertificado.length <= 1} onClick={() => setSettings({ ...settings, assinaturasCertificado: settings.assinaturasCertificado.filter((_item, itemIndex) => itemIndex !== index) })} className="justify-self-start rounded p-2 text-red-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                </div>)}</div>
              </section>
              {settings.editavel && <button type="submit" disabled={savingSettings} className={`${primary} sm:w-auto sm:px-6`}>{savingSettings ? 'Salvando...' : 'Salvar configuração da empresa'}</button>}
            </form>
          </section>}
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
