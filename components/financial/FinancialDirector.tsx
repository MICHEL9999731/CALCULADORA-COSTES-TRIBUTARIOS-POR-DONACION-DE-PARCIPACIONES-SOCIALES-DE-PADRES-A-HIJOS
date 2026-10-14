import React, { useEffect, useMemo, useRef, useState } from 'react';
import { analyze } from '../../financial/engine';
import { emptyDataset, migrateDataset, type FinancialDataset } from '../../financial/schema';
import { sampleDataset } from '../../financial/sampleData';
import { buildDebtTemplateCsv, buildTemplateCsv } from '../../financial/importer';
import { clientId, inClaude, saveFile, type SaveOutcome } from '../../financial/platform';
import { ClientLibrary } from './ClientLibrary';
import { DocumentPanel } from './DocumentPanel';
import { DataEntry } from './DataEntry';
import { DebtEntry } from './DebtEntry';
import { ImportPanel } from './ImportPanel';
import { Report } from './Report';

const STORAGE_KEY = 'direccion-financiera:dataset';

/** Recupera el último trabajo de este navegador; si no hay, abre la empresa de ejemplo. */
const loadStored = (): { data: FinancialDataset; isSample: boolean } => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return { data: migrateDataset(parsed.data ?? parsed), isSample: !!parsed.isSample };
        }
    } catch { /* almacenamiento no disponible */ }
    return { data: sampleDataset(), isSample: true };
};

const btn = 'px-3 py-2 rounded-md text-sm font-medium bg-slate-800 border border-slate-700 hover:bg-slate-700';

