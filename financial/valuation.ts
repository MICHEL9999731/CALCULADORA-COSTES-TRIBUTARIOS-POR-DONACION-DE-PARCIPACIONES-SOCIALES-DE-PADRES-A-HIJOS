// Motor de valoración de empresas. A partir de los mismos datos que el análisis
// financiero (balance y PyG de 2 a 5 ejercicios) calcula automáticamente el valor
// de los fondos propios por varios métodos —patrimoniales, de rendimiento (DCF y
// capitalización), de mercado (múltiplos), mixtos— y los valores fiscales de
// referencia en España, y propone un rango y un valor central ponderado.
//
// Todas las hipótesis tienen un valor automático (derivado de los datos y del
// sector) que el usuario puede sustituir.

import { analyze, type Analysis, type YearFigures } from './engine';
import type { FinancialDataset, Sector, YearValues } from './schema';
import { eur, isNum, pct, times } from './format';

// ---------------------------------------------------------------------------
// Hipótesis
// ---------------------------------------------------------------------------

export type AssumptionKey =
    | 'stakePct' | 'shares'
    | 'ownerSalaryAdj' | 'otherEbitdaAdj' | 'latentGains' | 'contingencies' | 'taxRate'
    | 'riskFree' | 'erp' | 'betaU' | 'sizePremium' | 'specificPremium' | 'costOfDebt' | 'debtRatio'
    | 'growth1' | 'perpetualGrowth' | 'ebitdaMargin' | 'daPct' | 'capexPct' | 'nofPct'
    | 'evEbitda' | 'evSales' | 'per'
    | 'goodwillYears';

export type Unit = '%' | '€' | 'x' | 'años' | 'nº';

export interface AssumptionField {
    key: AssumptionKey;
    group: 'Objeto' | 'Normalización' | 'Coste de capital' | 'Proyección (DCF)' | 'Múltiplos' | 'Métodos mixtos';
    label: string;
    unit: Unit;
    hint: string;
}

export const ASSUMPTION_FIELDS: AssumptionField[] = [
    { key: 'stakePct', group: 'Objeto', label: 'Porcentaje a valorar', unit: '%', hint: 'Participación que se transmite o dona. El valor se calcula para el 100 % y se aplica este porcentaje.' },
    { key: 'shares', group: 'Objeto', label: 'Nº de participaciones / acciones', unit: 'nº', hint: 'Total de la sociedad, para obtener el valor por participación.' },

    { key: 'ownerSalaryAdj', group: 'Normalización', label: 'Ajuste por retribución de socios', unit: '€', hint: 'Positivo si los socios cobran más que un directivo de mercado (se suma al EBITDA); negativo si cobran menos o no cobran.' },
    { key: 'otherEbitdaAdj', group: 'Normalización', label: 'Otros ajustes al EBITDA recurrente', unit: '€', hint: 'Gastos o ingresos extraordinarios incluidos en la explotación, alquileres a socios fuera de mercado…' },
    { key: 'latentGains', group: 'Normalización', label: 'Plusvalías (−minusvalías) latentes de activos', unit: '€', hint: 'Diferencia entre valor de mercado y valor contable de inmuebles, participaciones y otros activos (tasaciones).' },
    { key: 'contingencies', group: 'Normalización', label: 'Contingencias y pasivos no registrados', unit: '€', hint: 'Litigios, inspecciones, indemnizaciones comprometidas, avales que se prevé ejecutar…' },
    { key: 'taxRate', group: 'Normalización', label: 'Tipo del Impuesto sobre Sociedades', unit: '%', hint: 'General 25 %. Empresas de reducida dimensión y microempresas pueden tributar a un tipo menor.' },

    { key: 'riskFree', group: 'Coste de capital', label: 'Tipo sin riesgo (bono España 10 años)', unit: '%', hint: 'Revise la rentabilidad del bono a 10 años a la fecha de valoración.' },
    { key: 'erp', group: 'Coste de capital', label: 'Prima de riesgo de mercado', unit: '%', hint: 'Prima histórica/implícita del mercado de renta variable (habitual 5-6,5 %).' },
    { key: 'betaU', group: 'Coste de capital', label: 'Beta desapalancada del sector', unit: 'x', hint: 'Referencia sectorial europea; se reapalanca con la estructura financiera objetivo.' },
    { key: 'sizePremium', group: 'Coste de capital', label: 'Prima por tamaño', unit: '%', hint: 'Mayor cuanto menor es la empresa (cifra de negocios).' },
    { key: 'specificPremium', group: 'Coste de capital', label: 'Prima de riesgo específico / iliquidez', unit: '%', hint: 'Dependencia de clientes o del socio fundador, falta de liquidez de las participaciones, calidad de la información…' },
    { key: 'costOfDebt', group: 'Coste de capital', label: 'Coste de la deuda (antes de impuestos)', unit: '%', hint: 'Por defecto, gastos financieros sobre la deuda financiera media.' },
    { key: 'debtRatio', group: 'Coste de capital', label: 'Deuda / (Deuda + Fondos propios) objetivo', unit: '%', hint: 'Estructura financiera para ponderar el WACC.' },

    { key: 'growth1', group: 'Proyección (DCF)', label: 'Crecimiento de ventas año 1', unit: '%', hint: 'Converge linealmente al crecimiento a perpetuidad en el año 5.' },
    { key: 'perpetualGrowth', group: 'Proyección (DCF)', label: 'Crecimiento a perpetuidad (g)', unit: '%', hint: 'Normalmente entre el 1 % y el 2,5 % (inflación a largo plazo).' },
    { key: 'ebitdaMargin', group: 'Proyección (DCF)', label: 'Margen EBITDA normalizado', unit: '%', hint: 'Por defecto, la media histórica con los ajustes de normalización.' },
    { key: 'daPct', group: 'Proyección (DCF)', label: 'Amortización sobre ventas', unit: '%', hint: 'Media histórica.' },
    { key: 'capexPct', group: 'Proyección (DCF)', label: 'Inversión (capex) sobre ventas', unit: '%', hint: 'Media histórica, como mínimo igual a la amortización.' },
    { key: 'nofPct', group: 'Proyección (DCF)', label: 'Necesidades operativas de fondos sobre ventas', unit: '%', hint: 'Circulante operativo necesario por cada euro de venta adicional.' },

    { key: 'evEbitda', group: 'Múltiplos', label: 'Múltiplo VE / EBITDA', unit: 'x', hint: 'Referencia de transacciones de PYMES no cotizadas del sector.' },
    { key: 'evSales', group: 'Múltiplos', label: 'Múltiplo VE / Ventas', unit: 'x', hint: '' },
    { key: 'per', group: 'Múltiplos', label: 'PER (Valor / Beneficio neto)', unit: 'x', hint: '' },

    { key: 'goodwillYears', group: 'Métodos mixtos', label: 'Años de superbeneficio (fondo de comercio)', unit: 'años', hint: 'Horizonte durante el que se espera que la empresa obtenga rentas por encima de la exigida (habitual 5-8).' },
];

