import type { Dossier } from '../shared/dossier.ts';

export interface EntradaHistorial {
  id: string;
  consulta: string;
  fecha: string;
  dossier: Dossier;
}

const CLAVE_OFERTA = 'prospeccion.miOferta';
const CLAVE_HISTORIAL = 'prospeccion.historial';
const MAX_HISTORIAL = 25;

export const OFERTA_POR_DEFECTO =
  'Despacho de asesoría fiscal, contable y legal para empresas y empresarios: planificación fiscal de la empresa y del patrimonio familiar, ' +
  'relevo generacional y donación de participaciones (reducciones del 95 % en ISD y exención en Patrimonio), reestructuraciones societarias, ' +
  'holding familiar, optimización de la retribución de socios y administradores, y defensa ante inspecciones.';

// localStorage puede no estar disponible (modo privado, bloqueo de cookies): la app funciona igual.
function leer<T>(clave: string, porDefecto: T): T {
  try {
    const valor = localStorage.getItem(clave);
    return valor ? (JSON.parse(valor) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function escribir(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin persistencia */
  }
}

export const cargarOferta = () => leer(CLAVE_OFERTA, OFERTA_POR_DEFECTO);
export const guardarOferta = (oferta: string) => escribir(CLAVE_OFERTA, oferta);

export const cargarHistorial = () => leer<EntradaHistorial[]>(CLAVE_HISTORIAL, []);
export function guardarEnHistorial(historial: EntradaHistorial[], entrada: EntradaHistorial): EntradaHistorial[] {
  const nuevo = [entrada, ...historial.filter((e) => e.id !== entrada.id)].slice(0, MAX_HISTORIAL);
  escribir(CLAVE_HISTORIAL, nuevo);
  return nuevo;
}
export function borrarDelHistorial(historial: EntradaHistorial[], id: string): EntradaHistorial[] {
  const nuevo = historial.filter((e) => e.id !== id);
  escribir(CLAVE_HISTORIAL, nuevo);
  return nuevo;
}
