import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Check,
  CheckCircle2,
  Crown,
  Eye,
  EyeOff,
  FileBadge,
  HardHat,
  Info,
  MapPin,
  Palette,
  PenTool,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
} from 'lucide-react';
import type { GlobalCatalogSnapshot } from '../../services/catalogService.ts';
import type {
  AssinaturaDigitalDoc,
  EffectivePlanLimits,
  EmpresaDoc,
  ObraDoc,
} from '../../types/domain.ts';
import {
  createObra,
  deleteAssinaturaDigital,
  deleteObra,
  saveAssinaturaDigital,
  updateEmpresaIdentidade,
} from '../../services/operationalCrudService.ts';
import {
  detectDocumentKind,
  EMPTY_ADDRESS,
  formatDocumentWithLabel,
  formatStructuredAddressLine,
  maskPhone,
  type StructuredAddress,
} from '../../lib/brazilAddress.ts';
import { ViaCepAddressFields } from '../ViaCepAddressFields.tsx';
import { CertificateTemplatePreview } from '../CertificateTemplatePreview.tsx';
import { SignaturePadCanvas } from './SignaturePadCanvas.tsx';

export type ConfiguracoesSubTab = 'dados' | 'modelos' | 'responsaveis';

interface ConfiguracoesCertificadosModuleProps {
  empresa: EmpresaDoc;
  limits: EffectivePlanLimits;
  catalog: GlobalCatalogSnapshot | null;
  assinaturas: AssinaturaDigitalDoc[];
  obras: ObraDoc[];
  initialSubTab?: ConfiguracoesSubTab;
  onSubTabConsumed?: () => void;
  onEmpresaUpdated: (updated: EmpresaDoc) => void;
  onRefresh: () => Promise<void>;
  onGoPlano: () => void;
}

const BRAND_SWATCHES = ['#0F172A', '#1D4ED8', '#0F766E', '#B45309', '#991B1B', '#334155'];

export const ConfiguracoesCertificadosModule: React.FC<
  ConfiguracoesCertificadosModuleProps
