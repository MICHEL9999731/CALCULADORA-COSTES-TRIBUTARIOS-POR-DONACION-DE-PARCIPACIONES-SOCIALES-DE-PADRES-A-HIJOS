import React, { useState } from 'react';
import type { Analysis, Finding, Ratio, RowComparison, Status } from '../../financial/engine';
import { eur, fmt, pct, signedPct, times, isNum } from '../../financial/format';
import { Simulator } from './Simulator';

// ---------------------------------------------------------------------------
// Piezas comunes
// ---------------------------------------------------------------------------

const STATUS_STYLE: Record<Status, { cls: string; icon: string; text: string }> = {
    good: { cls: 'bg-emerald-900/40 text-emerald-300 border-emerald-700', icon: '✓', text: 'Bien' },
    warn: { cls: 'bg-amber-900/40 text-amber-300 border-amber-700', icon: '!', text: 'Vigilar' },
    bad: { cls: 'bg-rose-900/40 text-rose-300 border-rose-700', icon: '✕', text: 'Débil' },
    neutral: { cls: 'bg-slate-800 text-slate-400 border-slate-600', icon: '·', text: 'Informativo' },
};

const SEVERITY_STYLE: Record<Finding['severity'], { cls: string; icon: string; text: string }> = {
    critical: { cls: 'border-rose-600 bg-rose-950/40', icon: '✕', text: 'Crítico' },
    warning: { cls: 'border-amber-600 bg-amber-950/30', icon: '!', text: 'Atención' },
    info: { cls: 'border-sky-700 bg-sky-950/30', icon: 'i', text: 'Información' },
    positive: { cls: 'border-emerald-700 bg-emerald-950/30', icon: '✓', text: 'Fortaleza' },
};

