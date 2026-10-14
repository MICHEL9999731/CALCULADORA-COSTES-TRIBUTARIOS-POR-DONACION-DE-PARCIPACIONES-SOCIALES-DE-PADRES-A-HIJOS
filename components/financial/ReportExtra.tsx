import React from 'react';
import type { Analysis, HistoryYear } from '../../financial/engine';
import { eur, fmt, pct, times, isNum, type ValueFormat } from '../../financial/format';

const Box: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div className={`bg-slate-800/50 border border-slate-700 rounded-lg p-4 print:bg-white print:border-slate-300 ${className}`}>{children}</div>
);

const Heading: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
    <div>
        <h2 className="text-2xl font-bold text-slate-100 print:text-black">{title}</h2>
        {subtitle && <p className="text-sm text-slate-400 print:text-slate-600">{subtitle}</p>}
    </div>
);

// ---------------------------------------------------------------------------
// Gráfico de barras de una serie (evolución de una magnitud en euros)
// ---------------------------------------------------------------------------

const BarSeries: React.FC<{ title: string; points: { label: string; value: number }[]; color: string }> = ({ title, points, color }) => {
    const W = 320, H = 170, padT = 22, padB = 24;
    const max = Math.max(0, ...points.map(p => p.value));
    const min = Math.min(0, ...points.map(p => p.value));
    const span = max - min || 1;
    const y = (v: number) => padT + ((max - v) / span) * (H - padT - padB);
    const bw = W / points.length;
    return (
        <figure>
            <figcaption className="text-sm font-semibold mb-1">{title}</figcaption>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={title}>
                <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="currentColor" className="text-slate-600" strokeWidth={1} />
                {points.map((p, i) => {
                    const top = y(Math.max(0, p.value));
                    const h = Math.max(2, Math.abs(y(0) - y(p.value)));
                    const x = i * bw + bw * 0.2;
                    return (
                        <g key={p.label}>
                            <title>{`${p.label}: ${eur(p.value)}`}</title>
                            <rect x={x} y={top} width={bw * 0.6} height={h} rx={3} fill={p.value < 0 ? '#fb7185' : color} />
                            <text x={x + bw * 0.3} y={p.value < 0 ? top + h + 12 : top - 6} textAnchor="middle" fontSize={10} className="fill-slate-300 print:fill-black">{eur(p.value)}</text>
                            <text x={x + bw * 0.3} y={H - 6} textAnchor="middle" fontSize={11} className="fill-slate-400 print:fill-black">{p.label}</text>
                        </g>
                    );
                })}
            </svg>
        </figure>
    );
};

// ---------------------------------------------------------------------------
// Evolución plurianual
// ---------------------------------------------------------------------------

interface Metric { label: string; format: ValueFormat; get: (h: HistoryYear) => number | null; higherIsBetter?: boolean; strong?: boolean }

const METRIC_GROUPS: { title: string; metrics: Metric[] }[] = [
    {
        title: 'Cuenta de resultados',
        metrics: [
            { label: 'Cifra de negocios', format: 'eur', get: h => h.fig.ventas, strong: true, higherIsBetter: true },
            { label: 'Crecimiento de ventas', format: 'pct', get: h => h.ratios.crecVentas, higherIsBetter: true },
            { label: 'Margen bruto %', format: 'pct', get: h => h.ratios.margenBruto, higherIsBetter: true },
            { label: 'EBITDA', format: 'eur', get: h => h.fig.ebitda, strong: true, higherIsBetter: true },
            { label: 'Margen EBITDA', format: 'pct', get: h => h.ratios.margenEbitda, higherIsBetter: true },
            { label: 'Gastos de personal / ventas', format: 'pct', get: h => h.ratios.personalVentas, higherIsBetter: false },
            { label: 'Resultado neto', format: 'eur', get: h => h.fig.resultado, strong: true, higherIsBetter: true },
        ],
    },
    {
        title: 'Balance y financiación',
        metrics: [
            { label: 'Patrimonio neto', format: 'eur', get: h => h.fig.pn, higherIsBetter: true },
            { label: 'Deuda financiera neta', format: 'eur', get: h => h.fig.dfn, strong: true, higherIsBetter: false },
            { label: 'DFN / EBITDA', format: 'x', get: h => h.ratios.dfnEbitda, higherIsBetter: false },
            { label: 'Endeudamiento (pasivo / activo)', format: 'pct', get: h => h.ratios.endeudamiento, higherIsBetter: false },
            { label: 'Fondo de maniobra', format: 'eur', get: h => h.fig.fm, higherIsBetter: true },
            { label: 'NOF', format: 'eur', get: h => h.fig.nof },
            { label: 'Liquidez general', format: 'x', get: h => h.ratios.liquidez, higherIsBetter: true },
            { label: 'Cobertura de intereses', format: 'x', get: h => h.ratios.cobertura, higherIsBetter: true },
        ],
    },
    {
        title: 'Circulante y rentabilidad',
        metrics: [
            { label: 'Periodo medio de cobro', format: 'days', get: h => h.ratios.pmc, higherIsBetter: false },
            { label: 'Periodo medio de pago', format: 'days', get: h => h.ratios.pmp },
            { label: 'Periodo medio de existencias', format: 'days', get: h => h.ratios.pme, higherIsBetter: false },
            { label: 'ROE', format: 'pct', get: h => h.ratios.roe, higherIsBetter: true },
            { label: 'ROA', format: 'pct', get: h => h.ratios.roa, higherIsBetter: true },
            { label: 'Z de Altman', format: 'x', get: h => h.altmanZ, higherIsBetter: true },
        ],
    },
    {
        title: 'Flujos de caja',
        metrics: [
            { label: 'Flujo de explotación', format: 'eur', get: h => h.cashFlow?.operatingTotal ?? null, higherIsBetter: true },
            { label: 'Inversión en inmovilizado (capex)', format: 'eur', get: h => h.cashFlow?.capex ?? null },
            { label: 'Flujo de caja libre', format: 'eur', get: h => h.cashFlow?.freeCashFlow ?? null, strong: true, higherIsBetter: true },
            { label: 'Dividendos (estimado)', format: 'eur', get: h => h.cashFlow?.dividendsEstimate ?? null },
        ],
    },
];

