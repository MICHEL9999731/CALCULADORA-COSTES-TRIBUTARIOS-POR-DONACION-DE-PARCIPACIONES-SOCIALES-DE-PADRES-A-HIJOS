import React, { useState } from 'react';
import { parseImport, type ImportResult } from '../../financial/importer';
import { BALANCE_LINES, PYG_LINES, type FinancialDataset } from '../../financial/schema';
import { eur } from '../../financial/format';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';

interface Props {
    data: FinancialDataset;
    onApply: (d: FinancialDataset) => void;
    onClose: () => void;
}

const labelOf = (id: string) => [...BALANCE_LINES, ...PYG_LINES].find(l => l.id === id)?.label ?? id;

export const ImportPanel: React.FC<Props> = ({ data, onApply, onClose }) => {
    const [text, setText] = useState('');
    const [result, setResult] = useState<ImportResult | null>(null);
    const [replace, setReplace] = useState(true);

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const t = await f.text();
        setText(t);
        setResult(parseImport(t));
    };

    const apply = () => {
        if (!result) return;
        const merge = (base: Record<string, number>, add: Partial<Record<string, number>>) => {
            const out = replace ? Object.fromEntries(Object.keys(base).map(k => [k, 0])) : { ...base };
            for (const [k, v] of Object.entries(add)) if (typeof v === 'number') out[k] = v;
            return out;
        };
        onApply({ ...data, yearN: merge(data.yearN, result.yearN), yearN1: merge(data.yearN1, result.yearN1) });
        onClose();
    };

    return (
        <Card className="border-indigo-600">
            <CardHeader><CardTitle>Importar balance y cuenta de resultados</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <div className="text-sm text-slate-400 space-y-1">
                    <p>Tres formas de cargar los datos:</p>
                    <ol className="list-decimal ml-5 space-y-1">
                        <li><strong>Pegar desde Excel o el programa de contabilidad</strong>: copie las filas del balance y de la PyG (concepto, importe {data.company.yearN}, importe {data.company.yearN - 1}) y péguelas abajo. Se reconocen los epígrafes del PGC (modelos normal y abreviado), incluidos los encabezados "Activo corriente", "Pasivo no corriente"… para distinguir largo y corto plazo.</li>
                        <li><strong>Plantilla CSV</strong>: descargue la plantilla, rellénela en Excel y súbala.</li>
                        <li><strong>Archivo .json</strong> guardado previamente con "Guardar cliente" (use el botón "Abrir cliente").</li>
                    </ol>
                </div>
                <textarea
                    className="w-full h-48 p-3 font-mono text-xs bg-slate-900 border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder={'A) ACTIVO NO CORRIENTE\t1.100.000\t970.000\nII. Inmovilizado material\t1.035.000\t900.000\n...'}
                    value={text}
                    onChange={e => { setText(e.target.value); setResult(null); }}
                />
                <div className="flex flex-wrap gap-3 items-center">
                    <button type="button" className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 font-semibold" onClick={() => setResult(parseImport(text))} disabled={!text.trim()}>
                        Analizar texto
                    </button>
                    <label className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 cursor-pointer">
                        Subir CSV / TXT
                        <input type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={handleFile} />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} />
                        Sustituir todos los importes actuales (desmarcar para completar solo las partidas importadas)
                    </label>
                    <button type="button" className="ml-auto px-4 py-2 rounded-md text-slate-300 hover:text-white" onClick={onClose}>Cancelar</button>
                </div>

                {result && (
                    <div className="space-y-3">
                        <p className="text-sm">
                            Se han reconocido <strong>{result.matched}</strong> partidas. Revise la vista previa antes de aplicar.
                        </p>
                        <div className="max-h-80 overflow-auto border border-slate-700 rounded-md">
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-slate-800">
                                    <tr>
                                        <th className="text-left p-2">Línea pegada</th>
                                        <th className="text-left p-2">Se asigna a</th>
                                        <th className="text-right p-2">{data.company.yearN}</th>
                                        <th className="text-right p-2">{data.company.yearN - 1}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.lines.map((l, i) => (
                                        <tr key={i} className={`border-t border-slate-800 ${l.id && !l.ignoredReason ? '' : 'text-slate-500'}`}>
                                            <td className="p-2">{l.label}</td>
                                            <td className="p-2">{l.id && !l.ignoredReason ? <span className="text-emerald-300">{labelOf(l.id)}</span> : l.ignoredReason}</td>
                                            <td className="p-2 text-right tabular-nums">{eur(l.n)}</td>
                                            <td className="p-2 text-right tabular-nums">{eur(l.n1)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <button type="button" className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 font-semibold disabled:opacity-50" onClick={apply} disabled={!result.matched}>
                            Aplicar importación
                        </button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
