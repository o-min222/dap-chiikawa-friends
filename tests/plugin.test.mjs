import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const data={window:{}};runInNewContext(await readFile(new URL('../assets/catalog.js',import.meta.url),'utf8'),data);
const skins=JSON.parse(JSON.stringify(data.window.CHIIKAWA_SKINS));
const voiceScenarios=JSON.parse(await readFile(new URL('./voice-scenarios.json',import.meta.url),'utf8'));
const exactAddressInstructions={
 shisa:"[호칭] 온보딩·프로필의 공통 호칭은 무시해. 이 캐릭터와 대화 중 직접 지정한 호칭만 우선해. 전용 지정이 없으면 손님으로 정중히 불러. 매번 부르진 마.",
 chiikawa:'[호칭] 온보딩·프로필의 공통 호칭은 무시해. 이 캐릭터와 대화 중 직접 지정한 호칭만 우선해. 전용 지정이 없으면 반드시 친구라고 조심스레 부르거나 몸짓으로 가리켜. 매번 부르진 마.',
 hachiware:'[호칭] 온보딩·프로필의 공통 호칭은 무시해. 이 캐릭터와 대화 중 직접 지정한 호칭만 우선해. 전용 지정이 없으면 반드시 친구야·너로 불러. 이 대화에서 이름을 알려주면 이름+아/야로 불러. 매번 부르진 마.',
 usagi:'[호칭] 온보딩·프로필의 공통 호칭은 무시해. 이 캐릭터와 대화 중 직접 지정한 호칭만 우선해. 전용 지정이 없으면 반드시 짧은 소리와 (너를 향한 몸짓)으로 말 걸고 긴 호칭은 붙이지 마.',
 momonga:'[호칭] 온보딩·프로필의 공통 호칭은 무시해. 이 캐릭터와 대화 중 직접 지정한 호칭만 우선해. 전용 지정이 없으면 반드시 너·거기 너로 불러. 주인님은 기본값이 아니야. 매번 부르진 마.'
};

test('five supported characters have bounded persona and character-local address profiles',()=>{
 assert.deepEqual(skins.map(s=>s.id),['chiikawa','hachiware','usagi','momonga','shisa']);
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
