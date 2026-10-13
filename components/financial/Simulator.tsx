import React, { useMemo, useState } from 'react';
import { NO_LEVERS, simulate, type Analysis, type Levers } from '../../financial/engine';
import { eur, pct, times } from '../../financial/format';

const LEVERS: { key: keyof Levers; label: string; min: number; max: number; step: number; unit: string; help: string }[] = [
    { key: 'salesGrowthPct', label: 'Variación de ventas', min: -30, max: 30, step: 1, unit: '%', help: 'Volumen y precio.' },
    { key: 'grossMarginPts', label: 'Mejora del margen bruto', min: -10, max: 10, step: 0.5, unit: 'p.p.', help: 'Subida de precios o mejores compras.' },
    { key: 'personalPct', label: 'Variación de gastos de personal', min: -20, max: 20, step: 1, unit: '%', help: '' },
    { key: 'otherOpexPct', label: 'Variación de gastos generales fijos', min: -30, max: 20, step: 1, unit: '%', help: 'Parte fija de otros gastos de explotación.' },
    { key: 'collectionDaysDelta', label: 'Días de cobro', min: -45, max: 30, step: 1, unit: 'días', help: 'Negativo = cobrar antes.' },
    { key: 'paymentDaysDelta', label: 'Días de pago', min: -30, max: 45, step: 1, unit: 'días', help: 'Positivo = pagar más tarde.' },
    { key: 'inventoryDaysDelta', label: 'Días de existencias', min: -60, max: 30, step: 1, unit: 'días', help: 'Negativo = menos stock.' },
];

export const Simulator: React.FC<{ a: Analysis }> = ({ a }) => {
    const [lv, setLv] = useState<Levers>(NO_LEVERS);
    const res = useMemo(() => simulate(a, lv), [a, lv]);
    const delta = (v: number) => <span className={v > 0.5 ? 'text-emerald-400' : v < -0.5 ? 'text-rose-400' : 'text-slate-400'}>{v >= 0 ? '+' : ''}{eur(v)}</span>;

    return (
        <section id="simulador" className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold text-slate-100">Simulador de palancas</h2>
                <p className="text-sm text-slate-400">Mueva las palancas para cuantificar el efecto anual sobre el EBITDA, el resultado y la tesorería partiendo de {a.company.yearN}.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-4">
                    {LEVERS.map(l => (
                        <label key={l.key} className="block">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-300">{l.label}</span>
                                <span className="tabular-nums font-semibold">{lv[l.key] > 0 ? '+' : ''}{lv[l.key]} {l.unit}</span>
                            </div>
                            <input
                                type="range" min={l.min} max={l.max} step={l.step} value={lv[l.key]}
                                onChange={e => setLv({ ...lv, [l.key]: Number(e.target.value) })}
                                className="w-full accent-indigo-500"
                            />
                            {l.help && <div className="text-xs text-slate-500">{l.help}</div>}
                        </label>
                    ))}
                    <button type="button" className="text-sm text-indigo-300 hover:text-indigo-200" onClick={() => setLv(NO_LEVERS)}>Restablecer</button>
                </div>
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-slate-400 border-b border-slate-700">
                                <th className="text-left py-2 font-medium">Magnitud</th>
                                <th className="text-right font-medium px-2">Actual</th>
                                <th className="text-right font-medium px-2">Simulado</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-t border-slate-800"><td className="py-2">Ventas</td><td className="text-right tabular-nums px-2">{eur(a.n.ventas)}</td><td className="text-right tabular-nums px-2">{eur(res.ventas)}</td></tr>
                            <tr className="border-t border-slate-800"><td className="py-2">EBITDA</td><td className="text-right tabular-nums px-2">{eur(a.n.ebitda)}</td><td className="text-right tabular-nums px-2">{eur(res.ebitda)}</td></tr>
                            <tr className="border-t border-slate-800"><td className="py-2">Margen EBITDA</td><td className="text-right tabular-nums px-2">{pct(a.n.ventas ? a.n.ebitda / a.n.ventas : null)}</td><td className="text-right tabular-nums px-2">{pct(res.ebitdaMargin)}</td></tr>
                            <tr className="border-t border-slate-800"><td className="py-2">Resultado neto</td><td className="text-right tabular-nums px-2">{eur(a.n.resultado)}</td><td className="text-right tabular-nums px-2">{eur(res.resultado)}</td></tr>
                            <tr className="border-t border-slate-800"><td className="py-2">Deuda financiera neta</td><td className="text-right tabular-nums px-2">{eur(a.n.dfn)}</td><td className="text-right tabular-nums px-2">{eur(res.dfnAfter)}</td></tr>
                            <tr className="border-t border-slate-800"><td className="py-2">DFN / EBITDA</td><td className="text-right tabular-nums px-2">{a.n.ebitda > 0 ? times(a.n.dfn / a.n.ebitda) : 'n/d'}</td><td className="text-right tabular-nums px-2">{times(res.dfnEbitdaAfter)}</td></tr>
                        </tbody>
                    </table>
                    <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                        <div className="p-3 rounded bg-slate-900/60"><div className="text-slate-400">Δ EBITDA anual</div><div className="text-lg font-bold tabular-nums">{delta(res.deltaEbitda)}</div></div>
                        <div className="p-3 rounded bg-slate-900/60"><div className="text-slate-400">Δ Resultado neto</div><div className="text-lg font-bold tabular-nums">{delta(res.deltaResultado)}</div></div>
                        <div className="p-3 rounded bg-slate-900/60"><div className="text-slate-400">Caja liberada por circulante</div><div className="text-lg font-bold tabular-nums">{delta(-res.deltaWorkingCapital)}</div></div>
                        <div className="p-3 rounded bg-slate-900/60"><div className="text-slate-400">Impacto total en tesorería</div><div className="text-lg font-bold tabular-nums">{delta(res.cashImpact)}</div></div>
                    </div>
                    <p className="text-xs text-slate-500 mt-3">Estimación simplificada: impuesto al tipo efectivo del ejercicio sobre la mejora, la parte variable de otros gastos se mueve con las ventas y el circulante se recalcula con los nuevos días.</p>
                </div>
            </div>
        </section>
    );
};
