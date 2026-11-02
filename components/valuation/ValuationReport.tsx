import React, { useState } from 'react';
import {
    ASSUMPTION_FIELDS, METHOD_LABELS, defaultValuationInputs,
    type AssumptionField, type AssumptionKey, type MethodId, type MethodResult, type Valuation, type ValuationInputs,
} from '../../financial/valuation';
import { eur, isNum, num, pct, times } from '../../financial/format';
import { AmountInput } from '../financial/AmountInput';

// ---------------------------------------------------------------------------
// Piezas comunes
// ---------------------------------------------------------------------------

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

const Stat: React.FC<{ label: string; value: string; note?: string; accent?: boolean }> = ({ label, value, note, accent }) => (
    <Box>
        <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
        <div className={`text-2xl font-bold tabular-nums mt-1 ${accent ? 'text-sky-300' : ''}`}>{value}</div>
        {note && <div className="text-xs text-slate-400 mt-1">{note}</div>}
    </Box>
);

const fmtUnit = (x: number, unit: AssumptionField['unit']) =>
    unit === '€' ? eur(x) : unit === '%' ? `${x.toLocaleString('es-ES', { maximumFractionDigits: 2 })} %` : unit === 'x' ? times(x) : num(x);

const DetailTable: React.FC<{ lines: { label: string; value: string; strong?: boolean }[] }> = ({ lines }) => (
    <table className="w-full text-sm">
        <tbody>
            {lines.map((l, i) => (
                <tr key={i} className={`border-b border-slate-700/50 ${l.strong ? 'font-semibold text-slate-100' : 'text-slate-300'}`}>
                    <td className="py-1 pr-3">{l.label}</td>
                    <td className="py-1 text-right tabular-nums whitespace-nowrap">{l.value}</td>
                </tr>
            ))}
        </tbody>
    </table>
);

// ---------------------------------------------------------------------------
// Gráfico de rangos («football field»)
// ---------------------------------------------------------------------------

