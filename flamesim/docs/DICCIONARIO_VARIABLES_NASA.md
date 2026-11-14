# Diccionario de Variables de Salida y Guía de Minería en Documentos NASA

Este documento mapea cada una de las **variables de salida** definidas en la especificación del simulador con:
1. Su **nombre de columna SQL** en [`database/schema.sql`](../database/schema.sql).
2. Los **términos exactos en inglés (Keywords)** con los que aparecen en los *papers* e informes técnicos de la NASA (NTRS, PSI, Saffire, SoFIE, BASS, FLEX, SAME, MAPTIS).
3. Qué variables se **extraen directamente de las tablas de los informes** y cuáles son **variables derivadas/calculadas** a partir de las mediciones cuando un documento no las reporta explícitamente.

---

## Bloque 1: Métricas de Dinámica de la Llama (El comportamiento físico)

| Variable en Especificación | Columna en Base de Datos (`schema.sql`) | Tipo / Unidad | Cómo buscarla en los documentos de la NASA (Keywords en inglés) |
| :--- | :--- | :--- | :--- |
| **1.1 Velocidad de Propagación de la Llama** | `out_flame_spread_rate_mm_s` | `DECIMAL` ($\text{mm/s}$ o $\text{cm/s}$) | `Flame spread rate`, $V_f$, $V_p$, `pyrolysis front velocity`, `burn rate`. En los *papers* de **Saffire** y **BASS** suele aparecer en tablas como $\text{mm/s}$ o $\text{cm/s}$ (si está en $\text{cm/s}$, multiplicar por $10$). |
| **1.2 Régimen de Combustión (Clasificación de estado)** | `out_combustion_regime` + `out_flame_temperature_k` | `VARCHAR` + `DECIMAL` ($\text{K}$) | Incluye el hallazgo clave de la imagen:<br>• **`NO_IGNITION_QUENCH`**: `No ignition`, `Quenching`, `Diffusive extinction`, `Radiative extinction`.<br>• **`COOL_FLAME`**: **Llama Fría / Pirólisis latente invisible ($\sim 600\text{ K}$)**. Buscar en documentos de **FLEX / Cool Flames Investigation (CFI) / SoFIE**: `Cool flame`, `low-temperature chemistry (LTC)`, `invisible flame`, `negative temperature coefficient (NTC)`, `~550-650 K`.<br>• **`SMOLDERING`**: `Smoldering`, `non-flaming oxidative pyrolysis`.<br>• **`VISIBLE_STEADY_FLAME`**: `Steady hot flame`, `Sooty/Blue laminar flame` ($\sim 1200\text{–}1600\text{ K}$).<br>• **`BLOWOFF`**: `Blow-off extinction`. |
| **1.3 Tiempo hasta la Ignición ($t_{\text{ig}}$)** | `out_ignition_time_s` | `DECIMAL` ($\text{s}$) | `Ignition delay time`, `Time to ignition`, $t_{ig}$, `igniter power-on to sustained flame duration`. |
| **1.4 Tasa de Liberación de Calor ($\text{HRR}$)** | `out_hrr_watts` / `out_hrr_kilowatts` | `DECIMAL` ($\text{W}$ / $\text{kW}$) | `Heat Release Rate (HRR)`, $\dot{Q}$, `Peak HRR`. Si el documento de la NASA da la tasa de pérdida de masa ($\dot{m}$ en $\text{g/s}$), se calcula directamente como: $\text{HRR} = \dot{m} \cdot \Delta H_c$. |

---

## Bloque 2: Evaluación de Riesgo y Cumplimiento Normativo (El criterio industrial)

| Variable en Especificación | Columna en Base de Datos (`schema.sql`) | Tipo / Unidad | Cómo buscarla / calcularla desde documentos NASA |
| :--- | :--- | :--- | :--- |
| **2.1 Índice de Riesgo de Inflamabilidad ($\text{FRI}$ de $0$ a $100$)** | `out_fri_risk_index` | `INTEGER` ($0\text{–}100$) | Basado en **NASA-STD-6001B (Test 1 & Test 4)** y tablas **MAPTIS**. Combina la distancia quemada ($>150\text{ mm}$ = fallo), el margen sobre el $\text{MOC}$ (*Maximum Oxygen Concentration*) y el $\text{HRR}$. |
| **2.2 Veredicto Comparativo ($1g$ vs. $\mu g$)** | `out_verdict_1g_vs_ug` + `out_spread_rate_1g_ref_mm_s` | `VARCHAR` + `DECIMAL` | En los *papers* de **Saffire** y **MOC (Upward Flammability)** compara la velocidad de propagación o el límite de oxígeno en microgravedad ($\mu g$) frente a la referencia normal en Tierra ($1g$). Valores: `HIGHER_RISK_IN_UG` (típico a flujos bajos $5\text{–}15\text{ cm/s}$), `LOWER_RISK_IN_UG` (a $0\text{ cm/s}$), `EQUIVALENT_RISK`. |
| **2.3 Distancia Segura de Aislamiento ($\text{mm}$)** | `out_safe_isolation_dist_mm` | `DECIMAL` ($\text{mm}$) | `Standoff distance`, `Radiation thermal safety margin`, `Flame length` ($L_f$). Se extrae de la longitud de llama medida y del radio donde el flujo radiativo cae por debajo del flujo crítico de ignición ($\dot{q}''_{cr} \approx 10\text{ kW/m}^2$). |

