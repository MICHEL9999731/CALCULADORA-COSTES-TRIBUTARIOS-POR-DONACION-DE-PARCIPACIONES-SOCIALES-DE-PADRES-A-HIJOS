// Partidas del balance y de la cuenta de pérdidas y ganancias según el
// Plan General de Contabilidad (modelo normal / abreviado), agrupadas para el análisis.

export type BalanceSection =
    | 'anc'   // Activo no corriente
    | 'ac'    // Activo corriente
    | 'pn'    // Patrimonio neto
    | 'pnc'   // Pasivo no corriente
    | 'pc';   // Pasivo corriente

export interface LineDef {
    id: string;
    label: string;
    /** Ayuda breve que se muestra en el formulario. */
    hint?: string;
}

export interface BalanceLineDef extends LineDef {
    section: BalanceSection;
    /** Partida que resta dentro de su masa (p. ej. acciones propias): se introduce en positivo o negativo y se trata siempre como negativa. */
    negative?: boolean;
}

export type PygNature =
    | 'income'   // Ingreso: siempre positivo
    | 'expense'  // Gasto: siempre negativo (se normaliza si se introduce en positivo)
    | 'signed';  // Puede ser positivo o negativo: se respeta el signo introducido

export type PygBlock = 'explotacion' | 'financiero' | 'impuesto';

export interface PygLineDef extends LineDef {
    nature: PygNature;
    block: PygBlock;
}

export const BALANCE_SECTIONS: { id: BalanceSection; label: string }[] = [
    { id: 'anc', label: 'A) Activo no corriente' },
    { id: 'ac', label: 'B) Activo corriente' },
    { id: 'pn', label: 'A) Patrimonio neto' },
    { id: 'pnc', label: 'B) Pasivo no corriente' },
    { id: 'pc', label: 'C) Pasivo corriente' },
];

