import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Trash2, Upload } from 'lucide-react';
import type { GlobalCatalogSnapshot } from '../services/catalogService.ts';
import type { EmpresaDoc } from '../types/domain.ts';
import { updateEmpresaIdentidade } from '../services/operationalCrudService.ts';
import { CertificateTemplatePreview } from './CertificateTemplatePreview.tsx';

interface OnboardingWizardProps {
  empresa: EmpresaDoc;
  catalog: GlobalCatalogSnapshot | null;
  onCompleted: (updated: EmpresaDoc) => void;
}

const BRAND_SWATCHES = ['#0F172A', '#1D4ED8', '#0F766E', '#B45309', '#991B1B', '#334155'];

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  empresa,
  catalog,
  onCompleted,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Passo 1: Identidade visual e endereço para certificados
  const [logoUrl, setLogoUrl] = useState<string | null>(empresa.logoUrl || null);
  const [corPrimaria, setCorPrimaria] = useState(empresa.corPrimaria || '#0F172A');
  const [prefixoCertificado, setPrefixoCertificado] = useState(
    empresa.prefixoCertificado || 'CERT'
  );
  const [endereco, setEndereco] = useState(empresa.endereco || '');
  const [cidade, setCidade] = useState(empresa.cidade || '');
  const [uf, setUf] = useState(empresa.uf || 'RJ');

  // Passo 2: Modelo gratuito ou interesse em modelo próprio
  const [modeloId, setModeloId] = useState(
    empresa.modeloCertificadoId ||
      catalog?.modelos[0]?.id ||
      'modelo_classico_institucional'
  );
  const [desejaModeloProprio, setDesejaModeloProprio] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 140 * 1024) {
      setError('Selecione uma imagem de logotipo de até 140 KB (PNG, JPG ou SVG).');
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const selectedModelo =
    catalog?.modelos.find((m) => m.id === modeloId) ?? catalog?.modelos[0] ?? null;

  const handleFinish = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateEmpresaIdentidade(empresa.id, {
        logoUrl,
        corPrimaria,
        prefixoCertificado: prefixoCertificado.trim().toUpperCase() || 'CERT',
        endereco: endereco.trim(),
        cidade: cidade.trim(),
        uf: uf.trim().toUpperCase(),
        modeloCertificadoId: modeloId,
        onboardingConcluido: true,
      });

      onCompleted({
        ...empresa,
        logoUrl,
        corPrimaria,
        prefixoCertificado: prefixoCertificado.trim().toUpperCase() || 'CERT',
        endereco: endereco.trim(),
        cidade: cidade.trim(),
        uf: uf.trim().toUpperCase(),
        modeloCertificadoId: modeloId,
        onboardingConcluido: true,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao salvar as configurações de primeiro acesso.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] py-10 px-6">
      <div className="max-w-[920px] mx-auto space-y-6">
        {/* Cabeçalho do Assistente */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-[#1D4ED8]">
              Assistente Rápido de Primeiro Acesso · {empresa.razaoSocial}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Configure a identidade dos seus certificados em 3 passos
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono">
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={`px-2.5 py-1 rounded-md border ${
                  step === n
                    ? 'bg-slate-900 text-white border-slate-900'
                    : step > n
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-white text-slate-500 border-slate-200'
                }`}
              >
                0{n}
              </span>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-900">
            {error}
          </div>
        )}

        {/* PASSO 1: LOGO, COR PRINCIPAL, PREFIXO E ENDEREÇO */}
        {step === 1 && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Passo 1 — Logotipo, cor principal e dados de emissão
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Essas informações são aplicadas automaticamente no cabeçalho dos seus certificados
                PDF e na página de provas dos colaboradores.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Upload de Logo */}
              <div className="space-y-2.5">
                <label className="block text-xs font-medium text-slate-700">
                  Logo da Empresa (PNG, JPG ou SVG até 140 KB)
                </label>
                <div className="border border-dashed border-slate-300 rounded-xl p-5 bg-slate-50 flex flex-col items-center justify-center gap-3 text-center">
                  {logoUrl ? (
                    <>
                      <img
                        src={logoUrl}
                        alt="Logo carregado"
                        referrerPolicy="no-referrer"
                        className="max-h-16 max-w-[200px] object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => setLogoUrl(null)}
                        className="inline-flex items-center gap-1.5 text-xs text-red-700 hover:underline cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remover logo
                      </button>
                    </>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-slate-400" />
                      <label className="px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer">
                        Selecionar arquivo de logo
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/svg+xml,image/webp"
                          onChange={handleLogoFileChange}
                          className="hidden"
                        />
                      </label>
                    </>
                  )}
                </div>
              </div>

              {/* Cor principal + Prefixo */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-2">
                    Cor Principal da Marca
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {BRAND_SWATCHES.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setCorPrimaria(hex)}
                        className={`w-8 h-8 rounded-lg border-2 cursor-pointer ${
                          corPrimaria.toLowerCase() === hex.toLowerCase()
                            ? 'border-slate-900 scale-105'
                            : 'border-transparent'
                        }`}
                        style={{ backgroundColor: hex }}
                        aria-label={`Cor ${hex}`}
                      />
                    ))}
                    <input
                      type="color"
                      value={corPrimaria}
                      onChange={(e) => setCorPrimaria(e.target.value)}
                      className="w-8 h-8 rounded border border-slate-200 cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Prefixo dos Certificados
                  </label>
                  <input
                    value={prefixoCertificado}
                    maxLength={10}
                    onChange={(e) =>
                      setPrefixoCertificado(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
                    }
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                  <p className="mt-1 text-[11px] text-slate-500 font-mono">
                    Exemplo de numeração: {prefixoCertificado || 'CERT'}-2026-0001
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-6 gap-4 pt-4 border-t border-slate-100">
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  CNPJ Confirmado
                </label>
                <input
                  readOnly
                  value={empresa.cnpj}
                  className="w-full px-3.5 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-600"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Cidade</label>
                <input
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  placeholder="Cidade da sede"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-1">
                <label className="block text-xs font-medium text-slate-700 mb-1">UF</label>
                <input
                  value={uf}
                  maxLength={2}
                  onChange={(e) => setUf(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-6">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Endereço completo (exibido no rodapé/cabeçalho do certificado)
                </label>
                <input
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  placeholder="Av. / Rua, número, bairro"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 cursor-pointer"
              >
                Continuar para Modelos
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* PASSO 2: ESCOLHER MODELO GRATUITO OU INDICAR MODELO PRÓPRIO */}
        {step === 2 && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Passo 2 — Escolha o modelo visual dos seus certificados
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Todos os modelos abaixo são gratuitos e já exibem a identidade visual configurada no
                Passo 1. Você também pode contratar a implantação de um Modelo Próprio exclusivo.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {(catalog?.modelos ?? []).map((modelo) => {
                const active = modeloId === modelo.id;
                return (
                  <button
                    key={modelo.id}
                    type="button"
                    onClick={() => setModeloId(modelo.id)}
                    className={`text-left p-4 rounded-xl border transition-colors space-y-3 cursor-pointer ${
                      active
                        ? 'border-[#1D4ED8] ring-1 ring-[#1D4ED8]/20 bg-blue-50/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">{modelo.nome}</span>
                      {active && (
                        <span className="text-xs font-medium text-[#1D4ED8] inline-flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          Selecionado
                        </span>
                      )}
                    </div>
                    <CertificateTemplatePreview
                      modelo={modelo}
                      empresaPreview={{
                        razaoSocial: empresa.razaoSocial,
                        cnpj: empresa.cnpj,
                        endereco: endereco || `${cidade}${uf ? `/${uf}` : ''}`,
                        logoUrl,
                        corPrimaria,
                        prefixoCertificado,
                      }}
                    />
                  </button>
                );
              })}
            </div>

            <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={desejaModeloProprio}
                onChange={(e) => setDesejaModeloProprio(e.target.checked)}
                className="mt-0.5 rounded border-slate-300"
              />
              <div className="text-xs">
                <p className="font-semibold text-slate-900">
                  Quero também contratar o adicional "Modelo Próprio de Certificado" depois em Meu
                  Plano
                </p>
                <p className="text-slate-600 mt-0.5">
                  Nossa equipe sobe a arte exclusiva frente e verso da sua empresa direto na sua
                  conta.
                </p>
              </div>
            </label>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 cursor-pointer"
              >
                Revisar e Liberar Painel
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* PASSO 3: REVISÃO E LIBERAÇÃO */}
        {step === 3 && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Passo 3 — Confirmação final de primeiro acesso
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Revise os dados abaixo. Você poderá ajustar logotipo, cores e modelo a qualquer
                momento nas configurações da empresa.
              </p>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-xl p-5 text-xs">
              <div>
                <dt className="text-slate-500">Empresa</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">{empresa.razaoSocial}</dd>
              </div>
              <div>
                <dt className="text-slate-500">CNPJ</dt>
                <dd className="mt-0.5 font-mono text-slate-900">{empresa.cnpj}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Endereço nos Certificados</dt>
                <dd className="mt-0.5 text-slate-900">
                  {endereco || 'Não informado'} {cidade ? `· ${cidade}/${uf}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Prefixo e Cor Principal</dt>
                <dd className="mt-0.5 font-mono text-slate-900 flex items-center gap-2">
                  <span>{prefixoCertificado}</span>
                  <span
                    className="inline-block w-3.5 h-3.5 rounded border border-slate-300"
                    style={{ backgroundColor: corPrimaria }}
                  />
                  <span>{corPrimaria}</span>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Modelo Selecionado</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">
                  {selectedModelo?.nome || modeloId}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Modelo Próprio (Adicional)</dt>
                <dd className="mt-0.5 text-slate-900">
                  {desejaModeloProprio
                    ? 'Solicitado para contratação em Meu Plano'
                    : 'Usando modelo gratuito incluso'}
                </dd>
              </div>
            </dl>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleFinish()}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#1D4ED8] text-white text-sm font-medium hover:bg-[#1E40AF] cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {saving ? 'Salvando identidade...' : 'Concluir e Acessar Painel Principal'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
