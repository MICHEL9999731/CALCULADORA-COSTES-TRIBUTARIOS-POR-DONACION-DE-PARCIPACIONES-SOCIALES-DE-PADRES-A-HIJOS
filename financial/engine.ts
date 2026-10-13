// Motor de análisis financiero: a partir del balance y la cuenta de pérdidas y
// ganancias de dos ejercicios produce el trabajo de un director financiero
// (análisis, ratios, flujos de caja, riesgos, diagnóstico y plan de acción).

import {
    BALANCE_LINES, PYG_LINES,
    type BalanceSection, type CompanyInfo, type FinancialDataset, type Sector, type YearValues,
} from './schema';
import { eur, pct, times, days, signedPct, isNum, type ValueFormat } from './format';

// ---------------------------------------------------------------------------
// Tipos de resultado
// ---------------------------------------------------------------------------

export type Status = 'good' | 'warn' | 'bad' | 'neutral';

export interface YearFigures {
    lines: YearValues; // valores normalizados (signos coherentes)
    // Masas patrimoniales
    anc: number; ac: number; pn: number; pnc: number; pc: number;
    activo: number; pasivo: number; pnYPasivo: number;
    // Agregados de análisis
    deudaFinLP: number; deudaFinCP: number; deudaFin: number;
    liquidez: number; dfn: number;
    activoCircOperativo: number; pasivoCircOperativo: number;
    nof: number; fm: number; recursosPermanentes: number;
    // Cuenta de resultados
    ventas: number; margenBruto: number; ebitda: number; noRecurrente: number;
    amortizacion: number; ebit: number; resultadoFinanciero: number;
    rai: number; impuesto: number; resultado: number;
    gastosFinancieros: number; // en positivo
    tipoEfectivo: number | null;
}

export interface Ratio {
    id: string;
    category: 'Liquidez' | 'Solvencia y endeudamiento' | 'Rentabilidad' | 'Márgenes' | 'Actividad y circulante' | 'Crecimiento' | 'Productividad';
    label: string;
    format: ValueFormat;
    n: number | null;
    n1: number | null;
    status: Status;
    higherIsBetter: boolean | null;
    benchmark: string;
    explanation: string;
}

export interface CashFlowItem { label: string; value: number; detail?: string }

export interface CashFlow {
    operating: CashFlowItem[];
    operatingTotal: number;
    investing: CashFlowItem[];
    investingTotal: number;
    financing: CashFlowItem[];
    financingTotal: number;
    netChange: number;
    actualCashChange: number;
    unreconciled: number;
    capex: number;
    freeCashFlow: number;
    dividendsEstimate: number;
    cashConversion: number | null; // FCO / EBITDA
}

export interface AltmanResult {
    model: "Z' (empresas industriales no cotizadas)" | "Z'' (empresas no industriales)";
    x: { label: string; value: number }[];
    z: number;
    zone: 'segura' | 'gris' | 'riesgo';
    thresholds: [number, number];
}

export interface BreakEven {
    variableCosts: number;
    fixedCosts: number;
    contributionMargin: number;
    contributionMarginPct: number | null;
    breakEvenSales: number | null;
    safetyMargin: number | null;
}

export interface Check {
    severity: 'critical' | 'warning' | 'info';
    title: string;
    detail: string;
}

export interface Finding {
    area: string;
    tone: 'positive' | 'negative' | 'neutral';
    severity: 'critical' | 'warning' | 'info' | 'positive';
    title: string;
    detail: string;
}

export interface Recommendation {
    priority: 'Alta' | 'Media' | 'Baja';
    area: string;
    title: string;
    detail: string;
    impact: string | null;
    horizon: 'Inmediato' | 'Corto plazo (0-6 meses)' | 'Medio plazo (6-18 meses)';
}

export interface RowComparison {
    id: string;
    label: string;
    n: number;
    n1: number;
    diff: number;
    var: number | null;
    weightN: number | null;
    weightN1: number | null;
    level: 0 | 1 | 2; // 0 = total, 1 = subtotal, 2 = partida
}

export interface Analysis {
    company: CompanyInfo;
    n: YearFigures;
    n1: YearFigures;
    balanceRows: RowComparison[];
    pygRows: RowComparison[];
    ratios: Ratio[];
    cashFlow: CashFlow;
    altman: AltmanResult;
    altmanN1: AltmanResult;
    breakEven: BreakEven;
    breakEvenN1: BreakEven;
    debt: {
        capacity: number;
        yearsToRepay: number | null;
        dscr: number | null;
        debtServiceUsed: number;
        availableCreditLines: number | null;
        shortTermShare: number | null;
    };
    checks: Check[];
    findings: Finding[];
    recommendations: Recommendation[];
    questions: string[];
    score: number;
    grade: string;
    summary: string[];
    warnings: string[];
}

// ---------------------------------------------------------------------------
// Normalización y agregados
// ---------------------------------------------------------------------------

const val = (y: YearValues, id: string): number => {
    const n = y[id];
    return isNum(n) ? n : 0;
};

export function normalizeYear(raw: YearValues): { values: YearValues; fixed: string[] } {
    const values: YearValues = {};
    const fixed: string[] = [];
    for (const l of BALANCE_LINES) {
        const v = val(raw, l.id);
        values[l.id] = l.negative ? -Math.abs(v) : v;
    }
    for (const l of PYG_LINES) {
        const v = val(raw, l.id);
        if (l.nature === 'expense') {
            if (v > 0) fixed.push(l.label);
            values[l.id] = -Math.abs(v);
        } else if (l.nature === 'income') {
            values[l.id] = Math.abs(v);
        } else {
            values[l.id] = v;
        }
    }
    return { values, fixed };
}

const sumSection = (y: YearValues, section: BalanceSection) =>
    BALANCE_LINES.filter(l => l.section === section).reduce((a, l) => a + val(y, l.id), 0);

const sum = (y: YearValues, ids: string[]) => ids.reduce((a, id) => a + val(y, id), 0);

export const DEBT_LP = ['deudaBancariaLP', 'leasingLP', 'otrasDeudasLP', 'deudaGrupoLP'];
export const DEBT_CP = ['deudaBancariaCP', 'leasingCP', 'otrasDeudasCP', 'deudaGrupoCP'];
const OP_CURRENT_ASSETS = ['existencias', 'clientes', 'otrosDeudores', 'periodifActivo'];
const OP_CURRENT_LIABS = ['proveedores', 'otrosAcreedores', 'periodifPasivoCP', 'provisionesCP'];
const EBITDA_LINES = ['ventas', 'varExistencias', 'trabajosActivo', 'aprovisionamientos', 'otrosIngresosExpl', 'personal', 'otrosGastosExpl'];
const NON_RECURRING = ['imputacionSubv', 'excesoProvisiones', 'deterioroInmov', 'otrosResultados'];