export const BALANCE_LINES: BalanceLineDef[] = [
    // Activo no corriente
    { id: 'inmIntangible', section: 'anc', label: 'Inmovilizado intangible' },
    { id: 'inmMaterial', section: 'anc', label: 'Inmovilizado material' },
    { id: 'invInmobiliarias', section: 'anc', label: 'Inversiones inmobiliarias' },
    { id: 'invGrupoLP', section: 'anc', label: 'Inversiones en empresas del grupo y asociadas a LP' },
    { id: 'invFinLP', section: 'anc', label: 'Inversiones financieras a largo plazo' },
    { id: 'aid', section: 'anc', label: 'Activos por impuesto diferido' },
    { id: 'otrosANC', section: 'anc', label: 'Otros activos no corrientes', hint: 'Deudores comerciales no corrientes y resto.' },

    // Activo corriente
    { id: 'ancVenta', section: 'ac', label: 'Activos no corrientes mantenidos para la venta' },
    { id: 'existencias', section: 'ac', label: 'Existencias' },
    { id: 'clientes', section: 'ac', label: 'Clientes por ventas y prestaciones de servicios' },
    { id: 'otrosDeudores', section: 'ac', label: 'Otros deudores', hint: 'Deudores varios, personal, HP deudora, accionistas por desembolsos exigidos…' },
    { id: 'invGrupoCP', section: 'ac', label: 'Inversiones en empresas del grupo y asociadas a CP' },
    { id: 'invFinCP', section: 'ac', label: 'Inversiones financieras a corto plazo' },
    { id: 'periodifActivo', section: 'ac', label: 'Periodificaciones a corto plazo (activo)' },
    { id: 'efectivo', section: 'ac', label: 'Efectivo y otros activos líquidos equivalentes' },

    // Patrimonio neto
    { id: 'capital', section: 'pn', label: 'Capital escriturado', hint: 'Si hay capital no exigido, introduzca el capital neto.' },
    { id: 'prima', section: 'pn', label: 'Prima de emisión / asunción' },
    { id: 'reservas', section: 'pn', label: 'Reservas', hint: 'Legal, estatutarias, voluntarias, de capitalización…' },
    { id: 'accionesPropias', section: 'pn', label: '(Acciones y participaciones propias)', negative: true },
    { id: 'rdosAnteriores', section: 'pn', label: 'Resultados de ejercicios anteriores', hint: 'Remanente (+) o resultados negativos (−).' },
    { id: 'aportacionesSocios', section: 'pn', label: 'Otras aportaciones de socios' },
    { id: 'resultadoEjercicio', section: 'pn', label: 'Resultado del ejercicio' },
    { id: 'dividendoCuenta', section: 'pn', label: '(Dividendo a cuenta)', negative: true },
    { id: 'ajustesValor', section: 'pn', label: 'Ajustes por cambios de valor' },
    { id: 'subvenciones', section: 'pn', label: 'Subvenciones, donaciones y legados recibidos' },

    // Pasivo no corriente
    { id: 'provisionesLP', section: 'pnc', label: 'Provisiones a largo plazo' },
    { id: 'deudaBancariaLP', section: 'pnc', label: 'Deudas con entidades de crédito a LP' },
    { id: 'leasingLP', section: 'pnc', label: 'Acreedores por arrendamiento financiero a LP' },
    { id: 'otrasDeudasLP', section: 'pnc', label: 'Otras deudas a largo plazo', hint: 'Préstamos de terceros, socios, proveedores de inmovilizado…' },
    { id: 'deudaGrupoLP', section: 'pnc', label: 'Deudas con empresas del grupo y asociadas a LP' },
    { id: 'pid', section: 'pnc', label: 'Pasivos por impuesto diferido' },
    { id: 'periodifPasivoLP', section: 'pnc', label: 'Periodificaciones a largo plazo' },

    // Pasivo corriente
    { id: 'pasivosVenta', section: 'pc', label: 'Pasivos vinculados con activos mantenidos para la venta' },
    { id: 'provisionesCP', section: 'pc', label: 'Provisiones a corto plazo' },
    { id: 'deudaBancariaCP', section: 'pc', label: 'Deudas con entidades de crédito a CP', hint: 'Incluye pólizas de crédito, descuento y vencimientos a CP de préstamos.' },
    { id: 'leasingCP', section: 'pc', label: 'Acreedores por arrendamiento financiero a CP' },
    { id: 'otrasDeudasCP', section: 'pc', label: 'Otras deudas a corto plazo' },
    { id: 'deudaGrupoCP', section: 'pc', label: 'Deudas con empresas del grupo y asociadas a CP' },
    { id: 'proveedores', section: 'pc', label: 'Proveedores' },
    { id: 'otrosAcreedores', section: 'pc', label: 'Otros acreedores', hint: 'Acreedores varios, remuneraciones pendientes, HP y Seguridad Social acreedoras, anticipos de clientes…' },
    { id: 'periodifPasivoCP', section: 'pc', label: 'Periodificaciones a corto plazo (pasivo)' },
];

export const PYG_LINES: PygLineDef[] = [
    { id: 'ventas', nature: 'income', block: 'explotacion', label: '1. Importe neto de la cifra de negocios' },
    { id: 'varExistencias', nature: 'signed', block: 'explotacion', label: '2. Variación de existencias de productos terminados y en curso' },
    { id: 'trabajosActivo', nature: 'income', block: 'explotacion', label: '3. Trabajos realizados por la empresa para su activo' },
    { id: 'aprovisionamientos', nature: 'expense', block: 'explotacion', label: '4. Aprovisionamientos' },
    { id: 'otrosIngresosExpl', nature: 'income', block: 'explotacion', label: '5. Otros ingresos de explotación' },
    { id: 'personal', nature: 'expense', block: 'explotacion', label: '6. Gastos de personal' },
    { id: 'otrosGastosExpl', nature: 'expense', block: 'explotacion', label: '7. Otros gastos de explotación' },
    { id: 'amortizacion', nature: 'expense', block: 'explotacion', label: '8. Amortización del inmovilizado' },
    { id: 'imputacionSubv', nature: 'income', block: 'explotacion', label: '9. Imputación de subvenciones de inmovilizado no financiero' },
    { id: 'excesoProvisiones', nature: 'income', block: 'explotacion', label: '10. Excesos de provisiones' },
    { id: 'deterioroInmov', nature: 'signed', block: 'explotacion', label: '11. Deterioro y resultado por enajenaciones del inmovilizado' },
    { id: 'otrosResultados', nature: 'signed', block: 'explotacion', label: '12-13. Otros resultados', hint: 'Ingresos y gastos excepcionales.' },

    { id: 'ingresosFin', nature: 'income', block: 'financiero', label: '14. Ingresos financieros' },
    { id: 'gastosFin', nature: 'expense', block: 'financiero', label: '15. Gastos financieros' },
    { id: 'otrosFin', nature: 'signed', block: 'financiero', label: '16-19. Otros resultados financieros', hint: 'Valor razonable, diferencias de cambio, deterioro y enajenación de instrumentos financieros.' },

    { id: 'impuesto', nature: 'signed', block: 'impuesto', label: '20. Impuesto sobre beneficios', hint: 'Normalmente negativo (gasto). Positivo solo si es un ingreso por impuesto.' },
];

