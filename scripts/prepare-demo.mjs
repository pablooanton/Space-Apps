import {readFileSync,writeFileSync} from 'node:fs';
import Papa from 'papaparse';
const parsed=Papa.parse(readFileSync(new URL('../data/experiments.csv',import.meta.url),'utf8'),{header:true,dynamicTyping:true,skipEmptyLines:true});
if(parsed.errors.length)throw new Error(JSON.stringify(parsed.errors));
writeFileSync(new URL('../src/demo.json',import.meta.url),JSON.stringify({rows:parsed.data,columns:parsed.meta.fields,meta:{warnings:[],missing_columns:[],row_count:parsed.data.length},source:'demo'}));
