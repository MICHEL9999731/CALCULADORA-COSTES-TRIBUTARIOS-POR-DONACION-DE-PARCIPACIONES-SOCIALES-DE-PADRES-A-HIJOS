import { defaultCompany, emptyYear, type FinancialDataset } from './schema';

/** Empresa ficticia de distribución para probar la herramienta. */
export const sampleDataset = (): FinancialDataset => ({
    version: 1,
    company: {
        ...defaultCompany(),
        name: 'Distribuciones Ejemplo, S.L.',
        cif: 'B00000000',
        sector: 'comercio',
        legalForm: 'SL',
        yearN: new Date().getFullYear() - 1,
        employeesN: 22,
        employeesN1: 20,
        variableOtherOpexPct: 30,
        creditLinesLimit: 80000,
        agreedCollectionDays: 45,
        agreedPaymentDays: 60,
        notes: 'Ampliación de almacén financiada en parte con póliza de crédito.',
    },
    yearN: {
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
    yearN1: {
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
});
