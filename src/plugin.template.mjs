import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SOURCE = __SOURCE_JSON__;
const SKINS = __SKINS_JSON__;
const MOTION_PACK = __MOTIONS_JSON__;
export async function activate(ctx) {
  const api = ctx.host.petSkins;
  const available = api?.apiVersion === 2;
  const section = `${ctx.pluginId}.character`;
  const registrations = new Map();
  let palette = null, offPalette = null, disposed = false, busy = false;
  let queue = Promise.resolve();
  let assetsReady = await hasOriginalAssets(ROOT, SOURCE);
  const extendedMotions = api?.supportedMotions?.includes("sleep") === true;
  let preparedSkins = SKINS;
  async function prepareSkins() {
    preparedSkins = await Promise.all(SKINS.map(skin => prepareMotionSkin(ROOT, skin, MOTION_PACK, extendedMotions)));
  }
  if (assetsReady) await prepareSkins();
  let assetRevision = 0;
  const downloads = new AbortController();
  const values = () => ctx.host.settings.values(section);
  const personaWanted = () => values().personaEnabled !== false;
  function push(message) {
    if (disposed || !palette || palette.isDestroyed()) return;
    const activeId = available ? api.getActiveSkin() : null;
    const active = [...registrations.values()].find(reg => reg.id === activeId);
    palette.postMessage({ type: "status", available, busy, assetsReady, assetRevision, skins: preparedSkins, extendedMotions, activeId: active ? active.id.split(".").at(-1) : null,
      personaEnabled: personaWanted(), personaActive: available && api.getActivePersona() === activeId && Boolean(active),
      message: message ?? (available ? !assetsReady ? "처음 한 번 원본 저장소에서 이미지를 받아 주세요." : active ? `현재 ${SKINS.find(skin => skin.id === activeId.split(".").at(-1))?.displayName ?? "선택한 캐릭터"}를 사용하고 있어요.` : "캐릭터를 고른 뒤 적용해 주세요." : "캐릭터 적용에는 DAP 1.6.1 이상이 필요해요.") });
  }
  async function register(id) {
    const skin = preparedSkins.find(item => item.id === id);
    if (!skin) throw Error("Unknown character");
    if (!assetsReady) throw Error("원본 이미지를 먼저 받아 주세요.");
    if (!registrations.has(id)) registrations.set(id, await api.registerSkin(skin));
    return registrations.get(id);
  }
  function enqueue(message) {
    queue = queue.then(async () => {
      if (disposed) return;
      busy = true; push();
      const before = values().personaEnabled;
      let resultMessage;
      try {
        if (message.type === "download-assets") {
          if (!available) { resultMessage = "DAP 1.6.0 이상이 필요해요."; return; }
          await downloadOriginalAssets(ROOT, SOURCE, { signal: downloads.signal,
            onProgress: (count, total) => push(`원본 이미지를 준비하고 있어요. ${count}/${total}`),
          });
          assetsReady = true; assetRevision++;
          await prepareSkins();
          resultMessage = "이미지 준비가 끝났어요. 캐릭터를 고른 뒤 적용해 주세요.";
        } else if (message.type === "set-persona") {
          if (typeof message.enabled !== "boolean") return;
          await ctx.host.settings.set(section, "personaEnabled", message.enabled);
          const active = [...registrations.values()].find(reg => reg.id === api?.getActiveSkin());
          if (active && !disposed) await active.apply({ usePersona: message.enabled });
        } else if (available && message.type === "apply") {
          const reg = await register(message.id);
          if (disposed) return;
          await reg.apply({ usePersona: personaWanted() });
          await ctx.host.settings.set(section, "appliedCharacter", message.id);
        } else if (available && message.type === "reset") {
          const active = [...registrations.values()].find(reg => reg.id === api.getActiveSkin());
          await active?.reset();
          await ctx.host.settings.set(section, "appliedCharacter", "");
        }
      } catch (error) {
        if (message.type === "set-persona") await ctx.host.settings.set(section, "personaEnabled", before ?? true);
        resultMessage = message.type === "download-assets"
          ? `이미지를 받지 못했어요. ${error instanceof Error ? error.message : "연결 상태를 확인하고 다시 시도해 주세요."}`
          : "변경하지 못했어요. 앱 로그를 확인해 주세요.";
      } finally { busy = false; push(resultMessage); }
    }).catch(() => { busy = false; push("설정을 저장하지 못했어요. 다시 시도해 주세요."); });
    return queue;
  }
  function open() {
    if (disposed) return;
    if (palette && !palette.isDestroyed()) { palette.toggle(); push(); return; }
    offPalette?.();
    palette = ctx.host.windows.openPalette({ page: "palette/index.html", width: 480, height: 900, frame: false });
    offPalette = palette.onMessage(message => {
      if (!message || typeof message !== "object" || disposed) return;
      if (message.type === "ready") push();
      else if (["apply", "reset", "set-persona", "download-assets"].includes(message.type)) return enqueue(message);
    });
    palette.show();
  }
  ctx.actions.registerAction({ id: "open", callback: open });
  ctx.trayMenu.addItem({ itemId: "open", label: "치이카와 친구들", actionId: "open", showInContextMenu: true });
  ctx.radialMenu.addItem({ itemId: "open", label: "친구들", actionId: "open", priority: 50, icon: "icon.png" });
  let ownedActive = false;
  const offSkin = available ? api.onDidChange(() => {
    const owns = [...registrations.values()].some(reg => reg.id === api.getActiveSkin());
    if (ownedActive && !owns && !disposed) {
      try {
        Promise.resolve(ctx.host.settings.set(section, "appliedCharacter", ""))
          .catch(() => push("기본 외형으로 돌아왔지만 재시작 설정을 저장하지 못했어요."));
      } catch { push("재시작 설정을 저장하지 못했어요."); }
    }
    ownedActive = owns;
    push();
  }) : null;
  const saved = values().appliedCharacter;
  if (available && assetsReady && SKINS.some(skin => skin.id === saved)) await enqueue({ type: "apply", id: saved });
  return async () => {
    if (disposed) return;
    disposed = true; downloads.abort(); offPalette?.(); offSkin?.(); palette?.close();
    await queue;
    for (const reg of registrations.values()) await reg.dispose();
    registrations.clear();
  };
}
