
export interface FormData {
    // Company data
    totalShares: number;
    nominalValuePerShare: number;
    totalEquity: number;
    averageProfit: number;
    isAssetHoldingCompany: boolean;

    // Donation data
    donatedShares: number;
    acquisitionValuePerShare: number;

    // Donor (parent) data
    donorAge: number;
    donorStopsManagement: boolean;

    // Donee (child) data
    preExistingWealth: number;
}

export interface ShareValuation {
    byNominalValue: number;
    byBookValue: number;
    byProfitCapitalization: number;
    finalValuePerShare: number;
    totalDonationValue: number;
}

export interface IrpfResult {
    isExempt: boolean;
    exemptionReason: string;
    capitalGain: number;
    tax: number;
}

export interface GiftTaxResult {
    taxableBase: number;
    reduction: number;
    liquidableBase: number;
    grossTaxLiability: number;
    coefficient: number;
    adjustedTaxLiability: number;
    bonus: number;
    finalTax: number;
}

export interface CalculationResults {
    valuation: ShareValuation;
    irpf: IrpfResult;
    giftTax: GiftTaxResult;
}
