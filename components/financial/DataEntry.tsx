import React, { useMemo, useState } from 'react';
import {
    BALANCE_LINES, BALANCE_SECTIONS, MAX_YEARS, PYG_LINES, SECTORS, emptyYearData,
    type CompanyInfo, type FinancialDataset, type LegalForm, type Sector, type YearData,
} from '../../financial/schema';
import { computeFigures, normalizeYear } from '../../financial/engine';
import { eur } from '../../financial/format';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { AmountInput } from './AmountInput';

interface Props {
    data: FinancialDataset;
    onChange: (d: FinancialDataset) => void;
}

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
    <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-300">{label}</span>
        {children}
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
);

const textInput = 'w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500';

export const DataEntry: React.FC<Props> = ({ data, onChange }) => {
    const c = data.company;
    const setCompany = (patch: Partial<CompanyInfo>) => onChange({ ...data, company: { ...c, ...patch } });
    const years = data.years;
    const [confirmRemove, setConfirmRemove] = useState(false);
    const setYear = (i: number, patch: Partial<YearData>) =>
        onChange({ ...data, years: years.map((y, k) => (k === i ? { ...y, ...patch } : y)) });
    const setValue = (i: number, id: string, v: number | null) =>
        setYear(i, { values: { ...years[i].values, [id]: v ?? 0 } });
    const setLastYear = (year: number) =>
        onChange({ ...data, years: years.map((y, k) => ({ ...y, year: year - k })) });
    const addYear = () => onChange({ ...data, years: [...years, emptyYearData(years[years.length - 1].year - 1)] });
    const removeYear = () => onChange({ ...data, years: years.slice(0, -1) });

    const figs = useMemo(() => years.map(y => computeFigures(normalizeYear(y.values).values)), [years]);
    const yearN = years[0].year;
    const colW = years.length > 3 ? 'w-32' : 'w-40';

    const totalFor = (fig: ReturnType<typeof computeFigures>, s: string) =>
        ({ anc: fig.anc, ac: fig.ac, pn: fig.pn, pnc: fig.pnc, pc: fig.pc } as Record<string, number>)[s];

    const BalanceCheck: React.FC<{ fig: ReturnType<typeof computeFigures>; year: number }> = ({ fig, year }) => {
        const diff = fig.activo - fig.pnYPasivo;
        const ok = Math.abs(diff) < 1;
        const empty = fig.activo === 0 && fig.pnYPasivo === 0;
        return (
            <div className={`text-sm px-3 py-2 rounded-md border ${empty ? 'border-slate-700 text-slate-400' : ok ? 'border-emerald-700 bg-emerald-900/30 text-emerald-300' : 'border-rose-700 bg-rose-900/30 text-rose-300'}`}>
                <strong>{year}:</strong> Activo {eur(fig.activo)} · PN + Pasivo {eur(fig.pnYPasivo)}{' '}
                {empty ? '' : ok ? '✓ cuadra' : `✕ diferencia ${eur(diff)}`}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader><CardTitle>1. Datos de la empresa</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label="Razón social"><input className={textInput} value={c.name} onChange={e => setCompany({ name: e.target.value })} /></Field>
                    <Field label="CIF"><input className={textInput} value={c.cif} onChange={e => setCompany({ cif: e.target.value })} /></Field>
                    <Field label="Último ejercicio cerrado (N)" hint="Los anteriores se numeran automáticamente.">
                        <input type="number" className={textInput} value={yearN} onChange={e => { const v = parseInt(e.target.value, 10); if (v >= 1990 && v <= 2100) setLastYear(v); }} />
                    </Field>
                    <Field label="Sector" hint="Ajusta las referencias de los ratios y el modelo de Altman.">
                        <select className={textInput} value={c.sector} onChange={e => setCompany({ sector: e.target.value as Sector })}>
                            {SECTORS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                    </Field>
                    <Field label="Forma jurídica">
                        <select className={textInput} value={c.legalForm} onChange={e => setCompany({ legalForm: e.target.value as LegalForm })}>
                            <option value="SL">Sociedad limitada</option>
                            <option value="SA">Sociedad anónima</option>
                            <option value="otra">Otra</option>
                        </select>
                    </Field>
                    <div className="md:col-span-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="text-sm font-medium text-slate-300">Ejercicios a analizar: {years.length}</span>
                            <button type="button" disabled={years.length >= MAX_YEARS} onClick={addYear} className="px-3 py-1 rounded-md text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-40">+ Añadir {years[years.length - 1].year - 1}</button>
                            {confirmRemove ? (
                                <span className="flex items-center gap-2 text-sm">
                                    ¿Quitar {years[years.length - 1].year} y sus datos?
                                    <button type="button" onClick={() => { removeYear(); setConfirmRemove(false); }} className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500">Sí, quitar</button>
                                    <button type="button" onClick={() => setConfirmRemove(false)} className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600">No</button>
                                </span>
                            ) : (
                                <button type="button" disabled={years.length <= 2} onClick={() => setConfirmRemove(true)} className="px-3 py-1 rounded-md text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-40">− Quitar {years[years.length - 1].year}</button>
                            )}
                            <span className="text-xs text-slate-500">Hasta {MAX_YEARS} ejercicios. Con 3 o más se analizan tendencias.</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                            {years.map((y, i) => (
                                <Field key={y.year} label={`Plantilla media ${y.year}`}>
                                    <AmountInput allowEmpty value={y.employees} onChange={v => setYear(i, { employees: v })} placeholder="—" />
                                </Field>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>2. Balance de situación comparativo</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm text-slate-400">Importes en euros tal y como figuran en las cuentas anuales. Las partidas entre paréntesis restan.</p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-400">
                                    <th className="text-left font-medium py-2">Partida</th>
                                    {years.map(y => <th key={y.year} className={`${colW} text-right font-medium`}>{y.year}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {BALANCE_SECTIONS.map(s => (
                                    <React.Fragment key={s.id}>
                                        {s.id === 'pn' && (
                                            <tr><td colSpan={years.length + 1} className="pt-6 pb-1 text-xs uppercase tracking-wider text-indigo-300">Patrimonio neto y pasivo</td></tr>
                                        )}
                                        {s.id === 'anc' && (
                                            <tr><td colSpan={years.length + 1} className="pt-2 pb-1 text-xs uppercase tracking-wider text-indigo-300">Activo</td></tr>
                                        )}
                                        <tr className="border-t border-slate-700 bg-slate-800/60">
                                            <td className="py-2 font-semibold text-slate-200">{s.label}</td>
                                            {figs.map((f, i) => <td key={i} className="text-right font-semibold tabular-nums">{eur(totalFor(f, s.id))}</td>)}
                                        </tr>
                                        {BALANCE_LINES.filter(l => l.section === s.id).map(l => (
                                            <tr key={l.id} className="border-t border-slate-800">
                                                <td className="py-1 pr-2 text-slate-300" title={l.hint}>{l.label}{l.hint && <span className="text-slate-500"> ⓘ</span>}</td>
                                                {years.map((y, i) => (
                                                    <td key={y.year} className="py-1 pl-2"><AmountInput ariaLabel={`${l.label} ${y.year}`} value={y.values[l.id] ?? 0} onChange={v => setValue(i, l.id, v)} /></td>
                                                ))}
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="grid md:grid-cols-2 gap-2">
                        {figs.map((f, i) => <BalanceCheck key={i} fig={f} year={years[i].year} />)}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>3. Cuenta de pérdidas y ganancias comparativa</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm text-slate-400">Introduzca los gastos en negativo, como en las cuentas anuales (si los introduce en positivo se corrigen automáticamente).</p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-400">
                                    <th className="text-left font-medium py-2">Partida</th>
                                    {years.map(y => <th key={y.year} className={`${colW} text-right font-medium`}>{y.year}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {PYG_LINES.map(l => (
                                    <React.Fragment key={l.id}>
                                        {l.id === 'ingresosFin' && (
                                            <tr className="border-t border-slate-700 bg-slate-800/60">
                                                <td className="py-2 font-semibold">A.1) Resultado de explotación</td>
                                                {figs.map((f, i) => <td key={i} className="text-right font-semibold tabular-nums">{eur(f.ebit)}</td>)}
                                            </tr>
                                        )}
                                        {l.id === 'impuesto' && (
                                            <tr className="border-t border-slate-700 bg-slate-800/60">
                                                <td className="py-2 font-semibold">A.3) Resultado antes de impuestos</td>
                                                {figs.map((f, i) => <td key={i} className="text-right font-semibold tabular-nums">{eur(f.rai)}</td>)}
                                            </tr>
                                        )}
                                        <tr className="border-t border-slate-800">
                                            <td className="py-1 pr-2 text-slate-300" title={l.hint}>{l.label}{l.hint && <span className="text-slate-500"> ⓘ</span>}</td>
                                            {years.map((y, i) => (
                                                <td key={y.year} className="py-1 pl-2"><AmountInput ariaLabel={`${l.label} ${y.year}`} value={y.values[l.id] ?? 0} onChange={v => setValue(i, l.id, v)} /></td>
                                            ))}
                                        </tr>
                                    </React.Fragment>
                                ))}
                                <tr className="border-t border-slate-700 bg-slate-800/60">
                                    <td className="py-2 font-bold">A.5) Resultado del ejercicio</td>
                                    {figs.map((f, i) => <td key={i} className="text-right font-bold tabular-nums">{eur(f.resultado)}</td>)}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>4. Información complementaria (opcional, mejora el análisis)</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label="IVA medio en ventas y compras (%)" hint="Para calcular bien los días de cobro y pago. Ponga 0 si exporta o no repercute IVA.">
                        <AmountInput value={c.vatRate} allowEmpty onChange={v => setCompany({ vatRate: v ?? 0 })} />
                    </Field>
                    <Field label="Plazo de cobro pactado (días)" hint="Plazo medio de las condiciones comerciales con clientes.">
                        <AmountInput allowEmpty value={c.agreedCollectionDays} onChange={v => setCompany({ agreedCollectionDays: v })} placeholder="—" />
                    </Field>
                    <Field label="Plazo de pago pactado (días)">
                        <AmountInput allowEmpty value={c.agreedPaymentDays} onChange={v => setCompany({ agreedPaymentDays: v })} placeholder="—" />
                    </Field>
                    <Field label="Disponible en pólizas de crédito (€)" hint="Importe no dispuesto al cierre. No hace falta si detalla las pólizas en el cuadro de financiación.">
                        <AmountInput allowEmpty value={c.creditLinesLimit} onChange={v => setCompany({ creditLinesLimit: v })} placeholder="—" />
                    </Field>
                    <Field label="Cuotas de principal a pagar en N+1 (€)" hint="No hace falta si detalla los préstamos en el cuadro de financiación. Si todo queda vacío se usa la deuda bancaria y leasing a corto.">
                        <AmountInput allowEmpty value={c.nextYearDebtService} onChange={v => setCompany({ nextYearDebtService: v })} placeholder="—" />
                    </Field>
                    <Field label="Objetivo máximo DFN / EBITDA" hint="Nivel de deuda aceptable. Habitual: 2,5x - 3,5x.">
                        <AmountInput value={c.targetLeverage} onChange={v => setCompany({ targetLeverage: v && v > 0 ? v : 3 })} />
                    </Field>
                    <Field label="% de gastos de personal variables" hint="Comisiones, incentivos, ETT… (para el punto muerto).">
                        <AmountInput allowEmpty value={c.variablePersonalPct} onChange={v => setCompany({ variablePersonalPct: v ?? 0 })} />
                    </Field>
                    <Field label="% de otros gastos de explotación variables" hint="Transportes, comisiones, suministros ligados a la producción…">
                        <AmountInput allowEmpty value={c.variableOtherOpexPct} onChange={v => setCompany({ variableOtherOpexPct: v ?? 0 })} />
                    </Field>
                    <Field label="Notas y hechos relevantes" hint="Se incluyen en el informe.">
                        <textarea className={`${textInput} h-24`} value={c.notes} onChange={e => setCompany({ notes: e.target.value })} />
                    </Field>
                </CardContent>
            </Card>
        </div>
    );
};
