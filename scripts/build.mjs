import {readFile,writeFile} from 'node:fs/promises';
const skins=JSON.parse(await readFile(new URL('../assets/catalog.json',import.meta.url),'utf8'));
const source=JSON.parse(await readFile(new URL('../assets/originals.json',import.meta.url),'utf8'));
const assets=await readFile(new URL('../src/assets.mjs',import.meta.url),'utf8');
const plugin=await readFile(new URL('../src/plugin.template.mjs',import.meta.url),'utf8');
await writeFile(new URL('../dap_chiikawa/plugin.mjs',import.meta.url),assets+'\n'+plugin.replace('__SKINS_JSON__',JSON.stringify(skins)).replace('__SOURCE_JSON__',JSON.stringify(source)));
await writeFile(new URL('../assets/catalog.js',import.meta.url),'window.CHIIKAWA_SKINS = '+JSON.stringify(skins)+';\n');
