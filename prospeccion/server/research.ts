import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { DossierSchema, type Dossier, type EventoInvestigacion, type PeticionInvestigacion } from '../shared/dossier.ts';
import { analizarCif, pareceCif, type CifInfo } from './cif.ts';

const MODELO = process.env.CLAUDE_MODEL ?? 'claude-opus-5-5';
const MAX_REANUDACIONES = 5;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const client = new Anthropic();

type Emitir = (evento: EventoInvestigacion) => void;

const PROMPT_INVESTIGACION = `Eres un analista de inteligencia comercial especializado en empresas españolas. Tu trabajo es preparar a un profesional para una reunión con un cliente potencial: necesita conocer la empresa a fondo para generar confianza y cerrar la reunión con un siguiente paso concreto.

Investiga en internet la empresa indicada y reúne todos los datos verificables que encuentres sobre:
1. Identificación: razón social exacta, CIF, forma jurídica, domicilio social, fecha de constitución, CNAE y actividad, objeto social, capital social, estado (activa, en concurso, extinguida), web, teléfono y email corporativos.
2. Datos financieros de los últimos ejercicios disponibles: ventas, resultado, empleados (y su evolución).
3. Personas clave: administradores, consejeros, apoderados, directivos y fundadores, con su cargo. Perfiles públicos de LinkedIn si aparecen.
4. Estructura societaria: socios conocidos, grupo empresarial, sociedades vinculadas o participadas, relación familiar entre socios si la hay (empresa familiar, relevo generacional).
5. Actos publicados en el BORME: nombramientos, ceses, ampliaciones o reducciones de capital, cambios de domicilio u objeto, fusiones, escisiones, disolución.
6. Noticias recientes, premios, expansión, inversiones, contrataciones, litigios, subvenciones, concursos públicos.
7. Presencia digital y reputación (web, redes, reseñas).
8. Sector y principales competidores.

Fuentes recomendadas: boe.es (BORME), infonif.economia3.com (CIF, matriz y actos recientes), empresite.eleconomista.es, einforma.com, iberinform.es, axesor.es, infoempresa.com, alimarket.es (grupo y sector), librebor.me (si responde), cnmv.es (si cotiza), el aviso legal de la web corporativa, LinkedIn, prensa económica y regional. Lee las páginas de ficha de empresa cuando la búsqueda las muestre; si no se pueden abrir, usa el fragmento del buscador y márcalo como no verificado.

Cuando una fuente oculte el dato (las fichas gratuitas suelen tapar cifras y socios) o no se pueda abrir, busca alternativas antes de darlo por no encontrado:
- Busca también por la marca, el grupo o la matriz, la denominación anterior y los directivos: la prensa suele hablar del grupo.
- Cifras: ranking-empresas.eleconomista.es, rankings de ventas por provincia, prensa sectorial y regional (Alimarket, Interempresas, diarios económicos), informes de la matriz si cotiza, estado de información no financiera.
- Grupo y matriz: noticias de compras, webs de asesores de operaciones, registros extranjeros gratuitos (Companies House) y GLEIF.
- Centros y plantilla: ofertas de empleo (InfoJobs, Indeed, LinkedIn), Google Maps, ferias y directorios sectoriales.
- Ayudas y contratos: BDNS (infosubvenciones.es) y Plataforma de Contratación, buscando el CIF entre comillas.
- Alertas: Registro Público Concursal y edictos del BOE.
Prueba al menos dos alternativas antes de declarar un dato como no encontrado y anota dónde buscaste. Indica cuándo un dato es del grupo y no de la sociedad.

Reglas:
- Si el nombre es ambiguo (varias sociedades con nombres parecidos), identifica la más probable usando la pista disponible (CIF, provincia, sector) y menciona las alternativas con su CIF. Confirma por CIF y domicilio, nunca solo por el nombre; distingue la marca de la sociedad legal.
- Un CIF sacado de un agregador es probable hasta verlo en el BORME o en el aviso legal de la empresa. Si la provincia de asignación del CIF no coincide con el domicilio actual, puede haber un traslado: compruébalo.
- Averigua quién decide de verdad: si el administrador es otra sociedad, busca quién está detrás.
- Distingue claramente lo verificado (con su URL) de lo que deduces. No inventes cifras ni personas.
- Indica el ejercicio al que corresponde cada dato financiero y la fecha de cada noticia; un dato de hace más de dos años es antiguo.
- Solo información profesional y pública: nada de vida privada, familia, salud ni patrimonio personal.

Termina con unas notas de investigación completas y ordenadas por los apartados anteriores, citando la URL de cada dato.`;

const PROMPT_DOSSIER = `Eres un experto en ventas consultivas B2B en España. Con las notas de investigación que te doy, construye el dossier de preparación de la reunión.

Rellena los datos de la empresa solo con información respaldada por las notas; usa null cuando no se conozca y explica las lagunas en "confianza.notas". Las cifras van como texto legible con unidades (p. ej. "12,4 M€", "85 empleados").

La parte comercial ("ventas") debe estar adaptada a lo que ofrece el usuario y a los hechos concretos de esta empresa (cita los hechos que la justifican en "evidencia"):
- puntosDeDolor: problemas probables que la oferta del usuario resuelve.
- propuestaDeValor: 2-3 frases, personalizada.
- ganchosApertura: frases para romper el hielo basadas en hechos recientes de la empresa.
- preguntasDescubrimiento: preguntas abiertas que hagan aflorar la necesidad.
- objeciones: las más probables y cómo responderlas.
- estrategiaCierre: cómo conducir la reunión hacia un compromiso.
- siguientePaso: el compromiso concreto que hay que pedir al final.
- emailSeguimiento: email breve para enviar tras la reunión, en español, tono profesional y cercano, con marcadores [entre corchetes] para lo que el usuario deba completar.

- Los riesgos delicados (deudas, litigios, pérdidas, concursos) van en "senales" para el usuario, pero no los uses en ganchos ni preguntas: solo se tratan si el cliente saca el tema.

Además:
- quienDecide: la persona u órgano que probablemente decide la contratación, con su certeza y la pregunta para confirmarlo en la reunión.
- datosPendientes: los datos importantes que no se han podido encontrar (como mucho cinco), dónde se buscaron y cómo conseguirlos (preguntarlo en la reunión, pedir un documento, fuente de pago).
- documentosAPedir: documentos concretos que conviene pedir al cliente (por ejemplo, últimas cuentas anuales aprobadas, impuesto de sociedades, organigrama societario).
- Marca en el texto como "(probable)" los datos que vengan de prensa, rankings o fichas de agregadores sin confirmar, y di cuándo un dato es del grupo y no de la sociedad.

En "fuentes" incluye las URLs realmente usadas.`;