const FootballField: React.FC<{ v: Valuation }> = ({ v }) => {
    const rows = v.methods.filter(m => m.applicable && isNum(m.equity));
    const marks = [v.conclusion.value, v.fiscal.irpfMinimum].filter(isNum);
    const xs = rows.flatMap(m => [m.low ?? m.equity!, m.high ?? m.equity!, m.equity!]).concat(marks, [0]);
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    const span = hi - lo || 1;
    const x = (n: number) => `${((n - lo) / span) * 100}%`;
    const value = v.conclusion.value;
    return (
        <div className="space-y-2">
            {rows.map(m => (
                <div key={m.id} className="grid grid-cols-[minmax(0,11rem)_1fr] sm:grid-cols-[minmax(0,16rem)_1fr_7rem] gap-2 items-center text-sm">
                    <div className="truncate text-slate-300" title={m.name}>
                        {m.name}{m.weight > 0 && <span className="ml-1 text-xs text-sky-300">{Math.round(m.weight * 100)} %</span>}
                    </div>
                    <div className="relative h-5 bg-slate-900/60 rounded print:bg-slate-100">
                        {lo < 0 && <div className="absolute top-0 bottom-0 w-px bg-slate-500" style={{ left: x(0) }} />}
                        <div
                            className={`absolute top-1 bottom-1 rounded ${m.weight > 0 ? 'bg-sky-500/70' : 'bg-slate-500/50'}`}
                            style={{ left: x(Math.min(m.low ?? m.equity!, m.equity!)), width: `max(3px, calc(${x(Math.max(m.high ?? m.equity!, m.equity!))} - ${x(Math.min(m.low ?? m.equity!, m.equity!))}))` }}
                        />
                        <div className="absolute top-0 bottom-0 w-0.5 bg-white print:bg-black" style={{ left: x(m.equity!) }} />
                        {isNum(value) && <div className="absolute -top-1 -bottom-1 w-0.5 bg-amber-400" style={{ left: x(value) }} />}
                        <div className="absolute -top-1 -bottom-1 border-l border-dashed border-rose-400" style={{ left: x(v.fiscal.irpfMinimum) }} />
                    </div>
                    <div className="hidden sm:block text-right tabular-nums text-slate-200">{eur(m.equity)}</div>
                </div>
            ))}
            <div className="flex flex-wrap gap-4 text-xs text-slate-400 pt-2">
                <span><span className="inline-block w-3 h-2 bg-sky-500/70 rounded mr-1" />Rango del método (ponderado)</span>
                <span><span className="inline-block w-3 h-2 bg-slate-500/50 rounded mr-1" />Método de contraste (sin peso)</span>
                <span><span className="inline-block w-0.5 h-3 bg-amber-400 mr-1 align-middle" />Valor concluido {eur(value)}</span>
                <span><span className="inline-block h-3 border-l border-dashed border-rose-400 mr-1 align-middle" />Mínimo fiscal IRPF {eur(v.fiscal.irpfMinimum)}</span>
                <span>Escala: {eur(lo)} – {eur(hi)}</span>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Secciones
// ---------------------------------------------------------------------------

const Summary: React.FC<{ v: Valuation }> = ({ v }) => {
    const c = v.conclusion;
    const partial = c.stakePct < 1;
    return (
        <Section id="v-resumen" title="Conclusión de valor" subtitle={`${v.company.name || 'Empresa'} · Fecha de valoración: cierre del ejercicio ${v.company.yearN}`}>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Stat accent label="Valor de los fondos propios (100 %)" value={eur(c.value)} note={`Rango ${eur(c.low)} – ${eur(c.high)}`} />
                {partial
                    ? <Stat accent label={`Valor del ${pct(c.stakePct)}`} value={eur(c.stakeValue)} note={`Rango ${eur(c.stakeLow)} – ${eur(c.stakeHigh)}`} />
                    : <Stat label="Valor por participación" value={c.perShare ? eur(c.perShare) : '—'} note={c.shares ? `${num(c.shares)} participaciones` : 'Indique el nº de participaciones en Hipótesis'} />}
                <Stat label="Múltiplo VE/EBITDA implícito" value={times(c.impliedEvEbitda)} note={`Valor / patrimonio neto: ${times(c.priceToBook)}`} />
                <Stat label="Mínimo fiscal IRPF (art. 37.1.b)" value={eur(v.fiscal.irpfMinimum)} note={c.perShareFiscalIrpf ? `${eur(c.perShareFiscalIrpf)} por participación` : 'Máx. (valor teórico; beneficios × 5)'} />
            </div>
            <Box className="space-y-3 leading-relaxed text-slate-200">
                {c.text.map((p, i) => <p key={i}>{p}</p>)}
            </Box>
            <Box>
                <h3 className="font-semibold mb-3">Resultado por método</h3>
                <FootballField v={v} />
            </Box>
            {v.warnings.length > 0 && (
                <Box className="border-amber-700 bg-amber-950/20">
                    <h3 className="font-semibold text-amber-200 mb-2">Puntos a revisar</h3>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-amber-100">{v.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </Box>
            )}
        </Section>
    );
};

const MethodCard: React.FC<{ m: MethodResult }> = ({ m }) => (
    <Box className={m.applicable ? '' : 'opacity-60'}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="font-semibold text-slate-100">{m.name}</h4>
            <span className="text-xs px-2 py-0.5 rounded border border-slate-600 text-slate-300">{m.family}{m.weight > 0 ? ` · peso ${Math.round(m.weight * 100)} %` : ''}</span>
        </div>
        <div className="text-xs font-mono text-slate-400 mt-1">{m.formula}</div>
        {m.applicable ? (
            <>
                <div className="text-2xl font-bold tabular-nums mt-2">{eur(m.equity)}</div>
                {isNum(m.low) && isNum(m.high) && m.low !== m.high && <div className="text-xs text-slate-400 tabular-nums">Rango {eur(m.low)} – {eur(m.high)}</div>}
                <div className="mt-3"><DetailTable lines={m.detail} /></div>
            </>
        ) : <div className="mt-2 text-sm text-slate-400">No aplicable.</div>}
        <p className="text-xs text-slate-400 mt-2">{m.note}</p>
    </Box>
);

const Methods: React.FC<{ v: Valuation }> = ({ v }) => {
    const families: MethodResult['family'][] = ['Patrimonial', 'Rendimiento', 'Mercado', 'Mixto'];
    const desc: Record<MethodResult['family'], string> = {
        Patrimonial: 'Valoran lo que la empresa tiene: activos menos deudas.',
        Rendimiento: 'Valoran lo que la empresa generará: flujos o beneficios futuros descontados.',
        Mercado: 'Comparan con precios pagados por empresas similares.',
        Mixto: 'Combinan el valor patrimonial con el fondo de comercio (capacidad de obtener beneficios por encima de lo exigido).',
    };
    return (
        <Section id="v-metodos" title="Métodos de valoración" subtitle="Todos los importes corresponden al 100 % de los fondos propios.">
            <div className="grid md:grid-cols-2 gap-4">
                <Box>
                    <h3 className="font-semibold mb-2">Normalización del resultado</h3>
                    <DetailTable lines={v.normalized.adjustments} />
                </Box>
                <Box>
                    <h3 className="font-semibold mb-2">Del valor de empresa (VE) al valor de los fondos propios</h3>
                    <DetailTable lines={[...v.bridge.lines, { label: 'Total ajustes (fondos propios = VE + total)', value: eur(v.bridge.toEquity(0)), strong: true }]} />
                    <p className="text-xs text-slate-400 mt-2">Se aplica a los métodos que obtienen primero el valor de empresa (DCF, VE/EBITDA, VE/Ventas).</p>
                </Box>
            </div>
            {families.map(f => (
                <div key={f} className="space-y-3">
                    <div>
                        <h3 className="text-lg font-semibold">Métodos {f === 'Mercado' ? 'de mercado (múltiplos)' : f === 'Mixto' ? 'mixtos (fondo de comercio)' : f === 'Patrimonial' ? 'patrimoniales' : 'de rendimiento'}</h3>
                        <p className="text-sm text-slate-400">{desc[f]}</p>
                    </div>
                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {v.methods.filter(m => m.family === f).map(m => <MethodCard key={m.id} m={m} />)}
                    </div>
                </div>
            ))}
        </Section>
    );
};

const DcfSection: React.FC<{ v: Valuation }> = ({ v }) => {
    const d = v.dcf;
    const w = v.wacc;
    return (
        <Section id="v-dcf" title="Descuento de flujos de caja (DCF)" subtitle="Proyección a 5 años y valor residual a perpetuidad (método de Gordon).">
            <div className="grid md:grid-cols-2 gap-4">
                <Box>
                    <h3 className="font-semibold mb-2">Coste de capital (WACC)</h3>
                    <DetailTable lines={[
                        { label: 'Tipo sin riesgo', value: pct(w.riskFree) },
                        { label: 'Beta desapalancada → reapalancada', value: `${w.betaU.toLocaleString('es-ES')} → ${w.betaL.toLocaleString('es-ES', { maximumFractionDigits: 2 })}` },
                        { label: '× Prima de mercado', value: pct(w.erp) },
                        { label: '+ Prima por tamaño', value: pct(w.sizePremium) },
                        { label: '+ Prima específica / iliquidez', value: pct(w.specificPremium) },
                        { label: 'Coste de los recursos propios (Ke)', value: pct(w.ke), strong: true },
                        { label: 'Coste de la deuda después de impuestos', value: pct(w.kdAfterTax) },
                        { label: 'Peso de la deuda D/(D+E)', value: pct(w.debtRatio) },
                        { label: 'WACC', value: pct(w.wacc), strong: true },
                    ]} />
                </Box>
                {d ? (
                    <Box>
                        <h3 className="font-semibold mb-2">Valor</h3>
                        <DetailTable lines={[
                            { label: 'Valor actual de los flujos 5 años', value: eur(d.sumPv) },
                            { label: 'Flujo normalizado del año 6', value: eur(d.terminalFcf) },
                            { label: 'Valor residual en el año 5', value: eur(d.terminalValue) },
                            { label: 'Valor actual del valor residual', value: eur(d.pvTerminal) },
                            { label: 'Valor de empresa', value: eur(d.ev), strong: true },
                            { label: 'Peso del valor residual', value: pct(d.terminalShare) },
                            { label: 'Valor de los fondos propios', value: eur(d.equity), strong: true },
                        ]} />
                    </Box>
                ) : <Box><p className="text-slate-300">{v.methods.find(m => m.id === 'dcf')?.note}</p></Box>}
            </div>
            {d && (
                <>
                    <Box className="overflow-x-auto">
                        <table className="w-full text-sm tabular-nums min-w-[640px]">
                            <thead className="text-slate-400">
                                <tr className="border-b border-slate-700">
                                    <th className="text-left py-1">Concepto</th>
                                    {d.years.map(y => <th key={y.year} className="text-right py-1">{y.year}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {([
                                    ['Crecimiento de ventas', y => pct(y.growth)],
                                    ['Ventas', y => eur(y.ventas)],
                                    ['EBITDA', y => eur(y.ebitda)],
                                    ['− Amortización', y => eur(-y.da)],
                                    ['EBIT', y => eur(y.ebit)],
                                    ['− Impuesto sobre el EBIT', y => eur(-y.taxes)],
                                    ['NOPAT', y => eur(y.nopat)],
                                    ['+ Amortización', y => eur(y.da)],
                                    ['− Inversión (capex)', y => eur(-y.capex)],
                                    ['− Aumento de NOF', y => eur(-y.dNof)],
                                    ['Flujo de caja libre', y => eur(y.fcf)],
                                    ['Factor de descuento', y => y.discount.toLocaleString('es-ES', { maximumFractionDigits: 4 })],
                                    ['Valor actual', y => eur(y.pv)],
                                ] as [string, (y: NonNullable<Valuation['dcf']>['years'][number]) => string][]).map(([label, f]) => (
                                    <tr key={label} className={`border-b border-slate-700/50 ${label === 'Flujo de caja libre' || label === 'NOPAT' ? 'font-semibold' : ''}`}>
                                        <td className="py-1 pr-2 text-left">{label}</td>
                                        {d.years.map(y => <td key={y.year} className="py-1 text-right">{f(y)}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Box>
                    <Box className="overflow-x-auto">
                        <h3 className="font-semibold mb-2">Sensibilidad del valor de los fondos propios</h3>
                        <table className="w-full text-sm tabular-nums min-w-[560px]">
                            <thead>
                                <tr className="text-slate-400">
                                    <th className="text-left py-1">g \ WACC</th>
                                    {d.sensitivity.waccs.map(x => <th key={x} className="text-right py-1">{pct(x)}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {d.sensitivity.growths.map((g, i) => (
                                    <tr key={g} className="border-t border-slate-700/50">
                                        <td className="py-1 text-slate-400">{pct(g)}</td>
                                        {d.sensitivity.values[i].map((x, j) => (
                                            <td key={j} className={`py-1 text-right ${i === 2 && j === 2 ? 'font-bold text-sky-300' : ''}`}>{isNum(x) ? eur(x) : '—'}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Box>
                </>
            )}
        </Section>
    );
};

const Fiscal: React.FC<{ v: Valuation }> = ({ v }) => {
    const f = v.fiscal;
    const per = (x: number | null) => (v.conclusion.shares && isNum(x) ? eur(x / v.conclusion.shares) : '—');
    const rows: [string, number | null, string][] = [
        ['Valor nominal (capital)', f.nominal, 'Capital escriturado.'],
        ['Valor teórico contable', f.bookValue, `Patrimonio neto del último balance (${v.company.yearN}).`],
        ['Capitalización al 20 % de los beneficios', f.capitalization20, `Media de los resultados de ${f.profitsUsed.map(p => `${p.year} (${eur(p.value)})`).join(', ')} × 5.`],
        ['Mínimo IRPF (art. 37.1.b LIRPF)', f.irpfMinimum, 'Mayor del valor teórico y la capitalización al 20 %. Valor mínimo de transmisión para el transmitente.'],
        ['Impuesto sobre el Patrimonio (art. 16.Uno LIP)', f.wealthTax, f.audited ? 'Cuentas auditadas con informe favorable: valor teórico contable.' : 'Sin auditoría: mayor del nominal, el valor teórico y la capitalización al 20 %.'],
    ];
    return (
        <Section id="v-fiscal" title="Valores fiscales de referencia" subtitle="Participaciones no cotizadas, normativa estatal española.">
            <Box className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                    <thead className="text-slate-400">
                        <tr className="border-b border-slate-700">
                            <th className="text-left py-1">Criterio</th>
                            <th className="text-right py-1">100 %</th>
                            <th className="text-right py-1">Por participación</th>
                            <th className="text-left py-1 pl-4">Cálculo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(([label, x, note]) => (
                            <tr key={label} className="border-b border-slate-700/50">
                                <td className="py-1.5 pr-2">{label}</td>
                                <td className="py-1.5 text-right tabular-nums">{eur(x)}</td>
                                <td className="py-1.5 text-right tabular-nums">{per(x)}</td>
                                <td className="py-1.5 pl-4 text-slate-400">{note}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Box>
            <Box className="text-sm text-slate-300 space-y-2">
                <p><strong>Donación de participaciones.</strong> El Impuesto sobre Sucesiones y Donaciones grava el valor de mercado de lo donado (art. 9 LISD); en la práctica se contrasta con los valores anteriores y, si se aplica la reducción por empresa familiar, con el valor de los activos afectos. En el IRPF del donante la ganancia patrimonial se calcula con el mayor de los valores del art. 37.1.b, salvo que resulte aplicable el diferimiento del art. 33.3.c LIRPF.</p>
                <p>Use la pestaña «Calculadora de donaciones» para estimar el coste fiscal con estos datos (patrimonio neto {eur(f.bookValue)}; beneficio medio {eur(f.profitsUsed.length ? f.profitsUsed.reduce((s, p) => s + p.value, 0) / f.profitsUsed.length : null)}).</p>
            </Box>
        </Section>
    );
};

const Questions: React.FC<{ v: Valuation }> = ({ v }) => (
    <Section id="v-preguntas" title="Información a solicitar para afinar la valoración">
        <Box><ul className="list-disc pl-5 space-y-1 text-slate-200">{v.questions.map((q, i) => <li key={i}>{q}</li>)}</ul></Box>
    </Section>
);

// ---------------------------------------------------------------------------
// Hipótesis editables
// ---------------------------------------------------------------------------

const Assumptions: React.FC<{ v: Valuation; onChange: (i: ValuationInputs) => void }> = ({ v, onChange }) => {
    const inputs = v.inputs;
    const setOverride = (k: AssumptionKey, x: number | null) => {
        const overrides = { ...inputs.overrides };
        if (x === null) delete overrides[k]; else overrides[k] = x;
        onChange({ ...inputs, overrides });
    };
    const groups = Array.from(new Set(ASSUMPTION_FIELDS.map(f => f.group)));
    const weightIds = Object.keys(METHOD_LABELS) as MethodId[];
    const customWeights = Object.keys(inputs.weights).length > 0;
    const setWeight = (id: MethodId, x: number | null) => {
        const base = customWeights ? { ...inputs.weights } : Object.fromEntries(v.methods.map(m => [m.id, Math.round(m.weight * 100)]));
        if (x === null || x === 0) delete base[id]; else base[id] = x;
        onChange({ ...inputs, weights: base });
    };
    const changed = Object.keys(inputs.overrides).length;
    return (
        <Section id="v-hipotesis" title="Hipótesis" subtitle="Todos los valores se calculan automáticamente a partir de los datos y del sector. Escriba un valor para sustituirlo; borre el campo para volver al automático. La valoración se recalcula al instante.">
            <div className="flex flex-wrap gap-3 items-center print:hidden">
                <label className="text-sm text-slate-300 flex items-center gap-2">
                    Beneficio de referencia
                    <select className="bg-slate-700 border border-slate-600 rounded-md px-2 py-1" value={inputs.earningsBase} onChange={e => onChange({ ...inputs, earningsBase: e.target.value as ValuationInputs['earningsBase'] })}>
                        <option value="last">Último ejercicio</option>
                        <option value="average">Media de los últimos 3 ejercicios</option>
                    </select>
                </label>
                <label className="text-sm text-slate-300 flex items-center gap-2">
                    <input type="checkbox" checked={inputs.audited} onChange={e => onChange({ ...inputs, audited: e.target.checked })} />
                    Cuentas auditadas con informe favorable
                </label>
                {(changed > 0 || customWeights) && (
                    <button type="button" className="ml-auto px-3 py-1.5 rounded-md text-sm bg-slate-800 border border-slate-700 hover:bg-slate-700" onClick={() => onChange({ ...defaultValuationInputs(), earningsBase: inputs.earningsBase, audited: inputs.audited })}>
                        Volver a todas las hipótesis automáticas
                    </button>
                )}
            </div>
            <div className="grid lg:grid-cols-2 gap-4">
                {groups.map(g => (
                    <Box key={g}>
                        <h3 className="font-semibold mb-3">{g}</h3>
                        <div className="space-y-3">
                            {ASSUMPTION_FIELDS.filter(f => f.group === g).map(f => {
                                const o = inputs.overrides[f.key];
                                const auto = v.autoAssumptions[f.key];
                                return (
                                    <div key={f.key} className="grid grid-cols-[1fr_8rem] gap-3 items-start">
                                        <div>
                                            <div className="text-sm text-slate-200">{f.label} <span className="text-slate-500">({f.unit})</span></div>
                                            <div className="text-xs text-slate-400">
                                                {isNum(o) ? <span className="text-amber-300">Modificado · automático: {fmtUnit(auto, f.unit)}</span> : <>Automático{v.autoWhy[f.key] ? `: ${v.autoWhy[f.key]}` : ''}</>}
                                                {f.hint && <> · {f.hint}</>}
                                            </div>
                                        </div>
                                        <AmountInput
                                            allowEmpty
                                            ariaLabel={f.label}
                                            value={isNum(o) ? o : null}
                                            placeholder={f.key === 'shares' && !auto ? '—' : auto.toLocaleString('es-ES', { maximumFractionDigits: 2 })}
                                            onChange={x => setOverride(f.key, x)}
                                            className={isNum(o) ? 'border-amber-500' : ''}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </Box>
                ))}
                <Box>
                    <h3 className="font-semibold mb-1">Ponderación de los métodos</h3>
                    <p className="text-xs text-slate-400 mb-3">{customWeights ? 'Ponderación propia.' : `Automática según el perfil: ${v.profileText}`} Los pesos se normalizan a 100 % entre los métodos aplicables.</p>
                    <div className="space-y-2">
                        {weightIds.map(id => {
                            const m = v.methods.find(x => x.id === id)!;
                            const shown = customWeights ? inputs.weights[id] ?? 0 : Math.round(m.weight * 100);
                            return (
                                <div key={id} className="grid grid-cols-[1fr_6rem_5rem] gap-2 items-center text-sm">
                                    <span className={m.applicable ? 'text-slate-200' : 'text-slate-500'}>{METHOD_LABELS[id]}{!m.applicable && ' (no aplicable)'}</span>
                                    <AmountInput allowEmpty ariaLabel={`Peso ${METHOD_LABELS[id]}`} value={shown || null} placeholder="0" onChange={x => setWeight(id, x)} />
                                    <span className="text-right text-slate-400 tabular-nums">{Math.round(m.weight * 100)} %</span>
                                </div>
                            );
                        })}
                    </div>
                    {customWeights && (
                        <button type="button" className="mt-3 px-3 py-1.5 rounded-md text-sm bg-slate-800 border border-slate-700 hover:bg-slate-700" onClick={() => onChange({ ...inputs, weights: {} })}>Ponderación automática</button>
                    )}
                </Box>
            </div>
        </Section>
    );
};

// ---------------------------------------------------------------------------
// Contenedor
// ---------------------------------------------------------------------------

type TabId = 'resumen' | 'hipotesis' | 'metodos' | 'dcf' | 'fiscal' | 'preguntas';

export const ValuationReport: React.FC<{ valuation: Valuation; onInputsChange: (i: ValuationInputs) => void; printAll: boolean }> = ({ valuation: v, onInputsChange, printAll }) => {
    const [tab, setTab] = useState<TabId>('resumen');
    const tabs: { id: TabId; label: string; node: React.ReactNode }[] = [
        { id: 'resumen', label: 'Conclusión', node: <Summary v={v} /> },
        { id: 'hipotesis', label: 'Hipótesis', node: <Assumptions v={v} onChange={onInputsChange} /> },
        { id: 'metodos', label: 'Métodos', node: <Methods v={v} /> },
        { id: 'dcf', label: 'DCF y WACC', node: <DcfSection v={v} /> },
        { id: 'fiscal', label: 'Valores fiscales', node: <Fiscal v={v} /> },
        { id: 'preguntas', label: 'Info. a pedir', node: <Questions v={v} /> },
    ];
    if (printAll) {
        return <div className="space-y-10">{tabs.filter(t => t.id !== 'hipotesis').map(t => <React.Fragment key={t.id}>{t.node}</React.Fragment>)}<HypothesisSummary v={v} /></div>;
    }
    return (
        <div className="space-y-6">
            <nav className="flex flex-wrap gap-2 sticky top-0 z-10 bg-slate-900/95 py-2 backdrop-blur print:hidden">
                {tabs.map(t => (
                    <button key={t.id} type="button" onClick={() => setTab(t.id)}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium ${tab === t.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                        {t.label}
                    </button>
                ))}
            </nav>
            {tabs.find(t => t.id === tab)!.node}
        </div>
    );
};

/** Hipótesis en forma de tabla, para el informe descargado. */
const HypothesisSummary: React.FC<{ v: Valuation }> = ({ v }) => (
    <Section id="v-hipotesis-resumen" title="Hipótesis utilizadas">
        <Box>
            <DetailTable lines={[
                { label: 'Beneficio de referencia', value: v.inputs.earningsBase === 'average' ? 'Media de los últimos 3 ejercicios' : 'Último ejercicio' },
                ...ASSUMPTION_FIELDS.filter(f => f.key !== 'shares' || v.assumptions.shares > 0).map(f => ({
                    label: `${f.label}${isNum(v.inputs.overrides[f.key]) ? ' (modificado)' : ''}`,
                    value: fmtUnit(v.assumptions[f.key], f.unit),
                })),
            ]} />
        </Box>
    </Section>
);
