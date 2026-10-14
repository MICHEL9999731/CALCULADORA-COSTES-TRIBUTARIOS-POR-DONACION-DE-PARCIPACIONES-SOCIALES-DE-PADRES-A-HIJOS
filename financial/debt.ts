// Cuadro de financiación: a partir del detalle de préstamos, leasing, renting y
// pólizas vigentes al cierre calcula el calendario de pagos de los próximos años,
// el coste medio, la liquidez disponible y la cobertura del servicio de la deuda.

import { DEBT_TYPES, type DebtItem, type DebtType } from './schema';

const REVOLVING: DebtType[] = ['poliza', 'descuento'];
const OFF_BALANCE: DebtType[] = ['renting'];
/** Partidas que en el balance no suelen figurar como deuda financiera. */
const NOT_FINANCIAL_DEBT: DebtType[] = ['renting', 'aplazamiento'];

export const SCHEDULE_YEARS = 5;
const MAX_MONTHS = 40 * 12;

export interface DebtLineResult {
    item: DebtItem;
    typeLabel: string;
    revolving: boolean;
    offBalance: boolean;
    monthsLeft: number | null;
    /** Pagos por año natural: índice 0 = N+1 … índice SCHEDULE_YEARS = años posteriores. */
    principalByYear: number[];
    interestByYear: number[];
    /** Importe pendiente de pago al vencimiento que excede la cuota ordinaria (cuota final, residual o vencimiento de póliza). */
    balloon: number;
    /** En renting: total de cuotas pendientes. */
    pendingCommitment: number;
    warnings: string[];
}

export interface ScheduleYear {
    label: string;
    year: number | null; // null = años posteriores
    principal: number;
    interest: number;
    renting: number;
    debtService: number; // principal + intereses (sin renting, que ya está en el EBITDA)
    capacity: number;
    dscr: number | null;
}

export interface DebtPlan {
    lines: DebtLineResult[];
    schedule: ScheduleYear[];
    outstanding: number;            // deuda con coste en balance detallada (sin renting)
    weightedRate: number | null;    // coste medio ponderado (%)
    creditLimit: number;
    creditDrawn: number;
    creditAvailable: number;
    creditMaturing12m: DebtLineResult[];
    rentingAnnual: number;
    rentingPending: number;
    principalNext12: number;
    interestNext12: number;
    personalGuarantees: DebtLineResult[];
    expensiveLines: { line: DebtLineResult; saving: number }[];
    balloons: DebtLineResult[];
    reconciliation: { balanceDebt: number; detailedDebt: number; diff: number };
    tightYears: ScheduleYear[];
    warnings: string[];
}

/** Meses desde el 1 de enero de N+1 hasta el mes indicado (incluido). "2027-06" con N = 2025 → 18. */
export const monthsFrom = (yearN: number, ym: string): number | null => {
    const m = /^(\d{4})-(\d{1,2})$/.exec(ym.trim());
    if (!m) return null;
    return (Number(m[1]) - (yearN + 1)) * 12 + Number(m[2]);
};

const frenchPayment = (principal: number, monthlyRate: number, months: number) =>
    months <= 0 ? principal : monthlyRate === 0 ? principal / months : (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));

