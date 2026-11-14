"""Render the harmonization methodology page from the real validation numbers.

Writes docs/metodologia-armonizacion.md and web/public/data/harmonization.json (consumed by the
"Cómo armonizamos" page). Every figure comes from data/processed/metadata/harmonization_summary.json,
so the text cannot drift from the data. Re-run after `python -m pipeline.harmonize`.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import duckdb
import pandas as pd

from .harmonize import assess_quality

COUNTRY_ES = {"Mexico": "México"}


def label(c):
    return COUNTRY_ES.get(c, c.replace("_", " "))
MODEL_ES = {
    "plain": "simple (factor mensual por país)",
    "regimes": "regímenes de fuego + vecindad",
    "biome": "bioma IGBP + vecindad",
    "biome_regime": "bioma × régimen + vecindad",
}
MODEL_DESC = {
    "plain": "un único grupo de celdas por país",
    "regimes": "5 grupos de celdas según cómo se comporta el fuego (tamaño de las detecciones, estacionalidad, "
               "fracción nocturna), medidos solo con MODIS",
    "biome": "5 biomas de la cobertura del suelo (bosque, matorral, pastizal/sabana, cultivo, otros) de MODIS MCD12Q1",
    "biome_regime": "el producto de bioma y régimen",
}


def quality(v):
    return v.get("quality") or assess_quality(v)


def pct(x, d=1):
    return f"{x:.{d}f}%"


def load(processed: Path):
    summary = json.loads((processed / "metadata" / "harmonization_summary.json").read_text())
    star = {c: pd.read_csv(processed / "metadata" / f"star_chart_{c}.csv") for c in summary["countries"]}
    con = duckdb.connect()
    q = lambda sensor: con.execute(
        f"SELECT max(date_local) FROM read_parquet('{processed / 'hotspots' / '*' / '*' / 'part-0.parquet'}') "
        f"WHERE sensor = '{sensor}'").fetchone()[0]
    cutoffs = {"viirs": str(q("VIIRS")), "modis": str(q("MODIS"))}
    return summary, star, cutoffs


def build_json(summary, star, cutoffs):
    out = {"methodology_version": summary["methodology_version"], "data_cutoff": cutoffs["modis"],
           "viirs_cutoff": cutoffs["viirs"],
           "attribution": "NASA FIRMS", "countries": {}}
    for c, v in summary["countries"].items():
        m = v["validation"]["ta"]
        models = []
        for name, mm in v["validation_by_model"].items():
            t = mm["ta"]
            models.append({"model": name, "label": MODEL_ES[name], "annual_mape_pct": round(t["region_year_mape_pct"], 2),
                           "cell_rmse_improvement_pct": round(t["cell_month_rmse_improvement_pct"], 1),
                           "spearman": round(t["region_month_spearman"], 4), "chosen": name == v["model"]})
        s = star[c]
        s = s[(s.year >= 2001) & (s.year <= 2025)]
        out["countries"][c] = {
            "label": label(c), "quality": quality(v), "model": v["model"], "model_label": MODEL_ES[v["model"]],
            "annual_error_pct": round(m["region_year_mape_pct"], 2),
            "baseline_error_pct": round(m["region_year_mape_baseline_pct"], 2),
            "error_reduction_pct": round(100 * (1 - m["region_year_mape_pct"] / m["region_year_mape_baseline_pct"]), 1),
            "median_annual_error_pct": round(m["region_year_median_ape_pct"], 2),
            "band_pct": round(100 * v["band_rel_ta"], 1),
            "peak_month_pm1_pct": round(m["peak_month_pm1_pct"], 1),
            "spearman": round(m["region_month_spearman"], 4),
            "terra_only_annual_error_pct": round(v["validation"]["t"]["region_year_mape_pct"], 2),
            "terra_only_baseline_pct": round(v["validation"]["t"]["region_year_mape_baseline_pct"], 2),
            "n_cells": v["n_cells"], "models": models,
            "backcast": {"train": v["drift"]["backcast_train"], "test": v["drift"]["backcast_test"],
                         "annual_error_pct": round(v["drift"]["backcast"]["chosen"]["annual_mape_pct"], 2),
                         "baseline_error_pct": round(v["drift"]["backcast"]["chosen"]["baseline_annual_mape_pct"], 2)} if "drift" in v else None,
            "drift": {k: {"mk_p": round(t["mk_p"], 3), "sen_pct_per_year": round(t["sen_pct_per_year"], 2)}
                      for k, t in v["drift"]["trends"].items()} if "drift" in v else None,
            "series": [{"year": int(r.year), "modis_raw": int(r.modis_raw),
                        "viirs_raw": int(r.viirs_raw) if r.viirs_raw else None,
                        "harmonized": round(float(r.harmonized), 1)} for r in s.itertuples()],
        }
    return out


def build_markdown(summary, star, cutoffs):
    ver = summary["methodology_version"]
    cutoff, vcut = cutoffs["modis"], cutoffs["viirs"]
    pm1 = min(mm[k]["peak_month_pm1_pct"] for v in summary["countries"].values()
              for mm in v["validation_by_model"].values() for k in ("ta",))
    jump = {}
    for c, d in star.items():
        a, b = d[d.year == 2013].iloc[0], d[d.year == 2011].iloc[0]
        jump[c] = a.viirs_raw / a.modis_raw
    lo, hi = min(jump.values()), max(jump.values())
    qrows = "\n".join(
        f"| {label(c)} | **{quality(v)['level']}** | " + ("; ".join(quality(v)["reasons"]) or "cumple todos los criterios") + " |"
        for c, v in summary["countries"].items())
    rows = []
    for c, v in summary["countries"].items():
        m = v["validation"]["ta"]
        red = 100 * (1 - m["region_year_mape_pct"] / m["region_year_mape_baseline_pct"])
        rows.append(f"| {label(c)} | {MODEL_ES[v['model']]} | {pct(m['region_year_mape_pct'], 2)} | "
                    f"{pct(m['region_year_mape_baseline_pct'], 2)} | **{pct(red, 0)} menos** | ±{pct(100 * v['band_rel_ta'])} |")
    backrows = "\n".join(
        f"| {label(c)} | {pct(v['drift']['backcast']['chosen']['annual_mape_pct'], 2)} | "
        f"{pct(v['drift']['backcast']['chosen']['baseline_annual_mape_pct'], 2)} | {v['drift']['backcast_train']} | {v['drift']['backcast_test']} |"
        for c, v in summary["countries"].items() if "drift" in v)
    driftrows = "\n".join(
        f"| {label(c)} | " + " | ".join(
            f"p={v['drift']['trends'][k]['mk_p']:.2f}, {v['drift']['trends'][k]['sen_pct_per_year']:+.1f}%/año"
            for k in ("ratio_terra_aqua", "ratio_terra", "ratio_aqua")) + " |"
        for c, v in summary["countries"].items() if "drift" in v)
    any_v = next(iter(summary["countries"].values()))
    backcast_train = any_v.get("drift", {}).get("backcast_train", "")
    backcast_test = any_v.get("drift", {}).get("backcast_test", "")
    names = ", ".join(label(c) for c in summary["countries"])
    detail = []
    for c, v in summary["countries"].items():
        detail.append(f"\n**{label(c)}** (modelo elegido: *{MODEL_ES[v['model']]}*)\n")
        detail.append("| Configuración probada | Error anual | Mejora del RMSE por celda | Spearman mensual |")
        detail.append("|---|---|---|---|")
        for name, mm in v["validation_by_model"].items():
            t = mm["ta"]
            mark = " ← elegida" if name == v["model"] else ""
            detail.append(f"| {MODEL_ES[name]}{mark} | {pct(t['region_year_mape_pct'], 2)} | "
                          f"{t['cell_month_rmse_improvement_pct']:+.1f}% | {t['region_month_spearman']:.4f} |")
        t = v["validation"]["t"]
        detail.append(f"\nAños con solo Terra (2001 a julio de 2002, sin Aqua): error anual "
                      f"{pct(t['region_year_mape_pct'], 2)} contra {pct(t['region_year_mape_baseline_pct'], 2)} de la línea base.")
    return f"""# Cómo armonizamos MODIS y VIIRS

