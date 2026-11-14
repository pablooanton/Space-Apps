"""Read-only, paginated Supabase source for the FlameSim model.

The publishable key uses the anon role; Row Level Security on the source table
allows SELECT. Never replace this with a service-role key.
"""
import csv
import io
import json
import math
import os
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from predict import EXPECTED_COLUMNS, NUMERIC_COLS, OPTIONAL_COLUMNS

DEFAULT_URL = "https://lxpmuoabwyanzgtzchwn.supabase.co"
DEFAULT_PUBLISHABLE_KEY = "sb_publishable_ZKEREPVEz6w3Y6e0GOMUkQ_Sg6I4mvI"
TABLE = "nasa_experiment_records"
PAGE_SIZE = 500
MAX_PAGES = 200

# Broad physical bounds catch spreadsheet date serials and impossible values.
INPUT_BOUNDS = {
    "in_o2_molar_fraction_pct": (0, 100),
    "in_ventilation_flow_cm_s": (0, 1000),
    "in_material_thickness_mm": (0.001, 100),
    "in_cabin_pressure_kpa": (1, 200),
    "in_gravity_level_g": (0, 2),
}
OUTPUT_BOUNDS = {
    "out_flame_spread_rate_mm_s": (0, 1000),
    "out_flame_temperature_k": (0, 5000),
    "out_ignition_time_s": (0, 86400),
    "out_hrr_watts": (0, 10000000),
    "out_hrr_kilowatts": (0, 10000),
    "out_fri_risk_index": (0, 100),
    "out_spread_rate_1g_ref_mm_s": (0, 1000),
    "out_safe_isolation_dist_mm": (0, 1000000),
    "out_co_concentration_ppm": (0, 1000000),
    "out_soot_generation_rate_mg_g": (0, 1000000),
    "out_smoke_opacity_pct_m": (0, 100),
    "out_acid_gas_hcl_ppm": (0, 1000000),
    "out_acid_gas_hf_ppm": (0, 1000000),
    "out_acid_gas_hcn_ppm": (0, 1000000),
    "out_mean_particle_diameter_um": (0, 1000),
    "out_estimated_detection_time_s": (0, 86400),
}


def fetch_rows(url=None, key=None, opener=urlopen):
    """Fetch every page; never silently truncate the source at 1,000 rows."""
    url = (url or os.getenv("SUPABASE_URL") or DEFAULT_URL).rstrip("/")
    key = key or os.getenv("SUPABASE_PUBLISHABLE_KEY") or DEFAULT_PUBLISHABLE_KEY
    if urlparse(url).scheme != "https" or not key:
        raise ValueError("Supabase requires an HTTPS URL and a publishable key.")
    rows = []
    for page in range(MAX_PAGES):
        query = urlencode({
            "select": ",".join(EXPECTED_COLUMNS + OPTIONAL_COLUMNS),
            "order": "record_id.asc",
            "limit": PAGE_SIZE,
            "offset": page * PAGE_SIZE,
        })
        request = Request(
            f"{url}/rest/v1/{TABLE}?{query}",
            headers={"apikey": key, "Accept": "application/json"},
        )
        with opener(request, timeout=20) as response:
            batch = json.load(response)
        if not isinstance(batch, list):
            raise ValueError("Unexpected response from Supabase.")
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            return rows
    raise RuntimeError("Supabase dataset exceeds the configured page limit.")


def _bounded(value, bounds):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) and bounds[0] <= number <= bounds[1] else None


def prepare_rows(rows):
    """Exclude corrupt input records; blank corrupt outputs before interpolation."""
    clean = []
    excluded = 0
    sanitized = 0
    for raw in rows:
        if not raw.get("record_id") or not raw.get("material_id"):
            excluded += 1
            continue
        if any(_bounded(raw.get(col), bounds) is None for col, bounds in INPUT_BOUNDS.items()):
            excluded += 1
            continue
        row = {col: raw.get(col) for col in EXPECTED_COLUMNS + OPTIONAL_COLUMNS}
        for col, bounds in OUTPUT_BOUNDS.items():
            value = row.get(col)
            if value not in (None, "") and _bounded(value, bounds) is None:
                row[col] = None
                sanitized += 1
        clean.append(row)
    return clean, excluded, sanitized


def rows_to_csv(rows):
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=EXPECTED_COLUMNS + OPTIONAL_COLUMNS)
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue()


def load_store_from_supabase(store, fetcher=fetch_rows):
    rows = fetcher()
    if not rows:
        raise RuntimeError("Supabase returned no experiment records.")
    clean, excluded, sanitized = prepare_rows(rows)
    if not clean:
        raise RuntimeError("Supabase returned no records with plausible input values.")
    store.load_csv_text(rows_to_csv(clean), is_sample=False)
    store.source = "supabase"
    store.source_row_count = len(rows)
    store.excluded_row_count = excluded
    store.sanitized_cell_count = sanitized
    store.warnings.insert(0, {
        "row": 0,
        "record_id": "SOURCE",
        "type": "DATASET_NOT_VERIFIED",
        "message": (
            f"Supabase import is not independently verified for safety use. "
            f"{excluded} of {len(rows)} source records excluded for invalid inputs; "
            f"{sanitized} invalid output cells ignored."
        ),
    })
    return store.summary()

