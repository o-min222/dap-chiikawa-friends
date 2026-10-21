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
const voiceScenarios=JSON.parse(await readFile(new URL('./voice-scenarios.json',import.meta.url),'utf8'));
const exactAddressInstructions={
 chiikawa:'[호칭] 온보딩·프로필의 공통 호칭은 무시해. 이 캐릭터와 대화 중 직접 지정한 호칭만 우선해. 전용 지정이 없으면 반드시 친구라고 조심스레 부르거나 몸짓으로 가리켜. 매번 부르진 마.',
 hachiware:'[호칭] 온보딩·프로필의 공통 호칭은 무시해. 이 캐릭터와 대화 중 직접 지정한 호칭만 우선해. 전용 지정이 없으면 반드시 친구야·너로 불러. 이 대화에서 이름을 알려주면 이름+아/야로 불러. 매번 부르진 마.',
 usagi:'[호칭] 온보딩·프로필의 공통 호칭은 무시해. 이 캐릭터와 대화 중 직접 지정한 호칭만 우선해. 전용 지정이 없으면 반드시 짧은 소리와 (너를 향한 몸짓)으로 말 걸고 긴 호칭은 붙이지 마.',
 momonga:'[호칭] 온보딩·프로필의 공통 호칭은 무시해. 이 캐릭터와 대화 중 직접 지정한 호칭만 우선해. 전용 지정이 없으면 반드시 너·거기 너로 불러. 주인님은 기본값이 아니야. 매번 부르진 마.'
};

test('only the four requested characters and their bounded persona profiles remain',()=>{
 assert.deepEqual(skins.map(s=>s.id),['chiikawa','hachiware','usagi','momonga']);
 for(const {id,persona} of skins){
  assert.equal(id,persona.id);
  for(const key of ['speakingStyle','contextHint']){assert.ok([...persona[key]].length<=300);assert.doesNotMatch(persona[key],/[\u0000-\u001f\u007f]/);}
  for(const example of Object.values(persona.examples))assert.ok(persona.contextHint.includes(example));
  assert.equal(persona.contextHint.slice(persona.contextHint.indexOf('[호칭]')),exactAddressInstructions[id]);
 }
 const momonga=skins.find(({id})=>id==='momonga').persona;
 assert.deepEqual(momonga.traits,['남의 몫도 자기 것처럼 탐냄','귀찮은 일은 뻔뻔하게 시킴','공은 가로채고 잘못은 남 탓함']);
 assert.match(momonga.speakingStyle,/남의 몫도 탐내고 귀찮은 일은 시키며.*자기 공.*남 탓/);
 assert.match(momonga.speakingStyle,/혐오·위협·가혹한 모욕·실제 도움 거부는 하지 마/);
});

test('voice scenarios cover character-local address overrides and isolation',()=>{
 assert.deepEqual(voiceScenarios.map(({id})=>id),[
  'greeting','comfort','compliment','explain','format','character-address','explicit-address',
  'global-address-is-not-character-override','address-does-not-leak-between-characters'
 ]);
 const global=voiceScenarios.find(({id})=>id==='global-address-is-not-character-override');
 assert.match(global.prompt,/온보딩 프로필.*주인님/);
 assert.match(global.review,/치이카와=친구, 하치와레=친구야·너, 우사기=짧은 소리와 사용자를 향한 몸짓, 모몽가=너·거기 너/);
 const isolated=voiceScenarios.find(({id})=>id==='address-does-not-leak-between-characters');
 assert.match(isolated.prompt,/다른 캐릭터.*민수님/);
 assert.match(isolated.review,/캐릭터별 채팅의 호칭 지정은 서로 독립적/);
});

test('first installation and cached restores keep all four characters offline',async()=>{
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
  actions.get('open')();await listener({type:'ready'});assert.equal(messages.at(-1).assetsReady,true);
  assert.deepEqual(messages.at(-1).readySkinIds,['chiikawa','hachiware','usagi','momonga']);
  for(const id of ['chiikawa','hachiware','usagi','momonga']){
   await listener({type:'apply',id});assert.equal(active,`demo.${id}`);assert.equal(requests,0);
   await stop();closed=false;stop=await activate(ctx);assert.equal(active,`demo.${id}`);
   actions.get('open')();await listener({type:'ready'});assert.equal(messages.at(-1).assetsReady,true);
   assert.equal(requests,0,'first apply and saved character restore need no downloads');
  }
  await listener({type:'download-assets'});assert.equal(messages.at(-1).assetsReady,true);assert.equal(requests,0);
  assert.deepEqual(urls,[],'all four characters must require zero upstream artwork');
  globalThis.fetch=()=>{throw Error('Cached reload must stay offline');};assert.equal(messages.at(-1).coverage.usagi.idle.status,'ready');assert.equal(messages.at(-1).coverage.usagi['running-right'].status,'ready');assert.equal(messages.at(-1).coverage.usagi['running-left'].status,'ready');assert.equal(messages.at(-1).coverage.usagi.grabbed.status,'ready');assert.equal(messages.at(-1).coverage.usagi.sleep.status,'ready');assert.equal(messages.at(-1).coverage.usagi.dance.status,'ready');
  for(const skin of skins){await listener({type:'apply',id:skin.id});assert.equal(active,`demo.${skin.id}`);assert.equal(persona,active);}
  await listener({type:'set-persona',enabled:false});assert.equal(persona,null);
  failApply=true;await listener({type:'set-persona',enabled:true});assert.equal(values.personaEnabled,false);failApply=false;
  await listener({type:'apply',id:'../outside'});assert.equal(active,'demo.momonga');
  await listener({type:'reset'});assert.equal(active,null);
  await listener({type:'apply',id:'momonga'});await stop();assert.equal(listeners.size,0);assert.equal(closed,true);
  stop=await activate(ctx);assert.equal(active,'demo.momonga');await stop();
  values.appliedCharacter='removed-character';stop=await activate(ctx);assert.equal(values.appliedCharacter,'');await stop();
  assert.equal(requests,0);
 }finally{globalThis.fetch=oldFetch;await rm(root,{recursive:true,force:true});}
});
