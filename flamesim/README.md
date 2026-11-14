# FlameSim · Interfaz refinada

Esta carpeta contiene la segunda aplicación aportada por el usuario, con su paleta oscura original y una distribución que aprovecha todo el ancho de la pantalla. Los cuatro gráficos ocupan una sección independiente a ancho completo y se redibujan al cambiar el tamaño de la ventana. El cálculo, las acciones, los datos y sus contratos se conservan.

- Abre `FlameSim.html` de la entrega para utilizar la versión autónoma sin instalar nada.
- Para servir el código modular: `python3 -m http.server 4174 --directory frontend` y abre el puerto 4174 en tu navegador.
- El frontend conserva su conexión original con FastAPI en `localhost:8000` y su motor local de respaldo.
- Para regenerar el HTML autónomo desde el repositorio principal: `npm ci` y `npm run build:refined`.
- La nueva presentación está en `frontend/css/professional.css`. `frontend/presentation.js` ajusta exclusivamente los títulos visuales al idioma.

Se verificaron recálculo, escenarios, comparación, filtros, carga de experimentos y CSV, barrido, corte HVAC, exportaciones PDF/JSON/CSV e idioma. Las cinco vistas se revisaron en pantalla móvil de 390 px.

---

# NASA μg-FLAME // Simulador de Combustión en Microgravedad & Base de Datos

Repositorio del proyecto de simulación del desarrollo de llamas en microgravedad para ingenieros aeroespaciales (**NASA-STD-6001B / Experimentos Saffire & SoFIE**).

## Estructura del Proyecto para Trabajo Colaborativo (GitHub)

```text
nasa-ug-flame-simulator/
├── frontend/                     # Aplicación Web (HTML5 + CSS3 + JS Vanilla Modular ES6)
│   ├── index.html                # Dashboard de Telemetría (Entradas, Visor 2D, 4 Módulos Salida)
│   ├── css/
│   │   └── styles.css            # Estilos personalizados de telemetría
│   └── js/
│       ├── config.js             # URL del Backend API y datos semilla de respaldo
│       ├── api.js                # Cliente REST (GET /materials, GET /experiments, POST /simulate)
│       ├── physics-engine.js     # Motor físico local (Fallback si el Backend está apagado)
│       ├── canvas-renderer.js    # Motor gráfico 2D de la cámara de combustión
│       └── app.js                # Controlador principal del DOM y eventos
├── database/
│   └── schema.sql                # Tablas SQL (materials, nasa_experiments, simulation_runs) + Seeds
├── docs/
│   └── API_CONTRACT.md           # Documentación de Endpoints y JSON para el equipo de Backend
└── .gitignore
```

## Cómo conectar el Frontend con el Backend y la Base de Datos

1. **Base de Datos (`database/schema.sql`):**
   Contiene las 3 tablas principales (`materials`, `nasa_experiments`, `simulation_runs`) y los `INSERT` con materiales reales de la base de datos **MAPTIS** de la NASA y experimentos reales en órbita (**Saffire-I, Saffire-IV, SoFIE**).
2. **Contrato API (`docs/API_CONTRACT.md`):**
   El equipo de Backend solo tiene que exponer los 3 endpoints (`GET /api/v1/materials`, `GET /api/v1/experiments`, `POST /api/v1/simulate`) en `http://localhost:8000/api/v1` (o cambiar `BASE_URL` en `frontend/js/config.js`).
3. **Modo Inteligente (Online / Fallback Local):**
   Si el Backend está levantado, el indicador superior se pone en **Verde (`API BACKEND: CONECTADO`)** y consume los datos del servidor. Si el servidor está apagado mientras desarrolláis, conmuta automáticamente a **`MODO LOCAL`** para que el frontend siempre sea 100% funcional.
4. **Inspector JSON en Vivo:**
   En la cabecera de la web hay un botón **`{ } Ver Contrato JSON API`** que muestra en vivo el JSON exacto que el frontend envía (`Request`) y recibe (`Response`).
