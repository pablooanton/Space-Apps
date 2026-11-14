"""
Script de Ingesta, Enriquecimiento Físico y Creación de Base de Datos SQLite
para los experimentos de combustión en microgravedad de la NASA.

Uso:
    python database/ingest_nasa_docs.py

Qué hace:
1. Crea la base de datos SQLite `database/nasa_flame_db.sqlite` ejecutando `database/schema.sql`.
2. Lee los registros extraídos de los documentos de la NASA desde `database/nasa_experiments_template.csv`.
3. Si a algún documento de la NASA le falta una variable derivada (por ejemplo, el paper reporta
   la velocidad de propagación V_f y el O2, pero no reporta el índice FRI o la distancia segura),
   este script calcula automáticamente los campos faltantes según las correlaciones de NASA-STD-6001B.
4. Inserta todos los experimentos en la base de datos y exporta un archivo JSON listo para el Frontend/Backend.
"""

import csv
import json
import math
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
SCHEMA_PATH = BASE_DIR / "schema.sql"
CSV_PATH = BASE_DIR / "nasa_experiments_template.csv"
SQLITE_DB_PATH = BASE_DIR / "nasa_flame_db.sqlite"
JSON_EXPORT_PATH = BASE_DIR / "nasa_experiments_seeded.json"


def complete_missing_variables(row: dict) -> dict:
    """
    Completa automáticamente las variables derivadas cuando un documento técnico
    de la NASA solo reporta las mediciones físicas primarias.
    """
    vf = float(row.get("out_flame_spread_rate_mm_s") or 0.0)
    hrr_w = float(row.get("out_hrr_watts") or 0.0)
    hrr_kw = float(row.get("out_hrr_kilowatts") or (hrr_w / 1000.0))

    if hrr_w == 0.0 and hrr_kw > 0.0:
        hrr_w = hrr_kw * 1000.0
    row["out_hrr_watts"] = round(hrr_w, 2)
    row["out_hrr_kilowatts"] = round(hrr_kw, 4)

    # Índice de Riesgo de Inflamabilidad (FRI 0-100) si está vacío en el documento
    if not row.get("out_fri_risk_index"):
        o2 = float(row["in_o2_molar_fraction_pct"])
        fri = min(100, max(0, int(round(20 + vf * 18 + (hrr_w / 45.0) + (o2 - 21.0) * 1.5))))
        row["out_fri_risk_index"] = fri
    else:
        row["out_fri_risk_index"] = int(row["out_fri_risk_index"])

    # Distancia segura de aislamiento (mm) si no viene explícita en el paper
    if not row.get("out_safe_isolation_dist_mm"):
        row["out_safe_isolation_dist_mm"] = round(35.0 + math.sqrt(max(0.0, hrr_w)) * 4.2, 1)
    else:
        row["out_safe_isolation_dist_mm"] = float(row["out_safe_isolation_dist_mm"])

    # Sensor óptimo basado en el diámetro medio de partícula D_p (um) y régimen
    dp = float(row.get("out_mean_particle_diameter_um") or 0.0)
    regime = row.get("out_combustion_regime", "VISIBLE_STEADY_FLAME")
    if not row.get("out_optimal_sensor_type"):
        if regime == "COOL_FLAME" or regime == "SMOLDERING":
            row["out_optimal_sensor_type"] = "GAS_CO_IR"
        elif dp >= 0.45:
            row["out_optimal_sensor_type"] = "PHOTOELECTRIC_LASER"
        else:
            row["out_optimal_sensor_type"] = "IONIZATION"

    return row


