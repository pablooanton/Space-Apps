import React from 'react';
import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip,Legend,ReferenceLine,RadarChart,PolarGrid,PolarAngleAxis,PolarRadiusAxis,Radar} from 'recharts';

const colors={cyan:'#55dbe8',orange:'#ff9d60',yellow:'#f5ce69',red:'#f0686d',blue:'#608cff'};
const chartStyle={fontSize:11,fill:'#8ea3b5'};
const tip={contentStyle:{background:'#142331',border:'1px solid #2c4252',borderRadius:10,color:'#e5f3fa'}};
const n=(v,d=0)=>typeof v==='number'&&Number.isFinite(v)?v:d;

export function RegimeMap({rows,inputs,t}){
  const material=rows.filter(r=>r.material_id===inputs.material_id);
  const x=v=>42+v/40*570,y=v=>260-(v-15)/25*220;
  const cells=[];
  for(let i=0;i<40;i++)for(let j=0;j<25;j++){
    const flow=(i+.5),oxy=15+j+.5;
    const loc=17+(flow<2?2:0)+(flow>30?(flow-30)*.25:0);
    const fill=oxy<loc?'#183a5f':oxy<loc+2?'#756327':'#813b38';
    cells.push(<rect key={`${i}-${j}`} x={x(i)} y={y(16+j)} width={570/40+.4} height={220/25+.4} fill={fill} opacity=".6"/>);
  }
  return <div className="chart-wrap"><svg viewBox="0 0 650 305" role="img" aria-label={t.mapTitle} className="map-svg">
    <rect x="42" y="40" width="570" height="220" fill="#122637"/>{cells}
    {[0,10,20,30,40].map(v=><g key={v}><line x1={x(v)} x2={x(v)} y1="40" y2="260" stroke="#7893a4" opacity=".15"/><text x={x(v)} y="277" textAnchor="middle" fill="#9baebb" fontSize="11">{v}</text></g>)}
    {[15,20,25,30,35,40].map(v=><g key={v}><line x1="42" x2="612" y1={y(v)} y2={y(v)} stroke="#7893a4" opacity=".15"/><text x="32" y={y(v)+3} textAnchor="end" fill="#9baebb" fontSize="11">{v}</text></g>)}
    {material.map(r=><circle key={r.record_id} cx={x(n(r.in_ventilation_flow_cm_s))} cy={y(n(r.in_o2_molar_fraction_pct,15))} r="5" fill="#fff" stroke="#17222d" strokeWidth="2"><title>{`${r.record_id} · ${r.document_id}\n${r.out_combustion_regime} · ${r.out_flame_spread_rate_mm_s ?? '—'} mm/s\n${r.extraction_notes}`}</title></circle>)}
    <g transform={`translate(${x(Math.min(40,inputs.in_ventilation_flow_cm_s))},${y(Math.min(40,Math.max(15,inputs.in_o2_molar_fraction_pct)))})`}><circle r="11" fill="none" stroke={colors.cyan} strokeWidth="2"/><path d="M-16 0H16M0-16V16" stroke={colors.cyan} strokeWidth="2"/></g>
    <text x="327" y="298" textAnchor="middle" fill="#a9bdc8" fontSize="12">{t.flowAxis}</text><text x="13" y="155" transform="rotate(-90 13 155)" textAnchor="middle" fill="#a9bdc8" fontSize="12">{t.oxygenAxis}</text>
  </svg><div className="chart-legend"><span><i style={{background:'#245381'}}/> {t.extinction}</span><span><i style={{background:'#ac8c34'}}/> {t.cool}</span><span><i style={{background:'#ae504c'}}/> {t.sustained}</span><span><i style={{background:'#fff'}}/> {t.experiments}</span><span><i style={{background:colors.cyan}}/> {t.current}</span></div></div>;
}

export function FlameProfile({inputs,outputs,cutoff,t}){
  const rate=n(outputs.out_flame_spread_rate_mm_s?.value), ignition=n(outputs.out_ignition_time_s?.value,10), target=n(outputs.out_flame_temperature_k?.value,295);
  const regime=outputs.out_combustion_regime?.value;
  const data=Array.from({length:121},(_,sec)=>{let position=0,temp=295;if(sec>=ignition){let dt=sec-ignition;let base=rate*dt*(inputs.in_flow_direction==='CONCURRENT'?1+.015*dt:1);if(cutoff.active&&sec>=cutoff.time){let prior=Math.max(0,cutoff.time-ignition);let at=rate*prior*(inputs.in_flow_direction==='CONCURRENT'?1+.015*prior:1);base=at+rate*(inputs.in_o2_molar_fraction_pct>28?.18:0)*(sec-cutoff.time)+rate*4*(1-Math.exp(-(sec-cutoff.time)/4));}position=base;temp=295+(target-295)*(1-Math.exp(-dt/5));if((cutoff.active&&sec>=cutoff.time)||regime==='SELF_EXTINCTION'||regime==='NO_IGNITION')temp=295+(temp-295)*Math.exp(-Math.max(0,sec-(cutoff.active?cutoff.time:ignition+8))/10);}return {sec,position:+position.toFixed(2),temp:+temp.toFixed(1)};});
  return <ResponsiveContainer width="100%" height={245}><LineChart data={data} margin={{top:8,right:6,left:-12,bottom:4}}><CartesianGrid stroke="#253c4d" strokeDasharray="3 4"/><XAxis dataKey="sec" stroke="#8ea3b5" tick={chartStyle} label={{value:t.timeAxis,position:'insideBottom',offset:-3,fill:'#8ea3b5',fontSize:10}}/><YAxis yAxisId="left" stroke={colors.orange} tick={chartStyle}/><YAxis yAxisId="right" orientation="right" stroke={colors.cyan} tick={chartStyle}/><Tooltip {...tip}/><Legend verticalAlign="top" height={28}/><Line yAxisId="left" type="monotone" dataKey="position" name={t.positionAxis} stroke={colors.orange} dot={false} strokeWidth={2}/><Line yAxisId="right" type="monotone" dataKey="temp" name={t.tempAxis} stroke={colors.cyan} dot={false} strokeWidth={2}/>{cutoff.active&&<ReferenceLine yAxisId="left" x={cutoff.time} stroke={colors.yellow} strokeDasharray="4 4"/>}</LineChart></ResponsiveContainer>;
}

