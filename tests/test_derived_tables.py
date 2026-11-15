"""Invariants for scientific/SP and provisional/NRT table boundaries."""
import duckdb
import h3

from pipeline.daily_update import materialize


def test_sp_publication_retires_nrt_derivatives(tmp_path):
    cell = h3.latlng_to_cell(19.0,-99.0,6)
    fine = h3.latlng_to_cell(19.0,-99.0,7)
    con = duckdb.connect()
    raw = tmp_path / "nrt" / "Mexico" / "date=2026-11-14"
    raw.mkdir(parents=True)
    con.execute("""CREATE TABLE nrt AS SELECT ?::VARCHAR h3_r6,?::VARCHAR h3_r7,
      TIMESTAMP '2026-11-14 12:00' AS ts_utc,DATE '2026-11-14' AS date_utc,
      19.0 AS lat,-99.0 AS lon,'NOAA20'::VARCHAR AS platform,12.0 AS frp_mw,
      'nominal'::VARCHAR AS confidence_h,'D'::VARCHAR AS daynight,
      'FIRMS NRT'::VARCHAR AS source,TIMESTAMP '2026-11-14 13:00' AS ingested_at""",[cell,fine])
    con.execute("COPY nrt TO ? (FORMAT PARQUET)",[str(raw / "part.parquet")])
    assert materialize(tmp_path,"Mexico")["rows"] == 1
    day = tmp_path / "cell_day_nrt" / "Mexico" / "year=2026" / "part.parquet"
    assert con.execute("SELECT DISTINCT source FROM read_parquet(?)",[str(day)]).fetchone() == ("NRT",)

    # Public API shows the provisional derivative with explicit provenance.
    monthly = tmp_path / "cell_month_harmonized" / "Mexico" / "year=2025"
    monthly.mkdir(parents=True)
    con.execute("""CREATE TABLE m AS SELECT ?::VARCHAR AS h3_r6,12::TINYINT AS month,
      0.0 AS count_harm,0.0 AS count_harm_lo,0.0 AS count_harm_hi,
      0.0 AS frp_harm,NULL::DOUBLE AS clear_frac,FALSE AS is_estimated""",[cell])
    con.execute("COPY m TO ? (FORMAT PARQUET)",[str(monthly / "part.parquet")])
    from api.app import real
    from datetime import date
    from os import environ
    previous = environ.get("FIRELY_DATA_PROCESSED")
    environ["FIRELY_DATA_PROCESSED"] = str(tmp_path)
    try:
        cal = real.calendar(h3_list=cell,from_=date(2026,11,1))
        assert cal["rows"][0]["source"] == "NRT"
        assert cal["rows"][0]["is_provisional"] is True
        daily = real.daily(year=2026,month=11,h3_list=cell)
        assert daily["rows"][0]["source"] == "NRT"
        events = real.events(h3_list=cell,min_hotspots=0)
        assert events["rows"][0]["source"] == "NRT"
    finally:
        if previous is None:
            environ.pop("FIRELY_DATA_PROCESSED",None)
        else:
            environ["FIRELY_DATA_PROCESSED"] = previous

    sp = tmp_path / "hotspots" / "Mexico" / "year=2026"
    sp.mkdir(parents=True)
    con.execute("CREATE TABLE scientific AS SELECT DATE '2026-11-14' AS date_local")
    con.execute("COPY scientific TO ? (FORMAT PARQUET)",[str(sp / "part.parquet")])
    assert materialize(tmp_path,"Mexico")["rows"] == 0
    assert not day.exists()
    assert (raw / "part.parquet").exists()  # raw audit trail is retained
