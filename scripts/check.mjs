import {readFile,readdir,stat} from 'node:fs/promises';
import assert from 'node:assert/strict';
// Use file URLs for actual reads so paths with spaces and Windows drive letters remain valid.
const base=new URL('../',import.meta.url);
const iconUrl=new URL('icon.png',base);
const icon=await readFile(iconUrl);
assert.ok(icon.length<=512*1024,'radial icon must fit the DAP 512KB limit');
assert.ok(icon.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'icon must be a PNG');
assert.equal(icon.readUInt32BE(16),256);assert.equal(icon.readUInt32BE(20),256);
const manifest=await readFile(new URL('plugin.yaml',base),'utf8');
const metadata=JSON.parse(await readFile(new URL('package.json',base),'utf8'));
assert.match(manifest,new RegExp(`^version: ${metadata.version.replaceAll('.','\\.')}\\s*$`,'m'));
assert.match(manifest,/^min_app_version: "1\.6\.1"$/m);
assert.match(manifest,/^  - pet\.skin$/m);
assert.match(manifest,/^  - window\.palette$/m);
const tag=process.argv[2];if(tag?.startsWith('v'))assert.equal(tag,`v${metadata.version}`);
const entry=await readFile(new URL('dap_chiikawa/plugin.mjs',base),'utf8');
for(const match of entry.matchAll(/^import .* from "([^"]+)";/gm))assert.ok(match[1].startsWith('node:'),'only Node built-ins may remain external');
assert.ok(!entry.includes('__SKINS_JSON__')&&!entry.includes('__SOURCE_JSON__'));
const catalog=JSON.parse(await readFile(new URL('assets/catalog.json',base),'utf8'));
const source=JSON.parse(await readFile(new URL('assets/originals.json',base),'utf8'));
assert.equal(catalog.length,11);assert.deepEqual(catalog.map(s=>s.id),source.assets.map(s=>s.id));
let bytes=0,files=0;
async function walk(url){for(const item of await readdir(url,{withFileTypes:true})){
 if(['.git','.github','node_modules','dist','.DS_Store'].includes(item.name))continue;
 const file=new URL(encodeURIComponent(item.name)+(item.isDirectory()?'/':''),url);
 if(item.isDirectory())await walk(file);else{assert.ok(file.href===iconUrl.href||!/\.(png|gif|webp|jpe?g|mp4|part)$/i.test(item.name),'only the generated radial icon may ship; do not distribute original media');files++;bytes+=(await stat(file)).size;}
}}
await walk(base);assert.ok(files<=200&&bytes<=20*1024*1024);
console.log(`OK: ${files} installable files, ${bytes} bytes, generated icon only; version ${metadata.version}`);
