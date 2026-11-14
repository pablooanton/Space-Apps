import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
// Bundle the supplied application's unchanged controller and engines for direct opening.
execFileSync('node_modules/.bin/tailwindcss',['-c','flamesim/tailwind.config.cjs','-i','flamesim/frontend/css/base.css','-o','flamesim/frontend/css/utilities.css','--minify'],{stdio:'inherit'});
const result=await build({entryPoints:['flamesim/frontend/js/app.js'],bundle:true,format:'iife',write:false,target:'es2020'});
let html=readFileSync('flamesim/frontend/index.html','utf8');
html=html.replace(/<link[^>]*href="\.\/css\/([^\"]+)"[^>]*>/g,(_,file)=>'<style>'+readFileSync('flamesim/frontend/css/'+file,'utf8')+'</style>');
html=html.replace(/<script type="module" src="\.\/js\/app.js"><\/script>/,'<script>'+result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script>');
html=html.replace('<script src="./presentation.js"></script>','<script>'+readFileSync('flamesim/frontend/presentation.js','utf8')+'</script>');
mkdirSync('docs',{recursive:true});writeFileSync('docs/index.html',html);
console.log('Refined application bundled into docs/index.html');
