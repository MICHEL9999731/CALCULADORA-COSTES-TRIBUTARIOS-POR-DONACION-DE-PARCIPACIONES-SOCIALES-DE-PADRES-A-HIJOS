import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import type { EventoInvestigacion, PeticionInvestigacion } from '../shared/dossier.ts';
import { prepararDossier } from './research.ts';

const PUERTO = Number(process.env.PORT ?? 8787);
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const app = express();
app.use(express.json({ limit: '100kb' }));

app.post('/api/investigar', async (req, res) => {
  const cuerpo = req.body as Partial<PeticionInvestigacion>;
  const consulta = typeof cuerpo.consulta === 'string' ? cuerpo.consulta.trim() : '';
  if (consulta.length < 2 || consulta.length > 200) {
    res.status(400).json({ error: 'Indica el nombre o el CIF de la empresa.' });
    return;
  }

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();
  const emitir = (evento: EventoInvestigacion) => res.write(JSON.stringify(evento) + '\n');

  try {
    await prepararDossier(
      {
        consulta,
        miOferta: typeof cuerpo.miOferta === 'string' && cuerpo.miOferta.trim() ? cuerpo.miOferta.trim() : 'Servicios profesionales a empresas.',
        contextoReunion: typeof cuerpo.contextoReunion === 'string' ? cuerpo.contextoReunion.trim() : undefined,
      },
      emitir,
    );
  } catch (error) {
    console.error(error);
    let mensaje = 'Se ha producido un error durante la investigación.';
    if (error instanceof Anthropic.AuthenticationError) mensaje = 'La clave de la API de Anthropic no es válida o falta (ANTHROPIC_API_KEY).';
    else if (error instanceof Anthropic.RateLimitError) mensaje = 'Se ha alcanzado el límite de uso de la API. Inténtalo en unos minutos.';
    else if (error instanceof Anthropic.APIError) mensaje = `Error de la API de Anthropic (${error.status ?? 'sin código'}).`;
    else if (error instanceof Error) mensaje = error.message;
    emitir({ tipo: 'error', mensaje });
  }
  res.end();
});

if (process.env.NODE_ENV === 'production') {
  const dist = path.join(raiz, 'dist');
  app.use(express.static(dist));
  app.get('/{*ruta}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PUERTO, () => {
  console.log(`API de prospección escuchando en http://localhost:${PUERTO}`);
});
