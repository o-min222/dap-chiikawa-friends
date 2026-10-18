import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const catalog={window:{}};runInNewContext(await readFile(new URL('../assets/catalog.js',import.meta.url),'utf8'),catalog);
const skins=JSON.parse(JSON.stringify(catalog.window.CHIIKAWA_SKINS));
const source=await readFile(new URL('../palette/preview.js',import.meta.url),'utf8');
test('reopened palette selects active character once and preserves later preview selections',()=>{
 const elements=new Map();let receive;
 function element(id){if(!elements.has(id))elements.set(id,{value:id==='character'?'chiikawa':id==='motion'?'idle':'',listeners:{},attrs:{},append(){},addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(k,v){this.attrs[k]=v;},closest(){return element('stage');},getContext(){return{clearRect(){},drawImage(){}};}});return elements.get(id);}
 const window={CHIIKAWA_SKINS:skins,matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),addEventListener(){},dapPalette:{onMessage(fn){receive=fn;return()=>{};},postMessage(){}}};
 runInNewContext(source,{window,document:{getElementById:element,createElement:()=>({}),addEventListener(){}},Image:class{},cancelAnimationFrame(){},requestAnimationFrame(){return 1;}});
 const status={type:'status',available:true,activeId:'momonga',assetsReady:true,assetRevision:0,personaEnabled:true};
 receive(status);
 assert.equal(element('character').value,'momonga');assert.equal(element('apply').textContent,'모몽가 적용');assert.equal(element('apply').disabled,true);
 assert.equal(element('stage').attrs['aria-label'],'모몽가 모션 미리보기');
 element('character').value='usagi';element('character').listeners.change();receive({...status,busy:false});
 assert.equal(element('character').value,'usagi');assert.equal(element('apply').disabled,false);
 receive({...status,assetsReady:false,readySkinIds:['usagi','momonga']});
 assert.equal(element('apply').disabled,false);assert.equal(element('download-assets').hidden,true);
 element('character').value='chiikawa';element('character').listeners.change();
 assert.equal(element('apply').disabled,true);assert.equal(element('download-assets').hidden,false);
 element('character').value='momonga';element('character').listeners.change();
 assert.equal(element('download-assets').hidden,true);
});
