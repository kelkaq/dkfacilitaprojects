export interface BrazilianUf {
  sigla: string;
  nome: string;
}

export const BRAZIL_UFS: BrazilianUf[] = [
  { sigla: 'AC', nome: 'Acre' },
  { sigla: 'AL', nome: 'Alagoas' },
  { sigla: 'AP', nome: 'Amapá' },
  { sigla: 'AM', nome: 'Amazonas' },
  { sigla: 'BA', nome: 'Bahia' },
  { sigla: 'CE', nome: 'Ceará' },
  { sigla: 'DF', nome: 'Distrito Federal' },
  { sigla: 'ES', nome: 'Espírito Santo' },
  { sigla: 'GO', nome: 'Goiás' },
  { sigla: 'MA', nome: 'Maranhão' },
  { sigla: 'MT', nome: 'Mato Grosso' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { sigla: 'MG', nome: 'Minas Gerais' },
  { sigla: 'PA', nome: 'Pará' },
  { sigla: 'PB', nome: 'Paraíba' },
  { sigla: 'PR', nome: 'Paraná' },
  { sigla: 'PE', nome: 'Pernambuco' },
  { sigla: 'PI', nome: 'Piauí' },
  { sigla: 'RJ', nome: 'Rio de Janeiro' },
  { sigla: 'RN', nome: 'Rio Grande do Norte' },
  { sigla: 'RS', nome: 'Rio Grande do Sul' },
  { sigla: 'RO', nome: 'Rondônia' },
  { sigla: 'RR', nome: 'Roraima' },
  { sigla: 'SC', nome: 'Santa Catarina' },
  { sigla: 'SP', nome: 'São Paulo' },
  { sigla: 'SE', nome: 'Sergipe' },
  { sigla: 'TO', nome: 'Tocantins' },
];

export interface StructuredAddress {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export const EMPTY_ADDRESS: StructuredAddress = {
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
};

export function maskCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function maskCpf(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

export function maskCnpj(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function maskPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  }
  return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

export function detectDocumentKind(
  documento?: string | null,
  tipoPessoa?: 'PF' | 'PJ' | null
): 'CPF' | 'CNPJ' {
  if (tipoPessoa === 'PF') return 'CPF';
  if (tipoPessoa === 'PJ') return 'CNPJ';
  const digits = (documento || '').replace(/\D/g, '');
  return digits.length <= 11 ? 'CPF' : 'CNPJ';
}

export function formatDocumentWithLabel(
  documento?: string | null,
  tipoPessoa?: 'PF' | 'PJ' | null
): string {
  const clean = (documento || '').trim();
  if (!clean) return '';
  const kind = detectDocumentKind(clean, tipoPessoa);
  return `${kind} ${clean}`;
}

export function formatStructuredAddressLine(addr: Partial<StructuredAddress>): string {
  const street = [
    addr.logradouro?.trim(),
    addr.numero?.trim() ? `nº ${addr.numero.trim()}` : '',
    addr.complemento?.trim(),
  ]
    .filter(Boolean)
    .join(', ');
  const locality = [
    addr.bairro?.trim(),
    [addr.cidade?.trim(), addr.uf?.trim()?.toUpperCase()].filter(Boolean).join('/'),
    addr.cep?.trim() ? `CEP ${maskCep(addr.cep)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return [street, locality].filter(Boolean).join(' — ');
}

export interface ViaCepResult {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
  complemento?: string;
}

export async function lookupViaCep(rawCep: string): Promise<ViaCepResult | null> {
  const digits = rawCep.replace(/\D/g, '');
  if (digits.length !== 8) return null;

  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!response.ok) {
    throw new Error('Não foi possível consultar o CEP agora.');
  }
  const data = (await response.json()) as {
    erro?: boolean;
    logradouro?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
    complemento?: string;
  };
  if (data.erro) {
    return null;
  }
  return {
    logradouro: data.logradouro || '',
    bairro: data.bairro || '',
    cidade: data.localidade || '',
    uf: (data.uf || '').toUpperCase(),
    complemento: data.complemento || '',
  };
}