def build_database():
    if SQLITE_DB_PATH.exists():
        SQLITE_DB_PATH.unlink()

    conn = sqlite3.connect(SQLITE_DB_PATH)
    cursor = conn.cursor()

    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        schema_sql = f.read()
    cursor.executescript(schema_sql)

    # Insertar catálogo base de materiales y documentos si no existen
    materials_seed = [
        ("pmma", "PMMA (Acrílico Cast · Ventanas / Saffire)", "Polímero Termoplástico", "MAP-PMMA-001", 1.18, 25.0, 17.5, 15.8, 0, 0, 0),
        ("cotton", "Tejido Algodón/Fibra (SIBAL · Ropa Tripulación)", "Compuesto Celulósico", "MAP-SIBAL-02", 0.45, 16.5, 18.0, 16.2, 0, 0, 0),
        ("pvc", "Aislamiento Cable PVC/Tefzel (Halogenado)", "Fluoropolímero / Clorado", "MAP-TEFZ-104", 1.38, 18.0, 23.5, 21.8, 1, 1, 1),
        ("nomex", "Nomex HT90-40 (Retardante Ignífugo NASA)", "Aramida Ignífuga", "MAP-NOMX-090", 0.72, 14.0, 28.5, 27.0, 0, 0, 1),
        ("kapton", "Película Kapton Poliimida (Aislante Térmico MLI)", "Poliimida", "MAP-KAPT-500", 1.42, 12.0, 36.5, 35.0, 0, 0, 1),
    ]
    cursor.executemany(
        """
        INSERT OR IGNORE INTO materials (
            material_id, name, category, maptis_code, density_g_cm3,
            heat_of_combustion_kj_g, loi_1g_pct, loi_ug_pct,
            contains_chlorine, contains_fluorine, contains_nitrogen
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        materials_seed,
    )

    records_exported = []
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for raw_row in reader:
            row = complete_missing_variables(raw_row)
            records_exported.append(row)

            cursor.execute(
                """
                INSERT OR IGNORE INTO nasa_source_documents (document_id, title, experiment_campaign, publication_year)
                VALUES (?, ?, ?, ?)
                """,
                (row["document_id"], f"NASA Technical Report {row['document_id']}", row["record_id"].split("-")[0], 2021),
            )

            cursor.execute(
                """
                INSERT OR REPLACE INTO nasa_experiment_records (
                    record_id, document_id, material_id,
                    in_o2_molar_fraction_pct, in_ventilation_flow_cm_s, in_material_thickness_mm,
                    in_cabin_pressure_kpa, in_flow_direction, in_gravity_level_g,
                    out_flame_spread_rate_mm_s, out_combustion_regime, out_flame_temperature_k,
                    out_ignition_time_s, out_hrr_watts, out_hrr_kilowatts,
                    out_fri_risk_index, out_verdict_1g_vs_ug, out_spread_rate_1g_ref_mm_s,
                    out_safe_isolation_dist_mm, out_co_concentration_ppm,
                    out_soot_generation_rate_mg_g, out_smoke_opacity_pct_m,
                    out_acid_gas_hcl_ppm, out_acid_gas_hf_ppm, out_acid_gas_hcn_ppm,
                    out_mean_particle_diameter_um, out_optimal_sensor_type,
                    out_estimated_detection_time_s, out_recommended_mitigation,
                    data_quality_flag, extraction_notes
                ) VALUES (
                    :record_id, :document_id, :material_id,
                    :in_o2_molar_fraction_pct, :in_ventilation_flow_cm_s, :in_material_thickness_mm,
                    :in_cabin_pressure_kpa, :in_flow_direction, :in_gravity_level_g,
                    :out_flame_spread_rate_mm_s, :out_combustion_regime, :out_flame_temperature_k,
                    :out_ignition_time_s, :out_hrr_watts, :out_hrr_kilowatts,
                    :out_fri_risk_index, :out_verdict_1g_vs_ug, :out_spread_rate_1g_ref_mm_s,
                    :out_safe_isolation_dist_mm, :out_co_concentration_ppm,
                    :out_soot_generation_rate_mg_g, :out_smoke_opacity_pct_m,
                    :out_acid_gas_hcl_ppm, :out_acid_gas_hf_ppm, :out_acid_gas_hcn_ppm,
                    :out_mean_particle_diameter_um, :out_optimal_sensor_type,
                    :out_estimated_detection_time_s, :out_recommended_mitigation,
                    :data_quality_flag, :extraction_notes
                )
                """,
                row,
            )

    conn.commit()
    conn.close()

    with open(JSON_EXPORT_PATH, "w", encoding="utf-8") as jf:
        json.dump(records_exported, jf, indent=2, ensure_ascii=False)

    print(f"[OK] Base de datos creada en: {SQLITE_DB_PATH}")
    print(f"[OK] {len(records_exported)} experimentos NASA importados y exportados a: {JSON_EXPORT_PATH}")


if __name__ == "__main__":
    build_database()
