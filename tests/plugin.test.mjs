import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,mkdir,rm,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runInNewContext} from 'node:vm';
import {pluginFixture} from './fixtures.mjs';
const data={window:{}};runInNewContext(await readFile(new URL('../assets/catalog.js',import.meta.url),'utf8'),data);
const skins=JSON.parse(JSON.stringify(data.window.CHIIKAWA_SKINS));

test('only the four requested characters and their bounded persona profiles remain',()=>{
 assert.deepEqual(skins.map(s=>s.id),['chiikawa','hachiware','usagi','momonga']);
 for(const {id,persona} of skins){
  assert.equal(id,persona.id);
  for(const key of ['speakingStyle','contextHint']){assert.ok([...persona[key]].length<=300);assert.doesNotMatch(persona[key],/[\u0000-\u001f\u007f]/);}
  for(const example of Object.values(persona.examples))assert.ok(persona.contextHint.includes(example));
 }
});

test('first installation fetches pinned originals once; cached skins restore offline and unload cleanly',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dap-offline-'));
 const {bytes}=await pluginFixture(root,skins);
 const oldFetch=globalThis.fetch;let requests=0;const urls=[];globalThis.fetch=async url=>{requests++;urls.push(url);return new Response(bytes);};
 let active=null,persona=null,listener,closed=false,failApply=false;const values={},actions=new Map(),listeners=new Set(),messages=[];
 const api={apiVersion:2,supportedMotions:['sleep','feed_munch','groom','grabbed','success','dance'],getActiveSkin:()=>active,getActivePersona:()=>persona,onDidChange(fn){listeners.add(fn);return()=>listeners.delete(fn);},async registerSkin(skin){
  assert.ok(skin.grid.rows<=19);assert.ok(skin.grid.rows>=1);assert.equal(skin.animations.working_v2,undefined);
  assert.equal(skin.animations.groom_v2,undefined);
  for(const clip of Object.values(skin.animations))assert.ok(clip.row<skin.grid.rows);
  const id=`demo.${skin.id}`;
  return {id,async apply({usePersona}){if(failApply)throw Error('failed');active=id;persona=usePersona?id:null;for(const fn of listeners)fn();},async reset(){if(active===id){active=persona=null;for(const fn of listeners)fn();}},async dispose(){await this.reset();}};
 }};
 const ctx={pluginId:'demo',actions:{registerAction({id,callback}){actions.set(id,callback);}},trayMenu:{addItem(){}},radialMenu:{addItem(){}},host:{petSkins:api,settings:{values(){return {...values};},set(_section,key,value){values[key]=value;}},windows:{openPalette(){return{show(){},toggle(){},isDestroyed(){return closed;},close(){closed=true;},postMessage(m){messages.push(m);},onMessage(fn){listener=fn;return()=>listener=null;}};}}}};
 try{
  const {activate}=await import(pathToFileURL(join(root,'dap_chiikawa/plugin.mjs')).href);let stop=await activate(ctx);
  actions.get('open')();await listener({type:'ready'});assert.equal(messages.at(-1).assetsReady,false);
  assert.deepEqual(messages.at(-1).readySkinIds,['usagi','momonga']);
  for(const id of ['usagi','momonga']){
   await listener({type:'apply',id});assert.equal(active,`demo.${id}`);assert.equal(requests,0);
   await stop();closed=false;stop=await activate(ctx);assert.equal(active,`demo.${id}`);
   actions.get('open')();await listener({type:'ready'});assert.equal(messages.at(-1).assetsReady,false);
   assert.equal(requests,0,'first apply and saved character restore need no downloads');
  }
  await listener({type:'apply',id:'chiikawa'});assert.equal(active,'demo.momonga');
  await listener({type:'download-assets'});assert.equal(messages.at(-1).assetsReady,true);assert.equal(requests,2);
  assert.ok(urls.every(url=>!url.includes('momonga')&&!url.includes('usagi')),'both complete characters need no upstream artwork');
  assert.ok(urls.every(url=>url.startsWith('https://raw.githubusercontent.com/heelee912/chiikawa-dots-pets/bb96582f525fbdf88a236b4703433ae92bfd5888/pets/')));
  globalThis.fetch=()=>{throw Error('Cached reload must stay offline');};assert.equal(messages.at(-1).coverage.usagi.idle.status,'ready');assert.equal(messages.at(-1).coverage.usagi['running-right'].status,'ready');assert.equal(messages.at(-1).coverage.usagi['running-left'].status,'ready');assert.equal(messages.at(-1).coverage.usagi.grabbed.status,'ready');assert.equal(messages.at(-1).coverage.usagi.sleep.status,'ready');assert.equal(messages.at(-1).coverage.usagi.dance.status,'ready');
  for(const skin of skins){await listener({type:'apply',id:skin.id});assert.equal(active,`demo.${skin.id}`);assert.equal(persona,active);}
  await listener({type:'set-persona',enabled:false});assert.equal(persona,null);
  failApply=true;await listener({type:'set-persona',enabled:true});assert.equal(values.personaEnabled,false);failApply=false;
  await listener({type:'apply',id:'../outside'});assert.equal(active,'demo.momonga');
  await listener({type:'reset'});assert.equal(active,null);
  await listener({type:'apply',id:'momonga'});await stop();assert.equal(listeners.size,0);assert.equal(closed,true);
  stop=await activate(ctx);assert.equal(active,'demo.momonga');await stop();
  values.appliedCharacter='removed-character';stop=await activate(ctx);assert.equal(values.appliedCharacter,'');await stop();
  assert.equal(requests,2);
 }finally{globalThis.fetch=oldFetch;await rm(root,{recursive:true,force:true});}
});
