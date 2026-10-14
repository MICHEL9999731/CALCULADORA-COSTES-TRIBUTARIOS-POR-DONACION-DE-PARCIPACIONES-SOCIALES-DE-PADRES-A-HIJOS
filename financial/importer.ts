// Importación de datos: plantilla CSV propia y pegado directo de balances y
// cuentas de resultados copiados desde Excel, el programa de contabilidad o el
// depósito de cuentas (modelos normal y abreviado del PGC).

import { ALL_LINE_IDS, BALANCE_LINES, DEBT_TYPES, MAX_YEARS, PYG_LINES, newDebtItem, type BalanceSection, type DebtItem, type DebtType, type YearValues } from './schema';
import { parseAmount } from './format';

export const normalizeLabel = (s: string): string =>
    s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/^\s*((?:[a-z]{1,4}|\d{1,2})(?:[.)]|\.\d+\)?)\s*)+/g, '') // "a) ", "1. ", "iii. ", "a.1) "
        .replace(/\(-\)|\(\+\)|\(\+\/-\)|\(-\/\+\)/g, ' ')
        .replace(/[()]/g, ' ')
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

interface Alias { id: string; text: string; kind: 'total' | 'detail'; group?: string; section?: BalanceSection }

const A = (id: string, texts: string[], extra: Partial<Alias> = {}): Alias[] =>
    texts.map(text => ({ id, text: normalizeLabel(text), kind: 'detail', ...extra }));