export const ALL_LINE_IDS = [...BALANCE_LINES.map(l => l.id), ...PYG_LINES.map(l => l.id)];

export type Sector = 'industria' | 'comercio' | 'servicios' | 'construccion' | 'hosteleria' | 'agricultura' | 'tecnologia';

export const SECTORS: { id: Sector; label: string }[] = [
    { id: 'industria', label: 'Industria / fabricación' },
    { id: 'comercio', label: 'Comercio (mayorista o minorista)' },
    { id: 'servicios', label: 'Servicios profesionales / empresariales' },
    { id: 'construccion', label: 'Construcción / promoción inmobiliaria' },
    { id: 'hosteleria', label: 'Hostelería y restauración' },
    { id: 'agricultura', label: 'Agricultura, ganadería y alimentación' },
    { id: 'tecnologia', label: 'Tecnología / software' },
];

export type LegalForm = 'SL' | 'SA' | 'otra';

/** Valores de un ejercicio: id de partida -> importe en euros. */
export type YearValues = Record<string, number>;

export interface CompanyInfo {
    name: string;
    cif: string;
    sector: Sector;
    legalForm: LegalForm;
    /** Tipo medio de IVA aplicado en ventas y compras (en %), para calcular los periodos de cobro y pago. */
    vatRate: number;
    /** % de los gastos de personal que se considera variable (para el punto muerto). */
    variablePersonalPct: number;
    /** % de otros gastos de explotación que se considera variable (transportes, comisiones, suministros…). */
    variableOtherOpexPct: number;
    /** Objetivo de deuda financiera neta / EBITDA que el banco o la propiedad aceptaría. */
    targetLeverage: number;
    /** Plazo medio de cobro pactado con clientes (días), si se conoce. */
    agreedCollectionDays: number | null;
    /** Plazo medio de pago pactado con proveedores (días), si se conoce. */
    agreedPaymentDays: number | null;
    /** Importe no dispuesto de pólizas de crédito y líneas de circulante al cierre (liquidez adicional disponible). Si se detallan las pólizas en el cuadro de financiación se calcula desde allí. */
    creditLinesLimit: number | null;
    /** Cuota anual de amortización de principal prevista para N+1. Si se detallan los préstamos se calcula desde allí; si no, se usa la deuda bancaria a CP. */
    nextYearDebtService: number | null;
    /** Comentarios cualitativos del cliente: hechos relevantes, objetivos, previsiones… */
    notes: string;
}

/** Un ejercicio cerrado: año, plantilla media e importes de balance y PyG. */
export interface YearData {
    year: number;
    employees: number | null;
    values: YearValues;
}

export type DebtType = 'prestamo' | 'hipoteca' | 'leasing' | 'renting' | 'poliza' | 'descuento' | 'socios' | 'aplazamiento' | 'otro';

export const DEBT_TYPES: { id: DebtType; label: string; hint: string }[] = [
    { id: 'prestamo', label: 'Préstamo', hint: 'Préstamo bancario personal o ICO.' },
    { id: 'hipoteca', label: 'Préstamo hipotecario', hint: '' },
    { id: 'leasing', label: 'Leasing', hint: 'Arrendamiento financiero (figura en balance).' },
    { id: 'renting', label: 'Renting / arrendamiento operativo', hint: 'No figura en balance: la cuota es gasto. Incluya también alquileres con permanencia.' },
    { id: 'poliza', label: 'Póliza de crédito', hint: 'Indique el límite y el dispuesto al cierre.' },
    { id: 'descuento', label: 'Línea de descuento / factoring / confirming', hint: 'Indique el límite y el dispuesto al cierre.' },
    { id: 'socios', label: 'Préstamo de socios', hint: '' },
    { id: 'aplazamiento', label: 'Aplazamiento Hacienda / Seguridad Social', hint: '' },
    { id: 'otro', label: 'Otra financiación', hint: '' },
];

