// ============================================================================
// FlameSim: The 4 Winner Engineering Charts Module (charts-four.js)
// 1. 2D Flammability Regime Contour Map (Ug 0-40 cm/s vs O2 15-40%) + Hover Photo Card
// 2. Longitudinal Flame Profile & Space-Time Diagram (Dual-Axis: Position mm & Temp K vs Time 0-120s + Cut HVAC Action)
// 3. Cabin Toxicity & Sensor Detection Time-Series (CO ppm & Smoke Opacity %/m vs Time + Yellow Laser Alarm & Red SMAC Thresholds)
// 4. Material Trade-Off Radar (Spider Chart: 5 Axes vs ISS Reference Baseline Nomex/SIBAL)
// ============================================================================

const EXPERIMENT_FLAME_SVGS = {
  STABLE_FLAME: `data:image/svg+xml;utf8,` + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120">
      <rect width="240" height="120" fill="#050811"/>
      <g stroke="#1e293b" stroke-width="1"><line x1="0" y1="30" x2="240" y2="30"/><line x1="0" y1="60" x2="240" y2="60"/><line x1="0" y1="90" x2="240" y2="90"/><line x1="60" y1="0" x2="60" y2="120"/><line x1="120" y1="0" x2="120" y2="120"/><line x1="180" y1="0" x2="180" y2="120"/></g>
      <rect x="30" y="82" width="180" height="10" rx="2" fill="#334155" stroke="#64748b"/>
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.95"/>
          <stop offset="45%" stop-color="#f59e0b" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="#ef4444" stop-opacity="0.1"/>
        </linearGradient>
      </defs>
      <path d="M 55 82 Q 95 28 195 55 Q 130 80 65 82 Z" fill="url(#g1)"/>
      <text x="10" y="18" fill="#38bdf8" font-family="monospace" font-size="10">NASA ISS OPTICAL TELEMETRY · µg</text>
    </svg>
  `),
  COOL_FLAME: `data:image/svg+xml;utf8,` + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120">
      <rect width="240" height="120" fill="#050811"/>
      <rect x="30" y="82" width="180" height="10" rx="2" fill="#334155" stroke="#64748b"/>
      <defs>
        <radialGradient id="cf" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#7dd3fc" stop-opacity="0.85"/>
          <stop offset="60%" stop-color="#0284c7" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#0284c7" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="115" cy="65" r="38" fill="url(#cf)"/>
      <text x="10" y="18" fill="#7dd3fc" font-family="monospace" font-size="10">IR INTENSIFIED · COOL FLAME ~605 K</text>
    </svg>
  `),
  SELF_EXTINCTION: `data:image/svg+xml;utf8,` + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120">
      <rect width="240" height="120" fill="#050811"/>
      <rect x="30" y="82" width="180" height="10" rx="2" fill="#334155" stroke="#64748b"/>
      <circle cx="95" cy="68" r="22" fill="#3b82f6" fill-opacity="0.45"/>
      <text x="10" y="18" fill="#94a3b8" font-family="monospace" font-size="10">SOFIE DIFFUSIVE QUENCH · 0 cm/s</text>
    </svg>
  `)
};

export class EngineeringChartsSuite {
  constructor() {
    this.hvacCutActive = false;
    this.hvacCutTimeS = 45;
    this.radarBaselineKey = "nomex"; // 'nomex' | 'cotton'
    this.hoveredExp = null;
    this.cachedExpScreenPts = [];
    this.lastPred = null;
    this.lastInputs = null;
    this.allRows = [];
    this.lang = "en";
  }

  initEvents() {
    const mapCanvas = document.getElementById("chart1ContourCanvas");
    if (mapCanvas) {
      mapCanvas.addEventListener("mousemove", (e) => this.handleContourHover(e, mapCanvas));
      mapCanvas.addEventListener("mouseleave", () => {
        this.hoveredExp = null;
        const card = document.getElementById("chart1-hover-card");
        if (card) card.classList.add("hidden");
        this.renderChart1Contour();
      });
      mapCanvas.addEventListener("click", () => {
        if (this.hoveredExp && window.loadExperimentIntoSimulator) {
          window.loadExperimentIntoSimulator(this.hoveredExp.record_id);
        }
      });
    }

    const btnCutHvac = document.getElementById("btn-chart2-cut-hvac");
    if (btnCutHvac) {
      btnCutHvac.addEventListener("click", () => {
        this.hvacCutActive = !this.hvacCutActive;
        this.updateCutHvacButtonUI();
        this.renderChart2SpaceTime();
        this.renderChart3Toxicity();
      });
    }

    const selBaseline = document.getElementById("sel-chart4-baseline");
    if (selBaseline) {
      selBaseline.addEventListener("change", (e) => {
        this.radarBaselineKey = e.target.value;
        this.renderChart4Radar();
      });
    }

    window.addEventListener("resize", () => this.renderAll());
  }

  updateCutHvacButtonUI() {
    const btn = document.getElementById("btn-chart2-cut-hvac");
    if (!btn) return;
    if (this.hvacCutActive) {
      btn.className = "px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400 text-emerald-300 text-xs font-mono font-bold transition";
      btn.textContent = this.lang === "es"
        ? "✓ Ventilación Cortada en t = 45s (Restaurar)"
        : "✓ HVAC Cut Active at t = 45s (Restore)";
    } else {
      btn.className = "px-3 py-1 rounded-lg bg-rose-500/20 border border-rose-500/50 text-rose-300 hover:bg-rose-500/30 text-xs font-mono font-bold transition";
      btn.textContent = this.lang === "es"
        ? "✂ Simular Corte de Ventilación (t = 45s)"
        : "✂ Simulate HVAC Ventilation Cut (t = 45s)";
    }
  }

  updateData(pred, inputs, allRows, lang = "en") {
    this.lastPred = pred;
    this.lastInputs = inputs;
    this.allRows = allRows || [];
    this.lang = lang;
    this.updateCutHvacButtonUI();
    this.renderAll();
  }

  renderAll() {
    if (!this.lastPred || !this.lastInputs) return;
    this.renderChart1Contour();
    this.renderChart2SpaceTime();
    this.renderChart3Toxicity();
    this.renderChart4Radar();
  }

  // ==========================================================================
  // CHART 1: 2D FLAMMABILITY REGIME CONTOUR MAP (Ug 0-40 vs O2 15-40%)
  // ==========================================================================
  renderChart1Contour() {
    const canvas = document.getElementById("chart1ContourCanvas");
    if (!canvas || !canvas.parentElement) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    if (rect.width === 0) return;

    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

    const w = rect.width;
    const h = rect.height;
    const padL = 48, padR = 18, padT = 16, padB = 34;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    ctx.clearRect(0, 0, w, h);

    const xToPx = (ug) => padL + (Math.min(40, Math.max(0, ug)) / 40) * plotW;
    const yToPx = (o2) => padT + plotH - ((Math.min(40, Math.max(15, o2)) - 15) / 25) * plotH;

    // 1. Draw Smooth 2D Regime Contour Background (Blue = Self-Extinction, Yellow = Cool Flame/Pyrolysis, Red = Sustained Spread)
    const cols = 48, rows = 32;
    const cellW = plotW / cols;
    const cellH = plotH / rows;

    const matLoiMap = { cotton: 17.5, pmma: 17.2, pvc: 21.5, nomex: 27.0, custom: 19.5 };
    const baseLoi = matLoiMap[this.lastInputs.material_id] || 18.0;

    for (let ix = 0; ix < cols; ix++) {
      for (let iy = 0; iy < rows; iy++) {
        const ug = (ix + 0.5) / cols * 40;
        const o2 = 15 + ((rows - 1 - iy + 0.5) / rows) * 25;

        // Microgravity flammability boundary curve (U-shaped quenching at Ug < 1.5 and blowoff at high Ug)
        const flowPenalty = ug < 1.8 ? (1.8 - ug) * 2.8 : (ug > 30 ? (ug - 30) * 0.22 : -1.2 * Math.sin((ug / 25) * Math.PI));
        const critO2 = baseLoi + flowPenalty;

        let fill = "rgba(30, 64, 175, 0.42)"; // Blue Zone: Autoextinción / Quenching
        if (o2 >= critO2 + 1.8) {
          fill = "rgba(220, 38, 38, 0.42)";   // Red Zone: Propagación Sostenida
        } else if (o2 >= critO2 - 1.6) {
          fill = "rgba(234, 179, 8, 0.42)";   // Yellow Zone: Llama Fría (~600 K) / Pirólisis Límite
        }

        ctx.fillStyle = fill;
        ctx.fillRect(padL + ix * cellW, padT + iy * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }

    // 2. Grid lines & Axis Labels
    ctx.strokeStyle = "rgba(148, 163, 184, 0.22)";
    ctx.lineWidth = 1;
    ctx.font = "10px monospace";
    ctx.fillStyle = "#cbd5e1";

    [0, 10, 20, 30, 40].forEach(ug => {
      const px = xToPx(ug);
      ctx.beginPath();
      ctx.moveTo(px, padT);
      ctx.lineTo(px, padT + plotH);
      ctx.stroke();
      ctx.fillText(`${ug}`, px - 8, h - 16);
    });

    [15, 20, 25, 30, 35, 40].forEach(o2 => {
      const py = yToPx(o2);
      ctx.beginPath();
      ctx.moveTo(padL, py);
      ctx.lineTo(padL + plotW, py);
      ctx.stroke();
      ctx.fillText(`${o2}%`, 8, py + 3);
    });

    ctx.fillStyle = "#94a3b8";
    ctx.fillText(this.lang === "es" ? "Velocidad Flujo Ventilación U_g (cm/s) →" : "Ventilation Flow Velocity U_g (cm/s) →", padL + plotW / 2 - 95, h - 3);

    // 3. Plot White Experimental Points from NASA Database
    this.cachedExpScreenPts = [];
    this.allRows.forEach(r => {
      if (r.in_ventilation_flow_cm_s === null || r.in_o2_molar_fraction_pct === null) return;
      const px = xToPx(r.in_ventilation_flow_cm_s);
      const py = yToPx(r.in_o2_molar_fraction_pct);
      this.cachedExpScreenPts.push({ px, py, row: r });

      const isHovered = this.hoveredExp && this.hoveredExp.record_id === r.record_id;
      const isSameMat = r.material_id === this.lastInputs.material_id;

      ctx.beginPath();
      ctx.arc(px, py, isHovered ? 7.5 : (isSameMat ? 5.5 : 4.0), 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? "#22d3ee" : "#ffffff";
      ctx.fill();
      ctx.lineWidth = isSameMat ? 2 : 1;
      ctx.strokeStyle = isSameMat ? "#0f172a" : "#475569";
      ctx.stroke();
    });

    // 4. Plot Large Target Crosshair for Engineer's Current Simulation
    const curX = xToPx(this.lastInputs.in_ventilation_flow_cm_s);
    const curY = yToPx(this.lastInputs.in_o2_molar_fraction_pct);

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(curX, curY, 10, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(curX - 15, curY);
    ctx.lineTo(curX + 15, curY);
    ctx.moveTo(curX, curY - 15);
    ctx.lineTo(curX, curY + 15);
    ctx.stroke();

    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.arc(curX, curY, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  handleContourHover(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let found = null;
    for (const pt of this.cachedExpScreenPts) {
      const dist = Math.hypot(mx - pt.px, my - pt.py);
      if (dist <= 10) {
        found = pt.row;
        break;
      }
    }

    const card = document.getElementById("chart1-hover-card");
    if (found) {
      this.hoveredExp = found;
      if (card) {
        card.classList.remove("hidden");
        document.getElementById("hover-exp-id").textContent = `${found.record_id} (${found.material_id.toUpperCase()})`;
        document.getElementById("hover-exp-doc").textContent = found.document_id;
        document.getElementById("hover-exp-metrics").textContent =
          `O₂: ${found.in_o2_molar_fraction_pct}% | U_g: ${found.in_ventilation_flow_cm_s} cm/s | V_f: ${found.out_flame_spread_rate_mm_s ?? "N/A"} mm/s | ${found.out_combustion_regime}`;
        const imgEl = document.getElementById("hover-exp-img");
        const reg = found.out_combustion_regime || "STABLE_FLAME";
        imgEl.src = found.flame_image_url || EXPERIMENT_FLAME_SVGS[reg] || EXPERIMENT_FLAME_SVGS.STABLE_FLAME;
      }
    } else {
      this.hoveredExp = null;
      if (card) card.classList.add("hidden");
    }
    this.renderChart1Contour();
  }

  // ==========================================================================
  // CHART 2: LONGITUDINAL FLAME PROFILE & SPACE-TIME DIAGRAM (0-120s)
  // ==========================================================================
  renderChart2SpaceTime() {
    const canvas = document.getElementById("chart2SpaceTimeCanvas");
    if (!canvas || !canvas.parentElement) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    if (rect.width === 0) return;

    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

    const w = rect.width;
    const h = rect.height;
    const padL = 48, padR = 52, padT = 18, padB = 34;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    ctx.clearRect(0, 0, w, h);

    const out = this.lastPred.outputs;
    const baseVf = out.out_flame_spread_rate_mm_s.value || 0;
    const peakTempK = out.out_flame_temperature_k.value || 340;
    const tig = out.out_ignition_time_s.value || 5;
    const flowDir = this.lastInputs.in_flow_direction;

    // Generate 0..120s time series
    const series = [];
    let posMm = 0;
    let currentTemp = 295;

    for (let t = 0; t <= 120; t += 2) {
      if (t < tig) {
        currentTemp = 295 + ((peakTempK * 0.45 - 295) * (t / Math.max(1, tig)));
      } else if (this.hvacCutActive && t >= this.hvacCutTimeS) {
        const dtCut = t - this.hvacCutTimeS;
        const decay = Math.exp(-dtCut / 12.0);
        const instVf = baseVf * decay * 0.2;
        posMm += instVf * 2;
        currentTemp = 295 + (peakTempK - 295) * Math.exp(-dtCut / 18.0);
      } else {
        const dtBurn = t - tig;
        // Concurrent flow accelerates mildly; opposed flow is linear constant slope
        const accelFactor = flowDir === "CONCURRENT" ? (1.0 + 0.0045 * dtBurn) : 1.0;
        posMm += baseVf * accelFactor * 2;
        currentTemp = peakTempK - (peakTempK - 600) * Math.exp(-dtBurn / 6.0);
      }
      series.push({ t, posMm, tempK: currentTemp });
    }

    const maxPosMm = Math.max(200, Math.ceil(Math.max(...series.map(s => s.posMm)) / 50) * 50);
    const maxTempK = 2000;

    const tToPx = (t) => padL + (t / 120) * plotW;
    const posToPx = (mm) => padT + plotH - (mm / maxPosMm) * plotH;
    const tempToPx = (k) => padT + plotH - ((k - 250) / (maxTempK - 250)) * plotH;

    // Thermocouple horizontal reference lines (50 mm, 100 mm, 150 mm)
    ctx.strokeStyle = "rgba(51, 65, 85, 0.55)";
    ctx.lineWidth = 1;
    ctx.font = "10px monospace";

    [0, 50, 100, 150, 200].forEach(mm => {
      if (mm > maxPosMm) return;
      const py = posToPx(mm);
      ctx.beginPath();
      ctx.moveTo(padL, py);
      ctx.lineTo(padL + plotW, py);
      ctx.stroke();
      ctx.fillStyle = "#38bdf8";
      ctx.fillText(`${mm}mm`, 6, py + 3);
    });

    // Right Y-Axis Temperature labels (K)
    [500, 1000, 1500, 2000].forEach(k => {
      const py = tempToPx(k);
      ctx.fillStyle = "#fb923c";
      ctx.fillText(`${k}K`, w - padR + 6, py + 3);
    });

    // X-Axis Time labels (0s to 120s)
    [0, 30, 60, 90, 120].forEach(t => {
      const px = tToPx(t);
      ctx.beginPath();
      ctx.moveTo(px, padT);
      ctx.lineTo(px, padT + plotH);
      ctx.stroke();
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`${t}s`, px - 8, h - 15);
    });

    // Draw HVAC Cut vertical line if active
    if (this.hvacCutActive) {
      const cutX = tToPx(this.hvacCutTimeS);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cutX, padT);
      ctx.lineTo(cutX, padT + plotH);
      ctx.stroke();
      ctx.fillStyle = "#10b981";
      ctx.fillText("HVAC CUT (45s)", cutX + 4, padT + 12);
      ctx.restore();
    }

    // Left Axis Curve: Flame Front Position (mm) in Cyan
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    series.forEach((pt, i) => {
      const px = tToPx(pt.t);
      const py = posToPx(pt.posMm);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Right Axis Curve: Max Flame Temperature (K) in Orange
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach((pt, i) => {
      const px = tToPx(pt.t);
      const py = tempToPx(pt.tempK);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  // ==========================================================================
  // CHART 3: CABIN TOXICITY & SENSOR DETECTION TIME-SERIES (0-120s)
  // ==========================================================================
  renderChart3Toxicity() {
    const canvas = document.getElementById("chart3ToxicityCanvas");
    if (!canvas || !canvas.parentElement) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    if (rect.width === 0) return;

    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

    const w = rect.width;
    const h = rect.height;
    const padL = 46, padR = 46, padT = 18, padB = 34;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    ctx.clearRect(0, 0, w, h);

    const out = this.lastPred.outputs;
    const targetCo = out.out_co_concentration_ppm.value || 20;
    const targetSmoke = out.out_smoke_opacity_pct_m.value || 3.0;
    const tDet = out.out_estimated_detection_time_s.value || 12.0;

    const maxCoScale = Math.max(120, Math.ceil((targetCo * 1.15) / 50) * 50);
    const maxSmokeScale = Math.max(40, Math.ceil((targetSmoke * 1.2) / 10) * 10);

    const tToPx = (t) => padL + (t / 120) * plotW;
    const coToPx = (ppm) => padT + plotH - (Math.min(maxCoScale, ppm) / maxCoScale) * plotH;
    const smokeToPx = (op) => padT + plotH - (Math.min(maxSmokeScale, op) / maxSmokeScale) * plotH;

    // Grid
    ctx.strokeStyle = "rgba(51, 65, 85, 0.5)";
    ctx.lineWidth = 1;
    ctx.font = "10px monospace";

    [0, 30, 60, 90, 120].forEach(t => {
      const px = tToPx(t);
      ctx.beginPath();
      ctx.moveTo(px, padT);
      ctx.lineTo(px, padT + plotH);
      ctx.stroke();
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`${t}s`, px - 8, h - 15);
    });

    // Horizontal Dashed Line 1 (Yellow): ISS Laser Smoke Detector Alarm Threshold
    const smokeAlarmThreshold = Math.min(maxSmokeScale * 0.7, Math.max(4.0, targetSmoke * (tDet / 65)));
    const pyYellow = smokeToPx(smokeAlarmThreshold);
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, pyYellow);
    ctx.lineTo(padL + plotW, pyYellow);
    ctx.stroke();
    ctx.fillStyle = "#fde047";
    ctx.fillText(`ISS Laser Alarm (t ≈ ${tDet}s)`, padL + 6, pyYellow - 5);

    // Horizontal Dashed Line 2 (Red): NASA SMAC 1-Hour CO Lethal/Toxic Limit (55 ppm)
    const smacCoLimit = 55;
    if (smacCoLimit <= maxCoScale) {
      const pyRed = coToPx(smacCoLimit);
      ctx.strokeStyle = "#f43f5e";
      ctx.beginPath();
      ctx.moveTo(padL, pyRed);
      ctx.lineTo(padL + plotW, pyRed);
      ctx.stroke();
      ctx.fillStyle = "#fda4af";
      ctx.fillText("NASA SMAC Limit (55 ppm CO)", padL + plotW - 165, pyRed - 5);
    }
    ctx.restore();

    // Generate CO & Smoke accumulation curves
    const series = [];
    for (let t = 0; t <= 120; t += 2) {
      const effT = this.hvacCutActive && t > this.hvacCutTimeS ? this.hvacCutTimeS + (t - this.hvacCutTimeS) * 0.15 : t;
      const frac = 1.0 - Math.exp(-effT / 42.0);
      series.push({
        t,
        co: targetCo * frac,
        smoke: targetSmoke * (1.0 - Math.exp(-effT / 32.0))
      });
    }

    // Line 1: CO Concentration (ppm) in Purple/Rose
    ctx.strokeStyle = "#c084fc";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    series.forEach((pt, i) => {
      const px = tToPx(pt.t);
      const py = coToPx(pt.co);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Line 2: Smoke Opacity (%/m) in Emerald/Cyan
    ctx.strokeStyle = "#34d399";
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach((pt, i) => {
      const px = tToPx(pt.t);
      const py = smokeToPx(pt.smoke);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Axis scale labels
    ctx.fillStyle = "#c084fc";
    ctx.fillText(`${maxCoScale}ppm`, 4, padT + 8);
    ctx.fillStyle = "#34d399";
    ctx.fillText(`${maxSmokeScale}%/m`, w - padR + 4, padT + 8);
  }

  // ==========================================================================
  // CHART 4: RADAR (SPIDER) CHART OF MATERIAL TRADE-OFFS (5 AXES)
  // ==========================================================================
  renderChart4Radar() {
    const canvas = document.getElementById("chart4RadarCanvas");
    if (!canvas || !canvas.parentElement) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    if (rect.width === 0) return;

    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2 + 6;
    const radius = Math.min(w, h) * 0.34;

    const axesLabels = this.lang === "es"
      ? [
          "1. Resistencia Ignición (LOC)",
          "2. Baja Vel. Propagación",
          "3. Baja Toxicidad (CO/Ácidos)",
          "4. Detección Temprana",
          "5. Ligereza (Baja Densidad)"
        ]
      : [
          "1. Ignition Resistance (LOC)",
          "2. Low Spread Velocity",
          "3. Low Toxicity (CO/Acids)",
          "4. Early Detectability",
          "5. Lightness (Low Density)"
        ];

    const profiles = {
      nomex:  [92, 88, 68, 78, 76],
      cotton: [45, 32, 82, 88, 92],
      pmma:   [42, 54, 78, 72, 52],
      pvc:    [68, 74, 24, 92, 38],
      custom: [58, 60, 65, 65, 65]
    };

    // Dynamic adjustment of selected material scores based on current simulation outputs
    const out = this.lastPred.outputs;
    const curMat = this.lastInputs.material_id || "pmma";
    const baseScores = [...(profiles[curMat] || profiles.custom)];
    const vf = out.out_flame_spread_rate_mm_s.value || 0;
    const co = out.out_co_concentration_ppm.value || 100;
    baseScores[1] = Math.max(15, Math.min(98, Math.round(95 - vf * 22)));
    baseScores[2] = Math.max(15, Math.min(96, Math.round(95 - co / 6 - (out.out_acid_gas_hcl_ppm.value || 0))));

    const refScores = profiles[this.radarBaselineKey] || profiles.nomex;

    // Draw concentric pentagons
    ctx.strokeStyle = "rgba(71, 85, 105, 0.45)";
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1.0].forEach(level => {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        const x = cx + Math.cos(ang) * radius * level;
        const y = cy + Math.sin(ang) * radius * level;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    });

    // Draw spokes & labels
    ctx.font = "10px monospace";
    ctx.fillStyle = "#cbd5e1";
    for (let i = 0; i < 5; i++) {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const x = cx + Math.cos(ang) * radius;
      const y = cy + Math.sin(ang) * radius;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();

      const lx = cx + Math.cos(ang) * (radius + 22);
      const ly = cy + Math.sin(ang) * (radius + 16);
      ctx.textAlign = Math.cos(ang) > 0.2 ? "left" : (Math.cos(ang) < -0.2 ? "right" : "center");
      ctx.fillText(axesLabels[i], lx, ly);
    }
    ctx.textAlign = "left";

    // Draw ISS Reference Baseline Polygon (Dashed Slate/Amber)
    ctx.save();
    ctx.strokeStyle = "#fbbf24";
    ctx.fillStyle = "rgba(251, 191, 36, 0.12)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    refScores.forEach((sc, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const r = (sc / 100) * radius;
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Draw Selected Material Polygon (Solid Cyan)
    ctx.strokeStyle = "#22d3ee";
    ctx.fillStyle = "rgba(34, 211, 238, 0.22)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    baseScores.forEach((sc, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const r = (sc / 100) * radius;
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
