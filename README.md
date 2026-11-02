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
3. Comprobación de tipos: `npm run typecheck`

## Calculadora de donaciones
Estima el coste fiscal (IRPF, ISD) de donar participaciones de padres a hijos en la Comunidad de Madrid.

`npm run build:artifact` genera `artifact/calculadora-donaciones.html`, la calculadora en un único archivo HTML para publicarla en claude.ai o abrirla en el navegador.

## Agente «director-financiero» (Claude Code)

En `.claude/agents/` hay un agente director financiero con dos subagentes especializados:

| Agente | Función |
|---|---|
| `director-financiero` | CFO externo de PYMES españolas. Lee y cuadra la documentación del cliente (cuentas anuales, sumas y saldos, pool bancario, CIRBE, cuadros de amortización), reparte el trabajo entre los subagentes, integra sus conclusiones y entrega un único informe. |
| `cfo-operativo` | Funciones de un director financiero: diagnóstico de liquidez (fondo de maniobra, NOF, ciclo de caja, previsión de tesorería), estructura del balance y de la deuda, decisiones operativas y preparación lícita del balance y del dosier para el banco (préstamos, pólizas, leasing, confirming, factoring, ICO, SGR, refinanciaciones), con simulación de ratios antes y después. |
| `valorador-empresas` | Valoración de la empresa o de un porcentaje de participaciones para compraventas, entrada o salida de socios, ampliaciones, donaciones o herencias: métodos patrimoniales, DCF con WACC, capitalización de beneficios, múltiplos, métodos mixtos (UEC, indirecto, anglosajón) y valores fiscales (art. 37.1.b LIRPF, art. 16 LIP, ISD). Explica cada cálculo y propone un rango, un valor recomendado y la estructura del precio. |

Cómo usarlo, dentro de este repositorio:

- Escriba `/director-financiero <encargo>` en una sesión de Claude Code, adjuntando o indicando la ruta de los documentos. Por ejemplo: `/director-financiero analiza las cuentas de 2023-2025 de docs/acme y prepara la solicitud de una póliza de 300.000 €`.
- O bien inicie Claude Code directamente como el agente: `claude --agent director-financiero`.
- Los subagentes también se pueden llamar por separado («usa el subagente valorador-empresas para…»).
