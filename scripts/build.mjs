import { readFile, writeFile } from 'node:fs/promises';
import { planMotions } from '../src/motions.mjs';

const root = new URL('../', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const catalog = await read('assets/catalog.json');
const pack = await read('assets/motions.json');
const plans = new Map(catalog.map(character => [character.id, planMotions(character, pack)]));
const coverage = Object.fromEntries(catalog.map(character => [character.id, plans.get(character.id).coverage]));
const chatArt = Object.fromEntries(catalog.map(character => {
  const { choices } = plans.get(character.id);
  const clips = { idle: choices.idle, thinking: choices.review, reply: choices.waving,
    walkLeft: choices['running-left'], walkRight: choices['running-right'] };
  return [character.id, Object.fromEntries(Object.entries(clips).map(([phase, motion]) => [phase, {
    file: motion.file, holdsMs: motion.holdsMs,
  }]))];
}));
const chatFiles = new Set(Object.values(chatArt).flatMap(art => Object.values(art).map(clip => clip.file)));
const chatAssets = pack.filter(motion => chatFiles.has(motion.file));
const verifier = await readFile(new URL('src/assets.mjs', root), 'utf8');
const template = await readFile(new URL('src/plugin.template.mjs', root), 'utf8');
await writeFile(new URL('dap_chiikawa/plugin.mjs', root), verifier + '\n' + template
  .replace('__SKINS_JSON__', JSON.stringify(catalog))
  .replace('__CHAT_ART_JSON__', JSON.stringify(chatArt))
  .replace('__ASSETS_JSON__', JSON.stringify(chatAssets)));
await writeFile(new URL('assets/catalog.js', root), 'window.CHIIKAWA_SKINS = ' + JSON.stringify(catalog)
  + ';\nwindow.CHIIKAWA_COVERAGE = ' + JSON.stringify(coverage) + ';\n');
await writeFile(new URL('assets/coverage.json', root), JSON.stringify(coverage, null, 2) + '\n');

const lines = [
  '# 채팅창 모션', '',
  '전용 채팅창에서 대기, 응답을 기다리는 생각 중, 답변 도착 후 기쁨 반응을 재생합니다.', '',
  '| 캐릭터 | 대기 | 생각 중 | 답변 반응 | 왼쪽 걷기 | 오른쪽 걷기 |',
  '|---|---|---|---|---|---|',
];
for (const character of catalog) {
  const cells = Object.values(chatArt[character.id]).map(clip => {
    const duration = clip.holdsMs.reduce((sum, hold) => sum + hold, 0) / 1000;
    return `\`${clip.file.split('/').at(-1)}\` · ${clip.holdsMs.length}프레임 · ${duration}초`;
  });
  lines.push(`| ${character.displayName} | ${cells.join(' | ')} |`);
}
lines.push('', '모든 프레임은 포함된 PNG를 사용합니다. 이미지·선 굵기·배율과 기존 재생 시간을 유지합니다.', '',
  `전체 제작 자산 ${pack.length}개는 assets/motions.json에서 관리합니다. 채팅창과 화면 캐릭터는 위 ${chatAssets.length}개 스트립을 사용합니다.`, '');
await writeFile(new URL('MOTIONS.md', root), lines.join('\n'));
console.log(`Built ${catalog.length} chat characters with ${chatAssets.length} verified local animation strips`);
