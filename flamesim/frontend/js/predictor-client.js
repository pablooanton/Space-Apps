// ============================================================================
// FlameSim: Client-Side Mirror of predict.py (k-NN IDW + Physics Heuristic)
// ============================================================================

import { normalizeFlowDir } from "./dataset-parser.js";

const MATERIAL_BASE_PROPS = {
  cotton: { loi: 17.5, base_vf: 3.1, rho: 0.45, hc: 16.5, hcl: null, hf: null, hcn: null },
  pmma:   { loi: 17.0, base_vf: 1.6, rho: 1.18, hc: 25.0, hcl: null, hf: null, hcn: null },
  pvc:    { loi: 21.5, base_vf: 0.85, rho: 1.38, hc: 18.0, hcl: 42.0, hf: 14.5, hcn: 2.2 },
  nomex:  { loi: 27.5, base_vf: 0.55, rho: 0.72, hc: 14.0, hcl: 0.0,  hf: 0.0,  hcn: 18.5 },
  custom: { loi: 19.5, base_vf: 1.35, rho: 1.00, hc: 20.0, hcl: null, hf: null, hcn: null }
};

export function computeFeatureDistance(inp, row) {
  const o2In = Number(inp.in_o2_molar_fraction_pct ?? 21.0);
  const flIn = Number(inp.in_ventilation_flow_cm_s ?? 10.0);
  const thIn = Number(inp.in_material_thickness_mm ?? 1.5);
  const prIn = Number(inp.in_cabin_pressure_kpa ?? 101.3);
  const grIn = Number(inp.in_gravity_level_g ?? 0.0);
  const dirIn = normalizeFlowDir(inp.in_flow_direction);

  const o2R = row.in_o2_molar_fraction_pct ?? o2In;
  const flR = row.in_ventilation_flow_cm_s ?? flIn;
  const thR = row.in_material_thickness_mm ?? thIn;
  const prR = row.in_cabin_pressure_kpa ?? prIn;
  const grR = row.in_gravity_level_g ?? grIn;
  const dirR = row.in_flow_direction || "CONCURRENT";

  const dO2 = ((o2In - o2R) / 35.0) * 1.4;
  const logFlIn = Math.log10(Math.max(0.0, flIn) + 1.0);
  const logFlR = Math.log10(Math.max(0.0, flR) + 1.0);
  const dFl = ((logFlIn - logFlR) / 1.71) * 1.3;
  const dTh = ((thIn - thR) / 10.0) * 1.0;
  const dPr = ((prIn - prR) / 130.0) * 0.8;
  const dGr = ((grIn - grR) / 1.0) * 1.2;
  const dDir = dirIn === dirR ? 0.0 : 0.35;

  return Math.sqrt(dO2 ** 2 + dFl ** 2 + dTh ** 2 + dPr ** 2 + dGr ** 2 + dDir ** 2);
}

