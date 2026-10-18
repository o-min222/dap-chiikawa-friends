import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decodeMotionPng,encodeMotionPng,prepareMotionSkin,planMotions} from '../src/motions.mjs';
const pack=JSON.parse(await readFile(new URL('../assets/motions.json',import.meta.url),'utf8'));
const skins=JSON.parse(await readFile(new URL('../assets/catalog.json',import.meta.url),'utf8'));

test('18 independent strips retain every frame and distinguish reviewed motion from the Usagi draft',async()=>{
 assert.equal(pack.length,18);assert.equal(new Set(pack.map(m=>m.id)).size,18);
 for(const motion of pack){
  const image=decodeMotionPng(await readFile(new URL('../'+motion.file,import.meta.url)));
  assert.equal(image.width,1536);assert.equal(image.height,208);
  assert.deepEqual(decodeMotionPng(encodeMotionPng(image)).pixels,image.pixels);
 }
 const coverage=skins.flatMap(s=>Object.values(planMotions(s,pack).coverage));
 assert.equal(coverage.filter(m=>m.status==='ready').length,17);
 assert.equal(coverage.filter(m=>m.status==='review').length,1);
 assert.equal(coverage.filter(m=>m.status==='substitute').length,46);
});

test('new installation composes all four skins from bundled strips without any original atlas',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dap-independent-'));
 try{
  await mkdir(join(root,'assets/atlases'),{recursive:true});await cp(new URL('../assets/generated',import.meta.url),join(root,'assets/generated'),{recursive:true});
  for(const skin of skins)for(const modern of [true,false]){
   const result=await prepareMotionSkin(root,skin,pack,modern,modern,`assets/atlases/${skin.id}-${modern?'modern':'legacy'}.png`);
   const image=decodeMotionPng(await readFile(join(root,result.spritesheetPath)));
   assert.ok(image.height<=4096);assert.equal(image.height,result.grid.rows*208);assert.equal(result.look,undefined);
   const {choices}=planMotions(skin,pack);
   for(const [key,clip] of Object.entries(result.animations)){
    const strip=decodeMotionPng(await readFile(join(root,choices[key].file)));
    assert.deepEqual(image.pixels.subarray(clip.row*strip.pixels.length,(clip.row+1)*strip.pixels.length),strip.pixels);
    assert.deepEqual(clip.holdsMs,choices[key].holdsMs);
   }
   if(!modern)assert.equal(Object.keys(result.animations).length,9);
  }
  const corrupted={...pack[0],sha256:'0'.repeat(64)};
  await assert.rejects(prepareMotionSkin(root,skins[0],[corrupted,...pack.slice(1)],true,true,'assets/atlases/broken.png'),/integrity/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('Momonga keeps the fixed idle-to-grab scale and both complete reading clips',async()=>{
 async function heights(id){
  const motion=pack.find(m=>m.id===id),image=decodeMotionPng(await readFile(new URL('../'+motion.file,import.meta.url)));
  return motion.holdsMs.map((_,frame)=>{
   let top=208,bottom=-1;
   for(let y=0;y<208;y++)for(let x=0;x<192;x++)if(image.pixels[(y*1536+frame*192+x)*4+3]>=128){top=Math.min(top,y);bottom=Math.max(bottom,y);}
   return bottom-top+1;
  });
 }
 assert.ok(Math.max(...await heights('momonga-grabbed'))<=Math.min(...await heights('momonga-idle'))*1.06);
 const working=pack.filter(m=>m.characterId==='momonga'&&['running','working_v2'].includes(m.motion));
 assert.equal(working.length,2);assert.ok(working.every(m=>m.holdsMs.length===8));
});