const ALIASES: Alias[] = [
    ...A('inmIntangible', ['Inmovilizado intangible']),
    ...A('inmMaterial', ['Inmovilizado material']),
    ...A('invInmobiliarias', ['Inversiones inmobiliarias']),
    ...A('invGrupoLP', ['Inversiones en empresas del grupo y asociadas a largo plazo', 'Inversiones en empresas del grupo y asociadas a LP']),
    ...A('invFinLP', ['Inversiones financieras a largo plazo', 'Inversiones financieras a LP']),
    ...A('aid', ['Activos por impuesto diferido']),
    ...A('otrosANC', ['Deudores comerciales no corrientes']),
    ...A('ancVenta', ['Activos no corrientes mantenidos para la venta']),
    ...A('existencias', ['Existencias']),
    ...A('clientes', ['Deudores comerciales y otras cuentas a cobrar'], { kind: 'total', group: 'deudores' }),
    ...A('clientes', ['Clientes por ventas y prestaciones de servicios', 'Clientes'], { group: 'deudores' }),
    ...A('otrosDeudores', ['Personal'], { group: 'deudores', section: 'ac' }),
    ...A('otrosDeudores', ['Clientes empresas del grupo y asociadas', 'Deudores varios', 'Activos por impuesto corriente', 'Otros creditos con las Administraciones Publicas', 'Accionistas socios por desembolsos exigidos', 'Otros deudores'], { group: 'deudores' }),
    ...A('invGrupoCP', ['Inversiones en empresas del grupo y asociadas a corto plazo', 'Inversiones en empresas del grupo y asociadas a CP']),
    ...A('invFinCP', ['Inversiones financieras a corto plazo', 'Inversiones financieras a CP']),
    ...A('periodifActivo', ['Periodificaciones a corto plazo'], { section: 'ac' }),
    ...A('efectivo', ['Efectivo y otros activos liquidos equivalentes', 'Tesoreria']),

    ...A('capital', ['Capital escriturado', 'Capital']),
    ...A('capital', ['Capital no exigido'], {}),
    ...A('prima', ['Prima de emision', 'Prima de asuncion']),
    ...A('reservas', ['Reservas']),
    ...A('accionesPropias', ['Acciones y participaciones en patrimonio propias', 'Acciones y participaciones propias']),
    ...A('rdosAnteriores', ['Resultados de ejercicios anteriores', 'Remanente', 'Resultados negativos de ejercicios anteriores']),
    ...A('aportacionesSocios', ['Otras aportaciones de socios']),
    ...A('resultadoEjercicio', ['Resultado del ejercicio'], { section: 'pn' }),
    ...A('dividendoCuenta', ['Dividendo a cuenta']),
    ...A('ajustesValor', ['Ajustes por cambios de valor']),
    ...A('subvenciones', ['Subvenciones donaciones y legados recibidos']),

    ...A('provisionesLP', ['Provisiones a largo plazo']),
    ...A('otrasDeudasLP', ['Deudas a largo plazo'], { kind: 'total', group: 'deudasLP' }),
    ...A('deudaBancariaLP', ['Deudas con entidades de credito'], { group: 'deudasLP', section: 'pnc' }),
    ...A('leasingLP', ['Acreedores por arrendamiento financiero'], { group: 'deudasLP', section: 'pnc' }),
    ...A('otrasDeudasLP', ['Otras deudas a largo plazo', 'Otros pasivos financieros', 'Derivados', 'Obligaciones y otros valores negociables'], { group: 'deudasLP', section: 'pnc' }),
    ...A('deudaGrupoLP', ['Deudas con empresas del grupo y asociadas a largo plazo', 'Deudas con empresas del grupo y asociadas a LP']),
    ...A('pid', ['Pasivos por impuesto diferido']),
    ...A('periodifPasivoLP', ['Periodificaciones a largo plazo']),
    ...A('otrasDeudasLP', ['Acreedores comerciales no corrientes', 'Deuda con caracteristicas especiales a largo plazo']),

    ...A('pasivosVenta', ['Pasivos vinculados con activos no corrientes mantenidos para la venta']),
    ...A('provisionesCP', ['Provisiones a corto plazo']),
    ...A('otrasDeudasCP', ['Deudas a corto plazo'], { kind: 'total', group: 'deudasCP' }),
    ...A('deudaBancariaCP', ['Deudas con entidades de credito'], { group: 'deudasCP', section: 'pc' }),
    ...A('leasingCP', ['Acreedores por arrendamiento financiero'], { group: 'deudasCP', section: 'pc' }),
    ...A('otrasDeudasCP', ['Otras deudas a corto plazo', 'Otros pasivos financieros', 'Derivados', 'Obligaciones y otros valores negociables'], { group: 'deudasCP', section: 'pc' }),
    ...A('deudaGrupoCP', ['Deudas con empresas del grupo y asociadas a corto plazo', 'Deudas con empresas del grupo y asociadas a CP']),
    ...A('proveedores', ['Acreedores comerciales y otras cuentas a pagar'], { kind: 'total', group: 'acreedores' }),
    ...A('proveedores', ['Proveedores'], { group: 'acreedores' }),
    ...A('otrosAcreedores', ['Proveedores empresas del grupo y asociadas', 'Acreedores varios', 'Personal remuneraciones pendientes de pago', 'Pasivos por impuesto corriente', 'Otras deudas con las Administraciones Publicas', 'Anticipos de clientes', 'Otros acreedores'], { group: 'acreedores' }),
    ...A('periodifPasivoCP', ['Periodificaciones a corto plazo'], { section: 'pc' }),
    ...A('otrasDeudasCP', ['Deuda con caracteristicas especiales a corto plazo']),

    ...A('ventas', ['Importe neto de la cifra de negocios']),
    ...A('varExistencias', ['Variacion de existencias de productos terminados y en curso de fabricacion', 'Variacion de existencias de productos terminados y en curso']),
    ...A('trabajosActivo', ['Trabajos realizados por la empresa para su activo']),
    ...A('aprovisionamientos', ['Aprovisionamientos']),
    ...A('otrosIngresosExpl', ['Otros ingresos de explotacion']),
    ...A('personal', ['Gastos de personal']),
    ...A('otrosGastosExpl', ['Otros gastos de explotacion']),
    ...A('amortizacion', ['Amortizacion del inmovilizado']),
    ...A('imputacionSubv', ['Imputacion de subvenciones de inmovilizado no financiero y otras', 'Imputacion de subvenciones de inmovilizado no financiero']),
    ...A('excesoProvisiones', ['Excesos de provisiones']),
    ...A('deterioroInmov', ['Deterioro y resultado por enajenaciones del inmovilizado']),
    ...A('otrosResultados', ['Otros resultados', 'Diferencia negativa de combinaciones de negocio']),
    ...A('ingresosFin', ['Ingresos financieros']),
    ...A('gastosFin', ['Gastos financieros']),
    ...A('otrosFin', ['Variacion de valor razonable en instrumentos financieros', 'Diferencias de cambio', 'Deterioro y resultado por enajenaciones de instrumentos financieros', 'Otros ingresos y gastos de caracter financiero', 'Incorporacion al activo de gastos financieros']),
    ...A('impuesto', ['Impuestos sobre beneficios', 'Impuesto sobre beneficios', 'Impuesto sobre sociedades']),
];

