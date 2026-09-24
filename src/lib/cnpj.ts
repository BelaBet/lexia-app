// Máscara e validação de CNPJ (formato "00.000.000/0000-00" + dígitos
// verificadores) — usado no cadastro de empresas white label.

export function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  let result = digits;
  if (digits.length > 2) result = `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length > 5) result = `${result.slice(0, 6)}.${result.slice(6)}`;
  if (digits.length > 8) result = `${result.slice(0, 10)}/${result.slice(10)}`;
  if (digits.length > 12) result = `${result.slice(0, 15)}-${result.slice(15)}`;
  return result;
}

function calcCnpjCheckDigit(digits: string, weights: number[]): number {
  const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

// Confere os dois dígitos verificadores pelo algoritmo oficial da Receita
// Federal, além de rejeitar sequências repetidas (ex: "00000000000000"),
// que passam pela conta mas nunca são um CNPJ real.
export function isValidCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const firstCheck = calcCnpjCheckDigit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (firstCheck !== Number(digits[12])) return false;

  const secondCheck = calcCnpjCheckDigit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (secondCheck !== Number(digits[13])) return false;

  return true;
}
