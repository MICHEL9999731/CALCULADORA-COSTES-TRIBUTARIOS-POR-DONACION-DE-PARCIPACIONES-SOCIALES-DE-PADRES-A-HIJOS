// Lectura automática de documentos (Excel y PDF): instrucciones para Claude,
// normalización de la respuesta, comprobación aritmética de los cuadros de
// amortización y de las cuentas, y fusión con los datos del cliente.
// Todo lo que aquí se comprueba se hace con código, no con el modelo.

import {
    ALL_LINE_IDS, BALANCE_LINES, DEBT_TYPES, MAX_YEARS, PYG_LINES, emptyYear, emptyYearData, newDebtItem,
    type AmortRow, type DebtItem, type DebtType, type FinancialDataset, type YearData, type YearValues,
} from './schema';
import { computeFigures, normalizeYear } from './engine';

// ---------------------------------------------------------------------------
// Tipos de la extracción
// ---------------------------------------------------------------------------

export interface ExtractedYear {
    year: number;
    /** true si es el ejercicio principal del documento (no la columna comparativa). */
    primary: boolean;
    employees: number | null;
    values: Partial<YearValues>;
}

export interface ExtractedLoan {
    type: DebtType;
    lender: string;
    description: string;
    rate: number | null;
    /** Capital inicial, si consta. */
    initialAmount: number | null;
    /** Pólizas y líneas: límite y dispuesto. */
    limit: number | null;
    drawn: number | null;
    /** Renting: cuota mensual. */
    monthlyPayment: number | null;
    maturity: string;
    guarantee: string;
    rows: AmortRow[];
}

export interface Extraction {
    file: string;
    company: { name: string; cif: string } | null;
    years: ExtractedYear[];
    loans: ExtractedLoan[];
    notes: string[];
}

export interface RowIssue { row: number; date: string; message: string }

export interface LoanCheck {
    loan: ExtractedLoan;
    issues: RowIssue[];
    /** Tipo de interés implícito medio (% anual) calculado con el cuadro. */
    impliedRate: number | null;
}

// ---------------------------------------------------------------------------
// Instrucciones para Claude
// ---------------------------------------------------------------------------

const lineCatalog = () =>
    [...BALANCE_LINES.map(l => `${l.id}: ${l.label} [balance]`), ...PYG_LINES.map(l => `${l.id}: ${l.label} [PyG${l.nature === 'expense' ? ', gasto: NEGATIVO' : ''}]`)].join('\n');

export function buildExtractionPrompt(file: string, content: string, hasImages: boolean): string {
    return `Eres un analista contable español experto en el Plan General de Contabilidad. Lee el documento "${file}" y extrae sus datos en JSON.
${hasImages ? 'Parte del documento se adjunta como imágenes de sus páginas (escaneadas): léelas también.\n' : ''}
El documento puede contener una o varias de estas cosas:
A) Cuentas anuales o balances de sumas y saldos: balance de situación y/o cuenta de pérdidas y ganancias, normalmente con dos columnas (ejercicio actual y anterior).
B) Cuadros de amortización de préstamos, hipotecas o leasing (una fila por cuota).
C) Contratos o extractos de pólizas de crédito, líneas de descuento o renting.

Reglas:
- Usa EXACTAMENTE estos identificadores de partida para el balance y la PyG (no inventes otros). Si el documento desglosa más, suma en la partida que corresponda; si agrupa (modelo abreviado), pon el total en la partida principal (p. ej. "Deudores comerciales y otras cuentas a cobrar" en clientes).
${lineCatalog()}
- Importes en euros como números (sin separadores de miles; decimales con punto). En la PyG los gastos van en NEGATIVO, como en las cuentas anuales. Partidas del balance que restan (acciones propias, dividendo a cuenta, resultados negativos de ejercicios anteriores) en negativo.
- Distingue largo y corto plazo según la sección del balance en la que aparece cada deuda.
- Si es un balance de sumas y saldos por cuentas (grupos 1-7), agrúpalas en las partidas anteriores según el PGC.
- Para cada ejercicio indica si es el principal del documento (primary: true) o la columna comparativa (false).
- Cuadros de amortización: copia TODAS las filas, sin saltarte ninguna ni redondear, en orden cronológico, con fecha (AAAA-MM-DD), cuota, intereses, amortización de capital y capital pendiente después de la cuota. Si alguna columna no figura, calcúlala a partir de las demás. No inventes filas que no estén en el documento.
- type de cada operación: ${DEBT_TYPES.map(t => t.id).join(', ')}.
- rate: tipo nominal anual en % si figura; null si no.
- maturity: AAAA-MM del vencimiento final (o de renovación, en pólizas).
- Si algo no se lee con seguridad, déjalo en null y explícalo en notes. No adivines cifras.

Responde SOLO con este JSON:
{"company": {"name": string, "cif": string} | null,
 "years": [{"year": number, "primary": boolean, "employees": number | null, "values": {"<id>": number}}],
 "loans": [{"type": string, "lender": string, "description": string, "rate": number | null, "initialAmount": number | null, "limit": number | null, "drawn": number | null, "monthlyPayment": number | null, "maturity": string, "guarantee": string,
            "rows": [{"date": "AAAA-MM-DD", "payment": number, "interest": number, "principal": number, "balance": number}]}],
 "notes": [string]}

CONTENIDO DEL DOCUMENTO:
${content}`;
}

