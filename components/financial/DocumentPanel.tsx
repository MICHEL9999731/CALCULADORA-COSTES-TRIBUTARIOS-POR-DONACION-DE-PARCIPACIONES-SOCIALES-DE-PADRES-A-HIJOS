import React, { useEffect, useRef, useState } from 'react';
import type { FinancialDataset } from '../../financial/schema';
import {
    buildAccountsRecheckPrompt, buildExtractionPrompt, buildRecheckPrompt, checkAccounts, mergeExtractions,
    normalizeExtraction, normalizeRows, verifyAmortization,
    type Extraction, type ExtractedLoan, type LoanCheck,
} from '../../financial/documents';
import { parseImport } from '../../financial/importer';
import { getDocumentReader, readerErrorText, type DocumentReader } from '../../financial/platform';
import { computeFigures, normalizeYear } from '../../financial/engine';
import { emptyYear } from '../../financial/schema';
import { eur } from '../../financial/format';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';

type Status = 'pendiente' | 'leyendo' | 'analizando' | 'comprobando' | 'listo' | 'error';

interface Job {
    id: string;
    file: File;
    status: Status;
    detail: string;
    extraction?: Extraction;
    accountProblems?: string[];
    checks?: LoanCheck[];
    pagesInfo?: string;
}

interface Props {
    data: FinancialDataset;
    replaceByDefault: boolean;
    onApply: (d: FinancialDataset, summary: string) => void;
    onClose: () => void;
}

const STATUS_LABEL: Record<Status, string> = {
    pendiente: 'Pendiente', leyendo: 'Leyendo el archivo…', analizando: 'Claude está leyendo el documento…',
    comprobando: 'Comprobando cifras…', listo: 'Leído', error: 'Error',
};

/** Lectura sin Claude (uso local): balance y PyG de Excel/CSV/PDF con el importador de epígrafes del PGC. */
const deterministicExtraction = (file: string, text: string, fallbackYear: number): Extraction | null => {
    const res = parseImport(text);
    if (res.matched < 5) return null;
    return {
        file, company: null, loans: [], notes: [],
        years: res.columns.map((values, i) => ({ year: res.years[i] ?? fallbackYear - i, primary: i === 0, employees: null, values })),
    };
};

