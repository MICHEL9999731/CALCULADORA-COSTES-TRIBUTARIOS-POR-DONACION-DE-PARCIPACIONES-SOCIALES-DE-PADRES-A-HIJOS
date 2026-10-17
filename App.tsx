import React, { useState } from 'react';
import { DonationCalculator } from './components/DonationCalculator';
import { FinancialDirector } from './components/financial/FinancialDirector';

type Tool = 'financiero' | 'donaciones';

const App: React.FC = () => {
    const [tool, setTool] = useState<Tool>('financiero');

    return (
        <div className="min-h-screen bg-slate-900 font-sans p-4 sm:p-6 lg:p-8 print:p-0">
            <nav className="max-w-6xl mx-auto mb-8 flex flex-wrap gap-2 justify-center print:hidden">
                {([
                    ['financiero', 'Dirección financiera'],
                    ['donaciones', 'Calculadora de donaciones'],
                ] as const).map(([id, label]) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setTool(id)}
                        className={`px-4 py-2 rounded-full text-sm font-semibold ${tool === id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                    >
                        {label}
                    </button>
                ))}
            </nav>

            {tool === 'donaciones' ? (
                <DonationCalculator />
            ) : (
                <div className="max-w-6xl mx-auto">
                    <header className="text-center mb-8 print:hidden">
                        <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-500 mb-2">
                            Dirección Financiera
                        </h1>
                        <p className="text-lg text-slate-400">
                            Introduzca el balance y la cuenta de pérdidas y ganancias de 2 a 5 ejercicios, y su cuadro de financiación, y obtenga el análisis, diagnóstico y plan de acción de un director financiero.
                        </p>
                    </header>
                    <FinancialDirector />
                    <footer className="text-center mt-12 text-sm text-slate-500 print:hidden">
                        <p>
                            <strong>Aviso:</strong> Análisis automático basado en la información contable facilitada. Las referencias sectoriales son orientativas.
                            Las conclusiones deben revisarse por un profesional antes de trasladarse al cliente.
                        </p>
                    </footer>
                </div>
            )}
        </div>
    );
};

export default App;
