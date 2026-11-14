"""FlameSim API. CSV and optional Supabase REST use identical column names."""
import csv
import io
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from .predict import INPUTS, NUMERIC_OUTPUTS, TEXT_OUTPUTS, predict

ROOT=Path(__file__).resolve().parents[1]
COLUMNS=['record_id','document_id','material_id','in_o2_molar_fraction_pct','in_ventilation_flow_cm_s','in_material_thickness_mm','in_cabin_pressure_kpa','in_flow_direction','in_gravity_level_g','out_flame_spread_rate_mm_s','out_combustion_regime','out_flame_temperature_k','out_ignition_time_s','out_hrr_watts','out_hrr_kilowatts','out_fri_risk_index','out_verdict_1g_vs_ug','out_spread_rate_1g_ref_mm_s','out_safe_isolation_dist_mm','out_co_concentration_ppm','out_soot_generation_rate_mg_g','out_smoke_opacity_pct_m','out_acid_gas_hcl_ppm','out_acid_gas_hf_ppm','out_acid_gas_hcn_ppm','out_mean_particle_diameter_um','out_optimal_sensor_type','out_estimated_detection_time_s','out_recommended_mitigation','data_quality_flag','extraction_notes']
NUMBERS=set(NUMERIC_OUTPUTS+['in_o2_molar_fraction_pct','in_ventilation_flow_cm_s','in_material_thickness_mm','in_cabin_pressure_kpa','in_gravity_level_g'])
REQUIRED={'record_id','material_id','in_o2_molar_fraction_pct','in_ventilation_flow_cm_s','in_material_thickness_mm','in_cabin_pressure_kpa','in_flow_direction','in_gravity_level_g'}

def number(value):
    if value is None or str(value).strip().lower() in ('','n/a','nan','null','none'): return None
    try: return float(str(value).strip().replace(',','.'))
    except ValueError: return None

def parse_csv(content):
    reader=csv.DictReader(io.StringIO(content.lstrip('\ufeff')))
    headers=reader.fieldnames or []
    missing=[x for x in COLUMNS if x not in headers]
    if any(x not in headers for x in REQUIRED): raise ValueError('Missing required columns: '+', '.join(x for x in REQUIRED if x not in headers))
    warnings=[]; rows=[]; seen=set()
    for line,raw in enumerate(reader,2):
        if not any(raw.values()): continue
        row={key:(raw.get(key) or '').strip() for key in COLUMNS}
        for key in NUMBERS:
            original=row[key]; row[key]=number(original)
            if original and row[key] is None and original.lower() not in ('n/a','nan','null','none'): warnings.append(f'Row {line}: invalid {key}')
        if any(row[k] is None for k in REQUIRED & NUMBERS) or not row['record_id'] or not row['material_id'] or not row['in_flow_direction']:
            warnings.append(f'Row {line}: missing required input; skipped'); continue
        if row['record_id'] in seen: warnings.append(f'Row {line}: duplicate record_id; skipped'); continue
        seen.add(row['record_id'])
        if row['out_hrr_watts'] is None and row['out_hrr_kilowatts'] is not None: row['out_hrr_watts']=row['out_hrr_kilowatts']*1000
        if row['out_hrr_kilowatts'] is None and row['out_hrr_watts'] is not None: row['out_hrr_kilowatts']=row['out_hrr_watts']/1000
        if row['out_fri_risk_index'] is not None: row['out_fri_risk_index']=round(row['out_fri_risk_index'])
        row['in_flow_direction']=row['in_flow_direction'].upper()
        row['material_id']=row['material_id'].lower()
        rows.append(row)
    if not rows: raise ValueError('No valid experiment rows')
    return rows, {'missing_columns':missing,'warnings':warnings,'row_count':len(rows)}

def load_initial():
    url=os.getenv('SUPABASE_URL'); key=os.getenv('SUPABASE_ANON_KEY')
    if url and key:
        req=Request(url.rstrip('/')+'/rest/v1/fire_experiments_demo?select=*&limit=1000',headers={'apikey':key,'Authorization':'Bearer '+key})
        with urlopen(req,timeout=12) as response: data=json.load(response)
        stream=io.StringIO(); writer=csv.DictWriter(stream,fieldnames=COLUMNS); writer.writeheader(); writer.writerows([{k:r.get(k) for k in COLUMNS} for r in data])
        rows,meta=parse_csv(stream.getvalue()); return rows,meta,'supabase'
    rows,meta=parse_csv((ROOT/'data/experiments.csv').read_text()); return rows,meta,'demo'

ROWS,META,SOURCE=load_initial()
app=FastAPI(title='FlameSim API',version='1.0.0')
app.add_middleware(CORSMiddleware,allow_origins=['http://localhost:5173','http://127.0.0.1:5173'],allow_methods=['GET','POST'],allow_headers=['*'])

class Inputs(BaseModel):
    material_id:str
    in_o2_molar_fraction_pct:float=Field(ge=15,le=50)
    in_ventilation_flow_cm_s:float=Field(ge=0,le=50)
    in_material_thickness_mm:float=Field(ge=.05,le=10)
    in_cabin_pressure_kpa:float=Field(ge=20,le=150)
    in_flow_direction:str
    in_gravity_level_g:float=Field(ge=0,le=1)

@app.get('/api/health')
def health(): return {'ok':True,'rows':len(ROWS),'source':SOURCE}

@app.get('/api/dataset')
def dataset(): return {'rows':ROWS,'meta':META,'source':SOURCE,'columns':COLUMNS}

@app.post('/api/simulate')
def simulate(inputs:Inputs):
    if inputs.in_flow_direction not in ('CONCURRENT','OPPOSED','QUIESCENT'): raise HTTPException(422,'Invalid flow direction')
    return predict(inputs.model_dump(),ROWS)

@app.post('/api/dataset')
async def upload_dataset(file:UploadFile=File(...)):
    global ROWS,META,SOURCE
    if not file.filename.lower().endswith('.csv'): raise HTTPException(400,'Upload a CSV file')
    raw=await file.read(5_000_001)
    if len(raw)>5_000_000: raise HTTPException(413,'CSV exceeds 5 MB')
    try: rows,meta=parse_csv(raw.decode('utf-8-sig'))
    except (ValueError,UnicodeDecodeError) as exc: raise HTTPException(400,str(exc)) from exc
    ROWS,META,SOURCE=rows,meta,'uploaded'
    return {'meta':META,'source':SOURCE}
