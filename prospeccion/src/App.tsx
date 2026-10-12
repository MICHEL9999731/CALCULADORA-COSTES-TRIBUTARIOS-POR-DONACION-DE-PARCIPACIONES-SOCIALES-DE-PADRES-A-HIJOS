import { useRef, useState } from 'react';
import type { CifInfoPublica, Dossier } from '../shared/dossier.ts';
import { investigar } from './api.ts';
import { DossierView } from './DossierView.tsx';
import {
  borrarDelHistorial,
  cargarHistorial,
  cargarOferta,
  guardarEnHistorial,
  guardarOferta,
  OFERTA_POR_DEFECTO,
  type EntradaHistorial,
} from './storage.ts';

interface Paso {
  icono: string;
  texto: string;
}

export default function App() {
  const [consulta, setConsulta] = useState('');
  const [contexto, setContexto] = useState('');
  const [oferta, setOferta] = useState(cargarOferta);
  const [verOferta, setVerOferta] = useState(false);

  const [cargando, setCargando] = useState(false);
  const [pasos, setPasos] = useState<Paso[]>([]);
  const [cif, setCif] = useState<CifInfoPublica | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [historial, setHistorial] = useState(cargarHistorial);
  const abortar = useRef<AbortController | null>(null);

  const anadirPaso = (icono: string, texto: string) => setPasos((p) => [...p, { icono, texto }]);

  async function lanzar(e: React.FormEvent) {
    e.preventDefault();
    const q = consulta.trim();
    if (q.length < 2 || cargando) return;

    abortar.current = new AbortController();
    setCargando(true);
    setPasos([]);
    setCif(null);
    setError(null);
    setDossier(null);

    try {
      await investigar(
        { consulta: q, miOferta: oferta, contextoReunion: contexto || undefined },
        (ev) => {
          switch (ev.tipo) {
            case 'cif':
              setCif(ev.datos);
              anadirPaso('🪪', ev.datos.valido ? `CIF válido · ${ev.datos.formaJuridica ?? ''}` : `CIF no válido: ${ev.datos.motivo}`);
              break;
            case 'progreso':
              anadirPaso('⏳', ev.mensaje);
              break;
            case 'busqueda':
              anadirPaso('🔎', ev.consulta);
              break;
            case 'lectura':
              anadirPaso('📄', ev.url);
              break;
            case 'dossier':
              setDossier(ev.datos);
              setHistorial((h) =>
                guardarEnHistorial(h, {
                  id: crypto.randomUUID(),
                  consulta: q,
                  fecha: new Date().toISOString(),
                  dossier: ev.datos,
                }),
              );
              break;
            case 'error':
              setError(ev.mensaje);
              break;
          }
        },
        abortar.current.signal,
      );
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    } finally {
      setCargando(false);
    }
  }

  function cancelar() {
    abortar.current?.abort();
    anadirPaso('✋', 'Investigación cancelada');
  }

  function abrir(entrada: EntradaHistorial) {
    setDossier(entrada.dossier);
    setPasos([]);
    setCif(null);
    setError(null);
    setConsulta(entrada.consulta);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="layout">
      <aside className="lateral no-print">
        <h2>Empresas investigadas</h2>
        {historial.length === 0 && <p className="tenue">Aún no hay dossieres guardados.</p>}
        <ul className="historial">
          {historial.map((h) => (
            <li key={h.id}>
              <button className="enlace" onClick={() => abrir(h)}>
                <strong>{h.dossier.empresa.razonSocial}</strong>
                <span className="tenue">{new Date(h.fecha).toLocaleDateString('es-ES')}</span>
              </button>
              <button className="borrar" title="Eliminar" onClick={() => setHistorial((x) => borrarDelHistorial(x, h.id))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main>
        <header className="cabecera no-print">
          <h1>Prepara tu próxima reunión</h1>
          <p className="tenue">
            Escribe el nombre o el CIF de la empresa. Reunimos su información pública (registro mercantil, cuentas, directivos,
            noticias…) y te damos un guion para cerrar la reunión.
          </p>
        </header>

        <form className="tarjeta buscador no-print" onSubmit={lanzar}>
          <div className="fila">
            <input
              autoFocus
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              placeholder="Ej.: Talleres Martínez S.L. o B12345678"
              aria-label="Nombre o CIF de la empresa"
            />
            {cargando ? (
              <button type="button" className="secundario" onClick={cancelar}>
                Cancelar
              </button>
            ) : (
              <button type="submit" disabled={consulta.trim().length < 2}>
                Investigar
              </button>
            )}
          </div>
          <input
            value={contexto}
            onChange={(e) => setContexto(e.target.value)}
            placeholder="Contexto opcional: con quién te reúnes, de dónde viene el contacto, qué te han pedido…"
            aria-label="Contexto de la reunión"
          />
          <button type="button" className="enlace pequeno" onClick={() => setVerOferta((v) => !v)}>
            {verOferta ? 'Ocultar' : 'Editar'} lo que ofreces (se usa para personalizar la estrategia)
          </button>
          {verOferta && (
            <div className="oferta">
              <textarea
                rows={4}
                value={oferta}
                onChange={(e) => {
                  setOferta(e.target.value);
                  guardarOferta(e.target.value);
                }}
              />
              <button
                type="button"
                className="enlace pequeno"
                onClick={() => {
                  setOferta(OFERTA_POR_DEFECTO);
                  guardarOferta(OFERTA_POR_DEFECTO);
                }}
              >
                Restablecer texto por defecto
              </button>
            </div>
          )}
        </form>

        {(cargando || pasos.length > 0) && !dossier && (
          <section className="tarjeta progreso no-print" aria-live="polite">
            <h3>{cargando ? 'Investigando… (suele tardar 1-3 minutos)' : 'Registro de la investigación'}</h3>
            {cif && (
              <p className={cif.valido ? 'ok' : 'aviso'}>
                {cif.cif}: {cif.valido ? `${cif.formaJuridica} · asignado en ${cif.provinciaInscripcion ?? '—'}` : cif.motivo}
              </p>
            )}
            <ol>
              {pasos.map((p, i) => (
                <li key={i}>
                  <span aria-hidden>{p.icono}</span> {p.texto}
                </li>
              ))}
            </ol>
          </section>
        )}

        {error && <div className="tarjeta error">{error}</div>}

        {dossier && <DossierView dossier={dossier} />}
      </main>
    </div>
  );
}
