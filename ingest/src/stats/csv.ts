/** CSV según RFC 4180: coma como separador, comillas dobles cuando hace falta y CRLF entre filas. */
export type CsvValue = string | number | boolean | null | undefined;

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // Evita la inyección de fórmulas al abrir el archivo en una hoja de cálculo (OWASP CSV Injection).
  const safe = /^[=+\-@\t\r]/.test(text) && typeof value === 'string' ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: CsvValue[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
