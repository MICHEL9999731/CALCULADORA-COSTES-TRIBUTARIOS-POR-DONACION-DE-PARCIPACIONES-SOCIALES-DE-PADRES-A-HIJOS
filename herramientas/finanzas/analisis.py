#!/usr/bin/env python3
"""Análisis financiero de una PYME española: liquidez, NOF, ciclo de caja, flujos,
endeudamiento, capacidad de devolución, riesgos mercantiles, ratios bancarios y
simulación de medidas sobre el balance (antes/después).

Uso:
    python3 herramientas/finanzas/analisis.py datos.json [--ajustes ajustes.json] [--json salida.json]

El informe en Markdown se escribe en la salida estándar.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pgc import (  # noqa: E402
    BALANCE_KEYS, ETIQUETA, MASA, PYG_KEYS, Datos, DatosError, cargar, div, fmt_eur, fmt_num, fmt_pct, fmt_x,
    magnitudes, tabla_md,
)

# Referencias orientativas que miran las entidades financieras para una PYME: (cómodo, alerta, mayor_es_mejor)
REFERENCIAS_BANCO = {
    "dfn_ebitda": (3.0, 4.5, False),
    "autonomia": (0.30, 0.15, True),
    "liquidez": (1.2, 1.0, True),
    "cobertura_intereses": (5.0, 2.0, True),
    "dscr": (1.3, 1.1, True),
}


def semaforo(valor: float | None, clave: str) -> str:
    if valor is None:
        return "n/d"
    bueno, malo, mayor = REFERENCIAS_BANCO[clave]
    if mayor:
        return "bien" if valor >= bueno else "débil" if valor <= malo else "vigilar"
    return "bien" if valor <= bueno else "débil" if valor >= malo else "vigilar"


# ---------------------------------------------------------------------------
# Ratios de un ejercicio
# ---------------------------------------------------------------------------

def ratios(v: dict[str, float], iva: float, empleados: float | None = None) -> dict[str, float | None]:
    m = magnitudes(v)
    ventas_iva = m["ventas"] * (1 + iva / 100)
    compras = -(v.get("aprovisionamientos", 0) + v.get("otros_gastos_explotacion", 0))
    consumo = -v.get("aprovisionamientos", 0)
    pmc = div(v.get("clientes", 0) * 365, ventas_iva)
    pmp = div(v.get("proveedores", 0) * 365, compras * (1 + iva / 100))
    pme = div(v.get("existencias", 0) * 365, consumo) if consumo > 0 else None
    ciclo = None if pmc is None or pmp is None else pmc + (pme or 0) - pmp
    return {
        "fm": m["fm"], "nof": m["nof"], "fm_menos_nof": m["fm"] - m["nof"],
        "liquidez": div(m["ac"], m["pc"]),
        "acida": div(m["ac"] - v.get("existencias", 0), m["pc"]),
        "tesoreria": div(m["liquidez"], m["pc"]),
        "autonomia": div(m["pn"], m["activo"]),
        "endeudamiento": div(m["pasivo"], m["pn"]) if m["pn"] > 0 else None,
        "peso_deuda_cp": div(m["deuda_fin_cp"], m["deuda_fin"]),
        "dfn": m["dfn"],
        "dfn_ebitda": div(m["dfn"], m["ebitda"]) if m["ebitda"] > 0 else None,
        "cobertura_intereses": div(m["ebitda"], m["gastos_financieros"]) if m["gastos_financieros"] > 0 else None,
        "coste_deuda": div(m["gastos_financieros"], m["deuda_fin"]),
        "margen_bruto": div(m["margen_bruto"], m["ventas"]),
        "margen_ebitda": div(m["ebitda"], m["ventas"]),
        "margen_neto": div(m["resultado"], m["ventas"]),
        "roe": div(m["resultado"], m["pn"]) if m["pn"] > 0 else None,
        "roa": div(m["ebit"], m["activo"]),
        "pmc": pmc, "pmp": pmp, "pme": pme, "ciclo_caja": ciclo,
        "ventas_empleado": div(m["ventas"], empleados) if empleados else None,
    }


def altman(v: dict[str, float], sector: str) -> tuple[str, float, str]:
    m = magnitudes(v)
    at = m["activo"] or 1
    pas = m["pasivo"] or 1
    x1 = m["fm"] / at
    x2 = (v.get("reservas", 0) + v.get("resultados_anteriores", 0)) / at
    x3 = m["ebit"] / at
    x4 = m["pn"] / pas
    x5 = m["ventas"] / at
    if sector == "industria":
        z = 0.717 * x1 + 0.847 * x2 + 3.107 * x3 + 0.42 * x4 + 0.998 * x5
        return "Z' (industrial no cotizada)", z, "riesgo" if z < 1.23 else "gris" if z < 2.9 else "segura"
    z = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4
    return "Z'' (no industrial)", z, "riesgo" if z < 1.1 else "gris" if z < 2.6 else "segura"


# ---------------------------------------------------------------------------
# Flujos de efectivo (método indirecto, por diferencias de balance)
# ---------------------------------------------------------------------------

def flujos(n: dict[str, float], n1: dict[str, float]) -> dict[str, float]:
    d = lambda k: n.get(k, 0) - n1.get(k, 0)  # noqa: E731
    m = magnitudes(n)
    amort = m["amortizacion"]
    deterioro = n.get("deterioro_enajenacion_inmovilizado", 0)
    var_circulante = (-d("existencias") - d("clientes") - d("otros_deudores") - d("periodificaciones_activo")
                      - d("activos_impuesto_diferido") - d("otros_activos_no_corrientes")
                      + d("proveedores") + d("otros_acreedores") + d("periodificaciones_pasivo_cp")
                      + d("periodificaciones_lp") + d("pasivos_impuesto_diferido")
                      + d("provisiones_cp") + d("provisiones_lp"))
    explotacion = m["resultado"] + amort - deterioro + var_circulante
    capex = d("inmovilizado_intangible") + d("inmovilizado_material") + d("inversiones_inmobiliarias") + amort - deterioro
    otras_inv = d("inversiones_grupo_lp") + d("inversiones_financieras_lp") + d("inversiones_grupo_cp") + d("inversiones_financieras_cp") + d("activos_mantenidos_venta") - d("pasivos_mantenidos_venta")
    inversion = -capex - otras_inv
    deuda = sum(d(k) for k in ("deudas_bancarias_lp", "deudas_bancarias_cp", "leasing_lp", "leasing_cp",
                                "otras_deudas_lp", "otras_deudas_cp", "deudas_grupo_lp", "deudas_grupo_cp"))
    aportaciones = d("capital") + d("prima_emision") + d("otras_aportaciones_socios") + d("acciones_propias")
    otros_pn = d("subvenciones") + d("ajustes_cambio_valor")
    pn_var = magnitudes(n)["pn"] - magnitudes(n1)["pn"]
    dividendos = pn_var - m["resultado"] - aportaciones - otros_pn  # negativo = reparto
    financiacion = deuda + aportaciones + otros_pn + dividendos
    neto = explotacion + inversion + financiacion
    real = d("efectivo")
    return {
        "explotacion": explotacion, "var_circulante": var_circulante, "capex": capex,
        "otras_inversiones": otras_inv, "inversion": inversion, "deuda": deuda,
        "aportaciones": aportaciones, "dividendos": -dividendos, "financiacion": financiacion,
        "variacion_calculada": neto, "variacion_real": real, "no_conciliado": real - neto,
        "flujo_libre": explotacion - capex,
    }


# ---------------------------------------------------------------------------
# Servicio de la deuda de los próximos 12 meses
# ---------------------------------------------------------------------------

def meses_hasta(año_cierre: int, ym: str | None) -> int | None:
    """Meses desde el 1 de enero de N+1 hasta el mes indicado ("AAAA-MM"), incluido."""
    if not ym:
        return None
    try:
        a, mm = ym.strip().split("-")[:2]
        return (int(a) - (año_cierre + 1)) * 12 + int(mm)
    except (ValueError, AttributeError):
        return None


def servicio_deuda(d: Datos) -> dict:
    n = d.ejercicios[0]
    m = magnitudes(n.v)
    lineas, renovar, avisos = [], [], []
    principal = interes = renting = limite = dispuesto = 0.0
    con_detalle = False
    for x in d.deuda:
        tipo = x.get("tipo", "otro")
        pend = x.get("pendiente") or 0.0
        tasa = (x.get("tipo_interes") or 0.0) / 100
        cuota = x.get("cuota_mensual")
        meses = meses_hasta(n.año, x.get("vencimiento"))
        nombre = f"{x.get('entidad', '')} {x.get('descripcion', '')}".strip() or tipo
        if tipo == "renting":
            renting += (cuota or 0) * (min(12, meses) if meses is not None and meses > 0 else 12)
            continue
        if tipo in ("poliza", "descuento"):
            limite += x.get("limite") or 0.0
            dispuesto += pend
            interes += pend * tasa
            if meses is not None and meses <= 12:
                renovar.append(f"{nombre}: vence {x.get('vencimiento')} (dispuesto {fmt_eur(pend)} de {fmt_eur(x.get('limite'))})")
            continue
        con_detalle = True
        n_meses = 12 if meses is None else max(0, min(12, meses))
        int_12 = pend * tasa * n_meses / 12
        if cuota:
            pri_12 = min(max(cuota * n_meses - int_12, 0.0), pend)
        elif meses is not None and meses <= 12:
            pri_12 = pend
        else:
            pri_12 = 0.0
            avisos.append(f"{nombre}: sin cuota mensual; no se estima su amortización de los próximos 12 meses.")
        if meses is not None and meses <= 12 and pend - pri_12 > 1:
            avisos.append(f"{nombre}: vence en {meses} meses con {fmt_eur(pend - pri_12)} pendientes (cuota final elevada o renovación).")
        principal += pri_12
        interes += int_12
        lineas.append({"nombre": nombre, "tipo": tipo, "pendiente": pend, "principal_12m": pri_12, "interes_12m": int_12,
                       "tipo_interes": x.get("tipo_interes"), "garantia": x.get("garantia", "")})
    fuente = "cuadro de deuda"
    if not con_detalle:
        principal = n["deudas_bancarias_cp"] + n["leasing_cp"]
        interes = m["gastos_financieros"]
        fuente = "balance (deuda bancaria y leasing a CP; incluye pólizas, por lo que el DSCR es conservador)"
    impuesto_pagado = max(-m["impuesto"], 0)
    dscr = div(m["ebitda"] - impuesto_pagado, principal + interes) if principal + interes > 0 else None
    detallada = sum(l["pendiente"] for l in lineas) + dispuesto
    if d.deuda and abs(detallada - m["deuda_fin"]) > max(1000, 0.02 * m["deuda_fin"]):
        avisos.append(f"La deuda detallada ({fmt_eur(detallada)}) no coincide con la deuda financiera del balance "
                      f"({fmt_eur(m['deuda_fin'])}): falta alguna operación o el balance la clasifica de otra forma.")
    return {"lineas": lineas, "principal_12m": principal, "interes_12m": interes, "renting_12m": renting,
            "limite_polizas": limite, "dispuesto_polizas": dispuesto, "disponible_polizas": max(limite - dispuesto, 0),
            "renovar_12m": renovar, "dscr": dscr, "fuente": fuente, "avisos": avisos}


# ---------------------------------------------------------------------------
# Capacidad de endeudamiento
# ---------------------------------------------------------------------------

def capacidad_endeudamiento(v: dict[str, float], servicio: dict, objetivo_dfn_ebitda: float = 3.0,
                            dscr_min: float = 1.3, plazo_años: int = 5, tipo: float = 0.05) -> dict:
    m = magnitudes(v)
    por_apalancamiento = max(0.0, objetivo_dfn_ebitda * m["ebitda"] - m["dfn"])
    # Cuota anual de un préstamo francés de 1 € a 'plazo_años'
    cuota_unit = tipo / (1 - (1 + tipo) ** -plazo_años)
    caja_disponible = (m["ebitda"] - max(-m["impuesto"], 0)) / dscr_min - (servicio["principal_12m"] + servicio["interes_12m"])
    por_dscr = max(0.0, caja_disponible / cuota_unit)
    return {"por_apalancamiento": por_apalancamiento, "por_dscr": por_dscr, "maximo": min(por_apalancamiento, por_dscr),
            "supuestos": f"DFN/EBITDA ≤ {fmt_x(objetivo_dfn_ebitda)}, DSCR ≥ {fmt_num(dscr_min, 1)}, "
                         f"préstamo a {plazo_años} años al {fmt_pct(tipo)}"}


# ---------------------------------------------------------------------------
# Simulación de medidas sobre el balance
# ---------------------------------------------------------------------------

def aplicar_ajustes(v: dict[str, float], ajustes: list[dict]) -> list[dict]:
    """Aplica los ajustes acumulativamente. Cada ajuste: {"concepto": str, "movimientos": {partida: variación}}.
    Las variaciones de balance deben cuadrar (Δ activo = Δ PN + Δ pasivo)."""
    pasos = []
    actual = dict(v)
    for i, a in enumerate(ajustes):
        movs = a.get("movimientos") or {}
        desconocidas = set(movs) - BALANCE_KEYS - PYG_KEYS
        if desconocidas:
            raise DatosError(f"Ajuste {i + 1} «{a.get('concepto')}»: partidas desconocidas {sorted(desconocidas)}.")
        d_activo = sum(x for k, x in movs.items() if k in BALANCE_KEYS and MASA[k] in ("anc", "ac"))
        d_pasivo = sum(x for k, x in movs.items() if k in BALANCE_KEYS and MASA[k] in ("pn", "pnc", "pc"))
        if abs(d_activo - d_pasivo) > 1:
            raise DatosError(f"Ajuste {i + 1} «{a.get('concepto')}» no cuadra: Δ activo {fmt_eur(d_activo)} ≠ "
                             f"Δ PN + pasivo {fmt_eur(d_pasivo)}.")
        for k, x in movs.items():
            actual[k] = actual.get(k, 0) + x
        pasos.append({"concepto": a.get("concepto", f"Ajuste {i + 1}"), "movimientos": movs, "v": dict(actual),
                      "justificacion": a.get("justificacion", "")})
    return pasos


# ---------------------------------------------------------------------------
# Informe
# ---------------------------------------------------------------------------

def informe(d: Datos, ajustes: list[dict] | None = None) -> tuple[str, dict]:
    e = d.empresa
    iva = float(e.get("iva", 21))
    ejs = d.ejercicios
    n = ejs[0]
    mN = magnitudes(n.v)
    out: list[str] = [f"# Análisis financiero — {e.get('nombre') or 'Empresa'}",
                      f"Ejercicios: {', '.join(str(x.año) for x in ejs)} · Sector: {e['sector']} · Forma jurídica: {e['forma_juridica']}"]
    res: dict = {"empresa": e, "ejercicios": {}}
    if d.avisos:
        out += ["", "## Avisos sobre los datos", *[f"- {a}" for a in d.avisos]]

    # Magnitudes y ratios por ejercicio
    filas_m = [("Ventas", "ventas"), ("EBITDA", "ebitda"), ("EBIT", "ebit"), ("Resultado neto", "resultado"),
               ("Activo total", "activo"), ("Patrimonio neto", "pn"), ("Deuda financiera", "deuda_fin"),
               ("Deuda financiera neta", "dfn"), ("Fondo de maniobra", "fm"), ("NOF", "nof")]
    mags = {x.año: magnitudes(x.v) for x in ejs}
    rats = {x.año: ratios(x.v, iva, x.empleados) for x in ejs}
    out += ["", "## Magnitudes", tabla_md(["Concepto"] + [str(x.año) for x in ejs],
                                          [[lab] + [fmt_eur(mags[x.año][k]) for x in ejs] for lab, k in filas_m])]
    defs = [
        ("Liquidez (AC/PC)", "liquidez", fmt_x), ("Prueba ácida", "acida", fmt_x), ("Tesorería", "tesoreria", fmt_x),
        ("FM − NOF (déficit si negativo)", "fm_menos_nof", fmt_eur),
        ("PN / Activo", "autonomia", fmt_pct), ("Pasivo / PN", "endeudamiento", fmt_x),
        ("Deuda a CP / deuda financiera", "peso_deuda_cp", fmt_pct), ("DFN / EBITDA", "dfn_ebitda", fmt_x),
        ("EBITDA / gastos financieros", "cobertura_intereses", fmt_x), ("Coste aparente de la deuda", "coste_deuda", fmt_pct),
        ("Margen bruto", "margen_bruto", fmt_pct), ("Margen EBITDA", "margen_ebitda", fmt_pct), ("Margen neto", "margen_neto", fmt_pct),
        ("ROE", "roe", fmt_pct), ("ROA (EBIT/activo)", "roa", fmt_pct),
        ("Periodo medio de cobro (días)", "pmc", lambda x: fmt_num(x)), ("Periodo medio de pago (días)", "pmp", lambda x: fmt_num(x)),
        ("Periodo medio de existencias (días)", "pme", lambda x: fmt_num(x)), ("Ciclo de caja (días)", "ciclo_caja", lambda x: fmt_num(x)),
        ("Ventas por empleado", "ventas_empleado", fmt_eur),
    ]
    out += ["", "## Ratios", tabla_md(["Ratio"] + [str(x.año) for x in ejs],
                                      [[lab] + [f(rats[x.año][k]) for x in ejs] for lab, k, f in defs])]
    out.append("\nPeriodos de cobro y pago calculados sobre importes con IVA "
               f"({fmt_num(iva)} %); compras = aprovisionamientos + otros gastos de explotación. Plazo legal máximo entre empresas: 60 días (Ley 3/2004).")
    for x in ejs:
        res["ejercicios"][x.año] = {"magnitudes": mags[x.año], "ratios": rats[x.año]}

    # Flujos
    if len(ejs) >= 2:
        fl = {ejs[i].año: flujos(ejs[i].v, ejs[i + 1].v) for i in range(len(ejs) - 1)}
        anos = [x.año for x in ejs[:-1]]
        lineas = [("Flujo de explotación", "explotacion"), ("  de ello, variación del circulante", "var_circulante"),
                  ("Inversión en inmovilizado (capex)", "capex"), ("Flujo de caja libre", "flujo_libre"),
                  ("Variación de deuda financiera", "deuda"), ("Aportaciones de socios", "aportaciones"),
                  ("Dividendos y otras aplicaciones (estimado)", "dividendos"),
                  ("Variación de tesorería real", "variacion_real"), ("No conciliado", "no_conciliado")]
        out += ["", "## Flujos de efectivo (método indirecto)",
                tabla_md(["Concepto"] + [str(a) for a in anos], [[lab] + [fmt_eur(fl[a][k]) for a in anos] for lab, k in lineas])]
        for a in anos:
            res["ejercicios"][a]["flujos"] = fl[a]
            if abs(fl[a]["no_conciliado"]) > max(5, abs(mags[a]["activo"]) * 0.0005):
                out.append(f"- Aviso {a}: los flujos no concilian con la tesorería por {fmt_eur(fl[a]['no_conciliado'])} (revise los cuadres).")

    # Servicio de la deuda y capacidad
    sd = servicio_deuda(d)
    cap = capacidad_endeudamiento(n.v, sd)
    res["servicio_deuda"], res["capacidad_endeudamiento"] = sd, cap
    out += ["", "## Deuda y capacidad de devolución",
            f"- Fuente del servicio de la deuda: {sd['fuente']}.",
            f"- Principal a devolver en 12 meses: {fmt_eur(sd['principal_12m'])}; intereses: {fmt_eur(sd['interes_12m'])}.",
            f"- DSCR = (EBITDA − impuesto) / (principal + intereses) = ({fmt_eur(mN['ebitda'])} − {fmt_eur(max(-mN['impuesto'], 0))}) / "
            f"{fmt_eur(sd['principal_12m'] + sd['interes_12m'])} = **{fmt_x(sd['dscr'])}**."]
    if sd["limite_polizas"]:
        out.append(f"- Pólizas y líneas: límite {fmt_eur(sd['limite_polizas'])}, dispuesto {fmt_eur(sd['dispuesto_polizas'])}, disponible {fmt_eur(sd['disponible_polizas'])}.")
    if sd["renting_12m"]:
        out.append(f"- Cuotas de renting próximos 12 meses: {fmt_eur(sd['renting_12m'])} (gasto de explotación; el banco lo suma a la deuda).")
    out += [f"- A renovar en 12 meses: {r}" for r in sd["renovar_12m"]]
    out += [f"- Aviso: {a}" for a in sd["avisos"]]
    if sd["lineas"]:
        out += ["", tabla_md(["Operación", "Tipo", "Pendiente", "Principal 12 m", "Intereses 12 m", "Tipo %", "Garantía"],
                             [[l["nombre"], l["tipo"], fmt_eur(l["pendiente"]), fmt_eur(l["principal_12m"]), fmt_eur(l["interes_12m"]),
                               fmt_num(l["tipo_interes"], 2) if l["tipo_interes"] is not None else "n/d", l["garantia"]] for l in sd["lineas"]], 2)]
    out.append(f"- Capacidad de nueva deuda: {fmt_eur(cap['maximo'])} (por apalancamiento {fmt_eur(cap['por_apalancamiento'])}; "
               f"por DSCR {fmt_eur(cap['por_dscr'])}). Supuestos: {cap['supuestos']}.")

    # Riesgos mercantiles
    out += ["", "## Riesgos mercantiles y de solvencia"]
    cap_social = n["capital"]
    if cap_social > 0 and mN["pn"] < cap_social / 2:
        out.append(f"- **Causa de disolución (art. 363.1.e LSC)**: PN {fmt_eur(mN['pn'])} < 50 % del capital ({fmt_eur(cap_social / 2)}). "
                   "Para este cómputo los préstamos participativos suman al PN (art. 20 RDL 7/1996). Plazo de 2 meses para convocar junta.")
    if e.get("forma_juridica") == "SA" and cap_social > 0 and mN["pn"] < cap_social * 2 / 3:
        out.append("- **Reducción obligatoria de capital (art. 327 LSC, solo SA)** si el PN sigue por debajo de 2/3 del capital durante un ejercicio.")
    for x in ejs:
        modelo, z, zona = altman(x.v, e["sector"])
        out.append(f"- Altman {modelo} {x.año}: {fmt_num(z, 2)} → zona {zona}.")
    if mN["fm"] < mN["nof"]:
        out.append(f"- El fondo de maniobra no cubre las NOF: {fmt_eur(mN['nof'] - mN['fm'])} de circulante estructural financiado a corto plazo.")

    # Ratios bancarios
    rN = rats[n.año]
    banco = [("DFN / EBITDA", rN["dfn_ebitda"], "dfn_ebitda", fmt_x), ("PN / Activo", rN["autonomia"], "autonomia", fmt_pct),
             ("Liquidez", rN["liquidez"], "liquidez", fmt_x), ("Cobertura de intereses", rN["cobertura_intereses"], "cobertura_intereses", fmt_x),
             ("DSCR", sd["dscr"], "dscr", fmt_x)]
    out += ["", f"## Lo que verá el banco ({n.año})",
            tabla_md(["Indicador", "Valor", "Referencia cómoda", "Situación"],
                     [[lab, f(x), (("≥ " if REFERENCIAS_BANCO[k][2] else "≤ ") + f(REFERENCIAS_BANCO[k][0])), semaforo(x, k)] for lab, x, k, f in banco])]

    # Simulación
    if ajustes:
        pasos = aplicar_ajustes(n.v, ajustes)
        claves = [("Fondo de maniobra", "fm", fmt_eur), ("Liquidez", "liquidez", fmt_x), ("PN / Activo", "autonomia", fmt_pct),
                  ("Peso deuda CP", "peso_deuda_cp", fmt_pct), ("DFN", "dfn", fmt_eur), ("DFN / EBITDA", "dfn_ebitda", fmt_x)]
        cols = ["Antes"] + [f"+ {p['concepto']}" for p in pasos]
        valores = [rN] + [ratios(p["v"], iva, n.empleados) for p in pasos]
        out += ["", "## Simulación de medidas sobre el balance (acumulativas)",
                tabla_md(["Indicador"] + cols, [[lab] + [f(r[k]) for r in valores] for lab, k, f in claves])]
        for p in pasos:
            movs = ", ".join(f"{ETIQUETA[k]} {'+' if x >= 0 else ''}{fmt_eur(x)}" for k, x in p["movimientos"].items())
            out.append(f"- **{p['concepto']}**: {movs}. {p['justificacion']}")
        mm = magnitudes(pasos[-1]["v"])
        out.append(f"- Comprobación final: activo {fmt_eur(mm['activo'])} = PN + pasivo {fmt_eur(mm['pn_y_pasivo'])}.")
        res["simulacion"] = [{"concepto": p["concepto"], "ratios": r} for p, r in zip(pasos, valores[1:])]
    return "\n".join(out) + "\n", res


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("datos")
    ap.add_argument("--ajustes", help="JSON con la lista de medidas a simular sobre el último balance")
    ap.add_argument("--json", help="Guardar también los resultados en este archivo JSON")
    a = ap.parse_args(argv)
    try:
        d = cargar(a.datos)
        ajustes = None
        if a.ajustes:
            with open(a.ajustes, encoding="utf-8") as f:
                ajustes = json.load(f)
        md, res = informe(d, ajustes)
    except (DatosError, KeyError, json.JSONDecodeError) as ex:
        print(f"ERROR: {ex}", file=sys.stderr)
        return 2
    print(md)
    if a.json:
        Path(a.json).write_text(json.dumps(res, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