export type MethodId =
    | 'contable' | 'ajustado' | 'liquidacion'
    | 'dcf' | 'capitalizacion'
    | 'evEbitda' | 'evVentas' | 'per'
    | 'uec' | 'indirecto' | 'anglosajon';

export const METHOD_LABELS: Record<MethodId, string> = {
    contable: 'Valor contable (patrimonio neto)',
    ajustado: 'Valor contable ajustado',
    liquidacion: 'Valor de liquidación',
    dcf: 'Descuento de flujos de caja libres (DCF)',
    capitalizacion: 'Capitalización del beneficio',
    evEbitda: 'Múltiplo VE / EBITDA',
    evVentas: 'Múltiplo VE / Ventas',
    per: 'PER',
    uec: 'Unión Europea de Expertos Contables (UEC)',
    indirecto: 'Método indirecto (alemán)',
    anglosajon: 'Método anglosajón (directo)',
};

/** Lo que se guarda con el cliente: solo las hipótesis que el usuario ha cambiado. */
export interface ValuationInputs {
    overrides: Partial<Record<AssumptionKey, number>>;
    weights: Partial<Record<MethodId, number>>;
    earningsBase: 'last' | 'average';
    audited: boolean;
}

export const defaultValuationInputs = (): ValuationInputs => ({ overrides: {}, weights: {}, earningsBase: 'last', audited: false });

// ---------------------------------------------------------------------------
// Referencias sectoriales (orientativas, PYMES españolas no cotizadas)
// ---------------------------------------------------------------------------

type Band3 = [number, number, number]; // bajo, central, alto

interface SectorRefs { betaU: number; evEbitda: Band3; evSales: Band3; per: Band3 }

export const SECTOR_REFS: Record<Sector, SectorRefs> = {
    industria: { betaU: 0.85, evEbitda: [5, 6.5, 8], evSales: [0.5, 0.8, 1.1], per: [8, 10.5, 13] },
    comercio: { betaU: 0.75, evEbitda: [4.5, 5.5, 7], evSales: [0.2, 0.35, 0.5], per: [7, 9, 12] },
    servicios: { betaU: 0.8, evEbitda: [5, 6.5, 8], evSales: [0.6, 1, 1.4], per: [8, 11, 14] },
    construccion: { betaU: 0.8, evEbitda: [4, 5, 6.5], evSales: [0.3, 0.45, 0.6], per: [6, 8, 10] },
    hosteleria: { betaU: 0.85, evEbitda: [4, 5.5, 7], evSales: [0.5, 0.8, 1.1], per: [7, 9, 12] },
    agricultura: { betaU: 0.65, evEbitda: [5, 6, 7.5], evSales: [0.4, 0.6, 0.8], per: [8, 10, 12] },
    tecnologia: { betaU: 1.1, evEbitda: [7, 9.5, 12], evSales: [1.5, 2.5, 3.5], per: [12, 16, 22] },
};

/** Porcentaje del valor contable que se espera recuperar de cada activo en una liquidación ordenada. */
const LIQUIDATION_RECOVERY: Record<string, number> = {
    inmIntangible: 0, inmMaterial: 0.7, invInmobiliarias: 0.9, invGrupoLP: 0.8, invFinLP: 0.9, aid: 0, otrosANC: 0.5,
    ancVenta: 0.8, existencias: 0.5, clientes: 0.85, otrosDeudores: 0.7, invGrupoCP: 0.8, invFinCP: 0.95, periodifActivo: 0, efectivo: 1,
};

const NON_OPERATING = ['invInmobiliarias', 'invGrupoLP', 'invFinLP', 'invGrupoCP', 'ancVenta'];

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

export interface DetailLine { label: string; value: string; strong?: boolean }

export interface MethodResult {
    id: MethodId;
    family: 'Patrimonial' | 'Rendimiento' | 'Mercado' | 'Mixto';
    name: string;
    applicable: boolean;
    /** Valor de los fondos propios (100 %). */
    equity: number | null;
    low: number | null;
    high: number | null;
    /** Valor de empresa (antes de deuda), si el método lo calcula. */
    ev: number | null;
    weight: number;          // peso efectivo (0-1) en la conclusión
    formula: string;
    note: string;
    detail: DetailLine[];
}

export interface DcfYear {
    year: number; growth: number; ventas: number; ebitda: number; da: number; ebit: number;
    taxes: number; nopat: number; capex: number; dNof: number; fcf: number; discount: number; pv: number;
}

export interface Dcf {
    years: DcfYear[];
    sumPv: number;
    terminalFcf: number;
    terminalValue: number;
    pvTerminal: number;
    ev: number;
    equity: number;
    terminalShare: number | null;
    sensitivity: { waccs: number[]; growths: number[]; values: (number | null)[][] };
}

export interface Wacc {
    riskFree: number; erp: number; betaU: number; betaL: number; sizePremium: number; specificPremium: number;
    ke: number; kd: number; kdAfterTax: number; debtRatio: number; wacc: number;
}

