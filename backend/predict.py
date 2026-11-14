"""Replaceable, transparent nearest-neighbour demo model. Not flight software."""
import math

INPUTS = ['in_o2_molar_fraction_pct','in_ventilation_flow_cm_s','in_material_thickness_mm','in_cabin_pressure_kpa','in_flow_direction','in_gravity_level_g','material_id']
NUMERIC_OUTPUTS = ['out_flame_spread_rate_mm_s','out_flame_temperature_k','out_ignition_time_s','out_hrr_watts','out_hrr_kilowatts','out_fri_risk_index','out_spread_rate_1g_ref_mm_s','out_safe_isolation_dist_mm','out_co_concentration_ppm','out_soot_generation_rate_mg_g','out_smoke_opacity_pct_m','out_acid_gas_hcl_ppm','out_acid_gas_hf_ppm','out_acid_gas_hcn_ppm','out_mean_particle_diameter_um','out_estimated_detection_time_s']
TEXT_OUTPUTS = ['out_combustion_regime','out_verdict_1g_vs_ug','out_optimal_sensor_type','out_recommended_mitigation']
UNITS = {'out_flame_spread_rate_mm_s':'mm/s','out_flame_temperature_k':'K','out_ignition_time_s':'s','out_hrr_watts':'W','out_hrr_kilowatts':'kW','out_fri_risk_index':'/100','out_spread_rate_1g_ref_mm_s':'mm/s','out_safe_isolation_dist_mm':'mm','out_co_concentration_ppm':'ppm','out_soot_generation_rate_mg_g':'mg/g','out_smoke_opacity_pct_m':'%/m','out_acid_gas_hcl_ppm':'ppm','out_acid_gas_hf_ppm':'ppm','out_acid_gas_hcn_ppm':'ppm','out_mean_particle_diameter_um':'µm','out_estimated_detection_time_s':'s'}

def regime(value):
    v = str(value or '').upper().replace(' ', '_')
    if 'QUENCH' in v or 'NO_IGNITION' in v or 'SIN_IGNIC' in v: return 'NO_IGNITION'
    if 'EXTIN' in v: return 'SELF_EXTINCTION'
    if 'COOL' in v or 'FRIA' in v or 'FRÍA' in v: return 'COOL_FLAME'
    if 'BLOW' in v: return 'BLOW_OFF'
    return 'STABLE_FLAME' if 'FLAME' in v or 'LLAMA' in v else v

def distance(a,b):
    return math.sqrt(sum(x*x for x in [
        (a['in_o2_molar_fraction_pct']-b['in_o2_molar_fraction_pct'])/15,
        (math.log1p(a['in_ventilation_flow_cm_s'])-math.log1p(b['in_ventilation_flow_cm_s']))/math.log(51),
        (a['in_material_thickness_mm']-b['in_material_thickness_mm'])/5,
        (a['in_cabin_pressure_kpa']-b['in_cabin_pressure_kpa'])/100,
        (a['in_gravity_level_g']-b['in_gravity_level_g']),
        0 if a['in_flow_direction']==b['in_flow_direction'] else .3]))

