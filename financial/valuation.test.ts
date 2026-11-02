import { describe, expect, it } from 'vitest';
import { annuity, defaultValuationInputs, valueCompany } from './valuation';
import { sampleDataset } from './sampleData';
import { emptyDataset, migrateDataset } from './schema';

describe('valueCompany (empresa de ejemplo)', () => {
    const ds = sampleDataset();
    const val = valueCompany(ds);
    const m = (id: string) => val.methods.find(x => x.id === id)!;

    it('el valor contable es el patrimonio neto', () => {
        expect(m('contable').equity).toBe(val.analysis.n.pn);
    });

    it('calcula todos los métodos en una empresa con beneficios', () => {
        expect(val.profile).toBe('operativa');
        for (const id of ['dcf', 'evEbitda', 'per', 'capitalizacion', 'uec', 'indirecto', 'anglosajon']) {
            expect(m(id).applicable).toBe(true);
        }
        expect(val.dcf!.years).toHaveLength(5);
        const weights = val.methods.reduce((s, x) => s + x.weight, 0);
        expect(weights).toBeCloseTo(1, 6);
        expect(val.conclusion.value).not.toBeNull();
        expect(val.conclusion.low!).toBeLessThanOrEqual(val.conclusion.value!);
        expect(val.conclusion.high!).toBeGreaterThanOrEqual(val.conclusion.value!);
    });

    it('el múltiplo VE/EBITDA resta la deuda neta', () => {
        const x = m('evEbitda');
        expect(x.equity).toBeCloseTo(x.ev! - val.bridge.dfn - val.bridge.provisions + val.bridge.nonOperating, 6);
        expect(x.ev).toBeCloseTo(val.normalized.ebitda * val.assumptions.evEbitda, 6);
    });

    it('WACC coherente con CAPM', () => {
        const w = val.wacc;
        expect(w.ke).toBeCloseTo(w.riskFree + w.betaL * w.erp + w.sizePremium + w.specificPremium, 10);
        expect(w.wacc).toBeLessThan(w.ke);
        // a mayor WACC, menor valor
        const s = val.dcf!.sensitivity;
        const row = s.values[2];
        expect(row[0]!).toBeGreaterThan(row[4]!);
    });

    it('valores fiscales: IRPF = máx(valor teórico, beneficios medios capitalizados al 20 %)', () => {
        const f = val.fiscal;
        const avg = f.profitsUsed.reduce((s, p) => s + p.value, 0) / f.profitsUsed.length;
        expect(f.capitalization20).toBeCloseTo(avg * 5, 6);
        expect(f.irpfMinimum).toBe(Math.max(f.bookValue, f.capitalization20!));
        expect(f.wealthTax).toBe(Math.max(f.nominal, f.bookValue, f.capitalization20!));
    });

    it('respeta las hipótesis del usuario y el porcentaje transmitido', () => {
        const ds2 = { ...ds, valuation: { ...defaultValuationInputs(), overrides: { evEbitda: 8, stakePct: 50, shares: 1000 } } };
        const v2 = valueCompany(ds2);
        expect(v2.assumptions.evEbitda).toBe(8);
        expect(v2.conclusion.stakeValue).toBeCloseTo(v2.conclusion.value! / 2, 6);
        expect(v2.conclusion.perShare).toBeCloseTo(v2.conclusion.value! / 1000, 6);
    });

    it('las plusvalías latentes aumentan el valor ajustado netas de impuesto', () => {
        const v2 = valueCompany({ ...ds, valuation: { ...defaultValuationInputs(), overrides: { latentGains: 100_000 } } });
        expect(v2.adjustedBookValue - val.adjustedBookValue).toBeCloseTo(75_000, 6);
    });

    it('las ponderaciones del usuario sustituyen a las automáticas', () => {
        const v2 = valueCompany({ ...ds, valuation: { ...defaultValuationInputs(), weights: { contable: 1 } } });
        expect(v2.conclusion.value).toBe(v2.analysis.n.pn);
    });
});

describe('perfiles', () => {
    it('una empresa en pérdidas se valora por métodos patrimoniales', () => {
        const ds = emptyDataset();
        Object.assign(ds.years[0].values, { capital: 100_000, reservas: 50_000, resultadoEjercicio: -20_000, efectivo: 130_000, ventas: 200_000, personal: -220_000 });
        Object.assign(ds.years[1].values, { capital: 100_000, reservas: 50_000, efectivo: 150_000, ventas: 210_000, personal: -210_000 });
        const v = valueCompany(ds);
        expect(v.profile).toBe('perdidas');
        expect(v.methods.find(m => m.id === 'dcf')!.weight).toBe(0);
        expect(v.methods.find(m => m.id === 'ajustado')!.weight).toBeCloseTo(0.6, 6);
    });
});

describe('utilidades', () => {
    it('renta unitaria', () => {
        expect(annuity(0.1, 5)).toBeCloseTo(3.7908, 4);
        expect(annuity(0, 5)).toBe(5);
    });
    it('guarda y recupera las hipótesis con el cliente', () => {
        const ds = { ...sampleDataset(), valuation: { ...defaultValuationInputs(), overrides: { per: 12 }, audited: true } };
        const back = migrateDataset(JSON.parse(JSON.stringify(ds)));
        expect(back.valuation?.overrides.per).toBe(12);
        expect(back.valuation?.audited).toBe(true);
    });
});
