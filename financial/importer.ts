// Importación de datos: plantilla CSV propia y pegado directo de balances y
// cuentas de resultados copiados desde Excel, el programa de contabilidad o el
// depósito de cuentas (modelos normal y abreviado del PGC).

import { ALL_LINE_IDS, BALANCE_LINES, PYG_LINES, type BalanceSection, type YearValues } from './schema';
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
    n: number | null;
    n1: number | null;
    ignoredReason?: string;
}

export interface ImportResult {
    yearN: Partial<YearValues>;
    yearN1: Partial<YearValues>;
    lines: ImportedLine[];
    matched: number;
}

const splitCells = (line: string): string[] => {
    if (line.includes('\t')) return line.split('\t');
    if (line.includes(';')) return line.split(';');
    // Separación por varios espacios (texto copiado de un PDF)
    const parts = line.split(/\s{2,}/);
    if (parts.length > 1) return parts;
    // Último recurso: etiqueta seguida de números separados por un espacio
    const m = line.match(/^(.*?)((?:\s+[-(]?[\d.,]+\)?)+)\s*$/);
    if (m) return [m[1], ...m[2].trim().split(/\s+/)];
    return [line];
};

const looksNumeric = (s: string) => /^[-(]?\s*[\d.,]+\s*\)?\s*€?$/.test(s.trim()) && /\d/.test(s);

export function parseImport(text: string): ImportResult {
    const yearN: Partial<YearValues> = {};
    const yearN1: Partial<YearValues> = {};
    const lines: ImportedLine[] = [];
    let section: BalanceSection | null = null;
    let inPyg = false;
    // Para cada grupo: si aparecen partidas de detalle se descarta el total.
    const totals: { id: string; group: string; n: number | null; n1: number | null }[] = [];
    const groupsWithDetail = new Set<string>();

    const addValue = (target: Partial<YearValues>, id: string, v: number | null) => {
        if (v === null || Number.isNaN(v)) return;
        target[id] = (target[id] ?? 0) + v;
    };

    for (const rawLine of text.split(/\r?\n/)) {
        if (!rawLine.trim()) continue;
        const cells = splitCells(rawLine).map(c => c.trim()).filter(c => c !== '');
        if (!cells.length) continue;

        // Plantilla propia: codigo;partida;N;N-1
        const first = cells[0];
        if (first.toLowerCase() === 'codigo' || first.toLowerCase() === 'código') continue;
        const numericCells = cells.filter(looksNumeric);
        const textCells = cells.filter(c => !looksNumeric(c));
        const values = numericCells.map(parseAmount);
        // Si hay columna de notas, nos quedamos con las dos últimas cifras.
        const nums = values.length > 2 ? values.slice(-2) : values;
        const n = nums.length ? nums[0] : null;
        const n1 = nums.length > 1 ? nums[1] : null;
        const label = textCells.join(' ');
        const norm = normalizeLabel(label);

        const sectionHit = SECTION_HEADINGS.find(([h]) => norm === h || norm === `total ${h}`);
        if (sectionHit) {
            section = sectionHit[1];
            inPyg = false;
            lines.push({ raw: rawLine, label, id: null, n, n1, ignoredReason: 'Encabezado de masa patrimonial' });
            continue;
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
        if (!id || (n === null && n1 === null)) {
            lines.push({ raw: rawLine, label, id: null, n, n1, ignoredReason: id ? 'Sin importes' : 'No reconocida (no se importa)' });
            continue;
        }
        if (alias?.kind === 'total' && alias.group) {
            totals.push({ id, group: alias.group, n, n1 });
            lines.push({ raw: rawLine, label, id, n, n1, ignoredReason: 'Total (se usa solo si no se detallan sus partidas)' });
            continue;
        }
        if (alias?.group) groupsWithDetail.add(alias.group);
        addValue(yearN, id, n);
        addValue(yearN1, id, n1);
        lines.push({ raw: rawLine, label, id, n, n1 });
    }
    for (const t of totals) {
        if (groupsWithDetail.has(t.group)) continue;
        addValue(yearN, t.id, t.n);
        addValue(yearN1, t.id, t.n1);
        const l = lines.find(x => x.id === t.id && x.ignoredReason?.startsWith('Total'));
        if (l) delete l.ignoredReason;
    }
    const matched = lines.filter(l => l.id && !l.ignoredReason).length;
    return { yearN, yearN1, lines, matched };
}

export function buildTemplateCsv(yearN?: YearValues, yearN1?: YearValues): string {
    const fmt = (v: number | undefined) => (v ? String(v).replace('.', ',') : '');
    const rows = ['codigo;partida;N;N-1'];
    for (const l of [...BALANCE_LINES, ...PYG_LINES]) {
        rows.push(`${l.id};"${l.label}";${fmt(yearN?.[l.id])};${fmt(yearN1?.[l.id])}`);
    }
    return rows.join('\n');
}