function scheduleLine(item: DebtItem, yearN: number): DebtLineResult {
    const principalByYear = Array(SCHEDULE_YEARS + 1).fill(0);
    const interestByYear = Array(SCHEDULE_YEARS + 1).fill(0);
    const warnings: string[] = [];
    const revolving = REVOLVING.includes(item.type);
    const offBalance = OFF_BALANCE.includes(item.type);
    const monthsLeft = item.maturity ? monthsFrom(yearN, item.maturity) : null;
    const graceMonths = item.graceUntil ? Math.max(0, monthsFrom(yearN, item.graceUntil) ?? 0) : 0;
    const r = Math.max(item.rate ?? 0, 0) / 100 / 12;
    const bucket = (month: number) => Math.min(Math.floor((month - 1) / 12), SCHEDULE_YEARS);
    let balloon = 0;
    let pendingCommitment = 0;

    if (item.maturity && monthsLeft === null) warnings.push('Fecha de vencimiento no válida (use AAAA-MM).');
    if (monthsLeft !== null && monthsLeft <= 0) warnings.push('La fecha de vencimiento es anterior al cierre.');

    if (offBalance) {
        const pay = item.monthlyPayment ?? 0;
        const months = monthsLeft !== null && monthsLeft > 0 ? monthsLeft : 12;
        if (!item.monthlyPayment) warnings.push('Falta la cuota mensual del renting.');
        if (monthsLeft === null) warnings.push('Sin vencimiento: se proyectan 12 meses.');
        for (let m = 1; m <= months; m++) principalByYear[bucket(m)] += pay; // en renting se usa como "cuota"
        pendingCommitment = pay * months;
        return { item, typeLabel: label(item.type), revolving, offBalance, monthsLeft, principalByYear, interestByYear, balloon, pendingCommitment, warnings };
    }

    if (revolving) {
        // Las pólizas no amortizan: se pagan intereses sobre lo dispuesto y se renuevan al vencimiento.
        const months = monthsLeft !== null && monthsLeft > 0 ? Math.min(monthsLeft, MAX_MONTHS) : 12;
        for (let m = 1; m <= months; m++) interestByYear[bucket(m)] += item.outstanding * r;
        balloon = item.outstanding;
        if (item.limit === null) warnings.push('Falta el límite concedido.');
        if (item.rate === null) warnings.push('Falta el tipo de interés.');
        return { item, typeLabel: label(item.type), revolving, offBalance, monthsLeft, principalByYear, interestByYear, balloon, pendingCommitment, warnings };
    }

    // Cuadro de amortización real del banco: se usan sus cuotas tal cual.
    if (item.schedule && item.schedule.length) {
        for (const row of item.schedule) {
            const m = monthsFrom(yearN, row.date.slice(0, 7));
            if (m === null || m < 1) continue;
            principalByYear[bucket(m)] += row.principal;
            interestByYear[bucket(m)] += row.interest;
        }
        const last = item.schedule[item.schedule.length - 1];
        const usual = item.schedule[0].payment;
        if (last.principal > Math.max(1, usual * 1.5)) {
            balloon = last.principal;
            warnings.push('Hay un pago final (cuota balón o residual) relevante al vencimiento.');
        }
        if (last.balance > 1) warnings.push(`El cuadro aportado termina con ${Math.round(last.balance).toLocaleString('es-ES')} € pendientes.`);
        return { item, typeLabel: label(item.type), revolving, offBalance, monthsLeft, principalByYear, interestByYear, balloon, pendingCommitment, warnings };
    }

    let bal = Math.max(item.outstanding, 0);
    if (bal === 0) return { item, typeLabel: label(item.type), revolving, offBalance, monthsLeft, principalByYear, interestByYear, balloon, pendingCommitment, warnings };
    if (item.rate === null) warnings.push('Falta el tipo de interés: se calcula sin intereses.');

    let payment = item.monthlyPayment ?? null;
    if (payment === null) {
        if (monthsLeft !== null && monthsLeft > 0) {
            payment = frenchPayment(bal, r, Math.max(monthsLeft - graceMonths, 1));
            warnings.push('Sin cuota informada: se estima con el método francés hasta el vencimiento.');
        } else {
            warnings.push('Faltan la cuota y el vencimiento: no se puede proyectar el calendario.');
            return { item, typeLabel: label(item.type), revolving, offBalance, monthsLeft, principalByYear, interestByYear, balloon, pendingCommitment, warnings };
        }
    }
    const end = monthsLeft !== null && monthsLeft > 0 ? Math.min(monthsLeft, MAX_MONTHS) : MAX_MONTHS;
    let stalled = false;
    for (let m = 1; m <= end && bal > 0.005; m++) {
        const interest = bal * r;
        let principal = m <= graceMonths ? 0 : Math.min(bal, payment - interest);
        if (principal < 0) { principal = 0; stalled = true; }
        if (m === end && monthsLeft !== null && bal - principal > 0.5) {
            balloon = bal - principal;
            principal = bal;
        }
        bal -= principal;
        principalByYear[bucket(m)] += principal;
        interestByYear[bucket(m)] += interest;
    }
    if (stalled) warnings.push('La cuota no cubre los intereses: revise la cuota o el tipo.');
    if (bal > 0.5 && monthsLeft === null) warnings.push('Con la cuota indicada la deuda no se amortiza en 40 años: revise los datos.');
    if (balloon > Math.max(1, (payment ?? 0) * 1.5)) warnings.push('Hay un pago final (cuota balón o residual) relevante al vencimiento.');
    else balloon = 0;
    return { item, typeLabel: label(item.type), revolving, offBalance, monthsLeft, principalByYear, interestByYear, balloon, pendingCommitment, warnings };
}