const SECTION_HEADINGS: [string, BalanceSection][] = [
    ['activo no corriente', 'anc'],
    ['activo corriente', 'ac'],
    ['patrimonio neto', 'pn'],
    ['fondos propios', 'pn'],
    ['pasivo no corriente', 'pnc'],
    ['pasivo corriente', 'pc'],
];

export interface ImportedLine {
    raw: string;
    label: string;
    id: string | null;
    /** Importes por columna de ejercicio (0 = más reciente). */
    values: (number | null)[];
    ignoredReason?: string;
}

export interface ImportResult {
    /** Importes por ejercicio: columns[0] = el más reciente. */
    columns: Partial<YearValues>[];
    /** Años detectados en la fila de cabecera (si la hay), en el mismo orden que columns. */
    years: (number | null)[];
    lines: ImportedLine[];
    matched: number;
}

interface Row { raw: string; cells: string[]; positional: boolean }

const splitCells = (line: string): Row => {
    if (line.includes('\t')) return { raw: line, cells: line.split('\t').map(c => c.trim()), positional: true };
    if (line.includes(';')) return { raw: line, cells: line.split(';').map(c => c.trim().replace(/^"|"$/g, '')), positional: true };
    // Separación por varios espacios (texto copiado de un PDF)
    const parts = line.split(/\s{2,}/);
    if (parts.length > 1) return { raw: line, cells: parts.map(c => c.trim()), positional: false };
    // Último recurso: etiqueta seguida de números separados por un espacio
    const m = line.match(/^(.*?)((?:\s+[-(]?[\d.,]+\)?)+)\s*$/);
    if (m) return { raw: line, cells: [m[1], ...m[2].trim().split(/\s+/)], positional: false };
    return { raw: line, cells: [line], positional: false };
};

const looksNumeric = (s: string) => /^[-(]?\s*[\d.,]+\s*\)?\s*€?$/.test(s.trim()) && /\d/.test(s);
const YEAR_RE = /^(?:ejercicio\s*|ej\.?\s*|a[ñn]o\s*)?((?:19|20)\d{2})$/i;

