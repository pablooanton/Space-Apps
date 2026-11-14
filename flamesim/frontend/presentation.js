// Presentation copy only. The supplied simulation controller and engines are unchanged.
function updatePresentation(){
 const es=document.getElementById('txt-app-title').textContent.includes('Simulador');
 document.documentElement.lang=es?'es':'en';
 const intro=document.querySelector('.workspace-intro');
 intro.querySelector('h2').textContent=es?'Resumen de simulación':'Simulation overview';
 intro.querySelector('p').textContent=es?'Define las condiciones de cabina. Evalúa la llama, el riesgo y la respuesta.':'Define cabin conditions. Assess flame behavior, crew risk and response.';
 intro.querySelector(':scope>span').innerHTML=es?'SEGURIDAD CONTRA INCENDIOS ESPACIALES<br>ENTORNO DE ANÁLISIS / 2026':'SPACECRAFT FIRE SAFETY<br>ANALYSIS WORKSPACE / 2026';
 const headings={
  'lbl-block1-title':es?'Dinámica de la llama':'Flame dynamics',
  'lbl-block2-title':es?'Evaluación de riesgo':'Risk assessment',
  'lbl-block3-title':es?'Emisiones y toxicidad':'Cabin emissions & toxicity',
  'lbl-block4-title':es?'Detección y respuesta':'Detection & response',
  'lbl-four-charts-heading':es?'Análisis de ingeniería':'Engineering analysis'
 };
 for(const[id,text]of Object.entries(headings)){const node=document.getElementById(id);if(!node.dataset.originalTitle)node.dataset.originalTitle=node.textContent.trim();node.title=node.dataset.originalTitle;node.textContent=text}
}
window.addEventListener('DOMContentLoaded',()=>{
 updatePresentation();
 new MutationObserver(updatePresentation).observe(document.getElementById('txt-app-title'),{childList:true,characterData:true,subtree:true});
});
