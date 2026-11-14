import duckdb
import h3

from pipeline.h3_cells import process_year


def test_cells_and_cell_month(tmp_path):
    src = tmp_path / "in.parquet"
    con = duckdb.connect()
    con.execute(f"""COPY (SELECT * FROM (VALUES
        ('a', TIMESTAMP '2021-03-09 19:42:00', DATE '2021-03-09', 25.35, -100.55, 'MODIS', 'Aqua', 'nominal', 5.0, 'D'),
        ('b', TIMESTAMP '2021-03-10 08:00:00', DATE '2021-03-10', 25.35, -100.55, 'VIIRS', 'SNPP', 'alta', 7.0, 'N'),
        ('c', TIMESTAMP '2021-04-01 08:00:00', DATE '2021-04-01', 25.35, -100.55, 'VIIRS', 'SNPP', 'alta', 3.0, 'D')
      ) t(id, ts_utc, date_local, lat, lon, sensor, platform, confidence_h, frp_mw, daynight))
      TO '{src}' (FORMAT PARQUET)""")
    hot, cm = tmp_path / "h.parquet", tmp_path / "c.parquet"
    # columns missing in the fixture are tolerated by the SELECT only if present; add them
    con.execute(f"""COPY (SELECT *, NULL::VARCHAR AS burn_type, NULL::VARCHAR AS event_id, NULL::DOUBLE AS harm_weight,
        'SP' AS source FROM read_parquet('{src}')) TO '{tmp_path / 'full.parquet'}' (FORMAT PARQUET)""")
    stats = process_year(con, tmp_path / "full.parquet", hot, cm)
    assert stats["hotspots"] == 3 and stats["unique_points"] == 1
    expected = h3.latlng_to_cell(25.35, -100.55, 6)
    rows = con.execute(f"SELECT h3_r6, month, count_raw_modis, count_raw_viirs FROM read_parquet('{cm}') ORDER BY month").fetchall()
    assert rows == [(expected, 3, 1, 1), (expected, 4, 0, 1)]
    assert con.execute(f"SELECT count(*) FROM read_parquet('{hot}') WHERE h3_r7 IS NULL").fetchone()[0] == 0
