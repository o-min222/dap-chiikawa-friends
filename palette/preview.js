"use strict";
let skins = window.CHIIKAWA_SKINS;
let skin = skins[0];
let coverage = window.CHIIKAWA_COVERAGE ?? {};
let selectedId = skin.id;
let activeId = null;
let statusReceived = false;
const descriptions = {
  chiikawa: "겁이 많고 눈물이 많지만, 친구를 위해 작은 용기를 내는 다정한 친구예요.",
  hachiware: "밝고 낙천적이며, 친구의 마음을 세심하게 살피는 든든한 친구예요.",
  usagi: "자유롭고 장난스럽지만, 겁 없이 먼저 움직이는 행동파 친구예요.",
  momonga: "귀여움을 무기로 남의 몫까지 탐내고, 귀찮은 일은 떠넘기며 공은 자기 것으로 만드는 뻔뻔한 친구예요.",
};
const characterList = document.getElementById("character-list");
const canvas = document.getElementById("pet");
const drawing = canvas.getContext("2d");
const motion = document.getElementById("motion");
const motionLabels = {idle:"쉬기", "running-right":"오른쪽 이동", "running-left":"왼쪽 이동", waving:"쓰다듬기·기쁨 반응", failed:"실패·오류", running:"작업 중", review:"생각 중", sleep:"수면", feed_munch:"먹기", groom:"그루밍", grabbed:"잡힘", success:"성공", dance:"춤"};
const workingVariantLabels = {chiikawa:"작업 중 · 책상 공부", momonga:"작업 중 · 전단지 읽기"};
const status = document.getElementById("status");
const apply = document.getElementById("apply");
const reset = document.getElementById("reset");
const download = document.getElementById("download-assets");
const personaToggle = document.getElementById("persona-enabled");
const bridge = window.dapPalette;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let paused = reducedMotion.matches;
let elapsed = 0;
let previousTime = null;
let animationId = 0;
let stopped = false;
let loaded = false;
let available = false;
let readySkinIds = [];
let assetRevision = 0;
let busy = false;
const image = new Image();

function buttons() {
  const selectedReady = readySkinIds.includes(skin.id);
  download.hidden = selectedReady;
  download.disabled = !available || busy;
  apply.disabled = !available || !selectedReady || busy || activeId === skin.id;
  for (const button of characterList.querySelectorAll("button")) button.disabled = busy;
  reset.disabled = !available || busy || !activeId;
  personaToggle.disabled = !bridge || busy;
}

function render() {
  if (!loaded) return;
  const clip = skin.animations[motion.value];
  const cell = {row: clip.row, column: window.ChiikawaAnimation.columnAt(clip.holdsMs, elapsed)};
  drawing.clearRect(0, 0, 192, 208);
  drawing.imageSmoothingEnabled = false;
  drawing.drawImage(image, cell.column * 192, cell.row * 208, 192, 208, 0, window.ChiikawaAnimation.hopOffset?.(clip, elapsed) ?? 0, 192, 208);
}

function tick(time) {
  if (stopped) return;
  if (previousTime !== null && !paused && !document.hidden) elapsed += time - previousTime;
  previousTime = time;
  render();
  animationId = requestAnimationFrame(tick);
}

image.onload = () => {
  if (image.naturalWidth !== skin.cell.width * skin.grid.columns || image.naturalHeight !== skin.cell.height * skin.grid.rows) {
    status.textContent = "스프라이트 이미지 크기가 맞지 않습니다.";
    return;
  }
  loaded = true;
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(tick);
};
image.onerror = () => { status.textContent = "스프라이트 이미지를 불러오지 못했습니다. assets 폴더를 확인해 주세요."; };

function motionTitle(key) {
  const item = coverage[skin.id]?.[key];
  const label = key === "working_v2" ? (workingVariantLabels[skin.id] ?? "작업 중 · 다른 동작") : (motionLabels[key] ?? key);
  return label + (item?.status === "upstream" ? " · 원본 유지" : item?.status === "shared" ? " · 일하기 공유" : "");
}

