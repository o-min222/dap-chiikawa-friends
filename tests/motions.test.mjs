import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decodeMotionPng,encodeMotionPng,prepareMotionSkin} from '../src/motions.mjs';
const pack=JSON.parse(await readFile(new URL('../assets/motions.json',import.meta.url),'utf8'));
const skins=JSON.parse(await readFile(new URL('../assets/catalog.json',import.meta.url),'utf8'));

test('Momonga does not grow when idle changes to the grabbed clip',async()=>{
 async function heights(id){
  const motion=pack.find(m=>m.id===id), image=decodeMotionPng(await readFile(new URL('../'+motion.file,import.meta.url)));
  return motion.holdsMs.map((_,frame)=>{
   let top=208,bottom=-1;
   for(let y=0;y<208;y++)for(let x=0;x<192;x++)if(image.pixels[(y*image.width+frame*192+x)*4+3]>=128){top=Math.min(top,y);bottom=Math.max(bottom,y);}
   return bottom-top+1;
  });
 }
 const idle=(await heights('momonga-idle')).sort((a,b)=>a-b), grabbed=await heights('momonga-grabbed');
 const reference=(idle[2]+idle[3])/2;
 assert.ok(Math.max(...grabbed)<=reference*1.06,'Grabbed pose must retain idle body scale, allowing small limb movement');
});

test('all 17 approved strips decode losslessly and retain distinct character/action metadata',async()=>{
 assert.equal(new Set(pack.map(m=>m.id)).size,17);
 for(const motion of pack){
  const image=decodeMotionPng(await readFile(new URL('../'+motion.file,import.meta.url)));
  assert.equal(image.width,1536);assert.equal(image.height,208);
  assert.deepEqual(decodeMotionPng(encodeMotionPng(image)).pixels,image.pixels);
 }
 const dance=pack.find(m=>m.id==='momonga-dance');assert.deepEqual(dance.holdsMs,Array(8).fill(100));
});
test('extended atlases retain unchanged rows, both full working clips and bounded dimensions on old and new hosts',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dap-motion-pack-'));
 try{
  await mkdir(join(root,'assets/generated'),{recursive:true});
  for(const motion of pack)await copyFile(new URL('../'+motion.file,import.meta.url),join(root,motion.file));
  const original={width:1536,height:2288,pixels:Buffer.alloc(1536*2288*4,73)};
  for(const id of ['chiikawa','hachiware','momonga']){
   const skin=skins.find(s=>s.id===id);
   await writeFile(join(root,skin.spritesheetPath),encodeMotionPng(original));
   const extended=await prepareMotionSkin(root,skin,pack,true,true);
   const atlas=decodeMotionPng(await readFile(join(root,extended.spritesheetPath)));
   const replaced=id==='momonga'?new Set(['idle','running-left','running-right','running'].map(key=>skin.animations[key].row)):new Set();
   const rowBytes=1536*208*4;
   for(let row=0;row<11;row++)if(!replaced.has(row))assert.deepEqual(atlas.pixels.subarray(row*rowBytes,(row+1)*rowBytes),original.pixels.subarray(row*rowBytes,(row+1)*rowBytes));
   assert.ok(atlas.height<=4096);
   for(const motion of pack.filter(m=>m.characterId===id)){
    const clip=extended.animations[motion.motion];assert.deepEqual(clip.holdsMs,motion.holdsMs);
    const strip=decodeMotionPng(await readFile(join(root,motion.file)));
    assert.deepEqual(atlas.pixels.subarray(clip.row*strip.pixels.length,(clip.row+1)*strip.pixels.length),strip.pixels);
    if(motion.hops)assert.deepEqual(clip.hops,motion.hops);
   }
   const legacy=await prepareMotionSkin(root,skin,pack,false);
   assert.equal(legacy.grid.rows,11);assert.equal(Object.keys(legacy.animations).length,9);
   const previousHost=await prepareMotionSkin(root,skin,pack,true,false);
   assert.ok(previousHost.grid.rows*208<=4096);
   assert.equal(previousHost.animations.working_v2,undefined);
  }
  const broken=Buffer.from(await readFile(join(root,pack[0].file)));broken[100]^=1;
  await writeFile(join(root,pack[0].file),broken);
  await assert.rejects(prepareMotionSkin(root,skins[0],pack,true),/integrity/);
 }finally{await rm(root,{recursive:true,force:true});}
});
