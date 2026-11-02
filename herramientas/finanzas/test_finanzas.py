"""Pruebas de las herramientas financieras: python3 -m unittest discover -s herramientas/finanzas"""
import copy
import json
import subprocess
import sys
import unittest
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

from analisis import aplicar_ajustes, flujos, informe as informe_analisis, ratios, servicio_deuda  # noqa: E402
from pgc import DatosError, desde_dict, magnitudes  # noqa: E402
from valoracion import informe as informe_valoracion, renta, valorar  # noqa: E402

EJEMPLO = json.loads((AQUI / "ejemplo_empresa.json").read_text(encoding="utf-8"))


def datos(mod=None):
    raw = copy.deepcopy(EJEMPLO)
    if mod:
        mod(raw)
    return desde_dict(raw)


class Analisis(unittest.TestCase):
    def setUp(self):
        self.d = datos()
        self.n = self.d.ejercicios[0]

    def test_cuadres(self):
        self.assertEqual(self.d.avisos, [])
        m = magnitudes(self.n.v)
        self.assertEqual(m["activo"], 2_600_000)
        self.assertEqual(m["resultado"], 19_500)
        self.assertEqual(m["ebitda"], 225_000)
        self.assertEqual(m["dfn"], 1_145_000)
        self.assertEqual(m["nof"], 821_000)

    def test_flujos_concilian(self):
        f = flujos(self.n.v, self.d.ejercicios[1].v)
        self.assertAlmostEqual(f["no_conciliado"], 0, places=6)
        self.assertEqual(f["capex"], 245_000)
        self.assertEqual(f["dividendos"], 80_000)

    def test_ratios(self):
        r = ratios(self.n.v, 21)
        self.assertAlmostEqual(r["dfn_ebitda"], 1_145_000 / 225_000)
        self.assertAlmostEqual(r["pmc"], 800_000 * 365 / (4_500_000 * 1.21))

    def test_servicio_deuda(self):
        sd = servicio_deuda(self.d)
        self.assertEqual(sd["fuente"], "cuadro de deuda")
        prestamos = 380_000 * .042 + 260_000 * .069 + 65_000 * .05
        polizas = 260_000 * .055 + 220_000 * .0525
        self.assertAlmostEqual(sd["interes_12m"], prestamos + polizas)
        self.assertEqual(sd["limite_polizas"], 600_000)
        self.assertEqual(len(sd["renovar_12m"]), 1)
        self.assertLess(sd["dscr"], 1.3)

    def test_ajuste_descuadrado_se_rechaza(self):
        with self.assertRaises(DatosError):
            aplicar_ajustes(self.n.v, [{"concepto": "mal", "movimientos": {"efectivo": 100}}])

    def test_ajustes_cuadrados(self):
        pasos = aplicar_ajustes(self.n.v, json.loads((AQUI / "ajustes_ejemplo.json").read_text(encoding="utf-8")))
        m = magnitudes(pasos[-1]["v"])
        self.assertAlmostEqual(m["activo"], m["pn_y_pasivo"])
        md, _ = informe_analisis(self.d, json.loads((AQUI / "ajustes_ejemplo.json").read_text(encoding="utf-8")))
        self.assertIn("Simulación", md)

    def test_partida_desconocida(self):
        with self.assertRaises(DatosError):
            datos(lambda r: r["ejercicios"][0]["balance"].update({"caja": 1}))

    def test_descuadre_detectado(self):
        d = datos(lambda r: r["ejercicios"][0]["balance"].update({"efectivo": 50_000}))
        self.assertTrue(any("DESCUADRE" in a for a in d.avisos))

    def test_gasto_en_positivo(self):
        d = datos(lambda r: r["ejercicios"][0]["pyg"].update({"gastos_personal": 700_000}))
        self.assertEqual(d.ejercicios[0]["gastos_personal"], -700_000)

    def test_causa_disolucion(self):
        def mod(r):
            b = r["ejercicios"][0]["balance"]
            b["resultados_anteriores"] = -760_000
            b["clientes"] -= 760_000
        md, _ = informe_analisis(datos(mod))
        self.assertIn("363.1.e", md)