function paintPortrait(item, portrait, placeholder) {
  if (!readySkinIds.includes(item.id)) return;
  const preview = new Image();
  preview.onload = () => {
    const context = portrait.getContext("2d");
    context.clearRect(0, 0, 192, 208);
    context.imageSmoothingEnabled = false;
    context.drawImage(preview, 0, item.animations.idle.row * 208, 192, 208, 0, 0, 192, 208);
    placeholder.parentElement.classList.add("loaded");
  };
  preview.src = `../${item.spritesheetPath}?v=${assetRevision}`;
}

function updateCharacterSelection() {
  for (const button of characterList.querySelectorAll("button")) {
    button.setAttribute("aria-selected", String(button.dataset.id === skin.id));
  }
}

function renderCharacterCards() {
  characterList.replaceChildren();
  for (const item of skins) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "character-option";
    button.dataset.id = item.id;
    button.setAttribute("role", "option");
    button.setAttribute("aria-label", `${item.displayName} 선택`);
    const portraitWrap = document.createElement("span");
    portraitWrap.className = "character-portrait";
    const portrait = document.createElement("canvas");
    portrait.width = 192;
    portrait.height = 208;
    portrait.setAttribute("aria-hidden", "true");
    const placeholder = document.createElement("span");
    placeholder.className = "portrait-placeholder";
    placeholder.textContent = item.displayName.slice(0, 1);
    portraitWrap.append(portrait, placeholder);
    const copy = document.createElement("span");
    copy.className = "character-copy";
    const name = document.createElement("strong");
    name.textContent = item.displayName;
    const availability = document.createElement("small");
    availability.textContent = readySkinIds.includes(item.id) ? "선택 가능" : "이미지 준비 필요";
    copy.append(name, availability);
    button.append(portraitWrap, copy);
    button.addEventListener("click", () => selectCharacter(item.id));
    characterList.append(button);
    paintPortrait(item, portrait, placeholder);
  }
  updateCharacterSelection();
}

function selectCharacter(id = selectedId) {
  selectedId = id;
  skin = skins.find(item => item.id === selectedId) ?? skins[0];
  selectedId = skin.id;
  updateCharacterSelection();
  const previousMotion = motion.value;
  if (motion.replaceChildren) {
    motion.replaceChildren();
    for (const key of Object.keys(skin.animations).filter(key => !["jumping","waiting"].includes(key) && coverage[skin.id]?.[key]?.production !== false && coverage[skin.id]?.[key]?.status !== "shared")) {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = motionTitle(key);
      motion.append(option);
    }
    motion.value = skin.animations[previousMotion] && !["jumping","waiting"].includes(previousMotion) && coverage[skin.id]?.[previousMotion]?.production !== false && coverage[skin.id]?.[previousMotion]?.status !== "shared" ? previousMotion : "idle";
  }
  elapsed = 0;
  loaded = false;
  document.getElementById("motion-name").textContent = motionTitle(motion.value);
  const info = coverage[skin.id] ?? {};
  const pending = Object.values(info).filter(item => item.production !== false && item.status === "upstream").length;
  const review = Object.values(info).filter(item => item.status === "review").length;
  document.getElementById("coverage-note").textContent = `원본 유지 ${pending}개 · 검토 중 ${review}개. 승인된 동작만 자체 모션으로 교체합니다.`;
  document.getElementById("persona-title").textContent = skin.displayName;
  document.getElementById("character-description").textContent = descriptions[skin.id] ?? "치이카와 친구들과 함께해요.";
  document.getElementById("persona-traits").textContent = skin.persona.traits.join(" · ");
  document.getElementById("persona-example").textContent = skin.persona.examples.greeting;
  document.getElementById("character-badge").textContent = skin.id.toUpperCase();
  apply.textContent = `${skin.displayName} 적용`;
  canvas.setAttribute("aria-label", `${skin.displayName} 모션 미리보기`);
  canvas.closest("section").setAttribute("aria-label", `${skin.displayName} 모션 미리보기`);
  drawing.clearRect(0, 0, 192, 208);
  if (readySkinIds.includes(skin.id)) image.src = `../${skin.spritesheetPath}?v=${assetRevision}`;
  buttons();
}

