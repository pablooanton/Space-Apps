// ============================================================================
// FlameSim: Centralized i18n Dictionary (English default + Full Spanish)
// Covers all labels, tooltips, regimes, verdicts, mitigation, and PDF text.
// ============================================================================

export const I18N = {
  en: {
    appTitle: "FlameSim: Spacecraft Fire Safety Simulator",
    appSubtitle: "NASA Space Apps Challenge 2026 · Flame in Freefall Decision-Support Console",
    modelBadge: "Data-driven model v1 (interpolation on PSI/NASA experiments). Preliminary, not certified for flight decisions.",
    sampleWarningTitle: "SAMPLE DATA — NOT REAL FLIGHT CERTIFICATION EXPERIMENTS",
    sampleWarningDesc: "Currently running on the seeded 11-row NASA PSI sample CSV. Upload your full experimental CSV in the Data Page to replace.",
    nav: {
      simulator: "Simulator Dashboard",
      data: "Data & CSV Upload",
      sweep: "Parameter Sweep",
      compare: "Compare Scenarios",
      about: "Methodology & About"
    },
    presets: {
      title: "Mission Presets:",
      iss: "ISS Nominal (21% O₂, 101.3 kPa)",
      exploration: "Exploration Atmosphere (34% O₂, 56.5 kPa)",
      worstCase: "Worst-Case O₂ Rich (40% O₂, 15 cm/s)",
      coolFlame: "Cool Flame Regime (~605 K)",
      reset: "Reset"
    },
    inputs: {
      essentialTitle: "Essential Parameters",
      envTitle: "Environment (Cabin / Spacecraft)",
      o2Label: "1. Oxygen Mole Fraction (O₂)",
      o2Tooltip: "Molar percentage of O₂ in cabin atmosphere (15–50%). Higher O₂ drastically increases flame temperature and spread velocity.",
      flowLabel: "2. Ventilation Flow Velocity",
      flowTooltip: "HVAC forced airflow speed (0–50 cm/s). In microgravity, natural buoyancy vanishes so slow ventilation (5–20 cm/s) sustains combustion by supplying fresh O₂.",
      materialLabel: "3. Aerospace Material Type",
      materialTooltip: "Select a material from NASA PSI experiments or 'Custom' to force the physics-inspired heuristic model.",
      thicknessLabel: "4. Material Thickness",
      thicknessTooltip: "Sample thickness (0.05–10 mm). Thin materials heat through rapidly and burn faster.",
      pressureLabel: "5. Total Cabin Pressure",
      pressureTooltip: "Total ambient spacecraft pressure (20–150 kPa). Presets: ISS (101.3 kPa), Exploration (56.5 kPa), EVA Suit (29.6 kPa).",
      flowDirLabel: "6. Flow Direction vs. Flame",
      flowDirTooltip: "Concurrent (airflow moves with the flame front), Opposed (against flame front), or Quiescent (still air).",
      gravityLabel: "7. Gravity Level",
      gravityTooltip: "Gravity in units of Earth g: 0g (Microgravity), 0.16g (Moon), 0.38g (Mars), 1.0g (Earth).",
      materials: {
        cotton: "Cotton / SIBAL Fabric (Real Data)",
        pmma: "PMMA Cast Acrylic (Real Data)",
        pvc: "PVC / Tefzel Cable Insulation (Real Data)",
        nomex: "Nomex HT90-40 Flame Retardant (Real Data)",
        custom: "Custom (heuristic only, low confidence)"
      },
      flowDirs: {
        CONCURRENT: "Concurrent",
        OPPOSED: "Opposed",
        QUIESCENT: "Quiescent"
      }
    },
    cards: {
      block1Title: "1. Flame Dynamics & Flammability Map",
      spreadRate: "Flame Spread Rate (V_f)",
      spreadRateTooltip: "Velocity at which the pyrolysis front advances along the solid sample (mm/s).",
      regime: "Combustion Regime",
      regimeTooltip: "Physical state of combustion classified into 5 canonical microgravity regimes.",
      flameTemp: "Flame Temperature",
      flameTempTooltip: "Peak reaction zone temperature in Kelvin (~600 K for Cool Flame, ~1700–1900 K for Stable Flame).",
      ignitionTime: "Time to Ignition (t_ig)",
      ignitionTimeTooltip: "Delay from igniter energization to sustained pyrolysis/flame (seconds).",
      hrr: "Heat Release Rate (HRR)",
      hrrTooltip: "Thermal power released by combustion, auto-scaled in W or kW.",
      flammabilityMapTitle: "Flammability Map: O₂ (%) vs. Flow Velocity (cm/s)",
      flammabilityMapDesc: "Real experimental points for selected material (colored by regime) + current input crosshair (★).",

      block2Title: "2. Risk & Regulatory Assessment (NASA-STD-6001B)",
      friTitle: "Fire Risk Index (FRI 0–100)",
      friTooltip: "Composite spacecraft flammability risk index combining spread velocity, HRR, and O₂ margin.",
      verdictTitle: "1g vs. µg Comparative Verdict",
      verdictTooltip: "Side-by-side comparison between Microgravity (µg) and Earth normal gravity (1g).",
      safeDist: "Safe Isolation Distance",
      safeDistTooltip: "Minimum standoff distance (mm) so adjacent materials receive < 10 kW/m² radiative heat flux.",

      block3Title: "3. Cabin Emissions & Crew Toxicity (SMAC)",
      coLabel: "Carbon Monoxide (CO)",
      coTooltip: "Predicted cabin CO buildup (ppm) compared against NASA SMAC 1-hour (55 ppm) and 24-hour (15 ppm) limits.",
      sootLabel: "Soot Generation Rate",
      sootTooltip: "Mass of soot particulates emitted per gram of burned fuel (mg/g).",
      opacityLabel: "Smoke Opacity",
      opacityTooltip: "Optical light obscuration per meter (%/m).",
      acidGasesTitle: "Critical Acid Gases (HCl, HF, HCN)",
      acidGasesTooltip: "Corrosive/toxic acid gases in ppm. Shows 'No data' when not reported for non-halogenated/non-nitrogenated materials.",
      noData: "No data",
      crewImpact: {
        OK: "CREW IMPACT: NOMINAL / SAFE — Below SMAC toxicity thresholds.",
        CAUTION: "CREW IMPACT: CAUTION — Elevated CO/smoke; prepare portable breathing masks.",
        CRITICAL: "CREW IMPACT: CRITICAL — Exceeds NASA SMAC 1h lethal/corrosive limits! Immediate PBA mask required."
      },

      block4Title: "4. Sensing & Extinguishing Protocol",
      particleDiam: "Mean Emitted Particle Diameter (D_p)",
      particleDiamTooltip: "Aerodynamic count median diameter (µm). Longer residence time in µg causes larger soot aggregates (>0.7 µm).",
      optimalSensor: "Optimal Sensor & Detection Time",
      optimalSensorTooltip: "Recommended spacecraft fire detector technology and estimated time to alarm (s).",
      sensorComparisonTitle: "Detector Technology Response Comparison",
      mitigationTitle: "Recommended Mitigation Checklist (Flight Rules)",
      mitigationTooltip: "Prioritized operational action items for crew and ECLSS flight controllers."
    },
    regimes: {
      NO_IGNITION: {
        label: "NO IGNITION",
        desc: "Oxygen or heat flux is below the limiting flammability threshold. No sustained pyrolysis."
      },
      SELF_EXTINCTION: {
        label: "SELF-EXTINCTION",
        desc: "Diffusive oxygen starvation or radiative heat loss quenches the spherical flame in microgravity."
      },
      COOL_FLAME: {
        label: "COOL FLAME (~600 K)",
        desc: "Latent low-temperature pyrolysis (~600 K), invisible to the naked eye. High CO emission and risk of sudden hot re-ignition."
      },
      STABLE_FLAME: {
        label: "STABLE FLAME (~1800 K)",
        desc: "Sustained visible diffusion flame driven by forced ventilation airflow."
      },
      BLOW_OFF: {
        label: "BLOW-OFF EXTINCTION",
        desc: "Excessive airflow velocity cools the reaction zone faster than chemical kinetics can sustain."
      }
    },
    verdicts: {
      HIGHER_RISK_IN_UG: "This material is MORE flammable in microgravity (µg) than on Earth (1g).",
      LOWER_RISK_IN_UG: "This material is LESS flammable in microgravity (µg) due to diffusive O₂ starvation.",
      EQUIVALENT_RISK: "This material exhibits SIMILAR flammability in microgravity (µg) and on Earth (1g)."
    },
    sources: {
      experimental: "Experimental",
      interpolated: "Interpolated",
      extrapolated: "Extrapolated",
      heuristic: "Heuristic"
    },
    confidence: {
      high: "High conf.",
      medium: "Med conf.",
      low: "Low conf."
    },
    nearestPanel: {
      title: "Nearest NASA PSI Experiments Used for Interpolation",
      distance: "Feature Distance"
    },
    actions: {
      saveCompare: "+ Save to Compare (max 3)",
      exportPdf: "Download PDF Report",
      exportJson: "Export JSON",
      exportCsv: "Export CSV"
    }
  },
  es: {
    appTitle: "FlameSim: Simulador de Seguridad contra Incendios Espaciales",
    appSubtitle: "NASA Space Apps Challenge 2026 · Consola de Decisión de Llamas en Microgravedad",
    modelBadge: "Modelo basado en datos v1 (interpolación sobre experimentos PSI/NASA). Preliminar, no certificado para decisiones de vuelo.",
    sampleWarningTitle: "DATOS DE MUESTRA (SAMPLE DATA) — NO SON EXPERIMENTOS REALES DE CERTIFICACIÓN",
    sampleWarningDesc: "Ejecutando sobre el CSV de muestra de 11 filas. Sube tu CSV experimental completo en la pestaña 'Datos y Subida CSV'.",
    nav: {
      simulator: "Panel Simulador",
      data: "Datos y Subida CSV",
      sweep: "Barrido de Parámetros",
      compare: "Comparar Escenarios",
      about: "Metodología y Acerca de"
    },
    presets: {
      title: "Presets de Misión:",
      iss: "ISS Nominal (21% O₂, 101.3 kPa)",
      exploration: "Atmósfera Exploración (34% O₂, 56.5 kPa)",
      worstCase: "Peor Caso Rico en O₂ (40% O₂, 15 cm/s)",
      coolFlame: "Régimen Llama Fría (~605 K)",
      reset: "Reiniciar"
    },
    inputs: {
      essentialTitle: "Parámetros Esenciales",
      envTitle: "Datos del Entorno (Cabina / Nave)",
      o2Label: "1. Fracción Molar de Oxígeno (O₂)",
      o2Tooltip: "Porcentaje molar de O₂ en cabina (15–50%). Mayor O₂ incrementa drásticamente la temperatura y velocidad de propagación.",
      flowLabel: "2. Velocidad de Flujo de Ventilación",
      flowTooltip: "Velocidad del aire HVAC (0–50 cm/s). En microgravedad no hay convección natural; flujos lentos (5–20 cm/s) alimentan la llama.",
      materialLabel: "3. Tipo de Material Aeroespacial",
      materialTooltip: "Selecciona un material del repositorio NASA PSI o 'Personalizado' para usar el modelo heurístico físico.",
      thicknessLabel: "4. Espesor del Material",
      thicknessTooltip: "Espesor de la muestra (0.05–10 mm). Materiales delgados tienen menor inercia térmica y arden más rápido.",
      pressureLabel: "5. Presión Total de la Cabina",
      pressureTooltip: "Presión total de cabina (20–150 kPa). Presets: ISS (101.3 kPa), Exploración (56.5 kPa), EVA (29.6 kPa).",
      flowDirLabel: "6. Dirección del Flujo respecto a la Llama",
      flowDirTooltip: "Concurrente (a favor del frente de llama), Opuesto (a contracorriente) o Estanco/Quiescente (sin flujo).",
      gravityLabel: "7. Nivel de Gravedad",
      gravityTooltip: "Nivel de gravedad en unidades de g terrestre: 0g (Microgravedad), 0.16g (Luna), 0.38g (Marte), 1.0g (Tierra).",
      materials: {
        cotton: "Algodón / Tejido SIBAL (Datos Reales)",
        pmma: "Acrílico PMMA (Datos Reales)",
        pvc: "Aislamiento Cable PVC / Tefzel (Datos Reales)",
        nomex: "Nomex HT90-40 Ignífugo (Datos Reales)",
        custom: "Personalizado (solo heurística, baja confianza)"
      },
      flowDirs: {
        CONCURRENT: "Concurrente",
        OPPOSED: "Opuesto",
        QUIESCENT: "Estanco"
      }
    },
    cards: {
      block1Title: "1. Métricas de Dinámica de la Llama y Mapa de Inflamabilidad",
      spreadRate: "Velocidad de Propagación (V_f)",
      spreadRateTooltip: "Velocidad a la que avanza el frente de pirólisis sobre el material sólido (mm/s).",
      regime: "Régimen de Combustión",
      regimeTooltip: "Diagnóstico claro del estado físico clasificado en los 5 regímenes canónicos en microgravedad.",
      flameTemp: "Temperatura de la Llama",
      flameTempTooltip: "Temperatura pico de la zona de reacción en Kelvin (~600 K Llama Fría, ~1800 K Llama Estable).",
      ignitionTime: "Tiempo hasta la Ignición (t_ig)",
      ignitionTimeTooltip: "Tiempo en segundos desde la aplicación de calor hasta la ignición sostenida.",
      hrr: "Tasa de Liberación de Calor (HRR)",
      hrrTooltip: "Potencia térmica liberada por la combustión, auto-escalada en W o kW.",
      flammabilityMapTitle: "Mapa de Inflamabilidad: O₂ (%) vs. Flujo de Ventilación (cm/s)",
      flammabilityMapDesc: "Puntos experimentales reales del material seleccionado (coloreados por régimen) + marcador actual (★).",

      block2Title: "2. Evaluación de Riesgo y Cumplimiento Normativo",
      friTitle: "Índice de Riesgo de Inflamabilidad (FRI 0–100)",
      friTooltip: "Índice compuesto de riesgo espacial combinando velocidad de propagación, HRR y margen de oxígeno.",
      verdictTitle: "Veredicto Comparativo (1g vs. µg)",
      verdictTooltip: "Comparativa lado a lado entre Microgravedad (µg) y gravedad terrestre (1g).",
      safeDist: "Distancia Segura de Aislamiento",
      safeDistTooltip: "Distancia mínima en mm para que el flujo radiativo sea < 10 kW/m².",

      block3Title: "3. Perfil de Emisiones y Toxicidad en Cabina",
      coLabel: "Monóxido de Carbono (CO)",
      coTooltip: "Concentración de CO en cabina (ppm) comparada con los límites NASA SMAC de 1h (55 ppm) y 24h (15 ppm).",
      sootLabel: "Tasa de Generación de Hollín",
      sootTooltip: "Masa de hollín generada por gramo de material quemado (mg/g).",
      opacityLabel: "Opacidad del Humo",
      opacityTooltip: "Oscurecimiento óptico por metro (%/m).",
      acidGasesTitle: "Gases Ácidos Críticos (HCl, HF, HCN)",
      acidGasesTooltip: "Gases ácidos corrosivos/tóxicos en ppm. Muestra 'Sin datos' cuando no aplica o no se midió.",
      noData: "Sin datos",
      crewImpact: {
        OK: "IMPACTO EN TRIPULACIÓN: NOMINAL / SEGURO — Por debajo de umbrales tóxicos SMAC.",
        CAUTION: "IMPACTO EN TRIPULACIÓN: PRECAUCIÓN — CO/humo elevado; preparar máscaras respiratorias.",
        CRITICAL: "IMPACTO EN TRIPULACIÓN: CRÍTICO — ¡Supera límites letales/corrosivos SMAC 1h! Uso inmediato de máscara PBA."
      },

      block4Title: "4. Diagnóstico de Sensórica y Protocolo de Extinción",
      particleDiam: "Diámetro Medio de Partícula Emitida (D_p)",
      particleDiamTooltip: "Diámetro aerodinámico medio en µm. En microgravedad las partículas se aglomeran en tamaños mayores (>0.7 µm).",
      optimalSensor: "Sensor Óptimo y Tiempo de Detección",
      optimalSensorTooltip: "Tecnología de detección óptima y tiempo estimado de alarma (s).",
      sensorComparisonTitle: "Comparativa de Tiempo de Respuesta por Tipo de Sensor",
      mitigationTitle: "Estrategia de Mitigación Recomendada (Lista Priorizada)",
      mitigationTooltip: "Protocolo operativo priorizado para la tripulación y controladores de vuelo ECLSS."
    },
    regimes: {
      NO_IGNITION: {
        label: "NO IGNICIÓN",
        desc: "Fracción de oxígeno o flujo térmico inferior al límite de inflamabilidad. Sin pirólisis sostenida."
      },
      SELF_EXTINCTION: {
        label: "AUTOEXTINCIÓN",
        desc: "Inanición difusiva de O₂ o pérdidas radiativas apagan la llama esférica en microgravedad."
      },
      COOL_FLAME: {
        label: "LLAMA FRÍA (~600 K)",
        desc: "Pirólisis latente de baja temperatura (~600 K), invisible al ojo humano. Alta emisión de CO y riesgo de re-ignición súbita."
      },
      STABLE_FLAME: {
        label: "LLAMA ESTABLE (~1800 K)",
        desc: "Llama de difusión visible y sostenida impulsada por el flujo de ventilación."
      },
      BLOW_OFF: {
        label: "EXTINCIÓN POR SOPLADO",
        desc: "El exceso de velocidad de aire enfría la zona de reacción más rápido que la cinética química."
      }
    },
    verdicts: {
      HIGHER_RISK_IN_UG: "Este material es MÁS inflamable en microgravedad (µg) que en la Tierra (1g).",
      LOWER_RISK_IN_UG: "Este material es MENOS inflamable en microgravedad (µg) por inanición difusiva de O₂.",
      EQUIVALENT_RISK: "Este material presenta una inflamabilidad SIMILAR en microgravedad (µg) y en la Tierra (1g)."
    },
    sources: {
      experimental: "Experimental",
      interpolated: "Interpolado",
      extrapolated: "Extrapolado",
      heuristic: "Heurístico"
    },
    confidence: {
      high: "Conf. Alta",
      medium: "Conf. Media",
      low: "Conf. Baja"
    },
    nearestPanel: {
      title: "Experimentos NASA PSI Más Cercanos Usados en la Interpolación",
      distance: "Distancia Normalizada"
    },
    actions: {
      saveCompare: "+ Guardar en Comparador (máx 3)",
      exportPdf: "Descargar Informe PDF",
      exportJson: "Exportar JSON",
      exportCsv: "Exportar CSV"
    }
  }
};