/** Una operación de financiación o compromiso de pago vigente al cierre del último ejercicio. */
export interface DebtItem {
    id: string;
    type: DebtType;
    lender: string;
    description: string;
    /** Capital pendiente (o dispuesto, en pólizas) al cierre del último ejercicio. En renting puede dejarse a 0. */
    outstanding: number;
    /** Límite concedido (pólizas y líneas de circulante). */
    limit: number | null;
    /** Tipo de interés nominal anual en %. */
    rate: number | null;
    /** Cuota mensual (capital + intereses; en renting, cuota sin IVA). */
    monthlyPayment: number | null;
    /** Fecha de vencimiento final o de renovación, "AAAA-MM". */
    maturity: string;
    /** Fin de la carencia de capital, "AAAA-MM" (opcional). */
    graceUntil: string;
    /** Garantías: personal de los socios, hipotecaria, ICO, pignoración… */
    guarantee: string;
}

export const MAX_YEARS = 5;

export interface FinancialDataset {
    version: 2;
    company: CompanyInfo;
    /** Ejercicios ordenados del más reciente al más antiguo (mínimo 2, máximo 5). */
    years: YearData[];
    debts: DebtItem[];
}

export const emptyYear = (): YearValues =>
    Object.fromEntries(ALL_LINE_IDS.map(id => [id, 0]));

export const emptyYearData = (year: number): YearData => ({ year, employees: null, values: emptyYear() });

export const defaultCompany = (): CompanyInfo => ({
    name: '',
    cif: '',
    sector: 'servicios',
    legalForm: 'SL',
    vatRate: 21,
    variablePersonalPct: 0,
    variableOtherOpexPct: 25,
    targetLeverage: 3,
    agreedCollectionDays: null,
    agreedPaymentDays: null,
    creditLinesLimit: null,
    nextYearDebtService: null,
    notes: '',
});

export const emptyDataset = (): FinancialDataset => {
    const last = new Date().getFullYear() - 1;
    return { version: 2, company: defaultCompany(), years: [emptyYearData(last), emptyYearData(last - 1)], debts: [] };
};

export const newDebtItem = (): DebtItem => ({
    id: Math.random().toString(36).slice(2, 10),
    type: 'prestamo', lender: '', description: '', outstanding: 0, limit: null, rate: null,
    monthlyPayment: null, maturity: '', graceUntil: '', guarantee: '',
});

/** Convierte cualquier dataset guardado (incluida la versión 1, de dos ejercicios) al formato actual. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const migrateDataset = (raw: any): FinancialDataset => {
    const base = emptyDataset();
    if (!raw || typeof raw !== 'object') return base;
    const company: CompanyInfo = { ...base.company };
    for (const k of Object.keys(company) as (keyof CompanyInfo)[]) {
        if (raw.company && k in raw.company) (company as unknown as Record<string, unknown>)[k] = raw.company[k];
    }
    let years: YearData[];
    if (Array.isArray(raw.years) && raw.years.length) {
        years = raw.years.slice(0, MAX_YEARS).map((y: Partial<YearData>, i: number) => ({
            year: typeof y.year === 'number' ? y.year : base.years[0].year - i,
            employees: typeof y.employees === 'number' ? y.employees : null,
            values: { ...emptyYear(), ...(y.values ?? {}) },
        }));
    } else {
        const yearN: number = raw.company?.yearN ?? base.years[0].year;
        years = [
            { year: yearN, employees: raw.company?.employeesN ?? null, values: { ...emptyYear(), ...(raw.yearN ?? {}) } },
            { year: yearN - 1, employees: raw.company?.employeesN1 ?? null, values: { ...emptyYear(), ...(raw.yearN1 ?? {}) } },
        ];
    }
    while (years.length < 2) years.push(emptyYearData(years[years.length - 1].year - 1));
    const debts: DebtItem[] = Array.isArray(raw.debts) ? raw.debts.map((d: Partial<DebtItem>) => ({ ...newDebtItem(), ...d })) : [];
    return { version: 2, company, years, debts };
};
