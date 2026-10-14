import { defaultCompany, emptyYear, newDebtItem, type DebtItem, type FinancialDataset } from './schema';

const debt = (d: Partial<DebtItem>): DebtItem => ({ ...newDebtItem(), ...d });

/** Empresa ficticia de distribución para probar la herramienta. */
export const sampleDataset = (): FinancialDataset => {
    const last = new Date().getFullYear() - 1;
    const ym = (yearsAhead: number, month: number) => `${last + yearsAhead}-${String(month).padStart(2, '0')}`;
    return {
        version: 2,
        company: {
            ...defaultCompany(),
            name: 'Distribuciones Ejemplo, S.L.',
            cif: 'B00000000',
            sector: 'comercio',
            legalForm: 'SL',
            variableOtherOpexPct: 30,
            agreedCollectionDays: 45,
            agreedPaymentDays: 60,
            notes: 'Ampliación de almacén financiada en parte con póliza de crédito.',
        },
        years: [
            {
                year: last,
                employees: 22,
                values: {
                    ...emptyYear(),
                    inmIntangible: 35000, inmMaterial: 1035000, invFinLP: 30000,
                    existencias: 610000, clientes: 800000, otrosDeudores: 45000, periodifActivo: 5000, efectivo: 40000,
                    capital: 60000, reservas: 696500, resultadoEjercicio: 19500,
                    deudaBancariaLP: 600000, leasingLP: 45000,
                    deudaBancariaCP: 520000, leasingCP: 20000, proveedores: 480000, otrosAcreedores: 159000,
                    ventas: 4500000, aprovisionamientos: -3240000, otrosIngresosExpl: 25000, personal: -700000,
                    otrosGastosExpl: -360000, amortizacion: -110000, deterioroInmov: -5000,
                    ingresosFin: 1000, gastosFin: -85000, impuesto: -6500,
                },
            },
            {
                year: last - 1,
                employees: 20,
                values: {
                    ...emptyYear(),
                    inmIntangible: 40000, inmMaterial: 900000, invFinLP: 30000,
                    existencias: 480000, clientes: 620000, otrosDeudores: 40000, periodifActivo: 5000, efectivo: 150000,
                    capital: 60000, reservas: 640000, resultadoEjercicio: 136500,
                    deudaBancariaLP: 520000, leasingLP: 60000,
                    deudaBancariaCP: 280000, leasingCP: 20000, proveedores: 420000, otrosAcreedores: 128500,
                    ventas: 4200000, aprovisionamientos: -2940000, otrosIngresosExpl: 20000, personal: -620000,
                    otrosGastosExpl: -330000, amortizacion: -90000,
                    ingresosFin: 2000, gastosFin: -60000, impuesto: -45500,
                },
            },
            {
                year: last - 2,
                employees: 19,
                values: {
                    ...emptyYear(),
                    inmIntangible: 45000, inmMaterial: 865000, invFinLP: 30000,
                    existencias: 430000, clientes: 520000, otrosDeudores: 35000, periodifActivo: 5000, efectivo: 210000,
                    capital: 60000, reservas: 563750, resultadoEjercicio: 146250,
                    deudaBancariaLP: 560000, leasingLP: 75000,
                    deudaBancariaCP: 200000, leasingCP: 18000, proveedores: 390000, otrosAcreedores: 127000,
                    ventas: 3900000, aprovisionamientos: -2691000, otrosIngresosExpl: 15000, personal: -580000,
                    otrosGastosExpl: -310000, amortizacion: -85000,
                    ingresosFin: 1000, gastosFin: -55000, impuesto: -48750,
                },
            },
        ],
        debts: [
            debt({ type: 'prestamo', lender: 'Banco A', description: 'Préstamo ICO ampliación almacén', outstanding: 380000, rate: 4.2, monthlyPayment: 7050, maturity: ym(5, 12), guarantee: 'ICO 70 % + aval personal socios' }),
            debt({ type: 'prestamo', lender: 'Banco B', description: 'Préstamo circulante', outstanding: 260000, rate: 6.9, monthlyPayment: 6200, maturity: ym(4, 10), guarantee: 'Aval personal socios' }),
            debt({ type: 'poliza', lender: 'Banco A', description: 'Póliza de crédito', outstanding: 260000, limit: 300000, rate: 5.5, maturity: ym(1, 5), guarantee: 'Personal' }),
            debt({ type: 'poliza', lender: 'Banco C', description: 'Póliza de crédito', outstanding: 220000, limit: 300000, rate: 5.25, maturity: ym(2, 2) }),
            debt({ type: 'leasing', lender: 'Banco B', description: 'Leasing furgonetas de reparto', outstanding: 65000, rate: 5, monthlyPayment: 1750, maturity: ym(4, 6) }),
            debt({ type: 'renting', lender: 'Renting Car', description: 'Renting vehículos comerciales', monthlyPayment: 2400, maturity: ym(3, 3) }),
            debt({ type: 'renting', lender: 'Tech Renting', description: 'Equipos informáticos', monthlyPayment: 650, maturity: ym(2, 9) }),
        ],
    };
};
