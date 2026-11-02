import React from 'react';
import { DonationCalculator } from './components/DonationCalculator';

const App: React.FC = () => (
    <div className="min-h-screen bg-slate-900 font-sans p-4 sm:p-6 lg:p-8 print:p-0">
        <DonationCalculator />
    </div>
);

export default App;
