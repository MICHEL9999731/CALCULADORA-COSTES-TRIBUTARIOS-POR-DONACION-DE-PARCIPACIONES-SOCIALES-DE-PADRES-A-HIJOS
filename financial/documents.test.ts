import { describe, expect, it } from 'vitest';
import { checkAccounts, loanToDebtItem, mergeExtractions, normalizeExtraction, verifyAmortization, type ExtractedLoan } from './documents';
import { analyze } from './engine';
import { emptyDataset, type AmortRow } from './schema';
import { sampleDataset } from './sampleData';

/** Cuadro francés correcto: 24 cuotas mensuales de un préstamo de 24.000 € al 6 %. */
const frenchTable = (principal = 24_000, ratePct = 6, months = 24, start = [2025, 1]): AmortRow[] => {
    const r = ratePct / 100 / 12;
    const pay = Math.round(((principal * r) / (1 - Math.pow(1 + r, -months))) * 100) / 100;
    const rows: AmortRow[] = [];
    let bal = principal;
    for (let i = 0; i < months; i++) {
        const interest = Math.round(bal * r * 100) / 100;
        let amort = Math.round((pay - interest) * 100) / 100;
        if (i === months - 1) amort = Math.round(bal * 100) / 100;
        bal = Math.round((bal - amort) * 100) / 100;
        const y = start[0] + Math.floor((start[1] - 1 + i) / 12);
        const m = ((start[1] - 1 + i) % 12) + 1;
        rows.push({ date: `${y}-${String(m).padStart(2, '0')}-05`, payment: Math.round((interest + amort) * 100) / 100, interest, principal: amort, balance: bal });
    }
    return rows;
};

const loanOf = (rows: AmortRow[]): ExtractedLoan => ({
    type: 'prestamo', lender: 'Banco Z', description: 'Préstamo maquinaria', rate: 6, initialAmount: 24_000,
    limit: null, drawn: null, monthlyPayment: null, maturity: '2026-12', guarantee: '', rows,
});

describe('verificación del cuadro de amortización', () => {
    it('da por bueno un cuadro correcto', () => {
        const check = verifyAmortization(loanOf(frenchTable()));
        expect(check.issues).toEqual([]);
        expect(check.impliedRate).toBeCloseTo(6, 1);
    });

    it('detecta un saldo mal leído', () => {
        const rows = frenchTable();
        rows[9] = { ...rows[9], balance: rows[9].balance + 1000 }; // dígito mal leído
        const check = verifyAmortization(loanOf(rows));
        // falla la fila 10 (no cuadra con la 9) y la 11 (no cuadra con la 10)
        expect(check.issues.map(i => i.row)).toEqual([10, 11]);
        expect(check.issues[0].message).toContain('pendiente anterior');
    });

    it('detecta una cuota que no es intereses + amortización', () => {
        const rows = frenchTable();
        rows[3] = { ...rows[3], interest: rows[3].interest + 50 };
        const check = verifyAmortization(loanOf(rows));
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].row).toBe(4);
    });

    it('detecta filas omitidas', () => {
        const rows = frenchTable();
        rows.splice(5, 1);
        const check = verifyAmortization(loanOf(rows));
        expect(check.issues.some(i => i.row === 6)).toBe(true);
    });
});

describe('del cuadro al cuadro de financiación', () => {
    it('toma el pendiente al cierre y las cuotas futuras', () => {
        const rows = frenchTable();
        const item = loanToDebtItem(loanOf(rows), 2025, verifyAmortization(loanOf(rows)), 'prestamo.pdf');
        expect(item.outstanding).toBeCloseTo(rows[11].balance, 2);
        expect(item.schedule).toHaveLength(12);
        expect(item.monthlyPayment).toBeCloseTo(rows[12].payment, 2);
        expect(item.maturity).toBe('2026-12');
        expect(item.source).toMatchObject({ verified: true, rows: 24, issues: 0 });
    });

    it('el calendario de deuda usa las cuotas reales del cuadro', () => {
        const ds = sampleDataset();
        const rows = frenchTable(24_000, 6, 24, [2025, 1]).map(r => ({ ...r, date: r.date.replace(/^2025/, String(ds.years[0].year)).replace(/^2026/, String(ds.years[0].year + 1)) }));
        const item = loanToDebtItem({ ...loanOf(rows), maturity: `${ds.years[0].year + 1}-12` }, ds.years[0].year, null, 'x.pdf');
        ds.debts = [item];
        const plan = analyze(ds).debtPlan!;
        const sumP = item.schedule!.reduce((a, r) => a + r.principal, 0);
        expect(plan.schedule[0].principal).toBeCloseTo(sumP, 2);
        expect(plan.schedule[1].principal).toBe(0);
    });
});

describe('cuentas leídas', () => {
    const raw = {
        company: { name: 'ACME, S.L.', cif: 'B12345678' },
        years: [
            { year: 2025, primary: true, values: { efectivo: 100, capital: 60, resultadoEjercicio: 40, ventas: 500, aprovisionamientos: -460, inventada: 5 } },
            { year: '2024', primary: false, values: { efectivo: '90', capital: 60, resultadoEjercicio: 30, ventas: 400, aprovisionamientos: -370 } },
        ],
        loans: [{ type: 'leasing', lender: 'Banco', rows: [{ date: '05/01/2026', payment: 10, interest: 1, principal: 9, balance: 91 }] }],
    };
    const ex = normalizeExtraction('cuentas.pdf', raw);

    it('normaliza la respuesta y descarta partidas desconocidas', () => {
        expect(ex.years).toHaveLength(2);
        expect(ex.years[0].values).not.toHaveProperty('inventada');
        expect(ex.years[1].values.efectivo).toBe(90);
        expect(ex.loans[0].rows[0].date).toBe('2026-01-05');
    });

    it('comprueba el cuadre', () => {
        expect(checkAccounts(ex.years)).toEqual([]);
        const bad = normalizeExtraction('x', { years: [{ year: 2025, values: { efectivo: 100, capital: 50, ventas: 10 } }] });
        expect(checkAccounts(bad.years).length).toBeGreaterThan(0);
    });

    it('fusiona con un cliente nuevo', () => {
        const res = mergeExtractions(emptyDataset(), [ex], new Map(), true);
        expect(res.data.company.name).toBe('ACME, S.L.');
        expect(res.data.years.map(y => y.year)).toEqual([2025, 2024]);
        expect(res.data.years[0].values.ventas).toBe(500);
        expect(res.debtsAdded).toBe(1);
        expect(res.data.debts[0].outstanding).toBe(100); // 91 + 9 pendiente al cierre de 2025
    });
});
