import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {planMotions,PRODUCTION_MOTIONS} from '../src/motions.mjs';
test('every production action is bundled and a missing approval fails closed without fallback',async()=>{
 const root=new URL('../',import.meta.url);
 const skins=JSON.parse(await readFile(new URL('assets/catalog.json',root),'utf8'));
 const pack=JSON.parse(await readFile(new URL('assets/motions.json',root),'utf8'));
 for(const skin of skins){
  assert.equal(skin.originalAsset,undefined);assert.equal(skin.spritesheetPath,undefined);
  const {choices}=planMotions(skin,pack);
  for(const key of PRODUCTION_MOTIONS)assert.match(choices[key].file,/^assets\/generated\//);
 }
 const shisa=skins.find(s=>s.id==='shisa');
 assert.throws(()=>planMotions(shisa,pack.filter(m=>m.id!=='shisa-dance')),/Missing approved motion shisa\/dance/);
 const pending=pack.map(m=>m.id==='shisa-dance'?{...m,reviewStatus:'awaiting-user-review'}:m);
 assert.throws(()=>planMotions(shisa,pending),/Missing approved motion/);
});