def heuristic(inputs):
    o, flow, thick, gravity = (inputs[k] for k in ['in_o2_molar_fraction_pct','in_ventilation_flow_cm_s','in_material_thickness_mm','in_gravity_level_g'])
    active = o >= 17 and flow < 42
    spread = max(0, (o-16)*.12*(1+min(flow,20)/35)/(1+thick*.5)*(1.15 if gravity < .1 else 1)) if active else 0
    cool = active and (o < 19 or flow < 2)
    hrr = spread*240
    return {'out_flame_spread_rate_mm_s':spread,'out_combustion_regime':'COOL_FLAME' if cool else 'STABLE_FLAME' if active else 'BLOW_OFF' if flow>=42 else 'NO_IGNITION','out_flame_temperature_k':605 if cool else 1350 if active else 295,'out_ignition_time_s':max(1,14-(o-18)*.35+thick*1.5),'out_hrr_watts':hrr,'out_hrr_kilowatts':hrr/1000,'out_fri_risk_index':min(100,max(0,spread*16+o*.6)),'out_verdict_1g_vs_ug':'HIGHER_RISK_IN_UG' if gravity<.1 and flow>0 else 'CONTEXT_DEPENDENT','out_spread_rate_1g_ref_mm_s':spread*.8,'out_safe_isolation_dist_mm':35+spread*30,'out_co_concentration_ppm':spread*90,'out_soot_generation_rate_mg_g':spread*5,'out_smoke_opacity_pct_m':spread*8,'out_acid_gas_hcl_ppm':None,'out_acid_gas_hf_ppm':None,'out_acid_gas_hcn_ppm':None,'out_mean_particle_diameter_um':.7,'out_optimal_sensor_type':'PHOTOELECTRIC_LASER','out_estimated_detection_time_s':max(3,22-spread*2),'out_recommended_mitigation':'Isolate power; cut ventilation if approved; activate crew fire response protocol.'}

def predict(inputs, rows):
    material = [r for r in rows if r['material_id']==inputs['material_id']]
    selected = material if material else []
    if len(selected)>=3:
        direction = [r for r in selected if r['in_flow_direction']==inputs['in_flow_direction']]
        if len(direction)>=3: selected=direction
    ranked = sorted(selected,key=lambda r:distance(inputs,r))
    nearest = [{'record_id':r['record_id'],'document_id':r['document_id'],'distance':round(distance(inputs,r),3),'spread':r['out_flame_spread_rate_mm_s'],'regime':r['out_combustion_regime']} for r in ranked[:3]]
    extrapolated = any(not (min(r[k] for r in selected)<=inputs[k]<=max(r[k] for r in selected)) for k in ['in_o2_molar_fraction_pct','in_ventilation_flow_cm_s','in_material_thickness_mm','in_cabin_pressure_kpa','in_gravity_level_g']) if selected else True
    fallback = heuristic(inputs)
    outputs = {}
    for key in NUMERIC_OUTPUTS+TEXT_OUTPUTS:
        candidates = [r for r in ranked if r.get(key) is not None and r.get(key)!=''][:5]
        exact = bool(candidates and distance(inputs,candidates[0])<.015)
        use_data = exact or (len(material)>=3 and len(candidates)>=3)
        if use_data:
            chosen = candidates[:1] if exact else candidates
            if key in NUMERIC_OUTPUTS:
                weights = [1/max(.005,distance(inputs,r))**2 for r in chosen]
                value = sum(r[key]*w for r,w in zip(chosen,weights))/sum(weights)
                if key=='out_fri_risk_index': value=round(value)
                else: value=round(value,4)
            else:
                value=chosen[0][key]
                if key=='out_combustion_regime': value=regime(value)
            source='experimental' if len(chosen)==1 else 'extrapolated' if extrapolated else 'interpolated'
            confidence='high' if len(chosen)==1 else 'low' if extrapolated or distance(inputs,chosen[0])>.9 else 'medium'
            refs=[{'record_id':r['record_id'],'document_id':r['document_id']} for r in chosen]
        else:
            value=fallback.get(key)
            source='heuristic'
            confidence='low'
            refs=[]
        outputs[key]={'value':value,'unit':UNITS.get(key,''),'source':source,'confidence':confidence,'references':refs}
    # Keep the redundant HRR units synchronized.
    watts=outputs['out_hrr_watts']; kilo=outputs['out_hrr_kilowatts']
    if watts['value'] is None and kilo['value'] is not None: watts['value']=round(kilo['value']*1000,4)
    if kilo['value'] is None and watts['value'] is not None: kilo['value']=round(watts['value']/1000,4)
    return {'outputs':outputs,'nearest':nearest,'extrapolated':extrapolated,'dataset_rows':len(rows)}
