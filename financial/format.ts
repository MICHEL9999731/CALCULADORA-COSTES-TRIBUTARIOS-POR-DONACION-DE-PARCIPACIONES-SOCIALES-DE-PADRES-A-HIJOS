const eurFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const numFormatter = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dec2 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const isNum = (n: number | null | undefined): n is number =>
    typeof n === 'number' && Number.isFinite(n);

export const eur = (n: number | null | undefined): string => (isNum(n) ? eurFormatter.format(n) : 'n/d');
export const num = (n: number | null | undefined): string => (isNum(n) ? numFormatter.format(n) : 'n/d');
export const pct = (n: number | null | undefined): string => (isNum(n) ? `${dec1.format(n * 100)} %` : 'n/d');
export const times = (n: number | null | undefined): string => (isNum(n) ? `${dec2.format(n)}x` : 'n/d');
export const days = (n: number | null | undefined): string => (isNum(n) ? `${numFormatter.format(Math.round(n))} días` : 'n/d');
export const pts = (n: number | null | undefined): string =>
    isNum(n) ? `${n >= 0 ? '+' : ''}${dec1.format(n * 100)} p.p.` : 'n/d';
export const signedPct = (n: number | null | undefined): string =>
    isNum(n) ? `${n >= 0 ? '+' : ''}${dec1.format(n * 100)} %` : 'n/d';

export type ValueFormat = 'eur' | 'pct' | 'x' | 'days' | 'num';

export const fmt = (n: number | null | undefined, format: ValueFormat): string => {
    switch (format) {
        case 'eur': return eur(n);
        case 'pct': return pct(n);
        case 'x': return times(n);
        case 'days': return days(n);
        default: return num(n);
    }
};

/**
 * Convierte un texto con formato numérico español o anglosajón a número.
 * Admite "1.234.567,89", "1234567.89", "(1.234)" para negativos y "-1.234 €".
 */
export const parseAmount = (raw: string): number => {
    let s = raw.trim().replace(/[€\s ]/g, '');
    if (!s) return 0;
    let negative = false;
    if (/^\(.*\)$/.test(s)) {
        negative = true;
        s = s.slice(1, -1);
    }
    if (s.startsWith('-')) {
        negative = !negative;
        s = s.slice(1);
    }
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
        // El último separador es el decimal.
        s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (lastComma > -1) {
        s = s.replace(/\./g, '');
        // "1,234,567" (anglosajón sin decimales) frente a "1234,56" (decimal español)
        s = /^\d{1,3}(,\d{3})+$/.test(s) && s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if (lastDot > -1) {
        // "1.234.567" o "1.234" con tres dígitos tras el punto se interpreta como separador de miles.
        if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    }
    const n = Number(s);
    if (!Number.isFinite(n)) return NaN;
    return negative ? -n : n;
};