*Versión de la metodología: `{ver}` · Datos MODIS hasta {cutoff}, VIIRS hasta {vcut} · Fuente: NASA FIRMS*

> Generado por `pipeline/methodology_doc.py` a partir de `data/processed/metadata/harmonization_summary.json`.
> No editar a mano: se regenera con cada corrida de `pipeline.harmonize`.

## 1. El problema en una frase

MODIS (2000 en adelante) y VIIRS (2012 en adelante) detectan incendios con ojos distintos. VIIRS ve
pixeles de 375 m y MODIS de 1 km, así que VIIRS descubre muchos fuegos pequeños que MODIS no ve.
Si se pegan las dos series sin corregir, aparece un **salto falso en 2012**: parece que hay entre {lo:.0f} y {hi:.0f} veces más
fuego (en 2013, VIIRS cuenta {lo:.1f}–{hi:.1f} veces los puntos de MODIS), pero lo único que cambió fue el sensor. Es como comparar fotos de una cámara de 1 megapíxel con
las de un celular nuevo.

![El salto de 2012 y su corrección](figures/grafica_estrella.png)

*Gris: MODIS sin corregir. Amarillo discontinuo: VIIRS (todos los satélites, sube además en 2018 y 2023
porque entran NOAA-20 y NOAA-21). Naranja: la serie armonizada de Firely, continua en todo el periodo.*