export const EvolutionSection: React.FC<{ a: Analysis }> = ({ a }) => {
    const chrono = [...a.history].reverse(); // del más antiguo al más reciente
    const t = a.trends;
    const trendIcon = (m: Metric) => {
        if (m.higherIsBetter === undefined) return null;
        const xs = chrono.map(m.get).filter(isNum);
        if (xs.length < 2) return null;
        const d = xs[xs.length - 1] - xs[0];
        if (Math.abs(d) < 1e-9) return <span className="text-slate-500">=</span>;
        return <span className={(d > 0) === m.higherIsBetter ? 'text-emerald-400' : 'text-rose-400'}>{d > 0 ? '▲' : '▼'}</span>;
    };
    return (
        <section id="evolucion" className="space-y-4 print:break-before-page">
            <Heading title={`Evolución ${chrono[0].year}-${chrono[chrono.length - 1].year}`} subtitle={a.history.length < 3 ? 'Con 3 o más ejercicios se analizan las tendencias (añádalos en «Editar datos»).' : 'Tendencias de los principales indicadores. La flecha compara el último ejercicio con el primero.'} />
            {a.history.length >= 3 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Box><div className="text-xs text-slate-400">Crecimiento medio anual de ventas</div><div className="text-2xl font-bold tabular-nums">{pct(t.cagrVentas)}</div></Box>
                    <Box><div className="text-xs text-slate-400">Crecimiento medio anual del EBITDA</div><div className="text-2xl font-bold tabular-nums">{pct(t.cagrEbitda)}</div></Box>
                    <Box><div className="text-xs text-slate-400">Caja libre acumulada</div><div className="text-2xl font-bold tabular-nums">{eur(t.cumulativeFreeCash)}</div></Box>
                    <Box><div className="text-xs text-slate-400">Dividendos acumulados (estimado)</div><div className="text-2xl font-bold tabular-nums">{eur(t.cumulativeDividends)}</div></Box>
                </div>
            )}
            <div className="grid md:grid-cols-3 gap-4">
                <Box><BarSeries title="Cifra de negocios" color="#818cf8" points={chrono.map(h => ({ label: String(h.year), value: h.fig.ventas }))} /></Box>
                <Box><BarSeries title="EBITDA" color="#818cf8" points={chrono.map(h => ({ label: String(h.year), value: h.fig.ebitda }))} /></Box>
                <Box><BarSeries title="Deuda financiera neta" color="#818cf8" points={chrono.map(h => ({ label: String(h.year), value: h.fig.dfn }))} /></Box>
            </div>
            {METRIC_GROUPS.map(g => (
                <Box key={g.title}>
                    <h3 className="font-semibold text-indigo-300 mb-2">{g.title}</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-400 border-b border-slate-700">
                                    <th className="text-left py-2 font-medium">Indicador</th>
                                    {chrono.map(h => <th key={h.year} className="text-right font-medium px-2">{h.year}</th>)}
                                    <th className="w-8" />
                                </tr>
                            </thead>
                            <tbody>
                                {g.metrics.map(m => (
                                    <tr key={m.label} className={`border-t border-slate-800 ${m.strong ? 'font-semibold' : ''}`}>
                                        <td className="py-1.5 pr-2">{m.label}</td>
                                        {chrono.map(h => <td key={h.year} className="text-right tabular-nums px-2">{fmt(m.get(h), m.format)}</td>)}
                                        <td className="text-center">{trendIcon(m)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Box>
            ))}
        </section>
    );
};

// ---------------------------------------------------------------------------
// Cuadro de financiación y calendario de pagos
// ---------------------------------------------------------------------------

const ScheduleChart: React.FC<{ a: Analysis }> = ({ a }) => {
    const plan = a.debtPlan!;
    const rows = plan.schedule.filter(s => s.year !== null);
    const capacity = rows[0]?.capacity ?? 0;
    const W = 640, H = 240, padT = 20, padB = 40, padL = 8;
    const max = Math.max(capacity, ...rows.map(r => r.principal + r.interest + r.renting), 1);
    const y = (v: number) => padT + ((max - v) / max) * (H - padT - padB);
    const bw = (W - padL * 2) / rows.length;
    const SERIES = [
        { key: 'principal' as const, label: 'Principal', color: '#818cf8' },
        { key: 'interest' as const, label: 'Intereses', color: '#38bdf8' },
        { key: 'renting' as const, label: 'Renting', color: '#a3a3a3' },
    ];
    return (
        <figure>
            <div className="flex flex-wrap gap-4 text-xs text-slate-300 mb-2">
                {SERIES.map(s => <span key={s.key} className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}
                <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed border-emerald-400" />Caja operativa anual (EBITDA − impuesto)</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Calendario de pagos de la deuda">
                <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="currentColor" className="text-slate-600" />
                {rows.map((r, i) => {
                    let acc = 0;
                    const x = padL + i * bw + bw * 0.2;
                    return (
                        <g key={r.label}>
                            <title>{`${r.label}: principal ${eur(r.principal)}, intereses ${eur(r.interest)}, renting ${eur(r.renting)}`}</title>
                            {SERIES.map(s => {
                                const v = r[s.key];
                                if (v <= 0) return null;
                                const top = y(acc + v);
                                const h = Math.max(1, y(acc) - top - (acc > 0 ? 2 : 0));
                                acc += v;
                                return <rect key={s.key} x={x} y={top} width={bw * 0.6} height={h} rx={2} fill={s.color} />;
                            })}
                            <text x={x + bw * 0.3} y={y(acc) - 6} textAnchor="middle" fontSize={11} className="fill-slate-200 print:fill-black">{eur(acc)}</text>
                            <text x={x + bw * 0.3} y={H - padB + 18} textAnchor="middle" fontSize={11} className="fill-slate-400 print:fill-black">{r.label}</text>
                        </g>
                    );
                })}
                {capacity > 0 && <line x1={0} x2={W} y1={y(capacity)} y2={y(capacity)} stroke="#34d399" strokeWidth={2} strokeDasharray="6 4" />}
            </svg>
        </figure>
    );
};

export const DebtPlanSection: React.FC<{ a: Analysis }> = ({ a }) => {
    const plan = a.debtPlan;
    if (!plan) {
        return (
            <section id="deuda" className="space-y-4">
                <Heading title="Calendario de deuda" />
                <Box><p className="text-sm text-slate-300">Detalle los préstamos, leasing, renting y pólizas en el apartado 5 de la entrada de datos para obtener el calendario de pagos, el coste medio y los vencimientos.</p></Box>
            </section>
        );
    }
    const yearN = a.company.yearN;
    return (
        <section id="deuda" className="space-y-4 print:break-before-page">
            <Heading title="Cuadro de financiación y calendario de pagos" subtitle={`Operaciones vigentes a 31/12/${yearN} y cuotas previstas por año natural.`} />
            {plan.warnings.map((w, i) => <p key={i} className="text-sm text-amber-300">⚠ {w}</p>)}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Box><div className="text-xs text-slate-400">Deuda con coste detallada</div><div className="text-xl font-bold tabular-nums">{eur(plan.outstanding)}</div><div className="text-xs text-slate-500">Balance: {eur(plan.reconciliation.balanceDebt)}</div></Box>
                <Box><div className="text-xs text-slate-400">Coste medio ponderado</div><div className="text-xl font-bold tabular-nums">{isNum(plan.weightedRate) ? pct(plan.weightedRate / 100) : 'n/d'}</div></Box>
                <Box><div className="text-xs text-slate-400">Pólizas: disponible / límite</div><div className="text-xl font-bold tabular-nums">{eur(plan.creditAvailable)}</div><div className="text-xs text-slate-500">de {eur(plan.creditLimit)}</div></Box>
                <Box><div className="text-xs text-slate-400">Renting pendiente (fuera de balance)</div><div className="text-xl font-bold tabular-nums">{eur(plan.rentingPending)}</div><div className="text-xs text-slate-500">{eur(plan.rentingAnnual)} en {yearN + 1}</div></Box>
            </div>

            <Box><ScheduleChart a={a} /></Box>

            <Box>
                <h3 className="font-semibold mb-2">Calendario anual</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-slate-400 border-b border-slate-700">
                                <th className="text-left py-2 font-medium">Año</th>
                                <th className="text-right font-medium px-2">Principal</th>
                                <th className="text-right font-medium px-2">Intereses</th>
                                <th className="text-right font-medium px-2">Servicio de la deuda</th>
                                <th className="text-right font-medium px-2">Renting</th>
                                <th className="text-right font-medium px-2">Caja operativa</th>
                                <th className="text-right font-medium px-2">Cobertura (DSCR)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {plan.schedule.map(r => (
                                <tr key={r.label} className="border-t border-slate-800">
                                    <td className="py-1.5">{r.label}</td>
                                    <td className="text-right tabular-nums px-2">{eur(r.principal)}</td>
                                    <td className="text-right tabular-nums px-2">{eur(r.interest)}</td>
                                    <td className="text-right tabular-nums px-2 font-semibold">{eur(r.debtService)}</td>
                                    <td className="text-right tabular-nums px-2">{eur(r.renting)}</td>
                                    <td className="text-right tabular-nums px-2 text-slate-400">{r.year === null ? '' : eur(r.capacity)}</td>
                                    <td className={`text-right tabular-nums px-2 ${r.dscr === null ? 'text-slate-500' : r.dscr < 1 ? 'text-rose-400' : r.dscr < 1.2 ? 'text-amber-300' : 'text-emerald-400'}`}>{r.dscr === null ? '—' : times(r.dscr)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="text-xs text-slate-500 mt-2">El servicio de la deuda no incluye la devolución de pólizas (se renuevan) ni el renting, que ya se descuenta en el EBITDA. La caja operativa se proyecta constante al nivel de {yearN}. DSCR por debajo de 1,2x indica tensión; por debajo de 1x, la caja no alcanza para pagar las cuotas.</p>
            </Box>

            <Box>
                <h3 className="font-semibold mb-2">Detalle por operación</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-slate-400 border-b border-slate-700 text-left">
                                <th className="py-2 font-medium">Operación</th>
                                <th className="font-medium text-right px-2">Pendiente</th>
                                <th className="font-medium text-right px-2">Límite</th>
                                <th className="font-medium text-right px-2">Interés</th>
                                <th className="font-medium text-right px-2">Cuota mes</th>
                                <th className="font-medium px-2">Vence</th>
                                <th className="font-medium text-right px-2">Pago {yearN + 1}</th>
                                <th className="font-medium px-2">Garantía</th>
                                <th className="font-medium px-2">Observaciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {plan.lines.map(l => (
                                <tr key={l.item.id} className="border-t border-slate-800 align-top">
                                    <td className="py-1.5 pr-2"><div className="text-slate-200">{l.typeLabel}{l.item.lender && ` · ${l.item.lender}`}</div><div className="text-slate-500">{l.item.description}</div></td>
                                    <td className="text-right tabular-nums px-2">{l.offBalance ? eur(l.pendingCommitment) : eur(l.item.outstanding)}</td>
                                    <td className="text-right tabular-nums px-2">{l.item.limit !== null ? eur(l.item.limit) : '—'}</td>
                                    <td className="text-right tabular-nums px-2">{l.item.rate !== null ? `${String(l.item.rate).replace('.', ',')} %` : '—'}</td>
                                    <td className="text-right tabular-nums px-2">{l.item.monthlyPayment !== null ? eur(l.item.monthlyPayment) : '—'}</td>
                                    <td className="px-2 whitespace-nowrap">{l.item.maturity || '—'}</td>
                                    <td className="text-right tabular-nums px-2">{eur(l.principalByYear[0] + l.interestByYear[0])}</td>
                                    <td className="px-2">{l.item.guarantee || '—'}</td>
                                    <td className="px-2 text-amber-300">{[...l.warnings, ...(l.revolving && l.monthsLeft !== null && l.monthsLeft <= 12 ? ['Vence en los próximos 12 meses: renovar.'] : [])].join(' ')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Box>
        </section>
    );
};
