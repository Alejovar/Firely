"""Small end-to-end check of annual/request overlap and confidence handling."""

import csv
from zipfile import ZipFile

import duckdb

from pipeline.ingest import ingest


FIELDS = [
    "latitude", "longitude", "acq_date", "acq_time", "satellite",
    "confidence", "frp", "daynight", "type",
]


def archive(path, member, rows, fields=FIELDS):
    import io
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
    path.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(path, "w") as zip_file:
        zip_file.writestr(member, stream.getvalue())


def row(lat, lon, date, time, satellite, confidence, fire_type="0"):
    return dict(latitude=lat, longitude=lon, acq_date=date, acq_time=time,
                satellite=satellite, confidence=confidence, frp="2.5",
                daynight="N", type=fire_type)


def test_ingest_dedupes_and_keeps_low_flag(tmp_path):
    raw, interim = tmp_path / "raw", tmp_path / "interim"
    annual = raw / "MODIS" / "modis_2023_all_countries.zip"
    duplicate = row("-29.1", "-66.1", "2023-05-01", "0801", "Terra", "65")
    archive(annual, "modis/2023/modis_2023_Argentina.csv", [
        duplicate,
        row("-29.2", "-66.2", "2023-05-01", "0802", "Aqua", "20"),
        row("-29.3", "-66.3", "2023-05-01", "0803", "Terra", "90", "2"),
    ])
    request = raw / "firms request" / "DL_FIRE_M-C61_847109.zip"
    archive(request, "fire_archive_M-C61_847109.csv", [duplicate])
    viirs = raw / "DATA" / "viirs-snpp_2023_all_countries.zip"
    archive(viirs, "viirs-snpp/2023/viirs-snpp_2023_Argentina.csv", [
        row("-29.4", "-66.4", "2023-05-01", "0804", "N", "n"),
        row("-29.5", "-66.5", "2023-05-01", "0805", "N", "l"),
    ])
    no_type = raw / "firms request" / "DL_FIRE_J2V-C2_847110.zip"
    archive(no_type, "fire_archive_J2V-C2_847110.csv", [
        {key: value for key, value in row("-29.6", "-66.6", "2023-05-01", "0806", "N21", "h").items() if key != "type"}
    ], FIELDS[:-1])
    report = ingest(raw, interim, "Argentina", [2023])
    assert report["years"]["2023"]["after"] == {"NOAA21": 1, "SNPP": 1, "Terra": 1}
    assert any("no type column" in issue for issue in report["issues"])
    assert report["years"]["2023"]["low_confidence"] == {"Aqua": 1, "SNPP": 1}
    main = interim / "hotspots" / "Argentina" / "year=2023" / "part-0.parquet"
    low = interim / "hotspots_low_confidence" / "Argentina" / "year=2023" / "part-0.parquet"
    con = duckdb.connect()
    assert con.execute("SELECT count(*), count(DISTINCT id), count(date_local) FROM read_parquet(?)", [str(main)]).fetchone() == (3, 3, 3)
    assert con.execute("SELECT count(*), min(confidence_h) FROM read_parquet(?)", [str(low)]).fetchone() == (2, "baja")
    assert ingest(raw, interim, "Argentina", [2023])["skipped"] == [2023]
    assert ingest(raw, interim, "Argentina", [2023], force=True)["years"]["2023"]["after"] == {"NOAA21": 1, "SNPP": 1, "Terra": 1}
