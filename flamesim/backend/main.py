"""
FlameSim: Spacecraft Fire Safety Simulator — FastAPI Backend (main.py)
NASA Space Apps Challenge 2026 ("Flame in Freefall")

Endpoints:
- POST /api/simulate       -> Runs predict(inputs) -> outputs
- GET  /api/dataset        -> Returns current dataset rows, row count, sample flag, and parsing warnings
- POST /api/dataset        -> Uploads a new CSV file (or raw CSV text) to hot-reload the dataset without restart
- POST /api/dataset/reset  -> Resets dataset back to the seeded sample_nasa_psi.csv
- POST /api/sweep          -> Runs a 1D parameter sweep over a chosen input variable
"""

import os
from contextlib import asynccontextmanager
from typing import Any, Dict, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from predict import SAMPLE_CSV_PATH, STORE, predict
from supabase_source import load_store_from_supabase


@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.getenv("FLAMESIM_OFFLINE_SAMPLE") != "1":
        load_store_from_supabase(STORE)
    yield

app = FastAPI(
    title="FlameSim: Spacecraft Fire Safety Simulator API",
    version="1.0.0",
    description="Data-driven interpolation and heuristic engine over NASA PSI microgravity combustion experiments.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SimulationInputs(BaseModel):
    material_id: str = Field(default="cotton", description="cotton | pmma | pvc | nomex | custom")
    in_o2_molar_fraction_pct: float = Field(default=21.0, ge=15.0, le=50.0)
    in_ventilation_flow_cm_s: float = Field(default=12.0, ge=0.0, le=50.0)
    in_material_thickness_mm: float = Field(default=1.5, ge=0.05, le=10.0)
    in_cabin_pressure_kpa: float = Field(default=101.3, ge=20.0, le=150.0)
    in_flow_direction: str = Field(default="CONCURRENT", description="CONCURRENT | OPPOSED | QUIESCENT")
    in_gravity_level_g: float = Field(default=0.0, ge=0.0, le=2.0)


class SweepRequest(BaseModel):
    base_inputs: SimulationInputs
    sweep_param: str = Field(..., description="e.g. in_o2_molar_fraction_pct or in_ventilation_flow_cm_s")
    min_val: float
    max_val: float
    steps: int = Field(default=15, ge=5, le=50)


class RawCsvUpload(BaseModel):
    csv_text: str
    is_sample: Optional[bool] = False


@app.get("/api/health")
def health_check() -> Dict[str, Any]:
    return {
        "status": "ok",
        "model": "Data-driven model v1 (interpolation on PSI/NASA experiments)",
        "loaded_rows": len(STORE.rows),
        "is_sample_data": STORE.is_sample_data,
        "dataset_source": STORE.source,
        "source_row_count": STORE.source_row_count,
        "excluded_row_count": STORE.excluded_row_count,
        "sanitized_cell_count": STORE.sanitized_cell_count,
    }


@app.post("/api/simulate")
def simulate_endpoint(inputs: SimulationInputs) -> Dict[str, Any]:
    return predict(inputs.model_dump())


@app.get("/api/dataset")
def get_dataset_endpoint() -> Dict[str, Any]:
    return STORE.summary()


@app.post("/api/dataset")
async def upload_dataset_endpoint(file: Optional[UploadFile] = File(default=None), raw: Optional[RawCsvUpload] = None) -> Dict[str, Any]:
    if STORE.source == "supabase":
        raise HTTPException(status_code=403, detail="Shared Supabase dataset is read-only.")
    if file is not None:
        content_bytes = await file.read()
        try:
            csv_text = content_bytes.decode("utf-8-sig")
        except UnicodeDecodeError:
            csv_text = content_bytes.decode("latin-1")
        return STORE.load_csv_text(csv_text, is_sample=False)
    elif raw is not None and raw.csv_text:
        return STORE.load_csv_text(raw.csv_text, is_sample=bool(raw.is_sample))
    else:
        raise HTTPException(status_code=400, detail="Provide either a multipart CSV 'file' or JSON 'csv_text'.")


@app.post("/api/dataset/reset")
def reset_dataset_endpoint() -> Dict[str, Any]:
    if STORE.source == "supabase":
        raise HTTPException(status_code=403, detail="Shared Supabase dataset is read-only.")
    if not SAMPLE_CSV_PATH.exists():
        raise HTTPException(status_code=404, detail="Sample CSV file not found on disk.")
    return STORE.load_csv_text(SAMPLE_CSV_PATH.read_text(encoding="utf-8"), is_sample=True)


@app.post("/api/sweep")
def parameter_sweep_endpoint(req: SweepRequest) -> Dict[str, Any]:
    base_dict = req.base_inputs.model_dump()
    if req.sweep_param not in base_dict:
        raise HTTPException(status_code=400, detail=f"Invalid sweep parameter: {req.sweep_param}")

    step_size = (req.max_val - req.min_val) / max(1, req.steps - 1)
    series = []
    for i in range(req.steps):
        x_val = round(req.min_val + i * step_size, 3)
        step_inp = {**base_dict, req.sweep_param: x_val}
        pred = predict(step_inp, _skip_1g_comparison=True)["outputs"]
        series.append({
            "x": x_val,
            "out_flame_spread_rate_mm_s": pred["out_flame_spread_rate_mm_s"]["value"],
            "out_flame_temperature_k": pred["out_flame_temperature_k"]["value"],
            "out_ignition_time_s": pred["out_ignition_time_s"]["value"],
            "out_hrr_watts": pred["out_hrr_watts"]["value"],
            "out_fri_risk_index": pred["out_fri_risk_index"]["value"],
            "out_co_concentration_ppm": pred["out_co_concentration_ppm"]["value"],
            "out_soot_generation_rate_mg_g": pred["out_soot_generation_rate_mg_g"]["value"],
            "out_mean_particle_diameter_um": pred["out_mean_particle_diameter_um"]["value"],
            "regime": pred["out_combustion_regime"]["value"],
        })
    return {"sweep_param": req.sweep_param, "series": series}

