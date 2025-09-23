
import React, { useState } from 'react';

interface InfoTooltipProps {
    text: string;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ text }) => {
    const [visible, setVisible] = useState(false);

    return (
        <div className="relative inline-flex ml-2" 
             onMouseEnter={() => setVisible(true)} 
             onMouseLeave={() => setVisible(false)}>
            <span className="cursor-help text-sky-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </span>
            {visible && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-slate-700 text-slate-200 text-xs rounded-md shadow-lg z-10">
                    {text}
                </div>
            )}
        </div>
    );
};
