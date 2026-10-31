import { describe, expect, it } from 'vitest';
import {
  damerauLevenshtein,
  decodeEntities,
  detectPostingLanguage,
  diceSimilarity,
  fnv1a,
  htmlToText,
  makeExcerpt,
  normalizeText,
  removeContactData,
  slugify,
  truncateAtWord,
} from '../src/text.js';

describe('text', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeEntities('Java &amp; Spring &#8211; Quito &aacute;rea &#x41;')).toBe('Java & Spring – Quito área A');
  });

  it('converts escaped HTML (Greenhouse style) into readable lines', () => {
    const html = '&lt;div&gt;&lt;p&gt;Requisitos:&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Java&lt;/li&gt;&lt;li&gt;SQL&lt;/li&gt;&lt;/ul&gt;&lt;/div&gt;';
    expect(htmlToText(html)).toBe('Requisitos:\n• Java\n• SQL');
    expect(htmlToText(null)).toBe('');
  });

  it('normalizes accents, case and spaces but keeps C#, C++ and .NET symbols', () => {
    expect(normalizeText('  Programación  en C# y .NET  ')).toBe('programacion en c# y .net');
    expect(slugify('Kruger NearShore (Rekluti)')).toBe('kruger-nearshore-rekluti');
  });

  it('removes e-mails, phones and URLs so the public index carries no contact data', () => {
    const text = 'Envía tu CV a talento@empresa.ec o llama al +593 99 123 4567 / (02) 2345 6789. Más en https://empresa.ec/jobs';
    const clean = removeContactData(text);
    expect(clean).not.toMatch(/@|593|2345|https/);
    expect(clean).toContain('[correo omitido]');
    expect(removeContactData('Salario 1200 - 1500 y 5 años')).toBe('Salario 1200 - 1500 y 5 años');
  });

  it('builds excerpts cut at a word boundary', () => {
    expect(truncateAtWord('uno dos tres cuatro', 100)).toBe('uno dos tres cuatro');
    expect(makeExcerpt('a'.repeat(10) + ' ' + 'b'.repeat(10) + ' ' + 'c'.repeat(10), 25)).toBe(`${'a'.repeat(10)} ${'b'.repeat(10)}…`);
  });

  it('measures similarity and edit distance', () => {
    expect(diceSimilarity('Senior Java Developer', 'senior java developer')).toBe(1);
    expect(diceSimilarity('Backend Engineer', 'Recepcionista')).toBeLessThan(0.2);
    expect(damerauLevenshtein('kubernets', 'kubernetes')).toBe(1);
    expect(damerauLevenshtein('javsacript', 'javascript')).toBe(1);
    expect(damerauLevenshtein('abc', 'xyz', 1)).toBe(2);
  });

  it('hashes deterministically', () => {
    expect(fnv1a('norte')).toBe(fnv1a('norte'));
    expect(fnv1a('norte')).not.toBe(fnv1a('sur'));
  });

  it('detects the posting language', () => {
    expect(detectPostingLanguage('Buscamos desarrollador con experiencia en el uso de Java para el equipo de la empresa')).toBe('es');
    expect(detectPostingLanguage('We are looking for an engineer with experience in Java to join our team and you will')).toBe('en');
    expect(detectPostingLanguage('Você terá experiência com Java e não precisa de inglês para a vaga de trabalho')).toBe('pt');
    expect(detectPostingLanguage('Java')).toBe('other');
  });
});
