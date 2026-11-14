-- ============================================================================
-- NASA MICROGRAVITY COMBUSTION & FLAMMABILITY DATABASE SCHEMA (v2.0)
-- Diseñado para ingestar cientos de documentos técnicos de la NASA:
-- NTRS, PSI (Physical Sciences Informatics), Saffire I-VI, SoFIE, BASS, FLEX,
-- SAME (Smoke Aerosol Measurement Experiment) y MAPTIS (NASA-STD-6001B).
-- ============================================================================

-- 1. CATÁLOGO DE DOCUMENTOS Y CAMPAÑAS DE LA NASA (Trazabilidad bibliográfica)
CREATE TABLE IF NOT EXISTS nasa_source_documents (
    document_id VARCHAR(64) PRIMARY KEY,         -- Ej: 'NASA/TM-2020-220514', 'PSI-SAFFIRE-IV'
    title VARCHAR(255) NOT NULL,                 -- Título del paper / informe técnico NASA
    experiment_campaign VARCHAR(64) NOT NULL,    -- 'SAFFIRE', 'SOFIE', 'BASS', 'FLEX', 'SAME', 'MAPTIS'
    publication_year INTEGER,
    ntrs_or_psi_url VARCHAR(500),                -- Enlace al PDF / dataset oficial de la NASA
    authors VARCHAR(255)
);

-- 2. CATÁLOGO DE MATERIALES AEROESPACIALES (Propiedades intrínsecas)
CREATE TABLE IF NOT EXISTS materials (
    material_id VARCHAR(32) PRIMARY KEY,         -- Ej: 'pmma', 'sibal_cotton', 'pvc_tefzel', 'nomex', 'kapton'
    name VARCHAR(120) NOT NULL,
    category VARCHAR(64) NOT NULL,               -- Polímero, Tejido Celulósico, Fluoropolímero, Aramida
    maptis_code VARCHAR(32),                     -- Código en la base de datos NASA MAPTIS
    density_g_cm3 DECIMAL(6,3),                  -- Densidad (g/cm³)
    heat_of_combustion_kj_g DECIMAL(6,2),        -- Calor efectivo de combustión ΔH_c (kJ/g)
    loi_1g_pct DECIMAL(5,2),                     -- Limiting Oxygen Index en Tierra 1g (%)
    loi_ug_pct DECIMAL(5,2),                     -- Limiting Oxygen Index en Microgravedad μg (%)
    contains_chlorine BOOLEAN DEFAULT FALSE,     -- Indica potencial emisión de HCl
    contains_fluorine BOOLEAN DEFAULT FALSE,     -- Indica potencial emisión de HF
    contains_nitrogen BOOLEAN DEFAULT FALSE      -- Indica potencial emisión de HCN
);

