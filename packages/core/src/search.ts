import { normalizeText } from './text.js';

/**
 * Opciones de MiniSearch compartidas: la ingesta construye el índice con ellas y el navegador lo carga con las mismas.
 * Si difieren, la búsqueda devuelve resultados incoherentes sin dar error.
 */
export const SEARCH_FIELDS = ['title', 'company', 'skills', 'location', 'excerpt'] as const;

export const searchOptions = {
  idField: 'id',
  fields: [...SEARCH_FIELDS],
  storeFields: [] as string[],
  processTerm: (term: string): string | null => {
    const t = normalizeText(term);
    return t.length > 1 ? t : null;
  },
  searchOptions: {
    boost: { title: 3, skills: 2, company: 1.5 },
    prefix: true,
    fuzzy: 0.2,
  },
};

export interface SearchDocument {
  id: string;
  title: string;
  company: string;
  skills: string;
  location: string;
  excerpt: string;
}
