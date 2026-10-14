// Lectura en el navegador de los archivos que aporta el usuario:
// Excel / CSV (hojas a texto tabulado) y PDF (texto por página y, para las
// páginas escaneadas sin texto, una imagen de la página para que la lea Claude).

import * as XLSX from 'xlsx';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerSource from 'pdfjs-dist/build/pdf.worker.min.js?raw';

export interface ReadDocument {
    file: string;
    kind: 'excel' | 'csv' | 'pdf';
    text: string;
    pages: number;
    /** Imágenes de las páginas sin texto (escaneadas). */
    pageImages: Blob[];
    scannedPages: number;
    /** Páginas escaneadas que no caben en una sola consulta. */
    omittedScannedPages: number;
}

/** Límite de texto que se envía a Claude por documento (el máximo de una consulta es 256 KiB). */
const MAX_CHARS = 180_000;
const KEYWORDS = /balance|activo|pasivo|patrimonio|p[ée]rdidas y ganancias|cifra de negocios|amortizaci[óo]n|pr[ée]stamo|cuota|capital pendiente|leasing|renting|p[óo]liza|vencimiento|inter[ée]s/i;

let workerUrl: string | null = null;
const ensureWorker = () => {
    if (!workerUrl) {
        workerUrl = URL.createObjectURL(new Blob([pdfWorkerSource], { type: 'text/javascript' }));
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    }
};

const fitText = (pages: string[]): string => {
    const all = pages.map((p, i) => `--- Página ${i + 1} ---\n${p}`);
    if (all.join('\n').length <= MAX_CHARS) return all.join('\n');
    // Demasiado largo (p. ej. cuentas anuales con memoria): primero las páginas con estados financieros o deuda.
    const ranked = all.map((p, i) => ({ p, i, hit: KEYWORDS.test(pages[i]) })).sort((a, b) => Number(b.hit) - Number(a.hit) || a.i - b.i);
    const kept: typeof ranked = [];
    let size = 0;
    for (const r of ranked) {
        if (size + r.p.length > MAX_CHARS) continue;
        kept.push(r);
        size += r.p.length;
    }
    return kept.sort((a, b) => a.i - b.i).map(r => r.p).join('\n') + '\n[Se han omitido páginas sin estados financieros ni datos de deuda por su extensión]';
};

async function readExcel(file: File): Promise<ReadDocument> {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const sheets = wb.SheetNames.map(name => {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { FS: '\t', blankrows: false, rawNumbers: true, dateNF: 'yyyy-mm-dd' });
        return `### Hoja: ${name}\n${csv}`;
    });
    return { file: file.name, kind: 'excel', text: fitText(sheets), pages: sheets.length, pageImages: [], scannedPages: 0, omittedScannedPages: 0 };
}

/** Reconstruye las líneas de una página de PDF a partir de la posición de cada fragmento de texto. */
const pageToText = (items: { str: string; transform: number[]; width: number }[]): string => {
    const rows = new Map<number, { x: number; w: number; s: string }[]>();
    for (const it of items) {
        if (!it.str.trim()) continue;
        const y = Math.round(it.transform[5] / 2) * 2;
        const row = rows.get(y) ?? [];
        row.push({ x: it.transform[4], w: it.width, s: it.str });
        rows.set(y, row);
    }
    return [...rows.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, cells]) => {
            cells.sort((a, b) => a.x - b.x);
            let line = '';
            let end = -Infinity;
            for (const c of cells) {
                line += line ? (c.x - end > 8 ? '\t' : ' ') + c.s : c.s;
                end = c.x + c.w;
            }
            return line;
        })
        .join('\n');
};

async function readPdf(file: File, maxImages: number): Promise<ReadDocument> {
    ensureWorker();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const texts: string[] = [];
    const images: Blob[] = [];
    let scanned = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = pageToText(content.items as { str: string; transform: number[]; width: number }[]);
        if (text.replace(/\s/g, '').length < 40) {
            scanned++;
            texts.push('[Página escaneada: se adjunta como imagen]');
            if (images.length < maxImages) {
                const viewport = page.getViewport({ scale: 2 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
                const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
                if (blob) images.push(blob);
            }
        } else {
            texts.push(text);
        }
    }
    return { file: file.name, kind: 'pdf', text: fitText(texts), pages: pdf.numPages, pageImages: images, scannedPages: scanned, omittedScannedPages: Math.max(0, scanned - images.length) };
}

export async function readDocument(file: File, maxImages: number): Promise<ReadDocument> {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) return readPdf(file, maxImages);
    if (/\.(xlsx|xlsm|xls|ods)$/.test(name)) return readExcel(file);
    if (/\.(csv|txt|tsv)$/.test(name)) return { file: file.name, kind: 'csv', text: (await file.text()).slice(0, MAX_CHARS), pages: 1, pageImages: [], scannedPages: 0, omittedScannedPages: 0 };
    throw new Error('Formato no admitido. Use Excel (.xlsx, .xls), CSV o PDF.');
}
