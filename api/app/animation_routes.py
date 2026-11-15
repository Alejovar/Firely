"""Dense monthly frames for the 25-year H3 r4 animation."""
from __future__ import annotations

from calendar import monthrange
from datetime import date

from fastapi import APIRouter, HTTPException, Query

from . import db
from .extra_routes import COUNTRIES
from .real import _envelope

router = APIRouter()


@router.get("/animation/frames")
def frames(country: str = "all", res: int = Query(4, ge=4, le=4)):
    if country not in (*COUNTRIES,"all"):
        raise HTTPException(422,"Unknown country")
    selected = COUNTRIES if country == "all" else (country,)
    files = [str(db.processed_root() / "animation_r4" / c / "part.parquet") for c in selected]
    if any(not (db.processed_root() / "animation_r4" / c / "part.parquet").exists() for c in selected):
        raise HTTPException(503,detail={"code":"animation_unavailable","message":"Run python -m pipeline.animation_frames for all processed countries"})
    with db.connection() as con:
        rows = con.execute("""SELECT h3_r4,year,month,sum(count_harm) AS value,bool_or(is_estimated) AS is_estimated
          FROM read_parquet(?) GROUP BY 1,2,3 ORDER BY 2,3,1""",[files]).fetchall()
    months = sorted({(y,m) for _,y,m,_,_ in rows})
    cells = sorted({c for c,_,_,_,_ in rows})
    mi = {ym:i for i,ym in enumerate(months)}
    ci = {c:i for i,c in enumerate(cells)}
    values = [[0.0]*len(cells) for _ in months]
    estimated = set()
    for cell,y,m,value,is_estimated in rows:
        values[mi[(y,m)]][ci[cell]] = round(float(value or 0),3)
        if is_estimated:
            estimated.add((y,m))
    cutoff = date(months[-1][0],months[-1][1],monthrange(*months[-1])[1]).isoformat() if months else None
    return _envelope(cutoff,country=country,res=res,
      months=[f"{y:04d}-{m:02d}" for y,m in months],cells=cells,values=values,
      max=max((max(v,default=0) for v in values),default=0),
      is_estimated_months=[f"{y:04d}-{m:02d}" for y,m in sorted(estimated)])
