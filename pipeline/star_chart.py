"""Star chart: raw MODIS, raw VIIRS and the harmonized series per country (docs section 5.9)."""
import argparse
import os
from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--processed", type=Path, default=Path(os.getenv("FIRELY_DATA_PROCESSED", "data/processed")))
    p.add_argument("--out", type=Path, default=Path("docs/figures/grafica_estrella.png"))
    p.add_argument("--version", default="1.2.0-hybrid-biome")
    a = p.parse_args()
    countries = sorted(f.stem.removeprefix("star_chart_") for f in (a.processed / "metadata").glob("star_chart_*.csv"))
    cols = min(3, len(countries))
    rows = -(-len(countries) // cols)
    fig, axes = plt.subplots(rows, cols, figsize=(6.5 * cols, 4.8 * rows), facecolor="#0d0f11", squeeze=False)
    flat = list(axes.flat)
    for extra in flat[len(countries):]:
        extra.axis("off")
    names = {"Mexico": "México"}
    for ax, c in zip(flat, countries):
        lab = names.get(c, c.replace("_", " "))
        d = pd.read_csv(a.processed / "metadata" / f"star_chart_{c}.csv")
        d = d[(d.year >= 2001) & (d.year <= 2025)].copy()
        d.loc[d.viirs_raw == 0, "viirs_raw"] = np.nan
        ax.set_facecolor("#0d0f11")
        ax.plot(d.year, d.modis_raw, color="#9aa1a9", lw=1.8, label="MODIS sin armonizar")
        ax.plot(d.year, d.viirs_raw, color="#fde34a", lw=1.8, ls="--", label="VIIRS (todos los satélites)")
        ax.plot(d.year, d.harmonized, color="#e8803f", lw=2.8, label="Firely armonizado (equiv. S-NPP)")
        ax.axvspan(2000.5, 2011.6, color="#ffffff", alpha=0.05)
        ax.axvline(2012, color="#6b727a", lw=1, ls=":")
        top = ax.get_ylim()[1]
        ax.set_ylim(0, top * 1.12)
        ax.text(2001, top * 1.06, "años estimados (2001–2011)", color="#9aa1a9", fontsize=8)
        ax.text(2012.2, top * 1.06, "VIIRS observado", color="#9aa1a9", fontsize=8)
        ax.set_title(lab, color="#ebe8e3", fontsize=12)
        ax.tick_params(colors="#9aa1a9")
        for s in ax.spines.values():
            s.set_color("#262b31")
        ax.set_ylabel("Puntos de calor por año", color="#9aa1a9")
    flat[min(1, len(countries) - 1)].legend(frameon=False, labelcolor="#ebe8e3", fontsize=8, loc="center right", bbox_to_anchor=(1.0, 0.62))
    fig.suptitle(f"El salto de 2012 y su corrección  ·  Fuente: NASA FIRMS  ·  metodología {a.version}", color="#9aa1a9", fontsize=9)
    fig.tight_layout()
    a.out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(a.out, dpi=150, facecolor=fig.get_facecolor())


if __name__ == "__main__":
    main()
