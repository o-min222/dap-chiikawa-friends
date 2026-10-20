import {readFile,readdir,stat} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
// Use file URLs for actual reads so paths with spaces and Windows drive letters remain valid.
const base=new URL('../',import.meta.url);
const iconUrl=new URL('icon.png',base);
const motions=JSON.parse(await readFile(new URL('assets/motions.json',base),'utf8'));
assert.equal(motions.length,35);
const generated=new Set();
for(const motion of motions){
 assert.match(motion.file,/^assets\/generated\/[a-z-]+\.png$/);
 const url=new URL(motion.file,base), data=await readFile(url);
 assert.equal(data.length,motion.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),motion.sha256);
 assert.equal(data.readUInt32BE(16),1536);assert.equal(data.readUInt32BE(20),208);
 assert.ok(motion.holdsMs.length>=1&&motion.holdsMs.length<=8);
 assert.ok(motion.holdsMs.every(hold=>Number.isInteger(hold)&&hold>=20&&hold<=5000));
 generated.add(url.href);
}
const icon=await readFile(iconUrl);
assert.ok(icon.length<=512*1024,'radial icon must fit the DAP 512KB limit');
assert.ok(icon.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'icon must be a PNG');
assert.equal(icon.readUInt32BE(16),256);assert.equal(icon.readUInt32BE(20),256);
const manifest=await readFile(new URL('plugin.yaml',base),'utf8');
const metadata=JSON.parse(await readFile(new URL('package.json',base),'utf8'));
assert.match(manifest,new RegExp(`^version: ${metadata.version.replaceAll('.','\\.')}\\s*$`,'m'));
assert.match(manifest,/^min_app_version: "1\.6\.14"$/m);
assert.match(manifest,/^  - pet\.skin$/m);
assert.match(manifest,/^  - window\.palette$/m);
const tag=process.argv[2];if(tag?.startsWith('v'))assert.equal(tag,`v${metadata.version}`);
const entry=await readFile(new URL('dap_chiikawa/plugin.mjs',base),'utf8');
for(const match of entry.matchAll(/^import .* from "([^"]+)";/gm))assert.ok(match[1].startsWith('node:'),'only Node built-ins may remain external');
assert.ok(!entry.includes('__SKINS_JSON__')&&!entry.includes('__SOURCE_JSON__'));
assert.match(entry,/downloadOriginalAssets/,'unreplaced motions retain the pinned source downloader');
const catalog=JSON.parse(await readFile(new URL('assets/catalog.json',base),'utf8'));
assert.deepEqual(catalog.map(s=>s.id),['chiikawa','hachiware','usagi','momonga']);
assert.ok(motions.every(m=>catalog.some(s=>s.id===m.characterId)));
const source=JSON.parse(await readFile(new URL('assets/originals.json',base),'utf8'));
assert.equal(source.repository,'heelee912/chiikawa-dots-pets');
assert.equal(source.commit,'bb96582f525fbdf88a236b4703433ae92bfd5888');
assert.deepEqual(source.assets.map(a=>a.id),catalog.map(s=>s.id));
for(const skin of catalog){const asset=source.assets.find(a=>a.id===skin.id);assert.equal(asset.sha256,skin.originalAsset.sha256);assert.equal(asset.bytes,skin.originalAsset.bytes);}
let bytes=0,files=0;
async function walk(url){for(const item of await readdir(url,{withFileTypes:true})){
 if(['.git','.github','node_modules','dist','outputs','.DS_Store'].includes(item.name))continue;
 const file=new URL(encodeURIComponent(item.name)+(item.isDirectory()?'/':''),url);
 if(item.isDirectory())await walk(file);else{if(url.href===new URL('assets/',base).href && /\.(png|part)$/.test(item.name))continue;assert.ok(file.href===iconUrl.href||generated.has(file.href)||!/\.(png|gif|webp|jpe?g|mp4|part)$/i.test(item.name),'only verified generated art may ship; do not distribute downloaded originals');files++;bytes+=(await stat(file)).size;}
}}
await walk(base);assert.ok(files<=200&&bytes<=20*1024*1024);
console.log(`OK: ${files} installable files, ${bytes} bytes, ${motions.length} verified generated motions; version ${metadata.version}`);