export function buildRecheckPrompt(file: string, content: string, loan: ExtractedLoan, issues: RowIssue[]): string {
    const rows = loan.rows.map((r, i) => `${i + 1}. ${r.date} cuota ${r.payment} intereses ${r.interest} amortización ${r.principal} pendiente ${r.balance}`).join('\n');
    return `Has leído del documento "${file}" el cuadro de amortización de ${loan.description || loan.lender || 'un préstamo'}, pero al comprobarlo con aritmética no cuadra:
${issues.map(i => `- Fila ${i.row} (${i.date}): ${i.message}`).join('\n')}

Comprobaciones: capital pendiente anterior − amortización = capital pendiente; cuota = intereses + amortización.
Vuelve a leer esas filas (y las de alrededor) en el documento original y corrige los valores mal leídos. Si el propio documento tiene el error, déjalo como está e indícalo en notes.

Filas que leíste:
${rows}

Responde SOLO con JSON: {"rows": [ ...todas las filas corregidas, mismo formato {"date","payment","interest","principal","balance"} ], "notes": [string]}

DOCUMENTO ORIGINAL:
${content}`;
}

export function buildAccountsRecheckPrompt(file: string, content: string, ex: Extraction, problems: string[]): string {
    return `Has extraído las cuentas del documento "${file}", pero al comprobarlas no cuadran:
${problems.map(p => `- ${p}`).join('\n')}

Revisa en el documento original las partidas que hayas podido omitir, duplicar (sumar un total y su detalle) o leer con el signo cambiado, y devuelve los ejercicios corregidos con los mismos identificadores.
Tu extracción anterior:
${JSON.stringify(ex.years)}

Responde SOLO con JSON: {"years": [{"year": number, "primary": boolean, "employees": number | null, "values": {"<id>": number}}], "notes": [string]}

DOCUMENTO ORIGINAL:
${content}`;
}

// ---------------------------------------------------------------------------
// Normalización de la respuesta (nunca se confía en su forma)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: any): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
        return Number.isFinite(n) ? n : null;
    }
    return null;
};
const str = (v: any): string => (typeof v === 'string' ? v.trim() : '');

