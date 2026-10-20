import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const catalog = {window: {}};
runInNewContext(await readFile(new URL('../assets/catalog.js', import.meta.url), 'utf8'), catalog);
const skins = JSON.parse(JSON.stringify(catalog.window.CHIIKAWA_SKINS));
const source = await readFile(new URL('../palette/preview.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../palette/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../palette/style.css', import.meta.url), 'utf8');
const pluginTemplate = await readFile(new URL('../src/plugin.template.mjs', import.meta.url), 'utf8');

function makeNode(tagName = 'div', id = '') {
  return {
    tagName: tagName.toUpperCase(), id, value: id === 'motion' ? 'idle' : '', textContent: '',
    hidden: false, disabled: false, checked: false, children: [], listeners: {}, attrs: {}, dataset: {},
    className: '', parentElement: null,
    classList: {add() {}},
    append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } },
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    setAttribute(key, value) { this.attrs[key] = value; },
    closest() { return element('stage'); },
    querySelectorAll(selector) { return selector === 'button' ? this.children.filter(node => node.tagName === 'BUTTON') : []; },
    getContext() { return {clearRect() {}, drawImage() {}, imageSmoothingEnabled: false}; },
    get selectedOptions() { return this.children.filter(node => node.value === this.value); },
  };
}

const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, makeNode(id === 'pet' ? 'canvas' : 'div', id));
  return elements.get(id);
}

test('palette uses draggable compact image cards and has no pause control', () => {
  assert.match(html, /id="character-list"/);
  assert.doesNotMatch(html, /id="character"/);
  assert.doesNotMatch(html, /id="pause"/);
  assert.match(css, /-webkit-app-region:\s*drag/);
  assert.match(css, /\.character-option/);
  assert.match(pluginTemplate, /width:\s*600, height:\s*650, frame:\s*false, resizable:\s*true/);
});

test('character cards select active character once and show its description', () => {
  elements.clear();
  let receive;
  const window = {
    CHIIKAWA_SKINS: skins,
    matchMedia: () => ({matches: false, addEventListener() {}, removeEventListener() {}}),
    addEventListener() {},
    dapPalette: {onMessage(fn) { receive = fn; return () => {}; }, postMessage() {}},
  };
  const document = {
    hidden: false,
    getElementById: element,
    createElement: tag => makeNode(tag),
    addEventListener() {},
  };
  class FakeImage {
    set src(value) { this._src = value; }
    get src() { return this._src; }
  }
  runInNewContext(source, {window, document, Image: FakeImage, cancelAnimationFrame() {}, requestAnimationFrame() { return 1; }});
  const status = {type: 'status', available: true, activeId: 'momonga', assetsReady: true, assetRevision: 0, personaEnabled: true};
  receive(status);
  const cards = element('character-list').children;
  assert.equal(cards.length, 4);
  assert.equal(cards.find(card => card.dataset.id === 'momonga').attrs['aria-selected'], 'true');
  assert.equal(element('persona-title').textContent, '모몽가');
  assert.match(element('character-description').textContent, /남의 몫.*떠넘기며 공은 자기 것/);
  assert.equal(element('apply').textContent, '모몽가 적용');
  assert.equal(element('apply').disabled, true);
  assert.equal(element('stage').attrs['aria-label'], '모몽가 모션 미리보기');

  cards.find(card => card.dataset.id === 'usagi').listeners.click();
  receive({...status, busy: false});
  assert.equal(element('persona-title').textContent, '우사기');
  assert.match(element('character-description').textContent, /행동파/);
  assert.equal(element('apply').disabled, false);

  receive({...status, assetsReady: false, readySkinIds: ['usagi', 'momonga']});
  assert.equal(element('apply').disabled, false);
  assert.equal(element('download-assets').hidden, true);
  element('character-list').children.find(card => card.dataset.id === 'chiikawa').listeners.click();
  assert.equal(element('apply').disabled, true);
  assert.equal(element('download-assets').hidden, false);
});
