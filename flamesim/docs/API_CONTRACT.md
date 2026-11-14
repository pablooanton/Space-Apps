# Contrato de Integración API REST (Frontend ↔ Backend ↔ Base de Datos)

Este documento define los *endpoints* y la estructura JSON exacta que utiliza el Frontend (`frontend/js/api.js`) para comunicarse con el Backend y la Base de Datos de experimentos de la NASA.

## Base URL por defecto
```text
http://localhost:8000/api/v1
```
*(Configurable en `frontend/js/config.js`)*

---

## 1. Obtener Catálogo de Materiales Aeroespaciales (`GET /materials`)
Devuelve los materiales cargados desde la tabla `materials` (catálogo MAPTIS / NASA-STD-6001B).

### Respuesta `200 OK`
```json
[
  {
    "id": "pmma",
    "name": "PMMA (Acrílico Cast · Ventanas / Saffire)",
    "category": "Polímero Termoplástico",
    "maptis_code": "MAP-PMMA-001",
    "loi_1g_pct": 17.5,
    "loi_ug_pct": 15.8,
    "density_g_cm3": 1.18,
    "heat_of_combustion_kj_g": 25.0,
    "base_spread_rate_mm_s": 1.45,
    "soot_yield_mg_g": 14.0,
    "co_yield_ppm_base": 160,
    "hcl_yield_ppm_base": 0.0,
    "hf_yield_ppm_base": 0.0,
    "hcn_yield_ppm_base": 0.0
  }
]
```

---

## 2. Obtener Experimentos Reales de la NASA (`GET /experiments`)
Devuelve los registros de la tabla `nasa_experiments` (Saffire I-VI, SoFIE, BASS) para cargarlos en el simulador con un clic o comparar los resultados del modelo con datos empíricos de la ISS.

### Respuesta `200 OK`
```json
[
  {
    "experiment_id": "SAFFIRE-I-SIBAL",
    "mission_name": "Cygnus OA-6 (Saffire-I)",
    "material_id": "cotton",
    "inputs": {
      "o2_molar_fraction_pct": 21.0,
      "ventilation_flow_cm_s": 20.0,
      "material_thickness_mm": 0.4,
      "cabin_pressure_kpa": 101.3,
      "flow_direction": "concurrent",
      "gravity_level_g": 0.000001,
      "gravity_key": "ug"
    },
    "measured_outputs": {
      "spread_rate_mm_s": 3.65,
      "combustion_regime": "STEADY",
      "ignition_time_s": 3.2,
      "hrr_watts": 920.0,
      "co_concentration_ppm": 285,
      "mean_particle_diameter_um": 0.82
    },
    "notes": "Propagación concurrente sobre tela SIBAL a gran escala en microgravedad."
  }
]
```

---

## 3. Calcular Simulación de Llama (`POST /simulate`)
Recibe los **7 parámetros de entrada** (4 esenciales + 3 de entorno cabina) y devuelve los **4 bloques de parámetros de salida**.

### Cuerpo de la Petición (`Request Body`)
```json
{
  "essential_inputs": {
    "o2_molar_fraction_pct": 21.0,
    "ventilation_flow_cm_s": 12.0,
    "material_id": "pmma",
    "material_thickness_mm": 1.5
  },
  "environment_inputs": {
    "cabin_pressure_kpa": 101.3,
    "flow_direction": "concurrent",
    "gravity_key": "ug",
    "gravity_level_g": 0.000001
  },
  "save_to_db": false
}
```

### Respuesta `200 OK` (`Response Body`)
```json
{
  "run_id": "SIM-20261114-001",
  "derived_environment": {
    "pp_o2_kpa": 21.27,
    "pp_o2_psia": 3.09,
    "thermal_thickness_regime": "Régimen Intermedio",
    "flame_temp_k": 1420
  },
  "module_1_flame_dynamics": {
    "spread_rate_mm_s": 1.84,
    "spread_rate_1g_mm_s": 1.42,
    "spread_rate_diff_pct": 30,
    "combustion_regime_key": "STEADY",
    "combustion_regime_code": "STATE-03",
    "combustion_regime_title": "Propagación Laminar Estacionaria Impulsada por Ventilación",
    "combustion_regime_description": "El aporte advectivo de O2 supera las pérdidas radiativas.",
    "ignition_time_s": 8.4,
    "thermal_inertia_label": "Inercia térmica: Media",
    "hrr_watts": 680.0,
    "radiative_flux_kw_m2": 21.8
  },
  "module_2_risk_compliance": {
    "fri_score": 64,
    "nasa_std_6001b_status": "RIESGO MODERADO (RESTRINGIDO)",
    "verdict_1g_vs_ug_title": "⚠️ Más Peligroso en μg que en 1g",
    "verdict_1g_vs_ug_description": "El flujo lento de ventilación sostiene una llama sin pérdidas convectivas por flotabilidad.",
    "safe_standoff_distance_mm": 145
  },
  "module_3_emissions_toxicity": {
    "co_concentration_ppm": 185,
    "co_smac_status": "EXCEDE SMAC 1h",
    "soot_generation_rate_mg_g": 14.2,
    "smoke_opacity_label": "Opacidad: Moderada (Aglomeración μg)",
    "critical_acid_gases": {
      "hcl_ppm": 0.0,
      "hf_ppm": 0.0,
      "hcn_ppm": 0.0
    }
  },
  "module_4_sensors_extinguishing": {
    "mean_particle_diameter_um": 0.85,
    "particle_agglomeration_note": "Aglomeración en μg (Ideal sensor óptico)",
    "optimal_sensor_type": "Fotoeléctrico Dispersión Láser (ISS)",
    "estimated_detection_time_s": 11.2,
    "recommended_mitigation_steps": [
      "APAGADO INMEDIATO DE VENTILACIÓN HVAC (llevar U_v → 0 cm/s) para privar a la llama de transporte advectivo de O₂.",
      "Aplicar agente extintor Niebla de Agua Fina (Orion/Gateway) o CO₂ (ISS) dirigido a la base de pirólisis.",
      "Activar cartuchos de depuración catalítica de CO/LiOH del sistema ECLSS post-extinción."
    ]
  }
}
```
