import type { EventoInvestigacion, PeticionInvestigacion } from '../shared/dossier.ts';

/** Lanza la investigación y entrega cada evento NDJSON según llega. */
export async function investigar(
  peticion: PeticionInvestigacion,
  alEvento: (evento: EventoInvestigacion) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/investigar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(peticion),
    signal,
  });
  if (!res.ok || !res.body) {
    const cuerpo = await res.json().catch(() => null);
    throw new Error(cuerpo?.error ?? `Error del servidor (${res.status})`);
  }

  const lector = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let pendiente = '';
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    pendiente += value;
    const lineas = pendiente.split('\n');
    pendiente = lineas.pop() ?? '';
    for (const linea of lineas) {
      if (linea.trim()) alEvento(JSON.parse(linea) as EventoInvestigacion);
    }
  }
  if (pendiente.trim()) alEvento(JSON.parse(pendiente) as EventoInvestigacion);
}
