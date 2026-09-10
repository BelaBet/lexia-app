const JUSBRASIL_TRIBPROC_BASE_URL = "https://op.digesto.com.br/api/base-judicial/tribproc";

export function normalizeCnj(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 20) return null;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`;
}

export function buildJusbrasilCnjUrl(cnj: string): string {
  return `${JUSBRASIL_TRIBPROC_BASE_URL}/${encodeURIComponent(cnj)}?tipo_numero=5`;
}
