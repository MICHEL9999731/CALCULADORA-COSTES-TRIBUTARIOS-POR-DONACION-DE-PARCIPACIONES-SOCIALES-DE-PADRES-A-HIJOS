#!/usr/bin/env python3
"""Valoración de una PYME española (o de un porcentaje de sus participaciones) por
métodos patrimoniales, DCF, capitalización de beneficios, múltiplos, mixtos y valores
fiscales de referencia, con explicación de cada cálculo, sensibilidad y conclusión.

Uso:
    python3 herramientas/finanzas/valoracion.py datos.json [--hipotesis hipotesis.json] [--json salida.json]

Todas las hipótesis tienen un valor automático; las que se indiquen en hipotesis.json
lo sustituyen (ver hipotesis_ejemplo.json). Porcentajes en tanto por ciento (3.3 = 3,3 %).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pgc import Datos, DatosError, cargar, div, fmt_eur, fmt_num, fmt_pct, fmt_x, magnitudes, tabla_md  # noqa: E402
from analisis import flujos  # noqa: E402

# Referencias sectoriales orientativas (PYMES españolas no cotizadas): beta desapalancada y múltiplos (bajo, central, alto).
SECTOR = {
    "industria": {"beta_u": 0.85, "ve_ebitda": (5, 6.5, 8), "ve_ventas": (0.5, 0.8, 1.1), "per": (8, 10.5, 13)},
    "comercio": {"beta_u": 0.75, "ve_ebitda": (4.5, 5.5, 7), "ve_ventas": (0.2, 0.35, 0.5), "per": (7, 9, 12)},
    "servicios": {"beta_u": 0.80, "ve_ebitda": (5, 6.5, 8), "ve_ventas": (0.6, 1.0, 1.4), "per": (8, 11, 14)},
    "construccion": {"beta_u": 0.80, "ve_ebitda": (4, 5, 6.5), "ve_ventas": (0.3, 0.45, 0.6), "per": (6, 8, 10)},
    "hosteleria": {"beta_u": 0.85, "ve_ebitda": (4, 5.5, 7), "ve_ventas": (0.5, 0.8, 1.1), "per": (7, 9, 12)},
    "agricultura": {"beta_u": 0.65, "ve_ebitda": (5, 6, 7.5), "ve_ventas": (0.4, 0.6, 0.8), "per": (8, 10, 12)},
    "tecnologia": {"beta_u": 1.10, "ve_ebitda": (7, 9.5, 12), "ve_ventas": (1.5, 2.5, 3.5), "per": (12, 16, 22)},
}

# Porcentaje del valor contable que se recupera en una liquidación ordenada (sin tasación).
RECUPERACION = {
    "inmovilizado_intangible": 0, "inmovilizado_material": 0.65, "inversiones_inmobiliarias": 0.9, "inversiones_grupo_lp": 0.8,
    "inversiones_financieras_lp": 0.9, "activos_impuesto_diferido": 0, "otros_activos_no_corrientes": 0.5,
    "activos_mantenidos_venta": 0.8, "existencias": 0.5, "clientes": 0.85, "otros_deudores": 0.7, "inversiones_grupo_cp": 0.8,
    "inversiones_financieras_cp": 0.95, "periodificaciones_activo": 0, "efectivo": 1,
}

PESOS_POR_PERFIL = {
    "operativa": {"dcf": 35, "ve_ebitda": 25, "per": 10, "capitalizacion": 10, "uec": 10, "ajustado": 10},
    "patrimonial": {"ajustado": 60, "dcf": 15, "uec": 15, "ve_ebitda": 10},
    "perdidas": {"ajustado": 60, "liquidacion": 40},
}

HIPOTESIS = {  # clave: (etiqueta, unidad)
    "porcentaje": ("Porcentaje que se valora", "%"),
    "participaciones": ("Nº total de participaciones", "nº"),
    "base_beneficio": ("Beneficio de referencia (ultimo | media)", ""),
    "ajuste_retribucion_socios": ("Ajuste EBITDA por retribución de socios", "€"),
    "otros_ajustes_ebitda": ("Otros ajustes al EBITDA recurrente", "€"),
    "plusvalias_latentes": ("Plusvalías (−minusvalías) latentes", "€"),
    "plusvalias_no_operativas": ("…de ellas, en activos no operativos", "€"),
    "contingencias": ("Contingencias no registradas", "€"),
    "tipo_is": ("Tipo del Impuesto sobre Sociedades", "%"),
    "rf": ("Tipo sin riesgo (bono 10 años)", "%"),
    "prima_mercado": ("Prima de riesgo de mercado", "%"),
    "beta_u": ("Beta desapalancada", "x"),
    "prima_tamano": ("Prima por tamaño", "%"),
    "prima_especifica": ("Prima específica / iliquidez", "%"),
    "kd": ("Coste de la deuda antes de impuestos", "%"),
    "peso_deuda": ("D / (D + E) objetivo", "%"),
    "crecimiento_1": ("Crecimiento de ventas año 1", "%"),
    "g": ("Crecimiento a perpetuidad", "%"),
    "margen_ebitda": ("Margen EBITDA proyectado", "%"),
    "amort_ventas": ("Amortización / ventas", "%"),
    "capex_ventas": ("Capex / ventas (años 1-4)", "%"),
    "nof_ventas": ("NOF / ventas", "%"),
    "ve_ebitda": ("Múltiplo VE/EBITDA", "x"),
    "ve_ventas": ("Múltiplo VE/Ventas", "x"),
    "per": ("PER", "x"),
    "anos_fondo_comercio": ("Años de superbeneficio (mixtos)", "años"),
    "descuento_minoria": ("Descuento por falta de control", "%"),
    "descuento_iliquidez": ("Descuento por iliquidez", "%"),
    "prima_control": ("Prima de control", "%"),
}


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def mean(xs):
    xs = list(xs)
    return sum(xs) / len(xs) if xs else 0.0


def renta(r: float, n: int) -> float:
    """Valor actual de una renta unitaria pospagable de n años al tipo r."""
    return float(n) if r == 0 else (1 - (1 + r) ** -n) / r


def tamano_prima(ventas: float) -> float:
    return 5 if ventas < 2e6 else 4 if ventas < 10e6 else 3 if ventas < 50e6 else 2 if ventas < 250e6 else 1


# ---------------------------------------------------------------------------
# Hipótesis automáticas
# ---------------------------------------------------------------------------

def hipotesis_automaticas(d: Datos, ov: dict) -> tuple[dict, dict]:
    ejs = d.ejercicios
    n = ejs[0]
    m = magnitudes(n.v)
    ref = SECTOR[d.empresa["sector"]]
    h, por_que = {}, {}
    h["porcentaje"] = 100
    h["participaciones"] = d.empresa.get("participaciones") or 0
    h["base_beneficio"] = "ultimo"
    for k in ("ajuste_retribucion_socios", "otros_ajustes_ebitda", "plusvalias_latentes", "plusvalias_no_operativas", "contingencias"):
        h[k] = 0
    h["tipo_is"] = 25
    por_que["tipo_is"] = "Tipo general del IS (art. 29 LIS); revise si es entidad de reducida dimensión o microempresa."
    h["rf"] = 3.3
    por_que["rf"] = "Orientativo: sustitúyalo por la rentabilidad del bono español a 10 años a la fecha de valoración."
    h["prima_mercado"] = 6.0
    h["beta_u"] = ref["beta_u"]
    por_que["beta_u"] = f"Referencia orientativa del sector {d.empresa['sector']} (contrastar con Damodaran, Europa)."
    h["prima_tamano"] = tamano_prima(m["ventas"])
    por_que["prima_tamano"] = f"Según cifra de negocios {fmt_eur(m['ventas'])}."
    h["prima_especifica"] = 3.0 if len(ejs) < 3 else 2.0
    por_que["prima_especifica"] = "Iliquidez de una sociedad no cotizada" + (" y menos de 3 ejercicios de histórico." if len(ejs) < 3 else ".")
    deuda_media = mean([m["deuda_fin"], magnitudes(ejs[1].v)["deuda_fin"]]) if len(ejs) > 1 else m["deuda_fin"]
    con_tipo = [x for x in d.deuda if x.get("tipo") != "renting" and x.get("tipo_interes") is not None and (x.get("pendiente") or 0) > 0]
    if con_tipo:
        h["kd"] = round(sum(x["tipo_interes"] * x["pendiente"] for x in con_tipo) / sum(x["pendiente"] for x in con_tipo), 2)
        por_que["kd"] = "Tipo medio ponderado del cuadro de deuda (sin comisiones)."
    elif deuda_media > 0 and m["gastos_financieros"] > 0:
        h["kd"] = round(clamp(m["gastos_financieros"] / deuda_media * 100, 2, 12), 2)
        por_que["kd"] = "Gastos financieros / deuda financiera media (limitado entre 2 % y 12 %)."
    else:
        h["kd"] = 5.0
        por_que["kd"] = "Sin deuda con coste: referencia de mercado."
    pn_pos = max(m["pn"], 0)
    h["peso_deuda"] = round(clamp(m["deuda_fin"] / (m["deuda_fin"] + (pn_pos or m["deuda_fin"])) * 100, 0, 60), 0) if m["deuda_fin"] > 0 else 0
    por_que["peso_deuda"] = "Estructura actual a valor contable, con un máximo del 60 %."
    años = len(ejs) - 1
    v0, vN = ejs[-1]["ventas"], n["ventas"]
    cagr = (vN / v0) ** (1 / años) - 1 if años > 0 and v0 > 0 and vN > 0 else None
    h["crecimiento_1"] = round(clamp(cagr * 100, -5, 10), 1) if cagr is not None else 2.0
    por_que["crecimiento_1"] = f"Crecimiento medio anual histórico ({fmt_pct(cagr)}), limitado entre −5 % y 10 %." if cagr is not None else "Sin histórico: 2 %."
    h["g"] = 2.0
    ult3 = [x for x in ejs[:3] if x["ventas"] > 0]
    adj = ov.get("ajuste_retribucion_socios", 0) + ov.get("otros_ajustes_ebitda", 0)
    ventas_media = mean(x["ventas"] for x in ult3) if ult3 else 0
    h["margen_ebitda"] = round((mean(magnitudes(x.v)["ebitda"] / x["ventas"] for x in ult3) + (adj / ventas_media if ventas_media else 0)) * 100, 1) if ult3 else 0
    por_que["margen_ebitda"] = f"Media de {len(ult3)} ejercicio(s) más los ajustes de normalización."
    h["amort_ventas"] = round(mean(magnitudes(x.v)["amortizacion"] / x["ventas"] for x in ult3) * 100, 1) if ult3 else 0
    capex_hist = [flujos(ejs[i].v, ejs[i + 1].v)["capex"] / ejs[i]["ventas"] for i in range(min(3, len(ejs) - 1)) if ejs[i]["ventas"] > 0]
    h["capex_ventas"] = round(max(mean(capex_hist) if capex_hist else 0, h["amort_ventas"] / 100) * 100 if capex_hist else h["amort_ventas"], 1)
    por_que["capex_ventas"] = "Media histórica, como mínimo igual a la amortización; converge a amortización × (1+g) en el año 5."
    h["nof_ventas"] = round(clamp(m["nof"] / m["ventas"], -0.5, 1) * 100, 1) if m["ventas"] > 0 else 0
    por_que["nof_ventas"] = "NOF del último ejercicio sobre sus ventas."
    h["ve_ebitda"], h["ve_ventas"], h["per"] = ref["ve_ebitda"][1], ref["ve_ventas"][1], ref["per"][1]
    por_que["ve_ebitda"] = por_que["ve_ventas"] = por_que["per"] = "Valor central orientativo del sector; contraste con transacciones recientes."
    h["anos_fondo_comercio"] = 5
    h["descuento_minoria"] = 0
    h["descuento_iliquidez"] = 0
    h["prima_control"] = 0
    por_que["descuento_minoria"] = "0 por defecto: decida según el paquete (habitual 10-30 % si no da control)."
    por_que["descuento_iliquidez"] = "0 por defecto: el Ke ya incluye una prima de iliquidez; evite duplicarla."
    return h, por_que


# ---------------------------------------------------------------------------
# Valoración
# ---------------------------------------------------------------------------

def valorar(d: Datos, ov: dict | None = None) -> dict:
    ov = dict(ov or {})
    desconocidas = set(ov) - set(HIPOTESIS) - {"pesos"}
    if desconocidas:
        raise DatosError(f"Hipótesis desconocidas: {sorted(desconocidas)}. Válidas: {', '.join(HIPOTESIS)}, pesos.")
    auto, por_que = hipotesis_automaticas(d, ov)
    H = {**auto, **{k: x for k, x in ov.items() if k != "pesos" and x is not None}}
    ejs = d.ejercicios
    n = ejs[0]
    mN = magnitudes(n.v)
    año = n.año
    t = clamp(H["tipo_is"], 0, 50) / 100
    ref = SECTOR[d.empresa["sector"]]
    avisos: list[str] = list(d.avisos)

    # --- Normalización --------------------------------------------------------
    base = ejs[:3] if H["base_beneficio"] == "media" else ejs[:1]
    mags = [magnitudes(x.v) for x in base]
    ebitda_rep = mean(x["ebitda"] for x in mags)
    amort = mean(x["amortizacion"] for x in mags)
    fin = mean(x.v.get("ingresos_financieros", 0) + x.v.get("gastos_financieros", 0) for x in base)
    ventas_base = mean(x["ventas"] for x in mags)
    ebitda = ebitda_rep + H["ajuste_retribucion_socios"] + H["otros_ajustes_ebitda"]
    ebit = ebitda - amort
    bai = ebit + fin
    beneficio = bai * (1 - t) if bai > 0 else bai
    normalizacion = [
        (f"EBITDA {'medio ' + str(base[-1].año) + '-' + str(base[0].año) if len(base) > 1 else base[0].año}", ebitda_rep),
        ("+ Ajuste por retribución de socios", H["ajuste_retribucion_socios"]),
        ("+ Otros ajustes", H["otros_ajustes_ebitda"]),
        ("= EBITDA normalizado", ebitda), ("− Amortización", -amort), ("= EBIT normalizado", ebit),
        ("± Resultado financiero ordinario", fin), (f"− Impuesto ({fmt_pct(t)})", -(bai * t if bai > 0 else 0)),
        ("= Beneficio neto normalizado (B)", beneficio),
    ]
    if mN["no_recurrente"]:
        normalizacion.insert(0, (f"(Resultados no recurrentes excluidos del EBITDA en {año})", mN["no_recurrente"]))

    # --- Puente VE → fondos propios --------------------------------------------
    no_operativos = mN["no_operativos"] + H["plusvalias_no_operativas"] * (1 - t)
    provisiones = n["provisiones_lp"]
    puente_total = -mN["dfn"] - provisiones + no_operativos - H["contingencias"]
    a_fp = lambda ve: ve + puente_total  # noqa: E731
    puente = [("− Deuda financiera neta", -mN["dfn"]), ("− Provisiones a largo plazo", -provisiones),
              ("+ Activos no operativos (contables + plusvalía neta)", no_operativos), ("− Contingencias", -H["contingencias"]),
              ("= Ajuste total (fondos propios = VE + ajuste)", puente_total)]

    # --- WACC -------------------------------------------------------------------
    peso_d = clamp(H["peso_deuda"], 0, 90) / 100
    beta_l = H["beta_u"] * (1 + (1 - t) * peso_d / (1 - peso_d))
    ke = (H["rf"] + beta_l * H["prima_mercado"] + H["prima_tamano"] + H["prima_especifica"]) / 100
    kd = H["kd"] / 100
    wacc = (1 - peso_d) * ke + peso_d * kd * (1 - t)
    g = H["g"] / 100
    rf = H["rf"] / 100
    wacc_txt = (f"βL = {fmt_num(H['beta_u'], 2)} × (1 + (1 − {fmt_pct(t)}) × {fmt_num(peso_d / (1 - peso_d), 2)}) = {fmt_num(beta_l, 2)}; "
                f"Ke = {fmt_pct(rf)} + {fmt_num(beta_l, 2)} × {fmt_pct(H['prima_mercado'] / 100)} + {fmt_pct(H['prima_tamano'] / 100)} + "
                f"{fmt_pct(H['prima_especifica'] / 100)} = {fmt_pct(ke, 2)}; "
                f"WACC = {fmt_pct(1 - peso_d, 0)} × {fmt_pct(ke, 2)} + {fmt_pct(peso_d, 0)} × {fmt_pct(kd, 2)} × (1 − {fmt_pct(t, 0)}) = {fmt_pct(wacc, 2)}")

    metodos: list[dict] = []

    def add(id_, familia, nombre, valor, bajo, alto, formula, calculo, explicacion, ve=None):
        lo_hi = [x for x in (bajo, alto) if x is not None]
        metodos.append({"id": id_, "familia": familia, "nombre": nombre, "aplicable": valor is not None, "valor": valor,
                        "bajo": min(lo_hi) if lo_hi else None, "alto": max(lo_hi) if lo_hi else None, "ve": ve,
                        "formula": formula, "calculo": calculo, "explicacion": explicacion, "peso": 0.0})

    # Patrimoniales
    add("contable", "Patrimonial", "Valor contable (patrimonio neto)", mN["pn"], mN["pn"], mN["pn"], "V = Activo − Pasivo exigible",
        f"PN {año} = {fmt_eur(mN['pn'])}", "Es el valor histórico de lo aportado y retenido. No recoge el fondo de comercio ni el valor de mercado de los activos.")
    ajustado = mN["pn"] + H["plusvalias_latentes"] * (1 - t) - H["contingencias"]
    add("ajustado", "Patrimonial", "Valor contable ajustado (sustancial neto)", ajustado,
        mN["pn"] + min(H["plusvalias_latentes"], 0) * (1 - t) - H["contingencias"], mN["pn"] + max(H["plusvalias_latentes"], 0) - H["contingencias"],
        "A = PN + plusvalías × (1 − t) − contingencias",
        f"{fmt_eur(mN['pn'])} + {fmt_eur(H['plusvalias_latentes'])} × (1 − {fmt_pct(t)}) − {fmt_eur(H['contingencias'])} = {fmt_eur(ajustado)}",
        "Lo que valen hoy los activos menos las deudas. Necesita tasaciones de inmuebles y participaciones. El extremo alto no descuenta el impuesto latente (si los activos no se van a vender).")
    recuperado = sum(max(n[k], 0) * r for k, r in RECUPERACION.items()) + H["plusvalias_latentes"]
    contable_activos = sum(max(n[k], 0) for k in RECUPERACION)
    exigible = mN["pasivo"] - n["pasivos_impuesto_diferido"] - n["periodificaciones_lp"]
    indemn = -n["gastos_personal"] * 0.25
    cierre = mN["activo"] * 0.03
    imp_liq = max(recuperado - contable_activos, 0) * t
    liq = recuperado - exigible - indemn - cierre - imp_liq
    add("liquidacion", "Patrimonial", "Valor de liquidación", liq, liq - cierre, liq + indemn * 0.5,
        "V = Valor de realización − pasivo exigible − indemnizaciones − costes de cierre − impuestos",
        f"{fmt_eur(recuperado)} − {fmt_eur(exigible)} − {fmt_eur(indemn)} − {fmt_eur(cierre)} − {fmt_eur(imp_liq)} = {fmt_eur(liq)}",
        "Valor si la empresa cesa y vende sus activos (recuperaciones estándar por tipo de activo, indemnizaciones ≈ 25 % del coste anual de personal, cierre 3 % del activo). Es el suelo del valor.")

    # DCF
    def dcf(w: float, gg: float):
        if w - gg < 0.01 or mN["ventas"] <= 0:
            return None
        g1, mg, da, cap, nof = H["crecimiento_1"] / 100, H["margen_ebitda"] / 100, H["amort_ventas"] / 100, max(H["capex_ventas"] / 100, 0), H["nof_ventas"] / 100
        filas, prev, va = [], mN["ventas"], 0.0
        for k in range(1, 6):
            cr = g1 + (gg - g1) * (k - 1) / 4
            ventas = prev * (1 + cr)
            e = ventas * mg
            a = ventas * da
            eb = e - a
            imp = max(eb, 0) * t
            ratio_capex = cap + (da * (1 + gg) - cap) * (k - 1) / 4
            cx = ventas * max(ratio_capex, 0)
            dn = (ventas - prev) * nof
            fcl = eb - imp + a - cx - dn
            fd = (1 + w) ** -k
            va += fcl * fd
            filas.append({"año": año + k, "crecimiento": cr, "ventas": ventas, "ebitda": e, "amortizacion": a, "ebit": eb,
                          "impuesto": imp, "capex": cx, "var_nof": dn, "fcl": fcl, "factor": fd, "va": fcl * fd})
            prev = ventas
        u = filas[-1]
        fcl6 = (u["ebit"] - u["impuesto"]) * (1 + gg) - (u["capex"] - u["amortizacion"]) * (1 + gg) - u["ventas"] * gg * nof
        vr = fcl6 / (w - gg)
        va_vr = vr * u["factor"]
        return {"filas": filas, "va_flujos": va, "fcl6": fcl6, "vr": vr, "va_vr": va_vr, "ve": va + va_vr}

    dcf_c = dcf(wacc, g) if H["margen_ebitda"] > 0 else None
    sens = None
    if dcf_c:
        ws = [wacc + x for x in (-0.01, -0.005, 0, 0.005, 0.01)]
        gs = [g + x for x in (-0.01, -0.005, 0, 0.005, 0.01)]
        sens = {"wacc": ws, "g": gs, "valores": [[(lambda r: a_fp(r["ve"]) if r else None)(dcf(w, gg)) for w in ws] for gg in gs]}
        lo, hi = dcf(wacc + 0.01, g - 0.005), dcf(wacc - 0.01, g + 0.005)
        peso_vr = div(dcf_c["va_vr"], dcf_c["ve"])
        add("dcf", "Rendimiento", "Descuento de flujos de caja libres (DCF)", a_fp(dcf_c["ve"]), a_fp(lo["ve"]) if lo else None, a_fp(hi["ve"]) if hi else None,
            "VE = Σ FCLt/(1+WACC)^t + [FCL6/(WACC − g)]/(1+WACC)^5; FP = VE − DFN + no operativos",
            f"VA flujos {fmt_eur(dcf_c['va_flujos'])} + VA valor residual {fmt_eur(dcf_c['va_vr'])} = VE {fmt_eur(dcf_c['ve'])}; "
            f"FP = {fmt_eur(dcf_c['ve'])} + ({fmt_eur(puente_total)}) = {fmt_eur(a_fp(dcf_c['ve']))}",
            f"Valora la caja que generará el negocio, descontada al coste de su financiación (WACC {fmt_pct(wacc, 2)}). Es el método de referencia en empresas con beneficios. "
            f"El valor residual supone el {fmt_pct(peso_vr)} del VE. Rango: WACC ±1 p.p. y g ±0,5 p.p.", dcf_c["ve"])
        if peso_vr and peso_vr > 0.8:
            avisos.append(f"El valor residual pesa el {fmt_pct(peso_vr)} del DCF: el resultado depende mucho de WACC y g.")
    else:
        add("dcf", "Rendimiento", "Descuento de flujos de caja libres (DCF)", None, None, None, "—", "—",
            "No aplicable: sin ventas, con margen EBITDA no positivo o con WACC − g inferior a 1 p.p.")

    # Capitalización
    if beneficio > 0 and ke - g > 0.01:
        cap = lambda k: beneficio * (1 + g) / (k - g)  # noqa: E731
        add("capitalizacion", "Rendimiento", "Capitalización del beneficio", cap(ke), cap(ke + 0.01), cap(ke - 0.01),
            "V = B × (1 + g) / (Ke − g)", f"{fmt_eur(beneficio)} × (1 + {fmt_pct(g)}) / ({fmt_pct(ke, 2)} − {fmt_pct(g)}) = {fmt_eur(cap(ke))}",
            "Valor de una renta creciente igual al beneficio normalizado, exigiendo la rentabilidad de los socios (Ke). Rango: Ke ±1 p.p.")
    else:
        add("capitalizacion", "Rendimiento", "Capitalización del beneficio", None, None, None, "V = B × (1 + g) / (Ke − g)", "—", "No aplicable: beneficio normalizado no positivo.")

    # Múltiplos
    def escala(banda, elegido):
        return elegido * banda[0] / banda[1], elegido * banda[2] / banda[1]
    if ebitda > 0:
        lo_m, hi_m = escala(ref["ve_ebitda"], H["ve_ebitda"])
        ve = ebitda * H["ve_ebitda"]
        add("ve_ebitda", "Mercado", "Múltiplo VE / EBITDA", a_fp(ve), a_fp(ebitda * lo_m), a_fp(ebitda * hi_m), "FP = EBITDA × múltiplo − DFN + no operativos",
            f"{fmt_eur(ebitda)} × {fmt_x(H['ve_ebitda'])} = VE {fmt_eur(ve)}; FP = {fmt_eur(a_fp(ve))}",
            f"Precio que se paga en operaciones de PYMES comparables por cada euro de EBITDA. Rango {fmt_x(lo_m)} – {fmt_x(hi_m)}.", ve)
    else:
        add("ve_ebitda", "Mercado", "Múltiplo VE / EBITDA", None, None, None, "—", "—", "No aplicable: EBITDA normalizado no positivo.")
    if ventas_base > 0:
        lo_m, hi_m = escala(ref["ve_ventas"], H["ve_ventas"])
        ve = ventas_base * H["ve_ventas"]
        add("ve_ventas", "Mercado", "Múltiplo VE / Ventas", a_fp(ve), a_fp(ventas_base * lo_m), a_fp(ventas_base * hi_m), "FP = Ventas × múltiplo − DFN + no operativos",
            f"{fmt_eur(ventas_base)} × {fmt_x(H['ve_ventas'])} = VE {fmt_eur(ve)}; FP = {fmt_eur(a_fp(ve))}",
            "Solo de contraste: ignora la rentabilidad.", ve)
    if beneficio > 0:
        lo_m, hi_m = escala(ref["per"], H["per"])
        add("per", "Mercado", "PER", beneficio * H["per"], beneficio * lo_m, beneficio * hi_m, "V = B × PER",
            f"{fmt_eur(beneficio)} × {fmt_x(H['per'])} = {fmt_eur(beneficio * H['per'])}", f"Años de beneficio que se pagan. Rango {fmt_x(lo_m)} – {fmt_x(hi_m)}.")
    else:
        add("per", "Mercado", "PER", None, None, None, "V = B × PER", "—", "No aplicable: beneficio normalizado no positivo.")

    # Mixtos
    nfc = max(1, int(round(H["anos_fondo_comercio"])))
    A, B = ajustado, beneficio
    if B > 0:
        uec = lambda k: (A + renta(k, nfc) * B) / (1 + rf * renta(k, nfc))  # noqa: E731
        ind = lambda k: (A + B / k) / 2  # noqa: E731
        ang = lambda k: A + (B - rf * A) / k  # noqa: E731
        rab = lambda k: A + renta(k, nfc) * (B - rf * A)  # noqa: E731
        an = renta(ke, nfc)
        add("uec", "Mixto", "Unión Europea de Expertos Contables (UEC)", uec(ke), uec(ke + 0.01), uec(ke - 0.01), "V = (A + aₙ·B) / (1 + i·aₙ)",
            f"aₙ = renta de {nfc} años al {fmt_pct(ke, 2)} = {fmt_num(an, 4)}; V = ({fmt_eur(A)} + {fmt_num(an, 4)} × {fmt_eur(B)}) / (1 + {fmt_pct(rf)} × {fmt_num(an, 4)}) = {fmt_eur(uec(ke))}",
            "Valor sustancial más el superbeneficio (beneficio por encima de la rentabilidad sin riesgo del propio valor) durante n años.")
        add("indirecto", "Mixto", "Método indirecto (alemán)", ind(ke), ind(ke + 0.01), ind(ke - 0.01), "V = (A + B/Ke) / 2",
            f"({fmt_eur(A)} + {fmt_eur(B)} / {fmt_pct(ke, 2)}) / 2 = {fmt_eur(ind(ke))}", "Media del valor sustancial y del valor de rendimiento.")
        add("anglosajon", "Mixto", "Método anglosajón (directo)", ang(ke), ang(ke + 0.01), ang(ke - 0.01), "V = A + (B − i·A) / Ke",
            f"{fmt_eur(A)} + ({fmt_eur(B)} − {fmt_pct(rf)} × {fmt_eur(A)}) / {fmt_pct(ke, 2)} = {fmt_eur(ang(ke))}",
            "Valor sustancial más el fondo de comercio capitalizado a perpetuidad.")
        add("renta_abreviada", "Mixto", "Renta abreviada del fondo de comercio", rab(ke), rab(ke + 0.01), rab(ke - 0.01), "V = A + aₙ · (B − i·A)",
            f"{fmt_eur(A)} + {fmt_num(an, 4)} × ({fmt_eur(B)} − {fmt_pct(rf)} × {fmt_eur(A)}) = {fmt_eur(rab(ke))}",
            "Valor sustancial más el superbeneficio limitado a n años.")
    else:
        for id_, nom in (("uec", "Unión Europea de Expertos Contables (UEC)"), ("indirecto", "Método indirecto (alemán)"),
                         ("anglosajon", "Método anglosajón (directo)"), ("renta_abreviada", "Renta abreviada del fondo de comercio")):
            add(id_, "Mixto", nom, None, None, None, "—", "—", "No aplicable: sin beneficio normalizado positivo no hay fondo de comercio.")

    # --- Perfil y ponderación -------------------------------------------------------
    peso_no_op = div(sum(n[k] for k in ("inversiones_inmobiliarias", "inversiones_financieras_lp", "inversiones_grupo_lp",
                                        "inversiones_financieras_cp", "inversiones_grupo_cp")), mN["activo"]) or 0
    if peso_no_op > 0.5:
        perfil = "patrimonial"
        perfil_txt = f"Sociedad de carácter patrimonial ({fmt_pct(peso_no_op)} del activo son inversiones inmobiliarias o financieras): prevalecen los métodos patrimoniales."
    elif ebitda <= 0 or beneficio <= 0:
        perfil = "perdidas"
        perfil_txt = "Sin beneficio normalizado positivo: el valor se apoya en el patrimonio; el de liquidación es el suelo."
    else:
        perfil = "operativa"
        perfil_txt = "Empresa operativa con beneficios: prevalecen DCF y múltiplos, contrastados con los mixtos y el patrimonio."
    pesos_in = ov.get("pesos") or PESOS_POR_PERFIL[perfil]
    validos = [x for x in metodos if x["aplicable"] and pesos_in.get(x["id"], 0) > 0]
    tot = sum(pesos_in[x["id"]] for x in validos)
    for x in validos:
        x["peso"] = pesos_in[x["id"]] / tot
    pond = lambda campo: sum(max(0.0, x[campo] if x[campo] is not None else x["valor"]) * x["peso"] for x in validos) if tot else None  # noqa: E731
    valor, bajo, alto = pond("valor"), pond("bajo"), pond("alto")
    negativos = [x["nombre"] for x in validos if x["valor"] < 0]
    if negativos:
        avisos.append(f"{', '.join(negativos)}: valor negativo (la deuda supera el valor del negocio); se computa como cero por la responsabilidad limitada.")

    # --- Valores fiscales -------------------------------------------------------------
    res3 = [(x.año, magnitudes(x.v)["resultado"]) for x in ejs[:3]]
    cap20 = mean(r for _, r in res3) / 0.20 if res3 else None
    nominal = n["capital"]
    min_irpf = max(mN["pn"], cap20 if cap20 is not None else float("-inf"))
    ip = mN["pn"] if d.empresa.get("auditada") else max(nominal, mN["pn"], cap20 if cap20 is not None else float("-inf"))
    if len(res3) < 3:
        avisos.append("Para la capitalización al 20 % se necesitan los resultados de los 3 últimos ejercicios cerrados; se ha usado la media de los disponibles.")

    # --- Conclusión ---------------------------------------------------------------------
    pct_val = clamp(H["porcentaje"], 0, 100) / 100
    part = H["participaciones"] or None
    factor_paquete = (1 - H["descuento_minoria"] / 100) * (1 - H["descuento_iliquidez"] / 100) * (1 + H["prima_control"] / 100)
    paquete = valor * pct_val * factor_paquete if valor is not None else None
    if valor is not None and valor * pct_val * factor_paquete < min_irpf * pct_val:
        avisos.append(f"El valor del paquete ({fmt_eur(paquete)}) es inferior al mínimo del art. 37.1.b LIRPF ({fmt_eur(min_irpf * pct_val)}) para el mismo porcentaje: "
                      "en una venta, salvo prueba de que el precio es de mercado, el vendedor tributaría por ese mínimo.")
    if abs(H["margen_ebitda"] / 100 - (div(mN["ebitda"], mN["ventas"]) or 0)) > 0.05:
        avisos.append("El margen EBITDA proyectado difiere en más de 5 p.p. del último ejercicio: justifíquelo.")
    if mN["no_operativos"] > 0:
        avisos.append(f"Se suman {fmt_eur(mN['no_operativos'])} de activos no operativos: si sus rentas están en el EBITDA (p. ej., alquileres), réstelas en «otros_ajustes_ebitda» para no contarlas dos veces.")
    if H["descuento_iliquidez"] > 0 and H["prima_especifica"] > 0:
        avisos.append("Se aplica descuento por iliquidez y además hay prima específica en el Ke: compruebe que no se duplica la penalización.")

    return {
        "empresa": d.empresa, "año": año, "hipotesis": H, "automaticas": auto, "por_que": por_que,
        "modificadas": sorted(k for k in ov if k != "pesos"), "perfil": perfil, "perfil_txt": perfil_txt,
        "normalizacion": normalizacion, "ebitda": ebitda, "beneficio": beneficio, "puente": puente, "puente_total": puente_total,
        "wacc": {"beta_l": beta_l, "ke": ke, "kd": kd, "wacc": wacc, "peso_deuda": peso_d, "texto": wacc_txt},
        "dcf": dcf_c, "sensibilidad": sens, "metodos": metodos,
        "fiscal": {"nominal": nominal, "teorico": mN["pn"], "resultados": res3, "cap20": cap20, "minimo_irpf": min_irpf, "ip": ip,
                   "auditada": bool(d.empresa.get("auditada"))},
        "conclusion": {"valor": valor, "bajo": bajo, "alto": alto, "porcentaje": pct_val, "factor_paquete": factor_paquete,
                       "paquete": paquete, "paquete_bajo": bajo * pct_val * factor_paquete if bajo is not None else None,
                       "paquete_alto": alto * pct_val * factor_paquete if alto is not None else None,
                       "participaciones": part, "por_participacion": valor / part if valor is not None and part else None,
                       "ve_ebitda_implicito": (valor - puente_total) / ebitda if valor is not None and ebitda > 0 else None,
                       "valor_pn": div(valor, mN["pn"]) if valor is not None and mN["pn"] > 0 else None},
        "avisos": avisos,
    }


# ---------------------------------------------------------------------------
# Informe
# ---------------------------------------------------------------------------

def fmt_h(x, unidad):
    if isinstance(x, str):
        return x
    return fmt_eur(x) if unidad == "€" else f"{fmt_num(x, 2)} %" if unidad == "%" else fmt_x(x) if unidad == "x" else fmt_num(x)


def informe(r: dict) -> str:
    e, c, f, w = r["empresa"], r["conclusion"], r["fiscal"], r["wacc"]
    o = [f"# Valoración — {e.get('nombre') or 'Empresa'}", f"Fecha de valoración: cierre {r['año']} · Sector: {e['sector']} · {r['perfil_txt']}", "",
         "## Conclusión"]
    if c["valor"] is None:
        o.append("No hay métodos aplicables con los datos disponibles.")
    else:
        o.append(f"- Valor de los fondos propios (100 %): **{fmt_eur(c['valor'])}** (rango {fmt_eur(c['bajo'])} – {fmt_eur(c['alto'])}).")
        if c["porcentaje"] < 1 or c["factor_paquete"] != 1:
            o.append(f"- Paquete del {fmt_pct(c['porcentaje'])}: {fmt_eur(c['valor'] * c['porcentaje'])} a prorrata; con descuentos/primas (factor {fmt_num(c['factor_paquete'], 3)}): "
                     f"**{fmt_eur(c['paquete'])}** (rango {fmt_eur(c['paquete_bajo'])} – {fmt_eur(c['paquete_alto'])}).")
        if c["por_participacion"]:
            o.append(f"- Por participación ({fmt_num(c['participaciones'])}): {fmt_eur(c['por_participacion'])} (a prorrata, sin descuentos).")
        o.append(f"- Contraste: VE/EBITDA implícito {fmt_x(c['ve_ebitda_implicito'])}; valor / PN contable {fmt_x(c['valor_pn'])}.")
    o += ["", tabla_md(["Método", "Valor FP (100 %)", "Rango", "Peso"],
                       [[x["nombre"], fmt_eur(x["valor"]) if x["aplicable"] else "no aplicable",
                         f"{fmt_eur(x['bajo'])} – {fmt_eur(x['alto'])}" if x["aplicable"] else "", fmt_pct(x["peso"], 0) if x["peso"] else ""] for x in r["metodos"]])]
    if r["avisos"]:
        o += ["", "## Puntos a revisar", *[f"- {a}" for a in r["avisos"]]]
    o += ["", "## Normalización", tabla_md(["Concepto", "Importe"], [[a, fmt_eur(b)] for a, b in r["normalizacion"]]),
          "", "## Del valor de empresa (VE) a los fondos propios (FP)", tabla_md(["Concepto", "Importe"], [[a, fmt_eur(b)] for a, b in r["puente"]]),
          "", "## Coste de capital", w["texto"] + "."]
    o += ["", "## Métodos"]
    for x in r["metodos"]:
        o += ["", f"### {x['nombre']} ({x['familia']})", x["explicacion"]]
        if x["aplicable"]:
            o += [f"- Fórmula: `{x['formula']}`", f"- Cálculo: {x['calculo']}"]
    d = r["dcf"]
    if d:
        cols = [str(z["año"]) for z in d["filas"]]
        filas = [("Crecimiento", "crecimiento", fmt_pct), ("Ventas", "ventas", fmt_eur), ("EBITDA", "ebitda", fmt_eur), ("Amortización", "amortizacion", fmt_eur),
                 ("EBIT", "ebit", fmt_eur), ("Impuesto s/ EBIT", "impuesto", fmt_eur), ("Capex", "capex", fmt_eur), ("Δ NOF", "var_nof", fmt_eur),
                 ("FCL = EBIT − imp + amort − capex − ΔNOF", "fcl", fmt_eur), ("Factor de descuento", "factor", lambda v: fmt_num(v, 4)), ("Valor actual", "va", fmt_eur)]
        o += ["", "## Proyección del DCF", tabla_md(["Concepto"] + cols, [[lab] + [fn(z[k]) for z in d["filas"]] for lab, k, fn in filas]),
              f"\nFCL año 6 = {fmt_eur(d['fcl6'])}; valor residual = {fmt_eur(d['fcl6'])} / ({fmt_pct(w['wacc'], 2)} − {fmt_pct(r['hipotesis']['g'] / 100)}) = {fmt_eur(d['vr'])}; "
              f"su valor actual = {fmt_eur(d['va_vr'])}. VE = {fmt_eur(d['ve'])}."]
        s = r["sensibilidad"]
        o += ["", "### Sensibilidad del valor de los fondos propios (filas: g; columnas: WACC)",
              tabla_md(["g \\ WACC"] + [fmt_pct(x, 1) for x in s["wacc"]], [[fmt_pct(gg)] + [fmt_eur(v) for v in fila] for gg, fila in zip(s["g"], s["valores"])])]
    o += ["", "## Valores fiscales de referencia (participaciones no cotizadas)",
          tabla_md(["Criterio", "100 %", "Base legal"], [
              ["Valor nominal", fmt_eur(f["nominal"]), "Capital escriturado"],
              ["Valor teórico contable", fmt_eur(f["teorico"]), f"PN del último balance cerrado ({r['año']})"],
              ["Capitalización al 20 % de los resultados", fmt_eur(f["cap20"]), "Media de " + ", ".join(f"{a}: {fmt_eur(b)}" for a, b in f["resultados"]) + " × 5"],
              ["Mínimo en venta (IRPF del vendedor)", fmt_eur(f["minimo_irpf"]), "Art. 37.1.b LIRPF: mayor de teórico y capitalización, salvo prueba de precio de mercado"],
              ["Impuesto sobre el Patrimonio", fmt_eur(f["ip"]), "Art. 16.Uno LIP" + (" (auditada: valor teórico)" if f["auditada"] else " (no auditada: mayor de nominal, teórico y capitalización)")],
          ], 1),
          "- Donación o herencia: el ISD grava el valor de mercado (art. 9 LISD) y la ganancia del donante se calcula con ese valor (art. 36 LIRPF), "
          "salvo que se aplique la reducción del art. 20.6 LISD, en cuyo caso no tributa la ganancia (art. 33.3.c LIRPF) y el donatario se subroga en el valor de adquisición.",
          "- Vendedor persona jurídica: exención del art. 21 LIS si se cumplen sus requisitos. Entre partes vinculadas: valor de mercado (art. 18 LIS).",
          "", "## Hipótesis utilizadas",
          tabla_md(["Hipótesis", "Valor", "Origen"], [[HIPOTESIS[k][0], fmt_h(r["hipotesis"][k], HIPOTESIS[k][1]),
                                                      "modificada" if k in r["modificadas"] else (r["por_que"].get(k) or "automática")] for k in HIPOTESIS], 1)]
    return "\n".join(o) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("datos")
    ap.add_argument("--hipotesis", help="JSON con las hipótesis que sustituyen a las automáticas")
    ap.add_argument("--json", help="Guardar también los resultados en este archivo JSON")
    a = ap.parse_args(argv)
    try:
        d = cargar(a.datos)
        ov = {}
        if a.hipotesis:
            with open(a.hipotesis, encoding="utf-8") as fh:
                ov = json.load(fh)
        r = valorar(d, ov)
    except (DatosError, KeyError, json.JSONDecodeError) as ex:
        print(f"ERROR: {ex}", file=sys.stderr)
        return 2
    print(informe(r))
    if a.json:
        Path(a.json).write_text(json.dumps(r, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
