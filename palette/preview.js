(() => {
  'use strict';
  const element = id => document.getElementById(id);
  const bridge = window.dapPalette;
  const drafts = new Map();
  const images = new Map();
  const cards = new Map();
  const replyUntil = new Map();
  const submitted = new Map();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let state = null;
  let selectedId = null;
  let rendered = '';
  let frame = null;
  let tab = 'friends';
  function closeMenus() {
    for (const card of cards.values()) { card.menu.hidden = true; card.more.setAttribute('aria-expanded', 'false'); }
  }
  function showTab(next) {
    tab = next;
    element('friends-panel').hidden = tab !== 'friends';
    element('chat-panel').hidden = tab !== 'chat';
    element('friends-tab').setAttribute('aria-selected', String(tab === 'friends'));
    element('chat-tab').setAttribute('aria-selected', String(tab === 'chat'));
    element('friends-tab').setAttribute('tabindex', tab === 'friends' ? '0' : '-1');
    element('chat-tab').setAttribute('tabindex', tab === 'chat' ? '0' : '-1');
  }
  function selectChat(id) {
    closeMenus();
    showTab('chat');
    post({ type: 'select', id });
  }

  function post(message) { bridge?.postMessage(message); }
  function conversation() { return state?.conversations[selectedId]; }
  function present() { return state?.visibleCharacters?.includes(selectedId) === true; }
  function updateComposer() {
    const pending = conversation()?.pending || submitted.has(selectedId);
    element('message').disabled = !state?.available || !present() || Boolean(pending);
    element('send').disabled = element('message').disabled || !element('message').value.trim();
    element('clear').disabled = !conversation()?.messages.length || Boolean(pending);
    element('retry').disabled = Boolean(pending);
  }

  function createCards(characters) {
    const buttons = characters.map(character => {
      const button = document.createElement('button');
      button.className = 'character-option';
      button.dataset.id = character.id;
      const canvas = document.createElement('canvas');
      canvas.width = 192; canvas.height = 208;
      canvas.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.textContent = character.name;
      const profileInfo = document.createElement('span');
      profileInfo.className = 'profile-info';
      const status = document.createElement('span');
      status.className = 'friend-status';
      profileInfo.append(name, status);
      button.append(canvas, profileInfo);
      button.addEventListener('click', () => selectChat(character.id));
      const row = document.createElement('article');
      row.className = 'friend-row';
      const more = document.createElement('button');
      more.className = 'friend-more'; more.textContent = '⋯';
      more.setAttribute('aria-label', `${character.name} 설정`);
      more.setAttribute('aria-haspopup', 'menu'); more.setAttribute('aria-expanded', 'false');
      const menu = document.createElement('div');
      menu.className = 'friend-menu'; menu.hidden = true; menu.setAttribute('role', 'menu');
      const visibility = document.createElement('button');
      visibility.setAttribute('role', 'menuitemcheckbox');
      visibility.addEventListener('click', () => {
        post({ type: state.visibleCharacters?.includes(character.id) ? 'dismiss' : 'summon', id: character.id });
        closeMenus(); more.focus();
      });
      menu.append(visibility);
      const sizeControl = document.createElement('div');
      sizeControl.className = 'profile-size';
      const sizeLabel = document.createElement('label');
      sizeLabel.textContent = '크기';
      const sizeValue = document.createElement('output');
      const sizeSlider = document.createElement('input');
      sizeSlider.type = 'range'; sizeSlider.min = '60'; sizeSlider.max = '240'; sizeSlider.step = '10';
      sizeSlider.value = '130'; sizeSlider.id = `profile-size-${character.id}`;
      sizeSlider.setAttribute('aria-label', `${character.name} 크기 (px)`);
      sizeLabel.setAttribute('for', sizeSlider.id);
      sizeValue.textContent = '130px';
      let editingSize = false;
      sizeSlider.addEventListener('input', () => { editingSize = true; sizeValue.textContent = `${sizeSlider.value}px`; });
      sizeSlider.addEventListener('change', () => {
        editingSize = false;
        post({ type: 'set-size', id: character.id, sizePx: Number(sizeSlider.value) });
      });
      sizeControl.append(sizeLabel, sizeValue, sizeSlider);
      menu.append(sizeControl);
      function openMenu(event) {
        event.preventDefault(); closeMenus(); menu.hidden = false;
        more.setAttribute('aria-expanded', 'true'); visibility.focus();
      }
      more.addEventListener('click', event => {
        if (menu.hidden) openMenu(event); else closeMenus();
      });
      button.addEventListener('contextmenu', openMenu);
      button.addEventListener('keydown', event => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) openMenu(event);
      });
      menu.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); closeMenus(); more.focus(); }
      });
      row.append(button, more, menu);
      cards.set(character.id, { button, canvas, more, menu, visibility, row, sizeSlider, sizeValue, status,
        editingSize: () => editingSize });
      return row;
    });
    element('character-list').replaceChildren(...buttons);
  }

  function renderMessages(character, chat) {
    const signature = JSON.stringify([selectedId, chat.messages, chat.pending, present()]);
    if (signature === rendered) return;
    const area = element('messages');
    const scroll = area.scrollTop;
    const nearBottom = area.scrollHeight - area.clientHeight - scroll < 80;
    const changedCharacter = area.dataset.character !== selectedId;
    const nodes = chat.messages.map(message => {
      const row = document.createElement('article');
      row.className = `message ${message.role}`;
      const name = document.createElement('span');
      name.className = 'message-name';
      name.textContent = message.role === 'user' ? '나' : character.name;
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      if (message.role === 'assistant') bubble.append(window.ChiikawaMarkdown.renderMarkdown(message.content));
      else bubble.textContent = message.content;
      row.append(name, bubble);
      return row;
    });
    if (!nodes.length) {
      const welcome = document.createElement('div');
      welcome.className = 'welcome';
      const greeting = document.createElement('p');
      greeting.textContent = present() ? character.greeting : `${character.name}를 불러 대화를 시작하세요.`;
      welcome.append(greeting);
      if (!present()) {
        const summon = document.createElement('button');
        summon.className = 'quiet'; summon.textContent = '불러오기';
        summon.addEventListener('click', () => post({ type: 'summon', id: selectedId }));
        welcome.append(summon);
      }
      nodes.push(welcome);
    }
    if (chat.pending) {
      const typing = document.createElement('p');
      typing.className = 'typing';
      typing.textContent = `${character.name}가 생각 중이에요…`;
      nodes.push(typing);
    }
    area.replaceChildren(...nodes);
    area.dataset.character = selectedId;
    area.scrollTop = changedCharacter || nearBottom ? area.scrollHeight : scroll;
    rendered = signature;
  }

  function receive(next) {
    if (next?.type !== 'chat-state') return;
    if (!cards.size) createCards(next.characters);
    for (const [id, requestId] of submitted) {
      const chat = next.conversations[id];
      if (chat.messages.some(message => message.id === requestId)) {
        drafts.set(id, '');
        if (selectedId === id) element('message').value = '';
        submitted.delete(id);
      } else if (!next.visibleCharacters?.includes(id) || (chat.error && !chat.pending)) submitted.delete(id);
    }
    for (const character of next.characters) {
      const previous = state?.conversations[character.id]?.messages.at(-1);
      const latest = next.conversations[character.id].messages.at(-1);
      if (state && latest?.role === 'assistant' && latest.id !== previous?.id) replyUntil.set(character.id, performance.now() + 2400);
    }
    if (selectedId !== next.selectedId) {
      if (selectedId) drafts.set(selectedId, element('message').value);
      selectedId = next.selectedId;
      element('message').value = drafts.get(selectedId) ?? '';
    }
    state = next;
    document.documentElement?.setAttribute('data-bound', String(Boolean(next.bound)));
    const character = state.characters.find(item => item.id === selectedId);
    const chat = conversation();
    element('character-name').textContent = character.name;
    element('tabs').hidden = Boolean(next.bound);
    showTab(next.bound ? 'chat' : tab);
    element('activity').textContent = !present() ? '친구를 불러 주세요' : !state.available ? 'DAP의 AI 연결을 확인해 주세요' : chat.pending ? '생각 중…' : '대화 중';
    element('message').placeholder = present() ? `${character.name}에게 말 걸기` : '불러온 친구와 대화할 수 있어요';
    element('summon-chat').textContent = present() ? '돌려보내기' : '불러오기';
    element('messages').setAttribute('aria-label', `${character.name}와 나눈 대화`);
    element('error-panel').hidden = !chat.error;
    element('error').textContent = chat.error;
    element('retry').hidden = !present() || chat.messages.at(-1)?.role !== 'user' || !chat.error;
    for (const [id, card] of cards) {
      card.button.setAttribute('aria-pressed', String(id === selectedId));
      card.button.dataset.pending = String(state.conversations[id].pending);
      const visible = next.visibleCharacters?.includes(id) ?? false;
      card.button.dataset.active = String(visible);
      card.status.textContent = visible ? '활성' : '비활성';
      const profile = state.characters.find(character => character.id === id);
      card.button.setAttribute('aria-label', `${profile.name}, ${visible ? '활성' : '비활성'}, 채팅 열기`);
      card.visibility.textContent = visible ? '돌려보내기' : '불러오기';
      card.visibility.setAttribute('aria-checked', String(visible));
      if (!card.editingSize()) {
        const size = state.characters.find(character => character.id === id).sizePx ?? 130;
        card.sizeSlider.value = String(size);
        card.sizeValue.textContent = `${size}px`;
      }
    }
    renderMessages(character, chat);
    updateComposer();
  }

  function submit(event) {
    event.preventDefault();
    const text = element('message').value.trim();
    if (!state?.available || !present() || conversation().pending || submitted.has(selectedId) || !text || text.length > 4000) return;
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    submitted.set(selectedId, requestId);
    updateComposer();
    post({ type: 'send', id: selectedId, text, requestId });
  }

  function draw(canvas, clip, time) {
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, 192, 208);
    if (!clip) return;
    let image = images.get(clip.file);
    if (!image) {
      image = new Image();
      image.src = `../${clip.file}`;
      images.set(clip.file, image);
    }
    if (!image.complete || !image.naturalWidth) return;
    const column = window.ChiikawaAnimation.columnAt(clip.holdsMs, reducedMotion.matches ? 0 : time);
    context.drawImage(image, column * 192, 0, 192, 208, 0, 0, 192, 208);
  }

  function animate(time) {
    if (state && !document.hidden) {
      for (const character of state.characters) {
        draw(cards.get(character.id).canvas, character.art.idle, time);
        if (character.id === selectedId) {
          const phase = conversation().pending ? 'thinking' : (replyUntil.get(selectedId) ?? 0) > time ? 'reply' : 'idle';
          draw(element('pet'), character.art[phase], time);
        }
      }
    }
    frame = requestAnimationFrame(animate);
  }

  element('composer').addEventListener('submit', submit);
  element('summon-chat').addEventListener('click', () => post({ type: present() ? 'dismiss' : 'summon', id: selectedId }));
  document.addEventListener('pointerdown', event => {
    for (const card of cards.values()) if (!card.menu.hidden && !card.row.contains(event.target)) closeMenus();
  });
  element('friends-tab').addEventListener('click', () => showTab('friends'));
  element('chat-tab').addEventListener('click', () => showTab('chat'));
  element('friends-tab').addEventListener('keydown', event => {
    if (event.key === 'ArrowRight') { showTab('chat'); element('chat-tab').focus(); }
  });
  element('chat-tab').addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { showTab('friends'); element('friends-tab').focus(); }
  });
  element('message').addEventListener('input', updateComposer);
  element('message').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) submit(event);
  });
  element('clear').addEventListener('click', () => {
    if (conversation()?.messages.length && window.confirm(`${element('character-name').textContent}와 나눈 대화를 지울까요?`)) post({ type: 'clear', id: selectedId });
  });
  element('retry').addEventListener('click', () => {
    post({ type: 'retry', id: selectedId });
  });
  element('close').addEventListener('click', () => bridge?.close());
  const unsubscribe = bridge?.onMessage(receive);
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); unsubscribe?.(); });
  if (bridge) post({ type: 'ready' });
  else element('activity').textContent = 'DAP 앱에서 열어 주세요';
  frame = requestAnimationFrame(animate);
})();
