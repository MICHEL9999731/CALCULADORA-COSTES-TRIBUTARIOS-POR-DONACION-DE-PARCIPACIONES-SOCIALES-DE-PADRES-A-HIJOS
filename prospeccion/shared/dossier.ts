import { z } from 'zod';

// Esquema del dossier que devuelve el servidor. Se usa tanto para la salida
// estructurada de Claude como para tipar la interfaz. Los campos desconocidos
// van a null (nunca inventados), por eso casi todo es nullable.

const texto = z.string().nullable();

export const DossierSchema = z.object({
  empresa: z.object({
    razonSocial: z.string(),
    nombreComercial: texto,
    cif: texto,
    formaJuridica: texto,
    estado: z.enum(['activa', 'en concurso o liquidación', 'extinguida', 'desconocido']),
    fechaConstitucion: texto,
    domicilioSocial: texto,
    provincia: texto,
    cnae: texto,
    actividad: texto,
    objetoSocial: texto,
    capitalSocial: texto,
    web: texto,
    telefono: texto,
    email: texto,
  }),
  resumenEjecutivo: z.string(),
  datosFinancieros: z.array(
    z.object({
      ejercicio: z.string(),
      ventas: texto,
      resultado: texto,
      empleados: texto,
      fuente: texto,
    }),
  ),
  lecturaFinanciera: z.string(),
  personasClave: z.array(
    z.object({
      nombre: z.string(),
      cargo: z.string(),
      notas: texto,
      perfilUrl: texto,
    }),
  ),
  estructuraSocietaria: z.object({
    socios: z.array(z.object({ nombre: z.string(), participacion: texto, notas: texto })),
    grupoEmpresarial: texto,
    sociedadesVinculadas: z.array(z.string()),
  }),
  actosRegistrales: z.array(z.object({ fecha: z.string(), acto: z.string(), detalle: texto })),
  noticias: z.array(z.object({ fecha: texto, titular: z.string(), resumen: z.string(), url: texto })),
  presenciaDigital: z.object({
    linkedin: texto,
    redesSociales: z.array(z.string()),
    reputacion: texto,
  }),
  competidores: z.array(z.string()),
  senales: z.array(
    z.object({
      tipo: z.enum(['oportunidad', 'riesgo', 'neutral']),
      descripcion: z.string(),
    }),
  ),
  ventas: z.object({
    puntosDeDolor: z.array(z.object({ dolor: z.string(), evidencia: z.string() })),
    propuestaDeValor: z.string(),
    ganchosApertura: z.array(z.string()),
    preguntasDescubrimiento: z.array(z.string()),
    objeciones: z.array(z.object({ objecion: z.string(), respuesta: z.string() })),
    estrategiaCierre: z.string(),
    siguientePaso: z.string(),
    emailSeguimiento: z.object({ asunto: z.string(), cuerpo: z.string() }),
  }),
  fuentes: z.array(z.object({ titulo: z.string(), url: z.string() })),
  confianza: z.object({
    nivel: z.enum(['alta', 'media', 'baja']),
    notas: z.string(),
  }),
});

export type Dossier = z.infer<typeof DossierSchema>;

export interface CifInfoPublica {
  cif: string;
  valido: boolean;
  formaJuridica: string | null;
  provinciaInscripcion: string | null;
  motivo?: string;
}

export interface PeticionInvestigacion {
  consulta: string;
  miOferta: string;
  contextoReunion?: string;
}

// Mensajes NDJSON que el servidor envía mientras investiga.
export type EventoInvestigacion =
  | { tipo: 'cif'; datos: CifInfoPublica }
  | { tipo: 'progreso'; mensaje: string }
  | { tipo: 'busqueda'; consulta: string }
  | { tipo: 'lectura'; url: string }
  | { tipo: 'dossier'; datos: Dossier }
  | { tipo: 'error'; mensaje: string };