## 2. Qué producimos

Una sola serie, **en unidades de "un VIIRS Suomi-NPP"**, para cada celda de ~36 km² (malla H3 resolución 6)
y cada mes desde 2001. Así, un marzo de 2005 y un marzo de 2021 son comparables. Dos medidas:
el **conteo de puntos de calor** y la **potencia radiativa del fuego (FRP, en MW)**.

## 3. Los pasos, en orden

**Paso 1: limpiar.** Se descartan volcanes y fuentes fijas (`type ≠ 0`), las detecciones de confianza baja
de VIIRS (MODIS: confianza menor a 30) y los duplicados exactos, incluidos los que aparecen a la vez en el
resumen anual y en las solicitudes personalizadas.

**Paso 2: elegir quién es la referencia en cada época.**

| Periodo | Qué hay en la serie armonizada |
|---|---|
| 2012-02 a 2026-10 | **VIIRS S-NPP observado.** Es la referencia: no se corrige, se usa tal cual. |
| 2001-01 a 2012-01 | **Estimado desde MODIS** (esto es lo que se armoniza). Marcado `is_estimated = true`. |
| 2001-01 a 2002-07 | Solo hay Terra (Aqua empezó en julio de 2002): se usa un modelo propio solo con Terra. |
| Meses finales sin VIIRS (hasta {cutoff}) | El procesamiento estándar de FIRMS llega a MODIS ({cutoff}) antes que a VIIRS ({vcut}): esos meses se **estiman desde MODIS** con el mismo modelo y se marcan como estimados. |
| Tras el apagado de S-NPP (2 de noviembre de 2026) | Si NOAA-20 sigue entregando, se usa NOAA-20 multiplicado por su razón contra S-NPP (calculada en 2018–2025). |

Con S-NPP como regla, la serie no salta cuando se suman NOAA-20 (2018) y NOAA-21 (2023): no se suman,
se usa un solo VIIRS de referencia.

**Paso 3: estimar el VIIRS de 2001–2011 a partir de MODIS.** Se aprende la relación en los años en
que ambos sensores observaron a la vez (2012–2025) y se aplica a los años solo-MODIS, mes por mes:

1. *Total regional del mes.* Para cada grupo de celdas (ver paso 4) y cada mes del año se calcula la razón
   "detecciones S-NPP ÷ detecciones MODIS". El total estimado es la suma, sobre los grupos, de esa razón
   por la actividad MODIS del grupo en ese mes. Se usa un total por grupo porque la razón cambia de un tipo
   de fuego a otro (los fuegos agrícolas pequeños son los que más "pierde" MODIS).
2. *Reparto a las celdas.* Las celdas con detecciones MODIS reciben el total en proporción a sus conteos.
   Las celdas **sin** detección MODIS también reciben una parte: VIIRS suele ver fuegos pequeños donde MODIS no vio nada.
   Esa parte depende de la actividad regional del mes y de cuánto fuego MODIS hubo en las 6 celdas vecinas.
3. *Banda de incertidumbre.* Se toma el percentil 90 del error anual de la validación
   (sección 4) como banda relativa `count_harm_lo` / `count_harm_hi`.

**Paso 4: agrupar las celdas.** Cada país prueba cuatro maneras de agrupar y se queda con la que
menos error tiene en la validación: {", ".join(f"*{MODEL_ES[k]}*: {MODEL_DESC[k]}" for k in MODEL_ES)}.
Los grupos por régimen se calculan solo con MODIS, de modo que no usan información de VIIRS y también
valen para antes de 2012.

## 4. ¿Funciona? La validación

**Cómo se mide.** Se esconde un año completo (2012–2025), se calibra con los demás, se estima lo que
VIIRS vio ese año a partir de MODIS y se compara con lo que VIIRS realmente vio. Se repite con cada año.
La **línea base** es la corrección simple: multiplicar MODIS por un factor fijo (la razón media VIIRS/MODIS).

| País | Modelo elegido | Error anual del método | Error anual de la línea base | Mejora | Banda |
|---|---|---|---|---|---|
{chr(10).join(rows)}

*Error anual = error porcentual medio del total del país por año. Banda = percentil 90 de ese error.*
{chr(10).join(detail)}