export function computeHeuristicOutputs(inp) {
  const matId = String(inp.material_id || "custom").toLowerCase();
  const props = MATERIAL_BASE_PROPS[matId] || MATERIAL_BASE_PROPS.custom;

  const o2 = Number(inp.in_o2_molar_fraction_pct ?? 21.0);
  const flow = Number(inp.in_ventilation_flow_cm_s ?? 12.0);
  const thick = Math.max(0.05, Number(inp.in_material_thickness_mm ?? 1.5));
  const press = Number(inp.in_cabin_pressure_kpa ?? 101.3);
  const grav = Number(inp.in_gravity_level_g ?? 0.0);
  const flowDir = normalizeFlowDir(inp.in_flow_direction);

  const buoyancyVel = 36.0 * Math.sqrt(Math.max(0.0, grav));
  const effFlow = Math.sqrt(flow ** 2 + buoyancyVel ** 2);
  const pressFactor = Math.pow(press / 101.3, 0.35);
  const ugBonus = (grav < 0.05 && flow >= 2.0 && flow <= 22.0) ? -1.5 : 0.0;
  const effLoi = (props.loi + Math.log10(thick + 1.0) * 2.0 + ugBonus) / pressFactor;

  let regime = "STABLE_FLAME";
  if (o2 < effLoi - 1.2) {
    regime = "NO_IGNITION";
  } else if (grav < 0.05 && flow < 1.0 && o2 < effLoi + 4.5) {
    regime = "SELF_EXTINCTION";
  } else if (grav < 0.05 && flow >= 1.0 && flow <= 4.5 && o2 >= effLoi - 1.2 && o2 <= effLoi + 2.2) {
    regime = "COOL_FLAME";
  } else if (flow > 42.0 && o2 < effLoi + 7.0) {
    regime = "BLOW_OFF";
  }

  const dirMult = flowDir === "CONCURRENT" ? 1.3 : (flowDir === "OPPOSED" ? 0.78 : 0.2);
  const flowMult = effFlow > 0 ? Math.pow(Math.min(effFlow, 35.0) / 10.0, 0.55) : 0.1;

  let vf = 0.0;
  let tempK = 340.0;
  if (regime === "STABLE_FLAME") {
    vf = props.base_vf * Math.pow(Math.max(0.1, (o2 - effLoi + 2.5) / 10.0), 1.35) * dirMult * flowMult * (1.5 / (Math.pow(thick, 0.6) + 0.4)) * pressFactor;
    tempK = 1450.0 + (o2 - 18.0) * 22.0 + Math.min(effFlow, 25.0) * 5.0;
  } else if (regime === "COOL_FLAME") {
    vf = 0.14 * (o2 / 21.0);
    tempK = 605.0;
  } else {
    vf = 0.0;
    tempK = regime === "NO_IGNITION" ? 340.0 : 510.0;
  }

  const tig = Math.max(1.0, (thick * props.rho * 4.5) / (Math.pow(o2 / 21.0, 1.25) * pressFactor));
  const hrrW = ["NO_IGNITION", "BLOW_OFF"].includes(regime) ? 0.0 : Number(Math.max(15.0, vf * 50.0 * Math.min(thick, 2.5) * props.rho * props.hc * 0.42).toFixed(1));
  const fri = regime === "NO_IGNITION" ? 12 : (["SELF_EXTINCTION", "BLOW_OFF"].includes(regime) ? 24 : Math.min(100, Math.round(25 + vf * 18 + hrrW / 45 + (o2 - 21) * 1.4)));
  const safeDist = hrrW === 0 ? 20 : Math.round(35 + Math.sqrt(hrrW) * 4.2);

  const coPpm = regime === "NO_IGNITION" ? 15 : Math.round((regime === "COOL_FLAME" ? 380 : 210) * (grav < 0.05 ? 1.35 : 1.0) * (24 / Math.max(15, o2)));
  const sootRate = ["NO_IGNITION", "COOL_FLAME"].includes(regime) ? 0.5 : Number((15.0 * (grav < 0.05 ? 1.3 : 1.0)).toFixed(1));
  const opacity = Number((sootRate * 1.75).toFixed(1));

  const dp = ["COOL_FLAME", "NO_IGNITION"].includes(regime) ? 0.32 : (grav < 0.05 ? 0.85 : 0.28);
  const sensor = regime === "COOL_FLAME" ? "GAS_CO_IR" : (dp >= 0.45 ? "PHOTOELECTRIC_LASER" : "IONIZATION");
  const tdet = Number((tig + 18.0 / Math.max(2.0, effFlow)).toFixed(1));

  let mitigation = "1. Shut off HVAC ventilation immediately (U_v -> 0 cm/s); 2. Deploy Fine Water Mist / CO2 PFE; 3. Crew don PBA breathing masks & scrub cabin CO.";
  if (regime === "COOL_FLAME") {
    mitigation = "1. Cool Flame hazard (~605 K invisible): Do NOT increase O2 or airflow (risk of hot re-ignition); 2. Isolate power & monitor with IR camera.";
  } else if (["NO_IGNITION", "SELF_EXTINCTION"].includes(regime)) {
    mitigation = "1. Keep HVAC ventilation off to maintain diffusive oxygen starvation; 2. Monitor surface cool-down with thermal IR.";
  }

  return {
    out_flame_spread_rate_mm_s: Number(vf.toFixed(3)),
    out_combustion_regime: regime,
    out_flame_temperature_k: Math.round(tempK),
    out_ignition_time_s: Number(tig.toFixed(1)),
    out_hrr_watts: hrrW,
    out_hrr_kilowatts: Number((hrrW / 1000).toFixed(4)),
    out_fri_risk_index: fri,
    out_safe_isolation_dist_mm: safeDist,
    out_co_concentration_ppm: coPpm,
    out_soot_generation_rate_mg_g: sootRate,
    out_smoke_opacity_pct_m: opacity,
    out_acid_gas_hcl_ppm: props.hcl,
    out_acid_gas_hf_ppm: props.hf,
    out_acid_gas_hcn_ppm: props.hcn,
    out_mean_particle_diameter_um: dp,
    out_optimal_sensor_type: sensor,
    out_estimated_detection_time_s: tdet,
    out_recommended_mitigation: mitigation
  };
}

function isOutsideBounds(inp, matRows) {
  if (!matRows || matRows.length === 0) return true;
  const cols = ["in_o2_molar_fraction_pct", "in_ventilation_flow_cm_s", "in_material_thickness_mm", "in_cabin_pressure_kpa"];
  for (const c of cols) {
    const vals = matRows.map(r => r[c]).filter(v => v !== null && v !== undefined);
    if (vals.length === 0) continue;
    const v = Number(inp[c]);
    if (v < Math.min(...vals) || v > Math.max(...vals)) return true;
  }
  return false;
}

