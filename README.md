# FlameSim

Spacecraft fire safety prototype with a React dashboard and FastAPI simulation API. The bundled six records came from the request and are **unverified demo data**. The model and charts are preliminary and are not certified for flight decisions.

## Run locally

Requires Node.js 20+ and Python 3.10+.

```bash
npm ci
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```bash
npm run dev
```

Open the Vite address shown in the terminal (usually port 5173). `npm run build` generates a production frontend in `dist/`.

## Data contract

The API uses the exact 31 names from `public.fire_experiments_demo` and the supplied CSV. `record_id` is the unique key. Missing optional cells, `N/A`, and `NaN` become `null`, not zero. Comma decimals are accepted. Missing required input columns reject an upload; missing optional columns and invalid values are reported under **Experiments**. HRR in watts and kilowatts is derived when only one is present. An upload replaces the in-memory dataset until the API restarts.

To read Supabase at startup, set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the backend environment. The key must have read access to `public.fire_experiments_demo` through its RLS policy. Credentials stay on the server. Without both variables, the API reads `data/experiments.csv`.

## API

- `GET /api/health` — status and row count
- `GET /api/dataset` — loaded rows, exact schema, parse warnings, source
- `POST /api/dataset` — multipart form upload with a CSV `file` field, maximum 5 MB
- `POST /api/simulate` — JSON inputs using the seven `material_id`/`in_*` names; returns each `out_*` value with source, confidence, unit, and experiment references

Saved comparisons use browser localStorage. They are not written to Supabase. The flammability zones, time profiles, sensor trigger, CO guide, and radar scores are illustrative visual models; the underlying CSV alone does not validate them as safety thresholds.
