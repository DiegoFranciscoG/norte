const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', middot: '·', euro: '€', copy: '©', reg: '®', trade: '™',
};

export const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
export const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
const PHONE_CANDIDATE_RE = /\+?\(?\d[\d\s().-]{6,}\d/g;

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const value = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value < 0x110000 ? String.fromCodePoint(value) : whole;
    }
    return NAMED_ENTITIES[code] ?? whole;
  });
}

/** Convierte HTML (incluido HTML escapado una vez, como el de Greenhouse) en texto plano con saltos de línea. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  let s = html;
  if (/&lt;\/?[a-z]/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr|ul|ol|section)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  return s
    .replace(/ /g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function stripAccents(input: string): string {
  return input.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Minúsculas, sin tildes y con espacios colapsados. Conserva + # . para C++, C#, .NET. */
export function normalizeText(input: string): string {
  return stripAccents(input).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function slugify(input: string): string {
  return normalizeText(input)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countDigits(s: string): number {
  let n = 0;
  for (const ch of s) if (ch >= '0' && ch <= '9') n++;
  return n;
}

/** Elimina correos, URLs y números telefónicos: el índice público nunca lleva datos de contacto. */
export function removeContactData(text: string): string {
  return text
    .replace(EMAIL_RE, '[correo omitido]')
    .replace(URL_RE, '[enlace omitido]')
    .replace(PHONE_CANDIDATE_RE, (m) => {
      const digits = countDigits(m);
      return digits >= 9 || (m.trim().startsWith('+') && digits >= 8) ? '[teléfono omitido]' : m;
    });
}

export function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

export function makeExcerpt(text: string, max: number): string {
  const clean = removeContactData(text).replace(/\s+/g, ' ').trim();
  return truncateAtWord(clean, max);
}

export function trigrams(input: string): Set<string> {
  const s = `  ${normalizeText(input).replace(/[^a-z0-9+#]+/g, ' ')} `;
  const grams = new Set<string>();
  for (let i = 0; i < s.length - 2; i++) grams.add(s.slice(i, i + 3));
  return grams;
}

/** Coeficiente de Dice sobre trigramas: 1 = idénticos, 0 = nada en común. */
export function diceSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  let shared = 0;
  for (const g of ta) if (tb.has(g)) shared++;
  return (2 * shared) / (ta.size + tb.size);
}

/** Distancia Damerau-Levenshtein (transposición adyacente) con corte temprano. */
export function damerauLevenshtein(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) d[i]![0] = i;
  for (let j = 0; j < cols; j++) d[0]![j] = j;
  for (let i = 1; i < rows; i++) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length]![b.length]!;
}

/** Hash FNV-1a de 32 bits en hexadecimal: estable y sin dependencias (no criptográfico). */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const ES_WORDS = new Set(['de', 'la', 'el', 'en', 'y', 'para', 'con', 'los', 'las', 'del', 'una', 'que', 'experiencia', 'por', 'se', 'como', 'trabajo', 'conocimientos']);
const EN_WORDS = new Set(['the', 'and', 'of', 'to', 'with', 'for', 'you', 'in', 'our', 'we', 'experience', 'are', 'will', 'your', 'is', 'on', 'team']);
const PT_WORDS = new Set(['de', 'e', 'para', 'com', 'você', 'experiência', 'conhecimento', 'não', 'são', 'uma', 'vaga', 'trabalho']);

export function detectPostingLanguage(text: string): 'es' | 'en' | 'pt' | 'other' {
  const words = normalizeText(text).split(/[^a-zçãõê]+/).slice(0, 600);
  let es = 0;
  let en = 0;
  let pt = 0;
  for (const w of words) {
    if (ES_WORDS.has(w)) es++;
    if (EN_WORDS.has(w)) en++;
    if (PT_WORDS.has(w)) pt++;
  }
  const raw = text.toLowerCase();
  if (/\b(você|não|experiência|são|vaga)\b/.test(raw)) pt += 5;
  const best = Math.max(es, en, pt);
  if (best < 3) return 'other';
  if (best === en) return 'en';
  if (best === pt && pt > es) return 'pt';
  return 'es';
}
