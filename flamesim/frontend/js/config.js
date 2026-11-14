// ============================================================================
// CONFIGURACIÓN DE ENTORNOS Y DATOS SEMILLA DE RESPALDO (NASA MAPTIS / SAFFIRE)
// ============================================================================

export const API_CONFIG = {
  BASE_URL: "http://localhost:8000/api/v1",
  TIMEOUT_MS: 2500,
  // Cuando el backend aún no está levantado en localhost:8000, el frontend
  // conmuta automáticamente al motor físico local sin romperse.
  AUTO_FALLBACK_TO_LOCAL: true
};

export const GRAVITY_LEVELS = {
  ug:    { label: "10⁻⁶ g (Microgravedad ISS)", gVal: 0.000001, buoyVel: 0.0 },
  moon:  { label: "0.16 g (Gravedad Lunar)",    gVal: 0.16,     buoyVel: 14.0 },
  mars:  { label: "0.38 g (Gravedad Marciana)", gVal: 0.38,     buoyVel: 22.0 },
  earth: { label: "1.00 g (Referencia Tierra)", gVal: 1.00,     buoyVel: 38.0 }
};

export const DEFAULT_MATERIALS = {
  pmma: {
    id: "pmma",
    name: "PMMA (Acrílico Cast · Ventanas / Saffire)",
    maptis_code: "MAP-PMMA-001",
    loi: 17.5,
    baseVf: 1.45,
    heatComb: 25.0,
    rho: 1.18,
    sootFactor: 14.0,
    coFactor: 160,
    hcl: 0.0, hf: 0.0, hcn: 0.0
  },
  cotton: {
    id: "cotton",
    name: "Tejido Algodón/Fibra (SIBAL · Ropa Tripulación)",
    maptis_code: "MAP-SIBAL-02",
    loi: 18.0,
    baseVf: 3.20,
    heatComb: 16.5,
    rho: 0.45,
    sootFactor: 8.5,
    coFactor: 240,
    hcl: 0.0, hf: 0.0, hcn: 0.0
  },
  pvc: {
    id: "pvc",
    name: "Aislamiento Cable PVC/Tefzel (Halogenado)",
    maptis_code: "MAP-TEFZ-104",
    loi: 23.5,
    baseVf: 0.95,
    heatComb: 18.0,
    rho: 1.38,
    sootFactor: 38.0,
    coFactor: 390,
    hcl: 42.0, hf: 14.5, hcn: 2.0
  },
  nomex: {
    id: "nomex",
    name: "Nomex HT90-40 (Retardante Ignífugo NASA)",
    maptis_code: "MAP-NOMX-090",
    loi: 28.5,
    baseVf: 0.45,
    heatComb: 14.0,
    rho: 0.72,
    sootFactor: 11.0,
    coFactor: 210,
    hcl: 0.0, hf: 0.0, hcn: 18.5
  },
  kapton: {
    id: "kapton",
    name: "Película Kapton Poliimida (Aislante Térmico)",
    maptis_code: "MAP-KAPT-500",
    loi: 36.5,
    baseVf: 0.25,
    heatComb: 12.0,
    rho: 1.42,
    sootFactor: 6.0,
    coFactor: 140,
    hcl: 0.0, hf: 0.0, hcn: 12.0
  }
};

export const NASA_EXPERIMENTS_SEED = [
  {
    experiment_id: "SAFFIRE-I-SIBAL",
    mission_name: "Cygnus OA-6 (Saffire-I)",
    material_id: "cotton",
    inputs: {
      o2_molar_fraction_pct: 21.0,
      ventilation_flow_cm_s: 20.0,
      material_thickness_mm: 0.4,
      cabin_pressure_kpa: 101.3,
      flow_direction: "concurrent",
      gravity_key: "ug"
    },
    measured_outputs: {
      spread_rate_mm_s: 3.65,
      combustion_regime: "STEADY",
      ignition_time_s: 3.2,
      hrr_watts: 920.0,
      co_concentration_ppm: 285,
      mean_particle_diameter_um: 0.82
    },
    notes: "Propagación concurrente sobre tela SIBAL a gran escala en microgravedad."
  },
  {
    experiment_id: "SAFFIRE-IV-PMMA",
    mission_name: "Cygnus NG-13 (Saffire-IV)",
    material_id: "pmma",
    inputs: {
      o2_molar_fraction_pct: 26.5,
      ventilation_flow_cm_s: 15.0,
      material_thickness_mm: 2.0,
      cabin_pressure_kpa: 82.0,
      flow_direction: "concurrent",
      gravity_key: "ug"
    },
    measured_outputs: {
      spread_rate_mm_s: 2.15,
      combustion_regime: "STEADY",
      ignition_time_s: 9.5,
      hrr_watts: 790.0,
      co_concentration_ppm: 195,
      mean_particle_diameter_um: 0.91
    },
    notes: "Ensayo en atmósfera enriquecida de exploración espacial (Saffire-IV)."
  },
  {
    experiment_id: "SOFIE-PMMA-QUENCH",
    mission_name: "ISS Destiny Lab (SoFIE)",
    material_id: "pmma",
    inputs: {
      o2_molar_fraction_pct: 21.0,
      ventilation_flow_cm_s: 0.0,
      material_thickness_mm: 2.5,
      cabin_pressure_kpa: 101.3,
      flow_direction: "quiescent",
      gravity_key: "ug"
    },
    measured_outputs: {
      spread_rate_mm_s: 0.05,
      combustion_regime: "QUENCHING",
      ignition_time_s: 12.8,
      hrr_watts: 45.0,
      co_concentration_ppm: 90,
      mean_particle_diameter_um: 0.74
    },
    notes: "Autoextinción esférica por inanición difusiva al cortar ventilación del túnel."
  },
  {
    experiment_id: "ORION-EXPLORE-34",
    mission_name: "NASA GRC Normoxic Test",
    material_id: "nomex",
    inputs: {
      o2_molar_fraction_pct: 34.0,
      ventilation_flow_cm_s: 18.0,
      material_thickness_mm: 1.0,
      cabin_pressure_kpa: 56.5,
      flow_direction: "concurrent",
      gravity_key: "ug"
    },
    measured_outputs: {
      spread_rate_mm_s: 1.12,
      combustion_regime: "STEADY",
      ignition_time_s: 5.1,
      hrr_watts: 410.0,
      co_concentration_ppm: 260,
      mean_particle_diameter_um: 0.88
    },
    notes: "Atmósfera de exploración lunar Orion (34% O₂ a 56.5 kPa). El Nomex arde en μg."
  }
];
