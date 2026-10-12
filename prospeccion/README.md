# Prospección de clientes: prepara y cierra reuniones

Escribe el **nombre o el CIF** de una empresa española y la app prepara un dossier para la reunión:

- **Ficha de la empresa**: razón social, CIF, forma jurídica, domicilio, CNAE, objeto social, capital, estado, contacto.
- **Finanzas**: ventas, resultado y empleados de los últimos ejercicios publicados, con su fuente.
- **Personas clave y estructura societaria**: administradores, directivos, socios, grupo y sociedades vinculadas.
- **Actos del BORME**: nombramientos, ampliaciones de capital, fusiones, cambios de domicilio…
- **Noticias, presencia digital y competidores**, y señales de oportunidad o riesgo.
- **Estrategia comercial adaptada a lo que vendes**: puntos de dolor con su evidencia, propuesta de valor, frases de apertura, preguntas de descubrimiento, objeciones y respuestas, cómo cerrar, siguiente paso a pedir y email de seguimiento.

Además puedes copiar una chuleta, imprimir el dossier o guardarlo en PDF, y consultar los dossieres anteriores (se guardan en el navegador).

## Cómo funciona

1. Si introduces un CIF, el servidor comprueba el dígito de control y deduce la forma jurídica y la provincia, sin conexión.
2. Claude (`claude-opus-5-5`) investiga en internet con búsqueda web y lectura de páginas. Prioriza el BORME, fichas de empresa (infoempresa, einforma, axesor, librebor…), la web corporativa, LinkedIn y la prensa. La interfaz muestra en directo cada búsqueda.
3. Una segunda llamada convierte las notas en un dossier con esquema fijo (salida estructurada) y prepara la estrategia según el texto «Lo que ofreces», que se puede editar en la app.

## Puesta en marcha

Requisitos: Node.js 22 o superior y una clave de la API de Anthropic.

```bash
cd prospeccion
npm install
cp .env.example .env      # y pon tu ANTHROPIC_API_KEY
npm run dev               # API en :8787 y web en http://localhost:3001
```

Producción: `npm run build && npm start` sirve la web y la API en el puerto `PORT` (8787 por defecto).

Otros comandos: `npm test` (tests del validador de CIF) y `npm run typecheck`.

## Coste y tiempo

Cada investigación tarda entre 1 y 3 minutos y hace hasta 15 búsquedas y 10 lecturas de páginas. El coste lo marcan los tokens del modelo y las búsquedas web de tu cuenta de Anthropic. Para abaratarlo, puedes usar otro modelo con `CLAUDE_MODEL` o bajar `max_uses` en `server/research.ts`.

## Limitaciones

- Solo usa información pública. Las cuentas anuales completas y las notas simples del Registro Mercantil son de pago y no se consultan.
- La IA puede equivocarse: cada dato lleva su fuente y el dossier indica su nivel de confianza. Comprueba los datos críticos antes de usarlos.
- Los datos personales de administradores y directivos están sujetos al RGPD. Úsalos solo para preparar el contacto profesional.

## Estructura

```
server/cif.ts        Validación y decodificación del CIF
server/research.ts   Investigación con Claude y construcción del dossier
server/index.ts      API (Express) que envía el progreso en NDJSON
shared/dossier.ts    Esquema del dossier (Zod), compartido por API y web
src/                 Interfaz React
```
