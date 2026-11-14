"""
FlameSim: Spacecraft Fire Safety Simulator — Prediction & Interpolation Engine (predict.py)
NASA Space Apps Challenge 2026 ("Flame in Freefall")

Implements:
- Robust CSV loading (29 core columns A-AC + optional metadata columns `data_quality_flag`, `extraction_notes`)
- Missing/empty/"N/A"/comma-decimal parsing (never treats empty as 0)
- Automatic W <-> kW derivation for redundant HRR columns (N and O)
- Normalization of free-text/Spanish regime strings into canonical enums:
  NO_IGNITION, SELF_EXTINCTION, COOL_FLAME, STABLE_FLAME, BLOW_OFF
- Single replaceable function `predict(inputs) -> outputs` using Inverse-Distance-Weighted (IDW)
  k-NN interpolation over normalized features, with automatic fallback to physically-inspired heuristics.
"""

import csv
import io
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

EXPECTED_COLUMNS = [
    "record_id",
    "document_id",
    "material_id",
    "in_o2_molar_fraction_pct",
    "in_ventilation_flow_cm_s",
    "in_material_thickness_mm",
    "in_cabin_pressure_kpa",
    "in_flow_direction",
    "in_gravity_level_g",
    "out_flame_spread_rate_mm_s",
    "out_combustion_regime",
    "out_flame_temperature_k",
    "out_ignition_time_s",
    "out_hrr_watts",
    "out_hrr_kilowatts",
    "out_fri_risk_index",
    "out_verdict_1g_vs_ug",
    "out_spread_rate_1g_ref_mm_s",
    "out_safe_isolation_dist_mm",
    "out_co_concentration_ppm",
    "out_soot_generation_rate_mg_g",
    "out_smoke_opacity_pct_m",
    "out_acid_gas_hcl_ppm",
    "out_acid_gas_hf_ppm",
    "out_acid_gas_hcn_ppm",
    "out_mean_particle_diameter_um",
    "out_optimal_sensor_type",
    "out_estimated_detection_time_s",
    "out_recommended_mitigation",
]

OPTIONAL_COLUMNS = ["data_quality_flag", "extraction_notes"]

NUMERIC_COLS = [
    "in_o2_molar_fraction_pct",
    "in_ventilation_flow_cm_s",
    "in_material_thickness_mm",
    "in_cabin_pressure_kpa",
    "in_gravity_level_g",
    "out_flame_spread_rate_mm_s",
    "out_flame_temperature_k",
    "out_ignition_time_s",
    "out_hrr_watts",
    "out_hrr_kilowatts",
    "out_fri_risk_index",
    "out_spread_rate_1g_ref_mm_s",
    "out_safe_isolation_dist_mm",
    "out_co_concentration_ppm",
    "out_soot_generation_rate_mg_g",
    "out_smoke_opacity_pct_m",
    "out_acid_gas_hcl_ppm",
    "out_acid_gas_hf_ppm",
    "out_acid_gas_hcn_ppm",
    "out_mean_particle_diameter_um",
    "out_estimated_detection_time_s",
]