-- 3. TABLA MAESTRA DE EXPERIMENTOS Y VARIABLES DE ENTRADA / SALIDA
-- Cada fila representa un ensayo experimental extraído de los documentos NASA
CREATE TABLE IF NOT EXISTS nasa_experiment_records (
    record_id VARCHAR(48) PRIMARY KEY,           -- Ej: 'SAFFIRE-IV-RUN-02'
    document_id VARCHAR(64) REFERENCES nasa_source_documents(document_id),
    material_id VARCHAR(32) NOT NULL REFERENCES materials(material_id),

    -- ========================================================================
    -- A. VARIABLES DE ENTRADA (7 Parámetros del Simulador)
    -- ========================================================================
    -- Esenciales (1..4)
    in_o2_molar_fraction_pct DECIMAL(5,2) NOT NULL,   -- 1. Fracción molar de oxígeno X_O2 (%)
    in_ventilation_flow_cm_s DECIMAL(6,2) NOT NULL,   -- 2. Velocidad de flujo de ventilación U_v (cm/s)
    -- (3. Tipo de material es material_id)
    in_material_thickness_mm DECIMAL(6,3) NOT NULL,   -- 4. Espesor del material δ (mm)

    -- Datos Entorno Cabina / Nave Espacial (1..3)
    in_cabin_pressure_kpa DECIMAL(6,2) NOT NULL,      -- 1. Presión total de la cabina P_cab (kPa)
    in_flow_direction VARCHAR(20) NOT NULL,           -- 2. Dirección del flujo: 'CONCURRENT' | 'OPPOSED' | 'QUIESCENT'
    in_gravity_level_g DECIMAL(8,6) NOT NULL,         -- 3. Nivel de gravedad (g/g0, ej: 0.000001 para μg)

    -- ========================================================================
    -- B. VARIABLES DE SALIDA (13 Variables de Ingeniería divididas en 4 Bloques)
    -- ========================================================================

    -- BLOQUE 1: Métricas de Dinámica de la Llama (El comportamiento físico)
    out_flame_spread_rate_mm_s DECIMAL(7,4),          -- 1.1 Velocidad de Propagación de la Llama V_f (mm/s)
    out_combustion_regime VARCHAR(32) NOT NULL,       -- 1.2 Régimen de Combustión:
                                                      --     'NO_IGNITION_QUENCH' (No ignición / Autoextinción)
                                                      --     'COOL_FLAME' (Llama Fría / Pirólisis latente invisible ~600 K)
                                                      --     'VISIBLE_STEADY_FLAME' (Llama visible estacionaria ~1200-1600 K)
                                                      --     'SMOLDERING' (Combustión latente incandescente en sólido)
                                                      --     'BLOWOFF' (Extinción por soplado a alto flujo)
    out_flame_temperature_k DECIMAL(6,1),             --     Temperatura característica asociada al régimen (ej. ~600 K en Cool Flame)
    out_ignition_time_s DECIMAL(7,2),                 -- 1.3 Tiempo hasta la Ignición t_ig (s)
    out_hrr_watts DECIMAL(9,2),                       -- 1.4a Tasa de Liberación de Calor HRR en Vatios (W)
    out_hrr_kilowatts DECIMAL(8,4),                   -- 1.4b Tasa de Liberación de Calor HRR en Kilovatios (kW)

    -- BLOQUE 2: Evaluación de Riesgo y Cumplimiento Normativo (El criterio industrial)
    out_fri_risk_index INTEGER,                       -- 2.1 Índice de Riesgo de Inflamabilidad FRI (0 a 100)
    out_verdict_1g_vs_ug VARCHAR(32),                 -- 2.2 Veredicto Comparativo (1g vs. μg):
                                                      --     'HIGHER_RISK_IN_UG' | 'LOWER_RISK_IN_UG' | 'EQUIVALENT_RISK'
    out_spread_rate_1g_ref_mm_s DECIMAL(7,4),         --     Valor de referencia V_f en 1g (mm/s) para calcular el veredicto
    out_safe_isolation_dist_mm DECIMAL(7,2),          -- 2.3 Distancia Segura de Aislamiento / Standoff (mm)

    -- BLOQUE 3: Perfil de Emisiones y Toxicidad en Cabina (Impacto en la tripulación)
    out_co_concentration_ppm DECIMAL(8,2),            -- 3.1 Concentración de Monóxido de Carbono CO (ppm)
    out_soot_generation_rate_mg_g DECIMAL(7,2),       -- 3.2a Tasa de Generación de Hollín Y_s (mg/g)
    out_smoke_opacity_pct_m DECIMAL(6,2),             -- 3.2b Opacidad del Humo / Extinción óptica (%/m o m^-1)
    out_acid_gas_hcl_ppm DECIMAL(7,2) DEFAULT 0.0,    -- 3.3a Gas Ácido Crítico: Cloruro de Hidrógeno HCl (ppm)
    out_acid_gas_hf_ppm DECIMAL(7,2) DEFAULT 0.0,     -- 3.3b Gas Ácido Crítico: Fluoruro de Hidrógeno HF (ppm)
    out_acid_gas_hcn_ppm DECIMAL(7,2) DEFAULT 0.0,    -- 3.3c Gas Ácido Crítico: Ácido Cianhídrico HCN (ppm)

    -- BLOQUE 4: Diagnóstico de Sensórica y Protocolo de Extinción (Acción operativa)
    out_mean_particle_diameter_um DECIMAL(6,3),       -- 4.1 Diámetro Medio de Partícula Emitida D_p / CMD (μm)
    out_optimal_sensor_type VARCHAR(64),              -- 4.2a Sensor Óptimo: 'PHOTOELECTRIC_LASER' | 'IONIZATION' | 'GAS_CO_IR'
    out_estimated_detection_time_s DECIMAL(7,2),      -- 4.2b Tiempo Estimado de Detección t_det (s)
    out_recommended_mitigation TEXT,                  -- 4.3 Estrategia de Mitigación Recomendada (Protocolo ISS / Orion)

    -- Metadatos de calidad del dato (Diferencia entre dato medido directamente en paper NASA vs. calculado por correlación)
    data_quality_flag VARCHAR(24) DEFAULT 'MEASURED_AND_DERIVED',
    extraction_notes TEXT
);
