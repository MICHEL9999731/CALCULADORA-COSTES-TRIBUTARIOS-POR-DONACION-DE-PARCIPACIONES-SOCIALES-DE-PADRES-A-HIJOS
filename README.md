<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1qUB1kF6F8BLRWHc0adlTcqwxi1ECgfKO

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Herramientas incluidas

### Dirección financiera
A partir del **balance y la cuenta de pérdidas y ganancias de dos ejercicios** (formato PGC) genera el informe de un director financiero:

- **Resumen ejecutivo** con una valoración global (0-100) y los principales indicadores.
- **Diagnóstico** de fortalezas y debilidades, y **plan de acción** priorizado con el impacto estimado en euros.
- **Análisis horizontal y vertical** del balance y de la PyG analítica (margen bruto, EBITDA, EBIT…).
- **Ratios** de liquidez, solvencia, rentabilidad (ROE, ROA, ROCE, apalancamiento), márgenes, circulante (PMC, PMP, existencias, ciclo de caja), crecimiento y productividad, valorados con referencias por sector.
- **Fondo de maniobra frente a NOF**, deuda financiera neta, capacidad de endeudamiento, DSCR y años de devolución.
- **Estado de flujos de efectivo** estimado (método indirecto), conciliado con la variación de tesorería.
- **Riesgo**: Z-score de Altman, punto muerto, causa de disolución (art. 363 LSC) y reducción obligatoria de capital (art. 327 LSC).
- **Simulador** de palancas (ventas, margen, costes, días de cobro/pago/existencias).
- Lista de **información a solicitar al cliente**.

Los datos se pueden introducir a mano, pegar desde Excel / el programa de contabilidad / el depósito de cuentas, o cargar con la plantilla CSV. Cada cliente se puede guardar y abrir en `.json`, y el informe se imprime o exporta a PDF.

El motor de cálculo está en `financial/engine.ts` y sus pruebas en `financial/engine.test.ts` (`npm test`).

### Calculadora de donaciones
Estima el coste fiscal (IRPF, ISD) de donar participaciones de padres a hijos en la Comunidad de Madrid.
