import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../palette/preview.js', import.meta.url), 'utf8');
const markdown = await readFile(new URL('../palette/markdown.js', import.meta.url), 'utf8');

function mount() {
  const elements = new Map(), posted = [];
  let receive;
  function node() {
    return {
      value: '', dataset: {}, style: {}, disabled: false, hidden: false, content: '', children: [], attrs: {}, listeners: {},
      get textContent() { return this.content + this.children.map(child => typeof child === 'string' ? child : child.textContent).join(''); },
      set textContent(value) { this.content = value; this.children = []; },
      scrollHeight: 100, clientHeight: 100, scrollTop: 0,
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = items; },
      setAttribute(key, value) { this.attrs[key] = value; },
      addEventListener(name, fn) { this.listeners[name] = fn; },
      focus() {}, contains(target) { return this === target || this.children.some(child => child.contains(target)); },
    };
  }
  const element = id => { if (!elements.has(id)) elements.set(id, node()); return elements.get(id); };
  runInNewContext(markdown + '\n' + source, {
    document: { getElementById: element, createElement: node, createDocumentFragment: node, addEventListener() {} },
    window: { matchMedia: () => ({ matches: false }), addEventListener() {}, confirm: () => true,
      dapPalette: { onMessage(fn) { receive = fn; }, postMessage(message) { posted.push(message); } } },
    requestAnimationFrame() {}, cancelAnimationFrame() {}, performance: { now: () => 0 },
  });
  const state = { type: 'chat-state', available: true, selectedId: 'shisa', visibleCharacters: ['shisa'],
    characters: [{ id: 'shisa', name: '시사', greeting: '어서 오세요', art: {} }],
    conversations: { shisa: { messages: [], pending: false, error: '' } } };
  receive(state);
  return { element, posted, receive, state };
}

test('Korean IME Enter completes composition and a normal Enter sends exactly once', () => {
  const { element, posted } = mount();
  element('message').value = '안녕';
  const keydown = element('message').listeners.keydown;
  keydown({ key: 'Enter', isComposing: true, keyCode: 229 });
  assert.equal(posted.length, 1); // only the initial ready message
  keydown({ key: 'Enter', isComposing: false, preventDefault() {} });
  keydown({ key: 'Enter', isComposing: false, preventDefault() {} });
  assert.equal(posted.length, 2);
  assert.equal(posted.at(-1).text, '안녕');
  assert.equal(element('message').value, '안녕'); // kept until persistence succeeds
});

test('failed persistence preserves the input and model output is rendered as plain text', () => {
  const { element, receive, state } = mount();
  element('message').value = '보존할 메시지';
  element('composer').listeners.submit({ preventDefault() {} });
  receive({ ...state, conversations: { shisa: { messages: [], pending: false, error: '저장 오류' } } });
  assert.equal(element('message').value, '보존할 메시지');
  assert.equal(element('send').disabled, false);
  receive({ ...state, conversations: { shisa: { messages: [{ id: 'reply', role: 'assistant', content: '<img onerror=alert(1)>' }], pending: false, error: '' } } });
  assert.equal(element('messages').children[0].children[1].textContent, '<img onerror=alert(1)>');
});

test('profiles open chat and desktop visibility lives in the profile context menu', () => {
  const { element, posted, receive, state } = mount();
  receive({ ...state, visibleCharacters: [] });
  assert.equal(element('friends-panel').hidden, false);
  assert.equal(element('chat-panel').hidden, true);
  const row = element('character-list').children[0];
  const menu = row.children[2];
  assert.equal(menu.hidden, true);
  row.children[0].listeners.contextmenu({ preventDefault() {} });
  assert.equal(menu.hidden, false);
  menu.children[0].listeners.click();
  assert.equal(posted.at(-1).type, 'summon');
  assert.equal(menu.hidden, true);
  row.children[0].listeners.click();
  assert.equal(element('chat-panel').hidden, false);
  assert.equal(posted.at(-1).id, 'shisa');
});

test('profile menu size slider updates px while dragging and saves on release', () => {
  const { element, posted } = mount();
  const menu = element('character-list').children[0].children[2];
  const controls = menu.children[1];
  const slider = controls.children[2];
  slider.value = '180';
  slider.listeners.input();
  assert.equal(controls.children[1].textContent, '180px');
  assert.equal(posted.at(-1).type, 'ready');
  slider.listeners.change();
  assert.equal(posted.at(-1).type, 'set-size');
  assert.equal(posted.at(-1).sizePx, 180);
});

test('sending a friend away disables the composer and recalling enables it with history intact', () => {
  const { element, receive, state, posted } = mount();
  element('message').value = '이어갈 말';
  receive({ ...state, visibleCharacters: [] });
  assert.equal(element('message').disabled, true);
  element('composer').listeners.submit({ preventDefault() {} });
  assert.equal(posted.length, 1);
  assert.equal(element('summon-chat').textContent, '불러오기');
  receive(state);
  assert.equal(element('message').disabled, false);
  assert.equal(element('message').value, '이어갈 말');
  assert.equal(element('summon-chat').textContent, '돌려보내기');
});

test('profiles visibly track active and inactive state after summoning and dismissal', () => {
  const { element, receive, state } = mount();
  const profile = element('character-list').children[0].children[0];
  const status = profile.children[1].children[1];
  assert.equal(status.textContent, '활성');
  assert.equal(profile.dataset.active, 'true');
  receive({ ...state, visibleCharacters: [] });
  assert.equal(status.textContent, '비활성');
  assert.equal(profile.dataset.active, 'false');
  assert.match(profile.attrs['aria-label'], /시사, 비활성/);
  receive(state);
  assert.equal(status.textContent, '활성');
});
