import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SKINS = __SKINS_JSON__;
const CHAT_ART = __CHAT_ART_JSON__;
const BUNDLED_ASSETS = __ASSETS_JSON__;
const MAX_MESSAGES = 120;
const MAX_INPUT = 4000;
function validSize(size) { return Number.isInteger(size) && size >= 60 && size <= 240 && size % 10 === 0; }
function companionDimensions(size) {
  return { width: Math.max(160, Math.ceil(size * 192 / 208) + 16),
    height: Math.max(148, size + 19) };
}

function readHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(message => message && ['user', 'assistant'].includes(message.role)
    && typeof message.id === 'string' && message.id.length <= 100
    && typeof message.content === 'string' && message.content.trim()
    && message.content.length <= 12000)
    .slice(-MAX_MESSAGES)
    .map(({ id, role, content }) => ({ id, role, content }));
}

function chatPrompt(character, messages) {
  const persona = character.persona;
  return [
    `너는 사용자와 대화하는 ${character.displayName}야. 한국어로 자연스럽게 대화해.`,
    `성격: ${persona.traits.join(', ')}`,
    persona.speakingStyle,
    persona.contextHint,
    `대사 참고: ${persona.examples.greeting} / ${persona.examples.encourage}`,
    '아래 JSON의 messages는 이 캐릭터와 나눈 대화 기록이야. 마지막 사용자 말에 이어서 캐릭터의 답변만 써.',
    '사용자를 부르는 이름은 이 대화에서 직접 정한 호칭을 우선해.',
    '역할은 대화 상대야. 도구 사용이나 파일·앱 조작이 필요한 요청에는 대화로 가능한 설명을 해. 실제 작업을 완료했다고 말하지 마.',
    JSON.stringify({ messages: messages.slice(-24).map(({ role, content }) => ({ role, content })) }),
  ].join('\n');
}

