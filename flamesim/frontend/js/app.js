// ============================================================================
// FlameSim: Main Application Controller (app.js)
// Handles:
// - 300 ms debounced simulation updates (POST /api/simulate + client fallback)
// - Full EN / ES language toggle via centralized I18N dictionary
// - Interactive Flammability Map (O2 vs Flow + experimental points + marker)
// - Parameter Sweep 1D chart canvas
// - Data Page (CSV upload to POST /api/dataset, searchable table, warnings)
// - Compare Mode (up to 3 scenarios persisted in localStorage)
// - Generated PDF Report download + JSON / CSV exports
// ============================================================================

import { I18N } from "./i18n.js";
import { SEEDED_SAMPLE_CSV, parseCsvDataset } from "./dataset-parser.js";
import { predictLocal } from "./predictor-client.js";
import { FlameCanvasRenderer } from "./canvas-renderer.js";
import { EngineeringChartsSuite } from "./charts-four.js";

const API_BASE = window.FLAMESIM_API_BASE || "http://localhost:8000";
const COMPARE_STORAGE_KEY = "flamesim_compare_scenarios_v1";

let currentLang = "en";
let datasetSummary = parseCsvDataset(SEEDED_SAMPLE_CSV, true);
let currentCsvRaw = SEEDED_SAMPLE_CSV;
let lastPrediction = null;
let debounceTimer = null;
let flameRenderer = null;
let chartsSuite = null;
let activeSelectedRecordId = null;
let activeMatchPct = 100;
let forceLocalEngine = false;

const uiInputs = {
  material_id: "pmma",
  in_o2_molar_fraction_pct: 21.0,
  in_ventilation_flow_cm_s: 12.0,
  in_material_thickness_mm: 1.5,
  in_cabin_pressure_kpa: 101.3,
  in_flow_direction: "CONCURRENT",
  in_gravity_level_g: 0.0
};

const REGIME_STYLES = {
  NO_IGNITION:     { bg: "bg-slate-600/20 text-slate-300 border-slate-500/40", dot: "#94a3b8" },
  SELF_EXTINCTION: { bg: "bg-slate-500/20 text-slate-200 border-slate-400/40", dot: "#cbd5e1" },
  COOL_FLAME:      { bg: "bg-sky-500/20 text-sky-300 border-sky-400/50",       dot: "#38bdf8" },
  STABLE_FLAME:    { bg: "bg-orange-500/20 text-orange-300 border-orange-500/50", dot: "#f97316" },
  BLOW_OFF:        { bg: "bg-purple-500/20 text-purple-300 border-purple-400/50", dot: "#c084fc" }
};

const SOURCE_BADGE_STYLES = {
  experimental: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  interpolated: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
  extrapolated: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  heuristic:    "bg-rose-500/20 text-rose-300 border-rose-500/40"
};

async function initFlameSim() {
  flameRenderer = new FlameCanvasRenderer("flameCanvas");
  flameRenderer.start();
  chartsSuite = new EngineeringChartsSuite();
  chartsSuite.initEvents();

  bindRangeAndNumber("rng-o2", "num-o2", "in_o2_molar_fraction_pct");
  bindRangeAndNumber("rng-flow", "num-flow", "in_ventilation_flow_cm_s");
  bindRangeAndNumber("rng-thick", "num-thick", "in_material_thickness_mm");
  bindRangeAndNumber("rng-press", "num-press", "in_cabin_pressure_kpa");

  const selMat = document.getElementById("sel-material");
  selMat.addEventListener("change", (e) => {
    uiInputs.material_id = e.target.value;
    scheduleSimulation();
  });

  const numGrav = document.getElementById("num-grav");
  numGrav.addEventListener("input", (e) => {
    uiInputs.in_gravity_level_g = Math.max(0, Math.min(2, Number(e.target.value || 0)));
    scheduleSimulation();
  });

  // Try syncing dataset from FastAPI backend if running
  try {
    const res = await fetch(`${API_BASE}/api/dataset`);
    if (res.ok) {
      datasetSummary = await res.json();
      syncMaterialOptions();
      setEngineBadge(true);
    }
  } catch {
    setEngineBadge(false);
  }

  syncMaterialOptions();
  document.getElementById("nav-row-count").textContent = datasetSummary.row_count;
  applyLanguage();
  updateCompareCountBadge();
  renderDataPageWarnings();
  renderDataPageTable();
  await executeSimulationImmediate();
}

function setEngineBadge(online) {
  const el = document.getElementById("badge-api-mode");
  if (!el) return;
  if (online) {
    el.className = "text-[10px] font-mono px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
    el.textContent = datasetSummary.dataset_source === "supabase" ? "SUPABASE: CONNECTED" : "FASTAPI: CONNECTED";
  } else {
    el.className = "text-[10px] font-mono px-2 py-1 rounded border border-cyan-500/40 bg-cyan-500/15 text-cyan-300";
    el.textContent = "ENGINE: CLIENT k-NN";
  }
}

function syncMaterialOptions() {
  const select = document.getElementById("sel-material");
  if (!select) return;
  for (const option of [...select.options]) {
    if (option.dataset.dynamicMaterial) option.remove();
  }
  const counts = new Map();
  for (const row of datasetSummary.rows || []) {
    if (row.material_id) counts.set(row.material_id, (counts.get(row.material_id) || 0) + 1);
  }
  for (const option of [...select.options]) {
    if (option.value === "custom") continue;
    const label = option.value.replaceAll("_", " ").toUpperCase();
    option.textContent = `${label} (${counts.get(option.value) || 0} rows)`;
  }
  for (const [id, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
    if ([...select.options].some(option => option.value === id)) continue;
    const option = new Option(`${id.replaceAll("_", " ").toUpperCase()} (${count} rows)`, id);
    option.dataset.dynamicMaterial = "true";
    select.add(option);
  }
  select.value = uiInputs.material_id;
}

function bindRangeAndNumber(rngId, numId, stateKey) {
  const rng = document.getElementById(rngId);
  const num = document.getElementById(numId);
  rng.addEventListener("input", () => {
    num.value = rng.value;
    uiInputs[stateKey] = Number(rng.value);
    scheduleSimulation();
  });
  num.addEventListener("input", () => {
    rng.value = num.value;
    uiInputs[stateKey] = Number(num.value);
    scheduleSimulation();
  });
}

function scheduleSimulation() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    executeSimulationImmediate();
  }, 300);
}

