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
2. Run the app:
   `npm run dev`
3. Tests and checks: `npm test` y `npm run typecheck`

## Herramientas incluidas

### Dirección financiera
A partir del **balance y la cuenta de pérdidas y ganancias de 2 a 5 ejercicios** (formato PGC) y, opcionalmente, del **cuadro de financiación** (préstamos, hipotecas, leasing, renting, pólizas, préstamos de socios y aplazamientos), genera el informe de un director financiero:

- **Resumen ejecutivo** con una valoración global (0-100) y los principales indicadores.
- **Diagnóstico** de fortalezas y debilidades, y **plan de acción** priorizado con el impacto estimado en euros.
- **Análisis horizontal y vertical** del balance y de la PyG analítica (margen bruto, EBITDA, EBIT…).
- **Ratios** de liquidez, solvencia, rentabilidad (ROE, ROA, ROCE, apalancamiento), márgenes, circulante (PMC, PMP, existencias, ciclo de caja), crecimiento y productividad, valorados con referencias por sector.
- **Fondo de maniobra frente a NOF**, deuda financiera neta, capacidad de endeudamiento, DSCR y años de devolución.
- **Estado de flujos de efectivo** estimado (método indirecto), conciliado con la variación de tesorería.
- **Riesgo**: Z-score de Altman, punto muerto, causa de disolución (art. 363 LSC) y reducción obligatoria de capital (art. 327 LSC).
- **Evolución plurianual**: crecimiento medio anual, tendencias de márgenes, deuda, circulante y caja libre acumulada.
- **Calendario de deuda**: cuotas de principal, intereses y renting de los próximos 5 años frente a la caja operativa (DSCR por año), coste medio ponderado, disponible en pólizas, vencimientos a renovar, avales personales y deuda más cara a cancelar.
- **Simulador** de palancas (ventas, margen, costes, días de cobro/pago/existencias).
- Lista de **información a solicitar al cliente**.

Los datos se pueden introducir a mano, pegar desde Excel / el programa de contabilidad / el depósito de cuentas, o cargar con la plantilla CSV. El cuadro de financiación se puede pegar desde Excel (plantilla «Descargar cuadro de deuda»). Cada cliente se puede guardar y abrir en `.json`, y el informe se imprime o exporta a PDF.

El motor de cálculo está en `financial/engine.ts` y sus pruebas en `financial/engine.test.ts` (`npm test`).

### Calculadora de donaciones
Estima el coste fiscal (IRPF, ISD) de donar participaciones de padres a hijos en la Comunidad de Madrid.

## Usarlo sin instalar nada (claude.ai)

`npm run build:artifact` genera `artifact/direccion-financiera.html`, la aplicación completa en un único archivo, que se publica como Artifact en claude.ai. En esa versión:

- **Cargar documentos (Excel / PDF)**: lee cuentas anuales, balances, cuentas de resultados, cuadros de amortización, leasing, renting y pólizas, y rellena los datos. Los cuadros de amortización se comprueban fila a fila (pendiente anterior − amortización = pendiente; cuota = intereses + amortización) y las cuentas con el cuadre del balance y del resultado; si algo no cuadra se pide una relectura dirigida y lo que siga sin cuadrar se señala antes de aplicar. La lectura de PDF y de formatos libres usa Claude desde la propia página; en local solo se leen Excel/CSV con epígrafes del PGC.
- **Mis clientes** guarda cada cliente en el espacio privado del usuario en claude.ai (en local, en el navegador).
- **Descargar informe** genera un HTML con el informe completo; al abrirlo, Ctrl+P / Cmd+P lo guarda en PDF con fondo blanco.
- Las plantillas y el archivo `.json` del cliente se descargan con confirmación del usuario.