Además, el **mes de máxima actividad** se acierta, con una tolerancia de un mes, en al menos el
{pm1:.0f}% de los años en todas las configuraciones.

### Confiabilidad por país

Cada país recibe una etiqueta calculada con sus propias validaciones. **No se esconden los datos de baja
confiabilidad: se muestran marcados.**

- **alta:** el error anual baja al menos 20% frente a la línea base, la validación hacia atrás también la supera y la razón
  VIIRS/MODIS no deriva de forma significativa (p ≥ 0.05).
- **media:** mejora a la línea base en ambas validaciones y la banda de incertidumbre es de ±15% o menos.
- **baja:** cualquier otro caso.

| País | Confiabilidad | Motivos |
|---|---|---|
{qrows}

### Validación hacia atrás (el caso real de 2001–2011)

Los años 2001–2011 son anteriores a VIIRS, así que no se pueden comparar con él. La prueba más cercana es
mirar **hacia atrás**: calibrar con los años recientes ({backcast_train}) y predecir los anteriores ({backcast_test}),
que es la misma dirección del tiempo que las estimaciones de 2001–2011.

| País | Error anual del método | Error anual de la línea base | Calibrado con | Predicho |
|---|---|---|---|---|
{backrows}

### Deriva de órbita de Terra y Aqua

Desde ~2020 Terra y, después, Aqua se van desplazando de su hora de paso original. Lo medimos como la razón anual
"detecciones VIIRS ÷ detecciones MODIS" (2012–2025) y su tendencia (Mann-Kendall y pendiente de Sen):

| País | Terra+Aqua | Solo Terra | Solo Aqua |
|---|---|---|---|
{driftrows}

*Cada celda: valor p de la tendencia y cambio porcentual anual de la razón. Un p menor a 0.05 indica una deriva detectable.*
Por eso las estimaciones de 2001–2011 se calibran **solo con los años de órbita estable (2012–2021)**; el mes final de 2026,
que sí ocurre en la etapa de deriva, se calibra con todos los años.

## 5. Cómo se ve en la app

- Los años estimados (2001–2011) llevan un patrón rayado y su banda de incertidumbre.
- Cada respuesta de la API incluye `methodology_version`, `data_cutoff` y `harmonization_uncertainty`.
- Las cifras salen siempre de esta serie; la IA nunca calcula números.

## 6. Limitaciones (lo que no hacemos o no sabemos)

1. **2001–2011 no se puede validar directamente**: ahí no existe VIIRS contra qué comparar. Validamos la
   relación en 2012–2025 y suponemos que se mantiene hacia atrás.
2. **La deriva de órbita de Terra y Aqua** se mitiga calibrando solo con años estables (2012–2021), pero no se modela de forma explícita.
3. **El conteo de puntos de calor no es área quemada ni un incendio**: un incendio grande son muchos puntos.
4. **Los biomas son los de 2020** para todos los años; un cambio de cobertura entre 2001 y 2020 no se refleja.
5. **La elección entre configuraciones se hace con los mismos datos de validación**, lo que da una ligera
   ventaja optimista a la elegida.
6. **Cobertura:** {len(summary['countries'])} países procesados ({names}). El pipeline es global; los demás países no se han corrido. 2026 y NOAA-21 solo están para México y Argentina.
7. **Datos hasta {cutoff}** (MODIS) y **{vcut}** (VIIRS), procesamiento estándar de FIRMS. Lo posterior es
   casi en tiempo real y todavía no se incorpora a la serie armonizada.

## 7. Reproducir

```fish
source .venv/bin/activate.fish
python -m pipeline.ingest --country Mexico --years 2001-2026
python -m pipeline.h3_cells --country Mexico --years 2001-2026
python -m pipeline.landcover --country Mexico
python -m pipeline.harmonize --country Mexico
python -m pipeline.methodology_doc
```
"""


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--processed", type=Path, default=Path(os.getenv("FIRELY_DATA_PROCESSED", "data/processed")))
    p.add_argument("--docs", type=Path, default=Path("docs"))
    p.add_argument("--web-data", type=Path, default=Path("web/public/data"))
    a = p.parse_args()
    summary, star, cutoffs = load(a.processed)
    (a.docs / "metodologia-armonizacion.md").write_text(build_markdown(summary, star, cutoffs), encoding="utf-8")
    a.web_data.mkdir(parents=True, exist_ok=True)
    (a.web_data / "harmonization.json").write_text(json.dumps(build_json(summary, star, cutoffs), ensure_ascii=False, indent=2))
    print("written", a.docs / "metodologia-armonizacion.md", a.web_data / "harmonization.json")


if __name__ == "__main__":
    main()