const Badge: React.FC<{ status: Status }> = ({ status }) => {
    const s = STATUS_STYLE[status];
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border whitespace-nowrap ${s.cls}`}>{s.icon} {s.text}</span>;
};

const Section: React.FC<{ id: string; title: string; subtitle?: string; children: React.ReactNode }> = ({ id, title, subtitle, children }) => (
    <section id={id} className="space-y-4 print:break-before-page">
        <div>
            <h2 className="text-2xl font-bold text-slate-100 print:text-black">{title}</h2>
            {subtitle && <p className="text-sm text-slate-400 print:text-slate-600">{subtitle}</p>}
        </div>
        {children}
    </section>
);

const Box: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div className={`bg-slate-800/50 border border-slate-700 rounded-lg p-4 print:bg-white print:border-slate-300 ${className}`}>{children}</div>
);

const varClass = (v: number | null, higherIsBetter = true) =>
    !isNum(v) || Math.abs(v) < 0.005 ? 'text-slate-400' : (v > 0) === higherIsBetter ? 'text-emerald-400' : 'text-rose-400';

const Kpi: React.FC<{ label: string; n: number; n1: number; format?: 'eur' | 'pct' | 'x'; higherIsBetter?: boolean; note?: string }> = ({ label, n, n1, format = 'eur', higherIsBetter = true, note }) => {
    const change = n1 !== 0 ? (n - n1) / Math.abs(n1) : null;
    return (
        <Box>
            <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
            <div className="text-2xl font-bold tabular-nums mt-1">{fmt(n, format)}</div>
            <div className="text-xs text-slate-400 mt-1 tabular-nums">
                Año anterior {fmt(n1, format)}{' '}
                {format === 'eur' && isNum(change) && <span className={varClass(change, higherIsBetter)}>({signedPct(change)})</span>}
            </div>
            {note && <div className="text-xs text-slate-500 mt-1">{note}</div>}
        </Box>
    );
};

// ---------------------------------------------------------------------------
// Secciones
// ---------------------------------------------------------------------------

const ExecutiveSummary: React.FC<{ a: Analysis }> = ({ a }) => {
    const scoreColor = a.score >= 65 ? 'text-emerald-400' : a.score >= 50 ? 'text-amber-300' : 'text-rose-400';
    const critical = a.checks.filter(c => c.severity !== 'info');
    return (
        <Section id="resumen" title="Resumen ejecutivo" subtitle={`${a.company.name || 'Empresa'} · Ejercicio ${a.company.yearN} comparado con ${a.company.yearN - 1}`}>
            <div className="grid md:grid-cols-4 gap-4">
                <Box className="md:col-span-1 flex flex-col items-center justify-center text-center">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Valoración global</div>
                    <div className={`text-5xl font-extrabold tabular-nums ${scoreColor}`}>{a.score}</div>
                    <div className="text-xs text-slate-500">sobre 100</div>
                    <div className={`mt-2 font-semibold ${scoreColor}`}>{a.grade}</div>
                </Box>
                <Box className="md:col-span-3 space-y-3 text-slate-200 leading-relaxed">
                    {a.summary.map((p, i) => <p key={i}>{p}</p>)}
                </Box>
            </div>

            {critical.length > 0 && (
                <div className="space-y-2">
                    {critical.map((c, i) => (
                        <div key={i} className={`border-l-4 rounded p-3 ${c.severity === 'critical' ? 'border-rose-600 bg-rose-950/40' : 'border-amber-600 bg-amber-950/30'}`}>
                            <div className="font-semibold">{c.severity === 'critical' ? '✕' : '!'} {c.title}</div>
                            <div className="text-sm text-slate-300">{c.detail}</div>
                        </div>
                    ))}
                </div>
            )}
            {a.warnings.map((w, i) => <p key={i} className="text-xs text-amber-300">⚠ {w}</p>)}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Kpi label="Cifra de negocios" n={a.n.ventas} n1={a.n1.ventas} />
                <Kpi label="EBITDA" n={a.n.ebitda} n1={a.n1.ebitda} note={`Margen ${pct(a.n.ventas ? a.n.ebitda / a.n.ventas : null)}`} />
                <Kpi label="Resultado neto" n={a.n.resultado} n1={a.n1.resultado} />
                <Kpi label="Patrimonio neto" n={a.n.pn} n1={a.n1.pn} />
                <Kpi label="Deuda financiera neta" n={a.n.dfn} n1={a.n1.dfn} higherIsBetter={false} note={a.n.ebitda > 0 ? `${times(a.n.dfn / a.n.ebitda)} EBITDA` : undefined} />
                <Kpi label="Tesorería" n={a.n.liquidez} n1={a.n1.liquidez} />
                <Kpi label="Fondo de maniobra" n={a.n.fm} n1={a.n1.fm} />
                <Kpi label="Necesidades operativas de fondos" n={a.n.nof} n1={a.n1.nof} higherIsBetter={false} />
            </div>
            {a.company.notes && (
                <Box><div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Notas del cliente</div><p className="text-sm whitespace-pre-wrap">{a.company.notes}</p></Box>
            )}
        </Section>
    );
};

const Diagnosis: React.FC<{ a: Analysis }> = ({ a }) => {
    const areas = Array.from(new Set(a.findings.map(f => f.area)));
    return (
        <Section id="diagnostico" title="Diagnóstico" subtitle="Fortalezas y debilidades detectadas, ordenadas por gravedad.">
            <div className="grid md:grid-cols-2 gap-4">
                {areas.map(area => (
                    <Box key={area} className="space-y-2">
                        <h3 className="font-semibold text-indigo-300">{area}</h3>
                        {a.findings.filter(f => f.area === area).map((f, i) => {
                            const s = SEVERITY_STYLE[f.severity];
                            return (
                                <div key={i} className={`border-l-4 rounded p-2 ${s.cls}`}>
                                    <div className="text-sm font-semibold">{s.icon} {f.title} <span className="text-xs font-normal text-slate-400">· {s.text}</span></div>
                                    <div className="text-sm text-slate-300">{f.detail}</div>
                                </div>
                            );
                        })}
                    </Box>
                ))}
            </div>
        </Section>
    );
};

const ActionPlan: React.FC<{ a: Analysis }> = ({ a }) => (
    <Section id="plan" title="Plan de acción" subtitle="Recomendaciones del director financiero, priorizadas y con impacto estimado.">
        <div className="space-y-3">
            {a.recommendations.map((r, i) => (
                <Box key={i} className="flex gap-4">
                    <div className={`shrink-0 w-16 h-16 rounded-lg flex flex-col items-center justify-center text-xs font-bold border ${r.priority === 'Alta' ? 'border-rose-600 text-rose-300' : r.priority === 'Media' ? 'border-amber-600 text-amber-300' : 'border-slate-500 text-slate-300'}`}>
                        <span className="text-lg">{i + 1}</span>{r.priority}
                    </div>
                    <div className="space-y-1">
                        <div className="text-xs uppercase tracking-wide text-slate-400">{r.area} · {r.horizon}</div>
                        <div className="font-semibold text-slate-100">{r.title}</div>
                        <div className="text-sm text-slate-300">{r.detail}</div>
                        {r.impact && <div className="text-sm text-emerald-300">Impacto estimado: {r.impact}</div>}
                    </div>
                </Box>
            ))}
        </div>
    </Section>
);

const ComparisonTable: React.FC<{ rows: RowComparison[]; yearN: number; weightLabel: string; expenseAware?: boolean }> = ({ rows, yearN, weightLabel, expenseAware }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-sm">
            <thead>
                <tr className="text-slate-400 border-b border-slate-700">
                    <th className="text-left py-2 font-medium">Partida</th>
                    <th className="text-right font-medium px-2">{yearN}</th>
                    <th className="text-right font-medium px-2">{weightLabel}</th>
                    <th className="text-right font-medium px-2">{yearN - 1}</th>
                    <th className="text-right font-medium px-2">{weightLabel}</th>
                    <th className="text-right font-medium px-2">Var. €</th>
                    <th className="text-right font-medium px-2">Var. %</th>
                </tr>
            </thead>
            <tbody>
                {rows.map(r => {
                    // En la PyG los gastos son negativos: una variación positiva siempre mejora el resultado.
                    const diffCls = !expenseAware || r.diff === 0 ? 'text-slate-400' : r.diff > 0 ? 'text-emerald-400' : 'text-rose-400';
                    return (
                        <tr key={r.id} className={`border-t border-slate-800 ${r.level === 0 ? 'font-bold bg-slate-800/80' : r.level === 1 ? 'font-semibold bg-slate-800/40' : ''}`}>
                            <td className={`py-1.5 ${r.level === 2 ? 'pl-4 text-slate-300' : ''}`}>{r.label}</td>
                            <td className="text-right tabular-nums px-2">{eur(r.n)}</td>
                            <td className="text-right tabular-nums px-2 text-slate-400">{pct(r.weightN)}</td>
                            <td className="text-right tabular-nums px-2">{eur(r.n1)}</td>
                            <td className="text-right tabular-nums px-2 text-slate-400">{pct(r.weightN1)}</td>
                            <td className={`text-right tabular-nums px-2 ${diffCls}`}>{eur(r.diff)}</td>
                            <td className="text-right tabular-nums px-2 text-slate-400">{signedPct(r.var)}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);

const ProfitAndLoss: React.FC<{ a: Analysis }> = ({ a }) => (
    <Section id="pyg" title="Cuenta de resultados analítica" subtitle="Análisis horizontal (variación) y vertical (% sobre la cifra de negocios).">
        <Box><ComparisonTable rows={a.pygRows} yearN={a.company.yearN} weightLabel="% ventas" expenseAware /></Box>
        <Box>
            <h3 className="font-semibold mb-2">Punto muerto (umbral de rentabilidad)</h3>
            <div className="grid md:grid-cols-4 gap-4 text-sm">
                <div><div className="text-slate-400">Margen de contribución</div><div className="text-lg font-semibold tabular-nums">{pct(a.breakEven.contributionMarginPct)}</div><div className="text-xs text-slate-500">{a.company.yearN - 1}: {pct(a.breakEvenN1.contributionMarginPct)}</div></div>
                <div><div className="text-slate-400">Costes fijos (incl. amortización e intereses)</div><div className="text-lg font-semibold tabular-nums">{eur(a.breakEven.fixedCosts)}</div><div className="text-xs text-slate-500">{a.company.yearN - 1}: {eur(a.breakEvenN1.fixedCosts)}</div></div>
                <div><div className="text-slate-400">Ventas de punto muerto</div><div className="text-lg font-semibold tabular-nums">{eur(a.breakEven.breakEvenSales)}</div><div className="text-xs text-slate-500">{a.company.yearN - 1}: {eur(a.breakEvenN1.breakEvenSales)}</div></div>
                <div><div className="text-slate-400">Margen de seguridad</div><div className="text-lg font-semibold tabular-nums">{pct(a.breakEven.safetyMargin)}</div><div className="text-xs text-slate-500">{a.company.yearN - 1}: {pct(a.breakEvenN1.safetyMargin)}</div></div>
            </div>
            <p className="text-xs text-slate-500 mt-2">Coste variable: consumo de aprovisionamientos + {a.company.variablePersonalPct} % del personal + {a.company.variableOtherOpexPct} % de otros gastos de explotación (ajustable en la información complementaria).</p>
        </Box>
    </Section>
);

const BalanceSheet: React.FC<{ a: Analysis }> = ({ a }) => (
    <Section id="balance" title="Balance de situación" subtitle="Análisis horizontal y vertical (% sobre el total).">
        <Box><ComparisonTable rows={a.balanceRows} yearN={a.company.yearN} weightLabel="% total" /></Box>
    </Section>
);

const RatiosSection: React.FC<{ a: Analysis }> = ({ a }) => {
    const cats = Array.from(new Set(a.ratios.map(r => r.category)));
    const trend = (r: Ratio) => {
        if (!isNum(r.n) || !isNum(r.n1) || r.higherIsBetter === null) return null;
        const d = r.n - r.n1;
        if (Math.abs(d) < 1e-9) return <span className="text-slate-500">=</span>;
        const better = (d > 0) === r.higherIsBetter;
        return <span className={better ? 'text-emerald-400' : 'text-rose-400'}>{d > 0 ? '▲' : '▼'}</span>;
    };
    return (
        <Section id="ratios" title="Ratios" subtitle={`Valoración frente a referencias orientativas para PYMES del sector seleccionado. Saldos de cierre de cada ejercicio.`}>
            {cats.map(cat => (
                <Box key={cat}>
                    <h3 className="font-semibold text-indigo-300 mb-2">{cat}</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-400 border-b border-slate-700">
                                    <th className="text-left py-2 font-medium">Ratio</th>
                                    <th className="text-right font-medium px-2">{a.company.yearN}</th>
                                    <th className="text-right font-medium px-2">{a.company.yearN - 1}</th>
                                    <th className="px-2"></th>
                                    <th className="text-left font-medium px-2">Valoración</th>
                                    <th className="text-left font-medium px-2 hidden md:table-cell">Referencia</th>
                                </tr>
                            </thead>
                            <tbody>
                                {a.ratios.filter(r => r.category === cat).map(r => (
                                    <tr key={r.id} className="border-t border-slate-800 align-top">
                                        <td className="py-2 pr-2">
                                            <div className="text-slate-200">{r.label}</div>
                                            <div className="text-xs text-slate-500">{r.explanation}</div>
                                        </td>
                                        <td className="text-right tabular-nums px-2 font-semibold">{fmt(r.n, r.format)}</td>
                                        <td className="text-right tabular-nums px-2 text-slate-400">{r.n1 === null && cat === 'Crecimiento' ? '—' : fmt(r.n1, r.format)}</td>
                                        <td className="px-1 text-center">{trend(r)}</td>
                                        <td className="px-2"><Badge status={r.status} /></td>
                                        <td className="px-2 text-xs text-slate-500 hidden md:table-cell">{r.benchmark}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Box>
            ))}
        </Section>
    );
};

const FinancingSection: React.FC<{ a: Analysis }> = ({ a }) => {
    const { n, n1, debt, altman, altmanN1 } = a;
    const row = (label: string, vn: number, vn1: number, strong = false) => (
        <tr className={`border-t border-slate-800 ${strong ? 'font-semibold' : ''}`}>
            <td className="py-1.5">{label}</td>
            <td className="text-right tabular-nums px-2">{eur(vn)}</td>
            <td className="text-right tabular-nums px-2 text-slate-400">{eur(vn1)}</td>
        </tr>
    );
    const zoneCls = (z: string) => (z === 'segura' ? 'text-emerald-400' : z === 'gris' ? 'text-amber-300' : 'text-rose-400');
    return (
        <Section id="financiacion" title="Circulante, deuda y solvencia" subtitle="Equilibrio financiero, capacidad de endeudamiento y riesgo de insolvencia.">
            <div className="grid md:grid-cols-2 gap-4">
                <Box>
                    <h3 className="font-semibold mb-2">Fondo de maniobra vs. necesidades operativas de fondos</h3>
                    <table className="w-full text-sm">
                        <thead><tr className="text-slate-400"><th className="text-left font-medium">Concepto</th><th className="text-right font-medium px-2">{a.company.yearN}</th><th className="text-right font-medium px-2">{a.company.yearN - 1}</th></tr></thead>
                        <tbody>
                            {row('Activo circulante operativo', n.activoCircOperativo, n1.activoCircOperativo)}
                            {row('− Pasivo circulante operativo (proveedores, acreedores…)', n.pasivoCircOperativo, n1.pasivoCircOperativo)}
                            {row('= NOF (necesidades operativas de fondos)', n.nof, n1.nof, true)}
                            {row('Recursos permanentes (PN + pasivo no corriente)', n.recursosPermanentes, n1.recursosPermanentes)}
                            {row('− Activo no corriente', n.anc, n1.anc)}
                            {row('= Fondo de maniobra', n.fm, n1.fm, true)}
                            {row('Déficit (−) / superávit (+) de financiación a largo', n.fm - n.nof, n1.fm - n1.nof, true)}
                        </tbody>
                    </table>
                    <p className="text-xs text-slate-500 mt-2">Si el fondo de maniobra no cubre las NOF, la diferencia se financia con deuda bancaria a corto plazo, que hay que renovar cada año.</p>
                </Box>
                <Box>
                    <h3 className="font-semibold mb-2">Deuda financiera</h3>
                    <table className="w-full text-sm">
                        <thead><tr className="text-slate-400"><th className="text-left font-medium">Concepto</th><th className="text-right font-medium px-2">{a.company.yearN}</th><th className="text-right font-medium px-2">{a.company.yearN - 1}</th></tr></thead>
                        <tbody>
                            {row('Deuda financiera a largo plazo', n.deudaFinLP, n1.deudaFinLP)}
                            {row('Deuda financiera a corto plazo', n.deudaFinCP, n1.deudaFinCP)}
                            {row('− Tesorería e inversiones financieras a corto', n.liquidez, n1.liquidez)}
                            {row('= Deuda financiera neta (DFN)', n.dfn, n1.dfn, true)}
                        </tbody>
                    </table>
                    <dl className="grid grid-cols-2 gap-3 mt-4 text-sm">
                        <div><dt className="text-slate-400">Capacidad de deuda adicional (hasta {times(a.company.targetLeverage)} EBITDA)</dt><dd className="font-semibold tabular-nums">{eur(debt.capacity)}</dd></div>
                        <div><dt className="text-slate-400">Años para devolver la DFN con el flujo libre</dt><dd className="font-semibold tabular-nums">{isNum(debt.yearsToRepay) ? `${debt.yearsToRepay.toFixed(1)} años` : 'No calculable (flujo libre negativo)'}</dd></div>
                        <div><dt className="text-slate-400">Cobertura del servicio de la deuda (DSCR)</dt><dd className="font-semibold tabular-nums">{times(debt.dscr)} <span className="text-xs font-normal text-slate-500">(principal {eur(debt.debtServiceUsed)} + intereses)</span></dd></div>
                        <div><dt className="text-slate-400">Deuda a corto sobre deuda total</dt><dd className="font-semibold tabular-nums">{pct(debt.shortTermShare)}</dd></div>
                        {isNum(debt.availableCreditLines) && (
                            <div><dt className="text-slate-400">Liquidez total disponible (caja + pólizas)</dt><dd className="font-semibold tabular-nums">{eur(n.liquidez + debt.availableCreditLines)}</dd></div>
                        )}
                    </dl>
                </Box>
            </div>
            <Box>
                <h3 className="font-semibold mb-1">Riesgo de insolvencia: modelo de Altman {altman.model}</h3>
                <p className="text-xs text-slate-500 mb-3">Zona de riesgo por debajo de {altman.thresholds[0]}, zona gris hasta {altman.thresholds[1]}, zona segura por encima. Es un indicador estadístico orientativo, no una calificación crediticia.</p>
                <div className="grid md:grid-cols-3 gap-4 items-start">
                    <div className="text-center">
                        <div className={`text-4xl font-extrabold tabular-nums ${zoneCls(altman.zone)}`}>{altman.z.toFixed(2)}</div>
                        <div className={`font-semibold ${zoneCls(altman.zone)}`}>Zona {altman.zone}</div>
                        <div className="text-xs text-slate-500 mt-1">{a.company.yearN - 1}: {altmanN1.z.toFixed(2)} (zona {altmanN1.zone})</div>
                    </div>
                    <table className="md:col-span-2 w-full text-sm">
                        <tbody>
                            {altman.x.map((x, i) => (
                                <tr key={i} className="border-t border-slate-800">
                                    <td className="py-1">{x.label}</td>
                                    <td className="text-right tabular-nums px-2">{x.value.toFixed(3)}</td>
                                    <td className="text-right tabular-nums px-2 text-slate-400">{altmanN1.x[i].value.toFixed(3)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Box>
        </Section>
    );
};

const CashWaterfall: React.FC<{ a: Analysis }> = ({ a }) => {
    const cf = a.cashFlow;
    const start = a.n1.lines.efectivo ?? 0;
    const steps = [
        { label: `Tesorería ${a.company.yearN - 1}`, value: start, total: true },
        { label: 'Flujo de explotación', value: cf.operatingTotal },
        { label: 'Inversión', value: cf.investingTotal },
        { label: 'Financiación', value: cf.financingTotal },
        ...(Math.abs(cf.unreconciled) > 1 ? [{ label: 'No conciliado', value: cf.unreconciled }] : []),
        { label: `Tesorería ${a.company.yearN}`, value: a.n.lines.efectivo ?? 0, total: true },
    ];
    let running = 0;
    const bars = steps.map(s => {
        const from = s.total ? 0 : running;
        const to = s.total ? s.value : running + s.value;
        running = s.total ? s.value : to;
        return { ...s, from, to };
    });
    const allVals = bars.flatMap(b => [b.from, b.to, 0]);
    const max = Math.max(...allVals), min = Math.min(...allVals);
    const W = 640, H = 260, padT = 24, padB = 44, padL = 8;
    const span = max - min || 1;
    const y = (v: number) => padT + ((max - v) / span) * (H - padT - padB);
    const bw = (W - padL * 2) / bars.length;
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Puente de tesorería">
            <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="currentColor" className="text-slate-600" strokeWidth={1} />
            {bars.map((b, i) => {
                const top = y(Math.max(b.from, b.to));
                const h = Math.max(2, Math.abs(y(b.from) - y(b.to)));
                const color = b.total ? '#818cf8' : b.value >= 0 ? '#34d399' : '#fb7185';
                const x = padL + i * bw + bw * 0.18;
                return (
                    <g key={i}>
                        <title>{`${b.label}: ${eur(b.value)}`}</title>
                        <rect x={x} y={top} width={bw * 0.64} height={h} rx={3} fill={color} />
                        <text x={x + bw * 0.32} y={top - 6} textAnchor="middle" className="fill-slate-200 print:fill-black" fontSize={11}>{eur(b.value)}</text>
                        <text x={x + bw * 0.32} y={H - padB + 16} textAnchor="middle" className="fill-slate-400 print:fill-black" fontSize={11}>{b.label}</text>
                    </g>
                );
            })}
        </svg>
    );
};

const CashFlowSection: React.FC<{ a: Analysis }> = ({ a }) => {
    const cf = a.cashFlow;
    const block = (title: string, items: { label: string; value: number; detail?: string }[], total: number) => (
        <>
            <tr className="bg-slate-800/60 font-semibold border-t border-slate-700"><td className="py-2">{title}</td><td className="text-right tabular-nums px-2">{eur(total)}</td></tr>
            {items.filter(i => Math.abs(i.value) > 0.5).map((i, k) => (
                <tr key={k} className="border-t border-slate-800">
                    <td className="py-1 pl-4 text-slate-300" title={i.detail}>{i.label}</td>
                    <td className={`text-right tabular-nums px-2 ${i.value >= 0 ? 'text-slate-200' : 'text-rose-300'}`}>{eur(i.value)}</td>
                </tr>
            ))}
        </>
    );
    return (
        <Section id="flujos" title={`Estado de flujos de efectivo ${a.company.yearN}`} subtitle="Estimado por el método indirecto a partir de la variación de los balances.">
            <div className="grid md:grid-cols-2 gap-4">
                <Box>
                    <table className="w-full text-sm">
                        <tbody>
                            {block('A) Flujo de las actividades de explotación', cf.operating, cf.operatingTotal)}
                            {block('B) Flujo de las actividades de inversión', cf.investing, cf.investingTotal)}
                            {block('C) Flujo de las actividades de financiación', cf.financing, cf.financingTotal)}
                            <tr className="font-bold border-t-2 border-slate-600"><td className="py-2">Variación neta de tesorería (A+B+C)</td><td className="text-right tabular-nums px-2">{eur(cf.netChange)}</td></tr>
                            <tr className="text-slate-400"><td className="py-1">Variación real del efectivo en balance</td><td className="text-right tabular-nums px-2">{eur(cf.actualCashChange)}</td></tr>
                        </tbody>
                    </table>
                </Box>
                <div className="space-y-4">
                    <Box><CashWaterfall a={a} /></Box>
                    <div className="grid grid-cols-2 gap-4">
                        <Box><div className="text-xs text-slate-400">Flujo de caja libre (explotación − capex)</div><div className="text-xl font-bold tabular-nums">{eur(cf.freeCashFlow)}</div></Box>
                        <Box><div className="text-xs text-slate-400">Conversión de EBITDA en caja</div><div className="text-xl font-bold tabular-nums">{pct(cf.cashConversion)}</div></Box>
                        <Box><div className="text-xs text-slate-400">Capex del ejercicio</div><div className="text-xl font-bold tabular-nums">{eur(cf.capex)}</div></Box>
                        <Box><div className="text-xs text-slate-400">Dividendos / retribución socios (estimado)</div><div className="text-xl font-bold tabular-nums">{eur(cf.dividendsEstimate)}</div></Box>
                    </div>
                </div>
            </div>
        </Section>
    );
};

const Questions: React.FC<{ a: Analysis }> = ({ a }) => (
    <Section id="preguntas" title="Información a solicitar al cliente" subtitle="Para completar el análisis y afinar las recomendaciones.">
        <Box>
            <ol className="list-decimal ml-5 space-y-2 text-sm text-slate-200">
                {a.questions.map((q, i) => <li key={i}>{q}</li>)}
            </ol>
        </Box>
        <p className="text-xs text-slate-500">
            Ratios calculados con saldos de cierre. Las referencias sectoriales son orientativas para PYMES españolas y deben contrastarse con datos del sector (p. ej. Central de Balances del Banco de España). Este informe no sustituye a una auditoría ni a la revisión de los registros contables.
        </p>
    </Section>
);

// ---------------------------------------------------------------------------
// Contenedor con pestañas
// ---------------------------------------------------------------------------

const TABS = [
    { id: 'resumen', label: 'Resumen', C: ExecutiveSummary },
    { id: 'diagnostico', label: 'Diagnóstico', C: Diagnosis },
    { id: 'plan', label: 'Plan de acción', C: ActionPlan },
    { id: 'pyg', label: 'PyG', C: ProfitAndLoss },
    { id: 'balance', label: 'Balance', C: BalanceSheet },
    { id: 'ratios', label: 'Ratios', C: RatiosSection },
    { id: 'financiacion', label: 'Deuda y solvencia', C: FinancingSection },
    { id: 'flujos', label: 'Flujos de caja', C: CashFlowSection },
    { id: 'simulador', label: 'Simulador', C: Simulator },
    { id: 'preguntas', label: 'Info. a pedir', C: Questions },
] as const;

export const Report: React.FC<{ analysis: Analysis; printAll: boolean }> = ({ analysis, printAll }) => {
    const [tab, setTab] = useState<(typeof TABS)[number]['id']>('resumen');
    if (printAll) {
        return (
            <div className="space-y-10">
                {TABS.filter(t => t.id !== 'simulador').map(t => <t.C key={t.id} a={analysis} />)}
            </div>
        );
    }
    const Current = TABS.find(t => t.id === tab)!.C;
    return (
        <div className="space-y-6">
            <nav className="flex flex-wrap gap-2 sticky top-0 z-10 bg-slate-900/95 py-2 backdrop-blur print:hidden">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium ${tab === t.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                    >
                        {t.label}
                    </button>
                ))}
            </nav>
            <Current a={analysis} />
        </div>
    );
};