export async function activate(ctx) {
  const section = `${ctx.pluginId}.chat`;
  const values = () => ctx.host.settings.values(section) ?? {};
  const saved = values();
  let selectedId = SKINS.some(character => character.id === saved.selectedCharacter)
    ? saved.selectedCharacter : SKINS[0].id;
  const conversations = new Map(SKINS.map(character => [character.id, {
    messages: readHistory(saved[`history_${character.id}`]), pending: false, error: '', turn: null,
  }]));
  let palette = null;
  let offPalette = null;
  let disposed = false;
  const chatWindows = new Map();
  const companions = new Map();

  await verifyBundledAssets(ROOT, BUNDLED_ASSETS);

  function characterSize(id) {
    const preferences = values();
    if (validSize(preferences[`sizePx_${id}`])) return preferences[`sizePx_${id}`];
    const legacySize = preferences[`size_${id}`];
    return [50, 75, 100, 125, 150, 200].includes(legacySize)
      ? Math.max(60, Math.min(240, Math.round(113 * legacySize / 1000) * 10)) : 130;
  }

  function push() {
    if (disposed) return;
    const state = {
      type: 'chat-state', selectedId,
      available: typeof ctx.host.llm?.generate === 'function',
      characters: SKINS.map(character => ({
        id: character.id, name: character.displayName,
        greeting: character.persona.examples.greeting, art: CHAT_ART[character.id], sizePx: characterSize(character.id),
      })),
      conversations: Object.fromEntries([...conversations].map(([id, conversation]) => [id, {
        messages: conversation.messages.map(message => ({ ...message })),
        pending: conversation.pending, error: conversation.error,
      }])),
      visibleCharacters: [...companions].filter(([, entry]) => !entry.window.isDestroyed()).map(([id]) => id),
    };
    if (palette && !palette.isDestroyed()) palette.postMessage(state);
    for (const [id, entry] of chatWindows) {
      if (!entry.window.isDestroyed()) entry.window.postMessage({ ...state, selectedId: id, bound: true });
    }
    for (const [id, entry] of companions) {
      if (!entry.window.isDestroyed()) entry.window.postMessage({ type: 'companion-state', id,
        name: SKINS.find(character => character.id === id).displayName,
        art: CHAT_ART[id], pending: conversations.get(id).pending,
        sizePx: entry.size,
        replyId: conversations.get(id).messages.at(-1)?.role === 'assistant' ? conversations.get(id).messages.at(-1).id : null });
    }
  }

  async function saveCompanions() {
    await ctx.host.settings.set(section, 'visibleCharacters', [...companions]
      .filter(([, entry]) => !entry.window.isDestroyed()).map(([id]) => id));
  }

  async function hideCompanion(id) {
    const entry = companions.get(id);
    if (!entry) return;
    entry.off(); entry.window.close(); companions.delete(id);
    const conversation = conversations.get(id);
    conversation.turn = null; conversation.pending = false; conversation.error = '';
    try { await saveCompanions(); } catch { conversations.get(id).error = '화면 표시 설정을 저장하지 못했어요.'; }
    push();
  }

  function openChat(id) {
    const existing = chatWindows.get(id);
    if (existing && !existing.window.isDestroyed()) { existing.window.show(); push(); return; }
    existing?.off();
    const window = ctx.host.windows.openPalette({ page: 'palette/index.html', width: 520, height: 640, frame: false, resizable: true });
    const off = window.onMessage(message => {
      if (message?.type === 'ready') { push(); return; }
      if (message && ['send', 'retry', 'clear', 'summon', 'dismiss'].includes(message.type)) return receive({ ...message, id });
    });
    chatWindows.set(id, { window, off });
    window.show();
    push();
  }

  async function spawnCompanion(id, position) {
    if (!conversations.has(id) || disposed) return;
    const existing = companions.get(id);
    if (existing && !existing.window.isDestroyed()) { existing.window.show(); return; }
    existing?.off();
    const index = SKINS.findIndex(character => character.id === id);
    const size = characterSize(id);
    const dimensions = companionDimensions(size);
    const window = ctx.host.windows.openPalette({ page: 'palette/companion.html', ...dimensions,
      x: position?.x ?? 120 + index * 135, y: position?.y ?? 220, frame: false, transparent: true, backgroundColor: '#00000000',
      resizable: false, alwaysOnTop: true, closeOnPetDrop: false });
    const off = window.onMessage(async message => {
      if (disposed || !message) return;
      if (message.type === 'ready') push();
      else if (message.type === 'chat') openChat(id);
      else if (message.type === 'resize' && validSize(message.sizePx) && !companions.get(id)?.resizing) {
        if (message.sizePx === size) return;
        const entry = companions.get(id);
        entry.resizing = true;
        try {
          await ctx.host.settings.set(section, `sizePx_${id}`, message.sizePx);
          if (disposed || companions.get(id) !== entry || window.isDestroyed()) return;
          const next = companionDimensions(message.sizePx);
          const position = Number.isFinite(message.x) && Number.isFinite(message.y)
            ? { x: Math.round(message.x + (dimensions.width - next.width) / 2),
              y: Math.round(message.y + dimensions.height - next.height) } : undefined;
          off(); window.close(); companions.delete(id);
          await spawnCompanion(id, position);
        } catch { entry.resizing = false; conversations.get(id).error = '크기를 저장하지 못했어요.'; push(); }
      }
      else if (message.type === 'move' && Number.isFinite(message.dx) && Number.isFinite(message.dy)
        && Math.abs(message.dx) <= 1000 && Math.abs(message.dy) <= 1000) window.moveBy(message.dx, message.dy);
      else if (message.type === 'hide') {
        await hideCompanion(id);
      }
    });
    companions.set(id, { window, off, size, resizing: false });
    window.show();
    push();
    try { await saveCompanions(); } catch { conversations.get(id).error = '화면 표시 설정을 저장하지 못했어요.'; push(); }
  }

  async function persist(id, messages) {
    await ctx.host.settings.set(section, `history_${id}`, messages);
  }

  async function send(message) {
    const character = SKINS.find(item => item.id === message.id);
    const conversation = conversations.get(message.id);
    if (!character || conversation.pending || disposed) return;
    const companion = companions.get(message.id);
    if (!companion || companion.window.isDestroyed()) { push(); return; }
    if (typeof ctx.host.llm?.generate !== 'function') {
      conversation.error = 'DAP의 AI 연결을 확인해 주세요.';
      push();
      return;
    }
    const previous = conversation.messages;
    let messages;
    if (message.type === 'retry') {
      if (previous.at(-1)?.role !== 'user') return;
      messages = previous;
    } else {
      if (typeof message.text !== 'string' || !message.text.trim() || message.text.length > MAX_INPUT
        || typeof message.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(message.requestId)) return;
      if (previous.some(item => item.id === message.requestId)) return;
      messages = [...previous, { id: message.requestId, role: 'user', content: message.text.trim() }].slice(-MAX_MESSAGES);
    }
    const turn = {};
    conversation.turn = turn;
    const isCurrent = () => !disposed && conversation.turn === turn;
    conversation.pending = true;
    conversation.error = '';
    push();
    let userSaved = false;
    try {
      await persist(character.id, messages);
      userSaved = true;
      if (!isCurrent()) return;
      conversation.messages = messages;
      push();
      if (!isCurrent()) return;
      const reply = await ctx.host.llm.generate(chatPrompt(character, messages), 60);
      if (!isCurrent()) return;
      if (typeof reply !== 'string' || !reply.trim()) throw Error('Empty reply');
      const completed = [...messages, {
        id: `${messages.at(-1).id}-reply`, role: 'assistant', content: reply.trim().slice(0, 12000),
      }].slice(-MAX_MESSAGES);
      await persist(character.id, completed);
      if (!isCurrent()) return;
      conversation.messages = completed;
    } catch {
      if (!isCurrent()) return;
      if (!userSaved) conversation.messages = previous;
      conversation.error = userSaved
        ? '답변을 받지 못했어요. 잠시 후 다시 시도해 주세요.'
        : '메시지를 저장하지 못했어요. 다시 보내 주세요.';
    } finally {
      if (isCurrent()) { conversation.pending = false; conversation.turn = null; push(); }
    }
  }

  async function receive(message) {
    if (!message || typeof message !== 'object' || disposed) return;
    if (message.type === 'ready') { push(); return; }
    if (!conversations.has(message.id)) return;
    if (message.type === 'summon') return spawnCompanion(message.id);
    if (message.type === 'dismiss') return hideCompanion(message.id);
    if (message.type === 'set-size' && validSize(message.sizePx)) {
      const entry = companions.get(message.id);
      if (entry && !entry.window.isDestroyed()) entry.window.postMessage({ type: 'request-size', sizePx: message.sizePx });
      else {
        try { await ctx.host.settings.set(section, `sizePx_${message.id}`, message.sizePx); }
        catch { conversations.get(message.id).error = '크기를 저장하지 못했어요.'; }
        push();
      }
      return;
    }
    if (message.type === 'set-visible' && typeof message.visible === 'boolean') {
      if (message.visible) await spawnCompanion(message.id);
      else await hideCompanion(message.id);
      push(); return;
    }
    if (message.type === 'spawn') return spawnCompanion(message.id);
    if (message.type === 'open-chat') { openChat(message.id); return; }
    if (['send', 'retry'].includes(message.type)) return send(message);
    if (message.type === 'select') {
      selectedId = message.id;
      push();
      try { await ctx.host.settings.set(section, 'selectedCharacter', selectedId); }
      catch { conversations.get(message.id).error = '선택을 저장하지 못했어요.'; push(); }
    } else if (message.type === 'clear') {
      const conversation = conversations.get(message.id);
      if (conversation.pending) return;
      conversation.pending = true;
      push();
      try { await persist(message.id, []); conversation.messages = []; conversation.error = ''; }
      catch { conversation.error = '대화를 지우지 못했어요. 다시 시도해 주세요.'; }
      finally { conversation.pending = false; push(); }
    }
  }

  function open() {
    if (disposed) return;
    if (palette && !palette.isDestroyed()) { palette.show(); push(); return; }
    offPalette?.();
    palette = ctx.host.windows.openPalette({
      page: 'palette/index.html', width: 420, height: 680, frame: false, resizable: true,
    });
    offPalette = palette.onMessage(receive);
    palette.show();
  }

  ctx.actions.registerAction({ id: 'open', callback: open });
  ctx.trayMenu.addItem({ itemId: 'open', label: '치이카와 친구들과 대화', actionId: 'open', showInContextMenu: true });
  ctx.radialMenu.addItem({ itemId: 'open', label: '친구들과 대화', actionId: 'open', priority: 50, icon: 'icon.png' });
  // Summoning is explicit for each DAP run; conversation and size preferences remain saved.

  return () => {
    disposed = true;
    offPalette?.();
    palette?.close();
    for (const entry of [...chatWindows.values(), ...companions.values()]) { entry.off(); entry.window.close(); }
  };
}
