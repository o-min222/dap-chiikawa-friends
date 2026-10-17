"use strict";
const skins = window.CHIIKAWA_SKINS;
let skin = skins[0];
const character = document.getElementById("character");
for (const item of skins) {
  const option = document.createElement("option"); option.value = item.id; option.textContent = item.displayName; character.append(option);
}
let activeId = null;
let statusReceived = false;
const canvas = document.getElementById("pet");
const drawing = canvas.getContext("2d");
const motion = document.getElementById("motion");
const pause = document.getElementById("pause");
const status = document.getElementById("status");
const apply = document.getElementById("apply");
const reset = document.getElementById("reset");
const personaToggle = document.getElementById("persona-enabled");
document.getElementById("persona-traits").textContent = skin.persona.traits.join(" · ");
document.getElementById("persona-example").textContent = skin.persona.examples.greeting;
const bridge = window.dapPalette;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let paused = reducedMotion.matches;
let elapsed = 0;
let previousTime = null;
let direction = { row: 9, column: 0 };
let animationId = 0;
let stopped = false;
let loaded = false;
let available = false;
let assetsReady = false;
let assetRevision = 0;
const downloadButton = document.getElementById("download-assets");
let busy = false;
const image = new Image();
function buttons() {
  apply.disabled = !available || !assetsReady || busy || activeId === skin.id;
  character.disabled = busy;
  downloadButton.disabled = !bridge || !available || busy;
  document.getElementById("assets-setup").hidden = assetsReady;
  reset.disabled = !available || busy || !activeId;
  personaToggle.disabled = !bridge || busy;
  pause.textContent = paused ? "재생" : "일시정지";
  pause.setAttribute("aria-pressed", String(paused));
}
function render() {
  if (!loaded) return;
  const clip = skin.animations[motion.value];
  const cell = motion.value === "look" ? direction : {
    row: clip.row, column: window.ChiikawaAnimation.columnAt(clip.holdsMs, elapsed),
  };
  drawing.clearRect(0, 0, 192, 208);
  drawing.imageSmoothingEnabled = false;
  drawing.drawImage(image, cell.column * 192, cell.row * 208, 192, 208, 0, 0, 192, 208);
}
function tick(time) {
  if (stopped) return;
  if (previousTime !== null && !paused && !document.hidden) elapsed += time - previousTime;
  previousTime = time;
  render();
  animationId = requestAnimationFrame(tick);
}
image.onload = () => {
  if (image.naturalWidth !== 1536 || image.naturalHeight !== 2288) {
    status.textContent = "스프라이트 이미지 크기가 맞지 않습니다.";
    return;
  }
  loaded = true;
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(tick);
};
image.onerror = () => { status.textContent = "스프라이트 이미지를 불러오지 못했습니다. assets 폴더를 확인해 주세요."; };
function selectCharacter() {
  skin = skins.find(item => item.id === character.value) ?? skins[0];
  elapsed = 0; loaded = false;
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
  document.getElementById("hint").textContent = motion.value === "look"
    ? "미리보기 위에서 커서를 움직이면 16방향으로 바라봐요."
    : "원본 프레임별 속도로 재생해요.";
  render();
});
canvas.addEventListener("pointermove", (event) => {
  if (paused) return;
  const bounds = canvas.getBoundingClientRect();
  direction = window.ChiikawaAnimation.lookCell(event.clientX - bounds.left - bounds.width / 2, event.clientY - bounds.top - bounds.height / 2);
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
downloadButton.addEventListener("click", () => send("download-assets"));
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
    activeId = typeof message.activeId === "string" ? message.activeId : null;
    const selectActive = !statusReceived && skins.some(item => item.id === activeId);
    statusReceived = true;
    if (selectActive) character.value = activeId;
    busy = message.busy === true;
    const refreshImage = assetsReady !== (message.assetsReady === true) || assetRevision !== message.assetRevision;
    assetsReady = message.assetsReady === true;
    assetRevision = message.assetRevision ?? 0;
    if (refreshImage || selectActive) selectCharacter();
    personaToggle.checked = message.personaEnabled === true;
    document.getElementById("persona-note").textContent = "대화용 성격 해석입니다. 외형 적용 시 말투도 함께 바뀌며, 사용자 이름·호칭·기억은 유지돼요.";
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
