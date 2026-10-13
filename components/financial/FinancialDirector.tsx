import React, { useEffect, useMemo, useRef, useState } from 'react';
import { analyze } from '../../financial/engine';
import { emptyDataset, defaultCompany, emptyYear, type FinancialDataset } from '../../financial/schema';
import { sampleDataset } from '../../financial/sampleData';
import { buildTemplateCsv } from '../../financial/importer';
import { DataEntry } from './DataEntry';
import { ImportPanel } from './ImportPanel';
import { Report } from './Report';

const STORAGE_KEY = 'direccion-financiera:dataset';

const loadStored = (): FinancialDataset => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return hydrate(JSON.parse(raw));
    } catch { /* almacenamiento no disponible */ }
    return emptyDataset();
};

/** Completa un dataset guardado con los campos que puedan faltar (versiones anteriores). */
const hydrate = (d: Partial<FinancialDataset>): FinancialDataset => ({
    version: 1,
    company: { ...defaultCompany(), ...(d.company ?? {}) },
    yearN: { ...emptyYear(), ...(d.yearN ?? {}) },
    yearN1: { ...emptyYear(), ...(d.yearN1 ?? {}) },
});

const download = (name: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'empresa';

const btn = 'px-3 py-2 rounded-md text-sm font-medium bg-slate-800 border border-slate-700 hover:bg-slate-700';

export const FinancialDirector: React.FC = () => {
    const [data, setData] = useState<FinancialDataset>(loadStored);
    const [view, setView] = useState<'input' | 'report'>('input');
    const [showImport, setShowImport] = useState(false);
    const [printAll, setPrintAll] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* sin almacenamiento */ }
    }, [data]);

    const analysis = useMemo(() => (view === 'report' ? analyze(data) : null), [data, view]);
    const hasData = data.yearN.ventas !== 0 || Object.values(data.yearN).some(v => v !== 0);

    useEffect(() => {
        if (!printAll) return;
        const t = setTimeout(() => { window.print(); setPrintAll(false); }, 300);
        return () => clearTimeout(t);
    }, [printAll]);

    const openJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        try {
            setData(hydrate(JSON.parse(await f.text())));
            setView('input');
        } catch {
            alert('El archivo no es un cliente válido (.json guardado desde esta herramienta).');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap gap-2 print:hidden">
                <button type="button" className={btn} onClick={() => setShowImport(s => !s)}>Importar datos</button>
                <button type="button" className={btn} onClick={() => download('plantilla-balance-pyg.csv', '﻿' + buildTemplateCsv(data.yearN, data.yearN1), 'text/csv;charset=utf-8')}>Descargar plantilla CSV</button>
                <button type="button" className={btn} onClick={() => download(`${slug(data.company.name)}-${data.company.yearN}.json`, JSON.stringify(data, null, 2), 'application/json')}>Guardar cliente</button>
                <button type="button" className={btn} onClick={() => fileRef.current?.click()}>Abrir cliente</button>
                <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={openJson} />
                <button type="button" className={btn} onClick={() => { setData(sampleDataset()); setView('input'); }}>Cargar ejemplo</button>
                <button type="button" className={btn} onClick={() => { if (confirm('¿Borrar todos los datos introducidos?')) { setData(emptyDataset()); setView('input'); } }}>Nuevo</button>
                <div className="ml-auto flex gap-2">
                    {view === 'report' && (
                        <>
                            <button type="button" className={btn} onClick={() => setView('input')}>← Editar datos</button>
                            <button type="button" className="px-4 py-2 rounded-md text-sm font-semibold bg-slate-200 text-slate-900 hover:bg-white" onClick={() => setPrintAll(true)}>Imprimir / PDF</button>
                        </>
                    )}
                    {view === 'input' && (
                        <button type="button" disabled={!hasData} className="px-5 py-2 rounded-md font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40" onClick={() => { setView('report'); window.scrollTo({ top: 0 }); }}>
                            Generar informe →
                        </button>
                    )}
                </div>
            </div>

            {showImport && view === 'input' && <ImportPanel data={data} onApply={setData} onClose={() => setShowImport(false)} />}

            {view === 'input' && <DataEntry data={data} onChange={setData} />}

            {view === 'input' && (
                <div className="flex justify-end">
                    <button type="button" disabled={!hasData} className="px-6 py-3 rounded-md text-lg font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40" onClick={() => { setView('report'); window.scrollTo({ top: 0 }); }}>
                        Generar informe del director financiero →
                    </button>
                </div>
            )}

            {view === 'report' && analysis && (
                <>
                    <div className="hidden print:block mb-6">
                        <h1 className="text-3xl font-bold">Informe de dirección financiera</h1>
                        <p>{data.company.name} {data.company.cif && `· ${data.company.cif}`} · Ejercicio {data.company.yearN} · Emitido el {new Date().toLocaleDateString('es-ES')}</p>
                    </div>
                    <Report analysis={analysis} printAll={printAll} />
                </>
            )}
        </div>
    );
};
