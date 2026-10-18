import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {prepareMotionSkin,planMotions} from '../src/motions.mjs';
const root=new URL('../',import.meta.url), base=fileURLToPath(root);
const catalog=JSON.parse(await readFile(new URL('assets/catalog.json',root),'utf8'));
const pack=JSON.parse(await readFile(new URL('assets/motions.json',root),'utf8'));
const modern=[],legacy=[],assets=[],coverage={};
await mkdir(new URL('assets/atlases/',root),{recursive:true});
for(const character of catalog){
 coverage[character.id]=planMotions(character,pack).coverage;
 for(const [target,extended] of [[modern,true],[legacy,false]]){
  const file=`assets/atlases/${character.id}-${extended?'modern':'legacy'}.png`;
  target.push(await prepareMotionSkin(base,character,pack,extended,extended,file));
  const data=await readFile(new URL(file,root));
  assets.push({file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
 }
}
await writeFile(new URL('assets/atlases.json',root),JSON.stringify(assets,null,2)+'\n');
await writeFile(new URL('assets/coverage.json',root),JSON.stringify(coverage,null,2)+'\n');
const labels={idle:'대기','running-right':'오른쪽 이동','running-left':'왼쪽 이동',waving:'인사·기쁨',jumping:'점프',failed:'실패',waiting:'기다림',running:'일하기 1',review:'생각·검토',sleep:'수면',feed_munch:'먹기',groom:'그루밍',grabbed:'잡힘',success:'성공',dance:'춤',working_v2:'일하기 2'};
const lines=['# 자체 모션 제작 현황','','한 모션을 생성하고 미리보기 확인을 받은 뒤 다음 모션을 제작합니다. 외부 시트와 다운로드는 사용하지 않습니다.','','전용 = 승인된 자체 모션, 초안 = 사용자 확인 대기, 임시 = 같은 캐릭터의 다른 자체 모션을 재사용합니다. 임시는 전용 모션 제작 완료가 아닙니다.','','| DAP 동작 | '+catalog.map(c=>c.displayName).join(' | ')+' |','|---|'+catalog.map(()=>'---').join('|')+'|'];
for(const [key,label] of Object.entries(labels))lines.push('| '+label+' | '+catalog.map(c=>({ready:'전용',review:'초안 확인 대기',substitute:'미제작 · 임시'})[coverage[c.id][key].status]).join(' | ')+' |');
lines.push('','현재 확인할 모션: **우사기 대기 8프레임 · 3.22초**. 다음 모션은 이 초안을 확인한 후 제작합니다.','', '치이카와와 하치와레의 대기 전용 모션은 아직 미제작입니다. 치이카와는 자체 그루밍, 하치와레는 자체 기타 춤을 임시 기본 모션으로 사용합니다.','');
await writeFile(new URL('MOTIONS.md',root),lines.join('\n'));
const verifier=await readFile(new URL('src/assets.mjs',root),'utf8');
const template=await readFile(new URL('src/plugin.template.mjs',root),'utf8');
await writeFile(new URL('dap_chiikawa/plugin.mjs',root),verifier+'\n'+template
 .replace('__SKINS_JSON__',JSON.stringify(modern)).replace('__LEGACY_SKINS_JSON__',JSON.stringify(legacy))
 .replace('__ASSETS_JSON__',JSON.stringify(assets)).replace('__COVERAGE_JSON__',JSON.stringify(coverage)));
await writeFile(new URL('assets/catalog.js',root),'window.CHIIKAWA_SKINS = '+JSON.stringify(modern)+';\nwindow.CHIIKAWA_COVERAGE = '+JSON.stringify(coverage)+';\n');
console.log(`Built ${catalog.length} independent characters; ${pack.length} generated motions; no external image source`);