> = ({
  empresa,
  limits,
  catalog,
  assinaturas,
  obras,
  initialSubTab,
  onSubTabConsumed,
  onEmpresaUpdated,
  onRefresh,
  onGoPlano,
}) => {
  const [subTab, setSubTab] = useState<ConfiguracoesSubTab>(initialSubTab || 'dados');

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
      onSubTabConsumed?.();
    }
  }, [initialSubTab, onSubTabConsumed]);

  const docKind = detectDocumentKind(empresa.cnpj, empresa.tipoPessoa);
  const formattedDoc = formatDocumentWithLabel(empresa.cnpj, empresa.tipoPessoa);

  // Aba 1: Dados Impressos nos Certificados (separados do Titular/Faturamento DK Facilita)
  const [certNomeExibicao, setCertNomeExibicao] = useState(
    empresa.certificadoNomeExibicao || empresa.nomeFantasia || empresa.razaoSocial || ''
  );
  const [exibirDocumento, setExibirDocumento] = useState(
    empresa.certificadoExibirDocumento !== false
  );
  const [logoUrl, setLogoUrl] = useState<string | null>(empresa.logoUrl || null);
  const [corPrimaria, setCorPrimaria] = useState(empresa.corPrimaria || '#0F172A');
  const [prefixoCertificado, setPrefixoCertificado] = useState(
    empresa.prefixoCertificado || 'CERT'
  );
  const [telefoneRodape, setTelefoneRodape] = useState(
    empresa.certificadoTelefoneRodape ?? empresa.whatsapp ?? ''
  );
  const [emailRodape, setEmailRodape] = useState(
    empresa.certificadoEmailRodape ?? empresa.emailFinanceiro ?? ''
  );
  const [addr, setAddr] = useState<StructuredAddress>({
    cep: empresa.cep || '',
    logradouro: empresa.logradouro || '',
    numero: empresa.numero || '',
    complemento: empresa.complemento || '',
    bairro: empresa.bairro || '',
    cidade: empresa.cidade || '',
    uf: empresa.uf || '',
  });

  // Aba 2: Modelo padrão
  const [selectedModeloId, setSelectedModeloId] = useState(
    empresa.modeloCertificadoId ||
      catalog?.modelos[0]?.id ||
      'modelo_classico_institucional'
  );

  // Sync quando trocar de empresa
  useEffect(() => {
    setCertNomeExibicao(
      empresa.certificadoNomeExibicao || empresa.nomeFantasia || empresa.razaoSocial || ''
    );
    setExibirDocumento(empresa.certificadoExibirDocumento !== false);
    setLogoUrl(empresa.logoUrl || null);
    setCorPrimaria(empresa.corPrimaria || '#0F172A');
    setPrefixoCertificado(empresa.prefixoCertificado || 'CERT');
    setTelefoneRodape(empresa.certificadoTelefoneRodape ?? empresa.whatsapp ?? '');
    setEmailRodape(empresa.certificadoEmailRodape ?? empresa.emailFinanceiro ?? '');
    setAddr({
      cep: empresa.cep || '',
      logradouro: empresa.logradouro || '',
      numero: empresa.numero || '',
      complemento: empresa.complemento || '',
      bairro: empresa.bairro || '',
      cidade: empresa.cidade || '',
      uf: empresa.uf || '',
    });
    setSelectedModeloId(
      empresa.modeloCertificadoId ||
        catalog?.modelos[0]?.id ||
        'modelo_classico_institucional'
    );
  }, [empresa, catalog?.modelos]);

  // Aba 3: Responsáveis & Assinaturas + Contratos/Obras
  const [sigTipo, setSigTipo] = useState<'INSTRUTOR' | 'RT'>('INSTRUTOR');
  const [sigNome, setSigNome] = useState('');
  const [sigRegistro, setSigRegistro] = useState('');
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null);
  const [sigPadKey, setSigPadKey] = useState(0);

  const [obraCodigo, setObraCodigo] = useState('');
  const [obraNome, setObraNome] = useState('');
  const [obraCliente, setObraCliente] = useState('');
  const [obraAddr, setObraAddr] = useState<StructuredAddress>({ ...EMPTY_ADDRESS });

  const [saving, setSaving] = useState(false);
  const [savingModeloId, setSavingModeloId] = useState<string | null>(null);
  const [savingSig, setSavingSig] = useState(false);
  const [savingObra, setSavingObra] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const enderecoFormatado = useMemo(() => {
    const computed = formatStructuredAddressLine(addr);
    return computed || empresa.endereco || '';
  }, [addr, empresa.endereco]);

  const activeModelo = useMemo(() => {
    return (
      catalog?.modelos.find((m) => m.id === selectedModeloId) ??
      catalog?.modelos[0] ??
      null
    );
  }, [catalog?.modelos, selectedModeloId]);

  const previewEmpresaObj = useMemo(
    () => ({
      razaoSocial: certNomeExibicao.trim() || empresa.razaoSocial,
      cnpj: empresa.cnpj,
      tipoPessoa: (docKind === 'CPF' ? 'PF' : 'PJ') as 'PF' | 'PJ',
      exibirDocumento,
      endereco: enderecoFormatado,
      logoUrl,
      corPrimaria,
      prefixoCertificado: prefixoCertificado.trim().toUpperCase() || 'CERT',
      telefoneRodape: telefoneRodape.trim(),
      emailRodape: emailRodape.trim(),
    }),
    [
      certNomeExibicao,
      empresa.razaoSocial,
      empresa.cnpj,
      docKind,
      exibirDocumento,
      enderecoFormatado,
      logoUrl,
      corPrimaria,
      prefixoCertificado,
      telefoneRodape,
      emailRodape,
    ]
  );

  const instrutores = useMemo(
    () => assinaturas.filter((a) => a.tipo === 'INSTRUTOR' && a.ativa),
    [assinaturas]
  );
  const rts = useMemo(
    () => assinaturas.filter((a) => a.tipo === 'RT' && a.ativa),
    [assinaturas]
  );

  const hasModeloProprio =
    Boolean(empresa.modeloProprioUrl) ||
    (empresa.adicionaisAtivos ?? []).includes('modelo-proprio');

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 140 * 1024) {
      setFeedback({
        type: 'err',
        text: 'Selecione um arquivo de logo de até 140 KB (PNG, JPG ou SVG).',
      });
      return;
    }
    setFeedback(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveDadosCertificado = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const cleanPrefix =
        prefixoCertificado.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'CERT';
      const formattedAddr = formatStructuredAddressLine(addr);
      const patch = {
        certificadoNomeExibicao: certNomeExibicao.trim() || empresa.razaoSocial,
        nomeFantasia: certNomeExibicao.trim() || empresa.nomeFantasia || empresa.razaoSocial,
        certificadoExibirDocumento: exibirDocumento,
        certificadoTelefoneRodape: telefoneRodape.trim() || null,
        certificadoEmailRodape: emailRodape.trim() || null,
        logoUrl,
        corPrimaria,
        prefixoCertificado: cleanPrefix,
        cep: addr.cep.trim() || null,
        logradouro: addr.logradouro.trim() || null,
        numero: addr.numero.trim() || null,
        complemento: addr.complemento.trim() || null,
        bairro: addr.bairro.trim() || null,
        cidade: addr.cidade.trim() || null,
        uf: addr.uf.trim().toUpperCase() || null,
        endereco: formattedAddr || null,
        onboardingConcluido: true,
      };
      await updateEmpresaIdentidade(empresa.id, patch);
      onEmpresaUpdated({
        ...empresa,
        ...patch,
      });
      setFeedback({
        type: 'ok',
        text: 'Dados para certificados atualizados com sucesso! Todos os novos certificados já usarão esta identidade.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'Erro ao salvar os dados de certificados.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSelectModelo = async (modeloId: string) => {
    setSelectedModeloId(modeloId);
    setSavingModeloId(modeloId);
    setFeedback(null);
    try {
      await updateEmpresaIdentidade(empresa.id, {
        modeloCertificadoId: modeloId,
        onboardingConcluido: true,
      });
      onEmpresaUpdated({
        ...empresa,
        modeloCertificadoId: modeloId,
        onboardingConcluido: true,
      });
      setFeedback({
        type: 'ok',
        text: 'Modelo padrão de certificado atualizado e aplicado imediatamente.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao atualizar o modelo.',
      });
    } finally {
      setSavingModeloId(null);
    }
  };

  const handleCreateAssinatura = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sigNome.trim()) {
      setFeedback({ type: 'err', text: 'Informe o nome completo do responsável.' });
      return;
    }
    if (!sigDataUrl) {
      setFeedback({
        type: 'err',
        text: 'Desenhe a assinatura digital no quadro antes de salvar.',
      });
      return;
    }
    setSavingSig(true);
    setFeedback(null);
    try {
      await saveAssinaturaDigital(empresa, {
        tipo: sigTipo,
        nomeSignatario: sigNome.trim(),
        registro: sigRegistro.trim() || undefined,
        imagemDataUrl: sigDataUrl,
      });
      setSigNome('');
      setSigRegistro('');
      setSigDataUrl(null);
      setSigPadKey((k) => k + 1);
      await onRefresh();
      setFeedback({
        type: 'ok',
        text:
          sigTipo === 'INSTRUTOR'
            ? 'Instrutor / TST cadastrado com assinatura digital! Já está disponível na lista ao abrir novas turmas.'
            : 'Responsável Técnico (RT) cadastrado com assinatura digital! Já está disponível na lista ao abrir novas turmas.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao salvar assinatura.',
      });
    } finally {
      setSavingSig(false);
    }
  };

  const handleDeleteAssinatura = async (sigId: string) => {
    setFeedback(null);
    try {
      await deleteAssinaturaDigital(empresa.id, sigId);
      await onRefresh();
      setFeedback({ type: 'ok', text: 'Cadastro de assinatura removido.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao remover assinatura.',
      });
    }
  };

  const handleCreateObra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!obraCodigo.trim() || !obraNome.trim()) {
      setFeedback({ type: 'err', text: 'Informe o código e o nome da obra / contrato.' });
      return;
    }
    setSavingObra(true);
    setFeedback(null);
    try {
      const localizacao = formatStructuredAddressLine(obraAddr);
      await createObra(empresa, limits, {
        codigo: obraCodigo,
        nome: obraNome,
        clienteFinal: obraCliente,
        localizacao,
        cep: obraAddr.cep,
        logradouro: obraAddr.logradouro,
        numero: obraAddr.numero,
        complemento: obraAddr.complemento,
        bairro: obraAddr.bairro,
        cidade: obraAddr.cidade,
        uf: obraAddr.uf,
      });
      setObraCodigo('');
      setObraNome('');
      setObraCliente('');
      setObraAddr({ ...EMPTY_ADDRESS });
      await onRefresh();
      setFeedback({ type: 'ok', text: 'Contrato / Obra cadastrado com sucesso!' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao cadastrar obra.',
      });
    } finally {
      setSavingObra(false);
    }
  };

  const handleDeleteObra = async (obraId: string) => {
    setFeedback(null);
    try {
      await deleteObra(empresa.id, obraId);
      await onRefresh();
      setFeedback({ type: 'ok', text: 'Contrato / Obra removido.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao remover obra.',
      });
    }
  };

  const inputCls =
    'w-full px-3.5 py-2 text-sm bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500';

  return (
    <div className="space-y-6">
      {/* Cabeçalho e Abas Fixas */}
      <div className="dk-glass-card rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Configurações &amp; Certificados
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Personalize a identidade que sai impressa nos certificados, troque o modelo visual e
            gerencie Instrutores, RTs e Contratos/Obras.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 bg-slate-100 dark:bg-white/[0.04] p-1.5 rounded-xl border border-slate-200 dark:border-white/10">
          {(
            [
              { id: 'dados', label: 'Dados para Certificados', icon: Palette },
              { id: 'modelos', label: 'Modelos de Certificado', icon: FileBadge },
              { id: 'responsaveis', label: 'Responsáveis & Assinaturas', icon: PenTool },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSubTab(tab.id);
                  setFeedback(null);
                }}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  active
                    ? 'bg-[#1D4ED8] text-white shadow-md shadow-blue-600/25'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl px-4 py-3 text-xs font-medium border flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-900 dark:text-red-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* ===================================================================== */}
      {/* ABA 1 — DADOS PARA CERTIFICADOS                                       */}
      {/* ===================================================================== */}
      {subTab === 'dados' && (
        <div className="space-y-6">
          {/* Bloco Separado: Dados do Titular / Faturamento na DK Facilita */}
          <div className="dk-glass-card rounded-2xl p-5 border-l-4 border-l-blue-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Titular &amp; Faturamento da Conta (DK Facilita)
                </h3>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                <Info className="w-3.5 h-3.5" />
                Usados exclusivamente para sua assinatura e cobrança
              </span>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="bg-slate-50 dark:bg-white/[0.03] rounded-xl p-3 border border-slate-200/80 dark:border-white/10">
                <dt className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {docKind === 'CPF' ? 'Nome do Titular' : 'Razão Social'}
                </dt>
                <dd className="mt-1 font-semibold text-slate-900 dark:text-white truncate">
                  {empresa.razaoSocial}
                </dd>
              </div>
              <div className="bg-slate-50 dark:bg-white/[0.03] rounded-xl p-3 border border-slate-200/80 dark:border-white/10">
                <dt className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {docKind === 'CPF' ? 'CPF do Titular' : 'CNPJ da Empresa'}
                </dt>
                <dd className="mt-1 font-mono font-semibold text-slate-900 dark:text-white">
                  {empresa.cnpj}
                </dd>
              </div>
              <div className="bg-slate-50 dark:bg-white/[0.03] rounded-xl p-3 border border-slate-200/80 dark:border-white/10">
                <dt className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  E-mail Financeiro
                </dt>
                <dd className="mt-1 font-medium text-slate-900 dark:text-white truncate">
                  {empresa.emailFinanceiro}
                </dd>
              </div>
              <div className="bg-slate-50 dark:bg-white/[0.03] rounded-xl p-3 border border-slate-200/80 dark:border-white/10">
                <dt className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  WhatsApp da Conta
                </dt>
                <dd className="mt-1 font-mono font-medium text-slate-900 dark:text-white">
                  {empresa.whatsapp}
                </dd>
              </div>
            </dl>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Formulário Editável dos Certificados */}
            <form
              onSubmit={handleSaveDadosCertificado}
              className="xl:col-span-7 dk-glass-card rounded-2xl p-6 space-y-6"
            >
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  O que aparece impresso nos seus Certificados e Dossiês
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Personalize livremente o nome comercial/profissional, logotipo, cor, prefixo,
                  contatos de rodapé e endereço.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nome Fantasia ou Nome Profissional nos Certificados *
                  </label>
                  <input
                    required
                    value={certNomeExibicao}
                    onChange={(e) => setCertNomeExibicao(e.target.value)}
                    placeholder="Ex.: Engenharia Segura Treinamentos ou Carlos Silva — TST"
                    className={inputCls}
                  />
                </div>

                {/* Toggle Exibir/Ocultar CPF ou CNPJ */}
                <div className="sm:col-span-2">
                  <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] cursor-pointer">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {exibirDocumento ? (
                        <Eye className="w-4 h-4 text-blue-500 shrink-0" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">
                          Exibir {docKind} ({empresa.cnpj}) no cabeçalho dos certificados
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {exibirDocumento
                            ? `Será exibido como "${formattedDoc}".`
                            : `O ${docKind} ficará oculto nos certificados impressos.`}
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={exibirDocumento}
                      onChange={(e) => setExibirDocumento(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 accent-blue-600 shrink-0"
                    />
                  </label>
                </div>

                {/* Upload Logo */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Logotipo Próprio (PNG, JPG ou SVG até 140 KB)
                  </label>
                  <div className="border border-dashed border-slate-300 dark:border-white/15 rounded-xl p-4 bg-slate-50 dark:bg-white/[0.02] flex flex-col items-center justify-center gap-2.5 text-center min-h-[126px]">
                    {logoUrl ? (
                      <>
                        <img
                          src={logoUrl}
                          alt="Logotipo configurado"
                          className="max-h-14 max-w-[180px] object-contain bg-white rounded-lg p-1.5 border border-slate-200"
                        />
                        <div className="flex items-center gap-3">
                          <label className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
                            Trocar logo
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/svg+xml,image/webp"
                              onChange={handleLogoUpload}
                              className="hidden"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => setLogoUrl(null)}
                            className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            Remover
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 text-slate-400" />
                        <label className="px-3 py-1.5 rounded-lg bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/15 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
                          Enviar Logotipo
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/svg+xml,image/webp"
                            onChange={handleLogoUpload}
                            className="hidden"
                          />
                        </label>
                      </>
                    )}
                  </div>
                </div>

                {/* Cor & Prefixo */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Cor Principal dos Certificados
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {BRAND_SWATCHES.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => setCorPrimaria(hex)}
                          className={`w-7 h-7 rounded-lg border-2 cursor-pointer transition-transform ${
                            corPrimaria.toLowerCase() === hex.toLowerCase()
                              ? 'border-blue-500 scale-110'
                              : 'border-white/20'
                          }`}
                          style={{ backgroundColor: hex }}
                          aria-label={`Cor ${hex}`}
                        />
                      ))}
                      <input
                        type="color"
                        value={corPrimaria}
                        onChange={(e) => setCorPrimaria(e.target.value)}
                        className="w-7 h-7 rounded border border-slate-300 dark:border-white/20 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Prefixo da Numeração
                    </label>
                    <input
                      value={prefixoCertificado}
                      maxLength={10}
                      onChange={(e) =>
                        setPrefixoCertificado(
                          e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
                        )
                      }
                      className={`${inputCls} font-mono`}
                    />
                    <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                      Ex.: {prefixoCertificado || 'CERT'}-2026-0001
                    </p>
                  </div>
                </div>

                {/* Telefone & E-mail de Rodapé */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Telefone / WhatsApp de Rodapé (Opcional)
                  </label>
                  <input
                    value={telefoneRodape}
                    onChange={(e) => setTelefoneRodape(maskPhone(e.target.value))}
                    placeholder="(00) 99999-0000"
                    className={`${inputCls} font-mono`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    E-mail de Rodapé (Opcional)
                  </label>
                  <input
                    type="email"
                    value={emailRodape}
                    onChange={(e) => setEmailRodape(e.target.value)}
                    placeholder="contato@suaempresa.com.br"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Endereço Automático via ViaCEP */}
              <div className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-3">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-500" />
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                    Endereço Impresso nos Certificados (CEP Automático)
                  </h4>
                </div>
                <ViaCepAddressFields value={addr} onChange={setAddr} />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#1D4ED8] to-[#3B82F6] text-white text-sm font-semibold hover:from-[#1E40AF] hover:to-[#2563EB] shadow-lg shadow-blue-600/25 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Salvando alterações...' : 'Salvar Dados do Certificado'}
                </button>
              </div>
            </form>

            {/* Prévia Ao Vivo em Papel Branco */}
            <div className="xl:col-span-5 dk-glass-card rounded-2xl p-5 space-y-4 sticky top-20">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Prévia Ao Vivo do Certificado
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Modelo ativo: {activeModelo?.nome || selectedModeloId}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSubTab('modelos')}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Trocar modelo
                </button>
              </div>

              <div className="dk-paper-surface rounded-xl p-2 border border-slate-200">
                {activeModelo && (
                  <CertificateTemplatePreview
                    modelo={activeModelo}
                    empresaPreview={previewEmpresaObj}
                  />
                )}
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Todos os PDFs oficiais (Certificado Frente/Verso, Comprovante, Dossiê e Carta de
                Anuência) são sempre gerados em fundo branco vetorial de alta nitidez.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* ABA 2 — MODELOS DE CERTIFICADO (GALERIA AO VIVO)                      */}
      {/* ===================================================================== */}
      {subTab === 'modelos' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {(catalog?.modelos ?? []).map((modelo) => {
              const isSelected = selectedModeloId === modelo.id;
              const isSavingThis = savingModeloId === modelo.id;
              return (
                <div
                  key={modelo.id}
                  className={`dk-glass-card rounded-2xl p-5 space-y-4 transition-all ${
                    isSelected
                      ? 'border-blue-500 ring-1 ring-blue-500/40'
                      : 'hover:border-blue-500/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          {modelo.nome}
                        </h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                          Gratuito
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {modelo.descricao}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isSavingThis}
                      onClick={() => void handleSelectModelo(modelo.id)}
                      className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 text-white'
                          : 'bg-[#1D4ED8] hover:bg-[#1E40AF] text-white'
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Modelo Padrão
                        </>
                      ) : isSavingThis ? (
                        'Aplicando...'
                      ) : (
                        'Usar este Modelo'
                      )}
                    </button>
                  </div>

                  <div className="dk-paper-surface rounded-xl p-2 border border-slate-200">
                    <CertificateTemplatePreview
                      modelo={modelo}
                      empresaPreview={previewEmpresaObj}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Card do Adicional Modelo Próprio */}
          <div className="dk-glass-card rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-5 border-amber-500/30">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Modelo Próprio Exclusivo (Frente e Verso Personalizado)
                  </h3>
                  {hasModeloProprio && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                      Adicional Ativo
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                  {hasModeloProprio
                    ? empresa.modeloProprioUrl
                      ? 'Seu layout próprio exclusivo está implantado e ativo para emissão de certificados.'
                      : 'Adicional contratado! Nossa equipe DK Facilita está implantando a sua arte exclusiva frente e verso.'
                    : 'Envie o layout oficial da sua empresa (.pptx, .pdf ou imagem de fundo) e nossa equipe implanta o modelo sob medida direto na sua conta.'}
                </p>
              </div>
            </div>

            {!hasModeloProprio && (
              <button
                type="button"
                onClick={onGoPlano}
                className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 text-xs font-bold hover:from-amber-400 hover:to-orange-400 cursor-pointer shadow-lg shadow-orange-500/20"
              >
                Contratar em Meu Plano
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* ABA 3 — RESPONSÁVEIS & ASSINATURAS (+ CONTRATOS / OBRAS)              */}
      {/* ===================================================================== */}
      {subTab === 'responsaveis' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Formulário de Novo Instrutor / RT com Assinatura */}
            <form
              onSubmit={handleCreateAssinatura}
              className="xl:col-span-5 dk-glass-card rounded-2xl p-6 space-y-4"
            >
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <PenTool className="w-4 h-4 text-blue-500" />
                  Cadastrar Instrutor ou Responsável Técnico
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Os nomes, registros (MTE/CREA) e assinaturas salvos aqui aparecem automaticamente
                  nas listas suspensas ao abrir novas turmas.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setSigTipo('INSTRUTOR')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    sigTipo === 'INSTRUTOR'
                      ? 'bg-[#1D4ED8] text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Instrutor / TST
                </button>
                <button
                  type="button"
                  onClick={() => setSigTipo('RT')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    sigTipo === 'RT'
                      ? 'bg-[#1D4ED8] text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Responsável Técnico (RT)
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nome Completo *
                </label>
                <input
                  required
                  value={sigNome}
                  onChange={(e) => setSigNome(e.target.value)}
                  placeholder={
                    sigTipo === 'INSTRUTOR'
                      ? 'Ex.: João Carlos Ferreira'
                      : 'Ex.: Eng. Marcos Vinícius Almeida'
                  }
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {sigTipo === 'INSTRUTOR'
                    ? 'Registro MTE / Proficiência *'
                    : 'Registro CREA / Conselho *'}
                </label>
                <input
                  required
                  value={sigRegistro}
                  onChange={(e) => setSigRegistro(e.target.value)}
                  placeholder={
                    sigTipo === 'INSTRUTOR'
                      ? 'Ex.: TST MTE 0045120 / Proficiência NR-35'
                      : 'Ex.: CREA-SP 5069123456'
                  }
                  className={`${inputCls} font-mono`}
                />
              </div>

              <div className="dk-paper-surface rounded-xl p-3 border border-slate-200">
                <SignaturePadCanvas
                  key={sigPadKey}
                  value={sigDataUrl}
                  onChange={setSigDataUrl}
                  height={148}
                  label="Assinatura digital (desenhe com mouse ou dedo)"
                />
              </div>

              <button
                type="submit"
                disabled={savingSig}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#1D4ED8] to-[#3B82F6] text-white text-xs font-semibold hover:from-[#1E40AF] hover:to-[#2563EB] cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {savingSig
                  ? 'Salvando assinatura...'
                  : sigTipo === 'INSTRUTOR'
                    ? 'Salvar Instrutor / TST'
                    : 'Salvar Responsável Técnico (RT)'}
              </button>
            </form>

            {/* Listas de Instrutores e RTs Cadastrados */}
            <div className="xl:col-span-7 space-y-5">
              {/* Lista Instrutores */}
              <div className="dk-glass-card rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-blue-500" />
                    Instrutores / TSTs ({instrutores.length})
                  </h4>
                </div>
                {instrutores.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center border border-dashed border-slate-200 dark:border-white/10 rounded-xl">
                    Nenhum Instrutor / TST cadastrado ainda. Use o formulário ao lado para adicionar.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {instrutores.map((item) => (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {item.nomeSignatario}
                            </p>
                            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                              {item.registro || 'Sem registro'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleDeleteAssinatura(item.id)}
                            title="Remover instrutor"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="bg-white rounded-lg border border-slate-200 p-2 flex items-center justify-center h-14">
                          <img
                            src={item.imagemDataUrl}
                            alt={`Assinatura ${item.nomeSignatario}`}
                            className="max-h-10 max-w-full object-contain"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Lista RTs */}
              <div className="dk-glass-card rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <HardHat className="w-4 h-4 text-amber-500" />
                    Responsáveis Técnicos — CREA ({rts.length})
                  </h4>
                </div>
                {rts.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center border border-dashed border-slate-200 dark:border-white/10 rounded-xl">
                    Nenhum Responsável Técnico (RT) cadastrado ainda.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {rts.map((item) => (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {item.nomeSignatario}
                            </p>
                            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                              {item.registro || 'Sem CREA'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleDeleteAssinatura(item.id)}
                            title="Remover responsável técnico"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="bg-white rounded-lg border border-slate-200 p-2 flex items-center justify-center h-14">
                          <img
                            src={item.imagemDataUrl}
                            alt={`Assinatura ${item.nomeSignatario}`}
                            className="max-h-10 max-w-full object-contain"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Gestão de Contratos / Obras com ViaCEP */}
          <div className="dk-glass-card rounded-2xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-500" />
                  Contratos / Obras ({obras.length} de {limits.limiteObras})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Cadastre suas frentes de obra e contratos com preenchimento automático de
                  endereço via CEP.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleCreateObra}
              className="grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10"
            >
              <div className="lg:col-span-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Código do Contrato *
                </label>
                <input
                  required
                  value={obraCodigo}
                  onChange={(e) => setObraCodigo(e.target.value.toUpperCase())}
                  placeholder="EX.: OBRA-01"
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div className="lg:col-span-5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nome da Obra / Contrato *
                </label>
                <input
                  required
                  value={obraNome}
                  onChange={(e) => setObraNome(e.target.value)}
                  placeholder="Ex.: Parada Industrial Unidade Norte"
                  className={inputCls}
                />
              </div>
              <div className="lg:col-span-4">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Cliente Final / Contratante
                </label>
                <input
                  value={obraCliente}
                  onChange={(e) => setObraCliente(e.target.value)}
                  placeholder="Opcional"
                  className={inputCls}
                />
              </div>

              <div className="lg:col-span-12">
                <ViaCepAddressFields value={obraAddr} onChange={setObraAddr} compact />
              </div>

              <div className="lg:col-span-12 flex justify-end">
                <button
                  type="submit"
                  disabled={savingObra}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {savingObra ? 'Salvando obra...' : 'Adicionar Contrato / Obra'}
                </button>
              </div>
            </form>

            {obras.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {obras.map((obra) => (
                  <div
                    key={obra.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <span className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400">
                        {obra.codigo}
                      </span>
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {obra.nome}
                      </p>
                      {obra.clienteFinal && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          Cliente: {obra.clienteFinal}
                        </p>
                      )}
                      {obra.localizacao && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {obra.localizacao}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteObra(obra.id)}
                      title="Remover obra"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
