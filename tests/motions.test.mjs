import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {addChiikawaOuterRing,decodeMotionPng,encodeMotionPng,prepareMotionSkin,planMotions,PRODUCTION_MOTIONS} from '../src/motions.mjs';
import {fixture} from './fixtures.mjs';
const pack=JSON.parse(await readFile(new URL('../assets/motions.json',import.meta.url),'utf8'));
const skins=JSON.parse(await readFile(new URL('../assets/catalog.json',import.meta.url),'utf8'));
const outlinedChiikawaMotions=new Set(['upstream-chiikawa-running-right','upstream-chiikawa-running-left']);

test('Chiikawa outer ring changes only exterior RGB within three pixels',()=>{
 const width=26,height=13,frameWidth=13,pixels=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const offset=(y*width+x)*4;
  pixels[offset]=(x*11+y)%256;pixels[offset+1]=(x+y*7)%256;pixels[offset+2]=(x*3+y*5)%256;
  pixels[offset+3]=x===3&&y===6?127:0;
 }
 for(let y=4;y<=8;y++)for(let x=4;x<=8;x++)if(x===4||x===8||y===4||y===8){
  const offset=(y*width+x)*4;pixels[offset+3]=(x+y)%2?128:255;
 }
 const original=Buffer.from(pixels),outlined=addChiikawaOuterRing(pixels,width,height,frameWidth);
 assert.deepEqual(pixels,original,'the helper must not mutate its source');
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const offset=(y*width+x)*4,source=original.subarray(offset,offset+4),actual=outlined.subarray(offset,offset+4);
  assert.equal(actual[3],source[3],'alpha is preserved');
  const opaque=source[3]>=128;
  const enclosedHole=x>4&&x<8&&y>4&&y<8;
  let distance=Infinity;
  if(x<frameWidth)for(let oy=4;oy<=8;oy++)for(let ox=4;ox<=8;ox++)if(ox===4||ox===8||oy===4||oy===8)distance=Math.min(distance,Math.max(Math.abs(x-ox),Math.abs(y-oy)));
  const shouldChange=x<frameWidth&&!opaque&&!enclosedHole&&distance>=1&&distance<=3;
  if(shouldChange)assert.deepEqual([...actual],[55,25,22,source[3]]);
  else assert.deepEqual(actual,source,`unexpected change at ${x},${y}`);
 }
});

