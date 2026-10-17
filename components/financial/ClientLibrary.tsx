import React, { useEffect, useState } from 'react';
import type { FinancialDataset } from '../../financial/schema';
import { clientId, getClientStore, type ClientStore, type ClientSummary } from '../../financial/platform';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';

interface Props {
    current: FinancialDataset;
    onOpen: (d: FinancialDataset) => void;
    onSaved: (name: string) => void;
    onError: (text: string) => void;
}

const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
};

/** Cartera de clientes guardados (en claude.ai, en el espacio privado del usuario). */
export const ClientLibrary: React.FC<Props> = ({ current, onOpen, onSaved, onError }) => {
    const [store, setStore] = useState<ClientStore | null | undefined>(undefined);
    const [clients, setClients] = useState<ClientSummary[]>([]);
    const [busy, setBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const refresh = async (s: ClientStore) => {
        try { setClients(await s.list()); } catch { onError('No se ha podido leer la lista de clientes. Inténtelo de nuevo en unos segundos.'); }
    };

    useEffect(() => {
        let alive = true;
        getClientStore().then(s => {
            if (!alive) return;
            setStore(s);
            if (s) refresh(s);
        });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const currentId = clientId(current);
    const exists = clients.some(c => c.id === currentId);

    const save = async () => {
        if (!store) return;
        setBusy(true);
        try {
            await store.save(current);
            await refresh(store);
            onSaved(current.company.name || 'Cliente sin nombre');
        } catch {
            onError('No se ha podido guardar el cliente. Compruebe la conexión e inténtelo de nuevo.');
        }
        setBusy(false);
    };

    const open = async (id: string) => {
        if (!store) return;
        setBusy(true);
        try {
            const d = await store.load(id);
            if (d) onOpen(d);
            else onError('Ese cliente ya no existe.');
        } catch {
            onError('No se ha podido abrir el cliente.');
        }
        setBusy(false);
    };

    const remove = async (id: string) => {
        if (!store) return;
        setBusy(true);
        try { await store.remove(id); await refresh(store); } catch { onError('No se ha podido eliminar el cliente.'); }
        setConfirmDelete(null);
        setBusy(false);
    };

    return (
        <Card className="border-indigo-600">
            <CardHeader><CardTitle>Mis clientes</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                {store === undefined && <p className="text-sm text-slate-400">Conectando…</p>}
                {store === null && (
                    <p className="text-sm text-slate-300">
                        La cartera no está disponible en esta vista (hace falta abrir la página en claude.ai con su sesión iniciada).
                        Mientras tanto puede usar «Exportar .json» y «Abrir .json» para guardar cada cliente en su ordenador.
                    </p>
                )}
                {store && (
                    <>
                        <div className="flex flex-wrap items-center gap-3">
                            <button type="button" disabled={busy} className="px-4 py-2 rounded-md text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50" onClick={save}>
                                {exists ? 'Actualizar' : 'Guardar'} «{current.company.name || 'Cliente sin nombre'}»
                            </button>
                            <span className="text-xs text-slate-400">Los clientes se guardan en {store.where}; solo usted puede verlos. Se identifican por razón social y CIF.</span>
                        </div>
                        {clients.length === 0 ? (
                            <p className="text-sm text-slate-400">Todavía no hay clientes guardados. Introduzca los datos de una empresa y pulse «Guardar».</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-slate-400 border-b border-slate-700 text-left">
                                            <th className="py-2 font-medium">Empresa</th>
                                            <th className="font-medium px-2">CIF</th>
                                            <th className="font-medium px-2">Ejercicios</th>
                                            <th className="font-medium px-2">Guardado</th>
                                            <th />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {clients.map(c => (
                                            <tr key={c.id} className={`border-t border-slate-800 ${c.id === currentId ? 'bg-indigo-950/40' : ''}`}>
                                                <td className="py-2 pr-2">{c.name}</td>
                                                <td className="px-2 text-slate-400">{c.cif || '—'}</td>
                                                <td className="px-2 tabular-nums">{c.years}</td>
                                                <td className="px-2 text-slate-400 tabular-nums">{fmtDate(c.updatedAt)}</td>
                                                <td className="py-1 text-right whitespace-nowrap">
                                                    {confirmDelete === c.id ? (
                                                        <span className="inline-flex items-center gap-2">
                                                            <span className="text-xs text-rose-200">¿Eliminar?</span>
                                                            <button type="button" disabled={busy} className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-xs font-semibold" onClick={() => remove(c.id)}>Sí, eliminar</button>
                                                            <button type="button" className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs" onClick={() => setConfirmDelete(null)}>No</button>
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex gap-2">
                                                            <button type="button" disabled={busy} className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs font-semibold" onClick={() => open(c.id)}>Abrir</button>
                                                            <button type="button" disabled={busy} aria-label={`Eliminar ${c.name}`} className="px-2 py-1 rounded text-rose-300 hover:text-rose-200 text-xs" onClick={() => setConfirmDelete(c.id)}>Eliminar</button>
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
};