def parse_float_safe(val: Any) -> Optional[float]:
    """Treat empty, NaN, N/A, null as None (never 0). Accept comma decimals."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return None if math.isnan(val) else float(val)
    s = str(val).strip()
    if not s or s.upper() in {"N/A", "NA", "NAN", "NULL", "NONE", "-", "--"}:
        return None
    s = s.replace(",", ".")
    try:
        num = float(s)
        return None if math.isnan(num) else num
    except ValueError:
        return None


def normalize_regime(val: Any) -> Optional[str]:
    """Normalize English/Spanish/free-text variants into the 5 canonical regimes."""
    if val is None:
        return None
    s = str(val).strip().upper()
    if not s or s in {"N/A", "NA", "NONE"}:
        return None
    if any(k in s for k in ["COOL", "FRIA", "FRÍA", "LATENT", "600"]):
        return "COOL_FLAME"
    if any(k in s for k in ["BLOW", "SOPLADO"]):
        return "BLOW_OFF"
    if any(k in s for k in ["SELF", "QUENCH", "AUTOEXT", "STARV"]):
        return "SELF_EXTINCTION"
    if any(k in s for k in ["NO_IG", "NO IG", "SUB-LOI", "NONE"]):
        return "NO_IGNITION"
    if any(k in s for k in ["STABLE", "STEADY", "VISIBLE", "ESTABLE", "ESTACIONARIA", "HOT", "SMOLDER"]):
        return "STABLE_FLAME"
    return "STABLE_FLAME"


def normalize_flow_dir(val: Any) -> str:
    s = str(val or "").strip().upper()
    if "OPP" in s or "OPUESTO" in s or "CONTRA" in s:
        return "OPPOSED"
    if "QUIES" in s or "ESTANC" in s or "STILL" in s or "ZERO" in s:
        return "QUIESCENT"
    return "CONCURRENT"


class DatasetStore:
    def __init__(self):
        self.rows: List[Dict[str, Any]] = []
        self.is_sample_data: bool = True
        self.warnings: List[Dict[str, Any]] = []
        self.missing_columns: List[str] = []
        self.unexpected_columns: List[str] = []

    def load_csv_text(self, csv_text: str, is_sample: bool = False) -> Dict[str, Any]:
        reader = csv.DictReader(io.StringIO(csv_text.strip()))
        headers = [h.strip() for h in (reader.fieldnames or []) if h]

        self.missing_columns = [c for c in EXPECTED_COLUMNS if c not in headers]
        self.unexpected_columns = [
            c for c in headers if c not in EXPECTED_COLUMNS and c not in OPTIONAL_COLUMNS
        ]
        self.warnings = []
        parsed_rows: List[Dict[str, Any]] = []

        if self.missing_columns:
            self.warnings.append({
                "row": 0,
                "record_id": "HEADER",
                "type": "MISSING_COLUMNS",
                "message": f"Missing expected columns: {', '.join(self.missing_columns)}"
            })
        if self.unexpected_columns:
            self.warnings.append({
                "row": 0,
                "record_id": "HEADER",
                "type": "MISNAMED_OR_EXTRA_COLUMNS",
                "message": f"Unrecognized/misnamed columns ignored: {', '.join(self.unexpected_columns)}"
            })

        for idx, raw in enumerate(reader, start=2):
            row: Dict[str, Any] = {}
            rec_id = (raw.get("record_id") or f"ROW-{idx}").strip()
            row["record_id"] = rec_id
            row["document_id"] = (raw.get("document_id") or "UNKNOWN-DOC").strip()
            row["material_id"] = (raw.get("material_id") or "custom").strip().lower()
            row["in_flow_direction"] = normalize_flow_dir(raw.get("in_flow_direction"))

            row_missing_fields = []
            for col in NUMERIC_COLS:
                raw_val = raw.get(col)
                parsed_val = parse_float_safe(raw_val)
                if raw_val not in (None, "") and parsed_val is None:
                    self.warnings.append({
                        "row": idx,
                        "record_id": rec_id,
                        "type": "PARSE_WARNING",
                        "message": f"Could not parse number in '{col}': '{raw_val}' (treated as missing)"
                    })
                row[col] = parsed_val
                if parsed_val is None and col.startswith("out_"):
                    row_missing_fields.append(col)

            # Derive redundant HRR columns N (Watts) and O (kilowatts)
            w_val = row.get("out_hrr_watts")
            kw_val = row.get("out_hrr_kilowatts")
            if w_val is None and kw_val is not None:
                row["out_hrr_watts"] = round(kw_val * 1000.0, 2)
                if "out_hrr_watts" in row_missing_fields:
                    row_missing_fields.remove("out_hrr_watts")
            elif kw_val is None and w_val is not None:
                row["out_hrr_kilowatts"] = round(w_val / 1000.0, 4)
                if "out_hrr_kilowatts" in row_missing_fields:
                    row_missing_fields.remove("out_hrr_kilowatts")

            row["out_combustion_regime"] = normalize_regime(raw.get("out_combustion_regime"))
            row["out_verdict_1g_vs_ug"] = (raw.get("out_verdict_1g_vs_ug") or "").strip() or None
            row["out_optimal_sensor_type"] = (raw.get("out_optimal_sensor_type") or "").strip() or None
            row["out_recommended_mitigation"] = (raw.get("out_recommended_mitigation") or "").strip() or None
            row["data_quality_flag"] = (raw.get("data_quality_flag") or "EXPERIMENTAL").strip()
            row["extraction_notes"] = (raw.get("extraction_notes") or "").strip()

            if row_missing_fields:
                self.warnings.append({
                    "row": idx,
                    "record_id": rec_id,
                    "type": "MISSING_OUTPUT_CELLS",
                    "message": f"{len(row_missing_fields)} empty output cells: {', '.join(row_missing_fields[:6])}{'...' if len(row_missing_fields) > 6 else ''}"
                })

            parsed_rows.append(row)

        self.rows = parsed_rows
        self.is_sample_data = is_sample or any(
            "SAMPLE" in str(r.get("data_quality_flag", "")).upper() for r in parsed_rows
        )
        return self.summary()

    def summary(self) -> Dict[str, Any]:
        return {
            "row_count": len(self.rows),
            "is_sample_data": self.is_sample_data,
            "missing_columns": self.missing_columns,
            "unexpected_columns": self.unexpected_columns,
            "warnings": self.warnings,
            "rows": self.rows,
        }


STORE = DatasetStore()
SAMPLE_CSV_PATH = Path(__file__).resolve().parent / "sample_nasa_psi.csv"
if SAMPLE_CSV_PATH.exists():
    STORE.load_csv_text(SAMPLE_CSV_PATH.read_text(encoding="utf-8"), is_sample=True)


# ============================================================================
# NORMALIZED DISTANCE & PHYSICALLY-INSPIRED HEURISTIC FALLBACK
# ============================================================================

MATERIAL_BASE_PROPS = {
    "cotton": {"loi": 17.5, "base_vf": 3.1, "rho": 0.45, "hc": 16.5, "hcl": None, "hf": None, "hcn": None},
    "pmma":   {"loi": 17.0, "base_vf": 1.6, "rho": 1.18, "hc": 25.0, "hcl": None, "hf": None, "hcn": None},
    "pvc":    {"loi": 21.5, "base_vf": 0.85, "rho": 1.38, "hc": 18.0, "hcl": 42.0, "hf": 14.5, "hcn": 2.2},
    "nomex":  {"loi": 27.5, "base_vf": 0.55, "rho": 0.72, "hc": 14.0, "hcl": 0.0,  "hf": 0.0,  "hcn": 18.5},
    "custom": {"loi": 19.5, "base_vf": 1.35, "rho": 1.00, "hc": 20.0, "hcl": None, "hf": None, "hcn": None},
}


def compute_feature_distance(inp: Dict[str, Any], row: Dict[str, Any]) -> float:
    """Normalized Euclidean distance in 5D input space (log-scale on ventilation flow)."""
    o2_in = float(inp.get("in_o2_molar_fraction_pct", 21.0))
    fl_in = float(inp.get("in_ventilation_flow_cm_s", 10.0))
    th_in = float(inp.get("in_material_thickness_mm", 1.5))
    pr_in = float(inp.get("in_cabin_pressure_kpa", 101.3))
    gr_in = float(inp.get("in_gravity_level_g", 0.0))
    dir_in = normalize_flow_dir(inp.get("in_flow_direction", "CONCURRENT"))

    o2_r = row.get("in_o2_molar_fraction_pct")
    fl_r = row.get("in_ventilation_flow_cm_s")
    th_r = row.get("in_material_thickness_mm")
    pr_r = row.get("in_cabin_pressure_kpa")
    gr_r = row.get("in_gravity_level_g")
    dir_r = row.get("in_flow_direction", "CONCURRENT")

    d_o2 = ((o2_in - (o2_r if o2_r is not None else o2_in)) / 35.0) * 1.4
    log_fl_in = math.log10(max(0.0, fl_in) + 1.0)
    log_fl_r = math.log10(max(0.0, fl_r if fl_r is not None else fl_in) + 1.0)
    d_fl = ((log_fl_in - log_fl_r) / 1.71) * 1.3
    d_th = ((th_in - (th_r if th_r is not None else th_in)) / 10.0) * 1.0
    d_pr = ((pr_in - (pr_r if pr_r is not None else pr_in)) / 130.0) * 0.8
    d_gr = ((gr_in - (gr_r if gr_r is not None else gr_in)) / 1.0) * 1.2
    d_dir = 0.0 if dir_in == dir_r else 0.35

    return math.sqrt(d_o2**2 + d_fl**2 + d_th**2 + d_pr**2 + d_gr**2 + d_dir**2)


def compute_heuristic_outputs(inp: Dict[str, Any]) -> Dict[str, Any]:
    """Physically-inspired heuristic fallback when data is sparse or material is Custom."""
    mat_id = str(inp.get("material_id", "custom")).lower()
    props = MATERIAL_BASE_PROPS.get(mat_id, MATERIAL_BASE_PROPS["custom"])

    o2 = float(inp.get("in_o2_molar_fraction_pct", 21.0))
    flow = float(inp.get("in_ventilation_flow_cm_s", 12.0))
    thick = max(0.05, float(inp.get("in_material_thickness_mm", 1.5)))
    press = float(inp.get("in_cabin_pressure_kpa", 101.3))
    grav = float(inp.get("in_gravity_level_g", 0.0))
    flow_dir = normalize_flow_dir(inp.get("in_flow_direction", "CONCURRENT"))

    buoyancy_vel = 36.0 * math.sqrt(max(0.0, grav))
    eff_flow = math.sqrt(flow**2 + buoyancy_vel**2)
    press_factor = (press / 101.3) ** 0.35
    ug_bonus = -1.5 if (grav < 0.05 and 2.0 <= flow <= 22.0) else 0.0
    eff_loi = (props["loi"] + math.log10(thick + 1.0) * 2.0 + ug_bonus) / press_factor

    # Regime determination
    if o2 < eff_loi - 1.2:
        regime = "NO_IGNITION"
    elif grav < 0.05 and flow < 1.0 and o2 < eff_loi + 4.5:
        regime = "SELF_EXTINCTION"
    elif grav < 0.05 and 1.0 <= flow <= 4.5 and (eff_loi - 1.2 <= o2 <= eff_loi + 2.2):
        regime = "COOL_FLAME"
    elif flow > 42.0 and o2 < eff_loi + 7.0:
        regime = "BLOW_OFF"
    else:
        regime = "STABLE_FLAME"

    dir_mult = 1.3 if flow_dir == "CONCURRENT" else (0.78 if flow_dir == "OPPOSED" else 0.2)
    flow_mult = (min(eff_flow, 35.0) / 10.0) ** 0.55 if eff_flow > 0 else 0.1

    if regime == "STABLE_FLAME":
        vf = props["base_vf"] * max(0.1, ((o2 - eff_loi + 2.5) / 10.0)) ** 1.35 * dir_mult * flow_mult * (1.5 / (thick**0.6 + 0.4)) * press_factor
        temp_k = 1450.0 + (o2 - 18.0) * 22.0 + min(eff_flow, 25.0) * 5.0
    elif regime == "COOL_FLAME":
        vf = 0.14 * (o2 / 21.0)
        temp_k = 605.0
    else:
        vf = 0.0
        temp_k = 340.0 if regime == "NO_IGNITION" else 510.0

    tig = max(1.0, (thick * props["rho"] * 4.5) / (((o2 / 21.0) ** 1.25) * press_factor))
    hrr_w = 0.0 if regime in {"NO_IGNITION", "BLOW_OFF"} else round(max(15.0, vf * 50.0 * min(thick, 2.5) * props["rho"] * props["hc"] * 0.42), 1)
    fri = 12.0 if regime == "NO_IGNITION" else (24.0 if regime in {"SELF_EXTINCTION", "BLOW_OFF"} else min(100.0, round(25.0 + vf * 18.0 + hrr_w / 45.0 + (o2 - 21.0) * 1.4, 1)))
    safe_dist = 20.0 if hrr_w == 0 else round(35.0 + math.sqrt(hrr_w) * 4.2, 1)

    co_ppm = 15.0 if regime == "NO_IGNITION" else round((380.0 if regime == "COOL_FLAME" else 210.0) * (1.35 if grav < 0.05 else 1.0) * (24.0 / max(15.0, o2)), 1)
    soot_rate = 0.5 if regime in {"NO_IGNITION", "COOL_FLAME"} else round(15.0 * (1.3 if grav < 0.05 else 1.0), 1)
    opacity = round(soot_rate * 1.75, 1)

    dp = 0.32 if regime in {"COOL_FLAME", "NO_IGNITION"} else round(0.85 if grav < 0.05 else 0.28, 2)
    sensor = "GAS_CO_IR" if regime == "COOL_FLAME" else ("PHOTOELECTRIC_LASER" if dp >= 0.45 else "IONIZATION")
    tdet = round(tig + 18.0 / max(2.0, eff_flow), 1)

    if regime == "COOL_FLAME":
        mitigation = "1. Cool Flame hazard (~605 K invisible): Do NOT increase O2 or airflow (risk of hot re-ignition); 2. Isolate power & monitor with IR camera."
    elif regime in {"NO_IGNITION", "SELF_EXTINCTION"}:
        mitigation = "1. Keep HVAC ventilation off to maintain diffusive oxygen starvation; 2. Monitor surface cool-down with thermal IR."
    else:
        mitigation = "1. Shut off HVAC ventilation immediately (U_v -> 0 cm/s); 2. Deploy Fine Water Mist / CO2 PFE; 3. Crew don PBA breathing masks & scrub cabin CO."

    return {
        "out_flame_spread_rate_mm_s": round(vf, 3),
        "out_combustion_regime": regime,
        "out_flame_temperature_k": round(temp_k, 1),
        "out_ignition_time_s": round(tig, 2),
        "out_hrr_watts": hrr_w,
        "out_hrr_kilowatts": round(hrr_w / 1000.0, 4),
        "out_fri_risk_index": fri,
        "out_safe_isolation_dist_mm": safe_dist,
        "out_co_concentration_ppm": co_ppm,
        "out_soot_generation_rate_mg_g": soot_rate,
        "out_smoke_opacity_pct_m": opacity,
        "out_acid_gas_hcl_ppm": props["hcl"],
        "out_acid_gas_hf_ppm": props["hf"],
        "out_acid_gas_hcn_ppm": props["hcn"],
        "out_mean_particle_diameter_um": dp,
        "out_optimal_sensor_type": sensor,
        "out_estimated_detection_time_s": tdet,
        "out_recommended_mitigation": mitigation,
    }


def is_outside_material_bounds(inp: Dict[str, Any], mat_rows: List[Dict[str, Any]]) -> bool:
    if not mat_rows:
        return True
    for col in ["in_o2_molar_fraction_pct", "in_ventilation_flow_cm_s", "in_material_thickness_mm", "in_cabin_pressure_kpa"]:
        vals = [r[col] for r in mat_rows if r.get(col) is not None]
        if not vals:
            continue
        v = float(inp.get(col, 0.0))
        if v < min(vals) or v > max(vals):
            return True
    return False


def predict(inputs: Dict[str, Any], _skip_1g_comparison: bool = False) -> Dict[str, Any]:
    """
    Single replaceable prediction function: predict(inputs) -> outputs.
    Implements k-NN Inverse-Distance-Weighted interpolation per output column,
    with automatic fallback to physically-inspired heuristics.
    """
    mat_id = str(inputs.get("material_id", "cotton")).lower()
    flow_dir = normalize_flow_dir(inputs.get("in_flow_direction", "CONCURRENT"))

    mat_rows = [r for r in STORE.rows if r.get("material_id") == mat_id]
    dir_rows = [r for r in mat_rows if r.get("in_flow_direction") == flow_dir]
    candidate_rows = dir_rows if len(dir_rows) >= 3 else mat_rows

    scored: List[Tuple[float, Dict[str, Any]]] = [
        (compute_feature_distance(inputs, r), r) for r in candidate_rows
    ]
    scored.sort(key=lambda x: x[0])

    extrapolated_flag = is_outside_material_bounds(inputs, mat_rows)
    heur = compute_heuristic_outputs(inputs)
    use_pure_heuristic = (mat_id == "custom") or (len(mat_rows) < 2)

    nearest_3 = [
        {
            "record_id": r["record_id"],
            "document_id": r["document_id"],
            "material_id": r["material_id"],
            "distance": round(dist, 4),
            "in_o2_molar_fraction_pct": r.get("in_o2_molar_fraction_pct"),
            "in_ventilation_flow_cm_s": r.get("in_ventilation_flow_cm_s"),
            "in_material_thickness_mm": r.get("in_material_thickness_mm"),
            "in_cabin_pressure_kpa": r.get("in_cabin_pressure_kpa"),
            "in_flow_direction": r.get("in_flow_direction"),
            "in_gravity_level_g": r.get("in_gravity_level_g"),
            "out_flame_spread_rate_mm_s": r.get("out_flame_spread_rate_mm_s"),
            "out_combustion_regime": r.get("out_combustion_regime"),
            "out_fri_risk_index": r.get("out_fri_risk_index"),
            "out_hrr_watts": r.get("out_hrr_watts"),
        }
        for dist, r in scored[:3]
    ]

    def predict_numeric_col(col: str, unit: str, decimals: int = 2) -> Dict[str, Any]:
        valid = [(d, r) for d, r in scored if r.get(col) is not None]
        if use_pure_heuristic or not valid:
            val = heur.get(col)
            return {
                "value": round(val, decimals) if val is not None else None,
                "unit": unit,
                "source": "heuristic",
                "confidence": "low",
                "records_used": [],
            }

        # Exact match check
        if valid[0][0] < 0.025:
            r0 = valid[0][1]
            return {
                "value": round(float(r0[col]), decimals),
                "unit": unit,
                "source": "experimental",
                "confidence": "high",
                "records_used": [{"record_id": r0["record_id"], "document_id": r0["document_id"]}],
            }

        k_slice = valid[: min(4, len(valid))]
        weights = [1.0 / ((d + 1e-4) ** 2) for d, _ in k_slice]
        w_sum = sum(weights)
        interp_val = sum(w * float(r[col]) for w, (_, r) in zip(weights, k_slice)) / w_sum

        min_d = k_slice[0][0]
        regimes_in_k = {r.get("out_combustion_regime") for _, r in k_slice if r.get("out_combustion_regime")}
        near_boundary = len(regimes_in_k) > 1

        if extrapolated_flag or min_d > 0.55 or len(valid) < 2:
            conf = "low"
        elif min_d < 0.25 and not near_boundary and len(valid) >= 3:
            conf = "high"
        else:
            conf = "medium"

        src = "extrapolated" if extrapolated_flag else "interpolated"
        return {
            "value": round(interp_val, decimals),
            "unit": unit,
            "source": src,
            "confidence": conf,
            "records_used": [{"record_id": r["record_id"], "document_id": r["document_id"]} for _, r in k_slice],
        }

    def predict_categorical_col(col: str, unit: str = "") -> Dict[str, Any]:
        valid = [(d, r) for d, r in scored if r.get(col) is not None]
        if use_pure_heuristic or not valid:
            return {
                "value": heur.get(col),
                "unit": unit,
                "source": "heuristic",
                "confidence": "low",
                "records_used": [],
            }
        if valid[0][0] < 0.025:
            r0 = valid[0][1]
            return {
                "value": r0[col],
                "unit": unit,
                "source": "experimental",
                "confidence": "high",
                "records_used": [{"record_id": r0["record_id"], "document_id": r0["document_id"]}],
            }

        k_slice = valid[: min(3, len(valid))]
        # Weighted majority vote or nearest neighbor
        vote_scores: Dict[str, float] = {}
        for d, r in k_slice:
            v = str(r[col])
            vote_scores[v] = vote_scores.get(v, 0.0) + 1.0 / (d + 0.05)
        winner = max(vote_scores.items(), key=lambda x: x[1])[0]

        min_d = k_slice[0][0]
        conf = "low" if (extrapolated_flag or min_d > 0.55) else ("high" if min_d < 0.25 and len(vote_scores) == 1 else "medium")
        src = "extrapolated" if extrapolated_flag else "interpolated"
        return {
            "value": winner,
            "unit": unit,
            "source": src,
            "confidence": conf,
            "records_used": [{"record_id": r["record_id"], "document_id": r["document_id"]} for _, r in k_slice],
        }

    outputs: Dict[str, Any] = {
        "out_flame_spread_rate_mm_s": predict_numeric_col("out_flame_spread_rate_mm_s", "mm/s", 2),
        "out_combustion_regime": predict_categorical_col("out_combustion_regime", "enum"),
        "out_flame_temperature_k": predict_numeric_col("out_flame_temperature_k", "K", 0),
        "out_ignition_time_s": predict_numeric_col("out_ignition_time_s", "s", 1),
        "out_hrr_watts": predict_numeric_col("out_hrr_watts", "W", 1),
        "out_hrr_kilowatts": predict_numeric_col("out_hrr_kilowatts", "kW", 3),
        "out_fri_risk_index": predict_numeric_col("out_fri_risk_index", "0-100", 0),
        "out_spread_rate_1g_ref_mm_s": predict_numeric_col("out_spread_rate_1g_ref_mm_s", "mm/s", 2),
        "out_safe_isolation_dist_mm": predict_numeric_col("out_safe_isolation_dist_mm", "mm", 0),
        "out_co_concentration_ppm": predict_numeric_col("out_co_concentration_ppm", "ppm", 0),
        "out_soot_generation_rate_mg_g": predict_numeric_col("out_soot_generation_rate_mg_g", "mg/g", 1),
        "out_smoke_opacity_pct_m": predict_numeric_col("out_smoke_opacity_pct_m", "%/m", 1),
        "out_acid_gas_hcl_ppm": predict_numeric_col("out_acid_gas_hcl_ppm", "ppm", 1),
        "out_acid_gas_hf_ppm": predict_numeric_col("out_acid_gas_hf_ppm", "ppm", 1),
        "out_acid_gas_hcn_ppm": predict_numeric_col("out_acid_gas_hcn_ppm", "ppm", 1),
        "out_mean_particle_diameter_um": predict_numeric_col("out_mean_particle_diameter_um", "µm", 2),
        "out_optimal_sensor_type": predict_categorical_col("out_optimal_sensor_type", "sensor"),
        "out_estimated_detection_time_s": predict_numeric_col("out_estimated_detection_time_s", "s", 1),
        "out_recommended_mitigation": predict_categorical_col("out_recommended_mitigation", "text"),
    }

    # Ensure W and kW consistency
    if outputs["out_hrr_watts"]["value"] is not None and outputs["out_hrr_kilowatts"]["value"] is None:
        outputs["out_hrr_kilowatts"] = {
            **outputs["out_hrr_watts"],
            "value": round(outputs["out_hrr_watts"]["value"] / 1000.0, 3),
            "unit": "kW",
        }

    # 1g vs ug comparative assessment
    comparison_1g = None
    if not _skip_1g_comparison:
        inputs_1g = {**inputs, "in_gravity_level_g": 1.0}
        heur_1g = compute_heuristic_outputs(inputs_1g)
        vf_ug = outputs["out_flame_spread_rate_mm_s"]["value"] or 0.0
        ref_1g_pred = outputs["out_spread_rate_1g_ref_mm_s"]

        if ref_1g_pred["value"] is not None and ref_1g_pred["source"] != "heuristic":
            vf_1g = float(ref_1g_pred["value"])
        else:
            vf_1g = float(heur_1g["out_flame_spread_rate_mm_s"])
            outputs["out_spread_rate_1g_ref_mm_s"] = {
                "value": round(vf_1g, 2),
                "unit": "mm/s",
                "source": "heuristic",
                "confidence": "medium",
                "records_used": [],
            }

        fri_ug = outputs["out_fri_risk_index"]["value"] or 0.0
        fri_1g = min(100.0, round(22.0 + vf_1g * 16.0 + (heur_1g["out_hrr_watts"] / 50.0), 0))
        regime_1g = "STABLE_FLAME" if vf_1g > 0.05 else "NO_IGNITION"

        if vf_ug > vf_1g * 1.12 or (vf_ug > 0 and vf_1g == 0):
            verdict_code = "HIGHER_RISK_IN_UG"
        elif vf_ug < vf_1g * 0.88:
            verdict_code = "LOWER_RISK_IN_UG"
        else:
            verdict_code = "EQUIVALENT_RISK"

        outputs["out_verdict_1g_vs_ug"] = {
            "value": verdict_code,
            "unit": "verdict",
            "source": outputs["out_flame_spread_rate_mm_s"]["source"],
            "confidence": outputs["out_flame_spread_rate_mm_s"]["confidence"],
            "records_used": outputs["out_flame_spread_rate_mm_s"]["records_used"],
        }

        comparison_1g = {
            "ug": {
                "spread_rate_mm_s": vf_ug,
                "regime": outputs["out_combustion_regime"]["value"],
                "fri": fri_ug,
            },
            "earth_1g": {
                "spread_rate_mm_s": round(vf_1g, 2),
                "regime": regime_1g,
                "fri": fri_1g,
            },
            "verdict_code": verdict_code,
        }

    return {
        "inputs": inputs,
        "is_sample_data": STORE.is_sample_data,
        "outputs": outputs,
        "comparison_1g_vs_ug": comparison_1g,
        "nearest_experiments": nearest_3,
        "material_experimental_points": [
            {
                "record_id": r["record_id"],
                "document_id": r["document_id"],
                "o2": r.get("in_o2_molar_fraction_pct"),
                "flow": r.get("in_ventilation_flow_cm_s"),
                "regime": r.get("out_combustion_regime"),
                "spread_rate": r.get("out_flame_spread_rate_mm_s"),
            }
            for r in mat_rows
            if r.get("in_o2_molar_fraction_pct") is not None and r.get("in_ventilation_flow_cm_s") is not None
        ],
    }
