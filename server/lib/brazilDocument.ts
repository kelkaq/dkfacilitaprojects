export type HolderKind = 'PF' | 'PJ';

export function normalizeDocument(value: string): string {
  return value.replace(/\D/g, '');
}

function checkDigit(numbers: number[], weights: number[]): number {
  const sum = weights.reduce((total, weight, index) => total + numbers[index] * weight, 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCpf(value: string): boolean {
  const digits = normalizeDocument(value);
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const numbers = [...digits].map(Number);
  return checkDigit(numbers, [10, 9, 8, 7, 6, 5, 4, 3, 2]) === numbers[9] &&
    checkDigit(numbers, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) === numbers[10];
}

export function isValidCnpj(value: string): boolean {
  const digits = normalizeDocument(value);
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  const numbers = [...digits].map(Number);
  return checkDigit(numbers, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === numbers[12] &&
    checkDigit(numbers, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === numbers[13];
}

export function validateHolderDocument(kind: HolderKind, value: string): string {
  const digits = normalizeDocument(value);
  if (kind === 'PF' ? !isValidCpf(digits) : !isValidCnpj(digits)) {
    throw new Error(kind === 'PF' ? 'CPF inválido.' : 'CNPJ inválido.');
  }
  return digits;
}
