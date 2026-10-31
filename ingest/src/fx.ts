import type { FxTable } from '@norte/core';
import type { HttpClient } from './http/client.js';

/** Lee los tipos de referencia diarios del BCE (unidades de cada moneda por 1 EUR). */
export function parseEcbXml(xmlText: string, source: string): FxTable | null {
  const date = xmlText.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
  const perEur: Record<string, number> = {};
  for (const m of xmlText.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) {
    const rate = Number(m[2]);
    if (Number.isFinite(rate) && rate > 0) perEur[m[1]!] = rate;
  }
  if (!date || !perEur['USD']) return null;
  return { source, date, perEur };
}

export async function loadFx(http: HttpClient, url: string, source: string, log: (m: string) => void): Promise<FxTable | null> {
  try {
    const res = await http.get(url, 'application/xml');
    const table = parseEcbXml(res.body, source);
    if (!table) log('BCE: respuesta sin tipos utilizables; los salarios en otras monedas no se convertirán.');
    return table;
  } catch (err) {
    log(`BCE no disponible (${err instanceof Error ? err.message : String(err)}): solo se normalizan salarios en USD.`);
    return null;
  }
}
