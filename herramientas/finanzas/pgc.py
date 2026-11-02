"""Partidas del balance y de la PyG (PGC, modelo normal/abreviado), carga y validación
del archivo de datos del cliente y magnitudes de análisis comunes a las herramientas.

Formato del archivo de datos: ver plantilla_datos.json.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# Partidas
# ---------------------------------------------------------------------------

# (clave, masa, etiqueta). Masas: anc, ac, pn, pnc, pc.
BALANCE = [
    ("inmovilizado_intangible", "anc", "Inmovilizado intangible"),
    ("inmovilizado_material", "anc", "Inmovilizado material"),
    ("inversiones_inmobiliarias", "anc", "Inversiones inmobiliarias"),
    ("inversiones_grupo_lp", "anc", "Inversiones en empresas del grupo y asociadas a LP"),
    ("inversiones_financieras_lp", "anc", "Inversiones financieras a LP"),
    ("activos_impuesto_diferido", "anc", "Activos por impuesto diferido"),
    ("otros_activos_no_corrientes", "anc", "Otros activos no corrientes"),
    ("activos_mantenidos_venta", "ac", "Activos no corrientes mantenidos para la venta"),
    ("existencias", "ac", "Existencias"),
    ("clientes", "ac", "Clientes por ventas y prestaciones de servicios"),
    ("otros_deudores", "ac", "Otros deudores"),
    ("inversiones_grupo_cp", "ac", "Inversiones en empresas del grupo y asociadas a CP"),
    ("inversiones_financieras_cp", "ac", "Inversiones financieras a CP"),
    ("periodificaciones_activo", "ac", "Periodificaciones a CP (activo)"),
    ("efectivo", "ac", "Efectivo y otros activos líquidos equivalentes"),
    ("capital", "pn", "Capital"),
    ("prima_emision", "pn", "Prima de emisión"),
    ("reservas", "pn", "Reservas"),
    ("acciones_propias", "pn", "(Acciones y participaciones propias)"),
    ("resultados_anteriores", "pn", "Resultados de ejercicios anteriores"),
    ("otras_aportaciones_socios", "pn", "Otras aportaciones de socios (118)"),
    ("resultado_ejercicio", "pn", "Resultado del ejercicio"),
    ("dividendo_a_cuenta", "pn", "(Dividendo a cuenta)"),
    ("ajustes_cambio_valor", "pn", "Ajustes por cambios de valor"),
    ("subvenciones", "pn", "Subvenciones, donaciones y legados"),
    ("provisiones_lp", "pnc", "Provisiones a LP"),
    ("deudas_bancarias_lp", "pnc", "Deudas con entidades de crédito a LP"),
    ("leasing_lp", "pnc", "Acreedores por arrendamiento financiero a LP"),
    ("otras_deudas_lp", "pnc", "Otras deudas a LP (socios, terceros, proveedores de inmovilizado)"),
    ("deudas_grupo_lp", "pnc", "Deudas con empresas del grupo a LP"),
    ("pasivos_impuesto_diferido", "pnc", "Pasivos por impuesto diferido"),
    ("periodificaciones_lp", "pnc", "Periodificaciones a LP"),
    ("pasivos_mantenidos_venta", "pc", "Pasivos vinculados con activos mantenidos para la venta"),
    ("provisiones_cp", "pc", "Provisiones a CP"),
    ("deudas_bancarias_cp", "pc", "Deudas con entidades de crédito a CP (pólizas, descuento, vencimientos a CP)"),
    ("leasing_cp", "pc", "Acreedores por arrendamiento financiero a CP"),
    ("otras_deudas_cp", "pc", "Otras deudas a CP"),
    ("deudas_grupo_cp", "pc", "Deudas con empresas del grupo a CP"),
    ("proveedores", "pc", "Proveedores"),
    ("otros_acreedores", "pc", "Otros acreedores (personal, AAPP, anticipos…)"),
    ("periodificaciones_pasivo_cp", "pc", "Periodificaciones a CP (pasivo)"),
]
NEGATIVAS = {"acciones_propias", "dividendo_a_cuenta"}  # restan dentro del PN

# (clave, naturaleza, etiqueta). Naturaleza: ingreso (+), gasto (−), signo (se respeta).
PYG = [
    ("ventas", "ingreso", "Importe neto de la cifra de negocios"),
    ("variacion_existencias", "signo", "Variación de existencias de PT y en curso"),
    ("trabajos_para_activo", "ingreso", "Trabajos realizados por la empresa para su activo"),
    ("aprovisionamientos", "gasto", "Aprovisionamientos"),
    ("otros_ingresos_explotacion", "ingreso", "Otros ingresos de explotación"),
    ("gastos_personal", "gasto", "Gastos de personal"),
    ("otros_gastos_explotacion", "gasto", "Otros gastos de explotación"),
    ("amortizacion", "gasto", "Amortización del inmovilizado"),
    ("imputacion_subvenciones", "ingreso", "Imputación de subvenciones de inmovilizado"),
    ("excesos_provisiones", "ingreso", "Excesos de provisiones"),
    ("deterioro_enajenacion_inmovilizado", "signo", "Deterioro y resultado por enajenaciones del inmovilizado"),
    ("otros_resultados", "signo", "Otros resultados (excepcionales)"),
    ("ingresos_financieros", "ingreso", "Ingresos financieros"),
    ("gastos_financieros", "gasto", "Gastos financieros"),
    ("otros_resultados_financieros", "signo", "Otros resultados financieros"),
    ("impuesto_beneficios", "signo", "Impuesto sobre beneficios (gasto en negativo)"),
]

BALANCE_KEYS = {k for k, _, _ in BALANCE}
PYG_KEYS = {k for k, _, _ in PYG}
MASA = {k: m for k, m, _ in BALANCE}
ETIQUETA = {k: e for k, _, e in BALANCE} | {k: e for k, _, e in PYG}

DEUDA_LP = ["deudas_bancarias_lp", "leasing_lp", "otras_deudas_lp", "deudas_grupo_lp"]
DEUDA_CP = ["deudas_bancarias_cp", "leasing_cp", "otras_deudas_cp", "deudas_grupo_cp"]
AC_OPERATIVO = ["existencias", "clientes", "otros_deudores", "periodificaciones_activo"]
PC_OPERATIVO = ["proveedores", "otros_acreedores", "periodificaciones_pasivo_cp", "provisiones_cp"]
EBITDA_PARTIDAS = ["ventas", "variacion_existencias", "trabajos_para_activo", "aprovisionamientos",
                   "otros_ingresos_explotacion", "gastos_personal", "otros_gastos_explotacion"]
NO_RECURRENTES = ["imputacion_subvenciones", "excesos_provisiones", "deterioro_enajenacion_inmovilizado", "otros_resultados"]
NO_OPERATIVOS = ["inversiones_inmobiliarias", "inversiones_grupo_lp", "inversiones_financieras_lp",
                 "inversiones_grupo_cp", "activos_mantenidos_venta"]

SECTORES = ["industria", "comercio", "servicios", "construccion", "hosteleria", "agricultura", "tecnologia"]
TIPOS_DEUDA = ["prestamo", "hipoteca", "leasing", "renting", "poliza", "descuento", "socios", "aplazamiento", "otro"]


class DatosError(ValueError):
    """Error en el archivo de datos del cliente."""


# ---------------------------------------------------------------------------
# Carga y validación
# ---------------------------------------------------------------------------

def _num(x, donde: str) -> float:
    if x is None or x == "":
        return 0.0
    if isinstance(x, bool) or not isinstance(x, (int, float)):
        raise DatosError(f"{donde}: «{x}» no es un número (use punto decimal y sin separador de miles).")
    if not math.isfinite(x):
        raise DatosError(f"{donde}: valor no finito.")
    return float(x)


@dataclass
class Ejercicio:
    año: int
    empleados: float | None
    v: dict[str, float]  # importes normalizados (balance + PyG)
    avisos: list[str] = field(default_factory=list)

    def __getitem__(self, k: str) -> float:
        return self.v.get(k, 0.0)


@dataclass
class Datos:
    empresa: dict
    ejercicios: list[Ejercicio]  # del más reciente al más antiguo
    deuda: list[dict]
    avisos: list[str]


def normalizar(año: int, balance: dict, pyg: dict) -> tuple[dict[str, float], list[str]]:
    avisos: list[str] = []
    desconocidas = (set(balance) - BALANCE_KEYS) | (set(pyg) - PYG_KEYS)
    if desconocidas:
        raise DatosError(f"Ejercicio {año}: partidas desconocidas {sorted(desconocidas)}. Revise los nombres con plantilla_datos.json.")
    v: dict[str, float] = {}
    for k, _, _ in BALANCE:
        x = _num(balance.get(k), f"{año}.balance.{k}")
        v[k] = -abs(x) if k in NEGATIVAS else x
    for k, nat, _ in PYG:
        x = _num(pyg.get(k), f"{año}.pyg.{k}")
        if nat == "gasto":
            if x > 0:
                avisos.append(f"{año}: «{ETIQUETA[k]}» introducido en positivo; se trata como gasto.")
            x = -abs(x)
        elif nat == "ingreso":
            x = abs(x)
        v[k] = x
    return v, avisos


def cargar(ruta: str) -> Datos:
    with open(ruta, encoding="utf-8") as f:
        raw = json.load(f)
    return desde_dict(raw)


def desde_dict(raw: dict) -> Datos:
    empresa = dict(raw.get("empresa") or {})
    empresa.setdefault("nombre", "")
    empresa.setdefault("sector", "servicios")
    empresa.setdefault("forma_juridica", "SL")
    empresa.setdefault("iva", 21)
    empresa.setdefault("participaciones", None)
    empresa.setdefault("auditada", False)
    if empresa["sector"] not in SECTORES:
        raise DatosError(f"Sector «{empresa['sector']}» no válido. Use uno de: {', '.join(SECTORES)}.")
    ejs_raw = raw.get("ejercicios") or []
    if not ejs_raw:
        raise DatosError("No hay ejercicios.")
    ejercicios: list[Ejercicio] = []
    avisos: list[str] = []
    for e in ejs_raw:
        año = int(e["año"])
        v, av = normalizar(año, e.get("balance") or {}, e.get("pyg") or {})
        ej = Ejercicio(año, e.get("empleados"), v, av)
        ejercicios.append(ej)
        avisos += av
    ejercicios.sort(key=lambda x: -x.año)
    años = [e.año for e in ejercicios]
    if len(set(años)) != len(años):
        raise DatosError("Hay ejercicios repetidos.")
    deuda = []
    for i, d in enumerate(raw.get("deuda") or []):
        d = dict(d)
        if d.get("tipo", "otro") not in TIPOS_DEUDA:
            raise DatosError(f"deuda[{i}]: tipo «{d.get('tipo')}» no válido. Use: {', '.join(TIPOS_DEUDA)}.")
        for k in ("pendiente", "limite", "tipo_interes", "cuota_mensual"):
            if d.get(k) is not None:
                d[k] = _num(d[k], f"deuda[{i}].{k}")
        deuda.append(d)
    for ej in ejercicios:
        if not any(ej.v.get(k, 0) for k in BALANCE_KEYS):
            raise DatosError(f"El ejercicio {ej.año} no tiene balance: rellene los importes (ver plantilla_datos.json).")
        negativos = [ETIQUETA[k] for k, m, _ in BALANCE if m in ("anc", "ac") and ej.v.get(k, 0) < 0]
        if negativos:
            avisos.append(f"{ej.año}: partidas de activo en negativo ({', '.join(negativos)}). Revise signos o reclasifique "
                          "(p. ej., un descubierto bancario es deuda a corto plazo, no efectivo negativo).")
    datos = Datos(empresa, ejercicios, deuda, avisos)
    datos.avisos += comprobar_cuadres(datos)
    return datos


# ---------------------------------------------------------------------------
# Magnitudes
# ---------------------------------------------------------------------------

def suma(v: dict[str, float], claves) -> float:
    return sum(v.get(k, 0.0) for k in claves)


def masa(v: dict[str, float], m: str) -> float:
    return sum(v.get(k, 0.0) for k, mm, _ in BALANCE if mm == m)


def magnitudes(v: dict[str, float]) -> dict[str, float]:
    anc, ac, pn, pnc, pc = (masa(v, m) for m in ("anc", "ac", "pn", "pnc", "pc"))
    deuda_lp, deuda_cp = suma(v, DEUDA_LP), suma(v, DEUDA_CP)
    liquidez = v.get("efectivo", 0) + v.get("inversiones_financieras_cp", 0)
    ebitda = suma(v, EBITDA_PARTIDAS)
    no_rec = suma(v, NO_RECURRENTES)
    ebit = ebitda + v.get("amortizacion", 0) + no_rec
    rdo_fin = suma(v, ["ingresos_financieros", "gastos_financieros", "otros_resultados_financieros"])
    rai = ebit + rdo_fin
    resultado = rai + v.get("impuesto_beneficios", 0)
    ventas = v.get("ventas", 0)
    return {
        "anc": anc, "ac": ac, "pn": pn, "pnc": pnc, "pc": pc,
        "activo": anc + ac, "pasivo": pnc + pc, "pn_y_pasivo": pn + pnc + pc,
        "deuda_fin_lp": deuda_lp, "deuda_fin_cp": deuda_cp, "deuda_fin": deuda_lp + deuda_cp,
        "liquidez": liquidez, "dfn": deuda_lp + deuda_cp - liquidez,
        "nof": suma(v, AC_OPERATIVO) - suma(v, PC_OPERATIVO), "fm": ac - pc,
        "ventas": ventas,
        "margen_bruto": ventas + v.get("variacion_existencias", 0) + v.get("aprovisionamientos", 0),
        "ebitda": ebitda, "no_recurrente": no_rec, "amortizacion": -v.get("amortizacion", 0),
        "ebit": ebit, "resultado_financiero": rdo_fin, "rai": rai,
        "impuesto": v.get("impuesto_beneficios", 0), "resultado": resultado,
        "gastos_financieros": -v.get("gastos_financieros", 0),
        "no_operativos": suma(v, NO_OPERATIVOS) - v.get("pasivos_mantenidos_venta", 0),
    }


def comprobar_cuadres(d: Datos) -> list[str]:
    avisos = []
    for e in d.ejercicios:
        m = magnitudes(e.v)
        tol = max(5.0, abs(m["activo"]) * 0.0005)
        if abs(m["activo"] - m["pn_y_pasivo"]) > tol:
            avisos.append(f"DESCUADRE {e.año}: activo {fmt_eur(m['activo'])} ≠ PN + pasivo {fmt_eur(m['pn_y_pasivo'])} "
                          f"(diferencia {fmt_eur(m['activo'] - m['pn_y_pasivo'])}).")
        tiene_pyg = any(e.v.get(k, 0) for k in PYG_KEYS)
        if tiene_pyg and abs(m["resultado"] - e["resultado_ejercicio"]) > max(5.0, abs(m["resultado"]) * 0.001):
            avisos.append(f"DESCUADRE {e.año}: resultado de la PyG {fmt_eur(m['resultado'])} ≠ resultado del balance "
                          f"{fmt_eur(e['resultado_ejercicio'])}.")
    return avisos


# ---------------------------------------------------------------------------
# Formato
# ---------------------------------------------------------------------------

def fmt_eur(x: float | None) -> str:
    if x is None or not math.isfinite(x):
        return "n/d"
    s = f"{abs(x):,.0f}".replace(",", ".")
    return f"{'-' if x < 0 else ''}{s} €"


def fmt_pct(x: float | None, dec: int = 1) -> str:
    if x is None or not math.isfinite(x):
        return "n/d"
    return f"{x * 100:.{dec}f} %".replace(".", ",")


def fmt_x(x: float | None) -> str:
    if x is None or not math.isfinite(x):
        return "n/d"
    return f"{x:.2f}x".replace(".", ",")


def fmt_num(x: float | None, dec: int = 0) -> str:
    if x is None or not math.isfinite(x):
        return "n/d"
    return f"{x:,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def div(a: float, b: float) -> float | None:
    return None if b == 0 else a / b


def tabla_md(cabecera: list[str], filas: list[list[str]], alinear_derecha_desde: int = 1) -> str:
    sep = ["---" if i < alinear_derecha_desde else "---:" for i in range(len(cabecera))]
    out = ["| " + " | ".join(cabecera) + " |", "| " + " | ".join(sep) + " |"]
    out += ["| " + " | ".join(f) + " |" for f in filas]
    return "\n".join(out)
