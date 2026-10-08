// Máscara e validação de CPF (formato "000.000.000-00" + dígitos
// verificadores) — usado no cadastro de colaboradores (advogados
// associados) pelo escritório.

export function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  let result = digits;
  if (digits.length > 3) result = `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length > 6) result = `${result.slice(0, 7)}.${result.slice(7)}`;
  if (digits.length > 9) result = `${result.slice(0, 11)}-${result.slice(11)}`;
  return result;
}

function calcCpfCheckDigit(digits: string, length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i++) sum += Number(digits[i]) * (length + 1 - i);
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

// Confere os dois dígitos verificadores pelo algoritmo oficial da Receita
// Federal, além de rejeitar sequências repetidas (ex: "00000000000"), que
// passam pela conta mas nunca são um CPF real.
export function isValidCpf(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const firstCheck = calcCpfCheckDigit(digits, 9);
  if (firstCheck !== Number(digits[9])) return false;

  const secondCheck = calcCpfCheckDigit(digits, 10);
  if (secondCheck !== Number(digits[10])) return false;

  return true;
}