export function computeFigures(y: YearValues): YearFigures {
    const anc = sumSection(y, 'anc');
    const ac = sumSection(y, 'ac');
    const pn = sumSection(y, 'pn');
    const pnc = sumSection(y, 'pnc');
    const pc = sumSection(y, 'pc');
    const deudaFinLP = sum(y, DEBT_LP);
    const deudaFinCP = sum(y, DEBT_CP);
    const deudaFin = deudaFinLP + deudaFinCP;
    const liquidez = val(y, 'efectivo') + val(y, 'invFinCP');
    const activoCircOperativo = sum(y, OP_CURRENT_ASSETS);
    const pasivoCircOperativo = sum(y, OP_CURRENT_LIABS);

    const ventas = val(y, 'ventas');
    const margenBruto = ventas + val(y, 'varExistencias') + val(y, 'aprovisionamientos');
    const ebitda = sum(y, EBITDA_LINES);
    const noRecurrente = sum(y, NON_RECURRING);
    const amortizacion = val(y, 'amortizacion');
    const ebit = ebitda + amortizacion + noRecurrente;
    const resultadoFinanciero = sum(y, ['ingresosFin', 'gastosFin', 'otrosFin']);
    const rai = ebit + resultadoFinanciero;
    const impuesto = val(y, 'impuesto');
    const resultado = rai + impuesto;
    const tipoEfectivo = rai > 0 ? Math.min(Math.max(-impuesto / rai, 0), 0.6) : null;

    return {
        lines: y,
        anc, ac, pn, pnc, pc,
        activo: anc + ac,
        pasivo: pnc + pc,
        pnYPasivo: pn + pnc + pc,
        deudaFinLP, deudaFinCP, deudaFin,
        liquidez,
        dfn: deudaFin - liquidez,
        activoCircOperativo, pasivoCircOperativo,
        nof: activoCircOperativo - pasivoCircOperativo,
        fm: ac - pc,
        recursosPermanentes: pn + pnc,
        ventas, margenBruto, ebitda, noRecurrente, amortizacion, ebit,
        resultadoFinanciero, rai, impuesto, resultado,
        gastosFinancieros: Math.abs(val(y, 'gastosFin')),
        tipoEfectivo,
    };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const div = (a: number, b: number): number | null => (b === 0 || !isNum(a) || !isNum(b) ? null : a / b);
const growth = (n: number, n1: number): number | null => (n1 === 0 ? null : (n - n1) / Math.abs(n1));
const avg = (a: number, b: number) => (a + b) / 2;

interface Band { good: number; bad: number; higherIsBetter: boolean }

const assess = (v: number | null, band: Band | null): Status => {
    if (!isNum(v) || !band) return 'neutral';
    if (band.higherIsBetter) {
        if (v >= band.good) return 'good';
        if (v <= band.bad) return 'bad';
        return 'warn';
    }
    if (v <= band.good) return 'good';
    if (v >= band.bad) return 'bad';
    return 'warn';
};

const bandText = (b: Band, format: ValueFormat): string => {
    const f = (n: number) => (format === 'pct' ? pct(n) : format === 'days' ? days(n) : times(n));
    return b.higherIsBetter ? `Bueno ≥ ${f(b.good)} · Débil ≤ ${f(b.bad)}` : `Bueno ≤ ${f(b.good)} · Débil ≥ ${f(b.bad)}`;
};

// Referencias orientativas por sector para PYMES españolas.
interface SectorBenchmarks {
    liquidity: Band; acid: Band; ebitdaMargin: Band; grossMargin: Band | null; pmc: Band; pme: Band | null; roa: Band; assetTurnover: Band;
}

const SECTOR_BENCHMARKS: Record<Sector, SectorBenchmarks> = {
    industria: { liquidity: { good: 1.5, bad: 1.0, higherIsBetter: true }, acid: { good: 1.0, bad: 0.7, higherIsBetter: true }, ebitdaMargin: { good: 0.12, bad: 0.06, higherIsBetter: true }, grossMargin: { good: 0.45, bad: 0.3, higherIsBetter: true }, pmc: { good: 60, bad: 90, higherIsBetter: false }, pme: { good: 60, bad: 120, higherIsBetter: false }, roa: { good: 0.08, bad: 0.03, higherIsBetter: true }, assetTurnover: { good: 1.0, bad: 0.6, higherIsBetter: true } },
    comercio: { liquidity: { good: 1.3, bad: 1.0, higherIsBetter: true }, acid: { good: 0.8, bad: 0.5, higherIsBetter: true }, ebitdaMargin: { good: 0.06, bad: 0.03, higherIsBetter: true }, grossMargin: { good: 0.3, bad: 0.18, higherIsBetter: true }, pmc: { good: 45, bad: 75, higherIsBetter: false }, pme: { good: 45, bad: 90, higherIsBetter: false }, roa: { good: 0.07, bad: 0.03, higherIsBetter: true }, assetTurnover: { good: 1.8, bad: 1.0, higherIsBetter: true } },
    servicios: { liquidity: { good: 1.5, bad: 1.0, higherIsBetter: true }, acid: { good: 1.2, bad: 0.8, higherIsBetter: true }, ebitdaMargin: { good: 0.15, bad: 0.07, higherIsBetter: true }, grossMargin: null, pmc: { good: 60, bad: 90, higherIsBetter: false }, pme: null, roa: { good: 0.1, bad: 0.04, higherIsBetter: true }, assetTurnover: { good: 1.2, bad: 0.7, higherIsBetter: true } },
    construccion: { liquidity: { good: 1.4, bad: 1.0, higherIsBetter: true }, acid: { good: 0.9, bad: 0.6, higherIsBetter: true }, ebitdaMargin: { good: 0.1, bad: 0.05, higherIsBetter: true }, grossMargin: { good: 0.3, bad: 0.15, higherIsBetter: true }, pmc: { good: 75, bad: 120, higherIsBetter: false }, pme: { good: 120, bad: 365, higherIsBetter: false }, roa: { good: 0.07, bad: 0.03, higherIsBetter: true }, assetTurnover: { good: 0.8, bad: 0.4, higherIsBetter: true } },
    hosteleria: { liquidity: { good: 1.0, bad: 0.6, higherIsBetter: true }, acid: { good: 0.8, bad: 0.4, higherIsBetter: true }, ebitdaMargin: { good: 0.15, bad: 0.08, higherIsBetter: true }, grossMargin: { good: 0.65, bad: 0.55, higherIsBetter: true }, pmc: { good: 15, bad: 45, higherIsBetter: false }, pme: { good: 15, bad: 40, higherIsBetter: false }, roa: { good: 0.08, bad: 0.03, higherIsBetter: true }, assetTurnover: { good: 1.2, bad: 0.7, higherIsBetter: true } },
    agricultura: { liquidity: { good: 1.5, bad: 1.0, higherIsBetter: true }, acid: { good: 0.9, bad: 0.6, higherIsBetter: true }, ebitdaMargin: { good: 0.1, bad: 0.05, higherIsBetter: true }, grossMargin: { good: 0.35, bad: 0.2, higherIsBetter: true }, pmc: { good: 60, bad: 90, higherIsBetter: false }, pme: { good: 90, bad: 180, higherIsBetter: false }, roa: { good: 0.06, bad: 0.02, higherIsBetter: true }, assetTurnover: { good: 0.8, bad: 0.4, higherIsBetter: true } },
    tecnologia: { liquidity: { good: 1.8, bad: 1.1, higherIsBetter: true }, acid: { good: 1.5, bad: 0.9, higherIsBetter: true }, ebitdaMargin: { good: 0.18, bad: 0.08, higherIsBetter: true }, grossMargin: null, pmc: { good: 60, bad: 90, higherIsBetter: false }, pme: null, roa: { good: 0.12, bad: 0.04, higherIsBetter: true }, assetTurnover: { good: 1.0, bad: 0.6, higherIsBetter: true } },
};

// ---------------------------------------------------------------------------
// Comparativos horizontal / vertical
// ---------------------------------------------------------------------------

function comparisonRows(n: YearFigures, n1: YearFigures): { balance: RowComparison[]; pyg: RowComparison[] } {
    const row = (id: string, label: string, a: number, b: number, baseN: number, baseN1: number, level: 0 | 1 | 2): RowComparison => ({
        id, label, n: a, n1: b, diff: a - b, var: growth(a, b),
        weightN: div(a, baseN), weightN1: div(b, baseN1), level,
    });

    const balance: RowComparison[] = [];
    const sectionTotals: Record<BalanceSection, [number, number]> = {
        anc: [n.anc, n1.anc], ac: [n.ac, n1.ac], pn: [n.pn, n1.pn], pnc: [n.pnc, n1.pnc], pc: [n.pc, n1.pc],
    };
    const sectionLabels: Record<BalanceSection, string> = {
        anc: 'ACTIVO NO CORRIENTE', ac: 'ACTIVO CORRIENTE', pn: 'PATRIMONIO NETO', pnc: 'PASIVO NO CORRIENTE', pc: 'PASIVO CORRIENTE',
    };
    const pushSection = (s: BalanceSection, baseN: number, baseN1: number) => {
        balance.push(row(`tot_${s}`, sectionLabels[s], sectionTotals[s][0], sectionTotals[s][1], baseN, baseN1, 1));
        for (const l of BALANCE_LINES.filter(x => x.section === s)) {
            const a = val(n.lines, l.id), b = val(n1.lines, l.id);
            if (a !== 0 || b !== 0) balance.push(row(l.id, l.label, a, b, baseN, baseN1, 2));
        }
    };
    pushSection('anc', n.activo, n1.activo);
    pushSection('ac', n.activo, n1.activo);
    balance.push(row('tot_activo', 'TOTAL ACTIVO', n.activo, n1.activo, n.activo, n1.activo, 0));
    pushSection('pn', n.pnYPasivo, n1.pnYPasivo);
    pushSection('pnc', n.pnYPasivo, n1.pnYPasivo);
    pushSection('pc', n.pnYPasivo, n1.pnYPasivo);
    balance.push(row('tot_pasivo', 'TOTAL PATRIMONIO NETO Y PASIVO', n.pnYPasivo, n1.pnYPasivo, n.pnYPasivo, n1.pnYPasivo, 0));

    const pyg: RowComparison[] = [];
    const vN = n.ventas, vN1 = n1.ventas;
    const line = (id: string) => {
        const l = PYG_LINES.find(x => x.id === id)!;
        const a = val(n.lines, id), b = val(n1.lines, id);
        if (a !== 0 || b !== 0) pyg.push(row(id, l.label, a, b, vN, vN1, 2));
    };
    line('ventas'); line('varExistencias'); line('aprovisionamientos');
    pyg.push(row('margenBruto', 'MARGEN BRUTO', n.margenBruto, n1.margenBruto, vN, vN1, 1));
    line('trabajosActivo'); line('otrosIngresosExpl'); line('personal'); line('otrosGastosExpl');
    pyg.push(row('ebitda', 'EBITDA', n.ebitda, n1.ebitda, vN, vN1, 1));
    line('amortizacion'); line('imputacionSubv'); line('excesoProvisiones'); line('deterioroInmov'); line('otrosResultados');
    pyg.push(row('ebit', 'RESULTADO DE EXPLOTACIÓN (EBIT)', n.ebit, n1.ebit, vN, vN1, 1));
    line('ingresosFin'); line('gastosFin'); line('otrosFin');
    pyg.push(row('rdoFin', 'RESULTADO FINANCIERO', n.resultadoFinanciero, n1.resultadoFinanciero, vN, vN1, 1));
    pyg.push(row('rai', 'RESULTADO ANTES DE IMPUESTOS', n.rai, n1.rai, vN, vN1, 1));
    line('impuesto');
    pyg.push(row('resultado', 'RESULTADO DEL EJERCICIO', n.resultado, n1.resultado, vN, vN1, 0));
    return { balance, pyg };
}

// ---------------------------------------------------------------------------
// Ratios
// ---------------------------------------------------------------------------

function computeRatios(n: YearFigures, n1: YearFigures, c: CompanyInfo): Ratio[] {
    const bm = SECTOR_BENCHMARKS[c.sector];
    const iva = 1 + Math.max(c.vatRate, 0) / 100;
    const ratios: Ratio[] = [];

    const add = (
        id: string, category: Ratio['category'], label: string, format: ValueFormat,
        f: (y: YearFigures, other: YearFigures, isN: boolean) => number | null,
        band: Band | null, explanation: string, higherIsBetter: boolean | null = band ? band.higherIsBetter : null,
    ) => {
        const vn = f(n, n1, true);
        const vn1 = f(n1, n, false);
        ratios.push({
            id, category, label, format, n: vn, n1: vn1,
            status: assess(vn, band), higherIsBetter,
            benchmark: band ? bandText(band, format) : 'Sin referencia general',
            explanation,
        });
    };
    const L = (y: YearFigures, id: string) => val(y.lines, id);

    // Liquidez
    add('liquidez', 'Liquidez', 'Liquidez general (AC / PC)', 'x', y => div(y.ac, y.pc), bm.liquidity,
        'Capacidad de atender las deudas a corto plazo con el activo corriente.');
    add('acida', 'Liquidez', 'Prueba ácida ((AC − existencias) / PC)', 'x', y => div(y.ac - L(y, 'existencias') - L(y, 'ancVenta'), y.pc), bm.acid,
        'Liquidez sin depender de la venta de existencias.');
    add('tesoreria', 'Liquidez', 'Disponibilidad (tesorería / PC)', 'x', y => div(y.liquidez, y.pc), { good: 0.2, bad: 0.08, higherIsBetter: true },
        'Tesorería e inversiones financieras a corto sobre el pasivo corriente. Un valor muy alto puede indicar caja ociosa.');
    add('fmActivo', 'Liquidez', 'Fondo de maniobra / activo total', 'pct', y => div(y.fm, y.activo), { good: 0.1, bad: 0, higherIsBetter: true },
        'Parte del activo corriente financiada con recursos permanentes.');

    // Solvencia y endeudamiento
    add('endeudamiento', 'Solvencia y endeudamiento', 'Endeudamiento (pasivo / activo)', 'pct', y => div(y.pasivo, y.activo), { good: 0.5, bad: 0.7, higherIsBetter: false },
        'Proporción del activo financiada con recursos ajenos.');
    add('solvencia', 'Solvencia y endeudamiento', 'Solvencia (activo / pasivo)', 'x', y => div(y.activo, y.pasivo), { good: 1.8, bad: 1.3, higherIsBetter: true },
        'Garantía que ofrece el activo frente a la totalidad de las deudas. Por debajo de 1 hay quiebra técnica.');
    add('calidadDeuda', 'Solvencia y endeudamiento', 'Calidad de la deuda (PC / pasivo)', 'pct', y => div(y.pc, y.pasivo), { good: 0.5, bad: 0.8, higherIsBetter: false },
        'Cuanto mayor es, más presión de vencimientos a corto plazo.');
    add('dfnEbitda', 'Solvencia y endeudamiento', 'Deuda financiera neta / EBITDA', 'x', y => (y.ebitda > 0 ? y.dfn / y.ebitda : null), { good: 2, bad: Math.max(c.targetLeverage, 2.5) + 0.5, higherIsBetter: false },
        'Años de EBITDA necesarios para devolver la deuda neta. Es el ratio que más miran los bancos. Negativo = caja neta.');
    add('dfnPn', 'Solvencia y endeudamiento', 'Deuda financiera neta / patrimonio neto', 'x', y => (y.pn > 0 ? y.dfn / y.pn : null), { good: 0.5, bad: 1.5, higherIsBetter: false },
        'Apalancamiento financiero sobre fondos propios.');
    add('cobertura', 'Solvencia y endeudamiento', 'Cobertura de intereses (EBITDA / gastos financieros)', 'x', y => (y.gastosFinancieros > 0 ? y.ebitda / y.gastosFinancieros : null), { good: 6, bad: 3, higherIsBetter: true },
        'Veces que el EBITDA cubre la carga financiera.');
    add('costeDeuda', 'Solvencia y endeudamiento', 'Coste medio de la deuda financiera', 'pct', (y, o, isN) => {
        const base = isN ? avg(y.deudaFin, o.deudaFin) : y.deudaFin;
        return base > 0 ? y.gastosFinancieros / base : null;
    }, { good: 0.045, bad: 0.075, higherIsBetter: false },
        'Gastos financieros sobre la deuda financiera media (incluye comisiones y descuento).');

    // Rentabilidad
    add('roe', 'Rentabilidad', 'ROE (resultado / patrimonio neto)', 'pct', y => (y.pn > 0 ? y.resultado / y.pn : null), { good: 0.12, bad: 0.05, higherIsBetter: true },
        'Rentabilidad para el socio. Debe superar claramente el coste de oportunidad del capital (8-12 % en PYME).');
    add('roa', 'Rentabilidad', 'ROA (EBIT / activo total)', 'pct', y => div(y.ebit, y.activo), bm.roa,
        'Rentabilidad económica del negocio, independientemente de cómo se financie.');
    add('roce', 'Rentabilidad', 'ROCE (EBIT × (1 − t) / capital empleado)', 'pct', y => {
        const ce = y.pn + y.dfn;
        const t = y.tipoEfectivo ?? 0.25;
        return ce > 0 ? (y.ebit * (1 - t)) / ce : null;
    }, { good: 0.1, bad: 0.05, higherIsBetter: true },
        'Rentabilidad después de impuestos sobre el capital invertido (fondos propios + deuda neta). Compárelo con el coste medio de capital.');
    add('rotacion', 'Rentabilidad', 'Rotación del activo (ventas / activo)', 'x', y => div(y.ventas, y.activo), bm.assetTurnover,
        'Euros vendidos por cada euro invertido en el activo.');
    add('apalancamiento', 'Rentabilidad', 'Efecto apalancamiento (activo / PN × RAI / EBIT)', 'x', y => (y.pn > 0 && y.ebit !== 0 ? (y.activo / y.pn) * (y.rai / y.ebit) : null), { good: 1.2, bad: 1.0, higherIsBetter: true },
        'Mayor que 1: la deuda está aumentando la rentabilidad del socio. Menor que 1: la deuda la está destruyendo.');

    // Márgenes
    add('margenBruto', 'Márgenes', 'Margen bruto / ventas', 'pct', y => div(y.margenBruto, y.ventas), bm.grossMargin,
        'Lo que queda de cada euro vendido tras el coste de los aprovisionamientos.', true);
    add('margenEbitda', 'Márgenes', 'Margen EBITDA', 'pct', y => div(y.ebitda, y.ventas), bm.ebitdaMargin,
        'Rentabilidad operativa antes de amortizaciones: capacidad de generar caja del negocio.');
    add('margenEbit', 'Márgenes', 'Margen de explotación (EBIT)', 'pct', y => div(y.ebit, y.ventas), { good: bm.ebitdaMargin.good * 0.65, bad: bm.ebitdaMargin.bad * 0.5, higherIsBetter: true },
        'Resultado de explotación sobre ventas.');
    add('margenNeto', 'Márgenes', 'Margen neto', 'pct', y => div(y.resultado, y.ventas), { good: bm.ebitdaMargin.good * 0.45, bad: 0.01, higherIsBetter: true },
        'Beneficio final por cada euro vendido.');
    add('personalVentas', 'Márgenes', 'Gastos de personal / ventas', 'pct', y => div(-L(y, 'personal'), y.ventas), null,
        'Peso de la plantilla en la cuenta de resultados. Su evolución frente a las ventas indica la productividad.', false);
    add('otrosGastosVentas', 'Márgenes', 'Otros gastos de explotación / ventas', 'pct', y => div(-L(y, 'otrosGastosExpl'), y.ventas), null,
        'Peso de los gastos generales (alquileres, suministros, servicios exteriores, tributos…).', false);
    add('gastosFinVentas', 'Márgenes', 'Gastos financieros / ventas', 'pct', y => div(y.gastosFinancieros, y.ventas), { good: 0.015, bad: 0.04, higherIsBetter: false },
        'Carga financiera sobre la actividad.');

    // Actividad y circulante
    const pmc = (y: YearFigures) => (y.ventas > 0 ? (L(y, 'clientes') / (y.ventas * iva)) * 365 : null);
    const compras = (y: YearFigures) => -L(y, 'aprovisionamientos') - L(y, 'otrosGastosExpl');
    const pmp = (y: YearFigures) => (compras(y) > 0 ? (L(y, 'proveedores') / (compras(y) * iva)) * 365 : null);
    const pme = (y: YearFigures) => (-L(y, 'aprovisionamientos') > 0 && L(y, 'existencias') > 0 ? (L(y, 'existencias') / -L(y, 'aprovisionamientos')) * 365 : null);
    add('pmc', 'Actividad y circulante', 'Periodo medio de cobro', 'days', pmc, bm.pmc,
        `Días que tardan en cobrarse las ventas (se aplica un IVA medio del ${c.vatRate} %). Legalmente el plazo máximo entre empresas es 60 días (Ley 3/2004).`);
    add('pmp', 'Actividad y circulante', 'Periodo medio de pago', 'days', pmp, { good: 60, bad: 75, higherIsBetter: false },
        'Días que se tarda en pagar a proveedores y acreedores. Por encima de 60 días se incumple la Ley de morosidad y se tensiona la relación.');
    add('pme', 'Actividad y circulante', 'Periodo medio de existencias', 'days', pme, bm.pme,
        'Días que permanece el stock en almacén (existencias / aprovisionamientos).');
    add('ciclo', 'Actividad y circulante', 'Ciclo de conversión de caja', 'days', y => {
        const a = pmc(y), b = pmp(y), e = pme(y) ?? 0;
        return isNum(a) && isNum(b) ? a + e - b : null;
    }, null, 'Días que transcurren desde que se paga a proveedores hasta que se cobra de clientes. Cuanto menor, menos financiación necesita el negocio.', false);
    add('nofDias', 'Actividad y circulante', 'NOF en días de venta', 'days', y => (y.ventas > 0 ? (y.nof / y.ventas) * 365 : null), null,
        'Necesidades operativas de fondos expresadas en días de facturación.', false);

    // Crecimiento
    const gr = (pick: (y: YearFigures) => number) => () => growth(pick(n), pick(n1));
    add('crecVentas', 'Crecimiento', 'Variación de la cifra de negocios', 'pct', gr(y => y.ventas), { good: 0.05, bad: 0, higherIsBetter: true }, 'Crecimiento de las ventas respecto al ejercicio anterior.');
    add('crecEbitda', 'Crecimiento', 'Variación del EBITDA', 'pct', gr(y => y.ebitda), { good: 0.05, bad: 0, higherIsBetter: true }, 'Si crece menos que las ventas, el margen se está erosionando.');
    add('crecResultado', 'Crecimiento', 'Variación del resultado neto', 'pct', gr(y => y.resultado), { good: 0.05, bad: 0, higherIsBetter: true }, 'Evolución del beneficio final.');
    add('crecPn', 'Crecimiento', 'Variación del patrimonio neto', 'pct', gr(y => y.pn), { good: 0.03, bad: 0, higherIsBetter: true }, 'Capitalización de la empresa vía beneficios retenidos o aportaciones.');
    for (const r of ratios.filter(x => x.category === 'Crecimiento')) r.n1 = null;

    // Productividad
    if (c.employeesN && c.employeesN > 0) {
        const emp = (isN: boolean) => (isN ? c.employeesN : c.employeesN1) ?? null;
        add('ventasEmpleado', 'Productividad', 'Ventas por empleado', 'eur', (y, _o, isN) => { const e = emp(isN); return e ? y.ventas / e : null; }, null, 'Facturación media por persona.', true);
        add('costeEmpleado', 'Productividad', 'Coste medio por empleado', 'eur', (y, _o, isN) => { const e = emp(isN); return e ? -L(y, 'personal') / e : null; }, null, 'Coste salarial y de Seguridad Social medio.', null);
        add('vaEmpleado', 'Productividad', 'EBITDA por empleado', 'eur', (y, _o, isN) => { const e = emp(isN); return e ? y.ebitda / e : null; }, null, 'Generación de caja operativa por persona.', true);
        add('productividad', 'Productividad', 'Productividad (valor añadido / coste de personal)', 'x', y => (L(y, 'personal') !== 0 ? (y.ebitda - L(y, 'personal')) / -L(y, 'personal') : null), { good: 1.5, bad: 1.15, higherIsBetter: true }, 'Euros de valor añadido generados por cada euro de coste de personal.');
    }

    return ratios;
}

// ---------------------------------------------------------------------------
// Estado de flujos de efectivo (método indirecto, estimado por diferencias de balance)
// ---------------------------------------------------------------------------

function computeCashFlow(n: YearFigures, n1: YearFigures): CashFlow {
    const d = (id: string) => val(n.lines, id) - val(n1.lines, id);
    const amort = -n.amortizacion;
    const deterioro = val(n.lines, 'deterioroInmov');

    const operating: CashFlowItem[] = [
        { label: 'Resultado del ejercicio', value: n.resultado },
        { label: '+ Amortizaciones', value: amort },
        { label: '± Deterioros y resultados por enajenación de inmovilizado', value: -deterioro, detail: 'Se elimina porque no es caja de la explotación.' },
        { label: '− Aumento / + disminución de existencias', value: -d('existencias') },
        { label: '− Aumento / + disminución de clientes', value: -d('clientes') },
        { label: '− Aumento / + disminución de otros deudores y periodificaciones', value: -(d('otrosDeudores') + d('periodifActivo') + d('aid') + d('otrosANC')) },
        { label: '+ Aumento / − disminución de proveedores', value: d('proveedores') },
        { label: '+ Aumento / − disminución de otros acreedores', value: d('otrosAcreedores') + d('periodifPasivoCP') + d('periodifPasivoLP') + d('pid') },
        { label: '+ Variación de provisiones', value: d('provisionesCP') + d('provisionesLP') },
    ];
    const capex = d('inmIntangible') + d('inmMaterial') + d('invInmobiliarias') + amort - deterioro;
    const investing: CashFlowItem[] = [
        { label: 'Inversión neta en inmovilizado (capex)', value: -capex, detail: 'Variación del inmovilizado neto + amortización + deterioros.' },
        { label: 'Inversiones financieras y en empresas del grupo', value: -(d('invGrupoLP') + d('invFinLP') + d('invGrupoCP') + d('invFinCP')) },
        { label: 'Activos (netos) mantenidos para la venta', value: -d('ancVenta') + d('pasivosVenta') },
    ];
    const contributions = d('capital') + d('prima') + d('aportacionesSocios') + d('accionesPropias');
    const otherEquity = d('subvenciones') + d('ajustesValor');
    const deltaPn = n.pn - n1.pn;
    const dividends = deltaPn - n.resultado - contributions - otherEquity; // negativo = reparto
    const financing: CashFlowItem[] = [
        { label: 'Deuda con entidades de crédito y leasing', value: d('deudaBancariaLP') + d('deudaBancariaCP') + d('leasingLP') + d('leasingCP') },
        { label: 'Otras deudas financieras (socios, terceros, grupo)', value: d('otrasDeudasLP') + d('otrasDeudasCP') + d('deudaGrupoLP') + d('deudaGrupoCP') },
        { label: 'Aportaciones de socios / ampliaciones (− compra de autocartera)', value: contributions },
        { label: 'Subvenciones recibidas y ajustes de valor (neto)', value: otherEquity },
        { label: 'Dividendos y otras aplicaciones del resultado (estimado)', value: dividends, detail: 'Variación del PN no explicada por el resultado ni por aportaciones.' },
    ];
    const total = (xs: CashFlowItem[]) => xs.reduce((a, x) => a + x.value, 0);
    const operatingTotal = total(operating);
    const investingTotal = total(investing);
    const financingTotal = total(financing);
    const netChange = operatingTotal + investingTotal + financingTotal;
    const actualCashChange = d('efectivo');
    return {
        operating, operatingTotal, investing, investingTotal, financing, financingTotal,
        netChange, actualCashChange, unreconciled: actualCashChange - netChange,
        capex, freeCashFlow: operatingTotal - capex,
        dividendsEstimate: -dividends,
        cashConversion: n.ebitda > 0 ? operatingTotal / n.ebitda : null,
    };
}

// ---------------------------------------------------------------------------
// Riesgo de insolvencia (Altman) y punto muerto
// ---------------------------------------------------------------------------

function computeAltman(y: YearFigures, sector: Sector): AltmanResult {
    const at = y.activo || 1;
    const pasivo = y.pasivo || 1;
    const x1 = y.fm / at;
    const x2 = (val(y.lines, 'reservas') + val(y.lines, 'rdosAnteriores')) / at;
    const x3 = y.ebit / at;
    const x4 = y.pn / pasivo;
    const x5 = y.ventas / at;
    if (sector === 'industria') {
        const z = 0.717 * x1 + 0.847 * x2 + 3.107 * x3 + 0.42 * x4 + 0.998 * x5;
        return {
            model: "Z' (empresas industriales no cotizadas)",
            x: [
                { label: 'X1 Fondo de maniobra / activo', value: x1 },
                { label: 'X2 Reservas / activo', value: x2 },
                { label: 'X3 EBIT / activo', value: x3 },
                { label: 'X4 Patrimonio neto / pasivo', value: x4 },
                { label: 'X5 Ventas / activo', value: x5 },
            ],
            z, thresholds: [1.23, 2.9],
            zone: z < 1.23 ? 'riesgo' : z < 2.9 ? 'gris' : 'segura',
        };
    }
    const z = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;
    return {
        model: "Z'' (empresas no industriales)",
        x: [
            { label: 'X1 Fondo de maniobra / activo', value: x1 },
            { label: 'X2 Reservas / activo', value: x2 },
            { label: 'X3 EBIT / activo', value: x3 },
            { label: 'X4 Patrimonio neto / pasivo', value: x4 },
        ],
        z, thresholds: [1.1, 2.6],
        zone: z < 1.1 ? 'riesgo' : z < 2.6 ? 'gris' : 'segura',
    };
}

function computeBreakEven(y: YearFigures, c: CompanyInfo): BreakEven {
    const L = (id: string) => val(y.lines, id);
    const pPers = Math.min(Math.max(c.variablePersonalPct, 0), 100) / 100;
    const pOtros = Math.min(Math.max(c.variableOtherOpexPct, 0), 100) / 100;
    const consumo = Math.max(0, -L('aprovisionamientos') - L('varExistencias'));
    const variableCosts = consumo + -L('personal') * pPers + -L('otrosGastosExpl') * pOtros;
    const fixedCosts = -L('personal') * (1 - pPers) + -L('otrosGastosExpl') * (1 - pOtros)
        - L('amortizacion') + y.gastosFinancieros
        - L('otrosIngresosExpl') - L('trabajosActivo') - L('ingresosFin');
    const contributionMargin = y.ventas - variableCosts;
    const mcPct = div(contributionMargin, y.ventas);
    const breakEvenSales = isNum(mcPct) && mcPct > 0 ? Math.max(fixedCosts, 0) / mcPct : null;
    return {
        variableCosts, fixedCosts, contributionMargin, contributionMarginPct: mcPct,
        breakEvenSales,
        safetyMargin: isNum(breakEvenSales) && y.ventas > 0 ? (y.ventas - breakEvenSales) / y.ventas : null,
    };
}

// ---------------------------------------------------------------------------
// Comprobaciones contables y mercantiles
// ---------------------------------------------------------------------------

function computeChecks(n: YearFigures, n1: YearFigures, c: CompanyInfo, rawN: YearValues, rawN1: YearValues): Check[] {
    const checks: Check[] = [];
    const tol = (a: number) => Math.max(5, Math.abs(a) * 0.0005);
    ([['N', n, c.yearN], ['N-1', n1, c.yearN - 1]] as const).forEach(([tag, y, year]) => {
        const diff = y.activo - y.pnYPasivo;
        if (Math.abs(diff) > tol(y.activo)) {
            checks.push({ severity: 'critical', title: `El balance de ${year} no cuadra`, detail: `Activo ${eur(y.activo)} frente a PN + pasivo ${eur(y.pnYPasivo)} (diferencia ${eur(diff)}). Revise las partidas introducidas: los ratios y el estado de flujos no serán fiables.` });
        }
        const rdoBalance = val(y.lines, 'resultadoEjercicio');
        if ((rdoBalance !== 0 || y.resultado !== 0) && Math.abs(rdoBalance - y.resultado) > tol(y.resultado)) {
            checks.push({ severity: 'warning', title: `El resultado de la PyG de ${year} no coincide con el del balance`, detail: `PyG: ${eur(y.resultado)} · Balance: ${eur(rdoBalance)}. Compruebe los signos (gastos en negativo) y que no falte ninguna partida.` });
        }
        void tag;
    });
    const all = [...Object.entries(rawN), ...Object.entries(rawN1)];
    if (all.every(([, v]) => !v)) return checks;

    const capital = val(n.lines, 'capital');
    if (n.pn < 0) {
        checks.push({ severity: 'critical', title: 'Patrimonio neto negativo', detail: `El patrimonio neto es ${eur(n.pn)}. La sociedad está en causa legal de disolución (art. 363.1.e LSC) y en situación de quiebra técnica: el activo no cubre las deudas.` });
    } else if (capital > 0 && n.pn < capital / 2) {
        checks.push({ severity: 'critical', title: 'Causa de disolución por pérdidas (art. 363.1.e LSC)', detail: `El patrimonio neto (${eur(n.pn)}) es inferior a la mitad del capital social (${eur(capital / 2)}). Los administradores deben convocar junta en dos meses para disolver o remover la causa (ampliación o reducción de capital, aportaciones de socios…); de lo contrario pueden responder solidariamente de las deudas sociales posteriores (art. 367 LSC). Si existen préstamos participativos, computan como patrimonio neto a estos efectos.` });
    } else if (c.legalForm === 'SA' && capital > 0 && n.pn < (capital * 2) / 3) {
        checks.push({ severity: 'warning', title: 'Reducción obligatoria de capital (art. 327 LSC)', detail: `En la SA, si el patrimonio neto (${eur(n.pn)}) se mantiene por debajo de dos terceras partes del capital (${eur((capital * 2) / 3)}) durante un ejercicio sin recuperarse, la reducción de capital es obligatoria.` });
    }
    if (n.fm < 0) {
        checks.push({ severity: 'warning', title: 'Fondo de maniobra negativo', detail: `El pasivo corriente supera al activo corriente en ${eur(-n.fm)}. Parte del activo no corriente se financia con deuda a corto plazo.` });
    }
    if (n.resultado < 0 && val(n.lines, 'impuesto') < 0) {
        checks.push({ severity: 'info', title: 'Gasto por impuesto con pérdidas', detail: 'La sociedad registra gasto por impuesto pese a tener pérdidas. Revise si procede activar créditos por bases imponibles negativas.' });
    }
    if (c.creditLinesLimit === null) {
        checks.push({ severity: 'info', title: 'Falta el disponible en pólizas de crédito', detail: 'Indíquelo en la información complementaria para calcular la liquidez disponible real.' });
    }
    return checks;
}

// ---------------------------------------------------------------------------
// Diagnóstico, recomendaciones y preguntas al cliente
// ---------------------------------------------------------------------------

function buildDiagnosis(a: Omit<Analysis, 'findings' | 'recommendations' | 'questions' | 'score' | 'grade' | 'summary'>) {
    const { n, n1, company: c, cashFlow: cf } = a;
    const r = (id: string) => a.ratios.find(x => x.id === id);
    const rv = (id: string) => r(id)?.n ?? null;
    const rv1 = (id: string) => r(id)?.n1 ?? null;
    const findings: Finding[] = [];
    const recs: Recommendation[] = [];
    const iva = 1 + Math.max(c.vatRate, 0) / 100;
    const salesPerDay = (n.ventas * iva) / 365;
    const purchases = -val(n.lines, 'aprovisionamientos') - val(n.lines, 'otrosGastosExpl');
    const purchasesPerDay = (purchases * iva) / 365;
    const F = (f: Finding) => findings.push(f);
    const R = (x: Recommendation) => recs.push(x);

    // --- Crecimiento y márgenes
    const gV = rv('crecVentas');
    if (isNum(gV)) {
        if (gV >= 0.05) F({ area: 'Actividad', tone: 'positive', severity: 'positive', title: `Ventas en crecimiento (${signedPct(gV)})`, detail: `La cifra de negocios alcanza ${eur(n.ventas)} frente a ${eur(n1.ventas)}.` });
        else if (gV < 0) {
            F({ area: 'Actividad', tone: 'negative', severity: gV < -0.1 ? 'critical' : 'warning', title: `Caída de ventas (${signedPct(gV)})`, detail: `La cifra de negocios baja de ${eur(n1.ventas)} a ${eur(n.ventas)}.` });
            R({ priority: gV < -0.1 ? 'Alta' : 'Media', area: 'Comercial', title: 'Analizar la caída de ventas por cliente, producto y canal', detail: 'Identificar si la caída es de volumen, de precio o de pérdida de clientes concretos, y fijar un plan comercial con objetivos trimestrales. Revisar la concentración de clientes.', impact: `Recuperar el nivel de ventas de ${c.yearN - 1} supondría ${eur(n1.ventas - n.ventas)} de facturación adicional.`, horizon: 'Corto plazo (0-6 meses)' });
        } else F({ area: 'Actividad', tone: 'neutral', severity: 'info', title: `Ventas estables (${signedPct(gV)})`, detail: `La cifra de negocios se sitúa en ${eur(n.ventas)}.` });
    }

    const mb = rv('margenBruto'), mb1 = rv1('margenBruto');
    if (isNum(mb) && isNum(mb1) && val(n.lines, 'aprovisionamientos') !== 0) {
        const dlt = mb - mb1;
        if (dlt < -0.01) {
            const impact = -dlt * n.ventas;
            F({ area: 'Márgenes', tone: 'negative', severity: dlt < -0.03 ? 'critical' : 'warning', title: `Erosión del margen bruto (${pct(mb1)} → ${pct(mb)})`, detail: 'Los costes de aprovisionamiento crecen más que los precios de venta.' });
            R({ priority: 'Alta', area: 'Márgenes', title: 'Revisar la política de precios y las condiciones de compra', detail: 'Actualizar tarifas (cláusulas de revisión de precios), renegociar con los principales proveedores, buscar alternativas de suministro y analizar el margen por producto/cliente para eliminar referencias no rentables.', impact: `Recuperar el margen bruto del ejercicio anterior aportaría ${eur(impact)} de EBITDA anual.`, horizon: 'Corto plazo (0-6 meses)' });
        } else if (dlt > 0.01) {
            F({ area: 'Márgenes', tone: 'positive', severity: 'positive', title: `Mejora del margen bruto (${pct(mb1)} → ${pct(mb)})`, detail: 'Mejores precios de venta o condiciones de compra.' });
        }
    }

    const me = rv('margenEbitda'), me1 = rv1('margenEbitda');
    if (n.ebitda <= 0) {
        F({ area: 'Márgenes', tone: 'negative', severity: 'critical', title: 'EBITDA negativo', detail: `El negocio no genera caja operativa (${eur(n.ebitda)}). Es la prioridad número uno.` });
        R({ priority: 'Alta', area: 'Márgenes', title: 'Plan de viabilidad operativa', detail: 'Elaborar un presupuesto base cero de gastos de estructura, analizar la rentabilidad por línea de negocio y fijar el punto muerto como objetivo mínimo de ventas mensuales.', impact: isNum(a.breakEven.breakEvenSales) ? `Ventas necesarias para cubrir todos los costes: ${eur(a.breakEven.breakEvenSales)}.` : null, horizon: 'Inmediato' });
    } else if (isNum(me) && isNum(me1)) {
        const st = r('margenEbitda')!.status;
        F({ area: 'Márgenes', tone: st === 'bad' ? 'negative' : me >= me1 ? 'positive' : 'neutral', severity: st === 'bad' ? 'warning' : me >= me1 ? 'positive' : 'info', title: `Margen EBITDA del ${pct(me)} (${pct(me1)} en ${c.yearN - 1})`, detail: `EBITDA de ${eur(n.ebitda)}. Referencia orientativa del sector: ${r('margenEbitda')!.benchmark}.` });
    }

    const pv = rv('personalVentas'), pv1 = rv1('personalVentas');
    if (isNum(pv) && isNum(pv1) && pv - pv1 > 0.01) {
        F({ area: 'Márgenes', tone: 'negative', severity: 'warning', title: `Los gastos de personal ganan peso (${pct(pv1)} → ${pct(pv)} de las ventas)`, detail: 'La plantilla crece más que la actividad: pérdida de productividad.' });
        R({ priority: 'Media', area: 'Personas', title: 'Ajustar la estructura de personal a la actividad', detail: 'Analizar productividad por departamento, variabilizar parte de la retribución (objetivos ligados a margen) y revisar horas extra, absentismo y subcontrataciones.', impact: `Volver al peso de ${c.yearN - 1} supondría ${eur((pv - pv1) * n.ventas)} de ahorro anual.`, horizon: 'Medio plazo (6-18 meses)' });
    }
    const og = rv('otrosGastosVentas'), og1 = rv1('otrosGastosVentas');
    if (isNum(og) && isNum(og1) && og - og1 > 0.01) {
        F({ area: 'Márgenes', tone: 'negative', severity: 'warning', title: `Los gastos generales crecen más que las ventas (${pct(og1)} → ${pct(og)})`, detail: 'Revisar servicios exteriores, suministros, alquileres y tributos.' });
        R({ priority: 'Media', area: 'Costes', title: 'Revisión de gastos generales partida a partida', detail: 'Pedir el mayor de la cuenta 62 y renegociar los diez mayores conceptos (seguros, energía, telecomunicaciones, asesorías, alquileres, mantenimiento).', impact: `Volver al peso de ${c.yearN - 1} supondría ${eur((og - og1) * n.ventas)} de ahorro anual.`, horizon: 'Corto plazo (0-6 meses)' });
    }

    // --- Rentabilidad
    const roe = rv('roe');
    if (n.pn > 0 && isNum(roe)) {
        const st = r('roe')!.status;
        F({ area: 'Rentabilidad', tone: st === 'good' ? 'positive' : st === 'bad' ? 'negative' : 'neutral', severity: st === 'good' ? 'positive' : st === 'bad' ? 'warning' : 'info', title: `ROE del ${pct(roe)}`, detail: `Rentabilidad del socio frente a ${pct(rv1('roe'))} del ejercicio anterior. ROA del ${pct(rv('roa'))}.` });
    }
    const kd = rv('costeDeuda');
    const roaAfterTax = isNum(rv('roa')) ? rv('roa')! * (1 - (n.tipoEfectivo ?? 0.25)) : null;
    if (isNum(kd) && isNum(roaAfterTax) && n.deudaFin > 0 && kd * (1 - (n.tipoEfectivo ?? 0.25)) > roaAfterTax) {
        F({ area: 'Rentabilidad', tone: 'negative', severity: 'warning', title: 'Apalancamiento financiero negativo', detail: `El coste de la deuda (${pct(kd)}) supera la rentabilidad del activo (${pct(rv('roa'))}): la deuda está restando rentabilidad al socio.` });
        R({ priority: 'Media', area: 'Financiación', title: 'Reducir deuda cara o renegociar el tipo de interés', detail: 'Usar la tesorería excedente o la generación de caja para amortizar anticipadamente los préstamos más caros, y pedir ofertas a 2-3 entidades para refinanciar el resto (incluidas líneas ICO).', impact: n.gastosFinancieros > 0 ? `Cada punto de reducción del tipo ahorra unos ${eur(n.deudaFin * 0.01)} al año.` : null, horizon: 'Corto plazo (0-6 meses)' });
    }

    // --- Liquidez y circulante
    if (n.fm < 0 && n.nof > 0) {
        F({ area: 'Liquidez', tone: 'negative', severity: 'critical', title: 'Desequilibrio financiero: fondo de maniobra negativo con NOF positivas', detail: `El negocio necesita ${eur(n.nof)} para financiar su circulante, pero el fondo de maniobra es ${eur(n.fm)}. El déficit (${eur(n.nof - n.fm)}) se cubre con deuda a corto plazo que hay que renovar continuamente.` });
        R({ priority: 'Alta', area: 'Financiación', title: 'Reestructurar deuda de corto a largo plazo', detail: 'Convertir pólizas y deuda a corto en préstamos a 5-7 años (con 6-12 meses de carencia si es posible) para que el fondo de maniobra cubra al menos las NOF. Valorar también una aportación de socios o capitalizar préstamos de socios.', impact: `Importe a consolidar a largo plazo: ${eur(n.nof - n.fm)}.`, horizon: 'Inmediato' });
    } else if (n.fm >= n.nof && n.nof > 0) {
        F({ area: 'Liquidez', tone: 'positive', severity: 'positive', title: 'Equilibrio financiero', detail: `El fondo de maniobra (${eur(n.fm)}) cubre las necesidades operativas de fondos (${eur(n.nof)}).` });
    } else if (n.nof > n.fm && n.fm >= 0) {
        F({ area: 'Liquidez', tone: 'neutral', severity: 'warning', title: 'Las NOF superan al fondo de maniobra', detail: `Hay ${eur(n.nof - n.fm)} de circulante financiado con deuda a corto plazo (pólizas, descuento…). Es habitual, pero conviene vigilar la renovación de las líneas.` });
    }

    const pmc = rv('pmc'), pmc1 = rv1('pmc');
    if (isNum(pmc)) {
        const target = c.agreedCollectionDays ?? Math.min(60, Math.max(30, Math.round(pmc1 ?? 60)));
        if (pmc > target + 5 || (isNum(pmc1) && pmc - pmc1 > 7)) {
            const daysToCut = Math.max(pmc - target, isNum(pmc1) ? pmc - pmc1 : 0, 10);
            F({ area: 'Circulante', tone: 'negative', severity: pmc > 90 ? 'critical' : 'warning', title: `Periodo medio de cobro de ${days(pmc)}`, detail: `${isNum(pmc1) ? `En ${c.yearN - 1} era de ${days(pmc1)}. ` : ''}${c.agreedCollectionDays ? `El plazo pactado es de ${c.agreedCollectionDays} días.` : 'Supera el objetivo razonable.'}` });
            R({ priority: pmc > 90 ? 'Alta' : 'Media', area: 'Circulante', title: `Reducir el periodo de cobro en ${Math.round(daysToCut)} días`, detail: 'Implantar un procedimiento de gestión de cobros (recordatorio antes del vencimiento, reclamación a los 7 días, bloqueo de pedidos a morosos), revisar límites de riesgo por cliente, valorar seguro de crédito, factoring sin recurso o confirming de clientes y descuentos por pronto pago.', impact: `Liberaría unos ${eur(salesPerDay * daysToCut)} de tesorería (≈ ${eur(salesPerDay)} por cada día).`, horizon: 'Corto plazo (0-6 meses)' });
        }
    }
    const pmp = rv('pmp');
    if (isNum(pmp) && isNum(pmc)) {
        if (pmp < pmc - 15 && pmp < 60) {
            const extra = Math.min(60 - pmp, pmc - pmp);
            R({ priority: 'Media', area: 'Circulante', title: 'Acompasar los pagos a los cobros', detail: `Se paga a ${days(pmp)} y se cobra a ${days(pmc)}. Negociar con los principales proveedores el pago a 60 días (máximo legal) o confirming, sin perder descuentos por pronto pago rentables.`, impact: `Ampliar el pago en ${Math.round(extra)} días liberaría unos ${eur(purchasesPerDay * extra)}.`, horizon: 'Corto plazo (0-6 meses)' });
        } else if (pmp > 75) {
            F({ area: 'Circulante', tone: 'negative', severity: 'warning', title: `Periodo medio de pago elevado (${days(pmp)})`, detail: 'Puede indicar tensiones de tesorería y supera el máximo legal de 60 días (Ley 15/2010). Además, se debe informar en la memoria y puede afectar al acceso a subvenciones públicas.' });
        }
    }
    const pme = rv('pme'), pme1 = rv1('pme');
    if (isNum(pme) && isNum(pme1) && pme - pme1 > 10) {
        F({ area: 'Circulante', tone: 'negative', severity: 'warning', title: `Las existencias rotan más despacio (${days(pme1)} → ${days(pme)})`, detail: 'Más stock inmoviliza caja y aumenta el riesgo de obsolescencia.' });
        R({ priority: 'Media', area: 'Circulante', title: 'Optimizar el inventario', detail: 'Análisis ABC del stock, liquidar referencias sin movimiento en más de 12 meses, ajustar puntos de pedido y negociar depósitos o entregas parciales con proveedores.', impact: `Volver a la rotación de ${c.yearN - 1} liberaría unos ${eur(((pme - pme1) * -val(n.lines, 'aprovisionamientos')) / 365)}.`, horizon: 'Medio plazo (6-18 meses)' });
    }

    const tes = rv('tesoreria');
    const undrawn = c.creditLinesLimit ?? 0;
    if (isNum(tes) && tes < 0.08 && n.pc > 0 && (n.liquidez + undrawn) / n.pc < 0.15) {
        F({ area: 'Liquidez', tone: 'negative', severity: 'warning', title: 'Tesorería muy ajustada', detail: `La caja disponible (${eur(n.liquidez)}) cubre solo el ${pct(tes)} del pasivo corriente${c.creditLinesLimit !== null ? `, y el disponible en pólizas es de ${eur(undrawn)}` : ''}.` });
        R({ priority: 'Alta', area: 'Tesorería', title: 'Implantar un presupuesto de tesorería semanal a 13 semanas', detail: 'Previsión de cobros y pagos semana a semana para anticipar tensiones y negociar con tiempo con bancos y proveedores. Mantener un colchón mínimo equivalente a un mes de pagos fijos.', impact: `Colchón objetivo aproximado: ${eur((-val(n.lines, 'personal') - val(n.lines, 'otrosGastosExpl')) / 12)}.`, horizon: 'Inmediato' });
    } else if (n.dfn < 0 && n.liquidez > 0.25 * n.activo) {
        F({ area: 'Liquidez', tone: 'neutral', severity: 'info', title: 'Exceso de liquidez', detail: `La empresa tiene caja neta de ${eur(-n.dfn)} (${pct(n.liquidez / n.activo)} del activo). La caja ociosa reduce la rentabilidad del socio.` });
        R({ priority: 'Baja', area: 'Tesorería', title: 'Rentabilizar o aplicar la tesorería excedente', detail: 'Definir una caja operativa mínima y, sobre el excedente, valorar: depósitos/letras a corto plazo, amortización de deuda, inversiones de crecimiento o reparto de dividendos. Atención: el exceso de activos no afectos puede afectar a la exención en el Impuesto sobre el Patrimonio y a la reducción del 95 % en el ISD en la transmisión de participaciones.', impact: `Una rentabilidad del 2,5 % sobre ${eur(-n.dfn * 0.7)} supondría ${eur(-n.dfn * 0.7 * 0.025)} anuales.`, horizon: 'Corto plazo (0-6 meses)' });
    }

    // --- Endeudamiento
    const lev = rv('dfnEbitda');
    if (isNum(lev)) {
        if (lev > c.targetLeverage) {
            F({ area: 'Endeudamiento', tone: 'negative', severity: lev > c.targetLeverage + 1.5 ? 'critical' : 'warning', title: `Deuda financiera neta de ${times(lev)} EBITDA`, detail: `DFN ${eur(n.dfn)} con un EBITDA de ${eur(n.ebitda)}. Por encima del objetivo de ${times(c.targetLeverage)} la financiación bancaria se encarece o se restringe.` });
            R({ priority: 'Alta', area: 'Financiación', title: 'Plan de desapalancamiento', detail: 'Destinar el flujo de caja libre a reducir deuda, frenar capex no imprescindible y dividendos, y desinvertir activos no estratégicos. Presentar al pool bancario un plan a 3 años.', impact: `Para volver a ${times(c.targetLeverage)} hay que reducir la deuda neta en ${eur(n.dfn - c.targetLeverage * n.ebitda)} o aumentar el EBITDA en ${eur(n.dfn / c.targetLeverage - n.ebitda)}.`, horizon: 'Medio plazo (6-18 meses)' });
        } else if (lev < 0) {
            F({ area: 'Endeudamiento', tone: 'positive', severity: 'positive', title: 'Caja neta positiva', detail: `La tesorería supera a la deuda financiera en ${eur(-n.dfn)}.` });
        } else if (lev <= 2) {
            F({ area: 'Endeudamiento', tone: 'positive', severity: 'positive', title: `Endeudamiento financiero moderado (${times(lev)} EBITDA)`, detail: `Capacidad de endeudamiento adicional estimada hasta ${times(c.targetLeverage)}: ${eur(a.debt.capacity)}.` });
        }
    } else if (n.ebitda <= 0 && n.deudaFin > 0) {
        F({ area: 'Endeudamiento', tone: 'negative', severity: 'critical', title: 'Deuda sin generación de caja operativa', detail: `Hay ${eur(n.deudaFin)} de deuda financiera y el EBITDA no es positivo: riesgo de impago si no se corrige.` });
    }
    const cob = rv('cobertura');
    if (isNum(cob) && cob < 3) {
        F({ area: 'Endeudamiento', tone: 'negative', severity: cob < 1.5 ? 'critical' : 'warning', title: `Cobertura de intereses de solo ${times(cob)}`, detail: 'Una parte muy relevante del EBITDA se va en pagar intereses.' });
    }
    if (isNum(a.debt.dscr) && a.debt.dscr < 1.2 && a.debt.debtServiceUsed > 0) {
        F({ area: 'Endeudamiento', tone: 'negative', severity: a.debt.dscr < 1 ? 'critical' : 'warning', title: `Cobertura del servicio de la deuda de ${times(a.debt.dscr)}`, detail: `La caja operativa (EBITDA − impuestos) no cubre con holgura las cuotas de principal e intereses previstas (${eur(a.debt.debtServiceUsed + n.gastosFinancieros)}).${c.nextYearDebtService === null ? ' Se ha tomado como principal toda la deuda bancaria y leasing a corto plazo, incluidas pólizas que normalmente se renuevan: indique las cuotas reales en la información complementaria para afinar este cálculo.' : ''}` });
        if (!(n.fm < 0 && n.nof > 0)) {
            R({ priority: a.debt.dscr < 1 ? 'Alta' : 'Media', area: 'Financiación', title: 'Alargar plazos o pedir carencia en los préstamos', detail: 'Negociar con las entidades la ampliación del plazo de amortización o una carencia de principal para adecuar las cuotas a la generación de caja.', impact: `Servicio de la deuda considerado: ${eur(a.debt.debtServiceUsed)} de principal.`, horizon: 'Inmediato' });
        }
    }
    if (n.pn > 0) {
        const end = rv('endeudamiento');
        if (isNum(end) && end > 0.7) {
            R({ priority: 'Media', area: 'Estructura de capital', title: 'Reforzar los fondos propios', detail: 'Retener beneficios (no repartir dividendos), capitalizar préstamos de socios o realizar aportaciones. Mejora el rating bancario y permite aplicar la reserva de capitalización (art. 25 LIS).', impact: `Para bajar el endeudamiento al 60 % se necesitarían ${eur(n.pasivo - 0.6 * n.activo)} más de fondos propios (o menos deuda).`, horizon: 'Medio plazo (6-18 meses)' });
        }
    }

    // --- Flujos de caja e inversión
    if (cf.operatingTotal < 0) {
        F({ area: 'Flujos de caja', tone: 'negative', severity: 'critical', title: 'La explotación consume caja', detail: `El flujo de explotación es ${eur(cf.operatingTotal)}: el negocio necesita financiación externa para funcionar.` });
    } else if (isNum(cf.cashConversion) && cf.cashConversion < 0.5) {
        F({ area: 'Flujos de caja', tone: 'negative', severity: 'warning', title: `Baja conversión del EBITDA en caja (${pct(cf.cashConversion)})`, detail: 'El circulante está absorbiendo gran parte de la caja generada.' });
    } else if (isNum(cf.cashConversion)) {
        F({ area: 'Flujos de caja', tone: 'positive', severity: 'positive', title: `Buena conversión del EBITDA en caja (${pct(cf.cashConversion)})`, detail: `Flujo de explotación de ${eur(cf.operatingTotal)}.` });
    }
    if (cf.freeCashFlow < 0 && cf.dividendsEstimate > 0) {
        F({ area: 'Flujos de caja', tone: 'negative', severity: 'warning', title: 'Se reparten dividendos con flujo de caja libre negativo', detail: `Dividendos estimados de ${eur(cf.dividendsEstimate)} con un flujo libre de ${eur(cf.freeCashFlow)}: se financian con deuda o con caja acumulada.` });
        R({ priority: 'Media', area: 'Estructura de capital', title: 'Ligar el dividendo a la generación de caja libre', detail: 'Fijar una política de dividendos máxima del 50 % del flujo de caja libre mientras la deuda supere el objetivo.', impact: null, horizon: 'Medio plazo (6-18 meses)' });
    }
    const amort = -n.amortizacion;
    if (amort > 0 && cf.capex < amort * 0.6) {
        F({ area: 'Inversión', tone: 'neutral', severity: 'info', title: 'Inversión inferior a la amortización', detail: `Capex de ${eur(cf.capex)} frente a amortizaciones de ${eur(amort)}. A medio plazo los activos envejecen y pueden perder competitividad.` });
    } else if (amort > 0 && cf.capex > amort * 2) {
        F({ area: 'Inversión', tone: 'neutral', severity: 'info', title: 'Ejercicio de fuerte inversión', detail: `Capex de ${eur(cf.capex)} (${times(cf.capex / amort)} la amortización). Comprobar que se financia a largo plazo y que su retorno está planificado.` });
    }

    // --- Riesgo
    if (a.altman.zone === 'riesgo') {
        F({ area: 'Riesgo', tone: 'negative', severity: 'critical', title: `Altman ${a.altman.z.toFixed(2)}: zona de riesgo de insolvencia`, detail: 'El modelo asigna un perfil similar al de empresas que entran en dificultades en los dos años siguientes.' });
    } else if (a.altman.zone === 'segura') {
        F({ area: 'Riesgo', tone: 'positive', severity: 'positive', title: `Altman ${a.altman.z.toFixed(2)}: zona segura`, detail: 'Perfil de solvencia sólido según el modelo de predicción de insolvencia.' });
    }
    if (isNum(a.breakEven.safetyMargin) && a.breakEven.safetyMargin < 0.1) {
        F({ area: 'Riesgo', tone: 'negative', severity: a.breakEven.safetyMargin < 0 ? 'critical' : 'warning', title: `Margen de seguridad del ${pct(a.breakEven.safetyMargin)}`, detail: `El punto muerto está en ${eur(a.breakEven.breakEvenSales)}: una caída de ventas pequeña lleva a pérdidas.` });
    }
    for (const ch of a.checks.filter(x => x.severity === 'critical' && /disolución|negativo/i.test(x.title))) {
        R({ priority: 'Alta', area: 'Mercantil', title: 'Remover la causa de disolución', detail: `${ch.detail} Alternativas: aportación de socios a fondos propios (cuenta 118), compensación de créditos de socios, préstamo participativo, ampliación o reducción de capital.`, impact: n.pn < 0 ? `Patrimonio a restituir como mínimo: ${eur(val(n.lines, 'capital') / 2 - n.pn)}.` : `Patrimonio a restituir como mínimo: ${eur(val(n.lines, 'capital') / 2 - n.pn)}.`, horizon: 'Inmediato' });
    }

    // --- Fiscal
    if (n.rai > 0 && isNum(n.tipoEfectivo) && n.tipoEfectivo > 0.24 && n.pn > 0) {
        R({ priority: 'Baja', area: 'Fiscal', title: 'Optimizar el Impuesto sobre Sociedades', detail: `El tipo efectivo es del ${pct(n.tipoEfectivo)}. Valorar la reserva de capitalización (art. 25 LIS), la reserva de nivelación si es empresa de reducida dimensión (art. 105 LIS), la libertad de amortización, deducciones por I+D+i y el tipo reducido aplicable según la cifra de negocios.`, impact: null, horizon: 'Corto plazo (0-6 meses)' });
    }

    // Recomendaciones de gestión siempre útiles
    R({ priority: 'Baja', area: 'Control de gestión', title: 'Cuadro de mando mensual y presupuesto anual', detail: `Cerrar contabilidad mensualmente antes del día 15 y seguir mensualmente: ventas, margen bruto, EBITDA, PMC, PMP, DFN y tesorería frente a presupuesto. Indicadores clave a vigilar con esta empresa: ${[
        isNum(pmc) ? 'periodo de cobro' : null,
        isNum(lev) && lev > 2 ? 'DFN/EBITDA' : null,
        isNum(mb) ? 'margen bruto' : null,
        n.fm < 0 ? 'fondo de maniobra' : null,
        'tesorería a 13 semanas',
    ].filter(Boolean).join(', ')}.`, impact: null, horizon: 'Corto plazo (0-6 meses)' });

    const order = { Alta: 0, Media: 1, Baja: 2 } as const;
    recs.sort((x, y) => order[x.priority] - order[y.priority]);
    const sevOrder = { critical: 0, warning: 1, info: 2, positive: 3 } as const;
    findings.sort((x, y) => sevOrder[x.severity] - sevOrder[y.severity]);
    return { findings, recommendations: recs };
}

function buildQuestions(n: YearFigures, c: CompanyInfo, cf: CashFlow): string[] {
    const q: string[] = [];
    const L = (id: string) => val(n.lines, id);
    if (n.deudaFin > 0) q.push('Detalle del pool bancario: entidad, importe pendiente, tipo de interés, vencimiento, cuota y garantías (personales, hipotecarias, ICO) de cada préstamo y póliza.');
    if (c.creditLinesLimit === null) q.push('Límites concedidos y disponible de pólizas de crédito, líneas de descuento, confirming y factoring, y su grado de disposición.');
    if (!c.employeesN) q.push('Plantilla media de los dos ejercicios (para medir productividad y coste por empleado).');
    q.push('Presupuesto o previsión del ejercicio en curso (ventas, márgenes, inversiones previstas) y evolución de los meses ya cerrados.');
    q.push('Ventas por cliente: peso de los 5 y 10 principales clientes (riesgo de concentración) y desglose por línea de producto o servicio con su margen.');
    if (L('clientes') > 0) q.push('Antigüedad de la cartera de clientes (vencido a 30, 60, 90 y +90 días) e impagados o clientes en concurso.');
    if (L('existencias') > 0) q.push('Antigüedad del stock y existencias sin movimiento en los últimos 12 meses (posible obsolescencia no deteriorada).');
    if (L('invGrupoLP') + L('invGrupoCP') + L('deudaGrupoLP') + L('deudaGrupoCP') !== 0) q.push('Detalle de saldos y operaciones con empresas del grupo y socios (operaciones vinculadas, art. 18 LIS) y su condición de recuperables.');
    if (L('otrasDeudasLP') + L('otrasDeudasCP') > 0) q.push('Naturaleza de las "otras deudas": ¿préstamos de socios, proveedores de inmovilizado, aplazamientos con Hacienda o Seguridad Social?');
    if (L('otrosAcreedores') > 0) q.push('¿Existen aplazamientos o deudas vencidas con Hacienda o la Seguridad Social?');
    if (cf.capex > 0) q.push('Detalle de las inversiones del ejercicio y del plan de inversiones de los próximos 2-3 años.');
    if (cf.dividendsEstimate > 0) q.push('Dividendos acordados y pagados en el ejercicio, y política de retribución al socio prevista.');
    q.push('Contingencias fiscales, laborales o litigios relevantes no provisionados, y avales prestados a terceros.');
    q.push('Objetivos de la propiedad a 3-5 años (crecimiento, venta, relevo generacional, reparto de dividendos) para orientar las recomendaciones.');
    return q;
}

function buildScore(ratios: Ratio[], checks: Check[]): { score: number; grade: string } {
    const weights: Record<string, number> = {
        liquidez: 1, acida: 1, tesoreria: 0.5, fmActivo: 0.5,
        endeudamiento: 1, solvencia: 1, dfnEbitda: 2, cobertura: 1.5, costeDeuda: 0.5,
        roe: 1, roa: 1.5, roce: 1,
        margenEbitda: 2, margenNeto: 1, margenBruto: 0.5,
        pmc: 1, pmp: 0.5, pme: 0.5,
        crecVentas: 1, crecEbitda: 1,
    };
    let total = 0, wsum = 0;
    for (const r of ratios) {
        const w = weights[r.id];
        if (!w || r.status === 'neutral') continue;
        total += w * (r.status === 'good' ? 1 : r.status === 'warn' ? 0.55 : 0);
        wsum += w;
    }
    let score = wsum ? Math.round((total / wsum) * 100) : 0;
    if (checks.some(c => c.severity === 'critical' && /disolución|negativo/i.test(c.title))) score = Math.min(score, 30);
    const grade = score >= 80 ? 'Sólida' : score >= 65 ? 'Saludable' : score >= 50 ? 'Aceptable con debilidades' : score >= 35 ? 'Vulnerable' : 'Situación crítica';
    return { score, grade };
}

const lcFirst = (t: string) => (/^[A-ZÁÉÍÓÚ][a-záéíóúñ]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);

function buildSummary(a: Omit<Analysis, 'summary'>): string[] {
    const { n, n1, company: c, cashFlow: cf } = a;
    const name = c.name || 'La empresa';
    const r = (id: string) => a.ratios.find(x => x.id === id);
    const s: string[] = [];
    const gV = growth(n.ventas, n1.ventas);
    s.push(`${name} cierra ${c.yearN} con una cifra de negocios de ${eur(n.ventas)} (${isNum(gV) ? signedPct(gV) : 'sin comparativo'} respecto a ${c.yearN - 1}), un EBITDA de ${eur(n.ebitda)} (margen ${pct(r('margenEbitda')?.n)}) y un resultado neto de ${eur(n.resultado)} (${eur(n1.resultado)} el año anterior). La valoración global de su situación económico-financiera es: ${a.grade.toUpperCase()} (${a.score}/100).`);
    s.push(`En generación de caja, la explotación aportó ${eur(cf.operatingTotal)}, se invirtieron ${eur(cf.capex)} en inmovilizado y el flujo de caja libre fue de ${eur(cf.freeCashFlow)}. La tesorería ${cf.actualCashChange >= 0 ? 'aumentó' : 'disminuyó'} en ${eur(Math.abs(cf.actualCashChange))}.`);
    const levTxt = n.dfn <= 0 ? `no tiene deuda financiera neta (caja neta de ${eur(-n.dfn)})` : `tiene una deuda financiera neta de ${eur(n.dfn)}${n.ebitda > 0 ? `, equivalente a ${times(n.dfn / n.ebitda)} su EBITDA` : ''}`;
    s.push(`Financieramente, la empresa ${levTxt}. El fondo de maniobra es de ${eur(n.fm)} frente a unas necesidades operativas de fondos de ${eur(n.nof)}, con una liquidez general de ${times(r('liquidez')?.n)} y un endeudamiento del ${pct(r('endeudamiento')?.n)} sobre el activo.`);
    const crit = a.findings.filter(f => f.severity === 'critical' || f.severity === 'warning').slice(0, 3).map(f => lcFirst(f.title));
    const pos = a.findings.filter(f => f.severity === 'positive').slice(0, 3).map(f => lcFirst(f.title));
    if (pos.length) s.push(`Puntos fuertes: ${pos.join('; ')}.`);
    if (crit.length) s.push(`Aspectos que requieren atención: ${crit.join('; ')}.`);
    const top = a.recommendations.filter(x => x.priority === 'Alta').slice(0, 3).map(x => lcFirst(x.title));
    if (top.length) s.push(`Prioridades de actuación: ${top.join('; ')}.`);
    return s;
}

// ---------------------------------------------------------------------------
// Punto de entrada
// ---------------------------------------------------------------------------

export function analyze(ds: FinancialDataset): Analysis {
    const nn = normalizeYear(ds.yearN);
    const nn1 = normalizeYear(ds.yearN1);
    const n = computeFigures(nn.values);
    const n1 = computeFigures(nn1.values);
    const c = ds.company;
    const warnings: string[] = [];
    const fixed = Array.from(new Set([...nn.fixed, ...nn1.fixed]));
    if (fixed.length) warnings.push(`Se han tratado como gasto (signo negativo) las partidas introducidas en positivo: ${fixed.join(', ')}.`);

    const { balance, pyg } = comparisonRows(n, n1);
    const ratios = computeRatios(n, n1, c);
    const cashFlow = computeCashFlow(n, n1);
    if (Math.abs(cashFlow.unreconciled) > Math.max(5, Math.abs(n.activo) * 0.0005)) {
        warnings.push(`El estado de flujos no concilia con la variación de tesorería por ${eur(cashFlow.unreconciled)}, normalmente porque alguno de los balances no cuadra.`);
    }
    const principal = c.nextYearDebtService ?? (val(n.lines, 'deudaBancariaCP') + val(n.lines, 'leasingCP'));
    const ebitdaAfterTax = n.ebitda + Math.min(n.impuesto, 0);
    const fcl = cashFlow.freeCashFlow;
    const checks = computeChecks(n, n1, c, ds.yearN, ds.yearN1);

    const base = {
        company: c, n, n1,
        balanceRows: balance, pygRows: pyg,
        ratios, cashFlow,
        altman: computeAltman(n, c.sector),
        altmanN1: computeAltman(n1, c.sector),
        breakEven: computeBreakEven(n, c),
        breakEvenN1: computeBreakEven(n1, c),
        debt: {
            capacity: Math.max(0, c.targetLeverage * n.ebitda - n.dfn),
            yearsToRepay: n.dfn <= 0 ? 0 : fcl > 0 ? n.dfn / fcl : null,
            dscr: principal + n.gastosFinancieros > 0 ? ebitdaAfterTax / (principal + n.gastosFinancieros) : null,
            debtServiceUsed: principal,
            availableCreditLines: c.creditLinesLimit,
            shortTermShare: n.deudaFin > 0 ? n.deudaFinCP / n.deudaFin : null,
        },
        checks,
        warnings,
    };
    const { findings, recommendations } = buildDiagnosis(base);
    const questions = buildQuestions(n, c, cashFlow);
    const { score, grade } = buildScore(ratios, checks);
    const withAll = { ...base, findings, recommendations, questions, score, grade };
    return { ...withAll, summary: buildSummary(withAll) };
}

// ---------------------------------------------------------------------------
// Simulador de palancas
// ---------------------------------------------------------------------------

export interface Levers {
    salesGrowthPct: number;      // % de variación de ventas
    grossMarginPts: number;      // puntos porcentuales de mejora del margen bruto
    personalPct: number;         // % de variación de gastos de personal
    otherOpexPct: number;        // % de variación de la parte fija de otros gastos
    collectionDaysDelta: number; // días (negativo = cobrar antes)
    paymentDaysDelta: number;    // días (positivo = pagar más tarde)
    inventoryDaysDelta: number;  // días (negativo = menos stock)
}

export const NO_LEVERS: Levers = { salesGrowthPct: 0, grossMarginPts: 0, personalPct: 0, otherOpexPct: 0, collectionDaysDelta: 0, paymentDaysDelta: 0, inventoryDaysDelta: 0 };

export interface SimulationResult {
    ventas: number; ebitda: number; ebitdaMargin: number | null; resultado: number;
    deltaEbitda: number; deltaResultado: number;
    deltaWorkingCapital: number; // positivo = consume caja
    cashImpact: number;          // impacto anual en caja
    dfnAfter: number;
    dfnEbitdaAfter: number | null;
}

export function simulate(a: Analysis, lv: Levers): SimulationResult {
    const { n, company: c } = a;
    const L = (id: string) => val(n.lines, id);
    const iva = 1 + Math.max(c.vatRate, 0) / 100;
    const t = n.tipoEfectivo ?? 0.25;
    const pOtros = Math.min(Math.max(c.variableOtherOpexPct, 0), 100) / 100;

    const ventas = n.ventas * (1 + lv.salesGrowthPct / 100);
    const mbPct = n.ventas > 0 ? n.margenBruto / n.ventas : 0;
    const margenBruto = ventas * (mbPct + lv.grossMarginPts / 100);
    const aprov = -(ventas - margenBruto); // negativo
    const salesFactor = n.ventas > 0 ? ventas / n.ventas : 1;
    const otros = L('otrosGastosExpl') * (pOtros * salesFactor + (1 - pOtros) * (1 + lv.otherOpexPct / 100));
    const personal = L('personal') * (1 + lv.personalPct / 100);
    const ebitda = margenBruto + L('trabajosActivo') + L('otrosIngresosExpl') + personal + otros;
    const deltaEbitda = ebitda - n.ebitda;
    const deltaResultado = deltaEbitda * (deltaEbitda > 0 ? 1 - t : 1);

    // Circulante: se recalculan clientes, proveedores y existencias con los nuevos días.
    const pmc = n.ventas > 0 ? (L('clientes') / (n.ventas * iva)) * 365 : 0;
    const comprasN = -L('aprovisionamientos') - L('otrosGastosExpl');
    const pmp = comprasN > 0 ? (L('proveedores') / (comprasN * iva)) * 365 : 0;
    const pme = -L('aprovisionamientos') > 0 ? (L('existencias') / -L('aprovisionamientos')) * 365 : 0;
    const comprasNew = -aprov - otros;
    const clientes = Math.max(0, (ventas * iva / 365) * (pmc + lv.collectionDaysDelta));
    const proveedores = Math.max(0, (comprasNew * iva / 365) * (pmp + lv.paymentDaysDelta));
    const existencias = Math.max(0, (-aprov / 365) * (pme + (pme > 0 ? lv.inventoryDaysDelta : 0)));
    const deltaWorkingCapital = (clientes - L('clientes')) + (existencias - L('existencias')) - (proveedores - L('proveedores'));
    const cashImpact = deltaEbitda - Math.max(0, deltaEbitda) * t - deltaWorkingCapital;
    const dfnAfter = n.dfn - cashImpact;
    return {
        ventas, ebitda, ebitdaMargin: div(ebitda, ventas),
        resultado: n.resultado + deltaResultado,
        deltaEbitda, deltaResultado, deltaWorkingCapital, cashImpact,
        dfnAfter, dfnEbitdaAfter: ebitda > 0 ? dfnAfter / ebitda : null,
    };
}
