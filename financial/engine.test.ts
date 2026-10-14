import { describe, expect, it } from 'vitest';
import { analyze, simulate, NO_LEVERS } from './engine';
import { sampleDataset } from './sampleData';
import { parseImport, parseDebts, buildTemplateCsv } from './importer';
import { parseAmount } from './format';
import { emptyDataset, migrateDataset } from './schema';

describe('analyze (empresa de ejemplo)', () => {
    const a = analyze(sampleDataset());

    it('cuadra balances y resultado', () => {
        expect(a.n.activo).toBe(2_600_000);
        expect(a.n.pnYPasivo).toBe(2_600_000);
        expect(a.n1.activo).toBe(2_265_000);
        expect(a.n.resultado).toBe(19_500);
        expect(a.n1.resultado).toBe(136_500);
        expect(a.checks.filter(c => c.severity === 'critical')).toHaveLength(0);
    });

    it('calcula EBITDA, DFN, NOF y fondo de maniobra', () => {
        expect(a.n.ebitda).toBe(225_000);
        expect(a.n.ebit).toBe(110_000);
        expect(a.n.dfn).toBe(1_145_000);
        expect(a.n.fm).toBe(321_000);
        expect(a.n.nof).toBe(821_000);
    });

    it('el estado de flujos concilia con la variación de tesorería', () => {
        expect(a.cashFlow.actualCashChange).toBe(-110_000);
        expect(Math.abs(a.cashFlow.unreconciled)).toBeLessThan(0.01);
        expect(a.cashFlow.capex).toBe(245_000);
        expect(a.cashFlow.dividendsEstimate).toBe(80_000);
    });

    it('detecta el sobreendeudamiento y propone actuaciones', () => {
        const lev = a.ratios.find(r => r.id === 'dfnEbitda')!;
        expect(lev.n).toBeCloseTo(5.09, 2);
        expect(lev.status).toBe('bad');
        expect(a.recommendations.some(r => r.title.includes('desapalancamiento'))).toBe(true);
        expect(a.recommendations.some(r => r.title.includes('periodo de cobro'))).toBe(true);
        expect(a.summary.length).toBeGreaterThan(2);
        expect(a.score).toBeGreaterThan(0);
    });

    it('el simulador sin cambios no altera nada', () => {
        const s = simulate(a, NO_LEVERS);
        expect(s.deltaEbitda).toBeCloseTo(0, 6);
        expect(s.deltaWorkingCapital).toBeCloseTo(0, 6);
    });

    it('cobrar 10 días antes libera caja', () => {
        const s = simulate(a, { ...NO_LEVERS, collectionDaysDelta: -10 });
        expect(s.cashImpact).toBeCloseTo((4_500_000 * 1.21 / 365) * 10, 0);
    });
});

describe('comprobaciones mercantiles', () => {
    it('avisa de causa de disolución si el PN < 50 % del capital', () => {
        const ds = emptyDataset();
        Object.assign(ds.years[0].values, { capital: 100_000, rdosAnteriores: -70_000, efectivo: 30_000 });
        const a = analyze(ds);
        expect(a.checks.some(c => c.title.includes('disolución'))).toBe(true);
    });

    it('no falla con datos vacíos', () => {
        expect(() => analyze(emptyDataset())).not.toThrow();
    });
});

describe('importador', () => {
    it('lee importes en formato español', () => {
        expect(parseAmount('1.234.567,89')).toBeCloseTo(1234567.89);
        expect(parseAmount('(1.234)')).toBe(-1234);
        expect(parseAmount('-2.500 €')).toBe(-2500);
        expect(parseAmount('1234.5')).toBe(1234.5);
    });

    it('reimporta la plantilla CSV', () => {
        const ds = sampleDataset();
        const res = parseImport(buildTemplateCsv(ds.years));
        expect(res.years).toEqual(ds.years.map(y => y.year));
        expect(res.columns[0].ventas).toBe(4_500_000);
        expect(res.columns[1].otrosAcreedores).toBe(128_500);
        expect(res.columns[2].reservas).toBe(563_750);
    });

    it('interpreta un balance pegado de las cuentas anuales', () => {
        const text = [
            'A) ACTIVO NO CORRIENTE\t\t1.100.000\t970.000',
            'II. Inmovilizado material\t5\t1.035.000\t900.000',
            'B) ACTIVO CORRIENTE\t\t1.500.000\t1.295.000',
            'III. Deudores comerciales y otras cuentas a cobrar\t\t845.000\t660.000',
            '1. Clientes por ventas y prestaciones de servicios\t\t800.000\t620.000',
            '3. Deudores varios\t\t45.000\t40.000',
            'B) PASIVO NO CORRIENTE\t\t645.000\t580.000',
            '2. Deudas con entidades de crédito\t\t600.000\t520.000',
            'C) PASIVO CORRIENTE\t\t1.179.000\t848.500',
            '2. Deudas con entidades de crédito\t\t520.000\t280.000',
            'CUENTA DE PÉRDIDAS Y GANANCIAS',
            '1. Importe neto de la cifra de negocios\t\t4.500.000,00\t4.200.000,00',
            '4. Aprovisionamientos\t\t(3.240.000)\t(2.940.000)',
        ].join('\n');
        const res = parseImport(text);
        expect(res.columns[0].inmMaterial).toBe(1_035_000);
        expect(res.columns[0].clientes).toBe(800_000);
        expect(res.columns[0].otrosDeudores).toBe(45_000);
        expect(res.columns[0].deudaBancariaLP).toBe(600_000);
        expect(res.columns[0].deudaBancariaCP).toBe(520_000);
        expect(res.columns[1].deudaBancariaCP).toBe(280_000);
        expect(res.columns[0].ventas).toBe(4_500_000);
        expect(res.columns[0].aprovisionamientos).toBe(-3_240_000);
    });
});

