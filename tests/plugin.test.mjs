import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm,cp} from 'node:fs/promises';
import {encodeMotionPng} from '../src/motions.mjs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
const skins=JSON.parse(await readFile(new URL('../assets/catalog.json',import.meta.url),'utf8'));
const animation={window:{}};runInNewContext(await readFile(new URL('../palette/animation.js',import.meta.url),'utf8'),animation);
test('all voice profiles fit DAP v2 and carry their situation examples into the actual prompt hint',()=>{
 for(const {persona} of skins){
  for(const key of ['speakingStyle','contextHint']){assert.ok([...persona[key]].length<=300);assert.doesNotMatch(persona[key],/[\u0000-\u001f\u007f]/);}
  assert.ok(persona.traits.length<=8);for(const trait of persona.traits)assert.ok([...trait].length<=40);
  for(const example of Object.values(persona.examples)){
   assert.ok([...example].length<=200);
   assert.ok(persona.contextHint.includes(example),'DAP 1.6.0 forwards contextHint, not the examples field');
  }
 }
});
test('all 11 characters keep 99 variable-duration motion cycles and 16 gaze directions',()=>{
 assert.equal(skins.length,11);
 for(const skin of skins){assert.equal(skin.id,skin.persona.id);assert.ok(skin.persona.contextHint.length<=300);assert.equal(Object.keys(skin.animations).length,9);
  for(const clip of Object.values(skin.animations)){let elapsed=0;clip.holdsMs.forEach((hold,column)=>{assert.equal(animation.window.ChiikawaAnimation.columnAt(clip.holdsMs,elapsed),column);elapsed+=hold;});assert.equal(animation.window.ChiikawaAnimation.columnAt(clip.holdsMs,elapsed),0);}
 }
 for(let i=0;i<16;i++){const angle=i*Math.PI/8,c=animation.window.ChiikawaAnimation.lookCell(Math.sin(angle),-Math.cos(angle));assert.equal((c.row-9)*8+c.column,i);}
});
test('no startup network; explicit download, all character switches, persona toggle, failure, reset and unload',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dap-plugin-')),bytes=encodeMotionPng({width:1536,height:2288,pixels:Buffer.alloc(1536*2288*4)});
 await mkdir(join(root,'assets'));await cp(new URL('../assets/generated',import.meta.url),join(root,'assets/generated'),{recursive:true});
 const checksum=createHash('sha256').update(bytes).digest('hex');
 const source=JSON.parse(await readFile(new URL('../assets/originals.json',import.meta.url),'utf8'));
 source.assets=source.assets.map(asset=>({...asset,bytes:bytes.length,sha256:checksum}));
 const text=(await readFile(new URL('../dap_chiikawa/plugin.mjs',import.meta.url),'utf8')).replace(/^const SOURCE = .*;$/m,'const SOURCE = '+JSON.stringify(source)+';');
 await mkdir(join(root,'dap_chiikawa'));await writeFile(join(root,'dap_chiikawa/plugin.mjs'),text);
 const oldFetch=globalThis.fetch;let requests=0;globalThis.fetch=async()=>{requests++;return new Response(bytes);};
 let active=null,persona=null,listener,closed=false,failApply=false;const values={},actions=new Map(),registrations=new Map(),listeners=new Set(),messages=[],radialItems=[];
 const api={apiVersion:2,supportedMotions:['sleep','feed_munch','groom','grabbed','success','dance'],getActiveSkin:()=>active,getActivePersona:()=>persona,onDidChange(fn){listeners.add(fn);return()=>listeners.delete(fn);},async registerSkin(skin){
  if(skin.id==='momonga'){assert.equal(skin.grid.rows,18);assert.equal(skin.animations.dance.holdsMs.reduce((a,b)=>a+b),800);assert.notEqual(skin.animations.sleep.row,skin.animations.grabbed.row);}
  if(skin.id==='chiikawa'){assert.equal(skin.grid.rows,17);assert.equal(skin.animations.success.hops.length,2);assert.notEqual(skin.animations.dance.row,skin.animations.jumping.row);}
  const id=`demo.${skin.id}`,reg={id,async apply({usePersona}){if(failApply)throw Error('failed');active=id;persona=usePersona?id:null;for(const fn of listeners)fn();},async reset(){if(active===id){active=persona=null;for(const fn of listeners)fn();}},async dispose(){await this.reset();}};registrations.set(skin.id,reg);return reg;}};
 const ctx={pluginId:'demo',actions:{registerAction({id,callback}){actions.set(id,callback);}},trayMenu:{addItem(){}},radialMenu:{addItem(item){radialItems.push(item);}},host:{petSkins:api,settings:{values(id){assert.equal(id,'demo.character');return {...values};},set(id,key,value){assert.equal(id,'demo.character');values[key]=value;}},windows:{openPalette(){return{show(){},toggle(){},isDestroyed(){return closed;},close(){closed=true;},postMessage(m){messages.push(m);},onMessage(fn){listener=fn;return()=>listener=null;}};}}}};
 try{
  const {activate}=await import(pathToFileURL(join(root,'dap_chiikawa/plugin.mjs')).href);const stop=await activate(ctx);assert.equal(requests,0);
  assert.equal(radialItems[0].icon,'icon.png');assert.ok(actions.has(radialItems[0].actionId));
  actions.get('open')();await listener({type:'ready'});assert.equal(messages.at(-1).assetsReady,false);
  await listener({type:'apply',id:'usagi'});assert.equal(active,null);assert.equal(requests,0);
  await listener({type:'download-assets'});assert.equal(requests,11);assert.equal(messages.at(-1).assetsReady,true);
  for(const skin of skins){await listener({type:'apply',id:skin.id});assert.equal(active,`demo.${skin.id}`);assert.equal(persona,active);}
  await listener({type:'set-persona',enabled:false});assert.equal(persona,null);
  failApply=true;await listener({type:'set-persona',enabled:true});assert.equal(values.personaEnabled,false);failApply=false;
  await listener({type:'apply',id:'../bad'});assert.equal(active,'demo.dekatsuyo');
  await listener({type:'reset'});assert.equal(active,null);assert.equal(values.appliedCharacter,'');
  await listener({type:'apply',id:'usagi'});await stop();assert.equal(active,null);assert.equal(listeners.size,0);assert.equal(closed,true);
  assert.equal(values.appliedCharacter,'usagi');
  const stopAgain=await activate(ctx);assert.equal(active,'demo.usagi');assert.equal(requests,11);
  active=persona='other.skin';for(const fn of listeners)fn();assert.equal(values.appliedCharacter,'');await stopAgain();assert.equal(active,'other.skin');
 }finally{globalThis.fetch=oldFetch;await rm(root,{recursive:true,force:true});}
});