async function executeSimulationImmediate() {
  let pred = null;
  if (forceLocalEngine) setEngineBadge(false);
  try {
    const res = forceLocalEngine ? null : await fetch(`${API_BASE}/api/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(uiInputs)
    });
    if (res?.ok) {
      pred = await res.json();
      setEngineBadge(true);
    }
  } catch {
    setEngineBadge(false);
  }

  if (!pred) {
    pred = predictLocal(uiInputs, datasetSummary);
  }
  lastPrediction = pred;
  renderDashboardOutputs(pred);
}

// ============================================================================
// RENDER DASHBOARD OUTPUTS & TRANSPARENCY BADGES
// ============================================================================

function formatMetaBadge(outObj) {
  if (!outObj) return "";
  const t = I18N[currentLang];
  const srcLabel = t.sources[outObj.source] || outObj.source;
  const confLabel = t.confidence[outObj.confidence] || outObj.confidence;
  const cls = SOURCE_BADGE_STYLES[outObj.source] || SOURCE_BADGE_STYLES.heuristic;
  const recs = (outObj.records_used || []).map(r => `${r.record_id} (${r.document_id})`).join(", ");
  const tip = recs ? `Used: ${recs}` : "Physics heuristic correlation";
  return `<span title="${tip}" class="px-1.5 py-0.5 rounded border text-[9px] font-mono cursor-help ${cls}">${srcLabel} · ${confLabel}</span>`;
}

function renderDashboardOutputs(pred) {
  const t = I18N[currentLang];
  const out = pred.outputs;

  // Sample banner visibility
  const sampleBanner = document.getElementById("sample-warning-banner");
  if (sampleBanner) {
    sampleBanner.classList.toggle("hidden", !pred.is_sample_data);
  }

  // Update Executive Telemetry Summary Ribbon
  const ppO2 = ((uiInputs.in_o2_molar_fraction_pct / 100) * uiInputs.in_cabin_pressure_kpa);
  const ppO2Psi = ppO2 * 0.145038;
  const elExecPpo2 = document.getElementById("exec-ppo2");
  if (elExecPpo2) {
    elExecPpo2.textContent = `${ppO2.toFixed(1)} kPa`;
    document.getElementById("exec-ppo2-psi").textContent = `(${ppO2Psi.toFixed(2)} psia)`;
    const th = uiInputs.in_material_thickness_mm;
    document.getElementById("exec-biot").textContent = th <= 0.8 ? "Thermally Thin (Bi < 0.1)" : (th >= 3.5 ? "Thermally Thick Slab" : "Intermediate Slab");
    document.getElementById("exec-regime").textContent = out.out_combustion_regime.value || "STABLE_FLAME";
    document.getElementById("exec-vf").textContent = `${(out.out_flame_spread_rate_mm_s.value ?? 0).toFixed(2)} mm/s`;
    document.getElementById("exec-fri").textContent = `${Math.round(out.out_fri_risk_index.value || 0)} / 100`;
    document.getElementById("exec-co").textContent = `${out.out_co_concentration_ppm.value ?? 0} ppm`;
    document.getElementById("exec-alarm").textContent = `${out.out_optimal_sensor_type.value || "LASER"} · ${out.out_estimated_detection_time_s.value ?? "—"} s`;
  }

  // Update 2D Animated Flame Canvas
  const regKey = out.out_combustion_regime.value || "STABLE_FLAME";
  const mappedCanvasRegime = regKey === "NO_IGNITION" ? "NO_IGNITION"
    : (regKey === "SELF_EXTINCTION" ? "QUENCHING"
    : (regKey === "BLOW_OFF" ? "BLOWOFF"
    : (regKey === "COOL_FLAME" ? "QUENCHING" : "STEADY")));

  flameRenderer.updateState({
    o2: uiInputs.in_o2_molar_fraction_pct,
    flow: uiInputs.in_ventilation_flow_cm_s,
    thick: uiInputs.in_material_thickness_mm,
    flowDir: uiInputs.in_flow_direction.toLowerCase(),
    gravity: uiInputs.in_gravity_level_g < 0.05 ? "ug" : (uiInputs.in_gravity_level_g < 0.25 ? "moon" : (uiInputs.in_gravity_level_g < 0.6 ? "mars" : "earth")),
    regime: mappedCanvasRegime,
    flameLengthMm: Math.min(140, Math.max(12, (out.out_flame_spread_rate_mm_s.value || 0.2) * 28))
  });

  document.getElementById("hud-flame-shape-label").textContent =
    uiInputs.in_gravity_level_g < 0.05
      ? (uiInputs.in_ventilation_flow_cm_s < 1.5 ? "Spherical µg Diffusion" : `Advective µg (${regKey})`)
      : `Buoyant Plume (${uiInputs.in_gravity_level_g}g)`;

  // Block 1: Flame Dynamics
  const vfVal = out.out_flame_spread_rate_mm_s.value;
  document.getElementById("val-out-vf").textContent = vfVal !== null ? vfVal.toFixed(2) : "—";
  document.getElementById("badge-meta-vf").innerHTML = formatMetaBadge(out.out_flame_spread_rate_mm_s);
  const vfRecs = (out.out_flame_spread_rate_mm_s.records_used || []).map(r => r.record_id).join(", ");
  document.getElementById("sub-vf-records").textContent = vfRecs ? `Refs: ${vfRecs}` : "Heuristic model";

  const regInfo = t.regimes[regKey] || t.regimes.STABLE_FLAME;
  const regStyle = REGIME_STYLES[regKey] || REGIME_STYLES.STABLE_FLAME;
  const regPill = document.getElementById("badge-regime-pill");
  regPill.className = `inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border ${regStyle.bg}`;
  regPill.innerHTML = `<span class="w-2 h-2 rounded-full" style="background:${regStyle.dot}"></span> ${regInfo.label}`;
  document.getElementById("val-regime-desc").textContent = regInfo.desc;
  document.getElementById("badge-meta-regime").innerHTML = formatMetaBadge(out.out_combustion_regime);

  document.getElementById("val-out-temp").textContent = out.out_flame_temperature_k.value ?? "—";
  document.getElementById("badge-meta-temp").innerHTML = formatMetaBadge(out.out_flame_temperature_k);

  document.getElementById("val-out-tig").textContent = out.out_ignition_time_s.value ?? "—";
  document.getElementById("badge-meta-tig").innerHTML = formatMetaBadge(out.out_ignition_time_s);

  const hrrW = out.out_hrr_watts.value || 0;
  const hrrKw = out.out_hrr_kilowatts.value || (hrrW / 1000);
  document.getElementById("val-out-hrr").textContent = hrrW >= 1000 ? `${hrrKw.toFixed(2)} kW` : `${hrrW.toFixed(0)} W`;
  document.getElementById("val-out-hrr-sub").textContent = `${hrrW.toFixed(0)} W · ${hrrKw.toFixed(3)} kW`;
  document.getElementById("badge-meta-hrr").innerHTML = formatMetaBadge(out.out_hrr_watts);

  drawFlammabilityMap(pred.material_experimental_points || [], uiInputs, regKey);

  // Block 2: Risk & Regulatory Assessment
  const fri = Math.round(out.out_fri_risk_index.value || 0);
  document.getElementById("val-out-fri").textContent = fri;
  document.getElementById("badge-meta-fri").innerHTML = formatMetaBadge(out.out_fri_risk_index);

  const arc = document.getElementById("svg-fri-arc");
  const circumference = 251.2;
  arc.style.strokeDashoffset = String(circumference - (fri / 100) * circumference);

  const friBadge = document.getElementById("badge-fri-level");
  if (fri < 30) {
    arc.setAttribute("stroke", "#10b981");
    friBadge.className = "text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300";
    friBadge.textContent = "LOW RISK (PASS)";
  } else if (fri <= 55) {
    arc.setAttribute("stroke", "#eab308");
    friBadge.className = "text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300";
    friBadge.textContent = "MODERATE RISK";
  } else if (fri <= 75) {
    arc.setAttribute("stroke", "#f97316");
    friBadge.className = "text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-orange-500/20 text-orange-300";
    friBadge.textContent = "ELEVATED RISK";
  } else {
    arc.setAttribute("stroke", "#f43f5e");
    friBadge.className = "text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300";
    friBadge.textContent = "CRITICAL RISK (FAIL)";
  }

  document.getElementById("val-out-safedist").textContent = out.out_safe_isolation_dist_mm.value ?? "—";
  document.getElementById("badge-meta-safedist").innerHTML = formatMetaBadge(out.out_safe_isolation_dist_mm);

  const cmp = pred.comparison_1g_vs_ug;
  if (cmp) {
    const vCode = cmp.verdict_code;
    const vBanner = document.getElementById("box-verdict-banner");
    vBanner.textContent = t.verdicts[vCode] || vCode;
    vBanner.className = vCode === "HIGHER_RISK_IN_UG"
      ? "px-3 py-2 rounded-lg border border-rose-500/40 bg-rose-500/15 text-rose-300 text-xs font-mono font-bold"
      : (vCode === "LOWER_RISK_IN_UG"
        ? "px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 text-xs font-mono font-bold"
        : "px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-300 text-xs font-mono font-bold");

    document.getElementById("badge-meta-verdict").innerHTML = formatMetaBadge(out.out_verdict_1g_vs_ug);
    document.getElementById("cmp-ug-vf").textContent = `${cmp.ug.spread_rate_mm_s} mm/s`;
    document.getElementById("cmp-ug-regime").textContent = cmp.ug.regime;
    document.getElementById("cmp-ug-fri").textContent = `${cmp.ug.fri} / 100`;

    document.getElementById("cmp-1g-vf").textContent = `${cmp.earth_1g.spread_rate_mm_s} mm/s`;
    document.getElementById("cmp-1g-regime").textContent = cmp.earth_1g.regime;
    document.getElementById("cmp-1g-fri").textContent = `${cmp.earth_1g.fri} / 100`;
  }

  // Block 3: Cabin Emissions & Toxicity
  const coVal = out.out_co_concentration_ppm.value;
  document.getElementById("val-out-co").textContent = coVal !== null ? `${coVal} ppm` : t.cards.noData;
  document.getElementById("badge-meta-co").innerHTML = formatMetaBadge(out.out_co_concentration_ppm);
  document.getElementById("bar-co-gauge").style.width = `${Math.min(100, ((coVal || 0) / 450) * 100)}%`;

  document.getElementById("val-out-soot").textContent = out.out_soot_generation_rate_mg_g.value ?? t.cards.noData;
  document.getElementById("badge-meta-soot").innerHTML = formatMetaBadge(out.out_soot_generation_rate_mg_g);

  document.getElementById("val-out-opacity").textContent = out.out_smoke_opacity_pct_m.value ?? t.cards.noData;
  document.getElementById("badge-meta-opacity").innerHTML = formatMetaBadge(out.out_smoke_opacity_pct_m);

  renderAcidGasCell("hcl", out.out_acid_gas_hcl_ppm, 5.0, t.cards.noData);
  renderAcidGasCell("hf", out.out_acid_gas_hf_ppm, 2.5, t.cards.noData);
  renderAcidGasCell("hcn", out.out_acid_gas_hcn_ppm, 8.0, t.cards.noData);

  const hclV = out.out_acid_gas_hcl_ppm.value || 0;
  const hfV = out.out_acid_gas_hf_ppm.value || 0;
  const hcnV = out.out_acid_gas_hcn_ppm.value || 0;
  const crewBox = document.getElementById("box-crew-impact");
  if ((coVal || 0) > 55 || hclV > 5 || hfV > 2.5 || hcnV > 8) {
    crewBox.className = "px-3 py-2 rounded-lg border border-rose-500/50 bg-rose-500/15 text-rose-300 text-xs font-mono font-bold";
    crewBox.textContent = t.cards.crewImpact.CRITICAL;
  } else if ((coVal || 0) > 15 || hclV > 1 || hfV > 0.5 || hcnV > 2) {
    crewBox.className = "px-3 py-2 rounded-lg border border-amber-500/50 bg-amber-500/15 text-amber-300 text-xs font-mono font-bold";
    crewBox.textContent = t.cards.crewImpact.CAUTION;
  } else {
    crewBox.className = "px-3 py-2 rounded-lg border border-emerald-500/50 bg-emerald-500/15 text-emerald-300 text-xs font-mono font-bold";
    crewBox.textContent = t.cards.crewImpact.OK;
  }

  // Block 4: Sensing & Extinguishing Protocol
  const dpVal = out.out_mean_particle_diameter_um.value;
  document.getElementById("val-out-dp").textContent = dpVal !== null ? dpVal.toFixed(2) : t.cards.noData;
  document.getElementById("badge-meta-dp").innerHTML = formatMetaBadge(out.out_mean_particle_diameter_um);

  const sensorType = out.out_optimal_sensor_type.value || "PHOTOELECTRIC_LASER";
  const tdetVal = out.out_estimated_detection_time_s.value || 12.0;
  document.getElementById("val-out-sensor").textContent = sensorType;
  document.getElementById("val-out-tdet").textContent = `${tdetVal} s`;
  document.getElementById("badge-meta-sensor").innerHTML = formatMetaBadge(out.out_optimal_sensor_type);

  renderSensorComparisonTable(sensorType, tdetVal);

  const mitStr = out.out_recommended_mitigation.value || "";
  document.getElementById("badge-meta-mitigation").innerHTML = formatMetaBadge(out.out_recommended_mitigation);
  const steps = mitStr.split(/;|\n/).map(s => s.trim()).filter(Boolean);
  document.getElementById("list-mitigation-checklist").innerHTML = steps
    .map(s => `<label class="flex items-start gap-2 cursor-pointer"><input type="checkbox" checked class="mt-0.5 accent-cyan-400" /><span>${s}</span></label>`)
    .join("");

  // Nearest 3 Experiments Panel (Interactive Click-to-Select with Similarity % Badge)
  const nearEl = document.getElementById("nearest-experiments-list");
  if ((pred.nearest_experiments || []).length === 0) {
    nearEl.innerHTML = `<div class="text-slate-500">No experimental rows for this material (using heuristic fallback).</div>`;
  } else {
    nearEl.innerHTML = pred.nearest_experiments
      .map((n, idx) => {
        const simPct = Math.max(5, Math.min(100, Math.round(100 * Math.exp(-1.25 * n.distance))));
        const isSelected = activeSelectedRecordId === n.record_id;
        const borderCls = isSelected
          ? "border-emerald-400 bg-emerald-950/40 shadow-lg shadow-emerald-500/10"
          : "border-slate-800 bg-slate-950/90 hover:border-cyan-400";
        return `
          <div onclick="window.selectMatchedExperiment('${n.record_id}', ${simPct})"
               class="p-2.5 rounded-xl border ${borderCls} flex flex-col gap-1 cursor-pointer transition group">
            <div class="flex justify-between items-center">
              <div class="flex items-center gap-1.5">
                <span class="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-bold">#${idx + 1}</span>
                <span class="font-bold text-amber-300 group-hover:text-white transition">${n.record_id}</span>
              </div>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${simPct >= 85 ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" : "bg-cyan-500/20 text-cyan-300"}">
                ${simPct}% Match
              </span>
            </div>
            <div class="text-[10px] text-slate-400">
              Doc: ${n.document_id} · O₂: ${n.in_o2_molar_fraction_pct}% · Flow: ${n.in_ventilation_flow_cm_s} cm/s
            </div>
            <div class="flex justify-between items-center text-[10px] text-slate-300 pt-0.5 border-t border-slate-800/80">
              <span>V_f: <strong>${n.out_flame_spread_rate_mm_s ?? "N/A"} mm/s</strong> · ${n.out_combustion_regime ?? "N/A"}</span>
              <span class="text-cyan-400 font-bold group-hover:translate-x-0.5 transition">Inspect DB →</span>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // Update Active Selected NASA DB Record Banner if an experiment is locked
  renderSelectedExperimentBanner();

  // Update the 4 Winner Engineering Charts Suite
  if (chartsSuite) {
    chartsSuite.updateData(pred, uiInputs, datasetSummary.rows || [], currentLang);
  }
}

function renderAcidGasCell(idSuffix, outObj, smacLimit, noDataText) {
  const valEl = document.getElementById(`val-out-${idSuffix}`);
  const badgeEl = document.getElementById(`badge-meta-${idSuffix}`);
  badgeEl.innerHTML = formatMetaBadge(outObj);
  if (!outObj || outObj.value === null || outObj.value === undefined) {
    valEl.textContent = noDataText;
    valEl.className = "text-sm font-mono font-bold my-1 text-slate-500 italic";
  } else {
    valEl.textContent = `${outObj.value} ppm`;
    valEl.className = outObj.value > smacLimit
      ? "text-sm font-mono font-bold my-1 text-rose-400"
      : "text-sm font-mono font-bold my-1 text-emerald-400";
  }
}

function renderSensorComparisonTable(optimalSensor, baseTimeS) {
  const rows = [
    { type: "PHOTOELECTRIC_LASER (ISS)", target: "Agglomerated soot > 0.5 µm", time: optimalSensor === "PHOTOELECTRIC_LASER" ? baseTimeS : Number((baseTimeS * 1.35).toFixed(1)) },
    { type: "IONIZATION (Shuttle)", target: "Ultrafine particulates < 0.3 µm", time: optimalSensor === "IONIZATION" ? baseTimeS : Number((baseTimeS * 1.45).toFixed(1)) },
    { type: "GAS_CO_IR (Quantum Cascade)", target: "Cool Flame / Smolder CO gas", time: optimalSensor === "GAS_CO_IR" ? baseTimeS : Number((baseTimeS * 1.15).toFixed(1)) }
  ];
  document.getElementById("tbody-sensor-comparison").innerHTML = rows
    .map(r => {
      const isOpt = r.type.startsWith(optimalSensor);
      return `
        <tr class="${isOpt ? "text-cyan-300 font-bold" : "text-slate-400"}">
          <td class="py-1">${isOpt ? "★ " : ""}${r.type}</td>
          <td class="py-1">${r.target}</td>
          <td class="py-1 text-right">${r.time} s</td>
        </tr>
      `;
    })
    .join("");
}

// ============================================================================
// FLAMMABILITY MAP CANVAS (O2 x vs FLOW VELOCITY y + EXPERIMENTAL POINTS)
// ============================================================================

function drawFlammabilityMap(expPoints, currentInputs, currentRegime) {
  const canvas = document.getElementById("flammabilityMapCanvas");
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

  const w = rect.width;
  const h = rect.height;
  const padL = 38, padR = 14, padT = 10, padB = 24;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  ctx.clearRect(0, 0, w, h);

  const xToPx = (o2) => padL + ((o2 - 15) / 35) * plotW;
  const yToPx = (fl) => padT + plotH - (fl / 50) * plotH;

  // Background regime zones
  ctx.fillStyle = "rgba(148, 163, 184, 0.08)";
  ctx.fillRect(padL, padT, (4 / 35) * plotW, plotH); // Low O2 quench zone

  ctx.fillStyle = "rgba(56, 189, 248, 0.09)";
  ctx.fillRect(xToPx(17.5), yToPx(5), xToPx(21) - xToPx(17.5), yToPx(0) - yToPx(5)); // Cool flame pocket

  ctx.fillStyle = "rgba(192, 132, 252, 0.08)";
  ctx.fillRect(padL, padT, plotW, yToPx(42) - padT); // High flow blow-off band

  // Grid & axes
  ctx.strokeStyle = "rgba(51, 65, 85, 0.6)";
  ctx.lineWidth = 1;
  ctx.font = "10px monospace";
  ctx.fillStyle = "#94a3b8";

  [15, 21, 30, 40, 50].forEach(o2Val => {
    const x = xToPx(o2Val);
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
    ctx.fillText(`${o2Val}%`, x - 10, h - 6);
  });

  [0, 15, 30, 50].forEach(flVal => {
    const y = yToPx(flVal);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.fillText(`${flVal}`, 6, y + 3);
  });

  // Plot Real Experimental Points for Selected Material
  expPoints.forEach(pt => {
    const px = xToPx(pt.o2);
    const py = yToPx(pt.flow);
    const col = (REGIME_STYLES[pt.regime] || REGIME_STYLES.STABLE_FLAME).dot;
    ctx.fillStyle = col;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  // Plot Current User Input Crosshair Marker
  const curX = xToPx(currentInputs.in_o2_molar_fraction_pct);
  const curY = yToPx(currentInputs.in_ventilation_flow_cm_s);
  const curColor = (REGIME_STYLES[currentRegime] || REGIME_STYLES.STABLE_FLAME).dot;

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(curX, curY, 8, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = curColor;
  ctx.beginPath();
  ctx.arc(curX, curY, 4.5, 0, Math.PI * 2);
  ctx.fill();
}

// ============================================================================
// LANGUAGE TOGGLE (EN / ES)
// ============================================================================

window.toggleLanguage = function () {
  currentLang = currentLang === "en" ? "es" : "en";
  applyLanguage();
  if (lastPrediction) renderDashboardOutputs(lastPrediction);
};

function applyLanguage() {
  const t = I18N[currentLang];
  document.getElementById("txt-app-title").textContent = t.appTitle;
  document.getElementById("txt-model-badge").textContent = t.modelBadge;
  document.getElementById("txt-sample-warning-title").textContent = t.sampleWarningTitle;
  document.getElementById("txt-sample-warning-desc").textContent = t.sampleWarningDesc;

  document.getElementById("nav-btn-simulator").textContent = t.nav.simulator;
  document.getElementById("nav-btn-sweep").textContent = t.nav.sweep;
  document.getElementById("nav-btn-about").textContent = t.nav.about;

  document.getElementById("txt-presets-title").textContent = t.presets.title;
  document.getElementById("btn-preset-iss").textContent = t.presets.iss;
  document.getElementById("btn-preset-exp").textContent = t.presets.exploration;
  document.getElementById("btn-preset-worst").textContent = t.presets.worstCase;
  document.getElementById("btn-preset-cool").textContent = t.presets.coolFlame;
  document.getElementById("btn-preset-reset").textContent = `↺ ${t.presets.reset}`;

  document.getElementById("btn-save-compare").textContent = t.actions.saveCompare;
  document.getElementById("btn-export-pdf").textContent = `⬇ ${t.actions.exportPdf}`;

  document.getElementById("lbl-essential-title").textContent = t.inputs.essentialTitle;
  document.getElementById("lbl-env-title").textContent = t.inputs.envTitle;

  setLabelAndTip("lbl-o2", t.inputs.o2Label, t.inputs.o2Tooltip);
  setLabelAndTip("lbl-flow", t.inputs.flowLabel, t.inputs.flowTooltip);
  setLabelAndTip("lbl-material", t.inputs.materialLabel, t.inputs.materialTooltip);
  setLabelAndTip("lbl-thick", t.inputs.thicknessLabel, t.inputs.thicknessTooltip);
  setLabelAndTip("lbl-press", t.inputs.pressureLabel, t.inputs.pressureTooltip);
  setLabelAndTip("lbl-flow-dir", t.inputs.flowDirLabel, t.inputs.flowDirTooltip);
  setLabelAndTip("lbl-gravity", t.inputs.gravityLabel, t.inputs.gravityTooltip);

  // Material dropdown options
  const selMat = document.getElementById("sel-material");
  Array.from(selMat.options).forEach(opt => {
    if (t.inputs.materials[opt.value]) opt.textContent = t.inputs.materials[opt.value];
  });

  // Cards headers & tooltips
  document.getElementById("lbl-block1-title").textContent = t.cards.block1Title;
  setLabelAndTip("lbl-spread-rate", t.cards.spreadRate, t.cards.spreadRateTooltip);
  setLabelAndTip("lbl-regime", t.cards.regime, t.cards.regimeTooltip);
  setLabelAndTip("lbl-flame-temp", t.cards.flameTemp, t.cards.flameTempTooltip);
  setLabelAndTip("lbl-ignition-time", t.cards.ignitionTime, t.cards.ignitionTimeTooltip);
  setLabelAndTip("lbl-hrr", t.cards.hrr, t.cards.hrrTooltip);
  document.getElementById("lbl-flam-map-title").textContent = t.cards.flammabilityMapTitle;
  document.getElementById("lbl-flam-map-desc").textContent = t.cards.flammabilityMapDesc;

  document.getElementById("lbl-block2-title").textContent = t.cards.block2Title;
  setLabelAndTip("lbl-fri-title", t.cards.friTitle, t.cards.friTooltip);
  setLabelAndTip("lbl-verdict-title", t.cards.verdictTitle, t.cards.verdictTooltip);
  setLabelAndTip("lbl-safe-dist", t.cards.safeDist, t.cards.safeDistTooltip);

  document.getElementById("lbl-block3-title").textContent = t.cards.block3Title;
  setLabelAndTip("lbl-co", t.cards.coLabel, t.cards.coTooltip);
  setLabelAndTip("lbl-soot", t.cards.sootLabel, t.cards.sootTooltip);
  setLabelAndTip("lbl-opacity", t.cards.opacityLabel, t.cards.opacityTooltip);
  setLabelAndTip("lbl-acid-title", t.cards.acidGasesTitle, t.cards.acidGasesTooltip);

  document.getElementById("lbl-block4-title").textContent = t.cards.block4Title;
  setLabelAndTip("lbl-dp", t.cards.particleDiam, t.cards.particleDiamTooltip);
  setLabelAndTip("lbl-sensor", t.cards.optimalSensor, t.cards.optimalSensorTooltip);
  document.getElementById("lbl-sensor-table-title").textContent = t.cards.sensorComparisonTitle;
  setLabelAndTip("lbl-mitigation-title", t.cards.mitigationTitle, t.cards.mitigationTooltip);
  document.getElementById("lbl-nearest-title").textContent = t.nearestPanel.title;
}

function setLabelAndTip(id, text, tip) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `${text} <span class="text-slate-500 text-[10px]">ⓘ</span>`;
  el.title = tip;
}

// ============================================================================
// PRESETS, NAVIGATION & CONTROLS
// ============================================================================

window.switchMainTab = function (tab) {
  ["simulator", "data", "sweep", "compare", "about"].forEach(k => {
    document.getElementById(`view-${k}`).classList.toggle("hidden", k !== tab);
    const btn = document.getElementById(`nav-btn-${k}`);
    if (btn) {
      btn.className = k === tab
        ? "px-3 py-1.5 rounded-md bg-blue-600 text-white font-bold transition"
        : "px-3 py-1.5 rounded-md text-slate-300 hover:text-white transition";
    }
  });
  if (tab === "sweep") window.runParameterSweep();
  if (tab === "compare") renderCompareCards();
};

window.setFlowDir = function (dir) {
  uiInputs.in_flow_direction = dir;
  if (dir === "QUIESCENT") {
    setControlValue("o2", uiInputs.in_o2_molar_fraction_pct);
    setControlValue("flow", 0.0);
  }
  ["CONCURRENT", "OPPOSED", "QUIESCENT"].forEach(d => {
    const btn = document.getElementById(`btn-dir-${d}`);
    btn.className = d === dir
      ? "px-2 py-1.5 rounded-lg border border-cyan-500 bg-cyan-500/15 text-cyan-300 text-[11px] font-mono font-bold transition"
      : "px-2 py-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-400 text-[11px] font-mono transition";
  });
  scheduleSimulation();
};

window.setPressurePreset = function (kpa, o2Opt) {
  setControlValue("press", kpa);
  if (o2Opt !== undefined) setControlValue("o2", o2Opt);
  scheduleSimulation();
};

window.setGravityPreset = function (gVal) {
  uiInputs.in_gravity_level_g = gVal;
  document.getElementById("num-grav").value = gVal;
  scheduleSimulation();
};

function setControlValue(shortKey, val) {
  const map = {
    o2: ["rng-o2", "num-o2", "in_o2_molar_fraction_pct"],
    flow: ["rng-flow", "num-flow", "in_ventilation_flow_cm_s"],
    thick: ["rng-thick", "num-thick", "in_material_thickness_mm"],
    press: ["rng-press", "num-press", "in_cabin_pressure_kpa"]
  };
  const [rId, nId, sKey] = map[shortKey];
  document.getElementById(rId).value = val;
  document.getElementById(nId).value = val;
  uiInputs[sKey] = Number(val);
}

window.applyScenarioPreset = function (preset) {
  if (preset === "iss" || preset === "reset") {
    document.getElementById("sel-material").value = "pmma";
    uiInputs.material_id = "pmma";
    setControlValue("o2", 21.0);
    setControlValue("flow", 12.0);
    setControlValue("thick", 1.5);
    setControlValue("press", 101.3);
    window.setGravityPreset(0.0);
    window.setFlowDir("CONCURRENT");
  } else if (preset === "exploration") {
    document.getElementById("sel-material").value = "pmma";
    uiInputs.material_id = "pmma";
    setControlValue("o2", 34.0);
    setControlValue("flow", 12.0);
    setControlValue("thick", 1.0);
    setControlValue("press", 56.5);
    window.setGravityPreset(0.0);
    window.setFlowDir("CONCURRENT");
  } else if (preset === "worst") {
    document.getElementById("sel-material").value = "cotton";
    uiInputs.material_id = "cotton";
    setControlValue("o2", 40.0);
    setControlValue("flow", 15.0);
    setControlValue("thick", 0.4);
    setControlValue("press", 101.3);
    window.setGravityPreset(0.0);
    window.setFlowDir("CONCURRENT");
  } else if (preset === "cool") {
    document.getElementById("sel-material").value = "pmma";
    uiInputs.material_id = "pmma";
    setControlValue("o2", 18.5);
    setControlValue("flow", 2.5);
    setControlValue("thick", 1.5);
    setControlValue("press", 101.3);
    window.setGravityPreset(0.0);
    window.setFlowDir("OPPOSED");
  }
  executeSimulationImmediate();
};

// ============================================================================
// DATA PAGE: CSV UPLOAD, WARNINGS & SEARCHABLE TABLE
// ============================================================================

window.handleCsvFileUpload = async function (event) {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  currentCsvRaw = text;

  // Upload to FastAPI backend if running, plus update client store
  try {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/api/dataset`, { method: "POST", body: formData });
    if (res.ok) {
      datasetSummary = await res.json();
      forceLocalEngine = false;
    } else {
      datasetSummary = parseCsvDataset(text, false);
      forceLocalEngine = true;
    }
  } catch {
    datasetSummary = parseCsvDataset(text, false);
    forceLocalEngine = true;
  }

  syncMaterialOptions();
  document.getElementById("nav-row-count").textContent = datasetSummary.row_count;
  renderDataPageWarnings();
  renderDataPageTable();
  await executeSimulationImmediate();
};

window.resetToSampleDataset = async function () {
  currentCsvRaw = SEEDED_SAMPLE_CSV;
  try {
    const res = await fetch(`${API_BASE}/api/dataset/reset`, { method: "POST" });
    if (res.ok) {
      datasetSummary = await res.json();
      forceLocalEngine = false;
    } else {
      datasetSummary = parseCsvDataset(SEEDED_SAMPLE_CSV, true);
      forceLocalEngine = true;
    }
  } catch {
    datasetSummary = parseCsvDataset(SEEDED_SAMPLE_CSV, true);
    forceLocalEngine = true;
  }
  syncMaterialOptions();
  document.getElementById("nav-row-count").textContent = datasetSummary.row_count;
  renderDataPageWarnings();
  renderDataPageTable();
  await executeSimulationImmediate();
};

function renderDataPageWarnings() {
  const box = document.getElementById("box-dataset-warnings");
  const wList = datasetSummary.warnings || [];
  if (wList.length === 0) {
    box.innerHTML = `<div class="text-xs font-mono text-emerald-400">✓ All 29 schema columns verified with zero parsing warnings.</div>`;
    return;
  }
  box.innerHTML = `
    <div class="text-xs font-mono font-bold text-amber-300">
      Dataset Validation &amp; Missing-Cell Log (${wList.length} notices — empty cells safely treated as missing, never 0):
    </div>
    <div class="max-h-32 overflow-y-auto space-y-1 text-[11px] font-mono text-slate-300 custom-scroll">
      ${wList.map(w => `<div><span class="text-amber-400">[Row ${w.row} · ${w.record_id}]</span> ${w.type}: ${w.message}</div>`).join("")}
    </div>
  `;
}

window.renderDataPageTable = function () {
  const q = (document.getElementById("inp-data-search")?.value || "").toLowerCase();
  const matFilter = document.getElementById("sel-data-mat-filter")?.value || "";
  const rows = (datasetSummary.rows || []).filter(r => {
    if (matFilter && r.material_id !== matFilter) return false;
    if (!q) return true;
    return (
      String(r.record_id).toLowerCase().includes(q) ||
      String(r.document_id).toLowerCase().includes(q) ||
      String(r.out_combustion_regime).toLowerCase().includes(q)
    );
  });

  document.getElementById("txt-data-summary-count").textContent =
    `Showing ${rows.length} of ${datasetSummary.row_count} experimental rows`;

  document.getElementById("tbody-dataset-rows").innerHTML = rows
    .map(r => `
      <tr class="hover:bg-slate-900/80">
        <td class="p-2.5 font-bold text-amber-300">${r.record_id}</td>
        <td class="p-2.5 text-slate-400">${r.document_id}</td>
        <td class="p-2.5 font-bold text-cyan-300">${r.material_id}</td>
        <td class="p-2.5">${r.in_o2_molar_fraction_pct ?? "—"}</td>
        <td class="p-2.5">${r.in_ventilation_flow_cm_s ?? "—"}</td>
        <td class="p-2.5">${r.in_material_thickness_mm ?? "—"}</td>
        <td class="p-2.5">${r.in_cabin_pressure_kpa ?? "—"}</td>
        <td class="p-2.5">${r.in_flow_direction}</td>
        <td class="p-2.5">${r.in_gravity_level_g ?? "—"}</td>
        <td class="p-2.5 font-bold text-white">${r.out_flame_spread_rate_mm_s ?? "—"}</td>
        <td class="p-2.5">${r.out_combustion_regime ?? "—"}</td>
        <td class="p-2.5">${r.out_flame_temperature_k ?? "—"}</td>
        <td class="p-2.5">${r.out_hrr_watts ?? "—"} W | ${r.out_hrr_kilowatts ?? "—"} kW</td>
        <td class="p-2.5 font-bold text-rose-300">${r.out_fri_risk_index ?? "—"}</td>
        <td class="p-2.5">${r.out_co_concentration_ppm ?? "—"}</td>
        <td class="p-2.5 text-slate-400">${r.out_acid_gas_hcl_ppm ?? "—"} | ${r.out_acid_gas_hf_ppm ?? "—"} | ${r.out_acid_gas_hcn_ppm ?? "—"}</td>
        <td class="p-2.5">${r.out_mean_particle_diameter_um ?? "—"}</td>
        <td class="p-2.5">
          <button onclick="window.loadExperimentIntoSimulator('${r.record_id}')" class="px-2 py-0.5 rounded bg-blue-600/30 border border-blue-500/40 text-blue-300 hover:bg-blue-600/50">
            Load →
          </button>
        </td>
      </tr>
    `)
    .join("");
};

window.selectMatchedExperiment = function (recId, matchPct = 100) {
  const row = (datasetSummary.rows || []).find(r => r.record_id === recId);
  if (!row) return;
  activeSelectedRecordId = recId;
  activeMatchPct = matchPct;

  document.getElementById("sel-material").value = row.material_id;
  uiInputs.material_id = row.material_id;
  if (row.in_o2_molar_fraction_pct !== null) setControlValue("o2", row.in_o2_molar_fraction_pct);
  if (row.in_ventilation_flow_cm_s !== null) setControlValue("flow", row.in_ventilation_flow_cm_s);
  if (row.in_material_thickness_mm !== null) setControlValue("thick", row.in_material_thickness_mm);
  if (row.in_cabin_pressure_kpa !== null) setControlValue("press", row.in_cabin_pressure_kpa);
  if (row.in_gravity_level_g !== null) {
    uiInputs.in_gravity_level_g = row.in_gravity_level_g;
    document.getElementById("num-grav").value = row.in_gravity_level_g;
  }
  uiInputs.in_flow_direction = row.in_flow_direction || "CONCURRENT";
  ["CONCURRENT", "OPPOSED", "QUIESCENT"].forEach(d => {
    const btn = document.getElementById(`btn-dir-${d}`);
    if (btn) {
      btn.className = d === uiInputs.in_flow_direction
        ? "px-2 py-2 rounded-lg border border-cyan-400 bg-cyan-500/20 text-cyan-200 text-[11px] font-mono font-bold transition"
        : "px-2 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-400 text-[11px] font-mono transition";
    }
  });

  window.switchMainTab("simulator");
  executeSimulationImmediate();
};

window.loadExperimentIntoSimulator = function (recId) {
  window.selectMatchedExperiment(recId, 100);
};

window.exitSelectedExperimentMode = function () {
  activeSelectedRecordId = null;
  renderSelectedExperimentBanner();
  executeSimulationImmediate();
};

function renderSelectedExperimentBanner() {
  const banner = document.getElementById("selected-db-experiment-banner");
  if (!banner) return;
  const row = (datasetSummary.rows || []).find(r => r.record_id === activeSelectedRecordId);
  if (!row) {
    banner.classList.add("hidden");
    return;
  }

  // Check if engineer manually moved sliders away from the selected experiment's inputs
  const drifted =
    Math.abs(uiInputs.in_o2_molar_fraction_pct - (row.in_o2_molar_fraction_pct ?? 21)) > 0.2 ||
    Math.abs(uiInputs.in_ventilation_flow_cm_s - (row.in_ventilation_flow_cm_s ?? 12)) > 0.2 ||
    Math.abs(uiInputs.in_material_thickness_mm - (row.in_material_thickness_mm ?? 1.5)) > 0.05 ||
    uiInputs.material_id !== row.material_id;

  if (drifted) {
    activeSelectedRecordId = null;
    banner.classList.add("hidden");
    return;
  }

  banner.classList.remove("hidden");
  document.getElementById("sel-exp-banner-id").textContent = row.record_id;
  document.getElementById("sel-exp-banner-doc").textContent = row.document_id;
  document.getElementById("sel-exp-banner-match").textContent = `${activeMatchPct}% Similarity Match`;
  document.getElementById("sel-exp-banner-notes").textContent = row.extraction_notes || "Official NASA PSI experimental record loaded from database.";

  const cells = [
    { label: "DB Spread V_f", val: row.out_flame_spread_rate_mm_s !== null ? `${row.out_flame_spread_rate_mm_s} mm/s` : "Not reported" },
    { label: "DB Regime", val: row.out_combustion_regime ?? "Not reported" },
    { label: "DB Temp", val: row.out_flame_temperature_k !== null ? `${row.out_flame_temperature_k} K` : "Not reported" },
    { label: "DB Ignition t_ig", val: row.out_ignition_time_s !== null ? `${row.out_ignition_time_s} s` : "Not reported" },
    { label: "DB HRR", val: row.out_hrr_watts !== null ? `${row.out_hrr_watts} W` : "Not reported" },
    { label: "DB FRI Index", val: row.out_fri_risk_index !== null ? `${row.out_fri_risk_index}/100` : "Not reported" },
    { label: "DB CO (ppm)", val: row.out_co_concentration_ppm !== null ? `${row.out_co_concentration_ppm} ppm` : "Not reported" },
    { label: "DB Particle D_p", val: row.out_mean_particle_diameter_um !== null ? `${row.out_mean_particle_diameter_um} µm` : "Not reported" }
  ];

  document.getElementById("sel-exp-raw-db-strip").innerHTML = cells
    .map(c => `
      <div class="p-2 rounded-lg bg-slate-950/90 border border-emerald-500/30 flex flex-col">
        <span class="text-[9px] uppercase text-emerald-400">${c.label}</span>
        <span class="font-bold text-white truncate">${c.val}</span>
      </div>
    `)
    .join("");
}

// ============================================================================
// PARAMETER SWEEP (1D PLOT)
// ============================================================================

window.runParameterSweep = function () {
  const xParam = document.getElementById("sel-sweep-x").value;
  const yParam = document.getElementById("sel-sweep-y").value;

  const ranges = {
    in_o2_molar_fraction_pct: [15, 50],
    in_ventilation_flow_cm_s: [0, 50],
    in_material_thickness_mm: [0.1, 10],
    in_cabin_pressure_kpa: [20, 150]
  };
  const [minV, maxV] = ranges[xParam] || [15, 50];
  const steps = 20;
  const stepSize = (maxV - minV) / (steps - 1);

  const pts = [];
  for (let i = 0; i < steps; i++) {
    const xVal = Number((minV + i * stepSize).toFixed(2));
    const stepInp = { ...uiInputs, [xParam]: xVal };
    const p = predictLocal(stepInp, datasetSummary, true);
    const yVal = p.outputs[yParam]?.value ?? 0;
    pts.push({ x: xVal, y: Number(yVal), regime: p.outputs.out_combustion_regime.value });
  }
  drawSweepCanvas(pts, xParam, yParam);
};

function drawSweepCanvas(pts, xLabel, yLabel) {
  const canvas = document.getElementById("sweepChartCanvas");
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

  const w = rect.width;
  const h = rect.height;
  const padL = 55, padR = 25, padT = 25, padB = 40;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  ctx.clearRect(0, 0, w, h);

  const minX = pts[0].x;
  const maxX = pts[pts.length - 1].x;
  const yVals = pts.map(p => p.y);
  const minY = 0;
  const maxY = Math.max(1, Math.max(...yVals) * 1.15);

  const xPx = (v) => padL + ((v - minX) / (maxX - minX || 1)) * plotW;
  const yPx = (v) => padT + plotH - ((v - minY) / (maxY - minY || 1)) * plotH;

  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  ctx.font = "11px monospace";
  ctx.fillStyle = "#94a3b8";

  for (let i = 0; i <= 4; i++) {
    const yv = minY + (i / 4) * (maxY - minY);
    const py = yPx(yv);
    ctx.beginPath();
    ctx.moveTo(padL, py);
    ctx.lineTo(padL + plotW, py);
    ctx.stroke();
    ctx.fillText(yv.toFixed(1), 8, py + 4);
  }

  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  pts.forEach((p, idx) => {
    const px = xPx(p.x);
    const py = yPx(p.y);
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  pts.forEach(p => {
    const px = xPx(p.x);
    const py = yPx(p.y);
    ctx.fillStyle = (REGIME_STYLES[p.regime] || REGIME_STYLES.STABLE_FLAME).dot;
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#cbd5e1";
  ctx.fillText(`${xLabel} (${minX} -> ${maxX})`, padL + plotW / 2 - 80, h - 10);
  ctx.fillText(yLabel, padL, 16);
}

// ============================================================================
// COMPARE MODE (LOCALSTORAGE UP TO 3 SCENARIOS)
// ============================================================================

function getSavedScenarios() {
  try {
    return JSON.parse(localStorage.getItem(COMPARE_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function updateCompareCountBadge() {
  const list = getSavedScenarios();
  document.getElementById("nav-compare-count").textContent = list.length;
}

window.saveScenarioToCompare = function () {
  if (!lastPrediction) return;
  const list = getSavedScenarios();
  if (list.length >= 3) list.shift();
  list.push({
    savedAt: new Date().toLocaleTimeString(),
    inputs: { ...uiInputs },
    outputs: lastPrediction.outputs
  });
  localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(list));
  updateCompareCountBadge();
  window.switchMainTab("compare");
};

window.clearSavedComparisons = function () {
  localStorage.removeItem(COMPARE_STORAGE_KEY);
  updateCompareCountBadge();
  renderCompareCards();
};

function renderCompareCards() {
  const list = getSavedScenarios();
  const grid = document.getElementById("grid-compare-cards");
  if (list.length === 0) {
    grid.innerHTML = `<div class="col-span-3 p-8 text-center text-slate-400 font-mono bg-[#0d1526] border border-slate-800 rounded-xl">No scenarios saved yet. Click "+ Save to Compare (max 3)" in the Simulator Dashboard.</div>`;
    return;
  }
  grid.innerHTML = list
    .map((sc, i) => `
      <div class="bg-[#0d1526] border border-slate-800 rounded-xl p-4 flex flex-col gap-2.5 font-mono text-xs">
        <div class="flex justify-between items-center border-b border-slate-800 pb-2">
          <span class="font-bold text-cyan-400">SCENARIO #${i + 1} (${sc.inputs.material_id.toUpperCase()})</span>
          <span class="text-[10px] text-slate-500">${sc.savedAt}</span>
        </div>
        <div class="text-slate-300 space-y-1">
          <div>O₂: <strong>${sc.inputs.in_o2_molar_fraction_pct}%</strong> | Flow: <strong>${sc.inputs.in_ventilation_flow_cm_s} cm/s</strong></div>
          <div>Thick: <strong>${sc.inputs.in_material_thickness_mm} mm</strong> | Press: <strong>${sc.inputs.in_cabin_pressure_kpa} kPa</strong></div>
          <div>Dir: <strong>${sc.inputs.in_flow_direction}</strong> | Gravity: <strong>${sc.inputs.in_gravity_level_g}g</strong></div>
        </div>
        <div class="border-t border-slate-800 pt-2 space-y-1.5">
          <div class="flex justify-between"><span>Spread Rate V_f:</span><strong class="text-white">${sc.outputs.out_flame_spread_rate_mm_s.value} mm/s</strong></div>
          <div class="flex justify-between"><span>Regime:</span><strong class="text-orange-300">${sc.outputs.out_combustion_regime.value}</strong></div>
          <div class="flex justify-between"><span>Flame Temp:</span><strong>${sc.outputs.out_flame_temperature_k.value} K</strong></div>
          <div class="flex justify-between"><span>HRR:</span><strong>${sc.outputs.out_hrr_watts.value} W</strong></div>
          <div class="flex justify-between"><span>Fire Risk Index (FRI):</span><strong class="text-rose-400">${sc.outputs.out_fri_risk_index.value} / 100</strong></div>
          <div class="flex justify-between"><span>CO (ppm):</span><strong>${sc.outputs.out_co_concentration_ppm.value} ppm</strong></div>
          <div class="flex justify-between"><span>Optimal Sensor:</span><strong class="text-cyan-300">${sc.outputs.out_optimal_sensor_type.value}</strong></div>
        </div>
      </div>
    `)
    .join("");
}

// ============================================================================
// EXPORT: GENERATED PDF REPORT + JSON + CSV
// ============================================================================

window.exportCurrentJson = function () {
  if (!lastPrediction) return;
  const blob = new Blob([JSON.stringify(lastPrediction, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `flamesim_prediction_${uiInputs.material_id}.json`;
  a.click();
};

window.exportDatasetCsv = function () {
  const blob = new Blob([currentCsvRaw], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "nasa_psi_flamesim_dataset.csv";
  a.click();
};

window.exportPdfReport = function () {
  if (!lastPrediction) return;
  const t = I18N[currentLang];
  const out = lastPrediction.outputs;

  // Build valid standalone PDF 1.4 file with full inputs, outputs, sources, confidence, and disclaimer
  const lines = [
    "FLAMESIM: SPACECRAFT FIRE SAFETY SIMULATOR - ENGINEERING REPORT",
    "NASA Space Apps Challenge 2026 ('Flame in Freefall')",
    "----------------------------------------------------------------------",
    `MODEL BADGE: ${t.modelBadge}`,
    lastPrediction.dataset_source === "supabase"
      ? "DATASET STATUS: SUPABASE IMPORT (UNVERIFIED; NOT FOR SAFETY DECISIONS)"
      : lastPrediction.is_sample_data
        ? "DATASET STATUS: SAMPLE DATA (NOT REAL FLIGHT CERTIFICATION EXPERIMENTS)"
        : "DATASET STATUS: USER EXPERIMENTAL DATASET",
    "----------------------------------------------------------------------",
    "INPUT PARAMETERS:",
    `  1. Material ID           : ${uiInputs.material_id.toUpperCase()}`,
    `  2. Oxygen Mole Fraction  : ${uiInputs.in_o2_molar_fraction_pct} %`,
    `  3. Ventilation Velocity  : ${uiInputs.in_ventilation_flow_cm_s} cm/s`,
    `  4. Material Thickness    : ${uiInputs.in_material_thickness_mm} mm`,
    `  5. Total Cabin Pressure  : ${uiInputs.in_cabin_pressure_kpa} kPa`,
    `  6. Flow Direction        : ${uiInputs.in_flow_direction}`,
    `  7. Gravity Level         : ${uiInputs.in_gravity_level_g} g`,
    "----------------------------------------------------------------------",
    "PREDICTED OUTPUTS (VALUE | UNIT | SOURCE | CONFIDENCE):",
    `  - Flame Spread Rate      : ${out.out_flame_spread_rate_mm_s.value} mm/s [${out.out_flame_spread_rate_mm_s.source} / ${out.out_flame_spread_rate_mm_s.confidence}]`,
    `  - Combustion Regime      : ${out.out_combustion_regime.value} [${out.out_combustion_regime.source} / ${out.out_combustion_regime.confidence}]`,
    `  - Flame Temperature      : ${out.out_flame_temperature_k.value} K [${out.out_flame_temperature_k.source}]`,
    `  - Ignition Time (t_ig)   : ${out.out_ignition_time_s.value} s [${out.out_ignition_time_s.source}]`,
    `  - Heat Release Rate (HRR): ${out.out_hrr_watts.value} W (${out.out_hrr_kilowatts.value} kW) [${out.out_hrr_watts.source}]`,
    `  - Fire Risk Index (FRI)  : ${out.out_fri_risk_index.value} / 100 [${out.out_fri_risk_index.source}]`,
    `  - 1g vs ug Verdict       : ${out.out_verdict_1g_vs_ug.value}`,
    `  - Safe Isolation Dist.   : ${out.out_safe_isolation_dist_mm.value} mm`,
    `  - Carbon Monoxide (CO)   : ${out.out_co_concentration_ppm.value} ppm`,
    `  - Soot Generation Rate   : ${out.out_soot_generation_rate_mg_g.value} mg/g`,
    `  - Smoke Opacity          : ${out.out_smoke_opacity_pct_m.value} %/m`,
    `  - Acid Gases HCl/HF/HCN  : ${out.out_acid_gas_hcl_ppm.value ?? "No data"} / ${out.out_acid_gas_hf_ppm.value ?? "No data"} / ${out.out_acid_gas_hcn_ppm.value ?? "No data"} ppm`,
    `  - Particle Diameter      : ${out.out_mean_particle_diameter_um.value} um`,
    `  - Optimal Sensor & Time  : ${out.out_optimal_sensor_type.value} (${out.out_estimated_detection_time_s.value} s)`,
    "----------------------------------------------------------------------",
    "RECOMMENDED MITIGATION:",
    `  ${out.out_recommended_mitigation.value}`
  ];

  const pdfBytes = generateMinimalPdf(lines);
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `FlameSim_Report_${uiInputs.material_id}.pdf`;
  a.click();
};

function generateMinimalPdf(lines) {
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  let y = 760;
  const contentOps = ["BT", "/F1 9 Tf"];
  lines.forEach(line => {
    contentOps.push(`1 0 0 1 40 ${y} Tm (${esc(line)}) Tj`);
    y -= 18;
  });
  contentOps.push("ET");
  const stream = contentOps.join("\n");

  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Courier >> endobj\n",
    `5 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj\n`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach(obj => {
    offsets.push(pdf.length);
    pdf += obj;
  });
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(off => {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

window.addEventListener("DOMContentLoaded", initFlameSim);

// Redraw existing results when their viewport changes; prediction values are reused.
window.addEventListener("DOMContentLoaded", () => {
  const frame = document.getElementById("flammabilityMapCanvas")?.parentElement;
  if (!frame) return;
  new ResizeObserver(() => {
    if (!lastPrediction || frame.clientWidth === 0) return;
    drawFlammabilityMap(
      lastPrediction.material_experimental_points || [],
      uiInputs,
      lastPrediction.outputs.out_combustion_regime.value
    );
    chartsSuite?.renderAll();
  }).observe(frame);
});