describe('histórico de varios ejercicios', () => {
    const a = analyze(sampleDataset());

    it('calcula los tres ejercicios y concilia cada estado de flujos', () => {
        expect(a.history).toHaveLength(3);
        expect(a.history[2].cashFlow).toBeNull();
        for (const h of a.history.slice(0, 2)) expect(Math.abs(h.cashFlow!.unreconciled)).toBeLessThan(0.01);
        expect(a.history[1].fig.resultado).toBe(136_500);
        expect(a.history[2].fig.resultado).toBe(146_250);
    });

    it('calcula el crecimiento medio anual', () => {
        expect(a.trends.periods).toBe(2);
        expect(a.trends.cagrVentas).toBeCloseTo(Math.sqrt(4_500_000 / 3_900_000) - 1, 6);
        expect(a.findings.some(f => f.area === 'Evolución')).toBe(true);
    });
});

describe('cuadro de financiación', () => {
    const ds = sampleDataset();
    const a = analyze(ds);
    const plan = a.debtPlan!;

    it('cuadra con la deuda del balance', () => {
        expect(plan.reconciliation.detailedDebt).toBe(1_185_000);
        expect(plan.reconciliation.diff).toBe(0);
        expect(plan.warnings).toHaveLength(0);
    });

    it('calcula pólizas, renting y coste medio', () => {
        expect(plan.creditLimit).toBe(600_000);
        expect(plan.creditAvailable).toBe(120_000);
        expect(plan.rentingAnnual).toBe((2400 + 650) * 12);
        expect(plan.weightedRate).toBeGreaterThan(4);
        expect(plan.expensiveLines[0].line.item.lender).toBe('Banco B');
        expect(plan.creditMaturing12m).toHaveLength(1);
        expect(a.debt.source).toBe('detalle');
        expect(a.debt.availableCreditLines).toBe(120_000);
    });

    it('amortiza los préstamos según su cuota', () => {
        const ico = plan.lines.find(l => l.item.description.includes('ICO'))!;
        const total = ico.principalByYear.reduce((x, y) => x + y, 0);
        expect(total).toBeCloseTo(380_000, 0);
        // primer año: 12 cuotas menos intereses
        expect(ico.principalByYear[0] + ico.interestByYear[0]).toBeCloseTo(7050 * 12, 0);
    });

    it('lee el cuadro pegado desde Excel', () => {
        const items = parseDebts('Tipo;Entidad;Descripción;Pendiente;Límite;Tipo;Cuota;Vencimiento;Carencia;Garantía\nLeasing;Banco Z;Carretilla;"12.500,00";;4,75 %;450;06/2028;;\nPóliza de crédito;Banco Y;;50000;100000;5;;2026-03;;Personal');
        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({ type: 'leasing', outstanding: 12_500, rate: 4.75, monthlyPayment: 450, maturity: '2028-06' });
        expect(items[1]).toMatchObject({ type: 'poliza', limit: 100_000, maturity: '2026-03' });
    });
});

describe('compatibilidad', () => {
    it('migra clientes guardados con la versión de dos ejercicios', () => {
        const old = { version: 1, company: { name: 'X', yearN: 2024, employeesN: 5, employeesN1: 4, sector: 'comercio' }, yearN: { ventas: 100 }, yearN1: { ventas: 90 } };
        const ds = migrateDataset(old);
        expect(ds.years.map(y => y.year)).toEqual([2024, 2023]);
        expect(ds.years[0].values.ventas).toBe(100);
        expect(ds.years[1].employees).toBe(4);
        expect(ds.company.sector).toBe('comercio');
        expect(ds.debts).toEqual([]);
    });

    it('importa varias columnas ignorando la columna de notas', () => {
        const text = 'PASIVO CORRIENTE\tNotas\t2025\t2024\t2023\n2. Deudas con entidades de crédito\t9\t520.000\t280.000\t200.000\nProveedores\t9\t480.000\t\t390.000';
        const res = parseImport(text);
        expect(res.years).toEqual([2025, 2024, 2023]);
        expect(res.columns[2].deudaBancariaCP).toBe(200_000);
        expect(res.columns[1].proveedores).toBeUndefined();
        expect(res.columns[2].proveedores).toBe(390_000);
    });
});
