// ============================================================================
// CAPA DE COMUNICACIÓN API REST (FRONTEND <-> BACKEND <-> DATABASE)
// ============================================================================

import { API_CONFIG, DEFAULT_MATERIALS, NASA_EXPERIMENTS_SEED } from "./config.js";
import { computeLocalSimulation } from "./physics-engine.js";

export class SimulatorApiClient {
  constructor() {
    this.baseUrl = API_CONFIG.BASE_URL;
    this.backendOnline = false;
    this.materials = { ...DEFAULT_MATERIALS };
    this.experiments = [...NASA_EXPERIMENTS_SEED];
  }

  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        },
        signal: controller.signal
      });
      clearTimeout(id);
      return response;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  /**
   * 1. Carga el catálogo de materiales desde GET /api/v1/materials
   * Si el backend aún no está levantado, usa los materiales de respaldo.
   */
  async loadMaterials() {
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/materials`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      const map = {};
      list.forEach(item => {
        map[item.id] = {
          id: item.id,
          name: item.name,
          maptis_code: item.maptis_code,
          loi: Number(item.loi_1g_pct),
          baseVf: Number(item.base_spread_rate_mm_s),
          heatComb: Number(item.heat_of_combustion_kj_g),
          rho: Number(item.density_g_cm3),
          sootFactor: Number(item.soot_yield_mg_g),
          coFactor: Number(item.co_yield_ppm_base),
          hcl: Number(item.hcl_yield_ppm_base || 0),
          hf: Number(item.hf_yield_ppm_base || 0),
          hcn: Number(item.hcn_yield_ppm_base || 0)
        };
      });
      this.materials = map;
      this.backendOnline = true;
      return { online: true, materials: this.materials };
    } catch {
      this.backendOnline = false;
      return { online: false, materials: this.materials };
    }
  }

  /**
   * 2. Carga los experimentos reales de la NASA desde GET /api/v1/experiments
   */
  async loadExperiments() {
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/experiments`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.experiments = data;
      this.backendOnline = true;
      return { online: true, experiments: this.experiments };
    } catch {
      return { online: false, experiments: this.experiments };
    }
  }

  /**
   * 3. Envía los 7 parámetros de entrada a POST /api/v1/simulate
   * y devuelve los 4 módulos de salida.
   */
  async runSimulation(payload) {
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/simulate`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.backendOnline = true;
      return { ...data, source: "BACKEND_API" };
    } catch {
      this.backendOnline = false;
      return computeLocalSimulation(payload, this.materials);
    }
  }
}
