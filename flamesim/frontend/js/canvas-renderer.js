// ============================================================================
// RENDERIZADOR 2D DE CÁMARA DE COMBUSTIÓN (CANVAS ÓPTICO + IR)
// ============================================================================

export class FlameCanvasRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.animTick = 0;
    this.renderState = {
      o2: 21.0,
      flow: 12.0,
      thick: 1.5,
      flowDir: "concurrent",
      gravity: "ug",
      regime: "STEADY",
      flameLengthMm: 45
    };

    this.particles = Array.from({ length: 45 }, () => ({
      x: Math.random() * 600,
      y: Math.random() * 250,
      r: 1 + Math.random() * 2.5
    }));

    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  resize() {
    if (!this.canvas || !this.canvas.parentElement) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  }

  updateState(newState) {
    this.renderState = { ...this.renderState, ...newState };
  }

  start() {
    const loop = () => {
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  draw() {
    this.animTick += 0.05;
    const ctx = this.ctx;
    const w = this.canvas.width / window.devicePixelRatio;
    const h = this.canvas.height / window.devicePixelRatio;
    const st = this.renderState;

    ctx.clearRect(0, 0, w, h);

    // 1. Rejilla óptica
    ctx.strokeStyle = "rgba(30, 41, 59, 0.7)";
    ctx.lineWidth = 1;
    const gridStep = 28;
    for (let x = 0; x < w; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 2. Partículas trazadoras del flujo de ventilación
    const dirSign = st.flowDir === "opposed" ? -1 : (st.flowDir === "concurrent" ? 1 : 0);
    ctx.fillStyle = "rgba(56, 189, 248, 0.35)";
    this.particles.forEach(p => {
      p.x += dirSign * (st.flow * 0.08);
      if (st.gravity !== "ug") {
        const gUp = st.gravity === "earth" ? 1.2 : (st.gravity === "mars" ? 0.5 : 0.22);
        p.y -= gUp;
      }
      if (p.x > w) p.x = 0;
      if (p.x < 0) p.x = w;
      if (p.y < 0) p.y = h;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    });

    // 3. Muestra sólida en el túnel
    const sampleX = w * 0.24;
    const sampleW = w * 0.52;
    const sampleY = h * 0.63;
    const sampleThicknessPx = Math.max(4, Math.min(22, st.thick * 2.2));

    ctx.fillStyle = "#334155";
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(sampleX, sampleY, sampleW, sampleThicknessPx, 3);
    ctx.fill();
    ctx.stroke();

    const charX = sampleX + sampleW * 0.25;
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(charX - 18, sampleY, 36, sampleThicknessPx);

    const flameOriginX = charX;
    const flameOriginY = sampleY;

    // 4. Morfología de la llama según régimen y gravedad
    if (st.regime === "NO_IGNITION" || st.regime === "BLOWOFF") {
      ctx.fillStyle = "rgba(148, 163, 184, 0.25)";
      for (let i = 0; i < 4; i++) {
        const sx = flameOriginX + i * 12 * (dirSign || 1) + Math.sin(this.animTick + i) * 3;
        const sy = flameOriginY - 8 - i * 5;
        ctx.beginPath();
        ctx.arc(sx, sy, 5 + i * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (st.regime === "SMOLDERING") {
      const glow = ctx.createRadialGradient(flameOriginX, flameOriginY + 2, 2, flameOriginX, flameOriginY, 26);
      glow.addColorStop(0, "rgba(249, 115, 22, 0.95)");
      glow.addColorStop(0.5, "rgba(220, 38, 38, 0.5)");
      glow.addColorStop(1, "rgba(220, 38, 38, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(flameOriginX, flameOriginY + 2, 26, 0, Math.PI * 2);
      ctx.fill();
    } else if (st.gravity === "ug" && (st.flow < 2.0 || st.regime === "QUENCHING")) {
      const pulse = Math.sin(this.animTick * 2) * 2.5;
      const radius = (st.regime === "QUENCHING" ? 28 : 38) + pulse;
      const sphereGrad = ctx.createRadialGradient(flameOriginX, flameOriginY - 10, 4, flameOriginX, flameOriginY - 10, radius);
      sphereGrad.addColorStop(0, "rgba(224, 242, 254, 0.95)");
      sphereGrad.addColorStop(0.45, "rgba(56, 189, 248, 0.85)");
      sphereGrad.addColorStop(0.8, "rgba(37, 99, 235, 0.45)");
      sphereGrad.addColorStop(1, "rgba(30, 58, 138, 0)");
      ctx.fillStyle = sphereGrad;
      ctx.beginPath();
      ctx.arc(flameOriginX, flameOriginY - 10, radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (st.gravity === "ug") {
      const length = Math.min(165, Math.max(45, st.flameLengthMm * 1.45));
      const heightFlame = 28 + Math.min(20, st.o2 - 15) * 0.8;
      const tipX = flameOriginX + dirSign * length;
      const tipY = flameOriginY - heightFlame * 0.45 + Math.sin(this.animTick * 3) * 2.5;

      const gradOuter = ctx.createLinearGradient(flameOriginX, flameOriginY, tipX, tipY);
      gradOuter.addColorStop(0, "rgba(59, 130, 246, 0.92)");
      gradOuter.addColorStop(0.55, "rgba(96, 165, 250, 0.75)");
      gradOuter.addColorStop(1, "rgba(249, 115, 22, 0.15)");

      ctx.fillStyle = gradOuter;
      ctx.beginPath();
      ctx.moveTo(flameOriginX - dirSign * 14, flameOriginY);
      ctx.quadraticCurveTo(
        flameOriginX + dirSign * (length * 0.35),
        flameOriginY - heightFlame * 1.35,
        tipX,
        tipY
      );
      ctx.quadraticCurveTo(
        flameOriginX + dirSign * (length * 0.45),
        flameOriginY - 2,
        flameOriginX - dirSign * 6,
        flameOriginY
      );
      ctx.closePath();
      ctx.fill();
    } else {
      const gFactor = st.gravity === "earth" ? 1.0 : (st.gravity === "mars" ? 0.65 : 0.42);
      const plumeHeight = 65 * gFactor + (st.o2 - 18) * 1.8;
      const tiltX = dirSign * (st.flow * 1.1);
      const tipX = flameOriginX + tiltX + Math.sin(this.animTick * 4) * 3.5;
      const tipY = flameOriginY - plumeHeight;

      const gradPlume = ctx.createLinearGradient(flameOriginX, flameOriginY, tipX, tipY);
      gradPlume.addColorStop(0, "rgba(59, 130, 246, 0.85)");
      gradPlume.addColorStop(0.25, "rgba(250, 204, 21, 0.92)");
      gradPlume.addColorStop(0.75, "rgba(249, 115, 22, 0.85)");
      gradPlume.addColorStop(1, "rgba(239, 68, 68, 0)");

      ctx.fillStyle = gradPlume;
      ctx.beginPath();
      ctx.moveTo(flameOriginX - 18, flameOriginY);
      ctx.quadraticCurveTo(flameOriginX - 14 + tiltX * 0.3, flameOriginY - plumeHeight * 0.5, tipX, tipY);
      ctx.quadraticCurveTo(flameOriginX + 18 + tiltX * 0.3, flameOriginY - plumeHeight * 0.5, flameOriginX + 18, flameOriginY);
      ctx.closePath();
      ctx.fill();
    }
  }
}
