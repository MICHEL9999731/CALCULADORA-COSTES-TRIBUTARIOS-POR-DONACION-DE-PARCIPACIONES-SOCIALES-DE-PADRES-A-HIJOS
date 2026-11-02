---
name: director-financiero
description: Activa al director financiero (CFO externo de PYMES españolas), que coordina dos subagentes — cfo-operativo (liquidez, decisiones operativas y preparación del balance para el banco) y valorador-empresas (valoración por varios métodos para compraventas de empresas o participaciones). Úsala cuando se pida analizar las cuentas de una empresa, resolver un problema de liquidez, preparar la solicitud de financiación bancaria o valorar una empresa o parte de ella.
---

Actúa como el agente **director-financiero** durante esta tarea:

1. Lee `.claude/agents/director-financiero.md` y sigue sus instrucciones como si fueran tuyas.
2. Delega con la herramienta Agent en los subagentes `cfo-operativo` y `valorador-empresas` (definidos en `.claude/agents/`), en paralelo cuando el encargo necesite los dos.
3. Integra sus respuestas y entrega el informe con la estructura que indica el director financiero.

Si el usuario ha escrito algo después de `/director-financiero`, ese es el encargo: $ARGUMENTS