export interface FiscalValues {
    nominal: number;
    bookValue: number;
    profitsUsed: { year: number; value: number }[];
    capitalization20: number | null;
    /** IRPF, art. 37.1.b LIRPF: valor mínimo de transmisión de participaciones no cotizadas. */
    irpfMinimum: number;
    /** Impuesto sobre el Patrimonio, art. 16.Uno Ley 19/1991. */
    wealthTax: number;
    audited: boolean;
}

export type Profile = 'operativa' | 'patrimonial' | 'perdidas';

export interface Valuation {
    company: Analysis['company'];
    analysis: Analysis;
    profile: Profile;
    profileText: string;
    /** Hipótesis efectivas (en las unidades del formulario) y las automáticas. */
    assumptions: Record<AssumptionKey, number>;
    autoAssumptions: Record<AssumptionKey, number>;
    autoWhy: Partial<Record<AssumptionKey, string>>;
    inputs: ValuationInputs;
    normalized: {
        base: 'last' | 'average';
        yearsUsed: number[];
        ebitdaReported: number;
        ebitda: number;
        ebit: number;
        netIncome: number;
        ventas: number;
        adjustments: DetailLine[];
    };
    bridge: {
        dfn: number; provisions: number; nonOperating: number; lines: DetailLine[];
        /** VE → fondos propios: fondos propios = VE − ajuste. */
        toEquity: (ev: number) => number;
    };
    adjustedBookValue: number;
    wacc: Wacc;
    dcf: Dcf | null;
    methods: MethodResult[];
    fiscal: FiscalValues;
    conclusion: {
        value: number | null;
        low: number | null;
        high: number | null;
        stakePct: number;
        stakeValue: number | null;
        stakeLow: number | null;
        stakeHigh: number | null;
        shares: number | null;
        perShare: number | null;
        perShareFiscalIrpf: number | null;
        impliedEvEbitda: number | null;
        priceToBook: number | null;
        text: string[];
    };
    warnings: string[];
    questions: string[];
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const v = (y: YearValues, id: string) => (isNum(y[id]) ? y[id] : 0);
const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const minMax = (xs: number[]): [number, number] => [Math.min(...xs), Math.max(...xs)];

/** Valor actual de una renta unitaria de n años al tipo r. */
export const annuity = (r: number, n: number) => (r === 0 ? n : (1 - Math.pow(1 + r, -n)) / r);

const sizePremiumFor = (ventas: number) =>
    ventas < 2e6 ? 5 : ventas < 10e6 ? 4 : ventas < 50e6 ? 3 : ventas < 250e6 ? 2 : 1;

const ordinaryPbt = (f: YearFigures) => f.ebitda + f.amortizacion + v(f.lines, 'ingresosFin') + v(f.lines, 'gastosFin');

// ---------------------------------------------------------------------------
// Valoración
// ---------------------------------------------------------------------------

export function valueCompany(ds: FinancialDataset, inputs: ValuationInputs = ds.valuation ?? defaultValuationInputs()): Valuation {
    const a = analyze(ds);
    const { n, history, company: c } = a;
    const L = (id: string) => v(n.lines, id);
    const refs = SECTOR_REFS[c.sector] ?? SECTOR_REFS.servicios;
    const warnings: string[] = [];
    const questions: string[] = [];

    // --- Hipótesis automáticas ---------------------------------------------
    const base = inputs.earningsBase;
    const used = base === 'average' ? history.slice(0, 3) : history.slice(0, 1);
    const yearsUsed = used.map(h => h.year);
    const ventasBase = mean(used.map(h => h.fig.ventas));
    const ebitdaReported = mean(used.map(h => h.fig.ebitda));
    const amortBase = mean(used.map(h => -h.fig.amortizacion));
    const finBase = mean(used.map(h => v(h.fig.lines, 'ingresosFin') + v(h.fig.lines, 'gastosFin')));

    const ov = inputs.overrides;
    const auto: Record<AssumptionKey, number> = {} as Record<AssumptionKey, number>;
    const why: Partial<Record<AssumptionKey, string>> = {};

    auto.stakePct = 100;
    auto.shares = 0;
    why.shares = 'Sin indicar: no se calcula el valor por participación.';
    auto.ownerSalaryAdj = 0;
    auto.otherEbitdaAdj = 0;
    auto.latentGains = 0;
    auto.contingencies = 0;
    const eff = n.tipoEfectivo;
    auto.taxRate = 25;
    why.taxRate = isNum(eff) ? `Tipo general. El tipo efectivo contable del último ejercicio fue ${pct(eff)}.` : 'Tipo general.';

    auto.riskFree = 3.3;
    why.riskFree = 'Referencia orientativa: actualícela con el bono a 10 años a la fecha de valoración.';
    auto.erp = 6;
    auto.betaU = refs.betaU;
    why.betaU = `Referencia del sector seleccionado.`;
    auto.sizePremium = sizePremiumFor(n.ventas);
    why.sizePremium = `Según la cifra de negocios (${eur(n.ventas)}).`;
    auto.specificPremium = history.length < 3 ? 3 : 2;
    why.specificPremium = history.length < 3 ? 'Se eleva por disponer de menos de 3 ejercicios.' : 'Iliquidez de participaciones de una sociedad no cotizada.';

    const prevDebt = history[1]?.fig.deudaFin ?? n.deudaFin;
    const avgDebt = (n.deudaFin + prevDebt) / 2;
    if (a.debtPlan?.weightedRate && a.debtPlan.weightedRate > 0) {
        auto.costOfDebt = round(clamp(a.debtPlan.weightedRate, 2, 12), 2);
        why.costOfDebt = 'Coste medio ponderado del cuadro de financiación.';
    } else if (avgDebt > 0 && n.gastosFinancieros > 0) {
        auto.costOfDebt = round(clamp((n.gastosFinancieros / avgDebt) * 100, 2, 12), 2);
        why.costOfDebt = 'Gastos financieros / deuda financiera media.';
    } else {
        auto.costOfDebt = 5;
        why.costOfDebt = 'Sin deuda con coste: referencia de mercado.';
    }
    const bookE = Math.max(n.pn, 0);
    auto.debtRatio = n.deudaFin > 0 ? round(clamp((n.deudaFin / (n.deudaFin + (bookE || n.deudaFin))) * 100, 0, 60), 0) : 0;
    why.debtRatio = 'Estructura actual a valor contable (máximo 60 %).';

    const cagr = a.trends.cagrVentas;
    auto.growth1 = isNum(cagr) ? round(clamp(cagr * 100, -5, 10), 1) : 2;
    why.growth1 = isNum(cagr) ? `Crecimiento medio anual histórico (${pct(cagr)}), limitado entre −5 % y 10 %.` : 'Sin histórico suficiente: 2 %.';
    auto.perpetualGrowth = 2;

    const histMargins = history.slice(0, 3).filter(h => h.fig.ventas > 0).map(h => h.fig.ebitda / h.fig.ventas);
    auto.ebitdaMargin = 0; // se calcula más abajo, con los ajustes de normalización efectivos
    why.ebitdaMargin = `Media de ${histMargins.length} ejercicio(s) más los ajustes de normalización.`;
    const histDa = history.slice(0, 3).filter(h => h.fig.ventas > 0).map(h => -h.fig.amortizacion / h.fig.ventas);
    auto.daPct = round(mean(histDa) * 100, 1);
    const histCapex = history.slice(0, 3).filter(h => h.cashFlow && h.fig.ventas > 0).map(h => h.cashFlow!.capex / h.fig.ventas);
    auto.capexPct = round(Math.max(histCapex.length ? mean(histCapex) : 0, mean(histDa)) * 100, 1);
    why.capexPct = histCapex.length ? `Media histórica (${histCapex.length} ejercicio(s)), como mínimo la amortización.` : 'Igual a la amortización (mantenimiento).';
    auto.nofPct = n.ventas > 0 ? round(clamp(n.nof / n.ventas, -0.5, 1) * 100, 1) : 0;
    why.nofPct = 'NOF del último ejercicio sobre sus ventas.';

    auto.evEbitda = refs.evEbitda[1];
    auto.evSales = refs.evSales[1];
    auto.per = refs.per[1];
    why.evEbitda = why.evSales = why.per = 'Valor central de la referencia sectorial.';
    auto.goodwillYears = 5;

    const A: Record<AssumptionKey, number> = { ...auto };
    for (const k of Object.keys(ov) as AssumptionKey[]) {
        const x = ov[k];
        if (isNum(x)) A[k] = x;
    }
    // El margen automático ya incluye los ajustes efectivos.
    if (!isNum(ov.ebitdaMargin)) {
        const adj = A.ownerSalaryAdj + A.otherEbitdaAdj;
        A.ebitdaMargin = round(((histMargins.length ? mean(histMargins) : 0) + (ventasBase > 0 ? adj / ventasBase : 0)) * 100, 1);
        auto.ebitdaMargin = A.ebitdaMargin;
    }

    const t = clamp(A.taxRate, 0, 50) / 100;

    // --- Normalización ------------------------------------------------------
    const ebitda = ebitdaReported + A.ownerSalaryAdj + A.otherEbitdaAdj;
    const ebit = ebitda - amortBase;
    const pbt = ebit + finBase;
    const netIncome = pbt > 0 ? pbt * (1 - t) : pbt;
    const adjustments: DetailLine[] = [
        { label: base === 'average' ? `EBITDA medio ${yearsUsed[yearsUsed.length - 1]}-${yearsUsed[0]}` : `EBITDA ${yearsUsed[0]}`, value: eur(ebitdaReported) },
        { label: 'Ajuste por retribución de socios', value: eur(A.ownerSalaryAdj) },
        { label: 'Otros ajustes', value: eur(A.otherEbitdaAdj) },
        { label: 'EBITDA normalizado', value: eur(ebitda), strong: true },
        { label: '− Amortización', value: eur(-amortBase) },
        { label: 'EBIT normalizado', value: eur(ebit), strong: true },
        { label: '± Resultado financiero ordinario', value: eur(finBase) },
        { label: `− Impuesto (${pct(t)})`, value: eur(pbt > 0 ? -pbt * t : 0) },
        { label: 'Beneficio neto normalizado', value: eur(netIncome), strong: true },
    ];
    if (n.noRecurrente !== 0) adjustments.splice(0, 0, { label: `Excluidos resultados no recurrentes de ${yearsUsed[0]}`, value: eur(n.noRecurrente) });

    // --- Puente valor de empresa → fondos propios ---------------------------
    const nonOperating = NON_OPERATING.reduce((s, id) => s + L(id), 0) - L('pasivosVenta');
    const provisions = L('provisionesLP');
    const dfn = n.dfn;
    const toEquity = (ev: number) => ev - dfn - provisions + nonOperating - A.contingencies;
    const bridgeLines: DetailLine[] = [
        { label: '− Deuda financiera neta', value: eur(-dfn) },
        { label: '− Provisiones a largo plazo', value: eur(-provisions) },
        { label: '+ Activos no operativos (inversiones inmobiliarias y financieras)', value: eur(nonOperating) },
        { label: '− Contingencias', value: eur(-A.contingencies) },
    ];

    // --- Coste de capital -----------------------------------------------------
    const dr = clamp(A.debtRatio, 0, 90) / 100;
    const de = dr / (1 - dr);
    const betaL = A.betaU * (1 + (1 - t) * de);
    const ke = (A.riskFree + betaL * A.erp + A.sizePremium + A.specificPremium) / 100;
    const kd = A.costOfDebt / 100;
    const wacc = (1 - dr) * ke + dr * kd * (1 - t);
    const W: Wacc = {
        riskFree: A.riskFree / 100, erp: A.erp / 100, betaU: A.betaU, betaL, sizePremium: A.sizePremium / 100,
        specificPremium: A.specificPremium / 100, ke, kd, kdAfterTax: kd * (1 - t), debtRatio: dr, wacc,
    };
    const g = A.perpetualGrowth / 100;

    // --- Métodos --------------------------------------------------------------
    const methods: MethodResult[] = [];
    const push = (m: Omit<MethodResult, 'weight' | 'name'>) => {
        const lo = isNum(m.low) && isNum(m.high) ? Math.min(m.low, m.high) : m.low;
        const hi = isNum(m.low) && isNum(m.high) ? Math.max(m.low, m.high) : m.high;
        methods.push({ ...m, low: lo, high: hi, name: METHOD_LABELS[m.id], weight: 0 });
    };
    const na = (id: MethodId, family: MethodResult['family'], formula: string, note: string) =>
        push({ id, family, applicable: false, equity: null, low: null, high: null, ev: null, formula, note, detail: [] });

    // Patrimoniales
    push({
        id: 'contable', family: 'Patrimonial', applicable: true, equity: n.pn, low: n.pn, high: n.pn, ev: null,
        formula: 'Activo − Pasivo exigible', note: 'No tiene en cuenta la capacidad de generar beneficios ni el valor de mercado de los activos.',
        detail: [{ label: `Patrimonio neto ${c.yearN}`, value: eur(n.pn), strong: true }],
    });

    const adjBook = n.pn + A.latentGains * (1 - t) - A.contingencies;
    push({
        id: 'ajustado', family: 'Patrimonial', applicable: true, equity: adjBook,
        low: n.pn + Math.min(A.latentGains, 0) * (1 - t) - A.contingencies, high: n.pn + Math.max(A.latentGains, 0) - A.contingencies, ev: null,
        formula: 'PN + plusvalías latentes netas de impuesto − contingencias',
        note: A.latentGains === 0 ? 'Sin plusvalías latentes informadas: indique el valor de tasación de inmuebles y participaciones para afinarlo.' : 'El rango alto no descuenta el impuesto latente (si la plusvalía no se va a realizar).',
        detail: [
            { label: 'Patrimonio neto contable', value: eur(n.pn) },
            { label: 'Plusvalías latentes', value: eur(A.latentGains) },
            { label: `− Impuesto latente (${pct(t)})`, value: eur(-A.latentGains * t) },
            { label: '− Contingencias', value: eur(-A.contingencies) },
            { label: 'Valor contable ajustado', value: eur(adjBook), strong: true },
        ],
    });

    {
        let recovered = 0;
        let bookAssets = 0;
        for (const [id, r] of Object.entries(LIQUIDATION_RECOVERY)) { recovered += Math.max(L(id), 0) * r; bookAssets += Math.max(L(id), 0); }
        recovered += A.latentGains;
        const liabilities = n.pnc + n.pc - L('pid') - L('periodifPasivoLP');
        const severance = -L('personal') * 0.25;
        const closing = n.activo * 0.03;
        const gain = recovered - bookAssets;
        const tax = gain > 0 ? gain * t : 0;
        const eq = recovered - liabilities - severance - closing - tax;
        push({
            id: 'liquidacion', family: 'Patrimonial', applicable: true, equity: eq, low: eq - closing, high: eq + severance * 0.5, ev: null,
            formula: 'Valor de realización de los activos − pasivos − costes de cierre',
            note: 'Valor mínimo de referencia (empresa que cesa). Porcentajes de recuperación estándar por tipo de activo.',
            detail: [
                { label: 'Valor contable de los activos', value: eur(bookAssets) },
                { label: 'Valor de realización estimado (incl. plusvalías)', value: eur(recovered) },
                { label: '− Pasivo exigible', value: eur(-liabilities) },
                { label: '− Indemnizaciones al personal (≈ 25 % del coste anual)', value: eur(-severance) },
                { label: '− Costes de cierre (3 % del activo)', value: eur(-closing) },
                { label: '− Impuesto sobre plusvalías de liquidación', value: eur(-tax) },
                { label: 'Valor de liquidación', value: eur(eq), strong: true },
            ],
        });
    }

    // DCF
    let dcf: Dcf | null = null;
    const runDcf = (w: number, gg: number): { ev: number; years: DcfYear[]; sumPv: number; tf: number; tv: number; pvTv: number } | null => {
        if (w - gg < 0.01 || n.ventas <= 0) return null;
        const years: DcfYear[] = [];
        let prevSales = n.ventas;
        let sumPv = 0;
        const g1 = A.growth1 / 100;
        const m = A.ebitdaMargin / 100;
        const daP = A.daPct / 100;
        const capP = Math.max(A.capexPct / 100, 0);
        const nofP = A.nofPct / 100;
        for (let k = 1; k <= 5; k++) {
            const growth = g1 + ((gg - g1) * (k - 1)) / 4;
            const ventas = prevSales * (1 + growth);
            const e = ventas * m;
            const da = ventas * daP;
            const eb = e - da;
            const taxes = Math.max(eb, 0) * t;
            const nopat = eb - taxes;
            // La inversión converge hacia la de mantenimiento más crecimiento (amortización × (1+g)) en el año 5.
            const capRatio = capP + ((daP * (1 + gg) - capP) * (k - 1)) / 4;
            const capex = ventas * Math.max(capRatio, 0);
            const dNof = (ventas - prevSales) * nofP;
            const fcf = nopat + da - capex - dNof;
            const discount = 1 / Math.pow(1 + w, k);
            const pv = fcf * discount;
            sumPv += pv;
            years.push({ year: c.yearN + k, growth, ventas, ebitda: e, da, ebit: eb, taxes, nopat, capex, dNof, fcf, discount, pv });
            prevSales = ventas;
        }
        const last = years[4];
        const tf = last.nopat * (1 + gg) - (last.capex - last.da) * (1 + gg) - last.ventas * gg * nofP;
        const tv = tf / (w - gg);
        const pvTv = tv * last.discount;
        return { ev: sumPv + pvTv, years, sumPv, tf, tv, pvTv };
    };
    const central = runDcf(wacc, g);
    if (central && A.ebitdaMargin > 0) {
        const waccs = [-0.01, -0.005, 0, 0.005, 0.01].map(d => wacc + d);
        const growths = [-0.01, -0.005, 0, 0.005, 0.01].map(d => g + d);
        const values = growths.map(gg => waccs.map(w => { const r = runDcf(w, gg); return r ? toEquity(r.ev) : null; }));
        const eq = toEquity(central.ev);
        dcf = {
            years: central.years, sumPv: central.sumPv, terminalFcf: central.tf, terminalValue: central.tv, pvTerminal: central.pvTv,
            ev: central.ev, equity: eq, terminalShare: central.ev > 0 ? central.pvTv / central.ev : null,
            sensitivity: { waccs, growths, values },
        };
        const lo = runDcf(wacc + 0.01, g - 0.005);
        const hi = runDcf(wacc - 0.01, g + 0.005);
        push({
            id: 'dcf', family: 'Rendimiento', applicable: true, equity: eq,
            low: lo ? toEquity(lo.ev) : null, high: hi ? toEquity(hi.ev) : null, ev: central.ev,
            formula: 'Σ FCL / (1+WACC)^t + Valor residual / (1+WACC)^5 − deuda neta',
            note: 'Rango: WACC ±1 p.p. y crecimiento a perpetuidad ±0,5 p.p.',
            detail: [
                { label: 'Valor actual de los flujos (5 años)', value: eur(central.sumPv) },
                { label: 'Valor actual del valor residual', value: eur(central.pvTv) },
                { label: 'Valor de empresa', value: eur(central.ev), strong: true },
                { label: 'WACC / g', value: `${pct(wacc)} / ${pct(g)}` },
                { label: 'Valor de los fondos propios', value: eur(eq), strong: true },
            ],
        });
    } else {
        na('dcf', 'Rendimiento', 'Σ FCL / (1+WACC)^t + Valor residual', n.ventas <= 0 ? 'Sin cifra de negocios.' : A.ebitdaMargin <= 0 ? 'Margen EBITDA normalizado no positivo: el DCF no es representativo.' : 'El WACC debe superar al crecimiento a perpetuidad en al menos 1 p.p.');
    }

    // Capitalización del beneficio
    if (netIncome > 0 && ke - g > 0.01) {
        const cap = (k: number) => (netIncome * (1 + g)) / (k - g);
        const eq = cap(ke);
        push({
            id: 'capitalizacion', family: 'Rendimiento', applicable: true, equity: eq, low: cap(ke + 0.01), high: cap(ke - 0.01), ev: null,
            formula: 'Beneficio normalizado × (1+g) / (Ke − g)',
            note: 'Supone que el beneficio se reparte o reinvierte a la rentabilidad exigida. Rango: Ke ±1 p.p.',
            detail: [
                { label: 'Beneficio neto normalizado', value: eur(netIncome) },
                { label: 'Coste de los recursos propios (Ke)', value: pct(ke) },
                { label: 'Crecimiento (g)', value: pct(g) },
                { label: 'Valor de los fondos propios', value: eur(eq), strong: true },
            ],
        });
    } else na('capitalizacion', 'Rendimiento', 'Beneficio × (1+g) / (Ke − g)', 'Beneficio normalizado no positivo.');

    // Múltiplos
    const scale = (band: Band3, chosen: number): [number, number] => [chosen * band[0] / band[1], chosen * band[2] / band[1]];
    if (ebitda > 0) {
        const [ml, mh] = scale(refs.evEbitda, A.evEbitda);
        const ev = ebitda * A.evEbitda;
        push({
            id: 'evEbitda', family: 'Mercado', applicable: true, equity: toEquity(ev), low: toEquity(ebitda * ml), high: toEquity(ebitda * mh), ev,
            formula: 'EBITDA normalizado × múltiplo − deuda neta',
            note: `Rango del sector: ${times(ml)} – ${times(mh)}.`,
            detail: [
                { label: 'EBITDA normalizado', value: eur(ebitda) },
                { label: 'Múltiplo aplicado', value: times(A.evEbitda) },
                { label: 'Valor de empresa', value: eur(ev), strong: true },
                { label: 'Valor de los fondos propios', value: eur(toEquity(ev)), strong: true },
            ],
        });
    } else na('evEbitda', 'Mercado', 'EBITDA × múltiplo', 'EBITDA normalizado no positivo.');

    if (ventasBase > 0) {
        const [ml, mh] = scale(refs.evSales, A.evSales);
        const ev = ventasBase * A.evSales;
        push({
            id: 'evVentas', family: 'Mercado', applicable: true, equity: toEquity(ev), low: toEquity(ventasBase * ml), high: toEquity(ventasBase * mh), ev,
            formula: 'Ventas × múltiplo − deuda neta',
            note: 'Poco preciso: ignora la rentabilidad. Útil como contraste o en empresas en crecimiento sin beneficios.',
            detail: [
                { label: 'Cifra de negocios', value: eur(ventasBase) },
                { label: 'Múltiplo aplicado', value: times(A.evSales) },
                { label: 'Valor de empresa', value: eur(ev), strong: true },
                { label: 'Valor de los fondos propios', value: eur(toEquity(ev)), strong: true },
            ],
        });
    } else na('evVentas', 'Mercado', 'Ventas × múltiplo', 'Sin cifra de negocios.');

    if (netIncome > 0) {
        const [ml, mh] = scale(refs.per, A.per);
        push({
            id: 'per', family: 'Mercado', applicable: true, equity: netIncome * A.per, low: netIncome * ml, high: netIncome * mh, ev: null,
            formula: 'Beneficio neto normalizado × PER',
            note: `Rango del sector: ${times(ml)} – ${times(mh)}.`,
            detail: [
                { label: 'Beneficio neto normalizado', value: eur(netIncome) },
                { label: 'PER aplicado', value: times(A.per) },
                { label: 'Valor de los fondos propios', value: eur(netIncome * A.per), strong: true },
            ],
        });
    } else na('per', 'Mercado', 'Beneficio × PER', 'Beneficio normalizado no positivo.');

    // Mixtos (basados en el valor sustancial = valor contable ajustado y el beneficio normalizado)
    const nY = Math.max(1, Math.round(A.goodwillYears));
    const rf = A.riskFree / 100;
    if (netIncome > 0) {
        const uec = (k: number) => { const an = annuity(k, nY); return (adjBook + an * netIncome) / (1 + rf * an); };
        const ind = (k: number) => (adjBook + netIncome / k) / 2;
        const ang = (k: number) => adjBook + (netIncome - rf * adjBook) / k;
        const mixed: [MethodId, (k: number) => number, string, string][] = [
            ['uec', uec, 'V = (A + aₙ·B) / (1 + i·aₙ)', `A = valor contable ajustado, B = beneficio normalizado, i = tipo sin riesgo, aₙ = renta de ${nY} años al Ke.`],
            ['indirecto', ind, 'V = (A + B / Ke) / 2', 'Media entre el valor sustancial y el valor de rendimiento.'],
            ['anglosajon', ang, 'V = A + (B − i·A) / Ke', 'Valor sustancial más el fondo de comercio capitalizado a perpetuidad.'],
        ];
        for (const [id, f, formula, note] of mixed) {
            const eq = f(ke);
            push({
                id, family: 'Mixto', applicable: true, equity: eq, low: f(ke + 0.01), high: f(ke - 0.01), ev: null, formula, note,
                detail: [
                    { label: 'Valor sustancial (A)', value: eur(adjBook) },
                    { label: 'Beneficio normalizado (B)', value: eur(netIncome) },
                    { label: 'Fondo de comercio implícito', value: eur(eq - adjBook) },
                    { label: 'Valor de los fondos propios', value: eur(eq), strong: true },
                ],
            });
        }
    } else {
        na('uec', 'Mixto', 'V = (A + aₙ·B) / (1 + i·aₙ)', 'Sin beneficio: el fondo de comercio sería negativo; prevalecen los métodos patrimoniales.');
        na('indirecto', 'Mixto', 'V = (A + B / Ke) / 2', 'Sin beneficio normalizado positivo.');
        na('anglosajon', 'Mixto', 'V = A + (B − i·A) / Ke', 'Sin beneficio normalizado positivo.');
    }

    // --- Perfil y ponderaciones -----------------------------------------------
    const nonOpShare = n.activo > 0 ? (L('invInmobiliarias') + L('invFinLP') + L('invGrupoLP') + L('invFinCP') + L('invGrupoCP')) / n.activo : 0;
    let profile: Profile;
    let profileText: string;
    if (nonOpShare > 0.5) {
        profile = 'patrimonial';
        profileText = `Sociedad de carácter patrimonial: el ${pct(nonOpShare)} del activo son inversiones inmobiliarias o financieras. Prevalecen los métodos patrimoniales.`;
    } else if (ebitda <= 0 || netIncome <= 0) {
        profile = 'perdidas';
        profileText = 'Empresa sin beneficio normalizado positivo: el valor se apoya en el patrimonio (contable ajustado y de liquidación).';
    } else {
        profile = 'operativa';
        profileText = 'Empresa operativa con beneficios: prevalecen los métodos de rendimiento (DCF) y de mercado, contrastados con los mixtos.';
    }
    const DEFAULT_WEIGHTS: Record<Profile, Partial<Record<MethodId, number>>> = {
        operativa: { dcf: 35, evEbitda: 25, per: 10, capitalizacion: 10, uec: 10, ajustado: 10 },
        patrimonial: { ajustado: 60, dcf: 15, uec: 15, evEbitda: 10 },
        perdidas: { ajustado: 60, liquidacion: 40 },
    };
    const userWeights = Object.keys(inputs.weights).length > 0;
    const rawW = userWeights ? inputs.weights : DEFAULT_WEIGHTS[profile];
    const applicable = methods.filter(m => m.applicable && isNum(m.equity) && (rawW[m.id] ?? 0) > 0);
    const totalW = applicable.reduce((s, m) => s + (rawW[m.id] ?? 0), 0);
    for (const m of methods) m.weight = totalW > 0 && m.applicable && isNum(m.equity) ? (rawW[m.id] ?? 0) / totalW : 0;
    // Responsabilidad limitada: un valor negativo de los fondos propios cuenta como cero.
    const weighted = (pick: (m: MethodResult) => number | null) =>
        totalW > 0 ? applicable.reduce((s, m) => s + Math.max(0, pick(m) ?? m.equity!) * m.weight, 0) : null;
    const value = weighted(m => m.equity);
    const low = weighted(m => m.low);
    const high = weighted(m => m.high);

    // --- Valores fiscales -----------------------------------------------------
    const profits = history.slice(0, 3).map(h => ({ year: h.year, value: h.fig.resultado }));
    const avgProfit = mean(profits.map(p => p.value));
    const cap20 = profits.length ? avgProfit / 0.2 : null;
    const nominal = L('capital');
    const irpfMinimum = Math.max(n.pn, cap20 ?? -Infinity);
    const wealthTax = inputs.audited ? n.pn : Math.max(nominal, n.pn, cap20 ?? -Infinity);
    const fiscal: FiscalValues = { nominal, bookValue: n.pn, profitsUsed: profits, capitalization20: cap20, irpfMinimum, wealthTax, audited: inputs.audited };

    // --- Conclusión -------------------------------------------------------------
    const stake = clamp(A.stakePct, 0, 100) / 100;
    const shares = A.shares > 0 ? A.shares : null;
    const text: string[] = [profileText];
    if (isNum(value) && isNum(low) && isNum(high)) {
        text.push(`El valor razonable de los fondos propios (100 %) se estima en ${eur(value)}, dentro de un rango de ${eur(Math.min(low, high))} a ${eur(Math.max(low, high))}, ponderando ${applicable.map(m => `${m.name} (${Math.round(m.weight * 100)} %)`).join(', ')}.`);
        if (stake < 1) text.push(`El ${pct(stake)} objeto de valoración equivale a ${eur(value * stake)}${shares ? ` (${eur(value / shares)} por participación)` : ''}. No se aplican descuentos por minoría ni primas de control.`);
        else if (shares) text.push(`Por participación: ${eur(value / shares)} (${shares.toLocaleString('es-ES')} participaciones).`);
        if (n.pn > 0) text.push(`El valor obtenido equivale a ${times(value / n.pn)} el patrimonio neto contable${ebitda > 0 ? ` y a un múltiplo implícito de ${times((value + dfn + provisions - nonOperating) / ebitda)} el EBITDA normalizado` : ''}.`);
        if (value < irpfMinimum) text.push(`Atención: el valor de mercado estimado es inferior al valor mínimo fiscal del IRPF (${eur(irpfMinimum)}). En una transmisión onerosa o lucrativa la ganancia del transmitente se calcularía, como mínimo, con ese valor.`);
        else text.push(`El valor de mercado supera los mínimos fiscales del IRPF (${eur(irpfMinimum)}) y del Impuesto sobre el Patrimonio (${eur(wealthTax)}).`);
    } else {
        text.push('No hay métodos aplicables con los datos disponibles. Revise los datos introducidos.');
    }

    // --- Avisos ------------------------------------------------------------------
    for (const ch of a.checks.filter(x => x.severity === 'critical')) warnings.push(`${ch.title}: ${ch.detail}`);
    if (history.length < 3) warnings.push('Con menos de 3 ejercicios el beneficio normalizado y las tendencias son poco fiables; se ha elevado la prima de riesgo específico.');
    if (dcf?.terminalShare && dcf.terminalShare > 0.8) warnings.push(`El valor residual supone el ${pct(dcf.terminalShare)} del valor de empresa del DCF: el resultado es muy sensible a la tasa de descuento y al crecimiento a perpetuidad.`);
    if (wacc - g < 0.04) warnings.push(`La diferencia entre WACC (${pct(wacc)}) y crecimiento (${pct(g)}) es reducida, lo que dispara el valor residual.`);
    if (n.pn < 0) warnings.push('El patrimonio neto es negativo.');
    const negatives = applicable.filter(m => (m.equity ?? 0) < 0);
    if (negatives.length) warnings.push(`${negatives.map(m => m.name).join(', ')} da${negatives.length > 1 ? 'n' : ''} un valor negativo de los fondos propios (la deuda supera el valor de la empresa); en la ponderación se computa como cero.`);
    if (Math.abs(A.ebitdaMargin / 100 - (n.ventas > 0 ? n.ebitda / n.ventas : 0)) > 0.05) warnings.push(`El margen EBITDA proyectado (${pct(A.ebitdaMargin / 100)}) difiere en más de 5 p.p. del último ejercicio: justifique la hipótesis.`);
    if (nonOperating > 0) warnings.push(`Se suman ${eur(nonOperating)} de activos no operativos a valor contable. Si sus rentas están en el EBITDA (alquileres), se estarían contando dos veces: ajústelo en «Otros ajustes al EBITDA».`);
    if (a.debtPlan?.rentingPending) warnings.push(`Hay ${eur(a.debtPlan.rentingPending)} de cuotas de renting pendientes que no restan como deuda (su coste ya está en el EBITDA).`);

    questions.push('Tasaciones o valor de mercado de inmuebles, participaciones y otros activos relevantes (para el valor contable ajustado).');
    questions.push('Retribución total de los socios que trabajan en la empresa y coste de mercado de sus funciones.');
    questions.push('Presupuesto o plan de negocio de los próximos 3-5 años (ventas, márgenes, inversiones).');
    questions.push('Gastos e ingresos extraordinarios o no recurrentes incluidos en la explotación.');
    questions.push('Litigios, inspecciones, avales o compromisos no registrados en balance.');
    questions.push('Número de participaciones, libro registro de socios y pactos de socios (restricciones a la transmisión, derechos de arrastre…).');
    if (!inputs.audited) questions.push('¿Están las cuentas auditadas con informe favorable? Cambia el valor fiscal en el Impuesto sobre el Patrimonio.');

    return {
        company: c, analysis: a, profile, profileText,
        assumptions: A, autoAssumptions: auto, autoWhy: why, inputs,
        normalized: { base, yearsUsed, ebitdaReported, ebitda, ebit, netIncome, ventas: ventasBase, adjustments },
        bridge: { dfn, provisions, nonOperating, lines: bridgeLines, toEquity },
        adjustedBookValue: adjBook,
        wacc: W, dcf, methods, fiscal,
        conclusion: {
            value, low: isNum(low) && isNum(high) ? Math.min(low, high) : low, high: isNum(low) && isNum(high) ? Math.max(low, high) : high,
            stakePct: stake,
            stakeValue: isNum(value) ? value * stake : null,
            stakeLow: isNum(low) ? Math.min(low, high ?? low) * stake : null,
            stakeHigh: isNum(high) ? Math.max(high, low ?? high) * stake : null,
            shares,
            perShare: isNum(value) && shares ? value / shares : null,
            perShareFiscalIrpf: shares ? irpfMinimum / shares : null,
            impliedEvEbitda: isNum(value) && ebitda > 0 ? (value + dfn + provisions - nonOperating) / ebitda : null,
            priceToBook: isNum(value) && n.pn > 0 ? value / n.pn : null,
            text,
        },
        warnings, questions,
    };
}

export const familyRange = (ms: MethodResult[]) => {
    const xs = ms.flatMap(m => [m.low, m.high, m.equity]).filter(isNum);
    return xs.length ? minMax(xs) : null;
};
