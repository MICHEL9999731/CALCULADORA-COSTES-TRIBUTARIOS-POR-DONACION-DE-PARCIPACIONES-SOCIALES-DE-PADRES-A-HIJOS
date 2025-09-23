
import React from 'react';
import { type CalculationResults } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';

interface ResultsDisplayProps {
    results: CalculationResults;
}

const formatCurrency = (value: number) => {
    return value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
};

const ResultRow: React.FC<{ label: string; value: string; className?: string }> = ({ label, value, className = '' }) => (
    <div className={`flex justify-between items-center py-2 border-b border-slate-700/50 ${className}`}>
        <span className="text-slate-400">{label}</span>
        <span className="font-semibold text-slate-100">{value}</span>
    </div>
);

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ results }) => {
    const { valuation, irpf, giftTax } = results;

    return (
        <div id="results" className="mt-10 space-y-6 animate-fade-in">
            <h2 className="text-3xl font-bold text-center text-sky-400">Resultados de la Simulación</h2>

            {/* Valuation */}
            <Card>
                <CardHeader>
                    <CardTitle>Valoración de la Donación</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResultRow label="Valor por Acción (Nominal)" value={formatCurrency(valuation.byNominalValue)} />
                    <ResultRow label="Valor por Acción (Contable)" value={formatCurrency(valuation.byBookValue)} />
                    <ResultRow label="Valor por Acción (Beneficios)" value={formatCurrency(valuation.byProfitCapitalization)} />
                    <ResultRow label="Valor Fiscal por Acción (el mayor)" value={formatCurrency(valuation.finalValuePerShare)} className="bg-slate-700/30 font-bold" />
                    <ResultRow label="Valor Total de la Donación" value={formatCurrency(valuation.totalDonationValue)} className="text-xl mt-2" />
                </CardContent>
            </Card>

            {/* IRPF (Donor) */}
            <Card>
                <CardHeader>
                    <CardTitle>Coste para el Donante (Padre/Madre) - IRPF</CardTitle>
                </CardHeader>
                <CardContent>
                    {irpf.isExempt ? (
                        <div className="p-4 text-center bg-green-900/50 border border-green-700 rounded-lg">
                            <p className="text-lg font-semibold text-green-300">Ganancia Patrimonial Exenta</p>
                            <p className="text-sm text-green-400 mt-1">{irpf.exemptionReason}</p>
                        </div>
                    ) : (
                         <>
                            <ResultRow label="Ganancia/Pérdida Patrimonial" value={formatCurrency(irpf.capitalGain)} />
                            <ResultRow label="Impuesto a Pagar (Estimado)" value={formatCurrency(irpf.tax)} className="text-xl font-bold text-red-400" />
                            {irpf.capitalGain > 0 && <p className="text-xs text-slate-500 mt-2">La ganancia no está exenta porque: {irpf.exemptionReason}</p>}
                         </>
                    )}
                </CardContent>
            </Card>
            
            {/* Gift Tax (Donee) */}
            <Card>
                <CardHeader>
                    <CardTitle>Coste para el Donatario (Hijo/a) - Impuesto de Donaciones</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResultRow label="Base Imponible (Valor Donación)" value={formatCurrency(giftTax.taxableBase)} />
                    <ResultRow label="Reducción 95% (Empresa Familiar)" value={formatCurrency(giftTax.reduction)} />
                    <ResultRow label="Base Liquidable" value={formatCurrency(giftTax.liquidableBase)} />
                    <ResultRow label="Cuota Íntegra" value={formatCurrency(giftTax.grossTaxLiability)} />
                    <ResultRow label="Coeficiente Multiplicador" value={giftTax.coefficient.toFixed(4)} />
                    <ResultRow label="Cuota Tributaria Ajustada" value={formatCurrency(giftTax.adjustedTaxLiability)} />
                    <ResultRow label="Bonificación 99% (Comunidad de Madrid)" value={formatCurrency(giftTax.bonus)} className="text-green-400" />
                    <ResultRow label="Total a Pagar" value={formatCurrency(giftTax.finalTax)} className="text-2xl font-bold text-sky-300 mt-2" />
                </CardContent>
            </Card>

            {/* Important Notes */}
            <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-400 space-y-2">
                <h4 className="font-bold text-slate-200">Condiciones y Requisitos Importantes:</h4>
                <ul className="list-disc list-inside space-y-1">
                    <li><strong>Para el donatario (hijo/a):</strong> Debe mantener las participaciones adquiridas durante los <strong>5 años</strong> siguientes a la donación para consolidar la reducción y bonificación en el Impuesto de Donaciones.</li>
                    <li><strong>Para la exención en IRPF del donante:</strong> El donatario no puede transmitir las participaciones en los <strong>10 años</strong> siguientes. El incumplimiento podría hacer que el donante tuviera que pagar el impuesto que se ahorró.</li>
                    <li>Esta simulación asume que se cumplen todos los requisitos para la aplicación de los beneficios fiscales de la empresa familiar.</li>
                </ul>
            </div>
        </div>
    );
};
