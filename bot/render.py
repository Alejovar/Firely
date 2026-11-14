"""Render the API calendar as a compact PNG."""

from __future__ import annotations

from io import BytesIO

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
import numpy as np


def calendar_png(envelope: dict, title: str = "Firely") -> bytes:
    rows = [row for row in envelope.get("rows", [])
            if isinstance(row, dict) and isinstance(row.get("year"), int)
            and isinstance(row.get("month"), int) and 1 <= row["month"] <= 12]
    years = sorted({row["year"] for row in rows})
    if not years:
        raise ValueError("No calendar rows to render")
    values = np.full((len(years), 12), np.nan)
    estimated = set()
    index = {year: i for i, year in enumerate(years)}
    for row in rows:
        i, j = index[row["year"]], row["month"] - 1
        value = row.get("count_harm")
        if isinstance(value, (int, float)) and np.isfinite(value):
            values[i, j] = value
        if row.get("is_estimated"):
            estimated.add((i, j))
    figure, axis = plt.subplots(figsize=(9, max(2.6, 0.34 * len(years) + 1.2)))
    try:
        cmap = matplotlib.colormaps["cividis"].with_extremes(bad="#eeeeee")
        plot = axis.imshow(np.ma.masked_invalid(values), cmap=cmap, aspect="auto", interpolation="none")
        for i, j in estimated:
            axis.add_patch(Rectangle((j - .5, i - .5), 1, 1, facecolor="none",
                                     edgecolor="#555555", hatch="///", linewidth=.3))
        axis.set_xticks(range(12), ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                                     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])
        axis.set_yticks(range(len(years)), [str(year) for year in years])
        axis.set_title(title)
        figure.colorbar(plot, ax=axis, label="VIIRS-equivalent hotspots")
        figure.text(.01, .01, "Hatched: estimated · NASA FIRMS · methodology "
                    f"{envelope.get('methodology_version') or 'unavailable'} · data through "
                    f"{envelope.get('data_cutoff') or 'unavailable'}", fontsize=7)
        figure.tight_layout(rect=(0, .035, 1, 1))
        output = BytesIO()
        figure.savefig(output, format="png", dpi=120)
        return output.getvalue()
    finally:
        plt.close(figure)