---

## Bloque 3: Perfil de Emisiones y Toxicidad en Cabina (Impacto en la tripulación)

| Variable en Especificación | Columna en Base de Datos (`schema.sql`) | Tipo / Unidad | Cómo buscarla en los documentos de la NASA (Keywords en inglés) |
| :--- | :--- | :--- | :--- |
| **3.1 Concentración de Monóxido de Carbono ($\text{CO}$ en $\text{ppm}$)** | `out_co_concentration_ppm` | `DECIMAL` ($\text{ppm}$) | `Carbon Monoxide concentration`, `CO ppm`, `CO yield` ($Y_{\text{CO}}$ en $\text{g/g}$), `Combustion Product Monitor (CPM)`. Se compara contra los límites **NASA SMAC** (*Spacecraft Maximum Allowable Concentrations*). |
| **3.2 Tasa de Generación de Hollín / Opacidad del Humo** | `out_soot_generation_rate_mg_g` + `out_smoke_opacity_pct_m` | `DECIMAL` ($\text{mg/g}$ y $\text{\%/m}$) | `Soot yield` ($Y_s$), `Soot volume fraction` ($f_v$), `Optical density`, `Light extinction coefficient` ($K_e$), `Smoke obscuration`. Experimentos clave de la NASA: **SAME** (*Smoke Aerosol Measurement Experiment*) y **SPFE**. |
| **3.3 Gases Ácidos Críticos ($\text{HCl}, \text{HF}, \text{HCN}$)** | `out_acid_gas_hcl_ppm`<br>`out_acid_gas_hf_ppm`<br>`out_acid_gas_hcn_ppm` | `DECIMAL` ($\text{ppm}$) | **Desglosada en 3 columnas numéricas independientes:**<br>• **$\text{HCl}$** (`Hydrogen Chloride`): Crítico en cables con aislamiento de PVC.<br>• **$\text{HF}$** (`Hydrogen Fluoride`): Crítico en polímeros fluorados como Tefzel, Teflon (PTFE) y Viton.<br>• **$\text{HCN}$** (`Hydrogen Cyanide`): Crítico en tejidos nitrogenados como Nomex, Kevlar, Kapton y espumas de poliuretano.<br>Fuente NASA: Informes de **NASA-STD-6001B Test 7 (Offgassing / Combustion Toxicity)** y sensores **FTIR / GSA** en la ISS. |

---

## Bloque 4: Diagnóstico de Sensórica y Protocolo de Extinción (Acción operativa)

| Variable en Especificación | Columna en Base de Datos (`schema.sql`) | Tipo / Unidad | Cómo buscarla en los documentos de la NASA (Keywords en inglés) |
| :--- | :--- | :--- | :--- |
| **4.1 Diámetro Medio de Partícula Emitida ($\mu\text{m}$)** | `out_mean_particle_diameter_um` | `DECIMAL` ($\mu\text{m}$) | `Count Median Diameter (CMD)`, `Mass Median Diameter (MMD)`, `Geometric Mean Diameter (GMD)`, `Primary particle size vs. Aggregate size`. En los informes del experimento **SAME (ISS)** se demuestra que en $\mu g$ las partículas son más grandes ($0.5\text{–}1.5\ \mu\text{m}$) por mayor tiempo de residencia. |
| **4.2 Sensor Óptimo y Tiempo Estimado de Detección ($\text{s}$)** | `out_optimal_sensor_type` + `out_estimated_detection_time_s` | `VARCHAR` + `DECIMAL` ($\text{s}$) | `Smoke detector response time`, `ISS Photoelectric Smoke Detector (laser light scattering)` vs. `Shuttle Ionization Smoke Detector`, `Time to alarm` ($t_{\text{det}}$). |
| **4.3 Estrategia de Mitigación Recomendada** | `out_recommended_mitigation` | `TEXT` | `Spacecraft Fire Safety Protocols`, `ISS Flight Rules`, `Ventilation shutoff`, `Portable Fire Extinguisher (PFE) - Fine Water Mist / CO2`, `Personal Breathing Apparatus (PBA)`. |
