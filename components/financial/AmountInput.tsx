import React, { useEffect, useState } from 'react';
import { parseAmount } from '../../financial/format';

const display = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

interface AmountInputProps {
    value: number | null;
    onChange: (v: number | null) => void;
    allowEmpty?: boolean;
    className?: string;
    ariaLabel?: string;
    placeholder?: string;
}

/** Campo numérico que acepta formato español (1.234,56) y muestra separadores de miles. */
export const AmountInput: React.FC<AmountInputProps> = ({ value, onChange, allowEmpty, className = '', ariaLabel, placeholder }) => {
    const fmt = (v: number | null) => (v === null || (v === 0 && !allowEmpty) ? '' : display.format(v));
    const [text, setText] = useState(fmt(value));
    const [focused, setFocused] = useState(false);

    useEffect(() => {
        if (!focused) setText(fmt(value));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, focused]);

    const commit = () => {
        const trimmed = text.trim();
        if (!trimmed) {
            onChange(allowEmpty ? null : 0);
            return;
        }
        const n = parseAmount(trimmed);
        onChange(Number.isNaN(n) ? (allowEmpty ? null : 0) : n);
    };

    return (
        <input
            type="text"
            inputMode="decimal"
            aria-label={ariaLabel}
            placeholder={placeholder ?? '0'}
            value={text}
            onFocus={() => setFocused(true)}
            onChange={e => setText(e.target.value)}
            onBlur={() => { commit(); setFocused(false); }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className={`w-full px-2 py-1 text-right tabular-nums bg-slate-700 border border-slate-600 rounded-md placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
        />
    );
};