renderCharacterCards();
selectCharacter();
motion.addEventListener("change", () => {
  elapsed = 0;
  document.getElementById("motion-name").textContent = motion.selectedOptions[0].textContent;
  canvas.setAttribute("aria-label", `${skin.displayName} ${motion.selectedOptions[0].textContent}`);
  document.getElementById("hint").textContent = coverage[skin.id]?.[motion.value]?.status === "upstream" ? "아직 교체하지 않은 동작은 기존 패키지의 원본 모션으로 재생합니다." : "모션별 프레임 속도로 재생해요.";
  render();
});
document.addEventListener("visibilitychange", () => { previousTime = null; });
const onReducedMotion = () => { paused = reducedMotion.matches; previousTime = null; };
reducedMotion.addEventListener("change", onReducedMotion);
document.getElementById("close").addEventListener("click", () => {
  if (bridge) bridge.close();
  else status.textContent = "브라우저의 탭을 닫으면 미리보기가 종료됩니다.";
});
function send(type) { if (bridge && available && !busy) { busy = true; buttons(); bridge.postMessage({type, id: skin.id}); } }
apply.addEventListener("click", () => send("apply"));
reset.addEventListener("click", () => send("reset"));
personaToggle.addEventListener("change", () => {
  if (!bridge || busy) return;
  busy = true;
  buttons();
  bridge.postMessage({type: "set-persona", enabled: personaToggle.checked});
});
let offMessage;
if (bridge) {
  offMessage = bridge.onMessage((message) => {
    if (!message || message.type !== "status") return;
    available = message.available === true;
    if (message.coverage) coverage = message.coverage;
    const catalogChanged = Array.isArray(message.skins) && JSON.stringify(message.skins) !== JSON.stringify(skins);
    if (catalogChanged) skins = message.skins;
    activeId = typeof message.activeId === "string" ? message.activeId : null;
    const selectActive = !statusReceived && skins.some(item => item.id === activeId);
    statusReceived = true;
    if (selectActive) selectedId = activeId;
    busy = message.busy === true;
    const nextReady = message.readySkinIds ?? (message.assetsReady === true ? skins.map(item => item.id) : []);
    const refreshImage = JSON.stringify(readySkinIds) !== JSON.stringify(nextReady) || assetRevision !== message.assetRevision;
    readySkinIds = nextReady;
    assetRevision = message.assetRevision ?? 0;
    if (refreshImage || selectActive || catalogChanged) {
      renderCharacterCards();
      selectCharacter(selectedId);
    }
    personaToggle.checked = message.personaEnabled === true;
    document.getElementById("persona-note").textContent = "캐릭터 이름·성격·말투와 사용자를 부르는 표현을 함께 적용해요. 직접 정한 이름·호칭을 우선하고, 별도 지정이 없으면 캐릭터에 맞게 불러요. 옵션을 끄면 기본 말투로 돌아가요.";
    status.textContent = typeof message.message === "string" ? message.message : "";
    buttons();
  });
  bridge.postMessage({type: "ready"});
} else {
  status.textContent = "브라우저 미리보기입니다. DAP에서 열면 앱 연결 상태를 확인할 수 있어요.";
}
buttons();
window.addEventListener("pagehide", () => {
  stopped = true;
  cancelAnimationFrame(animationId);
  offMessage?.();
  reducedMotion.removeEventListener("change", onReducedMotion);
}, {once: true});
download.addEventListener("click", () => bridge?.postMessage({type: "download-assets"}));
