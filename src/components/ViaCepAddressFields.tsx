import React, { useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import {
  BRAZIL_UFS,
  lookupViaCep,
  maskCep,
  type StructuredAddress,
} from '../lib/brazilAddress.ts';

interface ViaCepAddressFieldsProps {
  value: StructuredAddress;
  onChange: (next: StructuredAddress) => void;
  compact?: boolean;
  required?: boolean;
  labelPrefix?: string;
}

export const ViaCepAddressFields: React.FC<ViaCepAddressFieldsProps> = ({
  value,
  onChange,
  compact = false,
  required = false,
  labelPrefix,
}) => {
  const [lookingUp, setLookingUp] = useState(false);
  const [cepNotice, setCepNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const lastFetchedCepRef = useRef<string>('');

  const inputCls = compact
    ? 'w-full px-3 py-2 text-xs bg-white dark:bg-[#060913] border border-slate-200 dark:border-white/15 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500'
    : 'w-full px-3.5 py-2 text-sm bg-white dark:bg-[#060913] border border-slate-300 dark:border-white/15 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500';

  const labelCls = compact
    ? 'block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1'
    : 'block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1';

  const triggerLookup = async (digits: string, current: StructuredAddress) => {
    if (digits.length !== 8 || lastFetchedCepRef.current === digits) return;
    lastFetchedCepRef.current = digits;
    setLookingUp(true);
    setCepNotice(null);
    try {
      const found = await lookupViaCep(digits);
      if (!found) {
        setCepNotice({
          type: 'err',
          text: 'CEP não encontrado na base dos Correios. Preencha os campos manualmente.',
        });
        return;
      }
      onChange({
        ...current,
        cep: maskCep(digits),
        logradouro: found.logradouro || current.logradouro,
        bairro: found.bairro || current.bairro,
        cidade: found.cidade || current.cidade,
        uf: found.uf || current.uf,
      });
      setCepNotice({
        type: 'ok',
        text: `Endereço preenchido automaticamente (${found.cidade}/${found.uf}). Informe o número.`,
      });
    } catch {
      setCepNotice({
        type: 'err',
        text: 'Serviço ViaCEP indisponível no momento. Você pode preencher os campos manualmente.',
      });
    } finally {
      setLookingUp(false);
    }
  };

  const handleCepChange = (raw: string) => {
    const masked = maskCep(raw);
    const digits = masked.replace(/\D/g, '');
    const next: StructuredAddress = { ...value, cep: masked };
    onChange(next);
    if (digits.length < 8) {
      lastFetchedCepRef.current = '';
      setCepNotice(null);
    } else if (digits.length === 8) {
      void triggerLookup(digits, next);
    }
  };

  return (
    <div className="space-y-3">
      {labelPrefix && (
        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-blue-500" />
          {labelPrefix}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-4">
          <label className={labelCls}>CEP {required ? '*' : '(busca automática)'}</label>
          <div className="relative">
            <input
              value={value.cep}
              required={required}
              onChange={(e) => handleCepChange(e.target.value)}
              placeholder="00000-000"
              maxLength={9}
              className={`${inputCls} font-mono pr-8`}
            />
            {lookingUp && (
              <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin absolute right-2.5 top-1/2 -translate-y-1/2" />
            )}
          </div>
        </div>

        <div className="sm:col-span-8">
          <label className={labelCls}>Logradouro (Rua / Avenida)</label>
          <input
            value={value.logradouro}
            onChange={(e) => onChange({ ...value, logradouro: e.target.value })}
            placeholder="Preenchido automaticamente pelo CEP"
            className={inputCls}
          />
        </div>

        <div className="sm:col-span-3">
          <label className={labelCls}>Número</label>
          <input
            value={value.numero}
            onChange={(e) => onChange({ ...value, numero: e.target.value })}
            placeholder="Ex.: 240 ou S/N"
            className={inputCls}
          />
        </div>

        <div className="sm:col-span-5">
          <label className={labelCls}>Complemento</label>
          <input
            value={value.complemento}
            onChange={(e) => onChange({ ...value, complemento: e.target.value })}
            placeholder="Sala, Bloco, Galpão (opcional)"
            className={inputCls}
          />
        </div>

        <div className="sm:col-span-4">
          <label className={labelCls}>Bairro</label>
          <input
            value={value.bairro}
            onChange={(e) => onChange({ ...value, bairro: e.target.value })}
            placeholder="Preenchido pelo CEP"
            className={inputCls}
          />
        </div>

        <div className="sm:col-span-8">
          <label className={labelCls}>Cidade</label>
          <input
            value={value.cidade}
            onChange={(e) => onChange({ ...value, cidade: e.target.value })}
            placeholder="Preenchido pelo CEP"
            className={inputCls}
          />
        </div>

        <div className="sm:col-span-4">
          <label className={labelCls}>Estado (UF)</label>
          <select
            value={value.uf}
            onChange={(e) => onChange({ ...value, uf: e.target.value })}
            className={`${inputCls} font-mono`}
          >
            <option value="">Selecione a UF</option>
            {BRAZIL_UFS.map((item) => (
              <option key={item.sigla} value={item.sigla}>
                {item.sigla} — {item.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {cepNotice && (
        <p
          className={`text-[11px] ${
            cepNotice.type === 'ok'
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-amber-700 dark:text-amber-400'
          }`}
        >
          {cepNotice.text}
        </p>
      )}
    </div>
  );
};