export function parseImport(text: string, maxColumns = MAX_YEARS): ImportResult {
    const rows = text.split(/\r?\n/).filter(l => l.trim()).map(splitCells);

    // 1) Cabecera con años ("Partida | 2025 | 2024 | 2023")
    let headerIdx = -1;
    let headerCols: { col: number; year: number }[] = [];
    rows.some((r, i) => {
        const ys = r.cells.map((c, col) => ({ col, m: YEAR_RE.exec(c) })).filter(x => x.m);
        const others = r.cells.filter(c => c && !YEAR_RE.test(c));
        if (ys.length >= 1 && others.every(c => !looksNumeric(c))) {
            headerIdx = i;
            headerCols = ys.map(x => ({ col: x.col, year: Number(x.m![1]) }));
            return true;
        }
        return false;
    });

    // 2) Columnas de importes: las de la cabecera o, si no hay, las columnas con números
    //    (descartando una posible columna de "Notas" con números pequeños).
    let valueCols: number[] | null = null;
    if (headerCols.length) {
        valueCols = headerCols.map(h => h.col);
    } else if (rows.some(r => r.positional)) {
        const stats = new Map<number, number[]>();
        for (const r of rows) {
            if (!r.positional) continue;
            r.cells.forEach((c, col) => {
                if (col > 0 && looksNumeric(c)) stats.set(col, [...(stats.get(col) ?? []), Math.abs(parseAmount(c))]);
            });
        }
        let cols = [...stats.keys()].sort((a, b) => a - b);
        if (cols.length > 1) {
            cols = cols.filter(col => {
                const xs = stats.get(col)!;
                return !xs.every(x => x < 100);
            });
        }
        valueCols = cols.slice(-maxColumns);
    }
    const k = valueCols ? valueCols.length : Math.min(maxColumns, Math.max(1, ...rows.map(r => r.cells.filter(looksNumeric).length)));
    const columns: Partial<YearValues>[] = Array.from({ length: k }, () => ({}));
    const years: (number | null)[] = Array.from({ length: k }, (_, i) => headerCols[i]?.year ?? null);

    const lines: ImportedLine[] = [];
    let section: BalanceSection | null = null;
    let inPyg = false;
    // Para cada grupo: si aparecen partidas de detalle se descarta el total.
    const totals: { id: string; group: string; values: (number | null)[] }[] = [];
    const groupsWithDetail = new Set<string>();
    const addValues = (id: string, vs: (number | null)[]) => vs.forEach((v, i) => {
        if (v === null || Number.isNaN(v) || i >= k) return;
        columns[i][id] = (columns[i][id] ?? 0) + v;
    });

    rows.forEach((row, idx) => {
        if (idx === headerIdx) {
            // La cabecera puede ser a la vez un encabezado de masa ("PASIVO CORRIENTE | 2025 | 2024").
            const h = normalizeLabel(row.cells.filter(c => c && !YEAR_RE.test(c)).join(' '));
            const hit = SECTION_HEADINGS.find(([t]) => h.startsWith(t));
            if (hit) section = hit[1];
            return;
        }
        const cells = row.cells;
        const first = cells.find(c => c !== '') ?? '';
        if (first.toLowerCase() === 'codigo' || first.toLowerCase() === 'código') return;
        let vals: (number | null)[];
        if (valueCols && row.positional) {
            vals = valueCols.map(col => (cells[col] && looksNumeric(cells[col]) ? parseAmount(cells[col]) : null));
        } else {
            const nums = cells.filter(looksNumeric).map(parseAmount).slice(-k);
            vals = Array.from({ length: k }, (_, i) => nums[i] ?? null);
        }
        const textCells = cells.filter((c, col) => c && !looksNumeric(c) && !(valueCols?.includes(col)));
        const label = textCells.join(' ');
        const norm = normalizeLabel(label);
        const noValues = vals.every(v => v === null);

        const sectionHit = SECTION_HEADINGS.find(([h]) => norm === h || norm === `total ${h}`);
        if (sectionHit) {
            section = sectionHit[1];
            inPyg = false;
            lines.push({ raw: row.raw, label, id: null, values: vals, ignoredReason: 'Encabezado de masa patrimonial' });
            return;
        }
        if (/cuenta de perdidas y ganancias|operaciones continuadas/.test(norm)) {
            inPyg = true;
            section = null;
        }

        let id: string | null = ALL_LINE_IDS.includes(first) ? first : null;
        let alias: Alias | undefined;
        if (!id) {
            const candidates = ALIASES.filter(a => a.text === norm || (norm.startsWith(a.text) && norm.length - a.text.length <= 25));
            alias = candidates.find(a => a.text === norm && (!a.section || a.section === section))
                ?? candidates.find(a => !a.section || a.section === section);
            if (alias && inPyg && BALANCE_LINES.some(b => b.id === alias!.id)) alias = undefined;
            id = alias?.id ?? null;
        }
        if (!id || noValues) {
            lines.push({ raw: row.raw, label, id: null, values: vals, ignoredReason: id ? 'Sin importes' : 'No reconocida (no se importa)' });
            return;
        }
        if (alias?.kind === 'total' && alias.group) {
            totals.push({ id, group: alias.group, values: vals });
            lines.push({ raw: row.raw, label, id, values: vals, ignoredReason: 'Total (se usa solo si no se detallan sus partidas)' });
            return;
        }
        if (alias?.group) groupsWithDetail.add(alias.group);
        addValues(id, vals);
        lines.push({ raw: row.raw, label, id, values: vals });
    });
    for (const t of totals) {
        if (groupsWithDetail.has(t.group)) continue;
        addValues(t.id, t.values);
        const l = lines.find(x => x.id === t.id && x.ignoredReason?.startsWith('Total'));
        if (l) delete l.ignoredReason;
    }
    const matched = lines.filter(l => l.id && !l.ignoredReason).length;
    return { columns, years, lines, matched };
}

