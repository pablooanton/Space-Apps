// ============================================================================
// MOTOR FÍSICO EMPÍRICO LOCAL (FALLBACK CUANDO EL BACKEND NO ESTÁ CONECTADO)
// Devuelve exactamente el mismo JSON que el endpoint POST /api/v1/simulate
// ============================================================================

import { DEFAULT_MATERIALS, GRAVITY_LEVELS } from "./config.js";

export function computeLocalSimulation(payload, materialsCatalog = DEFAULT_MATERIALS) {
  const { essential_inputs, environment_inputs } = payload;

  const o2 = Number(essential_inputs.o2_molar_fraction_pct);
  const flow = Number(essential_inputs.ventilation_flow_cm_s);
  const matKey = essential_inputs.material_id;
  const thick = Number(essential_inputs.material_thickness_mm);

  const press = Number(environment_inputs.cabin_pressure_kpa);
  const flowDir = environment_inputs.flow_direction;
  const gravityKey = environment_inputs.gravity_key || "ug";

  const mat = materialsCatalog[matKey] || DEFAULT_MATERIALS.pmma;
  const gInfo = GRAVITY_LEVELS[gravityKey] || GRAVITY_LEVELS.ug;

  const ppO2 = (o2 / 100) * press;
  const ppO2Psi = ppO2 * 0.145038;

  let thermalThicknessRegime = "Régimen Intermedio";
  if (thick <= 1.0) thermalThicknessRegime = "Térm. Delgado (Biot < 0.1)";
  else if (thick > 3.5) thermalThicknessRegime = "Térm. Grueso (Sumidero)";

  // Velocidad efectiva (ventilación forzada + flotabilidad natural)
  const effectiveFlow = Math.sqrt(Math.pow(flow, 2) + Math.pow(gInfo.buoyVel, 2));

  // Índice límite de oxígeno efectivo ajustado por presión, espesor y microgravedad
  const pressFactor = Math.pow(press / 101.3, 0.35);
  const thickPenalty = Math.log10(thick + 1) * 2.2;
  const ugBonus = (gravityKey === "ug" && flow >= 2 && flow <= 20) ? -1.8 : 0;
  const effectiveLOI = (mat.loi + thickPenalty + ugBonus) / pressFactor;

  // Clasificación del régimen de combustión
  let regimeKey = "STEADY";
  let regimeCode = "STATE-03";
  let regimeTitle = "Propagación Laminar Estacionaria Impulsada por Ventilación";
  let regimeDesc = "El aporte advectivo de O₂ supera las pérdidas radiativas. La llama avanza de forma sostenida a lo largo de la superficie.";

  if (o2 < effectiveLOI - 1.5) {
    regimeKey = "NO_IGNITION";
    regimeCode = "STATE-00";
    regimeTitle = "No Ignición (Sub-Límite de Inflamabilidad LOI)";
    regimeDesc = `La fracción molar de O₂ (${o2.toFixed(1)}%) es insuficiente para superar el umbral crítico de pirólisis (${effectiveLOI.toFixed(1)}%) de este material.`;
  } else if (gravityKey === "ug" && flow < 1.2 && o2 < effectiveLOI + 5) {
    regimeKey = "QUENCHING";
    regimeCode = "STATE-01";
    regimeTitle = "Autoextinción por Inanición Difusiva de O₂ (Quenching Esférico)";
    regimeDesc = "Sin convección natural ni ventilación forzada, los productos de combustión (CO₂/H₂O) envuelven la llama esférica y bloquean la difusión de O₂.";
  } else if (flow > 42 && o2 < effectiveLOI + 6) {
    regimeKey = "BLOWOFF";
    regimeCode = "STATE-04";
    regimeTitle = "Extinción por Soplado Aerodinámico (Blow-off / Damköhler Bajo)";
    regimeDesc = "La velocidad del flujo supera la velocidad química de reacción, enfriando y desprendiendo el frente de llama.";
  } else if ((matKey === "cotton" || matKey === "nomex") && flow < 4.0 && o2 >= effectiveLOI - 1.5 && o2 <= effectiveLOI + 2.5) {
    regimeKey = "SMOLDERING";
    regimeCode = "STATE-02";
    regimeTitle = "Combustión Latente / Incandescente sin Llama (Smoldering)";
    regimeDesc = "Oxidación heterogénea en fase sólida sin llama visible. Altísima producción de CO y aerosoles pirolíticos.";
  }

  // Cálculo de Vf, tig y HRR
  const o2Ratio = Math.max(0, (o2 - (effectiveLOI - 2)) / 10);
  const dirFactor = flowDir === "concurrent" ? 1.35 : (flowDir === "opposed" ? 0.78 : 0.25);
  const flowFactor = effectiveFlow > 0 ? Math.pow(Math.min(effectiveFlow, 35) / 10, 0.55) : 0.15;
  const thickFactor = 1.6 / (Math.pow(thick, 0.65) + 0.4);

  let vf = 0;
  if (regimeKey === "STEADY") {
    vf = mat.baseVf * Math.pow(o2Ratio + 0.5, 1.4) * dirFactor * flowFactor * thickFactor * pressFactor;
  } else if (regimeKey === "SMOLDERING") {
    vf = 0.18 * (o2 / 21);
  } else if (regimeKey === "QUENCHING") {
    vf = 0.05;
  }

  const flow1g = Math.sqrt(Math.pow(flow, 2) + Math.pow(38.0, 2));
  const vf1g = (o2 >= (mat.loi + thickPenalty) / pressFactor)
    ? mat.baseVf * Math.pow(o2Ratio + 0.4, 1.3) * (flow1g > 35 ? 0.65 : 1.05) * thickFactor * pressFactor
    : 0;

  const diffPct = vf1g > 0 ? Math.round(((vf - vf1g) / vf1g) * 100) : 100;
  const tig = Math.max(1.2, (thick * mat.rho * 4.2) / (Math.pow(o2 / 21, 1.3) * Math.pow(press / 101.3, 0.25)));
  const sampleWidthMm = 50;
  const hrr = regimeKey === "NO_IGNITION" ? 0 : Math.round(vf * sampleWidthMm * Math.min(thick, 2.5) * mat.rho * mat.heatComb * 0.45);
  const flameTempK = regimeKey === "NO_IGNITION" ? 295 : Math.round(1150 + (o2 - 15) * 28 + Math.min(effectiveFlow, 25) * 6);

  // Módulo 2: Riesgo y Cumplimiento Normativo
  let fri = 0;
  if (regimeKey === "NO_IGNITION") {
    fri = Math.min(22, Math.round((o2 / effectiveLOI) * 20));
  } else if (regimeKey === "QUENCHING") {
    fri = 28;
  } else {
    fri = Math.min(100, Math.round(25 + vf * 18 + (hrr / 45) + (o2 - 21) * 1.6));
  }

  const nasaStatus = fri < 30 ? "APROBADO (TEST 1 PASS)" : (fri < 68 ? "RIESGO MODERADO (RESTRINGIDO)" : "RECHAZADO (CRÍTICO FAIL)");

  let verdictTitle = "≈ Severidad Comparable (1g vs μg)";
  let verdictDesc = "A altas velocidades de flujo forzado, la convección forzada domina sobre la gravedad en ambos entornos.";
  if (gravityKey === "ug" && flow < 2.0) {
    verdictTitle = "✓ Menos Peligroso en μg (Sin Flujo)";
    verdictDesc = "La ausencia de convección natural asfixia la llama en μg, mientras que en 1g la pluma boyante sostendría la combustión.";
  } else if (vf > vf1g || (flow >= 3 && flow <= 20)) {
    verdictTitle = "⚠️ Más Peligroso en μg que en 1g";
    verdictDesc = "El flujo de ventilación sostiene una llama sin pérdidas por flotabilidad; las gotas fundidas no caen y permanecen adheridas.";
  }

  const safeDist = regimeKey === "NO_IGNITION" ? 15 : Math.round(35 + Math.sqrt(hrr) * 4.2);

  // Módulo 3: Toxicidad y Emisiones
  const incompleteCombFactor = gravityKey === "ug" ? 1.45 : 1.0;
  const coPpm = regimeKey === "NO_IGNITION" ? 0 : Math.round(mat.coFactor * incompleteCombFactor * (regimeKey === "SMOLDERING" ? 2.2 : 1.0) * (25 / Math.max(15, o2)));
  const sootRate = regimeKey === "NO_IGNITION" ? 0 : Number((mat.sootFactor * incompleteCombFactor * (o2 < 23 ? 1.25 : 0.9)).toFixed(1));
  const activeMult = regimeKey === "NO_IGNITION" ? 0 : 1;

  // Módulo 4: Sensórica y Mitigación
  const dp = regimeKey === "NO_IGNITION" ? 0 : Number((gravityKey === "ug" ? (0.65 + sootRate * 0.018) : (0.18 + sootRate * 0.008)).toFixed(2));
  const optimalSensor = (dp >= 0.5 || regimeKey === "SMOLDERING")
    ? "Fotoeléctrico Dispersión Láser (ISS)"
    : (dp > 0 ? "Detector Iónico + Químico CO" : "Monitoreo Nominal en Espera");
  const detTime = regimeKey === "NO_IGNITION" ? 0 : Number((tig + 18 / Math.max(2, effectiveFlow)).toFixed(1));

  const steps = [];
  if (regimeKey === "NO_IGNITION") {
    steps.push("Condición segura: El material cumple NASA-STD-6001B bajo esta atmósfera.");
    steps.push("Mantener telemetría ambiental ECLSS en modo nominal.");
  } else {
    steps.push("APAGADO INMEDIATO DE VENTILACIÓN HVAC (llevar U_v → 0 cm/s) para privar a la llama de transporte advectivo de O₂.");
    if (matKey === "pvc" || matKey === "nomex" || matKey === "kapton") {
      steps.push("⚠️ ALERTA GASES ÁCIDOS (HCl/HF/HCN): Colocación inmediata de máscaras PBA/EGBM por la tripulación antes de intervenir.");
    }
    steps.push("Aplicar agente extintor Niebla de Agua Fina (Orion/Gateway) o CO₂ (ISS) dirigido a la base de pirólisis.");
    if (coPpm > 55) {
      steps.push("Activar cartuchos de depuración catalítica de CO/LiOH del sistema ECLSS post-extinción.");
    }
  }

  return {
    run_id: `LOCAL-${Date.now().toString().slice(-6)}`,
    source: "LOCAL_PHYSICS_ENGINE",
    derived_environment: {
      pp_o2_kpa: Number(ppO2.toFixed(1)),
      pp_o2_psia: Number(ppO2Psi.toFixed(2)),
      thermal_thickness_regime: thermalThicknessRegime,
      flame_temp_k: flameTempK
    },
    module_1_flame_dynamics: {
      spread_rate_mm_s: Number(vf.toFixed(2)),
      spread_rate_1g_mm_s: Number(vf1g.toFixed(2)),
      spread_rate_diff_pct: diffPct,
      combustion_regime_key: regimeKey,
      combustion_regime_code: regimeCode,
      combustion_regime_title: regimeTitle,
      combustion_regime_description: regimeDesc,
      ignition_time_s: Number(tig.toFixed(1)),
      thermal_inertia_label: thick < 1.0 ? "Inercia térmica: Baja (Rápida)" : (thick > 3.5 ? "Inercia térmica: Alta" : "Inercia térmica: Media"),
      hrr_watts: hrr,
      radiative_flux_kw_m2: Number((hrr * 0.032).toFixed(1))
    },
    module_2_risk_compliance: {
      fri_score: fri,
      nasa_std_6001b_status: nasaStatus,
      verdict_1g_vs_ug_title: verdictTitle,
      verdict_1g_vs_ug_description: verdictDesc,
      safe_standoff_distance_mm: safeDist
    },
    module_3_emissions_toxicity: {
      co_concentration_ppm: coPpm,
      co_smac_status: coPpm === 0 ? "NOMINAL" : (coPpm <= 55 ? "ALERTA 24h" : "EXCEDE SMAC 1h"),
      soot_generation_rate_mg_g: sootRate,
      smoke_opacity_label: sootRate === 0 ? "Opacidad: Nula (Sin emisión)" : (sootRate < 18 ? "Opacidad: Moderada (Aglomeración μg)" : "Opacidad: Crítica (Baja visibilidad)"),
      critical_acid_gases: {
        hcl_ppm: Number((mat.hcl * activeMult).toFixed(1)),
        hf_ppm: Number((mat.hf * activeMult).toFixed(1)),
        hcn_ppm: Number((mat.hcn * activeMult).toFixed(1))
      }
    },
    module_4_sensors_extinguishing: {
      mean_particle_diameter_um: dp,
      particle_agglomeration_note: gravityKey === "ug" ? "Aglomeración en μg (Ideal sensor óptico)" : "Partícula fina 1g (Ideal sensor iónico)",
      optimal_sensor_type: optimalSensor,
      estimated_detection_time_s: detTime,
      recommended_mitigation_steps: steps
    }
  };
}
