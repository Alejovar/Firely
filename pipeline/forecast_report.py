"""Generate docs/reporte-pronostico.md from the forecast metrics (docs/plan-modelo-predictivo.md §11).
Every number is read from data/processed/forecast/; nothing is typed by hand.

    python -m pipeline.forecast_report [--out docs/reporte-pronostico.md]
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

import pandas as pd

from .tables_common import parser

MONTHS = "ene feb mar abr may jun jul ago sep oct nov dic".split()


def pct(x):
    return "—" if pd.isna(x) else f"{100 * x:+.1f}%"


def num(x, d=2):
    return "—" if pd.isna(x) else f"{x:.{d}f}"


def table(df: pd.DataFrame) -> str:
    head = "| " + " | ".join(df.columns) + " |"
    sep = "|" + "|".join("---" for _ in df.columns) + "|"
    rows = ["| " + " | ".join(str(v) for v in r) + " |" for r in df.itertuples(index=False)]
    return "\n".join([head, sep, *rows])


def build(processed: Path, out: Path) -> str:
    fc = processed / "forecast"
    met = fc / "metrics"
    s = json.loads((fc / "forecast_summary.json").read_text(encoding="utf-8"))
    m = pd.read_csv(met / "metrics_by_horizon.csv")
    br = pd.read_csv(met / "metrics_breakdown.csv")
    rel = pd.read_csv(met / "tercile_reliability.csv")
    imp = pd.read_csv(met / "feature_importance.csv") if (met / "feature_importance.csv").is_file() else None
    roll = pd.read_csv(met / "metrics_rolling_origin.csv") if (met / "metrics_rolling_origin.csv").is_file() else None
    nat = pd.read_csv(met / "national_totals.csv")
    desc = {}
    if (fc / "feature_dictionary.csv").is_file():
        with (fc / "feature_dictionary.csv").open(encoding="utf-8") as f:
            desc = {r["feature"]: r["description"] for r in csv.DictReader(f)}
    log = json.loads((fc / "train_log.json").read_text())

    L = []
    L.append("# Reporte del pronóstico de actividad de fuego a 1–3 meses\n")
    L.append(f"> Generado por `pipeline.forecast_report` el {s['generated']} · `{s['methodology_version']}`. "
             "No editar a mano: las cifras salen de `data/processed/forecast/`.\n")
    L.append("Qué predice: al cierre del mes *t*, las detecciones armonizadas (serie VIIRS S-NPP equivalente, "
             "H3 r6) de *t+1*, *t+2* y *t+3* en cada celda de México, Argentina, Bolivia, Chile, Paraguay y "
             "Uruguay, con intervalo 10–90 % y probabilidad de quedar por debajo / cerca / por encima de lo "
             "normal (terciles de la celda y el mes). No predice dónde empieza un incendio.\n")
    sp = s["split"]
    L.append(f"Partición: entrenamiento {sp['train'][0]}–{sp['train'][1]}, validación {sp['validation']} "
             f"(early stopping y calibración), **prueba {sp['test'][0]}–{sp['test'][1]}, sin tocar hasta el final**. "
             "Skill = 1 − MSE_modelo / MSE_referencia sobre log1p(detecciones); positivo = le gana.\n")

    L.append("## 1. ¿Le gana a la climatología y a la persistencia?\n")
    t = m[m.country == "Todos"].copy()
    t = pd.DataFrame({"Horizonte": t.horizon, "Celdas": t.cells, "Filas": t.rows.map("{:,}".format),
                      "vs climatología (B0)": t.skill_vs_b0.map(pct), "vs persistencia (B1)": t.skill_vs_b1.map(pct),
                      "vs mismo mes año previo (B2)": t.skill_vs_b2.map(pct), "RPSS terciles": t.rpss_vs_clim.map(num),
                      "Spearman por celda (mediana)": t.get("spearman_cell_median", pd.Series(dtype=float)).map(num)})
    L.append(table(t) + "\n")
    L.append("Celdas *activas*: climatología de entrenamiento ≥ 12 detecciones al año. Las celdas sin una sola "
             "detección en los años de entrenamiento no se modelan: su perspectiva es lo normal (0).\n")
    chosen = {h: log[f"main_h{h}"]["chosen"] for h in (1, 2, 3) if f"main_h{h}" in log}
    L.append("Modelo elegido en validación por horizonte: " + ", ".join(
        f"h={h}: {'LightGBM log1p (l2)' if c == 'm1' else 'LightGBM tweedie'}" for h, c in chosen.items()) + ".\n")

    L.append("## 2. ¿Dónde funciona mejor y dónde no?\n")
    c = m[(m.cells == "todas") & (m.country != "Todos")]
    piv = c.pivot(index="country", columns="horizon", values="skill_vs_b0").map(pct)
    piv.columns = [f"h={h}" for h in piv.columns]
    L.append("Skill contra la climatología por país (todas las celdas modeladas):\n")
    L.append(table(piv.reset_index().rename(columns={"country": "País"})) + "\n")
    b = br[br.country == "Todos"]
    piv = b.pivot(index="season", columns="horizon", values="skill_vs_b0").map(pct)
    piv.columns = [f"h={h}" for h in piv.columns]
    L.append("Temporada alta (los 5 meses de mayor actividad normal en cada país) contra el resto:\n")
    L.append(table(piv.reset_index().rename(columns={"season": "Meses"})) + "\n")
    seasons = s["horizons"]["1"].get("seasons", {}) if "1" in s["horizons"] else {}
    if seasons:
        L.append("Temporada alta usada: " + "; ".join(
            f"{k}: {', '.join(MONTHS[x - 1] for x in v)}" for k, v in seasons.items()) + ".\n")
    rows = []
    for h, v in s["horizons"].items():
        for k, x in v.get("national_corr", {}).items():
            rows.append({"País": k, "h": h, "r modelo": num(x["model"]), "r climatología": num(x["climatology"]),
                         "error mediano modelo": f"{100 * x['mape_model']:.0f}%",
                         "error mediano climatología": f"{100 * x['mape_climatology']:.0f}%",
                         "suma pronóstico / observado": num(x["bias_model"])})
    if rows:
        L.append("**Totales mensuales por país** 2023–2025 (suma de las celdas; conteo esperado con los residuales de "
                 "validación de cada tramo de predicción). Es otro producto que la celda: aunque el modelo gana por "
                 "celda en todos los países, al sumar puede perder contra la climatología. Donde pierde, la API muestra "
                 "lo normal para el total del país (`totals_beat_climatology`):\n")
        L.append(table(pd.DataFrame(rows).sort_values(["País", "h"])) + "\n")

    L.append("## 3. ¿Qué tan confiables son las probabilidades?\n")
    r1 = rel[rel.horizon == 1]
    L.append("RPSS contra la frecuencia climatológica de cada categoría en esa celda y mes (referencia más exigente "
             "que 1/3, porque con muchos meses en cero «por debajo» suele ser imposible). Confiabilidad de "
             "P(por encima de lo normal), h=1:\n")
    L.append(table(pd.DataFrame({"P media": r1.p_mean.map(num), "Frecuencia observada": r1.obs_freq.map(num),
                                 "Filas": r1.n.map("{:,}".format)})) + "\n")
    L.append("Las probabilidades se calibran con regresión isotónica en el año de validación (2022), en función "
             "de la distancia entre la predicción y el umbral del tercil.\n")
    cov = m[(m.country == "Todos") & (m.cells == "todas")]
    L.append("Cobertura del intervalo 10–90 % en prueba: " + ", ".join(
        f"h={int(r.horizon)}: {100 * r.interval_coverage:.0f}%" for r in cov.itertuples()) + " (nominal 80 %).\n")

    L.append("## 4. ¿Qué variables pesan más?\n")
    if imp is not None:
        for h in sorted(imp.horizon.unique()):
            top = imp[imp.horizon == h].nlargest(10, "gain")
            tot = imp[imp.horizon == h].gain.sum()
            L.append(f"h={h}: " + ", ".join(f"`{r.feature}` ({100 * r.gain / tot:.0f}%)" for r in top.itertuples()) + ".\n")
        top = imp[imp.horizon == 1].nlargest(10, "gain").feature
        rows = [{"Variable": f"`{f}`", "Qué es": desc.get(f, desc.get(f.rstrip("_123"), ""))} for f in top]
        L.append(table(pd.DataFrame(rows)) + "\n")
    L.append("Lectura física: domina la memoria del fuego (lo normal de la celda en ese mes, el mismo mes del año "
             "anterior en la celda y su vecindad); el clima (lluvia acumulada, VPD, humedad de suelo) y ENSO "
             "ajustan la anomalía.\n")

    L.append("## 5. ¿Captura las celdas calientes mejor que la climatología?\n")
    t = m[m.cells == "todas"]
    piv = t.assign(v=[f"{100 * a:.0f}% (clim. {100 * b:.0f}%)" for a, b in zip(t.capture10_model, t.capture10_b0)]) \
        .pivot(index="country", columns="horizon", values="v")
    piv.columns = [f"h={h}" for h in piv.columns]
    L.append("Porcentaje de las detecciones reales que cae en el 10 % de celdas con mayor pronóstico "
             "(por país y mes):\n")
    L.append(table(piv.reset_index().rename(columns={"country": "País"})) + "\n")

    if roll is not None and len(roll):
        L.append("## Robustez: origen móvil\n")
        rr = roll[roll.country == "Todos"]
        piv = rr.pivot(index="test_year", columns="horizon", values="skill_vs_b0").map(pct)
        piv.columns = [f"h={h}" for h in piv.columns]
        L.append("Entrenando hasta *Y−1* y probando en *Y* (skill contra climatología, todos los países):\n")
        L.append(table(piv.reset_index().rename(columns={"test_year": "Año de prueba"})) + "\n")

    L.append("## 6. Datos en operación\n")
    meta = processed / "metadata"
    pw = json.loads((meta / "power_daily_check.json").read_text()) if (meta / "power_daily_check.json").is_file() else None
    sv = json.loads((meta / "snpp_recent_validation.json").read_text()) if (meta / "snpp_recent_validation.json").is_file() else None
    pw_txt = (f" (la agregación reproduce el producto mensual de {pw['year']} con diferencia media absoluta ≤ "
              f"{pw['max_mean_abs_difference']:.4f})") if pw else ""
    sv_txt = (f"; reproducen la tabla oficial de {sv['country']} enero–julio de 2026 con diferencias mensuales de "
              f"{100 * sv['min']:+.1f} % a {100 * sv['max']:+.1f} %") if sv else ""
    L.append("El clima histórico viene de NASA POWER mensual (MERRA-2, 0.5° × 0.625°), que publica años completos; el "
             f"año en curso se arma con POWER diario agregado a mes{pw_txt}. El fuego posterior a la tabla armonizada "
             "son conteos S-NPP observados (archivo SP hasta julio de 2026, NRT con máscara de fuentes estáticas "
             f"hasta octubre){sv_txt}. S-NPP terminó el 2 de noviembre de 2026: para emitir después hará falta "
             "NOAA-20/21 escalado a S-NPP.\n")
    if s.get("forecast_issues"):
        L.append("Último mes de emisión por país: " + ", ".join(f"{k} {v}" for k, v in s["forecast_issues"].items()) + ".\n")
    if s.get("oos_2026"):
        L.append("### Prueba fuera de muestra 2026 (celdas)\n")
        L.append("Modelo final (entrenado con 2012–2025) emitido cada mes desde diciembre de 2025; meses objetivo de "
                 "2026 ya observados. " + (s.get("provisional_note") or "") + "\n")
        L.append(table(pd.DataFrame([{"Horizonte": h, "Filas": f"{v['rows']:,}", "Meses": f"{v['targets'][0]} a {v['targets'][1]}",
                                      "vs climatología": pct(v["skill_vs_climatology"])} for h, v in s["oos_2026"].items()])) + "\n")
    oos = fc / "forecast_cell.parquet"
    if oos.is_file():
        import duckdb
        d = duckdb.sql(f"""SELECT country, horizon, target_year, target_month, sum(pred) p, sum(clim) c, sum(obs) o
                           FROM read_parquet('{oos}') WHERE kind = 'forecast' AND obs IS NOT NULL AND issue_year = 2025
                           GROUP BY ALL ORDER BY ALL""").df()
        if len(d):
            L.append("### Prueba fuera de muestra 2026\n")
            L.append("Totales por país del pronóstico emitido con datos hasta diciembre de 2025 contra lo observado "
                     "(«Normal» = promedio 2012–2025 del mes):\n")
            L.append(table(pd.DataFrame({"País": d.country, "h": d.horizon,
                                         "Mes": [f"{MONTHS[mm - 1]} {yy}" for yy, mm in zip(d.target_year, d.target_month)],
                                         "Pronóstico": d.p.round(0).astype(int), "Normal": d.c.round(0).astype(int),
                                         "Observado": d.o.round(0).astype(int)})) + "\n")

    L.append("## 7. Validación externa\n")
    cpath = met / "conafor_forecast_check.csv"
    if cpath.is_file():
        cf = pd.read_csv(cpath)
        piv = cf.pivot(index="series", columns="horizon", values="spearman").map(num)
        piv.columns = [f"h={h}" for h in piv.columns]
        n = int(cf.state_years.iloc[0]) if len(cf) else 0
        L.append(f"México, suma por estado y año 2023–2025 ({n} estado-años) contra el número de incendios que reportó "
                 "CONAFOR (Spearman). «observed» es la detección armonizada real y sirve de techo: si la observación "
                 "sigue poco a los reportes, el pronóstico no puede seguirlos mejor.\n")
        L.append(table(piv.reset_index().rename(columns={"series": "Serie"})) + "\n")
        L.append("Por estado, las detecciones satelitales siguen poco a los incendios forestales reportados (muchas son "
                 "quemas agrícolas y un incendio grande produce muchas detecciones): esta comparación no discrimina "
                 "entre modelos. La concordancia nacional anual de la serie armonizada con CONAFOR está en "
                 "`docs/metodologia-armonizacion.md`.\n")
    else:
        L.append("Pendiente: `python -m pipeline.forecast_conafor`.\n")

    L.append("## 8. Recomendación para la app\n")
    beats = s.get("beats_climatology", {})
    ok = {h: [c for c, v in beats.items() if c != "Todos" and v.get(str(h))] for h in (1, 2, 3)}
    for h in (1, 2, 3):
        missing = [c for c, v in beats.items() if c != "Todos" and not v.get(str(h))]
        L.append(f"- h={h}: el modelo le gana a la climatología (MSE y RPSS) en {len(ok[h])} de "
                 f"{len([c for c in beats if c != 'Todos'])} países" + (f"; en {', '.join(missing)} se muestra lo normal." if missing else "."))
    L.append("\nFormato: mostrar **terciles** (por debajo / cerca / por encima de lo normal) como mensaje principal y "
             "el número esperado con su intervalo como detalle, siempre junto a lo normal del mes. El horizonte "
             "de 1 mes es el más hábil; 2–3 meses sirven para planear la temporada.\n")

    L.append("## Cambios respecto al plan original\n")
    L.append("- Un modelo por horizonte para los seis países juntos (`country` como variable categórica), malla H3 r6.\n"
             "- Clima de NASA POWER en lugar de ERA5-Land/GEE; sin NDVI ni área quemada (no disponibles por celda).\n"
             "- Las climatologías que entran como **variables** son expansivas (mismo mes de años previos): la "
             "climatología fija de entrenamiento contiene el propio objetivo dentro de las filas de entrenamiento y "
             "una versión leave-one-out también filtra; con ellas el modelo se sobreajustaba (detectado y corregido). "
             "La climatología fija de entrenamiento se conserva para la línea base B0 y los terciles.\n"
             "- Intervalo y terciles calibrados en validación (residuales por tramo e isotónica) en lugar de "
             "LightGBM de cuantiles y multiclase.\n"
             "- Filas con objetivo cero submuestreadas 1 de 8 con peso 8 en entrenamiento (memoria); validación y "
             "prueba usan todas las filas.\n")
    L.append("## Limitaciones\n")
    L.append("- Hereda las limitaciones de la armonización y de FIRMS (incluye quemas agrícolas; nubes).\n"
             "- 14 años por celda es poco para extremos: puede subestimar temporadas récord.\n"
             "- Clima mensual a 0.5°: no resuelve topografía fina ni eventos de viento.\n"
             "- Un pronóstico de actividad no es de daño: no considera población ni valores en riesgo.\n")
    L.append("\nAtribución: NASA FIRMS (MODIS C6.1, VIIRS), NASA POWER, NOAA CPC (ONI).\n")
    text = "\n".join(L)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    return str(out)


def main() -> None:
    p = parser(__doc__)
    p.add_argument("--out", type=Path, default=Path("docs/reporte-pronostico.md"))
    a = p.parse_args()
    print(build(a.processed, a.out))


if __name__ == "__main__":
    main()
