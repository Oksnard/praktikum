import {mkdir,copyFile,readFile} from 'node:fs/promises';
await mkdir('dist/server',{recursive:true});
await copyFile('worker/index.js','dist/server/index.js');
// Root persists the native Site identity; do not generate or replace it here.
try {JSON.parse(await readFile('.openai/hosting.json','utf8'));await mkdir('dist/.openai',{recursive:true});await copyFile('.openai/hosting.json','dist/.openai/hosting.json');}catch(error){if(error.code!=='ENOENT')throw error;}
console.log('Worker ESM built; no secrets embedded');
