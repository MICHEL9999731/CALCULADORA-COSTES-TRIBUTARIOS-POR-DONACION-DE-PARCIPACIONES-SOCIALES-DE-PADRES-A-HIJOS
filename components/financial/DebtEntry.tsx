import React, { useState } from 'react';
import { DEBT_TYPES, newDebtItem, type DebtItem, type DebtType, type FinancialDataset } from '../../financial/schema';
import { DEBT_COLUMNS, parseDebts } from '../../financial/importer';
import { eur } from '../../financial/format';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { AmountInput } from './AmountInput';

interface Props {
    data: FinancialDataset;
    onChange: (d: FinancialDataset) => void;
}

const cellInput = 'w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500';

export const DebtEntry: React.FC<Props> = ({ data, onChange }) => {
    const [paste, setPaste] = useState<string | null>(null);
    const debts = data.debts;
    const yearN = data.years[0].year;
    const set = (debtsNew: DebtItem[]) => onChange({ ...data, debts: debtsNew });
    const update = (id: string, patch: Partial<DebtItem>) => set(debts.map(d => (d.id === id ? { ...d, ...patch } : d)));
    const isRevolving = (t: DebtType) => t === 'poliza' || t === 'descuento';

    const totals = {
        loans: debts.filter(d => !isRevolving(d.type) && d.type !== 'renting').reduce((a, d) => a + d.outstanding, 0),
        drawn: debts.filter(d => isRevolving(d.type)).reduce((a, d) => a + d.outstanding, 0),
        limit: debts.filter(d => isRevolving(d.type)).reduce((a, d) => a + (d.limit ?? 0), 0),
        renting: debts.filter(d => d.type === 'renting').reduce((a, d) => a + (d.monthlyPayment ?? 0), 0),
    };

    const importPasted = (replace: boolean) => {
        const items = parseDebts(paste ?? '');
        if (!items.length) { alert('No se ha reconocido ninguna operación. Revise el orden de las columnas.'); return; }
        set(replace ? items : [...debts, ...items]);
        setPaste(null);
    };

    return (
        <Card>
            <CardHeader><CardTitle>5. Cuadro de financiación y compromisos de pago (opcional, muy recomendable)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-slate-400">
                    Préstamos, hipotecas, leasing, renting, pólizas, líneas de descuento, préstamos de socios y aplazamientos vigentes a 31/12/{yearN}.
                    Con ello se calcula el calendario real de cuotas de los próximos años, el coste medio de la deuda, la liquidez disponible en pólizas y los vencimientos a renovar.
                </p>
                <div className="flex flex-wrap gap-2">
                    <button type="button" className="px-3 py-1.5 rounded-md text-sm bg-indigo-600 hover:bg-indigo-500 font-semibold" onClick={() => set([...debts, newDebtItem()])}>+ Añadir operación</button>
                    <button type="button" className="px-3 py-1.5 rounded-md text-sm bg-slate-700 hover:bg-slate-600" onClick={() => setPaste(paste === null ? '' : null)}>Pegar desde Excel</button>
                </div>

                {paste !== null && (
                    <div className="space-y-2 p-3 border border-slate-600 rounded-md">
                        <p className="text-xs text-slate-400">Pegue filas con estas columnas en este orden (separadas por tabulador o «;»): <strong>{DEBT_COLUMNS.join(' · ')}</strong>. Las fechas pueden ser 06/2028 o 2028-06. Use la plantilla «Descargar cuadro de deuda» para tener las columnas preparadas.</p>
                        <textarea className="w-full h-32 p-2 font-mono text-xs bg-slate-900 border border-slate-600 rounded-md" value={paste} onChange={e => setPaste(e.target.value)} placeholder={'Préstamo\tBanco A\tICO maquinaria\t120.000\t\t4,5\t2.300\t06/2029\t\tPersonal socios'} />
                        <div className="flex gap-2">
                            <button type="button" className="px-3 py-1.5 rounded-md text-sm bg-emerald-600 hover:bg-emerald-500" onClick={() => importPasted(false)}>Añadir a las existentes</button>
                            <button type="button" className="px-3 py-1.5 rounded-md text-sm bg-slate-700 hover:bg-slate-600" onClick={() => importPasted(true)}>Sustituir las existentes</button>
                        </div>
                    </div>
                )}

                {debts.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs min-w-[1100px]">
                            <thead>
                                <tr className="text-slate-400 text-left">
                                    <th className="py-2 font-medium w-40">Tipo</th>
                                    <th className="font-medium">Entidad</th>
                                    <th className="font-medium">Descripción</th>
                                    <th className="font-medium text-right w-28">Pendiente / dispuesto €</th>
                                    <th className="font-medium text-right w-24">Límite €</th>
                                    <th className="font-medium text-right w-16">Interés %</th>
                                    <th className="font-medium text-right w-24">Cuota mensual €</th>
                                    <th className="font-medium w-28">Vencimiento</th>
                                    <th className="font-medium w-28">Carencia hasta</th>
                                    <th className="font-medium">Garantía</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {debts.map(d => {
                                    const rev = isRevolving(d.type);
                                    const renting = d.type === 'renting';
                                    return (
                                        <tr key={d.id} className="border-t border-slate-800 align-top">
                                            <td className="py-1 pr-1">
                                                <select className={cellInput} value={d.type} onChange={e => update(d.id, { type: e.target.value as DebtType })} title={DEBT_TYPES.find(t => t.id === d.type)?.hint}>
                                                    {DEBT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                                </select>
                                            </td>
                                            <td className="pr-1"><input className={cellInput} value={d.lender} onChange={e => update(d.id, { lender: e.target.value })} /></td>
                                            <td className="pr-1"><input className={cellInput} value={d.description} onChange={e => update(d.id, { description: e.target.value })} /></td>
                                            <td className="pr-1">{renting ? <span className="block px-2 py-1 text-slate-500">fuera de balance</span> : <AmountInput value={d.outstanding} onChange={v => update(d.id, { outstanding: v ?? 0 })} />}</td>
                                            <td className="pr-1">{rev ? <AmountInput allowEmpty value={d.limit} onChange={v => update(d.id, { limit: v })} placeholder="—" /> : <span className="block px-2 py-1 text-slate-600">—</span>}</td>
                                            <td className="pr-1">{renting ? <span className="block px-2 py-1 text-slate-600">—</span> : <AmountInput allowEmpty value={d.rate} onChange={v => update(d.id, { rate: v })} placeholder="—" />}</td>
                                            <td className="pr-1">{rev ? <span className="block px-2 py-1 text-slate-600">—</span> : <AmountInput allowEmpty value={d.monthlyPayment} onChange={v => update(d.id, { monthlyPayment: v })} placeholder="—" />}</td>
                                            <td className="pr-1"><input type="month" className={cellInput} value={d.maturity} onChange={e => update(d.id, { maturity: e.target.value })} /></td>
                                            <td className="pr-1">{rev || renting ? <span className="block px-2 py-1 text-slate-600">—</span> : <input type="month" className={cellInput} value={d.graceUntil} onChange={e => update(d.id, { graceUntil: e.target.value })} />}</td>
                                            <td className="pr-1"><input className={cellInput} value={d.guarantee} placeholder="Personal, hipotecaria, ICO…" onChange={e => update(d.id, { guarantee: e.target.value })} /></td>
                                            <td><button type="button" aria-label="Eliminar operación" className="px-2 py-1 text-rose-300 hover:text-rose-200" onClick={() => set(debts.filter(x => x.id !== d.id))}>✕</button></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {debts.length > 0 && (
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-300">
                        <span>Préstamos, leasing y otros: <strong className="tabular-nums">{eur(totals.loans)}</strong></span>
                        <span>Pólizas: dispuesto <strong className="tabular-nums">{eur(totals.drawn)}</strong> de <strong className="tabular-nums">{eur(totals.limit)}</strong></span>
                        <span>Renting: <strong className="tabular-nums">{eur(totals.renting)}</strong> al mes</span>
                    </div>
                )}
                <p className="text-xs text-slate-500">Si no conoce la cuota de un préstamo, deje la cuota vacía e indique el vencimiento: se estimará por el método francés. En el leasing incluya la opción de compra en la última cuota o como pendiente.</p>
            </CardContent>
        </Card>
    );
};
