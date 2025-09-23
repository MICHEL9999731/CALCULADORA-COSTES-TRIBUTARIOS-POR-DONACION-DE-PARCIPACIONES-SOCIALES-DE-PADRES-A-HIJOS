
import { type FormData, type CalculationResults, type IrpfResult, type GiftTaxResult, type ShareValuation } from '../types';

// State-level gift tax progressive scale
const GIFT_TAX_SCALE = [
    { limit: 0, rate: 0.0765, base: 0 },
    { limit: 7993.46, rate: 0.085, base: 611.50 },
    { limit: 15980.91, rate: 0.0935, base: 1290.43 },
    { limit: 23968.36, rate: 0.102, base: 2037.36 },
    { limit: 31955.81, rate: 0.1105, base: 2851.98 },
    { limit: 39943.26, rate: 0.119, base: 3734.29 },
    { limit: 47930.72, rate: 0.1275, base: 4684.30 },
    { limit: 55918.17, rate: 0.136, base: 5699.96 },
    { limit: 63905.62, rate: 0.1445, base: 6783.16 },
    { limit: 71893.07, rate: 0.153, base: 7933.90 },
    { limit: 79880.52, rate: 0.1615, base: 9152.18 },
    // Simplified for higher amounts, we take the highest bracket
    { limit: 797555.08, rate: 0.34, base: 124177.37 }
];

// Pre-existing wealth multiplier coefficients for Group II (descendants)
const WEALTH_COEFFICIENTS = [
    { limit: 0, multiplier: 1.0000 },
    { limit: 402678.11, multiplier: 1.0500 },
    { limit: 2007380.43, multiplier: 1.1000 },
    { limit: 4014760.85, multiplier: 1.2000 }
];

// IRPF savings tax progressive scale
const IRPF_SAVINGS_SCALE = [
    { limit: 0, rate: 0.19 },
    { limit: 6000, rate: 0.21 },
    { limit: 50000, rate: 0.23 },
    { limit: 200000, rate: 0.27 },
    { limit: 300000, rate: 0.28 }
];

const calculateProgressiveTax = (base: number, scale: { limit: number; rate: number; base?: number }[]): number => {
    if (base <= 0) return 0;
    let totalTax = 0;
    let remainingBase = base;

    for (let i = scale.length - 1; i >= 0; i--) {
        if (remainingBase > scale[i].limit) {
            totalTax += (remainingBase - scale[i].limit) * scale[i].rate;
            remainingBase = scale[i].limit;
        }
    }
    return totalTax;
};


const calculateShareValuation = (data: FormData): ShareValuation => {
    const { totalShares, nominalValuePerShare, totalEquity, averageProfit, donatedShares } = data;

    const byNominalValue = nominalValuePerShare;
    const byBookValue = totalEquity / totalShares;
    const byProfitCapitalization = (averageProfit * 5) / totalShares;

    const finalValuePerShare = Math.max(byNominalValue, byBookValue, byProfitCapitalization > 0 ? byProfitCapitalization : 0);
    const totalDonationValue = finalValuePerShare * donatedShares;

    return {
        byNominalValue,
        byBookValue,
        byProfitCapitalization,
        finalValuePerShare,
        totalDonationValue,
    };
};

const calculateIrpf = (data: FormData, totalDonationValue: number): IrpfResult => {
    const { donorAge, donorStopsManagement, isAssetHoldingCompany, acquisitionValuePerShare, donatedShares } = data;

    let isExempt = true;
    let exemptionReason = "Cumple los requisitos de donación de empresa familiar (donante mayor de 65, cese de funciones y no es sociedad patrimonial).";
    
    if (donorAge < 65) {
        isExempt = false;
        exemptionReason = "El donante es menor de 65 años.";
    }
    if (!donorStopsManagement) {
        isExempt = false;
        exemptionReason = "El donante no cesa en sus funciones de dirección remuneradas.";
    }
    if (isAssetHoldingCompany) {
        isExempt = false;
        exemptionReason = "La sociedad tiene la consideración de patrimonial.";
    }

    if (isExempt) {
        return { isExempt: true, exemptionReason, capitalGain: 0, tax: 0 };
    }

    const acquisitionValueTotal = acquisitionValuePerShare * donatedShares;
    const capitalGain = totalDonationValue - acquisitionValueTotal;

    if (capitalGain <= 0) {
        return { isExempt: false, exemptionReason: "No hay ganancia patrimonial (valor de transmisión no supera al de adquisición).", capitalGain, tax: 0 };
    }

    const tax = calculateProgressiveTax(capitalGain, IRPF_SAVINGS_SCALE);

    return { isExempt: false, exemptionReason, capitalGain, tax };
};

const calculateGiftTax = (totalDonationValue: number, preExistingWealth: number): GiftTaxResult => {
    const taxableBase = totalDonationValue;
    // 95% reduction for family business donation
    const reduction = taxableBase * 0.95;
    const liquidableBase = taxableBase - reduction;

    if (liquidableBase <= 0) {
        return { taxableBase, reduction, liquidableBase, grossTaxLiability: 0, coefficient: 1, adjustedTaxLiability: 0, bonus: 0, finalTax: 0 };
    }
    
    // Calculate gross tax liability
    let grossTaxLiability = 0;
    const relevantBracket = [...GIFT_TAX_SCALE].reverse().find(b => liquidableBase >= b.limit);
    if (relevantBracket) {
        grossTaxLiability = relevantBracket.base + (liquidableBase - relevantBracket.limit) * relevantBracket.rate;
    }

    // Determine coefficient
    const relevantCoeff = [...WEALTH_COEFFICIENTS].reverse().find(c => preExistingWealth >= c.limit);
    const coefficient = relevantCoeff ? relevantCoeff.multiplier : 1.0;

    const adjustedTaxLiability = grossTaxLiability * coefficient;

    // Apply Madrid's 99% bonus
    const bonus = adjustedTaxLiability * 0.99;
    const finalTax = adjustedTaxLiability - bonus;

    return { taxableBase, reduction, liquidableBase, grossTaxLiability, coefficient, adjustedTaxLiability, bonus, finalTax };
};

export const calculateDonationTaxes = (data: FormData): CalculationResults => {
    if (data.donatedShares > data.totalShares) {
        throw new Error("El número de participaciones donadas no puede ser mayor que el total de participaciones.");
    }

    const valuation = calculateShareValuation(data);
    const irpf = calculateIrpf(data, valuation.totalDonationValue);
    const giftTax = calculateGiftTax(valuation.totalDonationValue, data.preExistingWealth);

    return {
        valuation,
        irpf,
        giftTax,
    };
};
