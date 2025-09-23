
import React from 'react';

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input: React.FC<InputProps> = (props) => {
    return (
        <input
            {...props}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
    );
};
