# FlameSim

La interfaz actual publicada en `docs/index.html` es el rediseño de la segunda aplicación aportada en el ZIP. Sus fuentes completas están en `flamesim/`. Abre `docs/index.html` directamente o ejecuta `npm run preview:refined`. Para regenerar el HTML autónomo, ejecuta `npm run build:refined`.

La presentación conserva la paleta oscura original y utiliza todo el ancho de la pantalla, con gráficos en una sección independiente a ancho completo. Se conservan los motores de cálculo, el backend, los datos y las acciones originales. El controlador incorpora un redibujado de gráficos al cambiar el tamaño de su contenedor. `flamesim/frontend/presentation.js` solo adapta títulos y textos de presentación al idioma seleccionado. Las instrucciones inferiores describen también la primera versión React, conservada en el repositorio.

Spacecraft fire safety prototype with a React dashboard and FastAPI simulation API. The bundled six records came from the request and are **unverified demo data**. The model and charts are preliminary and are not certified for flight decisions.

## Ver la web sin instalar nada

Descarga [docs/index.html](docs/index.html) con el botón de descarga de GitHub y abre el archivo con Chrome, Edge o Firefox. Contiene la interfaz, gráficos, datos y motor de demostración en un solo HTML; no necesita servidor ni conexión. El modo se identifica como **LOCAL DEMO** y conserva las 31 columnas de Supabase. Las cargas de CSV permanecen en memoria durante esa sesión.

Para publicar una dirección web desde este repositorio: abre **Settings → Pages → Build and deployment**, selecciona **Deploy from a branch**, rama **main**, carpeta **/docs**, y guarda. Tras completarse el despliegue de Pages, la dirección prevista es `https://pablooanton.github.io/Space-Apps/`. Subir código a GitHub no activa Pages por sí solo. La activación y la dirección pública todavía requieren confirmación en GitHub.

## Demostración con un solo comando

```bash
npm ci
npm run demo
```

Para regenerar el archivo autónomo después de cambios: `npm run build:standalone`. El resultado es `dist/index.html`; copia ese archivo a `docs/index.html` para actualizar Pages. Los datos se generan desde el CSV original durante esa compilación.

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
