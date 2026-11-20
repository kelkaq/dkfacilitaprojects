import React from 'react';
import { QrCode } from 'lucide-react';
import type { ModeloCertificadoCatalogo } from '../data/globalCatalogSeed.ts';
import { formatDocumentWithLabel } from '../lib/brazilAddress.ts';

interface Props {
  modelo: ModeloCertificadoCatalogo;
  empresaPreview?: {
    razaoSocial?: string;
    cnpj?: string;
    tipoPessoa?: 'PF' | 'PJ';
    exibirDocumento?: boolean;
    endereco?: string;
    logoUrl?: string | null;
    corPrimaria?: string;
    prefixoCertificado?: string;
    telefoneRodape?: string;
    emailRodape?: string;
  };
}

export const CertificateTemplatePreview: React.FC<Props> = ({ modelo, empresaPreview }) => {
  const { moldura, corBordaPadrao, corFundoCabecalho, posicaoQr } = modelo.layoutConfig;

  const activeBorderColor =
    moldura === 'corporativa-barra' && empresaPreview?.corPrimaria
      ? empresaPreview.corPrimaria
      : empresaPreview?.corPrimaria || corBordaPadrao;

  const activeHeaderBg =
    moldura === 'corporativa-barra' && empresaPreview?.corPrimaria
      ? empresaPreview.corPrimaria
      : corFundoCabecalho;

  const borderStyle =
    moldura === 'dupla-classica'
      ? 'border-2 border-double'
      : moldura === 'tecnica-grade'
        ? 'border border-dashed'
        : 'border';

  const isDarkHeader =
    activeHeaderBg.toLowerCase() === '#0f172a' ||
    (moldura === 'corporativa-barra' && activeHeaderBg.toLowerCase() !== '#ffffff');

  const razao = empresaPreview?.razaoSocial?.trim() || 'Nome da Empresa ou Profissional';
  const showDoc = empresaPreview?.exibirDocumento !== false;
  const formattedDoc =
    showDoc && empresaPreview?.cnpj
      ? formatDocumentWithLabel(empresaPreview.cnpj, empresaPreview.tipoPessoa)
      : '';
  const endereco = empresaPreview?.endereco?.trim() || '';
  const subtitleParts = [formattedDoc, endereco].filter(Boolean);
  const subtitleLine = subtitleParts.join(' · ') || 'Identidade configurada em Configurações & Certificados';
  const prefixo = empresaPreview?.prefixoCertificado || 'CERT';
  const footerContact = [empresaPreview?.telefoneRodape, empresaPreview?.emailRodape]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className={`rounded-lg bg-white overflow-hidden ${borderStyle}`}
      style={{ borderColor: activeBorderColor }}
    >
      {/* Cabeçalho dinâmico */}
      <div
        className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3"
        style={{ backgroundColor: activeHeaderBg }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {empresaPreview?.logoUrl ? (
            <img
              src={empresaPreview.logoUrl}
              alt="Logo do certificado"
              referrerPolicy="no-referrer"
              className="h-7 max-w-[76px] object-contain rounded bg-white/95 px-1 py-0.5 shrink-0"
            />
          ) : (
            <div
              className={`w-7 h-7 rounded border flex items-center justify-center text-[10px] font-mono font-semibold shrink-0 ${
                isDarkHeader
                  ? 'border-white/30 text-white bg-white/10'
                  : 'border-slate-300 text-slate-600 bg-white'
              }`}
            >
              LOGO
            </div>
          )}
          <div className="min-w-0">
            <p
              className={`text-xs font-semibold truncate ${
                isDarkHeader ? 'text-white' : 'text-slate-900'
              }`}
            >
              {razao}
            </p>
            <p
              className={`text-[11px] truncate ${
                isDarkHeader ? 'text-slate-200' : 'text-slate-500'
              }`}
            >
              {subtitleLine}
            </p>
          </div>
        </div>
        <span
          className={`text-[10px] font-mono tabular-nums whitespace-nowrap shrink-0 ${
            isDarkHeader ? 'text-slate-200' : 'text-slate-500'
          }`}
        >
          {prefixo}-2026-0001
        </span>
      </div>

      {/* Corpo Frente */}
      <div className="p-4 space-y-3 bg-white">
        <div className="text-center space-y-1">
          <p className="text-[11px] font-medium tracking-wider text-slate-500">
            CERTIFICADO DE CAPACITAÇÃO
          </p>
          <p className="text-sm font-semibold text-slate-900">
            Nome do Colaborador · CPF
          </p>
          <p className="text-xs text-slate-600">
            Concluiu o treinamento NR-35 Trabalho em Altura (Inicial · 8h)
          </p>
        </div>

        {/* Grade de Assinaturas + QR Code */}
        <div
          className={`pt-3 border-t border-slate-100 flex items-end gap-3 ${
            posicaoQr === 'rodape-central' ? 'justify-center' : 'justify-between'
          }`}
        >
          <div className="flex-1 text-center">
            <div className="h-px bg-slate-300 mb-1" />
            <p className="text-[10px] text-slate-500">Instrutor / TST</p>
          </div>

          {posicaoQr === 'rodape-central' && (
            <div className="p-1.5 border border-slate-200 rounded bg-slate-50 text-slate-700 shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
          )}

          <div className="flex-1 text-center">
            <div className="h-px bg-slate-300 mb-1" />
            <p className="text-[10px] text-slate-500">Responsável Técnico</p>
          </div>

          {posicaoQr === 'rodape-direito' && (
            <div className="p-1.5 border border-slate-200 rounded bg-slate-50 text-slate-700 shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
          )}
        </div>
      </div>

      {/* Rodapé informativo */}
      <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span className="truncate">
          {footerContact || 'Verso: Conteúdo programático em 1 ou 2 colunas automáticas'}
        </span>
        <span className="font-mono text-slate-600 shrink-0">{moldura}</span>
      </div>
    </div>
  );
};