const normDate = (v: any): string => {
    const s = str(v);
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = /^(\d{4})-(\d{1,2})$/.exec(s);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-01`;
    return s;
};

export function normalizeRows(raw: any): AmortRow[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map(r => {
            const payment = num(r?.payment), interest = num(r?.interest), principal = num(r?.principal), balance = num(r?.balance);
            return {
                date: normDate(r?.date),
                interest: interest ?? (payment !== null && principal !== null ? payment - principal : 0),
                principal: principal ?? (payment !== null && interest !== null ? payment - interest : 0),
                payment: payment ?? ((interest ?? 0) + (principal ?? 0)),
                balance: balance ?? NaN,
            };
        })
        .filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date));
}

export function normalizeExtraction(file: string, raw: any): Extraction {
    const years: ExtractedYear[] = Array.isArray(raw?.years) ? raw.years.map((y: any) => {
        const values: Partial<YearValues> = {};
        for (const [k, v] of Object.entries(y?.values ?? {})) {
            const n = num(v);
            if (ALL_LINE_IDS.includes(k) && n !== null) values[k] = n;
        }
        return { year: Math.round(num(y?.year) ?? 0), primary: !!y?.primary, employees: num(y?.employees), values };
    }).filter((y: ExtractedYear) => y.year >= 1990 && y.year <= 2100 && Object.keys(y.values).length > 0) : [];

    const validTypes = DEBT_TYPES.map(t => t.id) as string[];
    const loans: ExtractedLoan[] = Array.isArray(raw?.loans) ? raw.loans.map((l: any) => ({
        type: (validTypes.includes(str(l?.type)) ? str(l?.type) : 'prestamo') as DebtType,
        lender: str(l?.lender),
        description: str(l?.description),
        rate: num(l?.rate),
        initialAmount: num(l?.initialAmount),
        limit: num(l?.limit),
        drawn: num(l?.drawn),
        monthlyPayment: num(l?.monthlyPayment),
        maturity: str(l?.maturity).slice(0, 7),
        guarantee: str(l?.guarantee),
        rows: normalizeRows(l?.rows),
    })) : [];

    const company = raw?.company && (str(raw.company.name) || str(raw.company.cif))
        ? { name: str(raw.company.name), cif: str(raw.company.cif) } : null;
    const notes = Array.isArray(raw?.notes) ? raw.notes.map(str).filter(Boolean) : [];
    return { file, company, years, loans, notes };
}

// ---------------------------------------------------------------------------
// Comprobaciones aritméticas
// ---------------------------------------------------------------------------

const eur = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Comprueba fila a fila el cuadro de amortización. Tolerancia: 1 € (redondeos del banco). */
export function verifyAmortization(loan: ExtractedLoan, tolerance = 1): LoanCheck {
    const issues: RowIssue[] = [];
    const rows = loan.rows;
    let rateSum = 0, rateN = 0;
    rows.forEach((r, i) => {
        const n = i + 1;
        if (!Number.isFinite(r.balance)) {
            issues.push({ row: n, date: r.date, message: 'falta el capital pendiente' });
            return;
        }
        if (Math.abs(r.payment - r.interest - r.principal) > tolerance) {
            issues.push({ row: n, date: r.date, message: `cuota ${eur(r.payment)} ≠ intereses ${eur(r.interest)} + amortización ${eur(r.principal)} (diferencia ${eur(r.payment - r.interest - r.principal)})` });
        }
        const prev = i === 0 ? (loan.initialAmount ?? null) : rows[i - 1].balance;
        if (prev !== null && Number.isFinite(prev)) {
            const expected = prev - r.principal;
            if (Math.abs(expected - r.balance) > tolerance) {
                issues.push({ row: n, date: r.date, message: `pendiente anterior ${eur(prev)} − amortización ${eur(r.principal)} = ${eur(expected)}, pero el cuadro dice ${eur(r.balance)} (diferencia ${eur(r.balance - expected)})` });
            }
            if (prev > 0 && r.interest > 0) {
                const months = i === 0 ? 1 : monthsBetween(rows[i - 1].date, r.date) || 1;
                rateSum += (r.interest / prev) * (12 / months);
                rateN++;
            }
        }
        if (i > 0 && r.date <= rows[i - 1].date) {
            issues.push({ row: n, date: r.date, message: `fecha no posterior a la fila anterior (${rows[i - 1].date})` });
        }
    });
    if (rows.length && Number.isFinite(rows[rows.length - 1].balance) && rows[rows.length - 1].balance > tolerance && loan.maturity && rows[rows.length - 1].date.slice(0, 7) >= loan.maturity) {
        issues.push({ row: rows.length, date: rows[rows.length - 1].date, message: `el cuadro termina con ${eur(rows[rows.length - 1].balance)} pendientes en la fecha de vencimiento` });
    }
    return { loan, issues, impliedRate: rateN ? (rateSum / rateN) * 100 : null };
}

const monthsBetween = (a: string, b: string) => {
    const [ya, ma] = a.split('-').map(Number);
    const [yb, mb] = b.split('-').map(Number);
    return (yb - ya) * 12 + (mb - ma);
};

/** Comprueba que el balance cuadra y que el resultado de la PyG coincide con el del balance. */
export function checkAccounts(years: ExtractedYear[]): string[] {
    const problems: string[] = [];
    for (const y of years) {
        const values = { ...emptyYear(), ...y.values } as YearValues;
        const f = computeFigures(normalizeYear(values).values);
        const hasBalance = f.activo !== 0 || f.pnYPasivo !== 0;
        const hasPyg = PYG_LINES.some(l => (y.values[l.id] ?? 0) !== 0);
        if (hasBalance && Math.abs(f.activo - f.pnYPasivo) > Math.max(5, f.activo * 0.001)) {
            problems.push(`${y.year}: el activo (${eur(f.activo)}) no coincide con patrimonio neto + pasivo (${eur(f.pnYPasivo)}); diferencia ${eur(f.activo - f.pnYPasivo)}.`);
        }
        const rdo = values.resultadoEjercicio ?? 0;
        if (hasBalance && hasPyg && Math.abs(rdo - f.resultado) > Math.max(5, Math.abs(f.resultado) * 0.001)) {
            problems.push(`${y.year}: el resultado de la PyG (${eur(f.resultado)}) no coincide con el resultado del ejercicio del balance (${eur(rdo)}).`);
        }
    }
    return problems;
}

// ---------------------------------------------------------------------------
// De cuadro de amortización a operación del cuadro de financiación
// ---------------------------------------------------------------------------

/** Convierte una operación leída en una línea del cuadro de financiación a fecha de cierre (31/12/yearN). */
export function loanToDebtItem(loan: ExtractedLoan, yearN: number, check: LoanCheck | null, file: string): DebtItem {
    const closing = `${yearN}-12-31`;
    const base: DebtItem = {
        ...newDebtItem(),
        type: loan.type,
        lender: loan.lender,
        description: loan.description,
        rate: loan.rate ?? (check?.impliedRate !== null && check?.impliedRate !== undefined ? Math.round(check.impliedRate * 100) / 100 : null),
        maturity: loan.maturity,
        guarantee: loan.guarantee,
        limit: loan.limit,
        monthlyPayment: loan.monthlyPayment,
        outstanding: loan.drawn ?? 0,
    };
    if (!loan.rows.length) {
        if (loan.type !== 'poliza' && loan.type !== 'descuento' && loan.type !== 'renting') base.outstanding = loan.drawn ?? loan.initialAmount ?? 0;
        return base;
    }
    const past = loan.rows.filter(r => r.date <= closing);
    const future = loan.rows.filter(r => r.date > closing);
    const outstanding = past.length
        ? past[past.length - 1].balance
        : (future.length ? future[0].balance + future[0].principal : loan.initialAmount ?? 0);
    const last = loan.rows[loan.rows.length - 1];
    return {
        ...base,
        outstanding: Math.max(0, Number.isFinite(outstanding) ? outstanding : 0),
        monthlyPayment: future.length ? future[0].payment : loan.monthlyPayment,
        maturity: loan.maturity || last.date.slice(0, 7),
        schedule: future,
        source: { file, rows: loan.rows.length, verified: !!check && check.issues.length === 0, issues: check?.issues.length ?? 0 },
    };
}

// ---------------------------------------------------------------------------
// Fusión con los datos del cliente
// ---------------------------------------------------------------------------

export interface MergeResult {
    data: FinancialDataset;
    yearsUpdated: number[];
    debtsAdded: number;
    skippedYears: number[];
}

export function mergeExtractions(current: FinancialDataset, extractions: Extraction[], loanChecks: Map<ExtractedLoan, LoanCheck>, startFresh: boolean): MergeResult {
    const base = startFresh ? { ...current, company: { ...current.company, name: '', cif: '' }, years: [], debts: [] } as FinancialDataset : current;
    const byYear = new Map<number, YearData>(base.years.map(y => [y.year, { ...y, values: { ...y.values } }]));

    // Primero las columnas comparativas y después las principales, que prevalecen.
    const allYears = extractions.flatMap(e => e.years).sort((a, b) => Number(a.primary) - Number(b.primary));
    const yearsUpdated = new Set<number>();
    for (const y of allYears) {
        const target = byYear.get(y.year) ?? emptyYearData(y.year);
        for (const [k, v] of Object.entries(y.values)) if (typeof v === 'number') target.values[k] = v;
        if (y.employees !== null) target.employees = y.employees;
        byYear.set(y.year, target);
        yearsUpdated.add(y.year);
    }
    let years = [...byYear.values()].sort((a, b) => b.year - a.year);
    const skippedYears = years.slice(MAX_YEARS).map(y => y.year);
    years = years.slice(0, MAX_YEARS);
    // Mínimo dos ejercicios consecutivos
    while (years.length < 2) years.push(emptyYearData((years[years.length - 1]?.year ?? new Date().getFullYear()) - 1));

    const company = { ...base.company };
    const found = extractions.find(e => e.company)?.company;
    if (found) {
        if (found.name && !company.name) company.name = found.name;
        if (found.cif && !company.cif) company.cif = found.cif;
    }

    const yearN = years[0].year;
    const newDebts = extractions.flatMap(e => e.loans.map(l => loanToDebtItem(l, yearN, loanChecks.get(l) ?? null, e.file)))
        .filter(d => d.outstanding > 0 || (d.limit ?? 0) > 0 || (d.monthlyPayment ?? 0) > 0);
    const key = (d: DebtItem) => `${d.type}|${d.lender.toLowerCase()}|${d.description.toLowerCase()}`;
    const newKeys = new Set(newDebts.map(key));
    const debts = [...base.debts.filter(d => !newKeys.has(key(d))), ...newDebts];

    return {
        data: { ...base, company, years, debts },
        yearsUpdated: [...yearsUpdated].sort((a, b) => b - a),
        debtsAdded: newDebts.length,
        skippedYears,
    };
}
