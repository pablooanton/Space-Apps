// Browser-only demo transport. Uses the same names and response contract as FastAPI.
import Papa from 'papaparse';
import initial from './demo.json';
let dataset = structuredClone(initial);
const nums = initial.columns.filter(k => k.startsWith('in_') && k !== 'in_flow_direction' || k.startsWith('out_') && !['out_combustion_regime','out_verdict_1g_vs_ug','out_optimal_sensor_type','out_recommended_mitigation'].includes(k));
const outputs = initial.columns.filter(k => k.startsWith('out_'));
const inputNumbers = nums.filter(k => k.startsWith('in_'));
const units = {out_flame_spread_rate_mm_s:'mm/s',out_flame_temperature_k:'K',out_ignition_time_s:'s',out_hrr_watts:'W',out_hrr_kilowatts:'kW',out_fri_risk_index:'/100',out_spread_rate_1g_ref_mm_s:'mm/s',out_safe_isolation_dist_mm:'mm',out_co_concentration_ppm:'ppm',out_soot_generation_rate_mg_g:'mg/g',out_smoke_opacity_pct_m:'%/m',out_acid_gas_hcl_ppm:'ppm',out_acid_gas_hf_ppm:'ppm',out_acid_gas_hcn_ppm:'ppm',out_mean_particle_diameter_um:'µm',out_estimated_detection_time_s:'s'};
function distance(a,b){return Math.hypot((a.in_o2_molar_fraction_pct-b.in_o2_molar_fraction_pct)/15,(Math.log1p(a.in_ventilation_flow_cm_s)-Math.log1p(b.in_ventilation_flow_cm_s))/Math.log(51),(a.in_material_thickness_mm-b.in_material_thickness_mm)/5,(a.in_cabin_pressure_kpa-b.in_cabin_pressure_kpa)/100,a.in_gravity_level_g-b.in_gravity_level_g,a.in_flow_direction===b.in_flow_direction?0:.3)}
function normalizeRegime(value){const v=String(value||'').toUpperCase().replaceAll(' ','_');if(/QUENCH|NO_IGNITION|SIN_IGNIC/.test(v))return 'NO_IGNITION';if(v.includes('EXTIN'))return 'SELF_EXTINCTION';if(/COOL|FRIA|FRÍA/.test(v))return 'COOL_FLAME';if(v.includes('BLOW'))return 'BLOW_OFF';return /FLAME|LLAMA/.test(v)?'STABLE_FLAME':v}
function heuristic(i){
 const o=i.in_o2_molar_fraction_pct,f=i.in_ventilation_flow_cm_s,h=i.in_material_thickness_mm,g=i.in_gravity_level_g;
 const active=o>=17&&f<42, spread=active?Math.max(0,(o-16)*.12*(1+Math.min(f,20)/35)/(1+h*.5)*(g<.1?1.15:1)):0,cool=active&&(o<19||f<2),hrr=spread*240;
 return {out_flame_spread_rate_mm_s:spread,out_combustion_regime:cool?'COOL_FLAME':active?'STABLE_FLAME':f>=42?'BLOW_OFF':'NO_IGNITION',out_flame_temperature_k:cool?605:active?1350:295,out_ignition_time_s:Math.max(1,14-(o-18)*.35+h*1.5),out_hrr_watts:hrr,out_hrr_kilowatts:hrr/1000,out_fri_risk_index:Math.min(100,Math.max(0,spread*16+o*.6)),out_verdict_1g_vs_ug:g<.1&&f>0?'HIGHER_RISK_IN_UG':'CONTEXT_DEPENDENT',out_spread_rate_1g_ref_mm_s:spread*.8,out_safe_isolation_dist_mm:35+spread*30,out_co_concentration_ppm:spread*90,out_soot_generation_rate_mg_g:spread*5,out_smoke_opacity_pct_m:spread*8,out_acid_gas_hcl_ppm:null,out_acid_gas_hf_ppm:null,out_acid_gas_hcn_ppm:null,out_mean_particle_diameter_um:.7,out_optimal_sensor_type:'PHOTOELECTRIC_LASER',out_estimated_detection_time_s:Math.max(3,22-spread*2),out_recommended_mitigation:'Isolate power; cut ventilation if approved; activate crew fire response protocol.'};
}
export function predictLocal(i){
 const material=dataset.rows.filter(r=>r.material_id===i.material_id);
 const direction=material.filter(r=>r.in_flow_direction===i.in_flow_direction);
 const selected=direction.length>=3?direction:material;
 const ranked=[...selected].sort((a,b)=>distance(i,a)-distance(i,b));
 const extrapolated=!selected.length||inputNumbers.some(k=>i[k]<Math.min(...selected.map(r=>r[k]))||i[k]>Math.max(...selected.map(r=>r[k])));
 const fallback=heuristic(i),result={};
 for(const k of outputs){
   const candidates=ranked.filter(r=>r[k]!=null&&r[k]!=='').slice(0,5),exact=candidates.length>0&&distance(i,candidates[0])<.015;
   if(exact||material.length>=3&&candidates.length>=3){
     const chosen=exact?candidates.slice(0,1):candidates;
     let value=chosen[0][k];
     if(nums.includes(k)){const weights=chosen.map(r=>1/Math.max(.005,distance(i,r))**2);value=chosen.reduce((sum,r,j)=>sum+r[k]*weights[j],0)/weights.reduce((a,b)=>a+b,0);value=k==='out_fri_risk_index'?Math.round(value):+value.toFixed(4)}
     else if(k==='out_combustion_regime')value=normalizeRegime(value);
     result[k]={value,unit:units[k]||'',source:exact?'experimental':extrapolated?'extrapolated':'interpolated',confidence:exact?'high':extrapolated||distance(i,chosen[0])>.9?'low':'medium',references:chosen.map(r=>({record_id:r.record_id,document_id:r.document_id}))};
   }else result[k]={value:fallback[k]??null,unit:units[k]||'',source:'heuristic',confidence:'low',references:[]};
 }
 return {outputs:result,nearest:ranked.slice(0,3).map(r=>({record_id:r.record_id,document_id:r.document_id,distance:+distance(i,r).toFixed(3),spread:r.out_flame_spread_rate_mm_s,regime:r.out_combustion_regime})),extrapolated,dataset_rows:dataset.rows.length};
}
function parse(content){
 const parsed=Papa.parse(content.replace(/^\uFEFF/,''),{header:true,skipEmptyLines:'greedy'});
 const headers=parsed.meta.fields||[],required=['record_id','material_id','in_flow_direction',...inputNumbers];
 const missing=required.filter(k=>!headers.includes(k));
 if(missing.length)throw Error('Missing required columns: '+missing.join(', '));
 const warnings=parsed.errors.map(e=>e.message),rows=[],seen=new Set();
 for(const [idx,raw]of parsed.data.entries()){
   const r=Object.fromEntries(initial.columns.map(k=>[k,raw[k]?.trim()||'']));
   for(const k of nums){const v=r[k];const number=Number(v.replace(',','.'));r[k]=!v||/^(nan|n\/a|null|none)$/i.test(v)||!Number.isFinite(number)?null:number;if(v&&r[k]===null&&!/^(nan|n\/a|null|none)$/i.test(v))warnings.push(`Row ${idx+2}: invalid ${k}`)}
   if(required.some(k=>r[k]==null||r[k]==='')){warnings.push(`Row ${idx+2}: missing required input; skipped`);continue}
   if(seen.has(r.record_id)){warnings.push(`Row ${idx+2}: duplicate record_id; skipped`);continue}
   seen.add(r.record_id);
   if(r.out_hrr_watts==null&&r.out_hrr_kilowatts!=null)r.out_hrr_watts=r.out_hrr_kilowatts*1000;
   if(r.out_hrr_kilowatts==null&&r.out_hrr_watts!=null)r.out_hrr_kilowatts=r.out_hrr_watts/1000;
   if(r.out_fri_risk_index!=null)r.out_fri_risk_index=Math.round(r.out_fri_risk_index);
   r.material_id=r.material_id.toLowerCase();r.in_flow_direction=r.in_flow_direction.toUpperCase();rows.push(r);
 }
 if(!rows.length)throw Error('No valid experiment rows');
 return {rows,columns:initial.columns,source:'uploaded',meta:{warnings,missing_columns:initial.columns.filter(k=>!headers.includes(k)),row_count:rows.length}};
}
export async function staticRequest(path,options={}){
 try{
  let data;
  if(path==='/api/simulate')data=predictLocal(JSON.parse(options.body));
  else if(path==='/api/dataset'&&options.method==='POST'){
   const file=options.body.get('file');if(!file||!file.name.toLowerCase().endsWith('.csv'))throw Error('Upload a CSV file');if(file.size>5000000)throw Error('CSV exceeds 5 MB');dataset=parse(await file.text());data={meta:dataset.meta,source:dataset.source};
  }else if(path==='/api/dataset')data=dataset;
  else if(path==='/api/health')data={ok:true,rows:dataset.rows.length,source:dataset.source};
  else throw Error('Unknown endpoint');
  return {ok:true,status:200,json:async()=>structuredClone(data)};
 }catch(e){return {ok:false,status:400,json:async()=>({detail:e.message})}}
}