export function ToxicityChart({outputs,t}){
  const co=n(outputs.out_co_concentration_ppm?.value), opacity=n(outputs.out_smoke_opacity_pct_m?.value), detect=n(outputs.out_estimated_detection_time_s?.value,15);
  const data=Array.from({length:121},(_,sec)=>({sec,co:+(co*(1-Math.exp(-sec/38))).toFixed(1),opacity:+(opacity*(1-Math.exp(-sec/32))).toFixed(1)}));
  const trigger=co*(1-Math.exp(-detect/38));
  return <ResponsiveContainer width="100%" height={245}><LineChart data={data} margin={{top:8,right:6,left:-12,bottom:4}}><CartesianGrid stroke="#253c4d" strokeDasharray="3 4"/><XAxis dataKey="sec" stroke="#8ea3b5" tick={chartStyle} label={{value:t.timeAxis,position:'insideBottom',offset:-3,fill:'#8ea3b5',fontSize:10}}/><YAxis yAxisId="left" stroke={colors.orange} tick={chartStyle}/><YAxis yAxisId="right" orientation="right" stroke={colors.cyan} tick={chartStyle}/><Tooltip {...tip}/><Legend verticalAlign="top" height={28}/><Line yAxisId="left" name="CO (ppm)" dataKey="co" stroke={colors.orange} dot={false} strokeWidth={2}/><Line yAxisId="right" name={t.opacityAxis} dataKey="opacity" stroke={colors.cyan} dot={false} strokeWidth={2}/><ReferenceLine yAxisId="left" y={trigger} stroke={colors.yellow} strokeDasharray="4 4" label={{value:t.detectorThreshold,fill:colors.yellow,fontSize:10,position:'insideTopRight'}}/><ReferenceLine yAxisId="left" y={100} stroke={colors.red} strokeDasharray="4 4" label={{value:t.coReference,fill:colors.red,fontSize:10,position:'insideTopRight'}}/><ReferenceLine yAxisId="left" x={detect} stroke={colors.blue} strokeDasharray="3 4"/></LineChart></ResponsiveContainer>;
}

function avg(rows,key){const vals=rows.map(r=>r[key]).filter(v=>typeof v==='number'&&Number.isFinite(v));return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;}
function scores(rows){
  const flame=rows.filter(r=>['VISIBLE_STEADY_FLAME','STABLE_FLAME'].includes(r.out_combustion_regime));
  const loc=flame.length?Math.min(...flame.map(r=>r.in_o2_molar_fraction_pct)):null;
  const spread=avg(rows,'out_flame_spread_rate_mm_s'),hrr=avg(rows,'out_hrr_kilowatts');
  const tox=['out_co_concentration_ppm','out_acid_gas_hcl_ppm','out_acid_gas_hf_ppm','out_acid_gas_hcn_ppm'].map(k=>avg(rows,k));
  const particle=avg(rows,'out_mean_particle_diameter_um'),opacity=avg(rows,'out_smoke_opacity_pct_m'),thick=avg(rows,'in_material_thickness_mm'),isolation=avg(rows,'out_safe_isolation_dist_mm');
  const clamp=v=>Math.max(0,Math.min(100,Math.round(v)));
  return [loc==null?null:clamp((loc-15)*4),spread==null?null:clamp(100-spread*15-(hrr??0)*15),tox.every(v=>v==null)?null:clamp(100-(tox[0]??0)*.13-(tox[1]??0)*.25-(tox[2]??0)*.4-(tox[3]??0)*.6),particle==null?null:clamp(35+particle*38+(opacity??0)*.4),thick==null?null:clamp(100-thick*12-(isolation??0)*.12)];
}
export function MaterialRadar({rows,inputs,t}){
  const current=scores(rows.filter(r=>r.material_id===inputs.material_id));const base=scores(rows.filter(r=>r.material_id==='nomex'));
  const labels=[t.ignitionResistance,t.lowSpread,t.lowToxicity,t.detectability,t.efficiency];
  const data=labels.map((axis,i)=>({axis,current:current[i],baseline:base[i]}));
  return <><ResponsiveContainer width="100%" height={245}><RadarChart data={data} outerRadius="68%"><PolarGrid stroke="#304555"/><PolarAngleAxis dataKey="axis" tick={{fill:'#afc0cb',fontSize:10}}/><PolarRadiusAxis domain={[0,100]} tick={{fill:'#758b9c',fontSize:9}}/><Tooltip {...tip}/><Legend verticalAlign="top" height={20}/><Radar name={inputs.material_id.toUpperCase()} dataKey="current" stroke={colors.orange} fill={colors.orange} fillOpacity={.25} connectNulls/><Radar name="Nomex" dataKey="baseline" stroke={colors.cyan} fill={colors.cyan} fillOpacity={.14} connectNulls/></RadarChart></ResponsiveContainer><p className="small-note">{t.radarNote}</p></>;
}