class Valoracion(unittest.TestCase):
    def setUp(self):
        self.r = valorar(datos())
        self.m = {x["id"]: x for x in self.r["metodos"]}

    def test_perfil_y_pesos(self):
        self.assertEqual(self.r["perfil"], "operativa")
        self.assertAlmostEqual(sum(x["peso"] for x in self.r["metodos"]), 1)
        c = self.r["conclusion"]
        self.assertLessEqual(c["bajo"], c["valor"])
        self.assertGreaterEqual(c["alto"], c["valor"])

    def test_puente(self):
        x = self.m["ve_ebitda"]
        self.assertAlmostEqual(x["valor"], x["ve"] - 1_145_000 + 30_000)

    def test_wacc(self):
        w, h = self.r["wacc"], self.r["hipotesis"]
        self.assertAlmostEqual(w["ke"] * 100, h["rf"] + w["beta_l"] * h["prima_mercado"] + h["prima_tamano"] + h["prima_especifica"])
        self.assertLess(w["wacc"], w["ke"])
        self.assertEqual(self.r["por_que"]["kd"], "Tipo medio ponderado del cuadro de deuda (sin comisiones).")

    def test_sensibilidad_monotona(self):
        fila = self.r["sensibilidad"]["valores"][2]
        self.assertTrue(all(a > b for a, b in zip(fila, fila[1:])))

    def test_fiscal(self):
        f = self.r["fiscal"]
        self.assertAlmostEqual(f["cap20"], (19_500 + 136_500 + 146_250) / 3 * 5)
        self.assertEqual(f["minimo_irpf"], max(776_000, f["cap20"]))
        self.assertEqual(f["ip"], max(60_000, 776_000, f["cap20"]))

    def test_mixtos(self):
        self.assertAlmostEqual(renta(0.1, 5), 3.790787, places=5)
        A, B, ke = self.r["metodos"][1]["valor"], self.r["beneficio"], self.r["wacc"]["ke"]
        self.assertAlmostEqual(self.m["indirecto"]["valor"], (A + B / ke) / 2)

    def test_paquete_con_descuentos(self):
        r = valorar(datos(), {"porcentaje": 30, "descuento_minoria": 20, "participaciones": 6000})
        c = r["conclusion"]
        self.assertAlmostEqual(c["paquete"], c["valor"] * 0.3 * 0.8)
        self.assertAlmostEqual(c["por_participacion"], c["valor"] / 6000)

    def test_plusvalias(self):
        r = valorar(datos(), {"plusvalias_latentes": 100_000})
        self.assertAlmostEqual(r["metodos"][1]["valor"] - 776_000, 75_000)

    def test_hipotesis_desconocida(self):
        with self.assertRaises(DatosError):
            valorar(datos(), {"wac": 9})

    def test_pesos_propios(self):
        r = valorar(datos(), {"pesos": {"contable": 1}})
        self.assertEqual(r["conclusion"]["valor"], 776_000)

    def test_empresa_en_perdidas(self):
        def mod(r):
            for e in r["ejercicios"]:
                e["pyg"]["gastos_personal"] = -1_200_000
        r = valorar(datos(mod))
        self.assertEqual(r["perfil"], "perdidas")
        self.assertFalse(next(x for x in r["metodos"] if x["id"] == "per")["aplicable"])
        self.assertIsNotNone(r["conclusion"]["valor"])
        informe_valoracion(r)

    def test_dos_ejercicios(self):
        r = valorar(datos(lambda raw: raw.update(ejercicios=raw["ejercicios"][:2], deuda=[])))
        self.assertEqual(r["hipotesis"]["prima_especifica"], 3.0)
        self.assertTrue(any("3 últimos ejercicios" in a for a in r["avisos"]))
        informe_valoracion(r)


class LineaDeComandos(unittest.TestCase):
    def ejecutar(self, *args):
        return subprocess.run([sys.executable, *args], capture_output=True, text=True, cwd=AQUI)

    def test_analisis(self):
        p = self.ejecutar("analisis.py", "ejemplo_empresa.json", "--ajustes", "ajustes_ejemplo.json")
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertIn("Lo que verá el banco", p.stdout)

    def test_valoracion(self):
        p = self.ejecutar("valoracion.py", "ejemplo_empresa.json", "--hipotesis", "hipotesis_ejemplo.json")
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertIn("Sensibilidad", p.stdout)

    def test_plantilla_vacia_da_error_claro(self):
        p = self.ejecutar("valoracion.py", "plantilla_datos.json")
        self.assertEqual(p.returncode, 2)
        self.assertIn("no tiene balance", p.stderr)

    def test_activo_negativo_avisa(self):
        d = datos(lambda r: r["ejercicios"][0]["balance"].update({"efectivo": -10_000, "deudas_bancarias_cp": 470_000}))
        self.assertTrue(any("activo en negativo" in a for a in d.avisos))


if __name__ == "__main__":
    unittest.main()