export function buildTemplateCsv(years: { year: number; values: YearValues }[]): string {
    const fmt = (v: number | undefined) => (v ? String(v).replace('.', ',') : '');
    const rows = [`codigo;partida;${years.map(y => y.year).join(';')}`];
    for (const l of [...BALANCE_LINES, ...PYG_LINES]) {
        rows.push(`${l.id};"${l.label}";${years.map(y => fmt(y.values[l.id])).join(';')}`);
    }
    return rows.join('\n');
}

// ---------------------------------------------------------------------------
// Cuadro de financiación pegado desde Excel
// ---------------------------------------------------------------------------

export const DEBT_COLUMNS = ['Tipo', 'Entidad', 'Descripción', 'Pendiente / dispuesto (€)', 'Límite (€)', 'Tipo interés (%)', 'Cuota mensual (€)', 'Vencimiento (AAAA-MM)', 'Carencia hasta (AAAA-MM)', 'Garantía'];

const normDate = (s: string): string => {
    const t = s.trim();
    let m = /^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/.exec(t);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
    m = /^(?:\d{1,2}[-/])?(\d{1,2})[-/](\d{4})$/.exec(t);
    if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
    return t;
};

const debtTypeFrom = (s: string): DebtType => {
    const n = normalizeLabel(s);
    const found = DEBT_TYPES.find(d => normalizeLabel(d.label) === n || d.id === n);
    if (found) return found.id;
    if (/renting|arrendamiento operativo|alquiler/.test(n)) return 'renting';
    if (/leasing|arrendamiento financiero/.test(n)) return 'leasing';
    if (/hipotec/.test(n)) return 'hipoteca';
    if (/poliza|credito/.test(n)) return 'poliza';
    if (/descuento|factoring|confirming|comercio exterior/.test(n)) return 'descuento';
    if (/socio/.test(n)) return 'socios';
    if (/aplazamiento|hacienda|seguridad social|aeat|tgss/.test(n)) return 'aplazamiento';
    if (/prestamo|ico/.test(n)) return 'prestamo';
    return 'otro';
};

/** Lee filas con las columnas de DEBT_COLUMNS (en ese orden) separadas por tabulador o punto y coma. */
export function parseDebts(text: string): DebtItem[] {
    const out: DebtItem[] = [];
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const c = (line.includes('\t') ? line.split('\t') : line.split(';')).map(x => x.trim().replace(/^"|"$/g, ''));
        if (/^tipo$/i.test(c[0])) continue; // cabecera
        const num = (i: number) => (c[i] && /\d/.test(c[i]) ? parseAmount(c[i].replace('%', '')) : null);
        const item: DebtItem = {
            ...newDebtItem(),
            type: debtTypeFrom(c[0] ?? ''),
            lender: c[1] ?? '',
            description: c[2] ?? '',
            outstanding: num(3) ?? 0,
            limit: num(4),
            rate: num(5),
            monthlyPayment: num(6),
            maturity: c[7] ? normDate(c[7]) : '',
            graceUntil: c[8] ? normDate(c[8]) : '',
            guarantee: c[9] ?? '',
        };
        if (item.outstanding || item.limit || item.monthlyPayment) out.push(item);
    }
    return out;
}

export function buildDebtTemplateCsv(debts: DebtItem[]): string {
    const n = (v: number | null) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
    const label = (t: DebtType) => DEBT_TYPES.find(d => d.id === t)?.label ?? t;
    const rows = [DEBT_COLUMNS.join(';')];
    for (const d of debts) {
        rows.push([label(d.type), d.lender, d.description, n(d.outstanding), n(d.limit), n(d.rate), n(d.monthlyPayment), d.maturity, d.graceUntil, d.guarantee].map(x => `"${x}"`).join(';'));
    }
    if (!debts.length) rows.push('"Préstamo";"Banco X";"Préstamo ICO maquinaria";"120000";"";"4,5";"2300";"2029-06";"";"Personal socios"');
    return rows.join('\n');
}
