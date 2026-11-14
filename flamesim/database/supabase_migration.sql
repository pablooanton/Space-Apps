-- ============================================================================
-- SUPABASE (POSTGRESQL) MIGRATION SCRIPT
-- Proyecto: NASA Microgravity Flame & Combustion Simulator
-- Instrucciones: Copia y pega todo este archivo en el "SQL Editor" de Supabase
-- y pulsa "Run". Creará las tablas, índices, datos iniciales y permisos de lectura.
-- ============================================================================

-- 1. TABLA DE DOCUMENTOS Y CAMPAÑAS DE LA NASA (Trazabilidad NTRS / PSI)
CREATE TABLE IF NOT EXISTS public.nasa_source_documents (
    document_id TEXT PRIMARY KEY,                -- Ej: 'NASA/TM-2020-220514'
    title TEXT NOT NULL,
    experiment_campaign TEXT NOT NULL,           -- 'SAFFIRE', 'SOFIE', 'BASS', 'FLEX', 'SAME', 'MAPTIS'
    publication_year INTEGER,
    ntrs_or_psi_url TEXT,
    authors TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLA DE MATERIALES AEROESPACIALES (Catálogo MAPTIS / NASA-STD-6001B)
CREATE TABLE IF NOT EXISTS public.materials (
    material_id TEXT PRIMARY KEY,                -- Ej: 'pmma', 'cotton', 'pvc', 'nomex', 'kapton'
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    maptis_code TEXT,
    density_g_cm3 NUMERIC(6,3),
    heat_of_combustion_kj_g NUMERIC(6,2),
    loi_1g_pct NUMERIC(5,2),
    loi_ug_pct NUMERIC(5,2),
    contains_chlorine BOOLEAN DEFAULT FALSE,
    contains_fluorine BOOLEAN DEFAULT FALSE,
    contains_nitrogen BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA MAESTRA DE EXPERIMENTOS NASA (7 Entradas + 20 Columnas de Salida)
CREATE TABLE IF NOT EXISTS public.nasa_experiment_records (
    record_id TEXT PRIMARY KEY,                  -- Ej: 'SAFFIRE-I-RUN01'
    document_id TEXT REFERENCES public.nasa_source_documents(document_id) ON DELETE SET NULL,
    material_id TEXT NOT NULL REFERENCES public.materials(material_id) ON DELETE RESTRICT,

    -- A. VARIABLES DE ENTRADA (7 Parámetros)
    in_o2_molar_fraction_pct NUMERIC(5,2) NOT NULL,
    in_ventilation_flow_cm_s NUMERIC(6,2) NOT NULL,
    in_material_thickness_mm NUMERIC(6,3) NOT NULL,
    in_cabin_pressure_kpa NUMERIC(6,2) NOT NULL,
    in_flow_direction TEXT NOT NULL CHECK (in_flow_direction IN ('CONCURRENT', 'OPPOSED', 'QUIESCENT')),
    in_gravity_level_g NUMERIC(8,6) NOT NULL,

    -- B. SALIDAS BLOQUE 1: Métricas de Dinámica de la Llama
    out_flame_spread_rate_mm_s NUMERIC(7,4),
    out_combustion_regime TEXT NOT NULL CHECK (out_combustion_regime IN (
        'NO_IGNITION_QUENCH',
        'COOL_FLAME',
        'VISIBLE_STEADY_FLAME',
        'SMOLDERING',
        'BLOWOFF'
    )),
    out_flame_temperature_k NUMERIC(6,1),
    out_ignition_time_s NUMERIC(7,2),
    out_hrr_watts NUMERIC(9,2),
    out_hrr_kilowatts NUMERIC(8,4),

    -- C. SALIDAS BLOQUE 2: Evaluación de Riesgo y Cumplimiento Normativo
    out_fri_risk_index INTEGER CHECK (out_fri_risk_index BETWEEN 0 AND 100),
    out_verdict_1g_vs_ug TEXT CHECK (out_verdict_1g_vs_ug IN (
        'HIGHER_RISK_IN_UG',
        'LOWER_RISK_IN_UG',
        'EQUIVALENT_RISK'
    )),
    out_spread_rate_1g_ref_mm_s NUMERIC(7,4),
    out_safe_isolation_dist_mm NUMERIC(7,2),

    -- D. SALIDAS BLOQUE 3: Perfil de Emisiones y Toxicidad en Cabina
    out_co_concentration_ppm NUMERIC(8,2),
    out_soot_generation_rate_mg_g NUMERIC(7,2),
    out_smoke_opacity_pct_m NUMERIC(6,2),
    out_acid_gas_hcl_ppm NUMERIC(7,2) DEFAULT 0.0,
    out_acid_gas_hf_ppm NUMERIC(7,2) DEFAULT 0.0,
    out_acid_gas_hcn_ppm NUMERIC(7,2) DEFAULT 0.0,

    -- E. SALIDAS BLOQUE 4: Diagnóstico de Sensórica y Protocolo de Extinción
    out_mean_particle_diameter_um NUMERIC(6,3),
    out_optimal_sensor_type TEXT,
    out_estimated_detection_time_s NUMERIC(7,2),
    out_recommended_mitigation TEXT,

    -- Metadatos
    data_quality_flag TEXT DEFAULT 'MEASURED_AND_DERIVED',
    extraction_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- HABILITAR ROW LEVEL SECURITY (RLS) Y POLÍTICAS DE ACCESO PÚBLICO PARA EL SIMULADOR
-- ============================================================================
ALTER TABLE public.nasa_source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nasa_experiment_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura publica de documentos NASA"
    ON public.nasa_source_documents FOR SELECT USING (true);

CREATE POLICY "Lectura publica de materiales NASA"
    ON public.materials FOR SELECT USING (true);

CREATE POLICY "Lectura publica de experimentos NASA"
    ON public.nasa_experiment_records FOR SELECT USING (true);

-- ============================================================================
-- DATOS INICIALES (SEED DATA) PARA PROBAR EN SUPABASE INMEDIATAMENTE
-- ============================================================================

INSERT INTO public.materials (
    material_id, name, category, maptis_code, density_g_cm3,
    heat_of_combustion_kj_g, loi_1g_pct, loi_ug_pct,
    contains_chlorine, contains_fluorine, contains_nitrogen
) VALUES
('pmma', 'PMMA (Acrílico Cast · Ventanas / Saffire)', 'Polímero Termoplástico', 'MAP-PMMA-001', 1.180, 25.0, 17.5, 15.8, false, false, false),
('cotton', 'Tejido Algodón/Fibra (SIBAL · Ropa Tripulación)', 'Compuesto Celulósico', 'MAP-SIBAL-02', 0.450, 16.5, 18.0, 16.2, false, false, false),
('pvc', 'Aislamiento Cable PVC/Tefzel (Halogenado)', 'Fluoropolímero / Clorado', 'MAP-TEFZ-104', 1.380, 18.0, 23.5, 21.8, true, true, true),
('nomex', 'Nomex HT90-40 (Retardante Ignífugo NASA)', 'Aramida Ignífuga', 'MAP-NOMX-090', 0.720, 14.0, 28.5, 27.0, false, false, true),
('kapton', 'Película Kapton Poliimida (Aislante Térmico MLI)', 'Poliimida', 'MAP-KAPT-500', 1.420, 12.0, 36.5, 35.0, false, false, true)
ON CONFLICT (material_id) DO NOTHING;

INSERT INTO public.nasa_source_documents (
    document_id, title, experiment_campaign, publication_year, ntrs_or_psi_url
) VALUES
('NASA/TM-2017-219505', 'Spacecraft Fire Experiment (Saffire-I) Quantitative Results', 'SAFFIRE', 2017, 'https://ntrs.nasa.gov/'),
('NASA/TM-2021-220688', 'Saffire-IV Microgravity Flame Spread in Exploration Atmospheres', 'SAFFIRE', 2021, 'https://ntrs.nasa.gov/'),
('NASA/CR-2016-219120', 'Cool Flames Investigation (CFI) and Low-Temperature Chemistry in Microgravity', 'FLEX', 2016, 'https://psi.nasa.gov/'),
('NASA/TM-2023-SOFIE01', 'Solid Fuel Ignition and Extinction (SoFIE) Quenching Limits in Destiny Lab', 'SOFIE', 2023, 'https://psi.nasa.gov/'),
('NASA/TM-2010-216351', 'Smoke Aerosol Measurement Experiment (SAME) Particle Size Distribution in ISS', 'SAME', 2010, 'https://ntrs.nasa.gov/'),
('NASA/TM-2019-220210', 'Flammability of Aerospace Materials in Normoxic Exploration Atmospheres (34% O2)', 'MAPTIS', 2019, 'https://ntrs.nasa.gov/')
ON CONFLICT (document_id) DO NOTHING;

INSERT INTO public.nasa_experiment_records (
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
) VALUES
(
    'SAFFIRE-I-RUN01', 'NASA/TM-2017-219505', 'cotton',
    21.0, 20.0, 0.400, 101.3, 'CONCURRENT', 0.000001,
    3.6500, 'VISIBLE_STEADY_FLAME', 1480.0, 3.20, 920.00, 0.9200,
    78, 'HIGHER_RISK_IN_UG', 2.9000, 162.00, 285.00, 11.80, 24.50,
    0.00, 0.00, 0.00, 0.820, 'PHOTOELECTRIC_LASER', 7.40,
    '1. Corte inmediato de ventilación HVAC; 2. Extinción con Niebla de Agua Fina; 3. Depuración CO.',
    'MEASURED_AND_DERIVED', 'Saffire-I sobre tejido SIBAL a gran escala en nave Cygnus OA-6.'
),
(
    'SAFFIRE-IV-RUN02', 'NASA/TM-2021-220688', 'pmma',
    26.5, 15.0, 2.000, 82.0, 'CONCURRENT', 0.000001,
    2.1500, 'VISIBLE_STEADY_FLAME', 1540.0, 9.50, 790.00, 0.7900,
    71, 'HIGHER_RISK_IN_UG', 1.6800, 152.00, 195.00, 18.40, 31.20,
    0.00, 0.00, 0.00, 0.910, 'PHOTOELECTRIC_LASER', 13.10,
    '1. Corte inmediato de ventilación HVAC; 2. Extinción CO2/Agua; 3. Monitoreo de hollín en filtros HEPA.',
    'MEASURED_AND_DERIVED', 'Saffire-IV en atmósfera enriquecida sobre placa de PMMA.'
),
(
    'FLEX-CFI-COOL01', 'NASA/CR-2016-219120', 'pmma',
    18.5, 2.5, 1.500, 101.3, 'OPPOSED', 0.000001,
    0.1200, 'COOL_FLAME', 605.0, 11.00, 65.00, 0.0650,
    42, 'HIGHER_RISK_IN_UG', 0.0000, 68.00, 410.00, 2.10, 4.50,
    0.00, 0.00, 0.00, 0.340, 'GAS_CO_IR', 19.50,
    '1. Peligro de Llama Fría invisible (~600 K): No abrir escotilla ni aumentar flujo O2 (riesgo de re-ignición súbita a llama caliente); 2. Aislar alimentación térmica.',
    'MEASURED_AND_DERIVED', 'Transición de llama caliente radiativa a Llama Fría (Cool Flame ~600 K) auto-sostenida en microgravedad.'
),
(
    'SOFIE-QUENCH-01', 'NASA/TM-2023-SOFIE01', 'pmma',
    21.0, 0.0, 3.000, 101.3, 'QUIESCENT', 0.000001,
    0.0000, 'NO_IGNITION_QUENCH', 490.0, 14.20, 18.00, 0.0180,
    24, 'LOWER_RISK_IN_UG', 1.1500, 35.00, 65.00, 3.40, 6.00,
    0.00, 0.00, 0.00, 0.740, 'PHOTOELECTRIC_LASER', 28.00,
    '1. Mantener ventilación apagada para asegurar extinción difusiva completa; 2. Verificar temperatura de superficie con cámara IR.',
    'MEASURED_AND_DERIVED', 'Autoextinción por inanición difusiva de O2 en cámara estanca en microgravedad (ISS Destiny Lab).'
),
(
    'SAME-PVC-CABLE03', 'NASA/TM-2010-216351', 'pvc',
    23.0, 10.0, 1.200, 101.3, 'CONCURRENT', 0.000001,
    0.8800, 'VISIBLE_STEADY_FLAME', 1310.0, 6.80, 340.00, 0.3400,
    69, 'HIGHER_RISK_IN_UG', 0.4200, 112.00, 420.00, 44.50, 68.00,
    46.50, 15.80, 2.40, 1.150, 'PHOTOELECTRIC_LASER', 10.20,
    '1. ALERTA ROJA GASES ÁCIDOS (HCl/HF > SMAC): Colocación obligatoria de máscaras respiratorias PBA; 2. Corte eléctrico del rack y apagado HVAC.',
    'MEASURED_AND_DERIVED', 'Pirólisis y combustión de recubrimiento de cable PVC/Tefzel en microgravedad (Experimento SAME).'
),
(
    'ORION-NOMEX-34O2', 'NASA/TM-2019-220210', 'nomex',
    34.0, 18.0, 1.000, 56.5, 'CONCURRENT', 0.000001,
    1.1200, 'VISIBLE_STEADY_FLAME', 1490.0, 5.10, 410.00, 0.4100,
    66, 'HIGHER_RISK_IN_UG', 0.8500, 120.00, 260.00, 14.20, 26.00,
    0.00, 0.00, 19.80, 0.880, 'PHOTOELECTRIC_LASER', 8.90,
    '1. ALERTA HCN (Ácido Cianhídrico > 8 ppm SMAC): Uso de máscara PBA; 2. Reducir flujo de ventilación en cabina Orion.',
    'MEASURED_AND_DERIVED', 'Ensayo en atmósfera de exploración lunar Orion (34% O2, 56.5 kPa / 8.2 psia) sobre tejido ignífugo Nomex.'
)
ON CONFLICT (record_id) DO NOTHING;