const label = (t: DebtType) => DEBT_TYPES.find(d => d.id === t)?.label ?? t;

export interface DebtPlanContext {
    yearN: number;
    /** Caja operativa anual disponible para atender la deuda (EBITDA − impuesto). */
    capacity: number;
    /** Deuda financiera del balance (entidades de crédito, leasing, otras deudas y grupo). */
    balanceDebt: number;
}

export function buildDebtPlan(items: DebtItem[], ctx: DebtPlanContext): DebtPlan | null {
    const valid = items.filter(i => i.outstanding > 0 || (i.monthlyPayment ?? 0) > 0 || (i.limit ?? 0) > 0);
    if (!valid.length) return null;
    const lines = valid.map(i => scheduleLine(i, ctx.yearN));

    const schedule: ScheduleYear[] = Array.from({ length: SCHEDULE_YEARS + 1 }, (_, k) => {
        const principal = lines.filter(l => !l.offBalance).reduce((a, l) => a + l.principalByYear[k], 0);
        const interest = lines.reduce((a, l) => a + l.interestByYear[k], 0);
        const renting = lines.filter(l => l.offBalance).reduce((a, l) => a + l.principalByYear[k], 0);
        const debtService = principal + interest;
        const isLast = k === SCHEDULE_YEARS;
        return {
            label: isLast ? `${ctx.yearN + SCHEDULE_YEARS + 1} y siguientes` : String(ctx.yearN + 1 + k),
            year: isLast ? null : ctx.yearN + 1 + k,
            principal, interest, renting, debtService,
            capacity: ctx.capacity,
            dscr: debtService > 0 && !isLast ? ctx.capacity / debtService : null,
        };
    });

    const withCost = lines.filter(l => !l.offBalance && l.item.outstanding > 0);
    const outstanding = withCost.reduce((a, l) => a + l.item.outstanding, 0);
    const rated = withCost.filter(l => l.item.rate !== null);
    const ratedBase = rated.reduce((a, l) => a + l.item.outstanding, 0);
    const weightedRate = ratedBase > 0 ? rated.reduce((a, l) => a + l.item.outstanding * (l.item.rate ?? 0), 0) / ratedBase : null;

    const credit = lines.filter(l => l.revolving);
    const creditLimit = credit.reduce((a, l) => a + (l.item.limit ?? l.item.outstanding), 0);
    const creditDrawn = credit.reduce((a, l) => a + l.item.outstanding, 0);
    const renting = lines.filter(l => l.offBalance);

    const expensiveLines = weightedRate === null ? [] : withCost
        .filter(l => l.item.rate !== null && l.item.rate - weightedRate >= 1.5)
        .map(line => ({ line, saving: (line.item.outstanding * ((line.item.rate ?? 0) - weightedRate)) / 100 }))
        .sort((a, b) => b.saving - a.saving);

    const detailedDebt = lines.filter(l => !NOT_FINANCIAL_DEBT.includes(l.item.type)).reduce((a, l) => a + l.item.outstanding, 0);
    const warnings: string[] = [];
    const diff = ctx.balanceDebt - detailedDebt;
    if (Math.abs(diff) > Math.max(1000, ctx.balanceDebt * 0.05)) {
        warnings.push(`La deuda detallada (${Math.round(detailedDebt).toLocaleString('es-ES')} €) no coincide con la deuda financiera del balance (${Math.round(ctx.balanceDebt).toLocaleString('es-ES')} €). Puede faltar alguna operación o haber diferencias de fecha.`);
    }

    return {
        lines,
        schedule,
        outstanding,
        weightedRate,
        creditLimit,
        creditDrawn,
        creditAvailable: Math.max(0, creditLimit - creditDrawn),
        creditMaturing12m: credit.filter(l => l.monthsLeft !== null && l.monthsLeft <= 12),
        rentingAnnual: schedule[0].renting,
        rentingPending: renting.reduce((a, l) => a + l.pendingCommitment, 0),
        principalNext12: schedule[0].principal,
        interestNext12: schedule[0].interest,
        personalGuarantees: lines.filter(l => /personal|aval|fianza|socio/i.test(l.item.guarantee)),
        expensiveLines,
        balloons: lines.filter(l => !l.revolving && l.balloon > 0),
        reconciliation: { balanceDebt: ctx.balanceDebt, detailedDebt, diff },
        tightYears: schedule.filter(s => s.dscr !== null && s.dscr < 1.2),
        warnings,
    };
}
