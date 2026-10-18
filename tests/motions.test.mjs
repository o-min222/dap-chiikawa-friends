import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decodeMotionPng,encodeMotionPng,prepareMotionSkin,planMotions,PRODUCTION_MOTIONS} from '../src/motions.mjs';
import {fixture} from './fixtures.mjs';
const pack=JSON.parse(await readFile(new URL('../assets/motions.json',import.meta.url),'utf8'));
const skins=JSON.parse(await readFile(new URL('../assets/catalog.json',import.meta.url),'utf8'));

test('26 independent strips connect approved Usagi motions',async()=>{
 assert.equal(pack.length,26);assert.equal(new Set(pack.map(m=>m.id)).size,26);
 for(const motion of pack){
  const image=decodeMotionPng(await readFile(new URL('../'+motion.file,import.meta.url)));
  assert.equal(image.width,1536);assert.equal(image.height,208);
  assert.deepEqual(decodeMotionPng(encodeMotionPng(image)).pixels,image.pixels);
 }
 const coverage=skins.flatMap(s=>Object.values(planMotions(s,pack).coverage));
 assert.equal(coverage.filter(m=>m.status==='ready').length,26);
 assert.equal(coverage.filter(m=>m.status==='shared').length,3);
 assert.ok(!('jumping' in planMotions(skins[0],pack).coverage));
 assert.ok(!('waiting' in planMotions(skins[0],pack).coverage));
 assert.equal(coverage.filter(m=>m.status==='upstream').length,27);
 const usagi=planMotions(skins.find(s=>s.id==='usagi'),pack).coverage;
 assert.equal(usagi.idle.status,'ready');
 assert.equal(usagi['running-right'].status,'ready');
 assert.equal(usagi['running-left'].status,'ready');
 assert.equal(usagi.grabbed.status,'ready');
 assert.equal(usagi.grabbed.motionId,'usagi-grabbed');
 assert.equal(usagi.sleep.status,'ready');
 assert.equal(usagi.sleep.motionId,'usagi-sleep');
 assert.equal(usagi.groom.motionId,'usagi-groom');
 assert.equal(usagi.groom.status,'ready');
 assert.ok(!pack.some(m=>m.id==='usagi-groom-bow'||m.motion==='groom_v2'));
 assert.equal(pack.find(m=>m.id==='usagi-groom').holdsMs.reduce((sum,hold)=>sum+hold,0),1600);
 assert.equal(pack.find(m=>m.id==='usagi-grabbed').holdsMs.reduce((sum,hold)=>sum+hold,0),1000);
 assert.equal(pack.find(m=>m.id==='usagi-sleep').holdsMs.reduce((sum,hold)=>sum+hold,0),3000);
 assert.equal(usagi.dance.status,'ready');
 assert.equal(usagi.dance.motionId,'usagi-dance');
 assert.deepEqual(pack.find(m=>m.id==='usagi-dance').holdsMs,[100,66,100,100,34]);
 assert.equal(pack.find(m=>m.id==='usagi-dance').reviewStatus,'approved');
 assert.equal(usagi.feed_munch.status,'ready');
 assert.equal(usagi.feed_munch.motionId,'usagi-eat');
 assert.equal(pack.find(m=>m.id==='usagi-eat').holdsMs.reduce((sum,hold)=>sum+hold,0),1440);
 assert.equal(usagi.running.status,'ready');
 assert.equal(usagi.running.motionId,'usagi-work');
 assert.equal(pack.find(m=>m.id==='usagi-work').holdsMs.reduce((sum,hold)=>sum+hold,0),320);
 assert.ok(!pack.some(m=>m.id==='usagi-dance-step'),'additional dance stays a separate preview until integration');
 assert.ok(!pack.some(m=>m.reviewStatus==='deferred'||m.reviewStatus==='awaiting-user-review'));
 assert.deepEqual(pack.find(m=>m.id==='usagi-move-left').holdsMs,pack.find(m=>m.id==='usagi-move-right').holdsMs);
});

test('unreplaced rows retain original pixels and holds; approved rows replace only their own actions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dap-independent-'));
 try{
  await mkdir(join(root,'assets/atlases'),{recursive:true});
  const {catalog}=await fixture(root,skins);
  for(const skin of catalog)for(const modern of [true,false]){
   const result=await prepareMotionSkin(root,skin,pack,modern,modern,`assets/atlases/${skin.id}-${modern?'modern':'legacy'}.png`);
   const image=decodeMotionPng(await readFile(join(root,result.spritesheetPath)));
   assert.ok(image.height<=4096);assert.equal(image.height,result.grid.rows*208);assert.equal(result.look,undefined);
   const {choices}=planMotions(skin,pack);
   for(const [key,clip] of Object.entries(result.animations)){
    const strip=decodeMotionPng(await readFile(join(root,choices[key].file)));
    const rowBytes=1536*208*4;
    const expected=choices[key].source==='upstream'?strip.pixels.subarray(choices[key].sourceRow*rowBytes,(choices[key].sourceRow+1)*rowBytes):strip.pixels;
    assert.deepEqual(image.pixels.subarray(clip.row*rowBytes,(clip.row+1)*rowBytes),expected);
    assert.deepEqual(clip.holdsMs,choices[key].holdsMs);
   }
   if(!modern)assert.equal(Object.keys(result.animations).length,9);
  }
  const corrupted={...pack[0],sha256:'0'.repeat(64)};
  await assert.rejects(prepareMotionSkin(root,catalog[0],[corrupted,...pack.slice(1)],true,true,'assets/atlases/broken.png'),/integrity/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('Momonga grab and Usagi dance keep idle scale, and both Momonga reading clips remain complete',async()=>{
 async function heights(id){
  const motion=pack.find(m=>m.id===id),image=decodeMotionPng(await readFile(new URL('../'+motion.file,import.meta.url)));
  return motion.holdsMs.map((_,frame)=>{
   let top=208,bottom=-1;
   for(let y=0;y<208;y++)for(let x=0;x<192;x++)if(image.pixels[(y*1536+frame*192+x)*4+3]>=128){top=Math.min(top,y);bottom=Math.max(bottom,y);}
   return bottom-top+1;
  });
 }
 assert.ok(Math.max(...await heights('momonga-grabbed'))<=Math.min(...await heights('momonga-idle'))*1.06);
 assert.ok(Math.max(...await heights('usagi-dance'))<=Math.min(...await heights('usagi-idle'))*1.06);
 const working=pack.filter(m=>m.characterId==='momonga'&&['running','working_v2'].includes(m.motion));
 assert.equal(working.length,2);assert.ok(working.every(m=>m.holdsMs.length===8));
});

test('fully replaced character composes without downloading or reading originals',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dap-complete-'));
 try{
 const {catalog}=await fixture(root,skins,{originals:false});
 const skin=catalog.find(s=>s.id==='usagi'),base=pack.find(m=>m.id==='usagi-idle');
 const complete=PRODUCTION_MOTIONS.filter(k=>k!=='working_v2').map(key=>({...base,id:'complete-'+key,motion:key}));
 assert.ok(Object.values(planMotions(skin,complete).choices).every(m=>m.source!=='upstream'));
 await prepareMotionSkin(root,skin,complete,true,true);
 }finally{await rm(root,{recursive:true,force:true});}
});
