
import React, { useState } from 'react';
import { CalculatorForm } from './CalculatorForm';
import { ResultsDisplay } from './ResultsDisplay';
import { calculateDonationTaxes } from '../services/taxCalculator';
import { type FormData, type CalculationResults } from '../types';

export const DonationCalculator: React.FC = () => {
    const [results, setResults] = useState<CalculationResults | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleCalculate = (formData: FormData) => {
        try {
            // Basic validation
            for (const key in formData) {
                if (key !== 'averageProfit' && key !== 'isAssetHoldingCompany' && key !== 'donorStopsManagement' && typeof formData[key as keyof FormData] === 'number' && (formData[key as keyof FormData] as number) <= 0) {
                     if((key as keyof FormData) !== 'preExistingWealth') {
                       throw new Error(`El campo '${key}' debe ser un número positivo.`);
                     }
                }
            }
            const calculatedResults = calculateDonationTaxes(formData);
            setResults(calculatedResults);
            setError(null);
            
            // Scroll to results after calculation
            setTimeout(() => {
                const resultsElement = document.getElementById('results');
                if (resultsElement) {
                    resultsElement.scrollIntoView({ behavior: 'smooth' });
                }
            }, 100);

        } catch (e) {
            if (e instanceof Error) {
                setError(e.message);
            } else {
                setError("Ocurrió un error desconocido durante el cálculo.");
            }
            setResults(null);
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-500 mb-2">
                        Calculadora Fiscal de Donaciones
                    </h1>
                    <p className="text-lg text-slate-400">
                        Estime el coste fiscal de donar participaciones de padre a hijo en la Comunidad de Madrid.
                    </p>
                </header>

                <main>
                    <CalculatorForm onCalculate={handleCalculate} />
                    
                    {error && (
                        <div className="mt-8 p-4 bg-red-900/50 border border-red-700 text-red-300 rounded-lg">
                            <h3 className="font-bold">Error en el cálculo</h3>
                            <p>{error}</p>
                        </div>
                    )}

                    {results && <ResultsDisplay results={results} />}
                </main>
                
                <footer className="text-center mt-12 text-sm text-slate-500">
                    <p>
                        <strong>Aviso Legal:</strong> Esta herramienta proporciona una estimación y no debe considerarse asesoramiento fiscal. 
                        Los cálculos se basan en la normativa vigente para la Comunidad de Madrid y pueden no contemplar todas las circunstancias personales. 
                        Consulte siempre a un asesor fiscal profesional.
                    </p>
                </footer>
        </div>
    );
};