test('35 strips connect all approved Chiikawa motions and both click reactions',async()=>{
 assert.equal(pack.length,35);assert.equal(new Set(pack.map(m=>m.id)).size,35);
 for(const motion of pack){
  const image=decodeMotionPng(await readFile(new URL('../'+motion.file,import.meta.url)));
  assert.equal(image.width,1536);assert.equal(image.height,208);
  assert.deepEqual(decodeMotionPng(encodeMotionPng(image)).pixels,image.pixels);
  for(let frame=motion.holdsMs.length;frame<8;frame++)for(let y=0;y<208;y++)for(let x=0;x<192;x++){
   assert.equal(image.pixels[(y*1536+frame*192+x)*4+3],0,`${motion.id} padded cell ${frame} must stay transparent`);
  }
 }
 const coverage=skins.flatMap(s=>Object.values(planMotions(s,pack).coverage));
 assert.equal(coverage.filter(m=>m.status==='ready').length,39);
 assert.equal(coverage.filter(m=>m.status==='shared').length,2);
 assert.ok(!('jumping' in planMotions(skins[0],pack).coverage));
 assert.ok(!('waiting' in planMotions(skins[0],pack).coverage));
 assert.equal(coverage.filter(m=>m.status==='upstream').length,15);
 const chiikawa=planMotions(skins.find(s=>s.id==='chiikawa'),pack).coverage;
 assert.equal(chiikawa.idle.motionId,'chiikawa-idle');
 assert.equal(chiikawa.idle.status,'ready');
 assert.deepEqual(pack.find(m=>m.id==='chiikawa-idle').holdsMs,[700,220,220,220,90,90,300,500]);
 assert.equal(chiikawa.waving.motionId,'chiikawa-waving');
 assert.equal(chiikawa.running.motionId,'chiikawa-work');
 assert.equal(chiikawa.review.motionId,'chiikawa-review');
 assert.equal(chiikawa.working_v2.motionId,'chiikawa-study');
 assert.ok(['running-right','running-left'].every(key=>chiikawa[key].status==='upstream'));
 assert.ok(['idle','waving','running','review','sleep','feed_munch','groom','grabbed','dance','working_v2'].every(key=>chiikawa[key].status==='ready'));
 assert.deepEqual(pack.find(m=>m.id==='chiikawa-waving').holdsMs,[200,110,110,170,110,170,110,300]);
 assert.deepEqual(pack.find(m=>m.id==='chiikawa-work').holdsMs,[260,110,180,120,190]);
 assert.deepEqual(pack.find(m=>m.id==='chiikawa-review').holdsMs,[150,150,150,150,150,280]);
 assert.deepEqual(pack.find(m=>m.id==='chiikawa-study').holdsMs,[300,220,100]);
 const momonga=planMotions(skins.find(s=>s.id==='momonga'),pack).coverage;
 assert.equal(momonga.review.motionId,'momonga-review');
 assert.equal(momonga.review.status,'ready');
 assert.equal(momonga.waving.motionId,'momonga-happy');
 assert.equal(momonga.waving.status,'ready');
 assert.ok(Object.values(momonga).every(m=>m.source!=='upstream'));
 assert.equal(pack.find(m=>m.id==='momonga-review').holdsMs.reduce((a,b)=>a+b,0),2200);
 const usagi=planMotions(skins.find(s=>s.id==='usagi'),pack).coverage;
 assert.equal(usagi.waving.motionId,'usagi-happy');
 assert.ok(Object.values(usagi).every(m=>m.source!=='upstream'));
 assert.equal(usagi.review.motionId,'usagi-review');
 assert.equal(usagi.review.status,'ready');
 assert.equal(pack.find(m=>m.id==='usagi-review').holdsMs.reduce((a,b)=>a+b,0),2120);
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

test('upstream rows stay exact except Chiikawa left and right RGB rings; approved rows replace only their actions',async()=>{
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
    const source=choices[key].source==='upstream'?strip.pixels.subarray(choices[key].sourceRow*rowBytes,(choices[key].sourceRow+1)*rowBytes):strip.pixels;
    const expected=outlinedChiikawaMotions.has(choices[key].id)?addChiikawaOuterRing(source,1536,208,192):source;
    assert.deepEqual(image.pixels.subarray(clip.row*rowBytes,(clip.row+1)*rowBytes),expected);
    if(outlinedChiikawaMotions.has(choices[key].id)){
     const actual=image.pixels.subarray(clip.row*rowBytes,(clip.row+1)*rowBytes);
     assert.notDeepEqual(actual,source,'the selected runtime row receives its outer ring');
     for(let pixel=3;pixel<actual.length;pixel+=4)assert.equal(actual[pixel],source[pixel],'runtime outline must preserve source alpha');
    }
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

test('approved click reactions keep preview timing and compose every slot without originals',async()=>{
 for(const character of ['momonga','usagi']){
 const happy=pack.find(m=>m.id===character+'-happy');
 assert.equal(happy.reviewStatus,'approved');
 assert.deepEqual(happy.holdsMs,character==='momonga'?[120,180,260,300,260,240,240,400]:[120,180,220,300,220,180,280,500]);
 assert.deepEqual(happy.hops,character==='momonga'?[{startMs:180,durationMs:640,heightPx:6},{startMs:950,durationMs:450,heightPx:3}]:[{startMs:300,durationMs:500,heightPx:7}]);
 const image=decodeMotionPng(await readFile(new URL('../'+happy.file,import.meta.url)));
 const idle=decodeMotionPng(await readFile(new URL('../assets/generated/'+character+'-idle.png',import.meta.url)));
 for(let y=0;y<208;y++)for(const frame of[0,7]){
  const start=(y*1536+frame*192)*4;
  assert.deepEqual(image.pixels.subarray(start,start+192*4),idle.pixels.subarray(y*1536*4,(y*1536+192)*4));
 }
 const root=await mkdtemp(join(tmpdir(),'dap-'+character+'-happy-'));
 try{
  const {catalog}=await fixture(root,skins,{originals:false});
  const skin=catalog.find(s=>s.id===character);
  assert.ok(Object.values(planMotions(skin,pack).choices).every(m=>m.source!=='upstream'));
  for(const modern of [true,false]){
  const result=await prepareMotionSkin(root,skin,pack,modern,modern);
  const atlas=decodeMotionPng(await readFile(join(root,result.spritesheetPath)));
  const choices=planMotions(skin,pack).choices,rowBytes=1536*208*4;
  for(const [key,clip] of Object.entries(result.animations)){
   const expected=decodeMotionPng(await readFile(new URL('../'+choices[key].file,import.meta.url)));
   assert.deepEqual(atlas.pixels.subarray(clip.row*rowBytes,(clip.row+1)*rowBytes),expected.pixels);
  }
  if(modern)assert.deepEqual(result.animations.waving.hops,happy.hops);
  assert.deepEqual(result.animations.waving.holdsMs,happy.holdsMs);
  assert.equal(result.animations.failed.row,result.animations.idle.row);
  if(modern)assert.equal(result.animations.success.row,result.animations.waving.row);
  }
 }finally{await rm(root,{recursive:true,force:true});}
 }
});
