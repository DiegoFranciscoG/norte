import { Injectable, inject } from '@angular/core';
import { analyzeCv, type CvAnalysis } from '@norte/core';
import { DataService } from './data.service';

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Lee el CV con pdf.js EN EL DISPOSITIVO. El archivo y su texto nunca se envían a ningún servidor:
 * no hay fetch ni XHR en este flujo (lo verifica la prueba T-05).
 */
@Injectable({ providedIn: 'root' })
export class CvService {
  private readonly data = inject(DataService);

  async readPdfText(file: File): Promise<string> {
    if (file.type && file.type !== 'application/pdf') throw new Error('El archivo debe ser un PDF.');
    if (file.size > MAX_BYTES) throw new Error('El PDF supera 5 MB.');
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('assets/pdfjs/pdf.worker.min.mjs', document.baseURI).href;
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Sin descargas auxiliares (fuentes, cmaps, wasm): el texto se extrae solo con lo que trae el archivo.
    const task = pdfjs.getDocument({ data: bytes, disableAutoFetch: true, disableStream: true, useWorkerFetch: false, disableFontFace: true, useSystemFonts: false, enableXfa: false });
    const doc = await task.promise;
    try {
      const pages: string[] = [];
      for (let i = 1; i <= Math.min(doc.numPages, 15); i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        pages.push(content.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join(''));
      }
      return pages.join('\n');
    } finally {
      await task.destroy();
    }
  }

  analyze(text: string): CvAnalysis {
    const matcher = this.data.matcher();
    if (!matcher) throw new Error('El catálogo de habilidades aún no se carga.');
    return analyzeCv(text, matcher, this.data.cvClassifier, new Date());
  }
}
