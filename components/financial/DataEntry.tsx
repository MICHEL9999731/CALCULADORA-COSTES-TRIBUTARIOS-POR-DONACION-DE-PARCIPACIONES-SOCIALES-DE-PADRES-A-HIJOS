import React, { useMemo } from 'react';
import {
    BALANCE_LINES, BALANCE_SECTIONS, PYG_LINES, SECTORS,
    type CompanyInfo, type FinancialDataset, type LegalForm, type Sector,
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
    const setValue = (year: 'yearN' | 'yearN1', id: string, v: number | null) =>
        onChange({ ...data, [year]: { ...data[year], [id]: v ?? 0 } });

    const figN = useMemo(() => computeFigures(normalizeYear(data.yearN).values), [data.yearN]);
    const figN1 = useMemo(() => computeFigures(normalizeYear(data.yearN1).values), [data.yearN1]);

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
                    <Field label="Ejercicio analizado (N)">
                        <input type="number" className={textInput} value={c.yearN} onChange={e => setCompany({ yearN: parseInt(e.target.value, 10) || c.yearN })} />
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
                    <div className="grid grid-cols-2 gap-2">
                        <Field label={`Plantilla media ${c.yearN}`}><AmountInput allowEmpty value={c.employeesN} onChange={v => setCompany({ employeesN: v })} placeholder="—" /></Field>
                        <Field label={`Plantilla media ${c.yearN - 1}`}><AmountInput allowEmpty value={c.employeesN1} onChange={v => setCompany({ employeesN1: v })} placeholder="—" /></Field>
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
                                    <th className="w-40 text-right font-medium">{c.yearN}</th>
                                    <th className="w-40 text-right font-medium">{c.yearN - 1}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {BALANCE_SECTIONS.map(s => (
                                    <React.Fragment key={s.id}>
                                        {s.id === 'pn' && (
                                            <tr><td colSpan={3} className="pt-6 pb-1 text-xs uppercase tracking-wider text-indigo-300">Patrimonio neto y pasivo</td></tr>
                                        )}
                                        {s.id === 'anc' && (
                                            <tr><td colSpan={3} className="pt-2 pb-1 text-xs uppercase tracking-wider text-indigo-300">Activo</td></tr>
                                        )}
                                        <tr className="border-t border-slate-700 bg-slate-800/60">
                                            <td className="py-2 font-semibold text-slate-200">{s.label}</td>
                                            <td className="text-right font-semibold tabular-nums">{eur(totalFor(figN, s.id))}</td>
                                            <td className="text-right font-semibold tabular-nums">{eur(totalFor(figN1, s.id))}</td>
                                        </tr>
                                        {BALANCE_LINES.filter(l => l.section === s.id).map(l => (
                                            <tr key={l.id} className="border-t border-slate-800">
                                                <td className="py-1 pr-2 text-slate-300" title={l.hint}>{l.label}{l.hint && <span className="text-slate-500"> ⓘ</span>}</td>
                                                <td className="py-1 pl-2"><AmountInput ariaLabel={`${l.label} ${c.yearN}`} value={data.yearN[l.id] ?? 0} onChange={v => setValue('yearN', l.id, v)} /></td>
                                                <td className="py-1 pl-2"><AmountInput ariaLabel={`${l.label} ${c.yearN - 1}`} value={data.yearN1[l.id] ?? 0} onChange={v => setValue('yearN1', l.id, v)} /></td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="grid md:grid-cols-2 gap-2">
                        <BalanceCheck fig={figN} year={c.yearN} />
                        <BalanceCheck fig={figN1} year={c.yearN - 1} />
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
                                    <th className="w-40 text-right font-medium">{c.yearN}</th>
                                    <th className="w-40 text-right font-medium">{c.yearN - 1}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {PYG_LINES.map(l => (
                                    <React.Fragment key={l.id}>
                                        {l.id === 'ingresosFin' && (
                                            <tr className="border-t border-slate-700 bg-slate-800/60">
                                                <td className="py-2 font-semibold">A.1) Resultado de explotación</td>
                                                <td className="text-right font-semibold tabular-nums">{eur(figN.ebit)}</td>
                                                <td className="text-right font-semibold tabular-nums">{eur(figN1.ebit)}</td>
                                            </tr>
                                        )}
                                        {l.id === 'impuesto' && (
                                            <tr className="border-t border-slate-700 bg-slate-800/60">
                                                <td className="py-2 font-semibold">A.3) Resultado antes de impuestos</td>
                                                <td className="text-right font-semibold tabular-nums">{eur(figN.rai)}</td>
                                                <td className="text-right font-semibold tabular-nums">{eur(figN1.rai)}</td>
                                            </tr>
                                        )}
                                        <tr className="border-t border-slate-800">
                                            <td className="py-1 pr-2 text-slate-300" title={l.hint}>{l.label}{l.hint && <span className="text-slate-500"> ⓘ</span>}</td>
                                            <td className="py-1 pl-2"><AmountInput ariaLabel={`${l.label} ${c.yearN}`} value={data.yearN[l.id] ?? 0} onChange={v => setValue('yearN', l.id, v)} /></td>
                                            <td className="py-1 pl-2"><AmountInput ariaLabel={`${l.label} ${c.yearN - 1}`} value={data.yearN1[l.id] ?? 0} onChange={v => setValue('yearN1', l.id, v)} /></td>
                                        </tr>
                                    </React.Fragment>
                                ))}
                                <tr className="border-t border-slate-700 bg-slate-800/60">
                                    <td className="py-2 font-bold">A.5) Resultado del ejercicio</td>
                                    <td className="text-right font-bold tabular-nums">{eur(figN.resultado)}</td>
                                    <td className="text-right font-bold tabular-nums">{eur(figN1.resultado)}</td>
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
                    <Field label="Disponible en pólizas de crédito (€)" hint="Importe no dispuesto de pólizas y líneas de circulante al cierre.">
                        <AmountInput allowEmpty value={c.creditLinesLimit} onChange={v => setCompany({ creditLinesLimit: v })} placeholder="—" />
                    </Field>
                    <Field label="Cuotas de principal a pagar en N+1 (€)" hint="Si se deja vacío se usa la deuda bancaria y leasing a corto plazo.">
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