function describirCif(info: CifInfo): string {
  if (!info.valido) return `El usuario ha introducido "${info.cif}", que parece un CIF pero no es válido (${info.motivo}).`;
  return `CIF ${info.cif} (válido). Forma jurídica según la letra: ${info.formaJuridica}. Provincia donde se asignó: ${info.provinciaInscripcion ?? 'desconocida'}.`;
}

// El modo exprés reduce búsquedas y esfuerzo para cuando la reunión es inminente.
const LIMITES = {
  completo: { busquedas: 15, lecturas: 10, esfuerzo: 'high' },
  expres: { busquedas: 6, lecturas: 4, esfuerzo: 'medium' },
} as const;

async function investigar(consulta: string, cif: CifInfo | null, expres: boolean, emitir: Emitir) {
  const limites = expres ? LIMITES.expres : LIMITES.completo;
  const pista = cif ? `\n\nDatos ya conocidos: ${describirCif(cif)}` : '';
  const foco = expres
    ? '\n\nModo exprés: la reunión es inminente. Céntrate en identificación, quién decide, tamaño aproximado y noticias del último año.'
    : '';
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: 'user', content: `Empresa a investigar: ${consulta}${pista}${foco}` },
  ];
  const fuentes = new Map<string, string>();

  for (let intento = 0; intento <= MAX_REANUDACIONES; intento++) {
    const stream = client.beta.messages.stream({
      model: MODELO,
      max_tokens: 64000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: limites.esfuerzo },
      system: PROMPT_INVESTIGACION,
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: limites.busquedas, user_location: { type: 'approximate', country: 'ES' } },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: limites.lecturas },
      ],
      messages,
    });

    stream.on('contentBlock', (bloque) => {
      if (bloque.type === 'server_tool_use') {
        const input = bloque.input as { query?: string; url?: string };
        if (bloque.name === 'web_search' && input.query) emitir({ tipo: 'busqueda', consulta: input.query });
        else if (bloque.name === 'web_fetch' && input.url) emitir({ tipo: 'lectura', url: input.url });
      } else if (bloque.type === 'web_search_tool_result' && Array.isArray(bloque.content)) {
        for (const r of bloque.content) {
          if (r.type === 'web_search_result') fuentes.set(r.url, r.title);
        }
      }
    });

    const respuesta = await stream.finalMessage();

    if (respuesta.stop_reason === 'refusal') {
      throw new Error('El modelo no ha podido completar la investigación de esta empresa.');
    }
    if (respuesta.stop_reason === 'pause_turn') {
      emitir({ tipo: 'progreso', mensaje: 'Continuando la investigación…' });
      messages.push({ role: 'assistant', content: respuesta.content });
      continue;
    }

    const notas = respuesta.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return { notas, fuentes };
  }
  throw new Error('La investigación ha superado el número máximo de pasos.');
}

async function construirDossier(
  peticion: PeticionInvestigacion,
  notas: string,
  fuentes: Map<string, string>,
): Promise<Dossier> {
  const listaFuentes = [...fuentes].map(([url, titulo]) => `- ${titulo}: ${url}`).join('\n');
  const contenido = [
    `## Lo que ofrece el usuario\n${peticion.miOferta}`,
    peticion.contextoReunion ? `## Contexto de la reunión\n${peticion.contextoReunion}` : '',
    `## Notas de investigación\n${notas}`,
    listaFuentes ? `## Resultados de búsqueda consultados\n${listaFuentes}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const respuesta = await client.beta.messages.parse({
    model: MODELO,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: zodOutputFormat(DossierSchema) },
    system: PROMPT_DOSSIER,
    messages: [{ role: 'user', content: contenido }],
  });

  if (respuesta.stop_reason === 'refusal') {
    throw new Error('El modelo no ha podido generar el dossier.');
  }
  if (!respuesta.parsed_output) {
    throw new Error('No se ha podido interpretar el dossier generado.');
  }
  return respuesta.parsed_output;
}

export async function prepararDossier(peticion: PeticionInvestigacion, emitir: Emitir): Promise<void> {
  const consulta = peticion.consulta.trim();
  const cif = pareceCif(consulta) ? analizarCif(consulta) : null;
  if (cif) emitir({ tipo: 'cif', datos: cif });

  emitir({ tipo: 'progreso', mensaje: 'Buscando la empresa en registros públicos, prensa y web…' });
  const { notas, fuentes } = await investigar(consulta, cif, peticion.expres === true, emitir);

  emitir({ tipo: 'progreso', mensaje: 'Redactando el dossier y la estrategia de la reunión…' });
  const dossier = await construirDossier(peticion, notas, fuentes);
  emitir({ tipo: 'dossier', datos: dossier });
}
