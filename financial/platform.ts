// Integración con el entorno en el que se ejecuta la herramienta.
// - Publicada en claude.ai (Artifact): las descargas pasan por la capacidad
//   "downloads" y la cartera de clientes se guarda en la base de datos privada
//   del usuario (capacidad "db", ruta data/users/<id>/...).
// - En local (npm run dev): descargas normales del navegador y cartera en localStorage.

import { migrateDataset, type FinancialDataset } from './schema';

/* eslint-disable @typescript-eslint/no-explicit-any */
const claudeApi = (): { use: (name: string) => Promise<any> } | null => {
    const c = (globalThis as any).claude;
    return c && typeof c.use === 'function' ? c : null;
};

/** true cuando la página se ejecuta dentro de claude.ai como Artifact. */
export const inClaude = (): boolean => claudeApi() !== null;

const capability = async (name: string): Promise<any | null> => {
    const c = claudeApi();
    if (!c) return null;
    try {
        return await c.use(name);
    } catch {
        return null;
    }
};

export type SaveOutcome = 'saved' | 'declined' | 'unavailable';

/** Ofrece un archivo al usuario. En claude.ai el usuario confirma la descarga. */
export async function saveFile(filename: string, data: string, mime: string): Promise<SaveOutcome> {
    if (inClaude()) {
        const downloads = await capability('downloads');
        if (!downloads) return 'unavailable';
        try {
            await downloads.save({ filename, data });
            return 'saved';
        } catch (e: any) {
            return e?.code === 'declined' ? 'declined' : 'unavailable';
        }
    }
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'saved';
}

// ---------------------------------------------------------------------------
// Cartera de clientes
// ---------------------------------------------------------------------------

export interface ClientSummary {
    id: string;
    name: string;
    cif: string;
    years: string;
    updatedAt: string;
}

export interface ClientStore {
    /** Dónde se guardan los datos, para explicárselo al usuario. */
    where: string;
    list(): Promise<ClientSummary[]>;
    load(id: string): Promise<FinancialDataset | null>;
    save(ds: FinancialDataset): Promise<string>;
    remove(id: string): Promise<void>;
}

export const clientId = (ds: FinancialDataset): string => {
    const base = `${ds.company.name || 'empresa'}-${ds.company.cif}`;
    return base.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'empresa';
};

const summaryOf = (ds: FinancialDataset): Omit<ClientSummary, 'id'> => ({
    name: ds.company.name || 'Sin nombre',
    cif: ds.company.cif,
    years: `${ds.years[ds.years.length - 1].year}-${ds.years[0].year}`,
    updatedAt: new Date().toISOString(),
});

const LOCAL_KEY = 'direccion-financiera:clientes';

const localStore: ClientStore = {
    where: 'este navegador',
    async list() {
        try {
            const all = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}') as Record<string, { summary: ClientSummary; json: string }>;
            return Object.values(all).map(x => x.summary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        } catch {
            return [];
        }
    },
    async load(id) {
        try {
            const all = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}');
            return all[id] ? migrateDataset(JSON.parse(all[id].json)) : null;
        } catch {
            return null;
        }
    },
    async save(ds) {
        const id = clientId(ds);
        const all = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}');
        all[id] = { summary: { id, ...summaryOf(ds) }, json: JSON.stringify(ds) };
        localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
        return id;
    },
    async remove(id) {
        const all = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}');
        delete all[id];
        localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
    },
};

/** Devuelve la cartera disponible, o null si no se puede guardar en ningún sitio. */
export async function getClientStore(): Promise<ClientStore | null> {
    if (!inClaude()) {
        try {
            localStorage.getItem(LOCAL_KEY);
            return localStore;
        } catch {
            return null;
        }
    }
    const [db, user] = await Promise.all([capability('db'), capability('user')]);
    if (!db || !user) return null;
    let uid: string | null = null;
    try { uid = await user.id(); } catch { uid = null; }
    if (!uid) return null;
    const col = db.collection(`data/users/${uid}`);
    return {
        where: 'su espacio privado de claude.ai',
        async list() {
            const snap = await col.get();
            return snap.docs
                .map((d: any) => ({ id: d.id, ...(d.data() as Omit<ClientSummary, 'id'>) }))
                .map((d: any) => ({ id: d.id, name: d.name, cif: d.cif, years: d.years, updatedAt: d.updatedAt }))
                .sort((a: ClientSummary, b: ClientSummary) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
        },
        async load(id) {
            const snap = await col.doc(id).get();
            if (!snap.exists) return null;
            const body = snap.data() as { json?: string };
            return body.json ? migrateDataset(JSON.parse(body.json)) : null;
        },
        async save(ds) {
            const id = clientId(ds);
            await col.doc(id).set({ ...summaryOf(ds), json: JSON.stringify(ds) });
            return id;
        },
        async remove(id) {
            await col.doc(id).delete();
        },
    };
}
