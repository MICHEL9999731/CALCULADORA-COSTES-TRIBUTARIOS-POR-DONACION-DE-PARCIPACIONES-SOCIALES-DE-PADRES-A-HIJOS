
import React from 'react';

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div className={`bg-slate-800/50 border border-slate-700 rounded-lg shadow-lg overflow-hidden ${className}`}>
        {children}
    </div>
);

export const CardHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="p-4 border-b border-slate-700">{children}</div>
);

export const CardTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 className="text-xl font-semibold text-slate-200">{children}</h3>
);

export const CardContent: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div className={`p-4 ${className}`}>{children}</div>
);
