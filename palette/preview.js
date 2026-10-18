"use strict";
let skins = window.CHIIKAWA_SKINS;
let skin = skins[0];
let coverage = window.CHIIKAWA_COVERAGE ?? {};
const character = document.getElementById("character");
for (const item of skins) {
  const option = document.createElement("option"); option.value = item.id; option.textContent = item.displayName; character.append(option);
}
let activeId = null;
let statusReceived = false;
const canvas = document.getElementById("pet");
const drawing = canvas.getContext("2d");
const motion = document.getElementById("motion");
const motionLabels = {idle:"쉬기", "running-right":"오른쪽 이동", "running-left":"왼쪽 이동", waving:"쓰다듬기·기쁨 반응", failed:"실패·오류", running:"작업 중", review:"생각 중", sleep:"수면", feed_munch:"먹기", groom:"그루밍", grabbed:"잡힘", success:"성공", dance:"춤"};
const pause = document.getElementById("pause");
motionLabels.working_v2 = "작업 중 · 전단지 읽기";
const status = document.getElementById("status");
const apply = document.getElementById("apply");
const reset = document.getElementById("reset");
const download = document.getElementById("download-assets");
const personaToggle = document.getElementById("persona-enabled");
document.getElementById("persona-traits").textContent = skin.persona.traits.join(" · ");
document.getElementById("persona-example").textContent = skin.persona.examples.greeting;
const bridge = window.dapPalette;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let paused = reducedMotion.matches;
let elapsed = 0;
let previousTime = null;
let animationId = 0;
let stopped = false;
let loaded = false;
let available = false;
let assetsReady = false;
let assetRevision = 0;
let busy = false;
const image = new Image();
function buttons() {
  download.hidden = assetsReady;
  download.disabled = !available || busy;
  apply.disabled = !available || !assetsReady || busy || activeId === skin.id;
  character.disabled = busy;
  reset.disabled = !available || busy || !activeId;
  personaToggle.disabled = !bridge || busy;
  pause.textContent = paused ? "재생" : "일시정지";
  pause.setAttribute("aria-pressed", String(paused));
}
function render() {
  if (!loaded) return;
  const clip = skin.animations[motion.value];
  const cell = {
    row: clip.row, column: window.ChiikawaAnimation.columnAt(clip.holdsMs, elapsed),
  };
  drawing.clearRect(0, 0, 192, 208);
  drawing.imageSmoothingEnabled = false;
  drawing.drawImage(image, cell.column * 192, cell.row * 208, 192, 208, 0, clip ? window.ChiikawaAnimation.hopOffset?.(clip, elapsed) ?? 0 : 0, 192, 208);
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
  const item=coverage[skin.id]?.[key];
  return (motionLabels[key] ?? key)+(item?.status==='upstream'?' · 원본 유지':item?.status==='shared'?' · 일하기 공유':'');
}
function selectCharacter() {
  skin = skins.find(item => item.id === character.value) ?? skins[0];
  const previousMotion = motion.value;
  if (motion.replaceChildren) {
    motion.replaceChildren();
    for (const key of Object.keys(skin.animations).filter(key => !["jumping","waiting"].includes(key) && coverage[skin.id]?.[key]?.production !== false && coverage[skin.id]?.[key]?.status !== "shared")) {
      const option = document.createElement("option"); option.value = key; option.textContent = motionTitle(key); motion.append(option);
    }
    motion.value = skin.animations[previousMotion] && !["jumping","waiting"].includes(previousMotion) && coverage[skin.id]?.[previousMotion]?.production !== false && coverage[skin.id]?.[previousMotion]?.status !== "shared" ? previousMotion : "idle";
  }
  elapsed = 0; loaded = false;
  document.getElementById("motion-name").textContent = motionTitle(motion.value);
  const info=coverage[skin.id] ?? {};
  const pending=Object.values(info).filter(item=>item.production!==false && item.status==='upstream').length;
  const review=Object.values(info).filter(item=>item.status==='review').length;
  document.getElementById("coverage-note").textContent = `원본 유지 ${pending}개 · 검토 중 ${review}개. 승인된 동작만 자체 모션으로 교체합니다.`;
  document.getElementById("persona-title").textContent = `${skin.displayName}의 성격`;
  document.getElementById("persona-traits").textContent = skin.persona.traits.join(" · ");
  document.getElementById("persona-example").textContent = skin.persona.examples.greeting;
  document.getElementById("character-badge").textContent = skin.id.toUpperCase();
  document.getElementById("apply").textContent = `${skin.displayName} 적용`;
  canvas.setAttribute("aria-label", `${skin.displayName} 모션 미리보기`);
  canvas.closest("section").setAttribute("aria-label", `${skin.displayName} 모션 미리보기`);
  drawing.clearRect(0, 0, 192, 208);
  if (assetsReady) image.src = `../${skin.spritesheetPath}?v=${assetRevision}`;
  buttons();
}
character.addEventListener("change", selectCharacter);
selectCharacter();
motion.addEventListener("change", () => {
  elapsed = 0;
  document.getElementById("motion-name").textContent = motion.selectedOptions[0].textContent;
  canvas.setAttribute("aria-label", `${skin.displayName} ${motion.selectedOptions[0].textContent}`);
  document.getElementById("hint").textContent = coverage[skin.id]?.[motion.value]?.status==='upstream' ? "아직 교체하지 않은 동작은 기존 패키지의 원본 모션으로 재생합니다." : "모션별 프레임 속도로 재생해요.";
  render();
});
pause.addEventListener("click", () => { paused = !paused; previousTime = null; buttons(); });
document.addEventListener("visibilitychange", () => { previousTime = null; });
const onReducedMotion = () => { paused = reducedMotion.matches; buttons(); };
reducedMotion.addEventListener("change", onReducedMotion);
document.getElementById("close").addEventListener("click", () => {
  if (bridge) bridge.close();
  else status.textContent = "브라우저의 탭을 닫으면 미리보기가 종료됩니다.";
});
function send(type) { if (bridge && available && !busy) { busy = true; buttons(); bridge.postMessage({ type, id: skin.id }); } }
apply.addEventListener("click", () => send("apply"));
reset.addEventListener("click", () => send("reset"));
personaToggle.addEventListener("change", () => {
  if (!bridge || busy) return;
  busy = true;
  buttons();
  bridge.postMessage({ type: "set-persona", enabled: personaToggle.checked });
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
    if (selectActive) character.value = activeId;
    busy = message.busy === true;
    const refreshImage = assetsReady !== (message.assetsReady === true) || assetRevision !== message.assetRevision;
    assetsReady = message.assetsReady === true;
    assetRevision = message.assetRevision ?? 0;
    if (refreshImage || selectActive || catalogChanged) selectCharacter();
    personaToggle.checked = message.personaEnabled === true;
    document.getElementById("persona-note").textContent = "캐릭터 이름·자기 지칭·성격·말투를 함께 적용해요. 사용자 이름·사용자에 대한 호칭·기억은 유지되며, 옵션을 끄면 기존 펫 이름과 말투로 돌아가요.";
    status.textContent = typeof message.message === "string" ? message.message : "";
    buttons();
  });
  bridge.postMessage({ type: "ready" });
} else {
  status.textContent = "브라우저 미리보기입니다. DAP에서 열면 앱 연결 상태를 확인할 수 있어요.";
}
buttons();
window.addEventListener("pagehide", () => {
  stopped = true;
  cancelAnimationFrame(animationId);
  offMessage?.();
  reducedMotion.removeEventListener("change", onReducedMotion);
}, { once: true });

download.addEventListener("click", () => bridge?.postMessage({type:"download-assets"}));
