import {readFile,readdir,stat} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {planMotions} from '../src/motions.mjs';
// Use file URLs for actual reads so paths with spaces and Windows drive letters remain valid.
const base=new URL('../',import.meta.url);
const iconUrl=new URL('icon.png',base);
const motions=JSON.parse(await readFile(new URL('assets/motions.json',base),'utf8'));
assert.equal(motions.length,60);
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
assert.doesNotMatch(entry,/downloadOriginalAssets|hasOriginalAssets|raw\.githubusercontent|heelee912|__SOURCE_JSON__/,'runtime must have no external image source');
const catalog=JSON.parse(await readFile(new URL('assets/catalog.json',base),'utf8'));
assert.deepEqual(catalog.map(s=>s.id),['chiikawa','hachiware','usagi','momonga','shisa']);
assert.ok(motions.every(m=>catalog.some(s=>s.id===m.characterId)));
assert.ok(catalog.every(skin=>Object.values(planMotions(skin,motions).choices).every(motion=>motion.source!=='upstream')),'all five characters must stay independent');
const shisa=planMotions(catalog.find(skin=>skin.id==='shisa'),motions).choices;
assert.equal(shisa.idle.id,'shisa-idle');
assert.equal(shisa['running-right'].id,'shisa-move-right');
assert.equal(shisa['running-left'].id,'shisa-move-left');
assert.equal(shisa.waving.id,'shisa-happy');
assert.equal(shisa.running.id,'shisa-work');
assert.equal(shisa.review.id,'shisa-review');
assert.equal(shisa.sleep.id,'shisa-sleep');
assert.equal(shisa.feed_munch.id,'shisa-eat');
assert.equal(shisa.groom.id,'shisa-groom');
assert.equal(shisa.grabbed.id,'shisa-grabbed');
assert.equal(shisa.working_v2.id,'shisa-work');
assert.equal(shisa.success.id,'shisa-happy');
assert.equal(shisa.dance.id,'shisa-dance');
assert.equal(shisa.failed.id,'shisa-idle');
assert.ok(catalog.every(skin=>skin.originalAsset===undefined&&skin.spritesheetPath===undefined));
let bytes=0,files=0;
async function walk(url){for(const item of await readdir(url,{withFileTypes:true})){
 if(['.git','.github','node_modules','dist','outputs','.DS_Store'].includes(item.name))continue;
 const file=new URL(encodeURIComponent(item.name)+(item.isDirectory()?'/':''),url);
 if(item.isDirectory())await walk(file);else{if(url.href===new URL('assets/',base).href && /\.(png|part)$/.test(item.name))continue;assert.ok(file.href===iconUrl.href||generated.has(file.href)||!/\.(png|gif|webp|jpe?g|mp4|part)$/i.test(item.name),'only verified generated art may ship; do not distribute downloaded originals');files++;bytes+=(await stat(file)).size;}
}}
await walk(base);assert.ok(files<=200&&bytes<=20*1024*1024);
console.log(`OK: ${files} installable files, ${bytes} bytes, ${motions.length} verified generated motions; version ${metadata.version}`);