/** Hoja de estilos de la página, para que el informe descargado se vea igual. */
const pageCss = (): string =>
    Array.from(document.styleSheets).map(ss => {
        try { return Array.from(ss.cssRules).map(r => r.cssText).join('\n'); } catch { return ''; }
    }).join('\n');

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export const FinancialDirector: React.FC = () => {
    const initial = useMemo(loadStored, []);
    const [data, setDataRaw] = useState<FinancialDataset>(initial.data);
    const [isSample, setIsSample] = useState(initial.isSample);
    const [view, setView] = useState<'input' | 'report'>('input');
    const [panel, setPanel] = useState<'none' | 'import' | 'clients' | 'docs'>('none');
    const [confirmNew, setConfirmNew] = useState(false);
    const [exporting, setExporting] = useState<'html' | 'print' | null>(null);
    const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const reportRef = useRef<HTMLDivElement>(null);
    const embedded = inClaude();

    const setData = (d: FinancialDataset) => { setDataRaw(d); setIsSample(false); };

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, isSample })); } catch { /* sin almacenamiento */ }
    }, [data, isSample]);

    useEffect(() => {
        if (!notice) return;
        const t = setTimeout(() => setNotice(null), 6000);
        return () => clearTimeout(t);
    }, [notice]);

    const analysis = useMemo(() => (view === 'report' ? analyze(data) : null), [data, view]);
    const hasData = Object.values(data.years[0].values).some(v => v !== 0);

    const report = (outcome: SaveOutcome, what: string) => {
        if (outcome === 'saved') setNotice({ tone: 'ok', text: `${what} descargado.` });
        else if (outcome === 'unavailable') setNotice({ tone: 'error', text: 'Las descargas no están disponibles en esta vista. Abra la página en claude.ai con su sesión iniciada.' });
    };
    const offer = async (filename: string, content: string, mime: string, what: string) => report(await saveFile(filename, content, mime), what);

    // Exportación del informe completo: se renderizan todas las secciones y se guarda como HTML.
    useEffect(() => {
        if (!exporting) return;
        const t = setTimeout(async () => {
            if (exporting === 'print') {
                window.print();
            } else if (reportRef.current) {
                const title = `Informe financiero ${data.company.name || ''} ${data.years[0].year}`.trim();
                const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${pageCss()}</style></head>`
                    + `<body class="bg-slate-900 text-slate-200"><div class="max-w-6xl mx-auto p-6">`
                    + `<p class="print:hidden text-sm text-slate-400 mb-6">Para guardarlo en PDF pulse Ctrl+P (Cmd+P en Mac) y elija «Guardar como PDF»: se imprimirá en fondo blanco.</p>`
                    + reportRef.current.innerHTML + `</div></body></html>`;
                await offer(`informe-${clientId(data)}-${data.years[0].year}.html`, html, 'text/html', 'Informe');
            }
            setExporting(null);
        }, 300);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [exporting]);

    const openJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        try {
            setData(migrateDataset(JSON.parse(await f.text())));
            setView('input');
            setNotice({ tone: 'ok', text: `Cliente «${f.name}» abierto.` });
        } catch {
            setNotice({ tone: 'error', text: 'El archivo no es un cliente válido. Use un .json guardado desde esta herramienta.' });
        }
    };

    const toReport = () => { setView('report'); window.scrollTo({ top: 0 }); };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap gap-2 print:hidden">
                <button type="button" className={`px-3 py-2 rounded-md text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white ${panel === 'docs' ? 'ring-2 ring-indigo-300' : ''}`} onClick={() => { setPanel(p => (p === 'docs' ? 'none' : 'docs')); setView('input'); }}>Cargar documentos (Excel / PDF)</button>
                <button type="button" className={`${btn} ${panel === 'clients' ? 'ring-2 ring-indigo-500' : ''}`} onClick={() => setPanel(p => (p === 'clients' ? 'none' : 'clients'))}>Mis clientes</button>
                <button type="button" className={`${btn} ${panel === 'import' ? 'ring-2 ring-indigo-500' : ''}`} onClick={() => { setPanel(p => (p === 'import' ? 'none' : 'import')); setView('input'); }}>Pegar datos</button>
                <button type="button" className={btn} onClick={() => offer('plantilla-balance-pyg.csv', '﻿' + buildTemplateCsv(data.years), 'text/csv;charset=utf-8', 'Plantilla')}>Plantilla CSV</button>
                <button type="button" className={btn} onClick={() => offer('cuadro-de-deuda.csv', '﻿' + buildDebtTemplateCsv(data.debts), 'text/csv;charset=utf-8', 'Cuadro de deuda')}>Plantilla de deuda</button>
                <button type="button" className={btn} onClick={() => offer(`${clientId(data)}-${data.years[0].year}.json`, JSON.stringify(data, null, 2), 'application/json', 'Archivo del cliente')}>Exportar .json</button>
                <button type="button" className={btn} onClick={() => fileRef.current?.click()}>Abrir .json</button>
                <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={openJson} />
                <button type="button" className={btn} onClick={() => { setDataRaw(sampleDataset()); setIsSample(true); setView('input'); }}>Cargar ejemplo</button>
                {!confirmNew ? (
                    <button type="button" className={btn} onClick={() => setConfirmNew(true)}>Nuevo</button>
                ) : (
                    <span className="flex items-center gap-2 px-3 py-1 rounded-md border border-rose-700 bg-rose-950/40 text-sm">
                        ¿Borrar los datos en pantalla?
                        <button type="button" className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 font-semibold" onClick={() => { setData(emptyDataset()); setView('input'); setConfirmNew(false); }}>Sí, empezar de cero</button>
                        <button type="button" className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600" onClick={() => setConfirmNew(false)}>No</button>
                    </span>
                )}
                <div className="ml-auto flex flex-wrap gap-2">
                    {view === 'report' && (
                        <>
                            <button type="button" className={btn} onClick={() => setView('input')}>← Editar datos</button>
                            <button type="button" disabled={!!exporting} className="px-4 py-2 rounded-md text-sm font-semibold bg-slate-200 text-slate-900 hover:bg-white disabled:opacity-50" onClick={() => setExporting('html')}>
                                {exporting === 'html' ? 'Preparando…' : 'Descargar informe'}
                            </button>
                            {!embedded && <button type="button" className={btn} onClick={() => setExporting('print')}>Imprimir / PDF</button>}
                        </>
                    )}
                    {view === 'input' && (
                        <button type="button" disabled={!hasData} className="px-5 py-2 rounded-md font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40" onClick={toReport}>
                            Generar informe →
                        </button>
                    )}
                </div>
            </div>

            {notice && (
                <div role="status" className={`print:hidden px-4 py-2 rounded-md text-sm border ${notice.tone === 'ok' ? 'border-emerald-700 bg-emerald-950/40 text-emerald-200' : 'border-rose-700 bg-rose-950/40 text-rose-200'}`}>
                    {notice.text}
                </div>
            )}

            {isSample && (
                <div className="print:hidden px-4 py-3 rounded-md border border-amber-700 bg-amber-950/30 text-sm text-amber-100">
                    Está viendo <strong>Distribuciones Ejemplo, S.L.</strong>, una empresa ficticia para probar la herramienta. Pulse «Generar informe» para ver el resultado, o «Cargar documentos» para trabajar con un cliente real.
                </div>
            )}

            {panel === 'clients' && (
                <ClientLibrary
                    current={data}
                    onOpen={d => { setData(d); setView('input'); setPanel('none'); setNotice({ tone: 'ok', text: `Cliente «${d.company.name || 'sin nombre'}» abierto.` }); }}
                    onSaved={name => setNotice({ tone: 'ok', text: `«${name}» guardado en Mis clientes.` })}
                    onError={text => setNotice({ tone: 'error', text })}
                />
            )}

            {panel === 'docs' && view === 'input' && (
                <DocumentPanel
                    data={data}
                    replaceByDefault={isSample || !hasData}
                    onApply={(d, summary) => { setData(d); setPanel('none'); setNotice({ tone: 'ok', text: summary }); window.scrollTo({ top: 0 }); }}
                    onClose={() => setPanel('none')}
                />
            )}

            {panel === 'import' && view === 'input' && <ImportPanel data={data} onApply={setData} onClose={() => setPanel('none')} />}

            {view === 'input' && <DataEntry data={data} onChange={setData} />}
            {view === 'input' && <DebtEntry data={data} onChange={setData} />}

            {view === 'input' && (
                <div className="flex justify-end">
                    <button type="button" disabled={!hasData} className="px-6 py-3 rounded-md text-lg font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40" onClick={toReport}>
                        Generar informe del director financiero →
                    </button>
                </div>
            )}

            {view === 'report' && analysis && (
                <div ref={reportRef}>
                    <div className={exporting ? 'mb-6' : 'hidden print:block mb-6'}>
                        <h1 className="text-3xl font-bold">Informe de dirección financiera</h1>
                        <p>{data.company.name} {data.company.cif && `· ${data.company.cif}`} · Ejercicios {data.years[data.years.length - 1].year}-{data.years[0].year} · Emitido el {new Date().toLocaleDateString('es-ES')}</p>
                    </div>
                    <Report analysis={analysis} printAll={!!exporting} />
                </div>
            )}
        </div>
    );
};
