
import React from 'react';

type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export const Label: React.FC<LabelProps> = ({ children, ...props }) => {
    return (
        <label {...props} className="block text-sm font-medium text-slate-300">
            {children}
        </label>
    );
};