export const DocumentPanel: React.FC<Props> = ({ data, replaceByDefault, onApply, onClose }) => {
    const [reader, setReader] = useState<DocumentReader | null | undefined>(undefined);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [running, setRunning] = useState(false);
    const [replace, setReplace] = useState(replaceByDefault);
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const ctl = useRef<AbortController | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let alive = true;
        getDocumentReader().then(r => { if (alive) setReader(r); });
        return () => { alive = false; };
    }, []);

    const update = (id: string, patch: Partial<Job>) => setJobs(js => js.map(j => (j.id === id ? { ...j, ...patch } : j)));

    const addFiles = (list: FileList | null) => {
        if (!list) return;
        const added = Array.from(list).map(file => ({ id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`, file, status: 'pendiente' as Status, detail: '' }));
        setJobs(js => [...js, ...added]);
    };

    const processJob = async (job: Job, signal: AbortSignal) => {
        const { readDocument } = await import('../../financial/readers');
        update(job.id, { status: 'leyendo', detail: '' });
        const doc = await readDocument(job.file, reader?.maxImages ?? 0);
        const pagesInfo = doc.kind === 'pdf'
            ? `${doc.pages} ${doc.pages === 1 ? 'página' : 'páginas'}${doc.scannedPages ? `, ${doc.scannedPages} escaneadas${doc.omittedScannedPages ? ` (${doc.omittedScannedPages} no se han podido enviar)` : ''}` : ''}`
            : doc.kind === 'excel' ? `${doc.pages} ${doc.pages === 1 ? 'hoja' : 'hojas'}` : '';
        update(job.id, { pagesInfo });

        // 1) Excel con epígrafes del PGC y años en la cabecera: se lee sin consultar a Claude.
        let extraction: Extraction | null = null;
        if (doc.kind !== 'pdf' || !reader) {
            const det = deterministicExtraction(job.file.name, doc.text, data.years[0].year);
            if (det && (!reader || (det.years.length && parseImport(doc.text).years[0] !== null && checkAccounts(det.years).length === 0))) extraction = det;
        }
        if (!extraction && !reader) {
            throw new Error(doc.kind === 'pdf' && doc.scannedPages === doc.pages
                ? 'Es un PDF escaneado: para leerlo abra la herramienta en claude.ai.'
                : 'No se han reconocido epígrafes del balance o la PyG. La lectura inteligente de cualquier formato (y de cuadros de préstamos) funciona al abrir la herramienta en claude.ai.');
        }

        // 2) Lectura con Claude
        if (!extraction && reader) {
            update(job.id, { status: 'analizando' });
            const raw = await reader.json(buildExtractionPrompt(job.file.name, doc.text, doc.pageImages.length > 0), { images: doc.pageImages, signal });
            extraction = normalizeExtraction(job.file.name, raw);
        }
        const ex = extraction!;

        // 3) Comprobaciones aritméticas y, si algo no cuadra, una relectura dirigida.
        update(job.id, { status: 'comprobando' });
        let accountProblems = checkAccounts(ex.years);
        if (accountProblems.length && reader && ex.years.length) {
            try {
                const raw = await reader.json(buildAccountsRecheckPrompt(job.file.name, doc.text, ex, accountProblems), { images: doc.pageImages, signal });
                const fixed = normalizeExtraction(job.file.name, { years: raw?.years });
                const fixedProblems = checkAccounts(fixed.years);
                if (fixed.years.length && fixedProblems.length < accountProblems.length) {
                    ex.years = fixed.years;
                    accountProblems = fixedProblems;
                    ex.notes.push('Las cuentas se han releído para corregir descuadres.');
                }
                if (Array.isArray(raw?.notes)) ex.notes.push(...raw.notes.filter((n: unknown) => typeof n === 'string'));
            } catch (e) {
                if ((e as { code?: string })?.code === 'cancelled') throw e;
            }
        }
        const checks: LoanCheck[] = [];
        for (const loan of ex.loans) {
            let check = verifyAmortization(loan);
            if (check.issues.length && reader && loan.rows.length) {
                update(job.id, { detail: `Releyendo el cuadro de ${loan.description || loan.lender || 'un préstamo'} (${check.issues.length} filas no cuadran)…` });
                try {
                    const raw = await reader.json(buildRecheckPrompt(job.file.name, doc.text, loan, check.issues), { images: doc.pageImages, signal });
                    const rows = normalizeRows(raw?.rows);
                    if (rows.length) {
                        const candidate: ExtractedLoan = { ...loan, rows };
                        const recheck = verifyAmortization(candidate);
                        if (recheck.issues.length < check.issues.length) {
                            loan.rows = rows;
                            check = { ...recheck, loan };
                        }
                    }
                    if (Array.isArray(raw?.notes)) ex.notes.push(...raw.notes.filter((n: unknown) => typeof n === 'string'));
                } catch (e) {
                    if ((e as { code?: string })?.code === 'cancelled') throw e;
                }
            }
            checks.push(check);
        }
        update(job.id, { status: 'listo', detail: '', extraction: ex, accountProblems, checks });
    };

    const run = async () => {
        setRunning(true);
        setError(null);
        const controller = new AbortController();
        ctl.current = controller;
        for (const job of jobs.filter(j => j.status === 'pendiente' || j.status === 'error')) {
            if (controller.signal.aborted) break;
            try {
                await processJob(job, controller.signal);
            } catch (e) {
                const code = (e as { code?: string })?.code;
                update(job.id, { status: 'error', detail: code ? readerErrorText(code) : (e as Error)?.message || 'No se ha podido leer el archivo.' });
                if (code === 'cancelled' || code === 'not_granted') break;
            }
        }
        setRunning(false);
    };

    const done = jobs.filter(j => j.status === 'listo' && j.extraction);
    const apply = () => {
        const checks = new Map<ExtractedLoan, LoanCheck>();
        for (const j of done) for (const c of j.checks ?? []) checks.set(c.loan, c);
        const res = mergeExtractions(data, done.map(j => j.extraction!), checks, replace);
        if (!res.yearsUpdated.length && !res.debtsAdded) {
            setError('Los documentos leídos no contienen cuentas ni operaciones de financiación.');
            return;
        }
        const parts = [
            res.yearsUpdated.length ? `ejercicios ${res.yearsUpdated.join(', ')}` : '',
            res.debtsAdded ? `${res.debtsAdded} operaciones de financiación` : '',
        ].filter(Boolean).join(' y ');
        onApply(res.data, `Datos cargados: ${parts}.${res.skippedYears.length ? ` No caben más de 5 ejercicios: se han descartado ${res.skippedYears.join(', ')}.` : ''} Revise las cifras antes de generar el informe.`);
    };

    const totalsOf = (values: Record<string, number>) => {
        const f = computeFigures(normalizeYear({ ...emptyYear(), ...values }).values);
        return f;
    };

    return (
        <Card className="border-indigo-600">
            <CardHeader><CardTitle>Cargar documentos del cliente</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <div className="text-sm text-slate-300 space-y-1">
                    <p>Suba las cuentas anuales, balances y cuentas de resultados (Excel o PDF) y los cuadros de amortización, contratos de leasing, renting y pólizas. Se leen y se rellenan automáticamente.</p>
                    <p className="text-slate-400">Cada cuadro de amortización se comprueba fila a fila: capital pendiente anterior − amortización = capital pendiente, y cuota = intereses + amortización. Las cuentas se comprueban con el cuadre del balance y el resultado. Si algo no cuadra, Claude relee esas filas; lo que siga sin cuadrar se le señala antes de aplicar.</p>
                    {reader === null && <p className="text-amber-300">En esta vista no está disponible la lectura con Claude: solo se leen Excel/CSV con epígrafes del PGC. Para PDF, documentos escaneados y cuadros de préstamos abra la herramienta en claude.ai.</p>}
                    {reader && reader.maxImages === 0 && <p className="text-amber-300">Esta vista no permite enviar imágenes: los PDF escaneados no se podrán leer (los PDF con texto sí).</p>}
                </div>

                <div
                    onDragOver={e => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
                    className={`border-2 border-dashed rounded-lg p-6 text-center ${dragging ? 'border-indigo-400 bg-indigo-950/30' : 'border-slate-600'}`}
                >
                    <p className="text-slate-300">Arrastre aquí los archivos o</p>
                    <button type="button" className="mt-2 px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 font-semibold" onClick={() => fileRef.current?.click()}>Elegir archivos</button>
                    <input id="doc-files" ref={fileRef} type="file" multiple accept=".pdf,.xlsx,.xls,.xlsm,.ods,.csv,.txt" className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
                    <p className="text-xs text-slate-500 mt-2">PDF, Excel (.xlsx, .xls) o CSV. Puede subir varios a la vez.</p>
                </div>

                {jobs.length > 0 && (
                    <ul className="space-y-3">
                        {jobs.map(j => (
                            <li key={j.id} className="border border-slate-700 rounded-md p-3 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold break-all">{j.file.name}</span>
                                    {j.pagesInfo && <span className="text-xs text-slate-500">{j.pagesInfo}</span>}
                                    <span className={`ml-auto text-xs px-2 py-0.5 rounded border ${j.status === 'listo' ? 'border-emerald-700 text-emerald-300' : j.status === 'error' ? 'border-rose-700 text-rose-300' : 'border-slate-600 text-slate-300'}`}>{STATUS_LABEL[j.status]}</span>
                                    {!running && j.status !== 'listo' && <button type="button" aria-label={`Quitar ${j.file.name}`} className="text-xs text-slate-400 hover:text-rose-300" onClick={() => setJobs(js => js.filter(x => x.id !== j.id))}>Quitar</button>}
                                </div>
                                {j.detail && <p className={`text-sm ${j.status === 'error' ? 'text-rose-300' : 'text-slate-400'}`}>{j.detail}</p>}
                                {j.extraction && (
                                    <div className="text-sm space-y-2">
                                        {j.extraction.company && <p className="text-slate-300">Empresa: <strong>{j.extraction.company.name}</strong> {j.extraction.company.cif}</p>}
                                        {j.extraction.years.length > 0 && (
                                            <div className="overflow-x-auto">
                                                <table className="text-xs w-full">
                                                    <thead><tr className="text-slate-400 text-left"><th className="py-1 font-medium">Ejercicio</th><th className="font-medium text-right px-2">Ventas</th><th className="font-medium text-right px-2">Resultado</th><th className="font-medium text-right px-2">Total activo</th><th className="font-medium text-right px-2">Partidas</th></tr></thead>
                                                    <tbody>
                                                        {j.extraction.years.map(y => {
                                                            const f = totalsOf(y.values as Record<string, number>);
                                                            return (
                                                                <tr key={y.year} className="border-t border-slate-800">
                                                                    <td className="py-1">{y.year}{y.primary ? '' : ' (comparativo)'}</td>
                                                                    <td className="text-right tabular-nums px-2">{eur(f.ventas)}</td>
                                                                    <td className="text-right tabular-nums px-2">{eur(f.resultado)}</td>
                                                                    <td className="text-right tabular-nums px-2">{eur(f.activo)}</td>
                                                                    <td className="text-right tabular-nums px-2">{Object.keys(y.values).length}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                        {(j.accountProblems ?? []).map((p, i) => <p key={i} className="text-amber-300">⚠ {p}</p>)}
                                        {(j.checks ?? []).map((c, i) => (
                                            <div key={i} className={`rounded p-2 border ${c.issues.length ? 'border-amber-700 bg-amber-950/20' : 'border-emerald-800 bg-emerald-950/20'}`}>
                                                <div>
                                                    {c.issues.length ? '⚠' : '✓'} <strong>{c.loan.description || c.loan.type}</strong>{c.loan.lender && ` · ${c.loan.lender}`}
                                                    {c.loan.rows.length > 0
                                                        ? <span className="text-slate-400"> · {c.loan.rows.length} cuotas leídas {c.issues.length ? `· ${c.issues.length} no cuadran` : '· todas cuadran'}{c.impliedRate !== null && ` · interés implícito ${c.impliedRate.toFixed(2).replace('.', ',')} %`}</span>
                                                        : <span className="text-slate-400"> · sin cuadro de amortización{c.loan.limit !== null && ` · límite ${eur(c.loan.limit)}`}{c.loan.drawn !== null && ` · dispuesto ${eur(c.loan.drawn)}`}{c.loan.monthlyPayment !== null && ` · cuota ${eur(c.loan.monthlyPayment)}`}</span>}
                                                </div>
                                                {c.issues.length > 0 && (
                                                    <details className="mt-1">
                                                        <summary className="cursor-pointer text-amber-200">Ver filas que no cuadran</summary>
                                                        <ul className="mt-1 space-y-0.5 text-xs text-amber-100">
                                                            {c.issues.slice(0, 30).map((x, k) => <li key={k}>Fila {x.row} ({x.date}): {x.message}</li>)}
                                                            {c.issues.length > 30 && <li>… y {c.issues.length - 30} más</li>}
                                                        </ul>
                                                        <p className="text-xs text-slate-400 mt-1">Compruebe estas filas en el documento original. Si el error está en el propio cuadro del banco, conviene pedirle uno actualizado.</p>
                                                    </details>
                                                )}
                                            </div>
                                        ))}
                                        {j.extraction.notes.length > 0 && (
                                            <ul className="text-xs text-slate-400 list-disc ml-5">{j.extraction.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
                                        )}
                                        {!j.extraction.years.length && !j.extraction.loans.length && <p className="text-amber-300">No se han encontrado cuentas ni operaciones de financiación en este documento.</p>}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                {error && <p className="text-sm text-rose-300">{error}</p>}

                <div className="flex flex-wrap items-center gap-3">
                    {!running ? (
                        <button type="button" disabled={!jobs.some(j => j.status === 'pendiente' || j.status === 'error') || reader === undefined} className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 font-semibold disabled:opacity-40" onClick={run}>
                            Leer documentos
                        </button>
                    ) : (
                        <button type="button" className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600" onClick={() => ctl.current?.abort()}>Detener</button>
                    )}
                    {done.length > 0 && !running && (
                        <>
                            <label className="flex items-center gap-2 text-sm text-slate-300">
                                <input id="doc-replace" type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} />
                                Empezar un cliente nuevo con estos datos (desmarcar para completar el cliente en pantalla)
                            </label>
                            <button type="button" className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 font-semibold" onClick={apply}>Aplicar datos</button>
                        </>
                    )}
                    <button type="button" className="ml-auto px-3 py-2 text-slate-300 hover:text-white" onClick={onClose}>Cerrar</button>
                </div>
            </CardContent>
        </Card>
    );
};