export function predictLocal(inputs, datasetSummary, skip1g = false) {
  const rows = datasetSummary.rows || [];
  const matId = String(inputs.material_id || "cotton").toLowerCase();
  const flowDir = normalizeFlowDir(inputs.in_flow_direction);

  const matRows = rows.filter(r => r.material_id === matId);
  const dirRows = matRows.filter(r => r.in_flow_direction === flowDir);
  const candidateRows = dirRows.length >= 3 ? dirRows : matRows;

  const scored = candidateRows.map(r => [computeFeatureDistance(inputs, r), r]).sort((a, b) => a[0] - b[0]);
  const extrapolatedFlag = isOutsideBounds(inputs, matRows);
  const heur = computeHeuristicOutputs(inputs);
  const usePureHeuristic = matId === "custom" || matRows.length < 2;

  const nearest3 = scored.slice(0, 3).map(([dist, r]) => ({
    record_id: r.record_id,
    document_id: r.document_id,
    material_id: r.material_id,
    distance: Number(dist.toFixed(4)),
    in_o2_molar_fraction_pct: r.in_o2_molar_fraction_pct,
    in_ventilation_flow_cm_s: r.in_ventilation_flow_cm_s,
    in_material_thickness_mm: r.in_material_thickness_mm,
    in_cabin_pressure_kpa: r.in_cabin_pressure_kpa,
    in_flow_direction: r.in_flow_direction,
    in_gravity_level_g: r.in_gravity_level_g,
    out_flame_spread_rate_mm_s: r.out_flame_spread_rate_mm_s,
    out_combustion_regime: r.out_combustion_regime,
    out_fri_risk_index: r.out_fri_risk_index,
    out_hrr_watts: r.out_hrr_watts
  }));

  function predictNum(col, unit, dec = 2) {
    const valid = scored.filter(([, r]) => r[col] !== null && r[col] !== undefined);
    if (usePureHeuristic || valid.length === 0) {
      const hv = heur[col];
      return {
        value: hv !== null && hv !== undefined ? Number(Number(hv).toFixed(dec)) : null,
        unit,
        source: "heuristic",
        confidence: "low",
        records_used: []
      };
    }
    if (valid[0][0] < 0.025) {
      const r0 = valid[0][1];
      return {
        value: Number(Number(r0[col]).toFixed(dec)),
        unit,
        source: "experimental",
        confidence: "high",
        records_used: [{ record_id: r0.record_id, document_id: r0.document_id }]
      };
    }
    const kSlice = valid.slice(0, Math.min(4, valid.length));
    const weights = kSlice.map(([d]) => 1.0 / Math.pow(d + 1e-4, 2));
    const wSum = weights.reduce((a, b) => a + b, 0);
    const interpVal = kSlice.reduce((acc, [, r], idx) => acc + weights[idx] * Number(r[col]), 0) / wSum;

    const minD = kSlice[0][0];
    const regimesInK = new Set(kSlice.map(([, r]) => r.out_combustion_regime).filter(Boolean));
    let conf = "medium";
    if (extrapolatedFlag || minD > 0.55 || valid.length < 2) conf = "low";
    else if (minD < 0.25 && regimesInK.size <= 1 && valid.length >= 3) conf = "high";

    return {
      value: Number(interpVal.toFixed(dec)),
      unit,
      source: extrapolatedFlag ? "extrapolated" : "interpolated",
      confidence: conf,
      records_used: kSlice.map(([, r]) => ({ record_id: r.record_id, document_id: r.document_id }))
    };
  }

  function predictCat(col, unit = "") {
    const valid = scored.filter(([, r]) => r[col] !== null && r[col] !== undefined && r[col] !== "");
    if (usePureHeuristic || valid.length === 0) {
      return { value: heur[col], unit, source: "heuristic", confidence: "low", records_used: [] };
    }
    if (valid[0][0] < 0.025) {
      const r0 = valid[0][1];
      return {
        value: r0[col],
        unit,
        source: "experimental",
        confidence: "high",
        records_used: [{ record_id: r0.record_id, document_id: r0.document_id }]
      };
    }
    const kSlice = valid.slice(0, Math.min(3, valid.length));
    const votes = {};
    kSlice.forEach(([d, r]) => {
      const v = String(r[col]);
      votes[v] = (votes[v] || 0) + 1.0 / (d + 0.05);
    });
    const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
    const minD = kSlice[0][0];
    const conf = (extrapolatedFlag || minD > 0.55) ? "low" : (minD < 0.25 && Object.keys(votes).length === 1 ? "high" : "medium");
    return {
      value: winner,
      unit,
      source: extrapolatedFlag ? "extrapolated" : "interpolated",
      confidence: conf,
      records_used: kSlice.map(([, r]) => ({ record_id: r.record_id, document_id: r.document_id }))
    };
  }

  const outputs = {
    out_flame_spread_rate_mm_s: predictNum("out_flame_spread_rate_mm_s", "mm/s", 2),
    out_combustion_regime: predictCat("out_combustion_regime", "enum"),
    out_flame_temperature_k: predictNum("out_flame_temperature_k", "K", 0),
    out_ignition_time_s: predictNum("out_ignition_time_s", "s", 1),
    out_hrr_watts: predictNum("out_hrr_watts", "W", 1),
    out_hrr_kilowatts: predictNum("out_hrr_kilowatts", "kW", 3),
    out_fri_risk_index: predictNum("out_fri_risk_index", "0-100", 0),
    out_spread_rate_1g_ref_mm_s: predictNum("out_spread_rate_1g_ref_mm_s", "mm/s", 2),
    out_safe_isolation_dist_mm: predictNum("out_safe_isolation_dist_mm", "mm", 0),
    out_co_concentration_ppm: predictNum("out_co_concentration_ppm", "ppm", 0),
    out_soot_generation_rate_mg_g: predictNum("out_soot_generation_rate_mg_g", "mg/g", 1),
    out_smoke_opacity_pct_m: predictNum("out_smoke_opacity_pct_m", "%/m", 1),
    out_acid_gas_hcl_ppm: predictNum("out_acid_gas_hcl_ppm", "ppm", 1),
    out_acid_gas_hf_ppm: predictNum("out_acid_gas_hf_ppm", "ppm", 1),
    out_acid_gas_hcn_ppm: predictNum("out_acid_gas_hcn_ppm", "ppm", 1),
    out_mean_particle_diameter_um: predictNum("out_mean_particle_diameter_um", "µm", 2),
    out_optimal_sensor_type: predictCat("out_optimal_sensor_type", "sensor"),
    out_estimated_detection_time_s: predictNum("out_estimated_detection_time_s", "s", 1),
    out_recommended_mitigation: predictCat("out_recommended_mitigation", "text")
  };

  let comparison1g = null;
  if (!skip1g) {
    const heur1g = computeHeuristicOutputs({ ...inputs, in_gravity_level_g: 1.0 });
    const vfUg = outputs.out_flame_spread_rate_mm_s.value || 0.0;
    const ref1g = outputs.out_spread_rate_1g_ref_mm_s;
    let vf1g = heur1g.out_flame_spread_rate_mm_s;
    if (ref1g.value !== null && ref1g.source !== "heuristic") {
      vf1g = Number(ref1g.value);
    } else {
      outputs.out_spread_rate_1g_ref_mm_s = {
        value: Number(vf1g.toFixed(2)),
        unit: "mm/s",
        source: "heuristic",
        confidence: "medium",
        records_used: []
      };
    }
    const friUg = outputs.out_fri_risk_index.value || 0;
    const fri1g = Math.min(100, Math.round(22 + vf1g * 16 + heur1g.out_hrr_watts / 50));
    const regime1g = vf1g > 0.05 ? "STABLE_FLAME" : "NO_IGNITION";

    let verdictCode = "EQUIVALENT_RISK";
    if (vfUg > vf1g * 1.12 || (vfUg > 0 && vf1g === 0)) verdictCode = "HIGHER_RISK_IN_UG";
    else if (vfUg < vf1g * 0.88) verdictCode = "LOWER_RISK_IN_UG";

    outputs.out_verdict_1g_vs_ug = {
      value: verdictCode,
      unit: "verdict",
      source: outputs.out_flame_spread_rate_mm_s.source,
      confidence: outputs.out_flame_spread_rate_mm_s.confidence,
      records_used: outputs.out_flame_spread_rate_mm_s.records_used
    };

    comparison1g = {
      ug: { spread_rate_mm_s: vfUg, regime: outputs.out_combustion_regime.value, fri: friUg },
      earth_1g: { spread_rate_mm_s: Number(vf1g.toFixed(2)), regime: regime1g, fri: fri1g },
      verdict_code: verdictCode
    };
  }

  return {
    inputs,
    is_sample_data: datasetSummary.is_sample_data,
    outputs,
    comparison_1g_vs_ug: comparison1g,
    nearest_experiments: nearest3,
    material_experimental_points: matRows
      .filter(r => r.in_o2_molar_fraction_pct !== null && r.in_ventilation_flow_cm_s !== null)
      .map(r => ({
        record_id: r.record_id,
        document_id: r.document_id,
        o2: r.in_o2_molar_fraction_pct,
        flow: r.in_ventilation_flow_cm_s,
        regime: r.out_combustion_regime,
        spread_rate: r.out_flame_spread_rate_mm_s
      }))
  };
}
